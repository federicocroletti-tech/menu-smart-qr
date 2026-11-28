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
const legalClientData = {
  settings: { featureFlags: { enableReservations: true } },
  reservations: {
    enabled: true,
    bookingTermsUrl: "https://legal.example.test/booking-terms",
    privacyNoticeUrl: "https://legal.example.test/privacy",
    bookingTermsVersion: "test-terms-v1",
    privacyNoticeVersion: "test-privacy-v1",
  },
};

function isAllowedReservationTestDatabase(connectionString: string): boolean {
  try {
    const hostname = new URL(connectionString).hostname.toLowerCase();
    return hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "::1" ||
      hostname === "[::1]" ||
      hostname.endsWith(".neon.tech");
  } catch {
    return false;
  }
}

function nextLastSundayOfMonth(month: number): string {
  const todayParts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Rome",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const todayValues = Object.fromEntries(
    todayParts.map(({ type, value }) => [type, value]),
  );
  const today = `${todayValues["year"]}-${todayValues["month"]}-${todayValues["day"]}`;
  let year = Number(todayValues["year"]);

  while (true) {
    const lastDay = new Date(Date.UTC(year, month + 1, 0));
    const lastSunday = lastDay.getUTCDate() - lastDay.getUTCDay();
    const date = `${year}-${String(month + 1).padStart(2, "0")}-${String(lastSunday).padStart(2, "0")}`;
    if (date > today) {
      return date;
    }
    year += 1;
  }
}

if (
  process.env["REQUIRE_RESERVATION_TEST_DATABASE"] === "true" &&
  !databaseUrl
) {
  throw new Error(
    "RESERVATION_TEST_DATABASE_URL is required when PostgreSQL integration tests are mandatory",
  );
}

if (databaseUrl && !isAllowedReservationTestDatabase(databaseUrl)) {
  throw new Error(
    "Reservation integration tests are restricted to local PostgreSQL or Neon test hosts",
  );
}

