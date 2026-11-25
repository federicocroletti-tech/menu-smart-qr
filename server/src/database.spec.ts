import { describe, expect, it } from "vitest";

import { createPoolOptions } from "./database";

describe("createPoolOptions", () => {
  it("passes a separate database password without URI encoding", () => {
    const password = "p@ss:/word?#%";
    const connectionString =
      "postgresql://postgres.project@pooler.example.com:5432/postgres";

    expect(
      createPoolOptions({
        DATABASE_URL: connectionString,
        DATABASE_PASSWORD: password,
        DATABASE_SSL: "require",
      }),
    ).toMatchObject({
      connectionString,
      password,
      ssl: { rejectUnauthorized: false },
    });
  });

  it("continues to accept a connection URI with its own password", () => {
    const connectionString =
      "postgresql://postgres:encoded%40password@pooler.example.com:5432/postgres";

    expect(
      createPoolOptions({
        DATABASE_URL: connectionString,
      }),
    ).toMatchObject({ connectionString });
    expect(
      createPoolOptions({
        DATABASE_URL: connectionString,
      }).password,
    ).toBeUndefined();
  });
});
