import { once } from "node:events";
import type { Server } from "node:http";

import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  createSupabaseTokenVerifier,
  type AccessTokenVerifier,
} from "./auth";
import type { RestaurantContentStore } from "./content-database";
import { createApp } from "./app";
import type {
  ReservationListFilters,
  TenantStore,
} from "./tenant-database";

describe("reservation API request handling", () => {
  const pool = new Pool({
    connectionString: "postgres://localhost:5432/not-used-by-validation-tests",
    connectionTimeoutMillis: 100,
  });
  let server: Server;
  let baseUrl: string;
  let queriedUserId: string | null = null;
  let queriedRestaurantId: string | null = null;
  let queriedFilters: ReservationListFilters | null = null;
  const testUserId = "c84c21a7-bca6-481a-bffd-469db59d18b7";
  const tokenVerifier: AccessTokenVerifier = {
    async verify(accessToken) {
      return accessToken === "valid-token"
        ? { id: testUserId }
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
    async listReservationsForRestaurant(userId, restaurantId, filters) {
      queriedUserId = userId;
      queriedRestaurantId = restaurantId;
      queriedFilters = filters;
      if (userId !== testUserId || restaurantId !== "restaurant-one") {
        return null;
      }
      return {
        reservations: [
          {
            id: "reservation-one",
            status: "confirmed",
            startsAt: new Date("2030-01-01T18:00:00.000Z"),
            endsAt: new Date("2030-01-01T20:00:00.000Z"),
            partySize: 2,
            guestName: "Ada Guest",
            guestPhone: "+393331234567",
            tables: ["A1"],
          },
        ],
        hasMore: false,
      };
    },
  };
  const contentStore: RestaurantContentStore = {
    async getRestaurantContent(restaurantId) {
      if (restaurantId !== "restaurant-one") {
        return null;
      }
      return {
        client: { id: restaurantId, name: "Restaurant One" },
        allergens: [{ id: "gluten" }],
        menuIndex: { currency: "EUR", categories: [] },
        menuCategories: {},
      };
    },
  };

  beforeAll(async () => {
    server = createApp(pool, tokenVerifier, tenantStore, contentStore).listen(0);
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

  it("serves restaurant content from the content store", async () => {
    const response = await fetch(
      `${baseUrl}/api/v1/restaurants/restaurant-one/content`,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      client: { id: "restaurant-one", name: "Restaurant One" },
      allergens: [{ id: "gluten" }],
      menuIndex: { currency: "EUR", categories: [] },
      menuCategories: {},
    });
  });

  it("returns not found for restaurants without imported content", async () => {
    const response = await fetch(
      `${baseUrl}/api/v1/restaurants/unknown/content`,
    );

    expect(response.status).toBe(404);
  });

  it("allows the Capacitor origin to call the reservation API", async () => {
    const response = await fetch(`${baseUrl}/api/v1/reservations`, {
      method: "OPTIONS",
      headers: {
        Origin: "capacitor://localhost",
        "Access-Control-Request-Method": "POST",
      },
    });

    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-origin")).toBe(
      "capacitor://localhost",
    );
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

  it("rejects malformed reservation hold release tokens before database access", async () => {
    const response = await fetch(
      `${baseUrl}/api/v1/reservation-holds/release`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ holdToken: "short-token" }),
      },
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: "Reservation hold not found",
    });
  });

  it("validates guest names, phone numbers, and notes before database access", async () => {
    const invalidGuests = [
      { name: "--", phone: "+393331234567", notes: "Window seat" },
      { name: "Ada Guest", phone: "abcdef", notes: "Window seat" },
      { name: "Ada Guest", phone: "+393331234567", notes: "x".repeat(1001) },
    ];

    for (const guest of invalidGuests) {
      const response = await fetch(`${baseUrl}/api/v1/reservations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          holdToken: "a".repeat(32),
          guest,
          acceptTerms: true,
          acceptPrivacy: true,
          marketingConsent: false,
        }),
      });

      expect(response.status).toBe(400);
    }
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
    expect(queriedUserId).toBe(testUserId);
  });

  it("rejects an invalid or expired access token", async () => {
    const response = await fetch(`${baseUrl}/api/v1/me/restaurants`, {
      headers: { Authorization: "Bearer invalid-token" },
    });

    expect(response.status).toBe(401);
  });

  it("lists reservations only for the authenticated restaurant member", async () => {
    const response = await fetch(
      `${baseUrl}/api/v1/admin/restaurants/restaurant-one/reservations?date=2030-01-01&status=confirmed&limit=1`,
      { headers: { Authorization: "Bearer valid-token" } },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      restaurantId: "restaurant-one",
      date: "2030-01-01",
      reservations: [
        {
          id: "reservation-one",
          status: "confirmed",
          startsAt: "2030-01-01T18:00:00.000Z",
          endsAt: "2030-01-01T20:00:00.000Z",
          partySize: 2,
          guestName: "Ada Guest",
          guestPhone: "+393331234567",
          tables: ["A1"],
        },
      ],
      hasMore: false,
    });
    expect(queriedUserId).toBe(testUserId);
    expect(queriedRestaurantId).toBe("restaurant-one");
    expect(queriedFilters).toEqual({
      date: "2030-01-01",
      status: "confirmed",
      limit: 1,
      offset: 0,
    });
  });

  it("requires authentication for the admin reservation list", async () => {
    const response = await fetch(
      `${baseUrl}/api/v1/admin/restaurants/restaurant-one/reservations?date=2030-01-01`,
    );

    expect(response.status).toBe(401);
  });

  it("hides restaurants for which the authenticated user has no membership", async () => {
    const response = await fetch(
      `${baseUrl}/api/v1/admin/restaurants/restaurant-two/reservations?date=2030-01-01`,
      { headers: { Authorization: "Bearer valid-token" } },
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: "Restaurant not found",
    });
  });

  it("rejects invalid calendar dates for the admin reservation list", async () => {
    queriedRestaurantId = null;
    const response = await fetch(
      `${baseUrl}/api/v1/admin/restaurants/restaurant-one/reservations?date=2030-02-31`,
      { headers: { Authorization: "Bearer valid-token" } },
    );

    expect(response.status).toBe(400);
    expect(queriedRestaurantId).toBeNull();
  });

  it("fails startup when Supabase Auth configuration is missing", () => {
    expect(() => createSupabaseTokenVerifier({})).toThrow(
      "SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY must be configured",
    );
  });
});
