import { describe, expect, it } from "vitest";
import { isStaffLoginDestination, safeStaffNext } from "./staff-login";

describe("staff login destinations", () => {
  it.each(["/staff", "/staff/werkbon/123", "/staff?tab=planning", "/staff/instellingen#meldingen"])("accepts the staff boundary %s", (destination) => {
    expect(isStaffLoginDestination(destination)).toBe(true);
    expect(safeStaffNext(destination)).toBe(destination);
  });

  it.each([undefined, "/app", "/staffing", "//evil.invalid", "/staff/../../app", "/staff\\evil.invalid"])("fails closed for %j", (destination) => {
    expect(isStaffLoginDestination(destination)).toBe(false);
    expect(safeStaffNext(destination)).toBe("/staff");
  });
});
