import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

import { createPool } from "./database";

interface ClientProfile {
  id: string;
  name: string;
  timeZone: string;
  reservations?: {
    bookingTermsVersion?: string;
    privacyNoticeVersion?: string;
  };
}

interface MenuIndex {
  categories: Array<{ file?: string }>;
}

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, "utf8")) as T;
}

async function seedContent(): Promise<void> {
  const clientsPath = join(__dirname, "..", "..", "src", "assets", "clients");
  const entries = await readdir(clientsPath, { withFileTypes: true });
  const pool = createPool();

  try {
    for (const entry of entries
      .filter((item) => item.isDirectory())
      .sort((left, right) => left.name.localeCompare(right.name))) {
      const clientPath = join(clientsPath, entry.name);
      const client = await readJson<ClientProfile & Record<string, unknown>>(
        join(clientPath, "client.json"),
      );
      const allergens = await readJson<unknown[]>(
        join(clientPath, "allergens.json"),
      );
      const menuIndex = await readJson<MenuIndex>(
        join(clientPath, "menu", "index.json"),
      );
      const menuCategories: Record<string, unknown> = {};

      for (const category of menuIndex.categories) {
        if (category.file) {
          menuCategories[category.file] = await readJson(
            join(clientPath, "menu", category.file),
          );
        }
      }

      if (!client.id || !client.name || !client.timeZone) {
        throw new Error(`Client profile is missing required fields: ${entry.name}`);
      }

      const databaseClient = await pool.connect();
      try {
        await databaseClient.query("BEGIN");
        await databaseClient.query(
          `INSERT INTO restaurants (id, name, time_zone)
           VALUES ($1, $2, $3)
           ON CONFLICT (id) DO NOTHING`,
          [client.id, client.name, client.timeZone],
        );
        await databaseClient.query(
          `INSERT INTO restaurant_content
             (restaurant_id, client_data, allergens, menu_index, menu_categories)
           VALUES ($1, $2::jsonb, $3::jsonb, $4::jsonb, $5::jsonb)
           ON CONFLICT (restaurant_id)
           DO UPDATE SET
             client_data = jsonb_set(
               jsonb_set(
                 restaurant_content.client_data,
                 '{reservations}',
                 COALESCE(EXCLUDED.client_data -> 'reservations', 'null'::jsonb),
                 true
               ),
               '{settings,featureFlags,enableReservations}',
               COALESCE(
                 EXCLUDED.client_data #> '{settings,featureFlags,enableReservations}',
                 'false'::jsonb
               ),
               true
             ),
             updated_at = now()`,
          [
            client.id,
            JSON.stringify(client),
            JSON.stringify(allergens),
            JSON.stringify(menuIndex),
            JSON.stringify(menuCategories),
          ],
        );
        if (client.reservations) {
          await databaseClient.query(
            `UPDATE availability_rules
             SET booking_terms_version = COALESCE($2, booking_terms_version),
                 privacy_notice_version = COALESCE($3, privacy_notice_version)
             WHERE restaurant_id = $1`,
            [
              client.id,
              client.reservations.bookingTermsVersion ?? null,
              client.reservations.privacyNoticeVersion ?? null,
            ],
          );
        }
        await databaseClient.query("COMMIT");
        console.log(`Synchronized restaurant content: ${client.id}`);
      } catch (error) {
        await databaseClient.query("ROLLBACK");
        throw error;
      } finally {
        databaseClient.release();
      }
    }
  } finally {
    await pool.end();
  }
}

seedContent().catch((error: unknown) => {
  console.error("Restaurant content synchronization failed:", error);
  process.exitCode = 1;
});
