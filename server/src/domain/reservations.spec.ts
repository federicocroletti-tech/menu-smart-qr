import { describe, expect, it } from "vitest";

import {
  canTransitionReservation,
  findAvailableTableSets,
  isPartyWithinCapacity,
  type Occupancy,
  type TableCapacity,
} from "./reservations";

const tables: TableCapacity[] = [
  {
    id: "small",
    minCapacity: 1,
    standardCapacity: 2,
    maxCapacity: 2,
    onlineBookable: true,
  },
  {
    id: "large",
    minCapacity: 2,
    standardCapacity: 4,
    maxCapacity: 6,
    onlineBookable: true,
  },
  {
    id: "staff-only",
    minCapacity: 1,
    standardCapacity: 2,
    maxCapacity: 4,
    onlineBookable: false,
  },
];

const start = new Date("2030-01-01T19:00:00.000Z");
const end = new Date("2030-01-01T20:30:00.000Z");
const now = new Date("2030-01-01T18:00:00.000Z");

describe("reservation domain", () => {
  it("checks integer party sizes against minimum and maximum capacity", () => {
    expect(isPartyWithinCapacity(2, 1, 4)).toBe(true);
    expect(isPartyWithinCapacity(5, 1, 4)).toBe(false);
    expect(isPartyWithinCapacity(2.5, 1, 4)).toBe(false);
  });

  it("allows only explicitly defined reservation state transitions", () => {
    expect(canTransitionReservation("holding", "confirmed")).toBe(true);
    expect(canTransitionReservation("confirmed", "completed")).toBe(false);
    expect(canTransitionReservation("seated", "completed")).toBe(true);
  });

  it("filters occupied and non-online tables and returns fitting tables first", () => {
    const occupancy: Occupancy[] = [
      {
        tableId: "small",
        startsAt: new Date("2030-01-01T19:30:00.000Z"),
        endsAt: new Date("2030-01-01T20:00:00.000Z"),
        status: "confirmed",
      },
    ];

    expect(
      findAvailableTableSets(
        tables,
        [],
        occupancy,
        2,
        start,
        end,
        now,
      ).map((candidate) => candidate.id),
    ).toEqual(["large"]);
  });

  it("treats an expired hold as free but keeps an active hold reserved", () => {
    const expiredHold: Occupancy = {
      tableId: "small",
      startsAt: start,
      endsAt: end,
      status: "holding",
      holdExpiresAt: new Date("2030-01-01T17:59:00.000Z"),
    };
    const activeHold = {
      ...expiredHold,
      holdExpiresAt: new Date("2030-01-01T18:01:00.000Z"),
    };

    expect(
      findAvailableTableSets(
        tables,
        [],
        [expiredHold],
        2,
        start,
        end,
        now,
      ).map((candidate) => candidate.id),
    ).toContain("small");
    expect(
      findAvailableTableSets(
        tables,
        [],
        [activeHold],
        2,
        start,
        end,
        now,
      ).map((candidate) => candidate.id),
    ).not.toContain("small");
  });

  it("offers a compatible combination only when every member is free", () => {
    const combinations = [{ id: "combined", tableIds: ["small", "large"] }];

    expect(
      findAvailableTableSets(
        tables,
        combinations,
        [],
        8,
        start,
        end,
        now,
      ).map((candidate) => candidate.id),
    ).toContain("combined");
    expect(
      findAvailableTableSets(
        tables,
        combinations,
        [
          {
            tableId: "large",
            startsAt: start,
            endsAt: end,
            status: "confirmed",
          },
        ],
        8,
        start,
        end,
        now,
      ).map((candidate) => candidate.id),
    ).not.toContain("combined");
  });
});
