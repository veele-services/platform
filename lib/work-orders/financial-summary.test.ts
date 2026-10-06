import { describe, expect, it } from "vitest";
import type { WorkOrderDossier } from "./model";
import { orderFinancialSummary } from "./financial-summary";
const task = (values: Partial<WorkOrderDossier["tasks"][number]>) => values as WorkOrderDossier["tasks"][number];
describe("order finance separates agreement, approval and invoice", () => {
  it("counts actual approved extra quantities only and excludes unapproved extra and internal costs", () => {
    const total = orderFinancialSummary({ tasks: [task({ quantity: 2, unit_price_cents: 10000, is_extra_work: false }), task({ quantity: 2, executed_quantity: 1, unit_price_cents: 3000, is_extra_work: true, extra_work_status: "approved" }), task({ quantity: 1, unit_price_cents: 4000, is_extra_work: true, extra_work_status: "pending" })], financial: { materials: [{ id: "m", description: "Glasreiniger", quantity: 2, unit: "stuks", unitPriceCents: 1000, customerVisible: true }, { id: "internal", description: "Interne voorraad", quantity: 1, unit: "stuk", unitPriceCents: 9999, customerVisible: false }], expenses: [{ id: "e", description: "Parkeren", amountCents: 700, customerVisible: true }, { id: "i", description: "Intern", amountCents: 5000, customerVisible: false }], invoices: [{ id: "invoice", number: "F-1", status: "final", totalCents: 24200, paidCents: 0, pdfAvailable: true, issuedOn: null }] } });
    expect(total).toMatchObject({ originalCents: 20000, approvedExtraCents: 3000, proposedExtraCents: 4000, materialCents: 2000, expenseCents: 700, totalCents: 25700, issuedCents: 24200 });
  });
  it("preserves the net quote agreement including its discount", () => {
    expect(orderFinancialSummary({ tasks: [task({ quantity: 2, unit_price_cents: 5000, is_extra_work: false, commercial_snapshot: { quote_id: "fictitious", line: { quantity: 2, net_cents: 9000 } } })], financial: undefined }).originalCents).toBe(9000);
  });
  it("flags a material without an agreed rate instead of claiming its price is zero", () => {
    expect(orderFinancialSummary({ tasks: [], financial: { materials: [{ id: "m", description: "Materiaal", quantity: 1, unit: "stuk", unitPriceCents: null, customerVisible: true }], expenses: [], invoices: [] } })).toMatchObject({ unpricedMaterials: 1, materialCents: 0 });
  });
});
