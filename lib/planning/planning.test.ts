import { describe, expect, it } from "vitest";
import {
  clientProblems,
  filterCount,
  overlap,
  pointerMinute,
  shiftedProposal,
  canPlan,
  type PlanningOrder,
  type PlanboardData,
} from "./model";
import { localDateTime, localToInstant, validDay, visibleWindow } from "./time";

const start = "2030-01-15T07:03:00.000Z",
  end = "2030-01-15T08:33:00.000Z";
const order: PlanningOrder = {
  id: "order",
  number: "WB-1",
  customerId: "c",
  objectId: "o",
  customer: "Klant",
  object: "Object",
  discipline: "Onderhoud",
  status: "planned",
  version: 1,
  start,
  end,
  actualStart: null,
  actualEnd: null,
  requestedDate: null,
  windowStart: null,
  windowEnd: null,
  windowKind: "unknown",
  requiredPersonnel: 2,
  durationMinutes: 90,
  instructions: "",
  priority: "normal",
  category: "planned",
  assignments: [
    {
      id: "a",
      personnelId: "p1",
      start,
      end,
      status: "planned",
      version: 1,
      qualifications: [],
      travel: [],
    },
    {
      id: "b",
      personnelId: "p2",
      start: "2030-01-15T07:18:00.000Z",
      end,
      status: "planned",
      version: 1,
      qualifications: [],
      travel: [],
    },
  ],
};
describe("minute planning and crew geometry", () => {
  it("08:03–09:33 moves to 10:07–11:37 without changing individual offsets", () => {
    const proposal = shiftedProposal(order, "2030-01-15T09:07:00.000Z");
    expect(proposal.end).toBe("2030-01-15T10:37:00.000Z");
    expect(proposal.assignments[1].start).toBe("2030-01-15T09:22:00.000Z");
    expect(order.start).toBe(start);
  });
  it.each([1.35, 2.3, 4.05])(
    "keeps exact minutes at zoom %s when names scroll out and the card is grabbed inside",
    (px) => {
      const minute = 187,
        left = 251,
        scroll = 396,
        grab = 37;
      const x = left + 230 + minute * px + grab - scroll;
      expect(pointerMinute(x, left, scroll, 230, px, grab)).toBe(minute);
    },
  );
  it("uses half-open occupation and rejects unsafe plan states", () => {
    expect(overlap(start, end, end, "2030-01-15T09:00Z")).toBe(false);
    expect(overlap(start, end, "2030-01-15T08:32Z", "2030-01-15T09:00Z")).toBe(
      true,
    );
    for (const status of [
      "in_progress",
      "completed",
      "cancelled",
      "returned",
      "invoice_ready",
    ])
      expect(canPlan({ ...order, status })).toBe(false);
    expect(canPlan({ ...order, status: "seen" })).toBe(true);
    expect(canPlan({ ...order, actualStart: start })).toBe(false);
  });
  it("counts only search and status, never the selected view", () => {
    expect(filterCount("", "")).toBe(0);
    expect(filterCount("  ", "")).toBe(0);
    expect(filterCount("klant", "")).toBe(1);
    expect(filterCount("klant", "planned")).toBe(2);
  });
  it("checks all crew against known absences and other executions", () => {
    const data = {
      people: [
        { id: "p1", name: "Een" },
        { id: "p2", name: "Twee" },
      ],
      availability: [{ personnelId: "p2", kind: "unavailable", start, end }],
      board: [{ ...order, id: "other" }],
    } as PlanboardData;
    const problems = clientProblems(shiftedProposal(order, start), data);
    expect(problems).toContain("Twee: niet beschikbaar.");
    expect(problems).toContain("Een: overlappende uitvoering.");
  });
});
describe("tenant dates and daylight saving", () => {
  it("does not turn midnight Amsterdam into a different execution date", () => {
    const instant = localToInstant("2030-07-15T00:03", "Europe/Amsterdam");
    expect(instant).toBe("2030-07-14T22:03:00.000Z");
    expect(localDateTime(instant, "Europe/Amsterdam")).toBe("2030-07-15T00:03");
  });
  it("rejects nonexistent spring minutes and explicitly resolves repeated autumn minutes", () => {
    expect(() =>
      localToInstant("2026-03-29T02:30", "Europe/Amsterdam"),
    ).toThrow("bestaat niet");
    expect(() =>
      localToInstant("2026-10-25T02:30", "Europe/Amsterdam"),
    ).toThrow("tweemaal");
    const early = localToInstant(
      "2026-10-25T02:30",
      "Europe/Amsterdam",
      "earlier",
    );
    const late = localToInstant(
      "2026-10-25T02:30",
      "Europe/Amsterdam",
      "later",
    );
    expect(Date.parse(late) - Date.parse(early)).toBe(3600000);
    expect(
      visibleWindow("2026-03-29", "01:00", "04:00", "Europe/Amsterdam").minutes,
    ).toBe(120);
    expect(
      visibleWindow("2026-10-25", "01:00", "04:00", "Europe/Amsterdam").minutes,
    ).toBe(240);
  });
  it("rejects impossible dates and empty/backwards visible windows", () => {
    expect(validDay("2026-02-31")).toBe(false);
    expect(validDay("2028-02-29")).toBe(true);
    expect(() =>
      visibleWindow("2026-10-01", "19:00", "07:00", "Europe/Amsterdam"),
    ).toThrow("Tot moet later");
    expect(() =>
      visibleWindow("2026-10-01", "", "19:00", "Europe/Amsterdam"),
    ).toThrow();
  });
});
