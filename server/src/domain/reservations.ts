export const reservationStatuses = [
  "draft",
  "holding",
  "awaiting_guarantee",
  "confirmed",
  "seated",
  "completed",
  "cancelled_by_guest",
  "cancelled_by_restaurant",
  "no_show",
  "expired",
] as const;

export type ReservationStatus = (typeof reservationStatuses)[number];

export interface TableCapacity {
  id: string;
  minCapacity: number;
  standardCapacity: number;
  maxCapacity: number;
  onlineBookable: boolean;
}

export interface TableCombination {
  id: string;
  tableIds: string[];
}

export interface Occupancy {
  tableId: string;
  startsAt: Date;
  endsAt: Date;
  status: ReservationStatus | "blocked";
  holdExpiresAt?: Date | null;
}

export interface AvailableTableSet {
  id: string;
  tableIds: string[];
  minCapacity: number;
  standardCapacity: number;
  maxCapacity: number;
}

const activeStatuses = new Set<ReservationStatus>([
  "holding",
  "awaiting_guarantee",
  "confirmed",
  "seated",
]);

const transitions: Record<ReservationStatus, readonly ReservationStatus[]> = {
  draft: ["holding", "cancelled_by_guest", "expired"],
  holding: ["awaiting_guarantee", "confirmed", "cancelled_by_guest", "expired"],
  awaiting_guarantee: ["confirmed", "cancelled_by_guest", "expired"],
  confirmed: [
    "seated",
    "cancelled_by_guest",
    "cancelled_by_restaurant",
    "no_show",
  ],
  seated: ["completed"],
  completed: [],
  cancelled_by_guest: [],
  cancelled_by_restaurant: [],
  no_show: [],
  expired: [],
};

function isActiveOccupancy(occupancy: Occupancy, now: Date): boolean {
  if (occupancy.status === "blocked") {
    return true;
  }

  if (!activeStatuses.has(occupancy.status)) {
    return false;
  }

  if (
    occupancy.status === "holding" ||
    occupancy.status === "awaiting_guarantee"
  ) {
    return Boolean(
      occupancy.holdExpiresAt && occupancy.holdExpiresAt.getTime() > now.getTime(),
    );
  }

  return true;
}

function overlaps(
  firstStart: Date,
  firstEnd: Date,
  secondStart: Date,
  secondEnd: Date,
): boolean {
  return firstStart.getTime() < secondEnd.getTime() &&
    secondStart.getTime() < firstEnd.getTime();
}

export function isPartyWithinCapacity(
  partySize: number,
  minCapacity: number,
  maxCapacity: number,
): boolean {
  return Number.isInteger(partySize) &&
    partySize >= minCapacity &&
    partySize <= maxCapacity;
}

export function canTransitionReservation(
  current: ReservationStatus,
  next: ReservationStatus,
): boolean {
  return transitions[current].includes(next);
}

export function findAvailableTableSets(
  tables: readonly TableCapacity[],
  combinations: readonly TableCombination[],
  occupancies: readonly Occupancy[],
  partySize: number,
  startsAt: Date,
  endsAt: Date,
  now: Date,
): AvailableTableSet[] {
  const tableById = new Map(tables.map((table) => [table.id, table]));
  const unavailableIds = new Set(
    occupancies
      .filter(
        (occupancy) =>
          isActiveOccupancy(occupancy, now) &&
          overlaps(startsAt, endsAt, occupancy.startsAt, occupancy.endsAt),
      )
      .map((occupancy) => occupancy.tableId),
  );

  const candidates: AvailableTableSet[] = tables
    .filter((table) => table.onlineBookable && !unavailableIds.has(table.id))
    .map((table) => ({
      id: table.id,
      tableIds: [table.id],
      minCapacity: table.minCapacity,
      standardCapacity: table.standardCapacity,
      maxCapacity: table.maxCapacity,
    }));

  for (const combination of combinations) {
    const members = combination.tableIds.map((id) => tableById.get(id));
    if (
      members.length < 2 ||
      members.some(
        (table) =>
          !table ||
          !table.onlineBookable ||
          unavailableIds.has(table.id),
      )
    ) {
      continue;
    }

    candidates.push({
      id: combination.id,
      tableIds: [...combination.tableIds].sort(),
      minCapacity: members.reduce(
        (total, table) => total + (table?.minCapacity ?? 0),
        0,
      ),
      standardCapacity: members.reduce(
        (total, table) => total + (table?.standardCapacity ?? 0),
        0,
      ),
      maxCapacity: members.reduce(
        (total, table) => total + (table?.maxCapacity ?? 0),
        0,
      ),
    });
  }

  return candidates
    .filter((candidate) =>
      isPartyWithinCapacity(
        partySize,
        candidate.minCapacity,
        candidate.maxCapacity,
      ),
    )
    .sort(
      (first, second) =>
        first.standardCapacity - second.standardCapacity ||
        first.tableIds.length - second.tableIds.length ||
        first.id.localeCompare(second.id),
    );
}
