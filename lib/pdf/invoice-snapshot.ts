import "server-only";
import { z } from "zod";
import type { Json } from "@/lib/database.types";
import type { InvoiceCompany, InvoicePdfInput } from "./invoice";

const object = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const field = (value: unknown) => typeof value === "string" ? value : "";
const company = (value: Record<string, unknown>): InvoiceCompany => ({
  legalName: field(value.legal_name), address: object(value.billing_address ?? value.address),
  companyNumber: field(value.company_number), vatNumber: field(value.vat_number),
  iban: field(value.iban), email: field(value.billing_email ?? value.email), phone: field(value.phone),
});
const linesSchema = z.array(z.object({
  description:z.string(), quantity:z.number().finite().positive(), unit:z.string(),
  unit_price_cents:z.number().int().nonnegative(), vat_basis_points:z.number().int().nonnegative(),
  subtotal_cents:z.number().int().nonnegative(), vat_cents:z.number().int().nonnegative(), total_cents:z.number().int().nonnegative(),
})).min(1);

/** A refreshed presentation reads frozen invoice data; it never changes the ledger or saved PDF. */
export function invoiceSnapshotInput(invoice: {
  invoice_number: string | null; issued_on: string | null; due_on: string | null;
  branding_snapshot: Json | null; customer_snapshot: Json | null; lines_snapshot: Json | null;
  subtotal_cents:number; vat_cents:number; total_cents:number;
}): InvoicePdfInput {
  if (!invoice.invoice_number || !invoice.issued_on || !invoice.due_on) throw new Error("Definitieve factuur ontbreekt");
  const brand=object(invoice.branding_snapshot), customer=object(invoice.customer_snapshot), preferences=object(customer.billing_preferences);
  const lines=linesSchema.parse(invoice.lines_snapshot);
  if (lines.reduce((sum,line)=>sum+line.subtotal_cents,0)!==invoice.subtotal_cents || lines.reduce((sum,line)=>sum+line.vat_cents,0)!==invoice.vat_cents || lines.reduce((sum,line)=>sum+line.total_cents,0)!==invoice.total_cents) throw new Error("Factuurbedragen komen niet overeen met de vastgelegde regels");
  return {
    invoiceNumber:invoice.invoice_number, issuedOn:invoice.issued_on, dueOn:invoice.due_on,
    tenantName:field(brand.tenant_name), customerName:field(customer.name), billingAddress:object(customer.billing_address),
    sender:{...company(object(brand.company)),email:field(object(brand.company).email ?? brand.sender_email)},
    recipient:{...company(customer),iban:field(customer.iban ?? preferences.iban)},
    reference:field(preferences.reference), costCenter:field(preferences.costCenter),
    primaryColor:field(brand.primary_color), accentColor:field(brand.accent_color), footer:field(brand.pdf_footer) || field(brand.tenant_name),
    lines:lines.map(line=>({description:line.description,quantity:line.quantity,unit:line.unit,unitPriceCents:line.unit_price_cents,vatBasisPoints:line.vat_basis_points,subtotalCents:line.subtotal_cents,vatCents:line.vat_cents,totalCents:line.total_cents})),
    subtotalCents:invoice.subtotal_cents,vatCents:invoice.vat_cents,totalCents:invoice.total_cents,
  };
}
