import type { Pool, PoolClient, QueryResultRow } from "pg";
import { z } from "zod";

import {
  reservationStatuses,
  type ReservationStatus,
} from "./domain/reservations";

export const restaurantMemberRoleSchema = z.enum(["owner", "admin", "staff"]);
export type RestaurantMemberRole = z.infer<typeof restaurantMemberRoleSchema>;

const reservationStatusSchema = z.enum(reservationStatuses);

export interface RestaurantMembership {
  restaurantId: string;
  name: string;
  timeZone: string;
  role: RestaurantMemberRole;
}

export interface ReservationListFilters {
  date: string;
  status?: ReservationStatus;
  limit: number;
  offset: number;
}

export interface RestaurantReservation {
  id: string;
  status: ReservationStatus;
  startsAt: Date;
  endsAt: Date;
  partySize: number;
  guestName: string | null;
  guestPhone: string | null;
  tables: string[];
}

export interface ReservationPage {
  reservations: RestaurantReservation[];
  hasMore: boolean;
}

export interface TenantStore {
  listRestaurantsForUser(userId: string): Promise<RestaurantMembership[]>;
  listReservationsForRestaurant(
    userId: string,
    restaurantId: string,
    filters: ReservationListFilters,
  ): Promise<ReservationPage | null>;
}

interface MembershipRow extends QueryResultRow {
  restaurant_id: string;
  name: string;
  time_zone: string;
  role: string;
}

interface ReservationRow extends QueryResultRow {
  id: string;
  status: string;
  starts_at: Date;
  ends_at: Date;
  party_size_current: number;
  guest_name: string | null;
  guest_phone: string | null;
  table_names: string[] | null;
}

const userIdSchema = z.string().uuid();

export async function withAuthenticatedUser<T>(
  pool: Pool,
  userId: string,
  operation: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const authenticatedUserId = userIdSchema.parse(userId);
  const client = await pool.connect();
  let transactionStarted = false;

  try {
    await client.query("BEGIN");
    transactionStarted = true;
    await client.query("SET LOCAL ROLE authenticated");
    await client.query(
      `SELECT set_config('request.jwt.claim.sub', $1, true),
              set_config('request.jwt.claim.role', 'authenticated', true),
              set_config('request.jwt.claims', $2, true)`,
      [
        authenticatedUserId,
        JSON.stringify({
          sub: authenticatedUserId,
          role: "authenticated",
        }),
      ],
    );

    const result = await operation(client);
    await client.query("COMMIT");
    transactionStarted = false;
    return result;
  } catch (error) {
    if (transactionStarted) {
      await client.query("ROLLBACK");
    }
    throw error;
  } finally {
    client.release();
  }
}

export function createTenantStore(pool: Pool): TenantStore {
  return {
    async listRestaurantsForUser(
      userId: string,
    ): Promise<RestaurantMembership[]> {
      return withAuthenticatedUser(pool, userId, async (client) => {
        const result = await client.query<MembershipRow>(
          `SELECT r.id AS restaurant_id,
                  r.name,
                  r.time_zone,
                  m.role::text AS role
           FROM restaurant_memberships m
           JOIN restaurants r ON r.id = m.restaurant_id
           WHERE m.user_id = $1
           ORDER BY r.name`,
          [userId],
        );

        return result.rows.map((row) => ({
          restaurantId: row.restaurant_id,
          name: row.name,
          timeZone: row.time_zone,
          role: restaurantMemberRoleSchema.parse(row.role),
        }));
      });
    },
    async listReservationsForRestaurant(
      userId: string,
      restaurantId: string,
      filters: ReservationListFilters,
    ): Promise<ReservationPage | null> {
      return withAuthenticatedUser(pool, userId, async (client) => {
        const membership = await client.query(
          `SELECT 1
           FROM restaurant_memberships
           WHERE restaurant_id = $1
            AND user_id = $2
           LIMIT 1`,
          [restaurantId, userId],
        );
        if (membership.rows.length === 0) {
          return null;
        }

        const result = await client.query<ReservationRow>(
          `SELECT reservation.id,
                  reservation.status::text AS status,
                  reservation.starts_at,
                  reservation.ends_at,
                  reservation.party_size_current,
                  guest.name AS guest_name,
                  guest.phone AS guest_phone,
                  array_agg(restaurant_table.name ORDER BY restaurant_table.name)
                    FILTER (WHERE restaurant_table.id IS NOT NULL) AS table_names
           FROM reservations reservation
           JOIN restaurants rest ON rest.id = reservation.restaurant_id
           LEFT JOIN guests guest ON guest.id = reservation.guest_id
           LEFT JOIN reservation_tables assignment
             ON assignment.reservation_id = reservation.id
           LEFT JOIN restaurant_tables restaurant_table
             ON restaurant_table.id = assignment.table_id
           WHERE reservation.restaurant_id = $1
             AND reservation.starts_at >=
               (($2::date)::timestamp AT TIME ZONE rest.time_zone)
             AND reservation.starts_at <
               ((($2::date + 1)::timestamp) AT TIME ZONE rest.time_zone)
             AND ($3::text IS NULL OR reservation.status::text = $3)
           GROUP BY reservation.id, guest.name, guest.phone
           ORDER BY reservation.starts_at, reservation.id
           LIMIT $4 OFFSET $5`,
          [
            restaurantId,
            filters.date,
            filters.status ?? null,
            filters.limit + 1,
            filters.offset,
          ],
        );
        const hasMore = result.rows.length > filters.limit;

        return {
          reservations: result.rows.slice(0, filters.limit).map((row) => ({
            id: row.id,
            status: reservationStatusSchema.parse(row.status),
            startsAt: row.starts_at,
            endsAt: row.ends_at,
            partySize: row.party_size_current,
            guestName: row.guest_name,
            guestPhone: row.guest_phone,
            tables: row.table_names ?? [],
          })),
          hasMore,
        };
      });
    },
  };
}
