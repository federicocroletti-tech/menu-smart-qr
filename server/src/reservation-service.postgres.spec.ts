import { randomUUID } from "node:crypto";
import { once } from "node:events";
import type { Server } from "node:http";

import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { AccessTokenVerifier } from "./auth";
import type { RestaurantContentStore } from "./content-database";
import { createApp } from "./app";
import type { TenantStore } from "./tenant-database";

const databaseUrl = process.env["RESERVATION_TEST_DATABASE_URL"];

describe.skipIf(!databaseUrl)("reservation PostgreSQL integration", () => {
  const restaurantId = `reservation-test-${randomUUID()}`;
  const holdKey = `hold-${randomUUID()}`;
  const releaseHoldKey = `release-${randomUUID()}`;
  const expiredHoldKey = `expired-${randomUUID()}`;
  const originalSecret = process.env["IDEMPOTENCY_SECRET"];
  const tokenVerifier: AccessTokenVerifier = { async verify() { return null; } };
  const tenantStore: TenantStore = {
    async listRestaurantsForUser() { return []; },
    async listReservationsForRestaurant() { return null; },
  };
  const contentStore: RestaurantContentStore = {
    async getRestaurantContent() { return null; },
  };
  let pool: Pool;
  let server: Server;
  let baseUrl: string;
  let reservationDate: string;

  beforeAll(async () => {
    process.env["IDEMPOTENCY_SECRET"] =
      "postgres-integration-test-secret-with-at-least-32-characters";
    pool = new Pool({ connectionString: databaseUrl, max: 5 });

    const date = new Date();
    date.setUTCDate(date.getUTCDate() + 14);
    reservationDate = date.toISOString().slice(0, 10);
    const dayOfWeek = date.getUTCDay();
    const area = await pool.query<{ id: string }>(
      `INSERT INTO restaurants (id, name, time_zone)
       VALUES ($1, 'Reservation integration test', 'UTC')
       RETURNING id`,
      [restaurantId],
    );
    const diningArea = await pool.query<{ id: string }>(
      `INSERT INTO dining_areas (restaurant_id, name)
       VALUES ($1, 'Test area')
       RETURNING id`,
      [area.rows[0].id],
    );
    await pool.query(
      `INSERT INTO restaurant_tables
         (dining_area_id, name, shape, x, y, width, height,
          min_capacity, standard_capacity, max_capacity)
       VALUES ($1, 'T1', 'square', 0.1, 0.1, 0.2, 0.2, 1, 2, 4)`,
      [diningArea.rows[0].id],
    );
    await pool.query(
      `INSERT INTO opening_hours (restaurant_id, day_of_week, opens_at, closes_at)
       VALUES ($1, $2, '10:00', '14:00')`,
      [restaurantId, dayOfWeek],
    );
    await pool.query(
      `INSERT INTO service_shifts
         (restaurant_id, day_of_week, starts_at, ends_at, duration_minutes,
          cleanup_minutes, slot_interval_minutes)
       VALUES ($1, $2, '10:00', '14:00', 60, 0, 30)`,
      [restaurantId, dayOfWeek],
    );
    await pool.query(
      `INSERT INTO availability_rules
         (restaurant_id, maximum_party_size, online_booking_enabled,
          booking_terms_version, privacy_notice_version)
       VALUES ($1, 4, true, 'test-terms-v1', 'test-privacy-v1')`,
      [restaurantId],
    );

    server = createApp(pool, tokenVerifier, tenantStore, contentStore).listen(0);
    await once(server, "listening");
    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("PostgreSQL integration API failed to bind");
    }
    baseUrl = `http://127.0.0.1:${address.port}`;
  }, 30_000);

  afterAll(async () => {
    if (server) {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    }
    if (pool) {
      const reservations = await pool.query<{ id: string }>(
        "SELECT id FROM reservations WHERE restaurant_id = $1",
        [restaurantId],
      );
      const reservationIds = reservations.rows.map(({ id }) => id);
      if (reservationIds.length) {
        await pool.query(
          "DELETE FROM reservation_events WHERE reservation_id = ANY($1::uuid[])",
          [reservationIds],
        );
        await pool.query(
          "DELETE FROM consent_records WHERE reservation_id = ANY($1::uuid[])",
          [reservationIds],
        );
        await pool.query(
          "DELETE FROM payment_guarantees WHERE reservation_id = ANY($1::uuid[])",
          [reservationIds],
        );
        await pool.query(
          "DELETE FROM notifications WHERE reservation_id = ANY($1::uuid[])",
          [reservationIds],
        );
        await pool.query(
          "DELETE FROM reservation_tables WHERE reservation_id = ANY($1::uuid[])",
          [reservationIds],
        );
        await pool.query(
          "DELETE FROM reservations WHERE id = ANY($1::uuid[])",
          [reservationIds],
        );
      }
      await pool.query("DELETE FROM guests WHERE restaurant_id = $1", [restaurantId]);
      await pool.query(
        `DELETE FROM table_blocks
         WHERE table_id IN (
           SELECT t.id FROM restaurant_tables t
           JOIN dining_areas a ON a.id = t.dining_area_id
           WHERE a.restaurant_id = $1
         )`,
        [restaurantId],
      );
      await pool.query("DELETE FROM closures WHERE restaurant_id = $1", [restaurantId]);
      await pool.query(
        `DELETE FROM table_combinations
         WHERE dining_area_id IN (
           SELECT id FROM dining_areas WHERE restaurant_id = $1
         )`,
        [restaurantId],
      );
      await pool.query(
        `DELETE FROM restaurant_tables
         WHERE dining_area_id IN (
           SELECT id FROM dining_areas WHERE restaurant_id = $1
         )`,
        [restaurantId],
      );
      await pool.query("DELETE FROM opening_hours WHERE restaurant_id = $1", [restaurantId]);
      await pool.query("DELETE FROM service_shifts WHERE restaurant_id = $1", [restaurantId]);
      await pool.query("DELETE FROM availability_rules WHERE restaurant_id = $1", [restaurantId]);
      await pool.query("DELETE FROM dining_areas WHERE restaurant_id = $1", [restaurantId]);
      await pool.query("DELETE FROM restaurants WHERE id = $1", [restaurantId]);
      await pool.end();
    }
    if (originalSecret === undefined) {
      delete process.env["IDEMPOTENCY_SECRET"];
    } else {
      process.env["IDEMPOTENCY_SECRET"] = originalSecret;
    }
  });

  it("holds, confirms idempotently, recovers, cancels, and expires holds in PostgreSQL", async () => {
    const holdRequest = {
      date: reservationDate,
      time: "12:00",
      partySize: 2,
      allocationMode: "restaurant_assigned",
    };
    const hold = await fetch(`${baseUrl}/api/v1/restaurants/${restaurantId}/reservation-holds`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": holdKey,
      },
      body: JSON.stringify(holdRequest),
    });
    expect(hold.status).toBe(201);
    const holdBody = await hold.json() as { holdToken: string; tableNames: string[] };
    expect(holdBody.tableNames).toEqual(["T1"]);

    const replayedHold = await fetch(
      `${baseUrl}/api/v1/restaurants/${restaurantId}/reservation-holds`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": holdKey,
        },
        body: JSON.stringify(holdRequest),
      },
    );
    expect(replayedHold.status).toBe(200);
    expect((await replayedHold.json()).holdToken).toBe(holdBody.holdToken);

    const mismatchedReplay = await fetch(
      `${baseUrl}/api/v1/restaurants/${restaurantId}/reservation-holds`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": holdKey,
        },
        body: JSON.stringify({ ...holdRequest, partySize: 3 }),
      },
    );
    expect(mismatchedReplay.status).toBe(409);

    const confirmationRequest = {
      holdToken: holdBody.holdToken,
      guest: { name: "Ada Lovelace", phone: "+39 333 1234567", notes: "Window" },
      acceptTerms: true,
      acceptPrivacy: true,
      marketingConsent: false,
    };
    const firstConfirmation = await fetch(`${baseUrl}/api/v1/reservations`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(confirmationRequest),
    });
    expect(firstConfirmation.status).toBe(200);
    const confirmationBody = await firstConfirmation.json() as {
      confirmationCode: string;
    };

    const repeatedHold = await fetch(
      `${baseUrl}/api/v1/restaurants/${restaurantId}/reservation-holds`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": holdKey,
        },
        body: JSON.stringify(holdRequest),
      },
    );
    expect(repeatedHold.status).toBe(200);

    const repeatedConfirmation = await fetch(`${baseUrl}/api/v1/reservations`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(confirmationRequest),
    });
    expect(repeatedConfirmation.status).toBe(200);
    expect((await repeatedConfirmation.json()).confirmationCode).toBe(
      confirmationBody.confirmationCode,
    );

    const recovered = await fetch(
      `${baseUrl}/api/v1/reservations/${confirmationBody.confirmationCode}`,
    );
    expect(recovered.status).toBe(200);
    expect((await recovered.json()).status).toBe("confirmed");

    const cancellationUrl =
      `${baseUrl}/api/v1/reservations/${confirmationBody.confirmationCode}/cancellation`;
    const cancellation = await fetch(cancellationUrl, { method: "POST" });
    expect(cancellation.status).toBe(200);
    const repeatedCancellation = await fetch(cancellationUrl, { method: "POST" });
    expect(repeatedCancellation.status).toBe(409);

    const holdToRelease = await fetch(
      `${baseUrl}/api/v1/restaurants/${restaurantId}/reservation-holds`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": releaseHoldKey,
        },
        body: JSON.stringify(holdRequest),
      },
    );
    expect(holdToRelease.status).toBe(201);
    const releasableHold = await holdToRelease.json() as { holdToken: string };
    const releaseUrl =
      `${baseUrl}/api/v1/reservation-holds/release`;
    const releaseRequest = {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ holdToken: releasableHold.holdToken }),
    };
    const released = await fetch(releaseUrl, releaseRequest);
    expect(released.status).toBe(200);
    expect(await released.json()).toEqual({ status: "cancelled_by_guest" });
    const repeatedRelease = await fetch(releaseUrl, releaseRequest);
    expect(repeatedRelease.status).toBe(200);
    expect(await repeatedRelease.json()).toEqual({ status: "cancelled_by_guest" });

    const expiredHold = await fetch(
      `${baseUrl}/api/v1/restaurants/${restaurantId}/reservation-holds`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": expiredHoldKey,
        },
        body: JSON.stringify(holdRequest),
      },
    );
    expect(expiredHold.status).toBe(201);
    const expiredHoldBody = await expiredHold.json() as { holdToken: string };
    await pool.query(
      `UPDATE reservations SET hold_expires_at = now() - interval '1 minute'
       WHERE restaurant_id = $1 AND idempotency_key = $2`,
      [restaurantId, expiredHoldKey],
    );

    const expiredConfirmation = await fetch(`${baseUrl}/api/v1/reservations`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...confirmationRequest, holdToken: expiredHoldBody.holdToken }),
    });
    expect(expiredConfirmation.status).toBe(410);
    const expiredReplay = await fetch(
      `${baseUrl}/api/v1/restaurants/${restaurantId}/reservation-holds`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": expiredHoldKey,
        },
        body: JSON.stringify(holdRequest),
      },
    );
    expect(expiredReplay.status).toBe(409);
  }, 30_000);
});
