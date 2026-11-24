import type { Pool, PoolClient, QueryResultRow } from "pg";

import {
  findAvailableTableSets,
  type Occupancy,
  type TableCapacity,
  type TableCombination,
} from "./domain/reservations";

type Queryable = Pick<Pool, "query"> | Pick<PoolClient, "query">;

interface ScheduleRow extends QueryResultRow {
  starts_at: Date;
  ends_at: Date;
  duration_minutes: number;
  cleanup_minutes: number;
  hold_minutes: number;
  maximum_party_size: number;
  booking_terms_version: string;
  privacy_notice_version: string;
  cancellation_notice_minutes: number | null;
}

interface TableRow extends QueryResultRow {
  id: string;
  min_capacity: number;
  standard_capacity: number;
  max_capacity: number;
  online_bookable: boolean;
}

interface OccupancyRow extends QueryResultRow {
  table_id: string;
  starts_at: Date;
  ends_at: Date;
  status: Occupancy["status"];
  hold_expires_at: Date | null;
}

interface CombinationRow extends QueryResultRow {
  id: string;
  table_ids: string[];
}

export interface AvailabilityRequest {
  restaurantId: string;
  date: string;
  time: string;
  partySize: number;
}

export interface ReservationTiming {
  startsAt: Date;
  endsAt: Date;
  durationMinutes: number;
  cleanupMinutes: number;
  holdMinutes: number;
  maximumPartySize: number;
  bookingTermsVersion: string;
  privacyNoticeVersion: string;
  cancellationNoticeMinutes: number | null;
}

export interface AvailabilityResult {
  timing: ReservationTiming;
  tableSets: ReturnType<typeof findAvailableTableSets>;
}

export class AvailabilityError extends Error {
  constructor(
    readonly statusCode: number,
    message: string,
  ) {
    super(message);
  }
}

export async function resolveReservationTiming(
  queryable: Queryable,
  request: AvailabilityRequest,
): Promise<ReservationTiming> {
  const result = await queryable.query<ScheduleRow>(
    `SELECT
       (($2::date + $3::time) AT TIME ZONE r.time_zone) AS starts_at,
       (($2::date + $3::time) AT TIME ZONE r.time_zone)
         + make_interval(mins => s.duration_minutes + s.cleanup_minutes) AS ends_at,
       s.duration_minutes,
       s.cleanup_minutes,
       ar.hold_minutes,
       ar.maximum_party_size,
       ar.booking_terms_version,
       ar.privacy_notice_version,
       ar.cancellation_notice_minutes
     FROM restaurants r
     JOIN availability_rules ar ON ar.restaurant_id = r.id
     JOIN service_shifts s
       ON s.restaurant_id = r.id
       AND s.day_of_week = EXTRACT(DOW FROM $2::date)::smallint
       AND s.enabled
       AND $3::time >= s.starts_at
       AND $3::time < s.ends_at
       AND make_interval(mins => s.duration_minutes + s.cleanup_minutes)
         <= (s.ends_at - $3::time)
       AND mod(
         extract(epoch FROM ($3::time - s.starts_at)) / 60,
         s.slot_interval_minutes
       ) = 0
     WHERE r.id = $1
       AND ar.online_booking_enabled
       AND $4::smallint <= ar.maximum_party_size
       AND (($2::date + $3::time) AT TIME ZONE r.time_zone) > now()
       AND EXISTS (
         SELECT 1
         FROM opening_hours oh
         WHERE oh.restaurant_id = r.id
           AND oh.day_of_week = s.day_of_week
           AND NOT oh.closed
           AND $3::time >= oh.opens_at
           AND $3::time < oh.closes_at
       )
       AND NOT EXISTS (
         SELECT 1
         FROM closures c
         WHERE c.restaurant_id = r.id
           AND c.dining_area_id IS NULL
           AND c.table_id IS NULL
           AND c.starts_at < (
             (($2::date + $3::time) AT TIME ZONE r.time_zone)
               + make_interval(mins => s.duration_minutes + s.cleanup_minutes)
           )
           AND c.ends_at > (($2::date + $3::time) AT TIME ZONE r.time_zone)
       )
     LIMIT 1`,
    [request.restaurantId, request.date, request.time, request.partySize],
  );

  const schedule = result.rows[0];
  if (!schedule) {
    throw new AvailabilityError(404, "No service is available at that time");
  }
  if (
    !Number.isInteger(request.partySize) ||
    request.partySize < 1 ||
    request.partySize > schedule.maximum_party_size
  ) {
    throw new AvailabilityError(400, "Party size is outside the allowed range");
  }

  return {
    startsAt: schedule.starts_at,
    endsAt: schedule.ends_at,
    durationMinutes: schedule.duration_minutes,
    cleanupMinutes: schedule.cleanup_minutes,
    holdMinutes: schedule.hold_minutes,
    maximumPartySize: schedule.maximum_party_size,
    bookingTermsVersion: schedule.booking_terms_version,
    privacyNoticeVersion: schedule.privacy_notice_version,
    cancellationNoticeMinutes: schedule.cancellation_notice_minutes,
  };
}

