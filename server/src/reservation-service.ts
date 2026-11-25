import { createHash, createHmac } from "node:crypto";

import type { Pool, PoolClient } from "pg";

import {
  AvailabilityError,
  findAvailability,
  type AvailabilityRequest,
} from "./availability";
import {
  canTransitionReservation,
  type ReservationStatus,
} from "./domain/reservations";

export class ReservationError extends Error {
  constructor(
    readonly statusCode: number,
    message: string,
  ) {
    super(message);
  }
}

export interface HoldRequest extends AvailabilityRequest {
  allocationMode: "guest_selected" | "restaurant_assigned";
  tableIds?: string[];
  idempotencyKey: string;
}

export interface HoldResult {
  holdToken: string;
  expiresAt: Date;
  tableIds: string[];
  reused: boolean;
}

export interface ConfirmationRequest {
  holdToken: string;
  guest: {
    name: string;
    phone: string;
    email?: string;
    notes?: string;
  };
  acceptTerms: true;
  acceptPrivacy: true;
  marketingConsent: boolean;
}

export async function expireExpiredHolds(pool: Pool): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await expireHolds(client);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

interface ExistingHold {
  id: string;
  status: ReservationStatus;
  starts_at: Date;
  ends_at: Date;
  party_size_current: number;
  hold_expires_at: Date | null;
  allocation_mode: HoldRequest["allocationMode"];
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function hashConfirmationCode(code: string): string {
  return hashToken(code);
}

export function createConfirmationCode(holdToken: string): string {
  const secret = process.env["IDEMPOTENCY_SECRET"];
  if (!secret || secret.length < 32) {
    throw new Error("IDEMPOTENCY_SECRET must contain at least 32 characters");
  }

  return createHmac("sha256", secret)
    .update(`confirmation\u0000${holdToken}`)
    .digest("base64url")
    .slice(0, 32);
}

function getIdempotentHoldToken(restaurantId: string, key: string): string {
  const secret = process.env["IDEMPOTENCY_SECRET"];
  if (!secret || secret.length < 32) {
    throw new Error("IDEMPOTENCY_SECRET must contain at least 32 characters");
  }

  return createHmac("sha256", secret)
    .update(`${restaurantId}\u0000${key}`)
    .digest("base64url");
}

async function expireHolds(
  client: PoolClient,
  restaurantId?: string,
): Promise<void> {
  const expired = await client.query<{
    id: string;
    previous_status: ReservationStatus;
  }>(
    `WITH due AS (
       SELECT id, status
       FROM reservations
       WHERE status IN ('holding', 'awaiting_guarantee')
         AND hold_expires_at <= now()
         AND ($1::text IS NULL OR restaurant_id = $1)
       FOR UPDATE
     )
     UPDATE reservations r
     SET status = 'expired', updated_at = now()
     FROM due
     WHERE r.id = due.id
     RETURNING r.id, due.status AS previous_status`,
    [restaurantId ?? null],
  );
  if (expired.rowCount === 0) {
    return;
  }

  const ids = expired.rows.map((row) => row.id);
  await client.query(
    `UPDATE reservation_tables
     SET status = 'expired'
     WHERE reservation_id = ANY($1::uuid[])`,
    [ids],
  );
  await client.query(
    `INSERT INTO reservation_events
       (reservation_id, actor_type, previous_status, new_status, reason)
     SELECT r.id, 'system', e.previous_status, 'expired', 'Temporary hold expired'
     FROM reservations r
     JOIN unnest($1::uuid[], $2::reservation_status[]) AS e(id, previous_status)
       ON e.id = r.id`,
    [ids, expired.rows.map((row) => row.previous_status)],
  );
}

function matchesRequestedTables(
  availableTableIds: readonly string[],
  requestedTableIds: readonly string[],
): boolean {
  const available = [...availableTableIds].sort();
  const requested = [...requestedTableIds].sort();
  return available.length === requested.length &&
    available.every((id, index) => id === requested[index]);
}

export async function createReservationHold(
  pool: Pool,
  request: HoldRequest,
): Promise<HoldResult> {
  const token = getIdempotentHoldToken(
    request.restaurantId,
    request.idempotencyKey,
  );
  const tokenHash = hashToken(token);
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
      [`${request.restaurantId}\u0000${request.idempotencyKey}`],
    );
    await expireHolds(client, request.restaurantId);

