import type { Pool, PoolClient, QueryResultRow } from "pg";
import { createHash } from "node:crypto";
import { z } from "zod";

import {
  canTransitionReservation,
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
  revision: number;
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

export interface StaffReservationInput {
  startsAt: Date;
  endsAt: Date;
  partySize: number;
  tableIds: string[];
  guest: { name: string; phone: string; email?: string };
  reason: string;
  idempotencyKey: string;
}

export interface StaffReservationUpdate {
  status?: ReservationStatus;
  startsAt?: Date;
  endsAt?: Date;
  partySize?: number;
  reason: string;
  expectedRevision: number;
}

export interface AvailabilityRuleUpdate {
  holdMinutes: number;
  maximumPartySize: number;
  onlineBookingEnabled: boolean;
  cancellationNoticeMinutes: number | null;
}

export interface AvailabilityExceptionInput {
  date: string;
  closed: boolean;
  opensAt?: string;
  closesAt?: string;
  reason: string;
}

export interface AvailabilityRuleRecord extends AvailabilityRuleUpdate {
  bookingTermsVersion: string;
  privacyNoticeVersion: string;
}

export interface AvailabilityExceptionRecord extends AvailabilityExceptionInput {
  id: string;
}

export interface TableBlockRecord {
  id: string;
  tableId: string;
  tableName: string;
  startsAt: Date;
  endsAt: Date;
  reason: string;
}

export class TenantStoreError extends Error {
  constructor(readonly statusCode: number, message: string) {
    super(message);
  }
}

export interface TenantStore {
  listRestaurantsForUser(userId: string): Promise<RestaurantMembership[]>;
  canManageRestaurant(userId: string, restaurantId: string): Promise<boolean>;
  getAvailabilityRules(
    userId: string,
    restaurantId: string,
  ): Promise<AvailabilityRuleRecord | null>;
  listAvailabilityExceptions(
    userId: string,
    restaurantId: string,
    fromDate: string,
    toDate: string,
  ): Promise<AvailabilityExceptionRecord[] | null>;
  listTableBlocks(
    userId: string,
    restaurantId: string,
    fromDate: string,
    toDate: string,
  ): Promise<TableBlockRecord[] | null>;
  listReservationsForRestaurant(
    userId: string,
    restaurantId: string,
    filters: ReservationListFilters,
  ): Promise<ReservationPage | null>;
  createStaffReservation(
    userId: string,
    restaurantId: string,
    input: StaffReservationInput,
  ): Promise<{ id: string; status: ReservationStatus; reused: boolean } | null>;
  updateReservationForStaff(
    userId: string,
    reservationId: string,
    input: StaffReservationUpdate,
  ): Promise<{ restaurantId: string; status: ReservationStatus; revision: number } | null>;
  createTableBlock(
    userId: string,
    restaurantId: string,
    tableId: string,
    startsAt: Date,
    endsAt: Date,
    reason: string,
  ): Promise<{ id: string } | null>;
  deleteTableBlock(userId: string, restaurantId: string, blockId: string): Promise<boolean>;
  updateAvailabilityRules(
    userId: string,
    restaurantId: string,
    input: AvailabilityRuleUpdate,
  ): Promise<boolean>;
  upsertAvailabilityException(
    userId: string,
    restaurantId: string,
    input: AvailabilityExceptionInput,
  ): Promise<{ id: string } | null>;
  listNotifications(
    userId: string,
    restaurantId: string,
    limit: number,
  ): Promise<Array<{ id: string; eventType: string; status: string; createdAt: Date }> | null>;
  exportReservations(
    userId: string,
    restaurantId: string,
    fromDate: string,
    toDate: string,
  ): Promise<RestaurantReservation[] | null>;
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
  revision: number;
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
    async canManageRestaurant(userId, restaurantId) {
      return withAuthenticatedUser(pool, userId, async (client) => {
        const result = await client.query(
          `SELECT 1 FROM restaurant_memberships
           WHERE user_id = $1 AND restaurant_id = $2
             AND role IN ('owner', 'admin')
           LIMIT 1`,
          [userId, restaurantId],
        );
        return result.rowCount === 1;
      });
    },
    async getAvailabilityRules(userId, restaurantId) {
      return withAuthenticatedUser(pool, userId, async (client) => {
        const result = await client.query<{
          hold_minutes: number;
          maximum_party_size: number;
          online_booking_enabled: boolean;
          cancellation_notice_minutes: number | null;
          booking_terms_version: string;
          privacy_notice_version: string;
        }>(
          `SELECT ar.hold_minutes, ar.maximum_party_size,
                  ar.online_booking_enabled, ar.cancellation_notice_minutes,
                  ar.booking_terms_version, ar.privacy_notice_version
           FROM availability_rules ar
           JOIN restaurant_memberships m ON m.restaurant_id = ar.restaurant_id
           WHERE m.user_id = $1 AND ar.restaurant_id = $2`,
          [userId, restaurantId],
        );
        const row = result.rows[0];
        return row ? {
          holdMinutes: row.hold_minutes,
          maximumPartySize: row.maximum_party_size,
          onlineBookingEnabled: row.online_booking_enabled,
          cancellationNoticeMinutes: row.cancellation_notice_minutes,
          bookingTermsVersion: row.booking_terms_version,
          privacyNoticeVersion: row.privacy_notice_version,
        } : null;
      });
    },
    async listAvailabilityExceptions(userId, restaurantId, fromDate, toDate) {
      return withAuthenticatedUser(pool, userId, async (client) => {
        const result = await client.query<{
          id: string;
          service_date: string;
          closed: boolean;
          opens_at: string | null;
          closes_at: string | null;
          reason: string;
        }>(
          `          SELECT exception.id, exception.service_date::text AS service_date,
                  exception.closed,
                  to_char(exception.opens_at, 'HH24:MI') AS opens_at,
                  to_char(exception.closes_at, 'HH24:MI') AS closes_at,
                  exception.reason
           FROM availability_exceptions exception
           JOIN restaurant_memberships m
             ON m.restaurant_id = exception.restaurant_id
           WHERE m.user_id = $1 AND exception.restaurant_id = $2
             AND exception.service_date BETWEEN $3::date AND $4::date
           ORDER BY exception.service_date`,
          [userId, restaurantId, fromDate, toDate],
        );
        const membership = await client.query(
          `SELECT 1 FROM restaurant_memberships
           WHERE user_id = $1 AND restaurant_id = $2 LIMIT 1`,
          [userId, restaurantId],
        );
        if (!membership.rowCount) {
          return null;
        }
        return result.rows.map((row) => ({
          id: row.id,
          date: row.service_date,
          closed: row.closed,
          opensAt: row.opens_at ?? undefined,
          closesAt: row.closes_at ?? undefined,
          reason: row.reason,
        }));
      });
    },
    async listTableBlocks(userId, restaurantId, fromDate, toDate) {
      return withAuthenticatedUser(pool, userId, async (client) => {
        const membership = await client.query(
          `SELECT 1 FROM restaurant_memberships
           WHERE user_id = $1 AND restaurant_id = $2 LIMIT 1`,
          [userId, restaurantId],
        );
        if (!membership.rowCount) {
          return null;
        }
        const result = await client.query<{
          id: string;
          table_id: string;
          table_name: string;
          starts_at: Date;
          ends_at: Date;
          reason: string;
        }>(
          `SELECT block.id, block.table_id, t.name AS table_name,
                  block.starts_at, block.ends_at, block.reason
           FROM table_blocks block
           JOIN restaurant_tables t ON t.id = block.table_id
           JOIN dining_areas a ON a.id = t.dining_area_id
           JOIN restaurants rest ON rest.id = a.restaurant_id
           WHERE a.restaurant_id = $1
             AND block.starts_at < ((($3::date + 1)::timestamp) AT TIME ZONE rest.time_zone)
             AND block.ends_at > (($2::date)::timestamp AT TIME ZONE rest.time_zone)
           ORDER BY block.starts_at, block.id`,
          [restaurantId, fromDate, toDate],
        );
        return result.rows.map((row) => ({
          id: row.id,
          tableId: row.table_id,
          tableName: row.table_name,
          startsAt: row.starts_at,
          endsAt: row.ends_at,
          reason: row.reason,
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
                  reservation.revision,
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
            revision: row.revision,
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
    async createStaffReservation(userId, restaurantId, input) {
      return withAuthenticatedUser<{
        id: string;
        status: ReservationStatus;
        reused: boolean;
      } | null>(pool, userId, async (client) => {
        const manager = await client.query(
          `SELECT 1 FROM restaurant_memberships
           WHERE user_id = $1 AND restaurant_id = $2
             AND role IN ('owner', 'admin')
           LIMIT 1`,
          [userId, restaurantId],
        );
        if (!manager.rowCount) {
          return null;
        }

        await client.query(
          "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
          [`staff-reservation\u0000${restaurantId}\u0000${input.idempotencyKey}`],
        );
        const requestHash = createHash("sha256")
          .update(JSON.stringify({
            startsAt: input.startsAt.toISOString(),
            endsAt: input.endsAt.toISOString(),
            partySize: input.partySize,
            tableIds: [...input.tableIds].sort(),
            guest: input.guest,
            reason: input.reason,
          }))
          .digest("hex");
        const prior = await client.query<{
          id: string;
          status: string;
          idempotency_request_hash: string | null;
        }>(
          `SELECT id, status::text, idempotency_request_hash
           FROM reservations
           WHERE restaurant_id = $1 AND idempotency_key = $2
           FOR UPDATE`,
          [restaurantId, input.idempotencyKey],
        );
        if (prior.rowCount) {
          if (prior.rows[0].idempotency_request_hash !== requestHash) {
            throw new TenantStoreError(409, "Idempotency key was already used for a different request");
          }
          return {
            id: prior.rows[0].id,
            status: "confirmed",
            reused: true,
          };
        }

        const tables = await client.query<{
          id: string;
          min_capacity: number;
          max_capacity: number;
        }>(
          `SELECT t.id, t.min_capacity, t.max_capacity
           FROM restaurant_tables t
           JOIN dining_areas a ON a.id = t.dining_area_id
           WHERE a.restaurant_id = $1 AND t.id = ANY($2::uuid[]) AND t.active
           ORDER BY t.id
           FOR UPDATE OF t`,
          [restaurantId, input.tableIds],
        );
        if (tables.rowCount !== input.tableIds.length) {
          throw new TenantStoreError(400, "One or more selected tables are invalid");
        }
        const minimumCapacity = tables.rows.reduce((total, table) => total + table.min_capacity, 0);
        const maximumCapacity = tables.rows.reduce((total, table) => total + table.max_capacity, 0);
        if (input.partySize < minimumCapacity || input.partySize > maximumCapacity) {
          throw new TenantStoreError(400, "Party size does not fit the selected tables");
        }

        const guest = await client.query<{ id: string }>(
          `INSERT INTO guests (restaurant_id, name, phone, email)
           VALUES ($1, $2, $3, $4) RETURNING id`,
          [restaurantId, input.guest.name, input.guest.phone, input.guest.email ?? null],
        );
        const reservation = await client.query<{ id: string }>(
          `INSERT INTO reservations
             (restaurant_id, guest_id, status, allocation_mode,
              party_size_initial, party_size_current, starts_at, ends_at,
              idempotency_key, idempotency_request_hash, cancellation_deadline)
           VALUES (
             $1, $2, 'confirmed', 'restaurant_assigned', $3, $3, $4, $5, $6, $7,
             CASE
               WHEN (SELECT cancellation_notice_minutes
                     FROM availability_rules WHERE restaurant_id = $1) IS NULL
                 THEN NULL
               ELSE $4 - make_interval(mins => (
                 SELECT cancellation_notice_minutes
                 FROM availability_rules WHERE restaurant_id = $1
               ))
             END
           )
           RETURNING id`,
          [
            restaurantId,
            guest.rows[0].id,
            input.partySize,
            input.startsAt,
            input.endsAt,
            input.idempotencyKey,
            requestHash,
          ],
        );
        const reservationId = reservation.rows[0].id;
        for (const table of tables.rows) {
          await client.query(
            `INSERT INTO reservation_tables
               (reservation_id, table_id, status, starts_at, ends_at)
             VALUES ($1, $2, 'confirmed', $3, $4)`,
            [reservationId, table.id, input.startsAt, input.endsAt],
          );
        }
        await client.query(
          `INSERT INTO reservation_events
             (reservation_id, actor_type, actor_id, new_status, reason)
           VALUES ($1, 'staff', $2, 'confirmed', $3)`,
          [reservationId, userId, input.reason],
        );
        await client.query(
          `INSERT INTO notifications
             (reservation_id, channel, status, event_type, recipient_type, dedupe_key)
           VALUES ($1, 'sms', 'queued', 'reservation_created_by_staff', 'guest', $2)
           ON CONFLICT (dedupe_key) DO NOTHING`,
          [reservationId, `reservation_created_by_staff:sms:${reservationId}`],
        );
        if (input.guest.email) {
          await client.query(
            `INSERT INTO notifications
               (reservation_id, channel, status, event_type, recipient_type, dedupe_key)
             VALUES ($1, 'email', 'queued', 'reservation_created_by_staff', 'guest', $2)
             ON CONFLICT (dedupe_key) DO NOTHING`,
            [reservationId, `reservation_created_by_staff:email:${reservationId}`],
          );
        }
        return { id: reservationId, status: "confirmed", reused: false };
      }).catch((error: unknown) => {
        if (isExclusionViolation(error)) {
          throw new TenantStoreError(409, "A selected table is no longer available");
        }
        throw error;
      });
    },
    async updateReservationForStaff(userId, reservationId, input) {
      return withAuthenticatedUser(pool, userId, async (client) => {
        const result = await client.query<{
          restaurant_id: string;
          status: string;
          starts_at: Date;
          ends_at: Date;
          party_size_current: number;
          revision: number;
        }>(
          `SELECT r.restaurant_id, r.status::text AS status, r.starts_at,
                  r.ends_at, r.party_size_current, r.revision
           FROM reservations r
           WHERE r.id = $1
           FOR UPDATE`,
          [reservationId],
        );
        const current = result.rows[0];
        if (!current) {
          return null;
        }
        const manager = await client.query(
          `SELECT 1 FROM restaurant_memberships
           WHERE user_id = $1 AND restaurant_id = $2
             AND role IN ('owner', 'admin')
           LIMIT 1`,
          [userId, current.restaurant_id],
        );
        if (!manager.rowCount) {
          return null;
        }
        if (current.revision !== input.expectedRevision) {
          throw new TenantStoreError(412, "Reservation was modified by another request");
        }

        const previousStatus = reservationStatusSchema.parse(current.status);
        const nextStatus = input.status ?? previousStatus;
        if (previousStatus !== "confirmed" && previousStatus !== "seated") {
          throw new TenantStoreError(409, "Reservation cannot be modified in its current state");
        }
        if (
          nextStatus !== previousStatus &&
          !canTransitionReservation(previousStatus, nextStatus)
        ) {
          throw new TenantStoreError(409, "Reservation status transition is not allowed");
        }
        const startsAt = input.startsAt ?? current.starts_at;
        const endsAt = input.endsAt ?? current.ends_at;
        const partySize = input.partySize ?? current.party_size_current;
        if (startsAt >= endsAt) {
          throw new TenantStoreError(400, "Reservation end must be after its start");
        }

        const capacity = await client.query<{ min_capacity: number; max_capacity: number }>(
          `SELECT COALESCE(sum(t.min_capacity), 0)::integer AS min_capacity,
                  COALESCE(sum(t.max_capacity), 0)::integer AS max_capacity
           FROM reservation_tables rt
           JOIN restaurant_tables t ON t.id = rt.table_id
           WHERE rt.reservation_id = $1`,
          [reservationId],
        );
        if (
          partySize < capacity.rows[0].min_capacity ||
          partySize > capacity.rows[0].max_capacity
        ) {
          throw new TenantStoreError(400, "Party size does not fit the assigned tables");
        }

        const updated = await client.query<{ revision: number }>(
          `UPDATE reservations
           SET status = $2::reservation_status, starts_at = $3, ends_at = $4,
               party_size_current = $5,
               cancellation_deadline = CASE
                 WHEN (SELECT cancellation_notice_minutes
                       FROM availability_rules WHERE restaurant_id = $6) IS NULL
                   THEN NULL
                 ELSE $3 - make_interval(mins => (
                   SELECT cancellation_notice_minutes
                   FROM availability_rules WHERE restaurant_id = $6
                 ))
               END,
               updated_at = now()
           WHERE id = $1
           RETURNING revision`,
          [reservationId, nextStatus, startsAt, endsAt, partySize, current.restaurant_id],
        );
        await client.query(
          `UPDATE reservation_tables
           SET status = $2::reservation_status, starts_at = $3, ends_at = $4
           WHERE reservation_id = $1`,
          [reservationId, nextStatus, startsAt, endsAt],
        );
        await client.query(
          `INSERT INTO reservation_events
             (reservation_id, actor_type, actor_id, previous_status, new_status, reason, details)
           VALUES ($1, 'staff', $2, $3, $4, $5, $6)`,
          [
            reservationId,
            userId,
            previousStatus,
            nextStatus,
            input.reason,
            JSON.stringify({
              previousStartsAt: current.starts_at,
              startsAt,
              previousPartySize: current.party_size_current,
              partySize,
            }),
          ],
        );
        const detailsChanged =
          startsAt.getTime() !== current.starts_at.getTime() ||
          endsAt.getTime() !== current.ends_at.getTime() ||
          partySize !== current.party_size_current;
        if (previousStatus !== nextStatus || detailsChanged) {
          await client.query(
            `INSERT INTO notifications
               (reservation_id, channel, status, event_type, recipient_type, dedupe_key)
             VALUES ($1, 'email', 'queued', $2, 'guest', $3)
             ON CONFLICT (dedupe_key) DO NOTHING`,
            [
              reservationId,
              nextStatus.startsWith("cancelled") ? "reservation_cancelled" : "reservation_modified",
              `staff-update:${reservationId}:${updated.rows[0].revision}`,
            ],
          );
        }
        return {
          restaurantId: current.restaurant_id,
          status: nextStatus,
          revision: updated.rows[0].revision,
        };
      }).catch((error: unknown) => {
        if (isExclusionViolation(error)) {
          throw new TenantStoreError(409, "A table is no longer available for that time");
        }
        throw error;
      });
    },
    async createTableBlock(userId, restaurantId, tableId, startsAt, endsAt, reason) {
      return withAuthenticatedUser(pool, userId, async (client) => {
        const table = await client.query(
          `SELECT t.id
           FROM restaurant_tables t
           JOIN dining_areas a ON a.id = t.dining_area_id
           JOIN restaurant_memberships m
             ON m.restaurant_id = a.restaurant_id AND m.user_id = $1
             AND m.role IN ('owner', 'admin')
           WHERE a.restaurant_id = $2 AND t.id = $3
           FOR UPDATE OF t`,
          [userId, restaurantId, tableId],
        );
        if (!table.rowCount) {
          return null;
        }
        const occupied = await client.query(
          `SELECT 1
           FROM reservation_tables rt
           JOIN reservations r ON r.id = rt.reservation_id
           WHERE rt.table_id = $1
             AND rt.starts_at < $3 AND rt.ends_at > $2
             AND r.status IN ('holding', 'awaiting_guarantee', 'confirmed', 'seated')
             AND (
               r.status NOT IN ('holding', 'awaiting_guarantee')
               OR r.hold_expires_at > now()
             )
           LIMIT 1`,
          [tableId, startsAt, endsAt],
        );
        if (occupied.rowCount) {
          throw new TenantStoreError(409, "The table has an active reservation during that time");
        }
        const result = await client.query<{ id: string }>(
          `INSERT INTO table_blocks (table_id, starts_at, ends_at, reason, created_by)
           VALUES ($1, $2, $3, $4, $5)
           RETURNING id`,
          [tableId, startsAt, endsAt, reason, userId],
        );
        return result.rows[0] ? { id: result.rows[0].id } : null;
      }).catch((error: unknown) => {
        if (isExclusionViolation(error)) {
          throw new TenantStoreError(409, "The table is already blocked during that time");
        }
        throw error;
      });
    },
    async deleteTableBlock(userId, restaurantId, blockId) {
      return withAuthenticatedUser(pool, userId, async (client) => {
        const result = await client.query(
          `DELETE FROM table_blocks b
           USING restaurant_tables t, dining_areas a, restaurant_memberships m
           WHERE b.id = $1 AND t.id = b.table_id AND a.id = t.dining_area_id
             AND a.restaurant_id = $2
             AND m.restaurant_id = a.restaurant_id AND m.user_id = $3
             AND m.role IN ('owner', 'admin')
           RETURNING b.id`,
          [blockId, restaurantId, userId],
        );
        return result.rowCount === 1;
      });
    },
    async updateAvailabilityRules(userId, restaurantId, input) {
      return withAuthenticatedUser(pool, userId, async (client) => {
        const result = await client.query(
          `UPDATE availability_rules ar
           SET hold_minutes = $3, maximum_party_size = $4,
               online_booking_enabled = $5, cancellation_notice_minutes = $6
           FROM restaurant_memberships m
           WHERE ar.restaurant_id = $2 AND m.restaurant_id = ar.restaurant_id
             AND m.user_id = $1 AND m.role IN ('owner', 'admin')
           RETURNING ar.restaurant_id`,
          [
            userId,
            restaurantId,
            input.holdMinutes,
            input.maximumPartySize,
            input.onlineBookingEnabled,
            input.cancellationNoticeMinutes,
          ],
        );
        return result.rowCount === 1;
      });
    },
    async upsertAvailabilityException(userId, restaurantId, input) {
      return withAuthenticatedUser(pool, userId, async (client) => {
        const result = await client.query<{ id: string }>(
          `INSERT INTO availability_exceptions
             (restaurant_id, service_date, opens_at, closes_at, closed, reason)
           SELECT $2, $3::date, $4::time, $5::time, $6, $7
           WHERE EXISTS (
             SELECT 1 FROM restaurant_memberships
             WHERE user_id = $1 AND restaurant_id = $2 AND role IN ('owner', 'admin')
           )
           ON CONFLICT (restaurant_id, service_date) DO UPDATE
             SET opens_at = EXCLUDED.opens_at,
                 closes_at = EXCLUDED.closes_at,
                 closed = EXCLUDED.closed,
                 reason = EXCLUDED.reason
           RETURNING id`,
          [
            userId,
            restaurantId,
            input.date,
            input.opensAt ?? null,
            input.closesAt ?? null,
            input.closed,
            input.reason,
          ],
        );
        return result.rows[0] ? { id: result.rows[0].id } : null;
      });
    },
    async listNotifications(userId, restaurantId, limit) {
      return withAuthenticatedUser(pool, userId, async (client) => {
        const membership = await client.query(
          `SELECT 1 FROM restaurant_memberships
           WHERE user_id = $1 AND restaurant_id = $2 LIMIT 1`,
          [userId, restaurantId],
        );
        if (!membership.rowCount) {
          return null;
        }
        const result = await client.query<{
          id: string;
          event_type: string;
          status: string;
          created_at: Date;
        }>(
          `SELECT n.id, n.event_type, n.status, n.created_at
           FROM notifications n
           JOIN reservations r ON r.id = n.reservation_id
           WHERE r.restaurant_id = $1
           ORDER BY n.created_at DESC
           LIMIT $2`,
          [restaurantId, limit],
        );
        return result.rows.map((row) => ({
          id: row.id,
          eventType: row.event_type,
          status: row.status,
          createdAt: row.created_at,
        }));
      });
    },
    async exportReservations(userId, restaurantId, fromDate, toDate) {
      return withAuthenticatedUser(pool, userId, async (client) => {
        const membership = await client.query(
          `SELECT 1 FROM restaurant_memberships
           WHERE user_id = $1 AND restaurant_id = $2 LIMIT 1`,
          [userId, restaurantId],
        );
        if (!membership.rowCount) {
          return null;
        }
        const result = await client.query<ReservationRow>(
          `SELECT reservation.id, reservation.status::text AS status,
                  reservation.starts_at, reservation.ends_at,
                  reservation.party_size_current, reservation.revision,
                  guest.name AS guest_name,
                  guest.phone AS guest_phone,
                  array_agg(restaurant_table.name ORDER BY restaurant_table.name)
                    FILTER (WHERE restaurant_table.id IS NOT NULL) AS table_names
           FROM reservations reservation
           JOIN restaurants rest ON rest.id = reservation.restaurant_id
           LEFT JOIN guests guest ON guest.id = reservation.guest_id
           LEFT JOIN reservation_tables assignment ON assignment.reservation_id = reservation.id
           LEFT JOIN restaurant_tables restaurant_table ON restaurant_table.id = assignment.table_id
           WHERE reservation.restaurant_id = $1
             AND reservation.starts_at >= (($2::date)::timestamp AT TIME ZONE rest.time_zone)
             AND reservation.starts_at < ((($3::date + 1)::timestamp) AT TIME ZONE rest.time_zone)
           GROUP BY reservation.id, guest.name, guest.phone
           ORDER BY reservation.starts_at, reservation.id`,
          [restaurantId, fromDate, toDate],
        );
        return result.rows.map((row) => ({
          id: row.id,
          status: reservationStatusSchema.parse(row.status),
          revision: row.revision,
          startsAt: row.starts_at,
          endsAt: row.ends_at,
          partySize: row.party_size_current,
          guestName: row.guest_name,
          guestPhone: row.guest_phone,
          tables: row.table_names ?? [],
        }));
      });
    },
  };
}

function isExclusionViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error &&
    error.code === "23P01";
}
