import { describe, expect, it } from "vitest";
import { ticketAssigneeLabel, ticketContextLabel, ticketDate } from "../../components/fieldgrid/tickets/presentation";

describe("ticket presentation", () => {
  it("shows work-order and object context instead of the internal default module", () => {
    expect(ticketContextLabel({ route: "internal", module: "overig", context: [
      { kind: "work_order", id: "order", label: "WB-42" },
      { kind: "object", id: "object", label: "Werkplaats" },
      { kind: "personnel", id: "person", label: "Melder" },
    ] })).toBe("WB-42 · Werkplaats");
    expect(ticketContextLabel({ route: "internal", module: "overig", context: [] })).toBe("Geen context gekoppeld");
  });
  it("shows the selected module for support tickets", () => {
    expect(ticketContextLabel({ route: "platform_support", module: "werkbonnen", context: [] })).toBe("werkbonnen");
  });
  it("does not label a group-routed ticket as unassigned", () => {
    expect(ticketAssigneeLabel({ assignee: null, assignedGroupName: "Technische intake" })).toBe("Technische intake");
    expect(ticketAssigneeLabel({ assignee: { id: "person", label: "Ada" }, assignedGroupName: "Technische intake" })).toBe("Ada · Technische intake");
    expect(ticketAssigneeLabel({ assignee: null, assignedGroupName: null })).toBe("Niet toegewezen");
  });
  it("renders an absolute deadline in its configured timezone, including DST", () => {
    expect(ticketDate("2026-09-30T12:00:00Z", "America/New_York")).toContain("08:00");
    expect(ticketDate("2026-09-30T12:00:00Z", "Europe/Amsterdam")).toContain("14:00");
    expect(ticketDate("2026-03-29T00:30:00Z", "Europe/Amsterdam")).toContain("01:30");
    expect(ticketDate("2026-03-29T01:30:00Z", "Europe/Amsterdam")).toContain("03:30");
  });
});