    const existing = await client.query<ExistingHold>(
      `SELECT id, status, starts_at, ends_at, party_size_current,
              hold_expires_at, allocation_mode
       FROM reservations
       WHERE restaurant_id = $1 AND idempotency_key = $2
       FOR UPDATE`,
      [request.restaurantId, request.idempotencyKey],
    );
    if (existing.rowCount) {
      const hold = existing.rows[0];
      if (
        hold.status !== "holding" ||
        !hold.hold_expires_at ||
        hold.hold_expires_at.getTime() <= Date.now() ||
        hold.allocation_mode !== request.allocationMode ||
        hold.party_size_current !== request.partySize
      ) {
        throw new ReservationError(
          409,
          "The idempotency key was already used for a different or expired hold",
        );
      }

      const currentTiming = await findAvailability(client, request);
      if (
        hold.starts_at.toISOString() !== currentTiming.timing.startsAt.toISOString() ||
        hold.ends_at.toISOString() !== currentTiming.timing.endsAt.toISOString()
      ) {
        throw new ReservationError(
          409,
          "The idempotency key was already used for a different or expired hold",
        );
      }

      const tableRows = await client.query<{ table_id: string }>(
        `SELECT table_id FROM reservation_tables WHERE reservation_id = $1`,
        [hold.id],
      );
      if (
        request.allocationMode === "guest_selected" &&
        !matchesRequestedTables(
          tableRows.rows.map((row) => row.table_id),
          request.tableIds ?? [],
        )
      ) {
        throw new ReservationError(
          409,
          "The idempotency key was already used for a different hold",
        );
      }
      await client.query("COMMIT");
      return {
        holdToken: token,
        expiresAt: hold.hold_expires_at,
        tableIds: tableRows.rows.map((row) => row.table_id).sort(),
        reused: true,
      };
    }

    const availability = await findAvailability(client, request);
    const requestedIds = request.tableIds ?? [];
    const selected =
      request.allocationMode === "guest_selected"
        ? availability.tableSets.find((candidate) =>
            matchesRequestedTables(candidate.tableIds, requestedIds),
          )
        : availability.tableSets[0];

    if (!selected) {
      throw new ReservationError(409, "The selected table is no longer available");
    }

    const lockedTables = await client.query<{ id: string }>(
      `SELECT id
       FROM restaurant_tables
       WHERE id = ANY($1::uuid[])
       ORDER BY id
       FOR UPDATE`,
      [selected.tableIds],
    );
    if (lockedTables.rowCount !== selected.tableIds.length) {
      throw new ReservationError(409, "A selected table is no longer available");
    }

    const currentAvailability = await findAvailability(client, request);
    const stillAvailable = currentAvailability.tableSets.some((candidate) =>
      matchesRequestedTables(candidate.tableIds, selected.tableIds),
    );
    if (!stillAvailable) {
      throw new ReservationError(409, "The selected table is no longer available");
    }

    const hold = await client.query<{
      id: string;
      hold_expires_at: Date;
    }>(
      `INSERT INTO reservations
         (restaurant_id, status, allocation_mode, party_size_initial,
          party_size_current, starts_at, ends_at, hold_expires_at,
          idempotency_key, hold_token_hash)
       VALUES (
         $1, 'holding', $2, $3, $3, $4, $5,
         now() + make_interval(mins => $6), $7, $8
       )
       RETURNING id, hold_expires_at`,
      [
        request.restaurantId,
        request.allocationMode,
        request.partySize,
        availability.timing.startsAt,
        availability.timing.endsAt,
        availability.timing.holdMinutes,
        request.idempotencyKey,
        tokenHash,
      ],
    );
    const reservationId = hold.rows[0].id;

    for (const tableId of selected.tableIds) {
      await client.query(
        `INSERT INTO reservation_tables
           (reservation_id, table_id, status, starts_at, ends_at)
         VALUES ($1, $2, 'holding', $3, $4)`,
        [
          reservationId,
          tableId,
          availability.timing.startsAt,
          availability.timing.endsAt,
        ],
      );
    }
    await client.query(
      `INSERT INTO reservation_events
         (reservation_id, actor_type, new_status, reason)
       VALUES ($1, 'guest', 'holding', 'Temporary table hold created')`,
      [reservationId],
    );

