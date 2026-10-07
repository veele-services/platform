import { describe, expect, it } from "vitest";
import { addStaffDays, assignmentInterval, staffDate, staffDayLabel, staffWeek, summarizeEntries } from "./time";

describe("staff time presentation", () => {
  it("labels the selected tenant date without a second conversion, including UTC+14", () => {
    const instant=new Date("2030-01-15T11:30:00Z");
    expect(staffDayLabel(staffDate(instant,"Pacific/Kiritimati"))).toBe("woensdag 16 januari 2030");
    expect(staffDayLabel(staffDate(instant,"Pacific/Honolulu"))).toBe("dinsdag 15 januari 2030");
  });
  it("uses the assignment schedule before the employee starts", () => {
    expect(assignmentInterval({ projected_start_at: "2026-10-04T08:00:00Z", projected_end_at: "2026-10-04T10:00:00Z" }, "Europe/Amsterdam", new Date("2026-10-04T09:00:00Z"))).toMatchObject({ start: "10:00", end: "12:00", source: "planned", running: false });
  });

  it("uses only the employee actual interval after starting and preserves it while paused", () => {
    expect(assignmentInterval({ projected_start_at: "2026-10-04T08:00:00Z", projected_end_at: "2026-10-04T10:00:00Z", actual_start_at: "2026-10-04T08:17:00Z", actual_end_at: null, paused_at: "2026-10-04T09:00:00Z" }, "Europe/Amsterdam", new Date("2026-10-04T09:30:00Z"))).toMatchObject({ start: "10:17", end: "nu", source: "actual", running: true, paused: true });
  });

  it("keeps date arithmetic stable across the daylight-saving boundary", () => {
    expect(addStaffDays("2026-10-25", 1)).toBe("2026-10-26");
    expect(staffWeek("2026-10-25")).toEqual(["2026-10-19", "2026-10-20", "2026-10-21", "2026-10-22", "2026-10-23", "2026-10-24", "2026-10-25"]);
    expect(staffDate(new Date("2026-10-24T22:30:00Z"), "Europe/Amsterdam")).toBe("2026-10-25");
  });

  it("separates paid work, travel, break and other time", () => {
    const entries = [
      { kind: "work", starts_at: "2026-10-04T08:00:00Z", ends_at: "2026-10-04T09:00:00Z" },
      { kind: "travel", starts_at: "2026-10-04T09:00:00Z", ends_at: "2026-10-04T09:30:00Z" },
      { kind: "break", starts_at: "2026-10-04T09:30:00Z", ends_at: "2026-10-04T09:45:00Z" },
      { kind: "correction", starts_at: "2026-10-04T09:45:00Z", ends_at: "2026-10-04T10:00:00Z" },
    ];
    expect(summarizeEntries(entries)).toEqual({ work: 60, travel: 30, break: 15, other: 15, paid: 105 });
  });
});
