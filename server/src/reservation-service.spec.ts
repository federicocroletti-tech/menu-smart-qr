import { afterEach, describe, expect, it } from "vitest";

import type { Pool, PoolClient } from "pg";

import {
  createConfirmationCode,
  releaseReservationHold,
} from "./reservation-service";

const originalSecret = process.env["IDEMPOTENCY_SECRET"];

afterEach(() => {
  if (originalSecret === undefined) {
    delete process.env["IDEMPOTENCY_SECRET"];
  } else {
    process.env["IDEMPOTENCY_SECRET"] = originalSecret;
  }
});

describe("createConfirmationCode", () => {
  it("generates a stable code accepted by the reservation lookup route", () => {
    process.env["IDEMPOTENCY_SECRET"] = "test-secret-with-at-least-32-characters";

    const first = createConfirmationCode("opaque-hold-token");

    expect(first).toHaveLength(32);
    expect(first).toMatch(/^[A-Za-z0-9_-]{20,32}$/);
    expect(createConfirmationCode("opaque-hold-token")).toBe(first);
  });
});

describe("releaseReservationHold", () => {
  it("cancels the temporary hold and releases its table occupancy", async () => {
    const statements: string[] = [];
    const query = async (sql: string) => {
      statements.push(sql);
      if (sql.includes("SELECT id, status")) {
        return {
          rows: [{ id: "reservation-id", status: "holding" }],
          rowCount: 1,
        };
      }
      return { rows: [], rowCount: 1 };
    };
    const client = {
      query,
      release() {},
    } as unknown as PoolClient;
    const pool = {
      async connect() {
        return client;
      },
    } as unknown as Pool;

    await expect(releaseReservationHold(pool, "hold-token")).resolves.toEqual({
      status: "cancelled_by_guest",
    });
    expect(statements.some((sql) => sql.includes("SET status = 'cancelled_by_guest'")))
      .toBe(true);
    expect(statements.some((sql) => sql.includes("UPDATE reservation_tables")))
      .toBe(true);
    expect(statements.some((sql) => sql.includes("INSERT INTO reservation_events")))
      .toBe(true);
  });
});
