import { describe, expect, it } from "vitest";
import { projectTimeline } from "./schedule";

describe("servergestuurde planning", () => {
  it("projecteert 10:05–10:35 en schuift de vervolgplanning in totaal negen minuten", () => {
    const result = projectTimeline({
      plannedStart: new Date("2026-09-28T08:00:00.000Z"),
      plannedEnd: new Date("2026-09-28T08:30:00.000Z"),
      actualStart: new Date("2026-09-28T08:05:00.000Z"),
      actualEnd: new Date("2026-09-28T08:39:00.000Z"),
    });
    expect(result.projectedEndAfterStart.toISOString()).toBe("2026-09-28T08:35:00.000Z");
    expect(result.startShiftMinutes).toBe(5);
    expect(result.completionShiftMinutes).toBe(4);
    expect(result.totalShiftMinutes).toBe(9);
  });
});