    await client.query("COMMIT");
    return {
      holdToken: token,
      expiresAt: hold.rows[0].hold_expires_at,
      tableIds: selected.tableIds,
      reused: false,
    };
  } catch (error) {
    await client.query("ROLLBACK");
    if (isPostgresConflict(error)) {
      throw new ReservationError(409, "The selected table is no longer available");
    }
    if (error instanceof AvailabilityError) {
      throw error;
    }
    if (error instanceof ReservationError) {
      throw error;
    }

    if (isUniqueViolation(error)) {
      const existing = await pool.query<ExistingHold>(
        `SELECT id, status, starts_at, ends_at, party_size_current,
                hold_expires_at, allocation_mode
         FROM reservations
         WHERE restaurant_id = $1 AND idempotency_key = $2`,
        [request.restaurantId, request.idempotencyKey],
      );
      const hold = existing.rows[0];
      if (hold?.status === "holding" && hold.hold_expires_at) {
        const currentTiming = await findAvailability(pool, request);
        const tableRows = await pool.query<{ table_id: string }>(
          "SELECT table_id FROM reservation_tables WHERE reservation_id = $1",
          [hold.id],
        );
        if (
          hold.allocation_mode !== request.allocationMode ||
          hold.party_size_current !== request.partySize ||
          hold.starts_at.toISOString() !== currentTiming.timing.startsAt.toISOString() ||
          hold.ends_at.toISOString() !== currentTiming.timing.endsAt.toISOString() ||
          (request.allocationMode === "guest_selected" &&
            !matchesRequestedTables(
              tableRows.rows.map((row) => row.table_id),
              request.tableIds ?? [],
            ))
        ) {
          throw new ReservationError(
            409,
            "The idempotency key was already used for a different hold",
          );
        }
        return {
          holdToken: token,
          expiresAt: hold.hold_expires_at,
          tableIds: tableRows.rows.map((row) => row.table_id).sort(),
          reused: true,
        };
      }
      throw new ReservationError(
        409,
        "The idempotency key was already used or its hold has expired",
      );
    }
    throw error;
  } finally {
    client.release();
  }
}

function isPostgresConflict(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "23P01"
  );
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "23505"
  );
}

