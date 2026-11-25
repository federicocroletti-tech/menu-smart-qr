import { describe, expect, it } from "vitest";

import { createPoolOptions } from "./database";

describe("createPoolOptions", () => {
  it("passes a separate database password without URI encoding", () => {
    const password = "p@ss:/word?#%";
    const connectionString =
      "postgresql://postgres.project@pooler.example.com:5432/postgres";

    const options = createPoolOptions({
      DATABASE_URL: connectionString,
      DATABASE_PASSWORD: password,
      DATABASE_SSL: "require",
    });

    expect(options).toMatchObject({
      host: "pooler.example.com",
      port: 5432,
      database: "postgres",
      user: "postgres.project",
      password,
      ssl: { rejectUnauthorized: false },
    });
    expect(options).not.toHaveProperty("connectionString");
  });

  it("continues to accept a connection URI with its own password", () => {
    const connectionString =
      "postgresql://postgres:encoded%40password@pooler.example.com:5432/postgres";

    const options = createPoolOptions({
      DATABASE_URL: connectionString,
    });

    expect(options).toMatchObject({
      host: "pooler.example.com",
      port: 5432,
      database: "postgres",
      user: "postgres",
      password: "encoded@password",
    });
    expect(options).not.toHaveProperty("connectionString");
  });
});
