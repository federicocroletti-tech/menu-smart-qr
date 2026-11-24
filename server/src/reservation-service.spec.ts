import { afterEach, describe, expect, it } from "vitest";

import { createConfirmationCode } from "./reservation-service";

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
