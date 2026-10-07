import { expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { invoiceSnapshotInput } from "./invoice-snapshot";

const snapshot = () => ({
  invoice_number: "FACT-2026-000001", issued_on: "2026-10-07", due_on: "2026-11-06",
  branding_snapshot: { tenant_name: "Fictieve afzender", sender_email: "billing@example.test", company: { company_number: "12345678", vat_number: "NL123456789B01", iban: "NL00TEST0000000000", address: { street: "Teststraat 1", city: "Utrecht" } } },
  customer_snapshot: { name: "Fictieve klant", legal_name: "Fictieve klant B.V.", company_number: "87654321", vat_number: "NL987654321B01", billing_address: { street: "Testplein 2", city: "Amsterdam" }, billing_email: "customer@example.test", billing_preferences: { iban: "NL00TEST1111111111", reference: "PO-123" } },
  lines_snapshot: [{ description: "Gecontroleerde uitvoering", quantity: 2, unit: "task", unit_price_cents: 1200, vat_basis_points: 2100, subtotal_cents: 2400, vat_cents: 504, total_cents: 2904 }],
  subtotal_cents: 2400, vat_cents: 504, total_cents: 2904,
});

it("uses frozen issuer and recipient identity without altering the accounting snapshot", () => {
  const original = snapshot(), before = structuredClone(original), result = invoiceSnapshotInput(original);
  expect(result.sender).toMatchObject({ companyNumber: "12345678", vatNumber: "NL123456789B01", iban: "NL00TEST0000000000", email: "billing@example.test" });
  expect(result.recipient).toMatchObject({ legalName: "Fictieve klant B.V.", companyNumber: "87654321", vatNumber: "NL987654321B01", iban: "NL00TEST1111111111", address: { street: "Testplein 2" } });
  expect(result.reference).toBe("PO-123");
  expect(result.lines[0]).toMatchObject({ quantity: 2, unitPriceCents: 1200, totalCents: 2904 });
  expect(original).toEqual(before);
});

it("keeps absent historical identity blank and rejects inconsistent totals or an unissued draft", () => {
  const original = snapshot();
  const result = invoiceSnapshotInput({ ...original, branding_snapshot: { tenant_name: "Fictieve afzender" }, customer_snapshot: { name: "Fictieve klant" } });
  expect(result.sender).toMatchObject({ companyNumber: "", vatNumber: "", iban: "", email: "", address: {} });
  expect(result.recipient).toMatchObject({ legalName: "", companyNumber: "", vatNumber: "", iban: "", address: {} });
  expect(() => invoiceSnapshotInput({ ...original, total_cents: 2905 })).toThrow(/Factuurbedragen/);
  expect(() => invoiceSnapshotInput({ ...original, invoice_number: null })).toThrow(/Definitieve factuur/);
});
