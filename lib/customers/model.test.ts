import { describe, expect, it } from "vitest";
import {
  customerFilters,
  customerTab,
  customerTabs,
  customerReturn,
  canManageCustomers,
  canReadFinance,
} from "./model";

describe("Klant 360 route and list contract", () => {
  it("keeps eleven canonical tabs and redirects old dossier links", () => {
    expect(customerTabs).toHaveLength(11);
    expect(customerTab("documents")).toBe("documenten");
    expect(customerTab("agreements")).toBe("contracten");
    expect(customerTab("untrusted")).toBe("overzicht");
  });
  it("preserves local list filters but never external return locations", () => {
    expect(customerReturn("/app/klanten?q=test&page=2")).toBe(
      "/app/klanten?q=test&page=2",
    );
    for (const path of [
      "https://example.test",
      "//example.test",
      "/app/klanten/../../platform",
      "/app/klanten\n?x=1",
    ])
      expect(customerReturn(path)).toBe("/app/klanten");
  });
  it("whitelists filters, sort fields and page boundaries", () => {
    expect(
      customerFilters.parse({
        sort: "name; drop table customers",
        page: -1,
        status: "invalid",
      }),
    ).toMatchObject({ sort: "name", page: 1, status: "" });
    expect(
      customerFilters.parse({
        sort: "next_visit",
        page: "2",
        status: "paused",
      }),
    ).toMatchObject({ sort: "next_visit", page: 2, status: "paused" });
  });
  it("bounds genuine preferred page sizes and retains the filtered page", () => {
    expect(customerFilters.parse({page: "3", pageSize: "50", q: "Amsterdam"})).toMatchObject({page: 3, pageSize: 50, q: "Amsterdam"});
    for (const pageSize of [-1, 0, 101, 5000, "invalid"]) expect(customerFilters.parse({pageSize}).pageSize).toBe(25);
  });
  it("reuses existing roles and keeps finance separate from planning", () => {
    expect(canManageCustomers(["planner"])).toBe(true);
    expect(canReadFinance(["planner"])).toBe(false);
    expect(canManageCustomers(["staff"])).toBe(false);
    expect(canReadFinance(["finance"])).toBe(true);
  });
});
