import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { createPool } from "./database";

const migrationNames = [
  "001_reservation_schema.sql",
  "002_supabase_tenant_security.sql",
  "003_restaurant_content.sql",
  "004_demo_whatsapp_recipient.sql",
  "005_demo_reservation_setup.sql",
  "006_reservation_management_api.sql",
];

async function migrate(): Promise<void> {
  const pool = createPool();
  const client = await pool.connect();

  try {
    await client.query("SELECT pg_advisory_lock($1)", [2_024_112_401]);
    await client.query(
      "CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())",
    );

    for (const migrationName of migrationNames) {
      const applied = await client.query(
        "SELECT name FROM schema_migrations WHERE name = $1",
        [migrationName],
      );
      if (applied.rowCount) {
        console.log(`Migration already applied: ${migrationName}`);
        continue;
      }

      const sql = await readFile(
        join(__dirname, "..", "migrations", migrationName),
        "utf8",
      );

      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query("INSERT INTO schema_migrations (name) VALUES ($1)", [
          migrationName,
        ]);
        await client.query("COMMIT");
        console.log(`Applied migration: ${migrationName}`);
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    }
  } finally {
    await client.query("SELECT pg_advisory_unlock($1)", [2_024_112_401]);
    client.release();
    await pool.end();
  }
}

migrate().catch((error: unknown) => {
  console.error("Database migration failed:", error);
  process.exitCode = 1;
});
