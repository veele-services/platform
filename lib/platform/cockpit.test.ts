import { describe, expect, it } from "vitest";
import { platformConfigurationSummary } from "./cockpit";

describe("platform configuration summary", () => {
  it("counts stored configuration statuses and pending invitations", () => {
    const summary = platformConfigurationSummary([
      { status: "active", staffCount: 2, invitationStatus: "pending", enabledServices: ["planning", "klantportaal"], templates: [] },
      { status: "suspended", staffCount: 0, invitationStatus: "failed", enabledServices: ["klantportaal"], templates: [] },
      { status: "active", staffCount: 3, invitationStatus: "active", enabledServices: ["planning"], templates: [] },
    ]);
    expect(summary).toEqual({ totalTenants: 3, activeTenants: 2, suspendedTenants: 1, activePersonnel: 5, pendingInvitations: 1, failedInvitations: 1, customerPortals: 1, customizedTemplates: 0 });
  });
  it("keeps an empty platform cockpit honest", () => {
    expect(Object.values(platformConfigurationSummary([]))).toEqual(Array(8).fill(0));
  });
});