export async function findAvailability(
  queryable: Queryable,
  request: AvailabilityRequest,
  now: Date = new Date(),
): Promise<AvailabilityResult> {
  const timing = await resolveReservationTiming(queryable, request);
  const tablesResult = await queryable.query<TableRow>(
    `SELECT t.id,
            t.min_capacity,
            t.standard_capacity,
            t.max_capacity,
            t.online_bookable
     FROM restaurant_tables t
     JOIN dining_areas a ON a.id = t.dining_area_id
     WHERE a.restaurant_id = $1
       AND a.online_bookable
       AND t.active
       AND t.online_bookable
       AND NOT EXISTS (
         SELECT 1
         FROM closures c
         WHERE c.restaurant_id = $1
           AND (
             c.dining_area_id = a.id
             OR c.table_id = t.id
           )
           AND c.starts_at < $3
           AND c.ends_at > $2
       )`,
    [request.restaurantId, timing.startsAt, timing.endsAt],
  );

  const tableIds = tablesResult.rows.map((table) => table.id);
  if (tableIds.length === 0) {
    return { timing, tableSets: [] };
  }

  const [occupanciesResult, combinationsResult] = await Promise.all([
    queryable.query<OccupancyRow>(
      `SELECT rt.table_id,
              rt.starts_at,
              rt.ends_at,
              rt.status::text AS status,
              r.hold_expires_at
       FROM reservation_tables rt
       JOIN reservations r ON r.id = rt.reservation_id
       WHERE rt.table_id = ANY($1::uuid[])
         AND rt.starts_at < $3
         AND rt.ends_at > $2
         AND r.status IN ('holding', 'awaiting_guarantee', 'confirmed', 'seated')
         AND (
           r.status NOT IN ('holding', 'awaiting_guarantee')
           OR r.hold_expires_at > now()
         )
       UNION ALL
       SELECT b.table_id,
              b.starts_at,
              b.ends_at,
              'blocked' AS status,
              NULL::timestamptz AS hold_expires_at
       FROM table_blocks b
       WHERE b.table_id = ANY($1::uuid[])
         AND b.starts_at < $3
         AND b.ends_at > $2`,
      [tableIds, timing.startsAt, timing.endsAt],
    ),
    queryable.query<CombinationRow>(
      `SELECT c.id,
              array_agg(m.table_id::text ORDER BY m.table_id) AS table_ids
       FROM table_combinations c
       JOIN dining_areas a ON a.id = c.dining_area_id
       JOIN table_combination_members m ON m.combination_id = c.id
       JOIN restaurant_tables t ON t.id = m.table_id
       WHERE a.restaurant_id = $1
         AND t.dining_area_id = a.id
       GROUP BY c.id`,
      [request.restaurantId],
    ),
  ]);

  const tables: TableCapacity[] = tablesResult.rows.map((table) => ({
    id: table.id,
    minCapacity: table.min_capacity,
    standardCapacity: table.standard_capacity,
    maxCapacity: table.max_capacity,
    onlineBookable: table.online_bookable,
  }));
  const combinations: TableCombination[] = combinationsResult.rows.map(
    (combination) => ({
      id: combination.id,
      tableIds: combination.table_ids,
    }),
  );
  const occupancies: Occupancy[] = occupanciesResult.rows.map((occupancy) => ({
    tableId: occupancy.table_id,
    startsAt: occupancy.starts_at,
    endsAt: occupancy.ends_at,
    status: occupancy.status,
    holdExpiresAt: occupancy.hold_expires_at,
  }));

  return {
    timing,
    tableSets: findAvailableTableSets(
      tables,
      combinations,
      occupancies,
      request.partySize,
      timing.startsAt,
      timing.endsAt,
      now,
    ),
  };
}