export async function confirmReservation(
  pool: Pool,
  request: ConfirmationRequest,
): Promise<{ confirmationCode: string; status: ReservationStatus }> {
  const tokenHash = hashToken(request.holdToken);
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    const result = await client.query<{
      id: string;
      restaurant_id: string;
      status: ReservationStatus;
      hold_expires_at: Date | null;
      starts_at: Date;
      cancellation_notice_minutes: number | null;
      booking_terms_version: string;
      privacy_notice_version: string;
      confirmation_code_hash: string | null;
    }>(
      `SELECT r.id,
              r.restaurant_id,
              r.status,
              r.hold_expires_at,
              r.starts_at,
              ar.cancellation_notice_minutes,
              ar.booking_terms_version,
              ar.privacy_notice_version,
              r.confirmation_code_hash
       FROM reservations r
       JOIN availability_rules ar ON ar.restaurant_id = r.restaurant_id
       WHERE r.hold_token_hash = $1
       FOR UPDATE OF r`,
      [tokenHash],
    );
    const reservation = result.rows[0];
    if (!reservation) {
      throw new ReservationError(404, "Reservation hold not found");
    }

    if (
      reservation.status === "confirmed" &&
      reservation.confirmation_code_hash ===
        hashToken(createConfirmationCode(request.holdToken))
    ) {
      await client.query("COMMIT");
      return {
        confirmationCode: createConfirmationCode(request.holdToken),
        status: reservation.status,
      };
    }
    if (reservation.status !== "holding") {
      throw new ReservationError(409, "Reservation hold is no longer active");
    }
    if (
      !reservation.hold_expires_at ||
      reservation.hold_expires_at.getTime() <= Date.now()
    ) {
      await client.query(
        `UPDATE reservations SET status = 'expired', updated_at = now() WHERE id = $1`,
        [reservation.id],
      );
      await client.query(
        `UPDATE reservation_tables SET status = 'expired' WHERE reservation_id = $1`,
        [reservation.id],
      );
      await client.query(
        `INSERT INTO reservation_events
           (reservation_id, actor_type, previous_status, new_status, reason)
         VALUES ($1, 'system', 'holding', 'expired', 'Temporary hold expired')`,
        [reservation.id],
      );
      await client.query("COMMIT");
      throw new ReservationError(410, "Reservation hold has expired");
    }

    const guest = await client.query<{ id: string }>(
      `INSERT INTO guests (restaurant_id, name, phone, email)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [
        reservation.restaurant_id,
        request.guest.name.trim(),
        request.guest.phone.trim(),
        request.guest.email ?? null,
      ],
    );
    const confirmationCode = createConfirmationCode(request.holdToken);
    await client.query(
      `UPDATE reservations
       SET guest_id = $2,
           status = 'confirmed',
           confirmation_code_hash = $3,
           guest_notes = $5,
           hold_expires_at = NULL,
           cancellation_deadline = CASE
             WHEN $4::integer IS NULL THEN NULL
             ELSE starts_at - make_interval(mins => $4)
           END,
           updated_at = now()
       WHERE id = $1`,
      [
        reservation.id,
        guest.rows[0].id,
        hashToken(confirmationCode),
        reservation.cancellation_notice_minutes,
        request.guest.notes ?? null,
      ],
    );
    await client.query(
      `UPDATE reservation_tables SET status = 'confirmed' WHERE reservation_id = $1`,
      [reservation.id],
    );
    await client.query(
      `INSERT INTO payment_guarantees (reservation_id, status)
       VALUES ($1, 'not_required')`,
      [reservation.id],
    );
    await client.query(
      `INSERT INTO consent_records
         (reservation_id, consent_type, document_version, accepted)
       VALUES
         ($1, 'booking_terms', $2, true),
         ($1, 'privacy', $3, true),
         ($1, 'marketing', 'optional', $4)`,
      [
        reservation.id,
        reservation.booking_terms_version,
        reservation.privacy_notice_version,
        request.marketingConsent,
      ],
    );
    await client.query(
      `INSERT INTO reservation_events
         (reservation_id, actor_type, previous_status, new_status, reason)
       VALUES ($1, 'guest', 'holding', 'confirmed', 'Guest completed reservation')`,
      [reservation.id],
    );

    await client.query("COMMIT");
    return { confirmationCode, status: "confirmed" };
  } catch (error) {
    await client.query("ROLLBACK");
    if (error instanceof AvailabilityError || error instanceof ReservationError) {
      throw error;
    }
    throw error;
  } finally {
    client.release();
  }
}

export async function cancelReservation(
  pool: Pool,
  confirmationCode: string,
): Promise<{ status: ReservationStatus; late: boolean }> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query<{
      id: string;
      status: ReservationStatus;
      cancellation_deadline: Date | null;
    }>(
      `SELECT id, status, cancellation_deadline
       FROM reservations
       WHERE confirmation_code_hash = $1
       FOR UPDATE`,
      [hashConfirmationCode(confirmationCode)],
    );
    const reservation = result.rows[0];
    if (!reservation) {
      throw new ReservationError(404, "Reservation not found");
    }
    if (!canTransitionReservation(reservation.status, "cancelled_by_guest")) {
      throw new ReservationError(409, "Reservation cannot be cancelled");
    }

    const late =
      reservation.cancellation_deadline !== null &&
      reservation.cancellation_deadline.getTime() < Date.now();
    await client.query(
      `UPDATE reservations
       SET status = 'cancelled_by_guest', updated_at = now()
       WHERE id = $1`,
      [reservation.id],
    );
    await client.query(
      `UPDATE reservation_tables
       SET status = 'cancelled_by_guest'
       WHERE reservation_id = $1`,
      [reservation.id],
    );
    await client.query(
      `INSERT INTO reservation_events
         (reservation_id, actor_type, previous_status, new_status, reason, details)
       VALUES ($1, 'guest', $2, 'cancelled_by_guest', 'Guest requested cancellation', $3)`,
      [
        reservation.id,
        reservation.status,
        JSON.stringify({ late }),
      ],
    );
    await client.query("COMMIT");
    return { status: "cancelled_by_guest", late };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
