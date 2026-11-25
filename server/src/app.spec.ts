import { once } from "node:events";
import type { Server } from "node:http";

import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  createSupabaseTokenVerifier,
  type AccessTokenVerifier,
} from "./auth";
import { createApp } from "./app";
import type { TenantStore } from "./tenant-database";

describe("reservation API request validation", () => {
  const pool = new Pool({
    connectionString: "postgres://localhost:5432/not-used-by-validation-tests",
    connectionTimeoutMillis: 100,
  });
  let server: Server;
  let baseUrl: string;
  let queriedUserId: string | null = null;
  const tokenVerifier: AccessTokenVerifier = {
    async verify(accessToken) {
      return accessToken === "valid-token"
        ? { id: "c84c21a7-bca6-481a-bffd-469db59d18b7" }
        : null;
    },
  };
  const tenantStore: TenantStore = {
    async listRestaurantsForUser(userId) {
      queriedUserId = userId;
      return [
        {
          restaurantId: "restaurant-one",
          name: "Restaurant One",
          timeZone: "Europe/Rome",
          role: "owner",
        },
      ];
    },
  };

  beforeAll(async () => {
    server = createApp(pool, tokenVerifier, tenantStore).listen(0);
    await once(server, "listening");
    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("Test server did not bind to a TCP port");
    }
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
    await pool.end();
  });

  it("rejects malformed availability query values before database access", async () => {
    const response = await fetch(
      `${baseUrl}/api/v1/restaurants/demo/availability?date=2026-02-31&time=25%3A99&partySize=2`,
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Invalid availability request",
    });
  });

  it("requires a selected table when the guest chooses allocation", async () => {
    const response = await fetch(
      `${baseUrl}/api/v1/restaurants/demo/reservation-holds`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": "reservation-request-1",
        },
        body: JSON.stringify({
          date: "2030-01-01",
          time: "19:00",
          partySize: 2,
          allocationMode: "guest_selected",
        }),
      },
    );

    expect(response.status).toBe(400);
  });

  it("rejects table identifiers when the restaurant assigns the table", async () => {
    const response = await fetch(
      `${baseUrl}/api/v1/restaurants/demo/reservation-holds`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": "reservation-request-2",
        },
        body: JSON.stringify({
          date: "2030-01-01",
          time: "19:00",
          partySize: 2,
          allocationMode: "restaurant_assigned",
          tableIds: ["52fdfc07-2182-454f-963f-5f0f9a621d72"],
        }),
      },
    );

    expect(response.status).toBe(400);
  });

  it("requires explicit booking and privacy acceptance", async () => {
    const response = await fetch(`${baseUrl}/api/v1/reservations`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        holdToken: "a".repeat(32),
        guest: { name: "Ada Guest", phone: "+393331234567" },
        acceptTerms: false,
        acceptPrivacy: true,
        marketingConsent: false,
      }),
    });

    expect(response.status).toBe(400);
  });

  it("requires a verified access token for restaurant memberships", async () => {
    const response = await fetch(`${baseUrl}/api/v1/me/restaurants`);

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: "Authentication required",
    });
  });

  it("returns memberships resolved for the verified user", async () => {
    queriedUserId = null;
    const response = await fetch(`${baseUrl}/api/v1/me/restaurants`, {
      headers: { Authorization: "Bearer valid-token" },
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      restaurants: [
        {
          restaurantId: "restaurant-one",
          name: "Restaurant One",
          timeZone: "Europe/Rome",
          role: "owner",
        },
      ],
    });
    expect(queriedUserId).toBe("c84c21a7-bca6-481a-bffd-469db59d18b7");
  });

  it("rejects an invalid or expired access token", async () => {
    const response = await fetch(`${baseUrl}/api/v1/me/restaurants`, {
      headers: { Authorization: "Bearer invalid-token" },
    });

    expect(response.status).toBe(401);
  });

  it("fails startup when Supabase Auth configuration is missing", () => {
    expect(() => createSupabaseTokenVerifier({})).toThrow(
      "SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY must be configured",
    );
  });
});
