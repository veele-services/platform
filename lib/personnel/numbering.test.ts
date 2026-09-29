import { describe, expect, it } from "vitest";
import { formatPersonnelNumber, personnelNumberInputSchema, personnelNumberSettingsSchema } from "./numbering";

describe("personnel numbering", () => {
  it("formats prefixes and minimum four digits without truncating large numbers", () => {
    expect(formatPersonnelNumber("P-", 1)).toBe("P-0001");
    expect(formatPersonnelNumber("MW-", 100)).toBe("MW-0100");
    expect(formatPersonnelNumber("", 10_001)).toBe("10001");
  });
  it("validates and normalizes numbering settings", () => {
    expect(personnelNumberSettingsSchema.parse({ prefix: " MW- ", startNumber: "100" })).toEqual({ prefix: "MW-", startNumber: 100 });
    expect(personnelNumberSettingsSchema.safeParse({ prefix: "", startNumber: 1 }).success).toBe(true);
    for (const prefix of ["/", "<script>", "a".repeat(21), "A B"]) expect(personnelNumberSettingsSchema.safeParse({ prefix, startNumber: 1 }).success).toBe(false);
    for (const startNumber of ["", 0, -1, 1.5, 1_000_000_000]) expect(personnelNumberSettingsSchema.safeParse({ prefix: "P-", startNumber }).success).toBe(false);
  });
  it("only permits empty numbers when explicitly using automatic numbering", () => {
    expect(personnelNumberInputSchema.parse({ employeeNumberMode: "automatic", employeeNumber: "" }).employeeNumberMode).toBe("automatic");
    expect(personnelNumberInputSchema.safeParse({ employeeNumber: "" }).success).toBe(false);
    expect(personnelNumberInputSchema.safeParse({ employeeNumberMode: "manual", employeeNumber: " " }).success).toBe(false);
    expect(personnelNumberInputSchema.parse({ employeeNumber: " CUSTOM-12 " }).employeeNumber).toBe("CUSTOM-12");
    expect(personnelNumberInputSchema.safeParse({ employeeNumberMode: "invalid" }).success).toBe(false);
  });
});
