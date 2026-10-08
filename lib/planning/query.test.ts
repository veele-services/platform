import { describe, expect, it } from "vitest";
import { initialPlanningQuery, samePlanningQuery } from "./model";

describe("planboard snapshot reuse", () => {
  it("reuses the server snapshot when stored preferences only affect its appearance", () => {
    const serverQuery = initialPlanningQuery("2031-03-04");
    expect(samePlanningQuery(serverQuery, { ...serverQuery })).toBe(true);
  });

  it.each([
    { day: "2031-03-05" }, { view: "all" as const }, { search: "client" },
    { status: "planned" }, { page: 2 },
  ])("refreshes every data-changing preference, including the chosen day: %s", change => {
    const selected = initialPlanningQuery("2031-03-04");
    expect(samePlanningQuery(selected, { ...selected, ...change })).toBe(false);
    expect(selected.day).toBe("2031-03-04");
  });
});
