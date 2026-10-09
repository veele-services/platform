import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

describe("staff route boundaries", () => {
  it("shows profile recovery before loading profile-bound notification preferences", () => {
    const page = source("app/staff/page.tsx");
    expect(page.indexOf("if (!personnel) return <StaffProfileRecovery/>")).toBeGreaterThan(-1);
    expect(page.indexOf("if (!personnel) return <StaffProfileRecovery/>")).toBeLessThan(
      page.indexOf('getNotificationPreferences("staff")'),
    );
  });

  it("keeps ticket and notification shells independent from staff_workspace", () => {
    const shell = source("components/fieldgrid/staff/route-shell.tsx");
    expect(shell).not.toContain("getWorkspaceData");
    expect(shell).not.toContain("staff_workspace");
  });
});
