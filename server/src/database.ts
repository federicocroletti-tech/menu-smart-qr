import { Pool } from "pg";

export function createPool(): Pool {
  const connectionString = process.env["DATABASE_URL"];
  if (!connectionString) {
    throw new Error("DATABASE_URL must be configured");
  }

  const sslMode = process.env["DATABASE_SSL"];
  return new Pool({
    connectionString,
    max: 10,
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 30_000,
    ssl: sslMode === "require" ? { rejectUnauthorized: true } : undefined,
  });
}
