import { Pool, type PoolConfig } from "pg";

export function createPoolOptions(
  environment: NodeJS.ProcessEnv = process.env,
): PoolConfig {
  const connectionString = environment["DATABASE_URL"];
  if (!connectionString) {
    throw new Error("DATABASE_URL must be configured");
  }

  const sslMode = environment["DATABASE_SSL"];
  const databasePassword = environment["DATABASE_PASSWORD"];
  return {
    connectionString,
    ...(databasePassword ? { password: databasePassword } : {}),
    max: 10,
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 30_000,
    ssl: sslMode === "require" ? { rejectUnauthorized: false } : undefined,
  };
}

export function createPool(
  environment: NodeJS.ProcessEnv = process.env,
): Pool {
  return new Pool(createPoolOptions(environment));
}
