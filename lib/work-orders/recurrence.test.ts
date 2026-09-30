import { describe, expect, it } from "vitest";
import { matchesRecurrence, recurrencePreview, recurrenceSchema } from "./recurrence";
import { availableScope } from "./lineage";

const rule = (overrides: Record<string, unknown> = {}) => recurrenceSchema.parse({ startsOn: "2026-01-01", frequency: "daily", startsAt: "08:00", endsAt: "10:00", ...overrides });

describe("work-order scope and recurrence", () => {
  it("retains only unexecuted, unwithdrawn, untransferred scope", () => {
    expect(availableScope({ planned: 10, executed: 3, transferred: 4, withdrawn: 1 })).toBe(2);
    expect(availableScope({ planned: 0.3, executed: 0.1, transferred: 0.2, withdrawn: 0 })).toBe(0);
  });
  it("anchors week intervals to the start week and chosen weekdays", () => {
    const r = rule({ startsOn: "2026-09-30", frequency: "weekly", interval: 2, weekdays: [1, 3] });
    expect(matchesRecurrence(r, "2026-09-28")).toBe(false);
    expect(matchesRecurrence(r, "2026-09-30")).toBe(true);
    expect(matchesRecurrence(r, "2026-10-05")).toBe(false);
    expect(matchesRecurrence(r, "2026-10-12")).toBe(true);
  });
  it("skips missing month dates without moving the following occurrence", () => {
    const r = rule({ frequency: "monthly", monthDay: 31 });
    expect(matchesRecurrence(r, "2026-01-31")).toBe(true);
    expect(matchesRecurrence(r, "2026-02-28")).toBe(false);
    expect(matchesRecurrence(r, "2026-03-31")).toBe(true);
  });
  it("recognizes last and fifth weekdays and includes the end date", () => {
    const r = rule({ frequency: "monthly", monthlyMode: "weekday", monthPosition: -1, monthWeekday: 1, endsOn: "2026-03-30" });
    expect(matchesRecurrence(r, "2026-03-23")).toBe(false);
    expect(matchesRecurrence(r, "2026-03-30")).toBe(true);
    expect(matchesRecurrence(r, "2026-04-27")).toBe(false);
  });
  it("preserves a DST gap as a skipped occurrence and chooses the later autumn time", () => {
    const r = rule({ startsAt: "02:15", endsAt: "03:30" });
    const spring = recurrencePreview(r, "2026-03-29", "Europe/Amsterdam", 1)[0];
    expect(spring).toMatchObject({ day: "2026-03-29", skipped: true });
    const autumn = recurrencePreview(r, "2026-10-25", "Europe/Amsterdam", 1)[0];
    expect(autumn.start).toBe("2026-10-25T01:15:00.000Z");
  });
  it("bounds generation and produces stable daily identities", () => {
    const first = recurrencePreview(rule(), "2026-09-30", "Europe/Amsterdam");
    expect(first).toHaveLength(42);
    expect(recurrencePreview(rule(), "2026-09-30", "Europe/Amsterdam")).toEqual(first);
    expect(() => recurrencePreview(rule(), "2026-09-30", "Europe/Amsterdam", 27)).toThrow();
  });
});
