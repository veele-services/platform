import { describe, expect, it } from "vitest";
import { resolveStaffTimeCorrection, staffTimeCorrectionInputSchema } from "./time-correction";

const base = {
  timeEntryId: "11111111-1111-4111-8111-111111111111",
  version: 4,
  idempotencyKey: "22222222-2222-4222-8222-222222222222",
  reason: "De timer is te laat gestopt.",
};

describe("staff time correction input", () => {
  it("keeps a duration request explicit without inventing changed source times", () => {
    expect(resolveStaffTimeCorrection({ ...base, mode: "duration", requestedDurationMinutes: 75 }, "Europe/Amsterdam")).toMatchObject({
      mode: "duration",
      requestedDurationMinutes: 75,
      idempotencyKey: base.idempotencyKey,
      requestedStartsAt: null,
      requestedEndsAt: null,
    });
  });

  it("converts requested local start and end through the tenant timezone", () => {
    expect(resolveStaffTimeCorrection({
      ...base,
      mode: "times",
      requestedStartLocal: "2030-07-15T08:15",
      requestedEndLocal: "2030-07-15T09:45",
    }, "Europe/Amsterdam")).toMatchObject({
      requestedStartsAt: "2030-07-15T06:15:00.000Z",
      requestedEndsAt: "2030-07-15T07:45:00.000Z",
      requestedDurationMinutes: null,
    });
  });

  it("rejects backwards, excessive and underspecified corrections", () => {
    expect(() => resolveStaffTimeCorrection({
      ...base,
      mode: "times",
      requestedStartLocal: "2030-07-15T10:00",
      requestedEndLocal: "2030-07-15T09:00",
    }, "Europe/Amsterdam")).toThrow(/1 tot en met 600/);
    expect(staffTimeCorrectionInputSchema.safeParse({ ...base, reason: " ", mode: "duration", requestedDurationMinutes: 60 }).success).toBe(false);
    expect(staffTimeCorrectionInputSchema.safeParse({ ...base, mode: "duration", requestedDurationMinutes: 601 }).success).toBe(false);
  });

  it("fails closed for nonexistent and ambiguous tenant-local minutes", () => {
    expect(() => resolveStaffTimeCorrection({
      ...base,
      mode: "times",
      requestedStartLocal: "2026-03-29T02:30",
      requestedEndLocal: "2026-03-29T03:30",
    }, "Europe/Amsterdam")).toThrow(/bestaat niet/);
    expect(() => resolveStaffTimeCorrection({
      ...base,
      mode: "times",
      requestedStartLocal: "2026-10-25T02:15",
      requestedEndLocal: "2026-10-25T03:15",
    }, "Europe/Amsterdam")).toThrow(/tweemaal/);
  });
});