describe.skipIf(!databaseUrl)("reservation PostgreSQL integration", () => {
  const restaurantId = `reservation-test-${randomUUID()}`;
  const holdKey = `hold-${randomUUID()}`;
  const releaseHoldKey = `release-${randomUUID()}`;
  const expiredHoldKey = `expired-${randomUUID()}`;
  const expiredReleaseHoldKey = `expired-release-${randomUUID()}`;
  const originalSecret = process.env["IDEMPOTENCY_SECRET"];
  const tokenVerifier: AccessTokenVerifier = { async verify() { return null; } };
  const tenantStore: TenantStore = {
    async listRestaurantsForUser() { return []; },
    async listReservationsForRestaurant() { return null; },
    async canManageRestaurant() { return false; },
    async getAvailabilityRules() { return null; },
    async listAvailabilityExceptions() { return null; },
    async listTableBlocks() { return null; },
    async createStaffReservation() { return null; },
    async updateReservationForStaff() { return null; },
    async createTableBlock() { return null; },
    async deleteTableBlock() { return false; },
    async updateAvailabilityRules() { return false; },
    async upsertAvailabilityException() { return null; },
    async listNotifications() { return null; },
    async exportReservations() { return null; },
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
       VALUES ($1, 'Reservation integration test', 'Europe/Rome')
       RETURNING id`,
      [restaurantId],
    );
    await pool.query(
      `INSERT INTO restaurant_content
         (restaurant_id, client_data, allergens, menu_index, menu_categories)
       VALUES ($1, $2::jsonb, '[]'::jsonb, '{}'::jsonb, '{}'::jsonb)`,
      [restaurantId, JSON.stringify({
        ...legalClientData,
        id: restaurantId,
      })],
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
      `INSERT INTO opening_hours (restaurant_id, day_of_week, opens_at, closes_at)
       VALUES ($1, 0, '01:00', '04:00')`,
      [restaurantId],
    );
    await pool.query(
      `INSERT INTO service_shifts
         (restaurant_id, day_of_week, starts_at, ends_at, duration_minutes,
          cleanup_minutes, slot_interval_minutes)
       VALUES ($1, $2, '10:00', '14:00', 60, 0, 30)`,
      [restaurantId, dayOfWeek],
    );
    await pool.query(
      `INSERT INTO service_shifts
         (restaurant_id, day_of_week, starts_at, ends_at, duration_minutes,
          cleanup_minutes, slot_interval_minutes)
       VALUES ($1, 0, '01:00', '04:00', 30, 0, 30)`,
      [restaurantId],
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
    await pool.query(
      `UPDATE restaurant_content
       SET client_data = jsonb_set(
         client_data,
         '{reservations,privacyNoticeUrl}',
         'null'::jsonb
       )
       WHERE restaurant_id = $1`,
      [restaurantId],
    );
    const missingLegalDocumentHold = await fetch(
      `${baseUrl}/api/v1/restaurants/${restaurantId}/reservation-holds`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": `missing-docs-${randomUUID()}`,
        },
        body: JSON.stringify(holdRequest),
      },
    );
    expect(missingLegalDocumentHold.status).toBe(503);
    await pool.query(
      `UPDATE restaurant_content SET client_data = $2::jsonb
       WHERE restaurant_id = $1`,
      [restaurantId, JSON.stringify({
        ...legalClientData,
        id: restaurantId,
      })],
    );

    const springGap = await fetch(
      `${baseUrl}/api/v1/restaurants/${restaurantId}/availability?date=${nextLastSundayOfMonth(2)}&time=02%3A30&partySize=2`,
    );
    expect(springGap.status).toBe(404);
    const autumnFold = await fetch(
      `${baseUrl}/api/v1/restaurants/${restaurantId}/availability?date=${nextLastSundayOfMonth(9)}&time=02%3A30&partySize=2`,
    );
    expect(autumnFold.status).toBe(200);
    expect((await autumnFold.json()).available).toBe(true);

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
      bookingTermsVersion: "test-terms-v1",
      privacyNoticeVersion: "test-privacy-v1",
      guest: { name: "Ada Lovelace", phone: "+39 333 1234567", notes: "Window" },
      acceptTerms: true,
      acceptPrivacy: true,
      marketingConsent: false,
    };
    const staleLegalVersion = await fetch(`${baseUrl}/api/v1/reservations`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...confirmationRequest,
        bookingTermsVersion: "stale-terms-v0",
      }),
    });
    expect(staleLegalVersion.status).toBe(412);

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
    const recoveredBody = await recovered.json();
    expect(recoveredBody.status).toBe("confirmed");
    expect(new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Rome",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).format(new Date(recoveredBody.startsAt))).toBe("12:00");
    const reservationRevision = recovered.headers.get("etag");
    expect(reservationRevision).toMatch(/^"\d+"$/);

    const modificationUrl =
      `${baseUrl}/api/v1/reservations/${confirmationBody.confirmationCode}`;
    const modificationHeaders = {
      "Content-Type": "application/json",
      "Idempotency-Key": `modify-${randomUUID()}`,
      "If-Match": reservationRevision as string,
    };
    const modificationBody = {
      date: reservationDate,
      time: "12:30",
      partySize: 2,
    };
    const modified = await fetch(modificationUrl, {
      method: "PATCH",
      headers: modificationHeaders,
      body: JSON.stringify(modificationBody),
    });
    expect(modified.status).toBe(200);
    expect(await modified.json()).toMatchObject({
      status: "confirmed",
      partySize: 2,
    });
    const replayedModification = await fetch(modificationUrl, {
      method: "PATCH",
      headers: modificationHeaders,
      body: JSON.stringify(modificationBody),
    });
    expect(replayedModification.status).toBe(200);
    expect(await replayedModification.json()).toMatchObject({
      status: "confirmed",
      partySize: 2,
    });
    const mismatchedModificationReplay = await fetch(modificationUrl, {
      method: "PATCH",
      headers: modificationHeaders,
      body: JSON.stringify({ ...modificationBody, partySize: 3 }),
    });
    expect(mismatchedModificationReplay.status).toBe(409);
    const staleModification = await fetch(modificationUrl, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": `stale-${randomUUID()}`,
        "If-Match": reservationRevision as string,
      },
      body: JSON.stringify({ ...modificationBody, time: "13:00" }),
    });
    expect(staleModification.status).toBe(412);

    const cancellationUrl =
      `${baseUrl}/api/v1/reservations/${confirmationBody.confirmationCode}/cancellation`;
    const cancellation = await fetch(cancellationUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: "Plans changed" }),
    });
    expect(cancellation.status).toBe(200);
    const repeatedCancellation = await fetch(cancellationUrl, { method: "POST" });
    expect(repeatedCancellation.status).toBe(409);

    const competingHolds = await Promise.all(
      [randomUUID(), randomUUID()].map((key) =>
        fetch(`${baseUrl}/api/v1/restaurants/${restaurantId}/reservation-holds`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": key,
          },
          body: JSON.stringify(holdRequest),
        })
      ),
    );
    expect(competingHolds.map((response) => response.status).sort()).toEqual([201, 409]);
    const winningHold = competingHolds.find((response) => response.status === 201);
    if (!winningHold) {
      throw new Error("Expected one competing hold to acquire the table");
    }
    const winningHoldBody = await winningHold.json() as { holdToken: string };
    const cleanupHold = await fetch(`${baseUrl}/api/v1/reservation-holds/release`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ holdToken: winningHoldBody.holdToken }),
    });
    expect(cleanupHold.status).toBe(200);

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
    const repeatedExpiredConfirmation = await fetch(
      `${baseUrl}/api/v1/reservations`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...confirmationRequest,
          holdToken: expiredHoldBody.holdToken,
        }),
      },
    );
    expect(repeatedExpiredConfirmation.status).toBe(410);
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

    const expiringRelease = await fetch(
      `${baseUrl}/api/v1/restaurants/${restaurantId}/reservation-holds`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": expiredReleaseHoldKey,
        },
        body: JSON.stringify(holdRequest),
      },
    );
    expect(expiringRelease.status).toBe(201);
    const expiringReleaseBody = await expiringRelease.json() as {
      holdToken: string;
    };
    await pool.query(
      `UPDATE reservations SET hold_expires_at = now() - interval '1 minute'
       WHERE restaurant_id = $1 AND idempotency_key = $2`,
      [restaurantId, expiredReleaseHoldKey],
    );
    const expiredRelease = await fetch(
      `${baseUrl}/api/v1/reservation-holds/release`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ holdToken: expiringReleaseBody.holdToken }),
      },
    );
    expect(expiredRelease.status).toBe(410);
    const repeatedExpiredRelease = await fetch(
      `${baseUrl}/api/v1/reservation-holds/release`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ holdToken: expiringReleaseBody.holdToken }),
      },
    );
    expect(repeatedExpiredRelease.status).toBe(410);
  }, 30_000);
});
