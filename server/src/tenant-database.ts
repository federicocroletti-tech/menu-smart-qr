import type { Pool, PoolClient, QueryResultRow } from "pg";
import { z } from "zod";

export const restaurantMemberRoleSchema = z.enum(["owner", "admin", "staff"]);
export type RestaurantMemberRole = z.infer<typeof restaurantMemberRoleSchema>;

export interface RestaurantMembership {
  restaurantId: string;
  name: string;
  timeZone: string;
  role: RestaurantMemberRole;
}

export interface TenantStore {
  listRestaurantsForUser(userId: string): Promise<RestaurantMembership[]>;
}

interface MembershipRow extends QueryResultRow {
  restaurant_id: string;
  name: string;
  time_zone: string;
  role: string;
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
           ORDER BY r.name`,
        );

        return result.rows.map((row) => ({
          restaurantId: row.restaurant_id,
          name: row.name,
          timeZone: row.time_zone,
          role: restaurantMemberRoleSchema.parse(row.role),
        }));
      });
    },
  };
}
