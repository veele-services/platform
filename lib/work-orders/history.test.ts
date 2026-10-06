import { describe, expect, it } from "vitest";
import { historyActor, historyMessage } from "./history";
describe("readable work order history", () => {
  it("translates status and audit keys without surfacing machine event names", () => {
    expect(historyMessage("status.in_progress")).toBe("Werkzaamheden in uitvoering");
    expect(historyMessage("work_order.assignment_removed")).toBe("Medewerker van werkbon verwijderd");
    expect(historyMessage("new_internal.event_foo")).toBe("Werkbondossier bijgewerkt");
  });
  it("preserves real names and already translated activity and hides legacy identifiers", () => {
    expect(historyActor("Danny Goldenbelt")).toBe("Danny Goldenbelt");
    expect(historyActor("273cdb6f-df4b-4598-b5d2-4d07dc2968e6")).toBe("Medewerker");
    expect(historyActor(null)).toBe("Automatisch");
    expect(historyMessage("Checklist toegevoegd")).toBe("Checklist toegevoegd");
  });
});
