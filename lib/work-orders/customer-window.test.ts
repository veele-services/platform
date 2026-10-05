import { describe, expect, it } from "vitest";
import { localDateTime } from "@/lib/planning/time";
import { customerTimeWindows, customerWindowChoice, twoHourCustomerWindow } from "./customer-window";

describe("customer arrival windows", () => {
  it("offers consecutive two-hour blocks for the whole day", () => {
    expect(customerTimeWindows).toHaveLength(12);
    expect(customerTimeWindows[4].label).toBe("08:00 – 10:00");
    for (const window of customerTimeWindows) {
      const saved = twoHourCustomerWindow("2033-10-05", window.start, "Europe/Amsterdam");
      expect(Date.parse(saved.windowEnd) - Date.parse(saved.windowStart)).toBe(120 * 60_000);
      expect(saved.windowKind).toBe("arrival");
    }
  });
  it.each(["2026-03-29", "2026-10-25"])("keeps normal arrival blocks on clock-change day %s", day => {
    const saved = twoHourCustomerWindow(day, "08:00", "Europe/Amsterdam");
    expect(localDateTime(saved.windowStart, "Europe/Amsterdam")).toBe(`${day}T08:00`);
    expect(localDateTime(saved.windowEnd, "Europe/Amsterdam")).toBe(`${day}T10:00`);
  });
  it("moves the last block to midnight of the next year", () => {
    const saved = twoHourCustomerWindow("2026-12-31", "22:00", "Europe/Amsterdam");
    expect(localDateTime(saved.windowEnd, "Europe/Amsterdam")).toBe("2027-01-01T00:00");
    expect(customerWindowChoice(saved.windowStart, saved.windowEnd, "Europe/Amsterdam")).toBe("22:00");
  });
  it("uses the tenant timezone, including nonwhole-hour offsets", () => {
    expect(twoHourCustomerWindow("2026-10-05", "08:00", "Asia/Kathmandu")).toEqual({ windowStart: "2026-10-05T02:15:00.000Z", windowEnd: "2026-10-05T04:15:00.000Z", windowKind: "arrival" });
  });
  it.each(["", "2026-02-30", "not-a-day"])("rejects invalid day %s", day => {
    expect(() => twoHourCustomerWindow(day, "08:00", "Europe/Amsterdam")).toThrow("geldige gewenste dag");
  });
  it.each(["", "09:00", "08:30", "24:00"])("rejects a nonblock time %s", start => {
    expect(() => twoHourCustomerWindow("2026-10-05", start, "Europe/Amsterdam")).toThrow("tijdsvenster van twee uur");
  });
  it.each(["2026-03-29", "2026-10-25"])("rejects ambiguous or nonexistent block boundaries on %s", day => {
    expect(() => twoHourCustomerWindow(day, "02:00", "Europe/Amsterdam")).toThrow(/wintertijd|zomertijd/);
  });
  it("retains existing agreements that are not exactly one of the two-hour blocks", () => {
    expect(customerWindowChoice("2026-10-05T06:00:00Z", "2026-10-05T08:00:00Z", "Europe/Amsterdam")).toBe("08:00");
    for (const [start, end] of [["2026-10-05T06:30:00Z", "2026-10-05T08:30:00Z"], ["2026-10-05T06:00:00Z", "2026-10-05T09:00:00Z"], ["2026-10-05T06:00:01Z", "2026-10-05T08:00:01Z"]]) {
      expect(customerWindowChoice(start, end, "Europe/Amsterdam")).toBe("existing");
    }
    expect(customerWindowChoice(null, null, "Europe/Amsterdam")).toBe("");
  });
});
