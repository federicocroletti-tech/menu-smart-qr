import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { createPool } from "./database";

const databaseUrl = process.env["RESERVATION_TEST_DATABASE_URL"];

if (!databaseUrl) {
  throw new Error("RESERVATION_TEST_DATABASE_URL must be configured");
}

if (!new URL(databaseUrl).hostname.endsWith(".neon.tech")) {
  throw new Error("Test database bootstrap is restricted to Neon hosts");
}

async function bootstrapTestDatabase(): Promise<void> {
  const pool = createPool({
    ...process.env,
    DATABASE_URL: databaseUrl,
    DATABASE_PASSWORD: undefined,
    DATABASE_SSL: "verify-full",
  });

  try {
    const bootstrapSql = await readFile(
      join(__dirname, "..", "test", "postgres-bootstrap.sql"),
      "utf8",
    );
    await pool.query(bootstrapSql);
    console.log("Initialized the Neon test database bootstrap schema.");
  } finally {
    await pool.end();
  }
}

bootstrapTestDatabase().catch((error: unknown) => {
  console.error("Neon test database bootstrap failed:", error);
  process.exitCode = 1;
});
