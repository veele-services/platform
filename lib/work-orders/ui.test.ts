import { Children, createElement, isValidElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import WorkOrdersError from "../../app/app/werkbonnen/error";
import WorkOrdersLoading from "../../app/app/werkbonnen/loading";
import { orderDate, orderHours } from "../../components/fieldgrid/work-orders/presentation";
import { workOrderQuery, workOrderReturn, workOrderTabs, workOrderViews } from "./model";

describe("work-order navigation and recovery", () => {
  it("keeps execution, planning, report and finance dimensions independent", () => {
    expect(workOrderQuery.parse({ planning: "tentative", execution: "planned", report: "draft", billing: "not_ready", page: "3" }))
      .toMatchObject({ planning: "tentative", execution: "planned", report: "draft", billing: "not_ready", page: 3, view: "all" });
    expect(Object.keys(workOrderViews)).toHaveLength(6);
    expect(workOrderTabs).toHaveLength(7);
  });
  it("normalizes malformed query values without crashing a list deep link", () => {
    expect(workOrderQuery.parse({ page: "not-a-page", view: "unknown", customer: "bad-id", from: "tomorrow", sort: "unsafe" }))
      .toMatchObject({ page: 1, view: "all", customer: "", from: "", sort: "date" });
  });
  it("retains permitted source filters and rejects external or escaped return paths", () => {
    const source = "/app/werkbonnen?q=entree&planning=tentative&page=3";
    expect(workOrderReturn(source)).toBe(source);
    expect(workOrderReturn("/app/planning?day=2033-10-05")).toContain("day=2033-10-05");
    for (const path of ["https://example.test", "//example.test", "/app/werkbonnen-elsewhere", "/app/werkbonnen\\example", "/app/werkbonnen\nother", "javascript:alert(1)"])
      expect(workOrderReturn(path)).toBe("/app/werkbonnen");
  });
  it("renders accessible loading and recovery content inside the retained shell", () => {
    const loading = renderToStaticMarkup(createElement(WorkOrdersLoading));
    const failure = renderToStaticMarkup(createElement(WorkOrdersError, { retry: vi.fn() }));
    expect(loading).toContain('role="status"');
    expect(failure).toContain('role="alert"');
    for (const html of [loading, failure]) {
      expect(html).toContain('href="/app/werkbonnen"');
      expect(html).not.toContain("<main");
    }
  });
  it("retries the failed server segment using Next's refetching recovery callback", () => {
    const retry = vi.fn();
    const element = WorkOrdersError({ retry });
    const button = Children.toArray(element.props.children).find(child => isValidElement(child) && child.type === "button") as ReactElement<{ onClick: () => void }>;
    button.props.onClick();
    expect(retry).toHaveBeenCalledOnce();
  });
  it("formats visit dates and labor hours in the tenant timezone", () => {
    expect(orderDate("2033-10-05T06:00:00Z", "Europe/Amsterdam")).toContain("08:00");
    expect(orderHours(180)).toBe("3");
    expect(orderHours(90)).toBe("1,5");
    expect(orderDate(null, "Europe/Amsterdam")).toBe("Nog niet gepland");
  });
});
