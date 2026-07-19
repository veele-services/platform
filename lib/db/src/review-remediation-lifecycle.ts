import { pool } from "./connection";

export type CustomerQuoteAcceptanceResult = {
  tenantId: string;
  customerId: string;
  quoteId: string;
  assignmentStatus: string;
  lifecycleVersion: number;
  idempotent: boolean;
};

export async function acceptCustomerQuote(input: {
  assignmentId: string;
  actorUserId: string;
}): Promise<CustomerQuoteAcceptanceResult> {
  const result = await pool.query(
    "select * from public.accept_customer_quote($1, $2)",
    [input.assignmentId, input.actorUserId],
  );
  const row = result.rows[0];
  if (!row) throw new Error("Offertegoedkeuring gaf geen resultaat terug.");
  return {
    tenantId: row.tenant_id,
    customerId: row.customer_id,
    quoteId: row.quote_id,
    assignmentStatus: row.assignment_status,
    lifecycleVersion: Number(row.lifecycle_version),
    idempotent: Boolean(row.idempotent),
  };
}

export type InvoiceCancellationResult = {
  invoiceStatus: string;
  assignmentStatus: string;
  lifecycleVersion: number;
  idempotent: boolean;
};

export async function cancelInvoiceAndReopenAssignment(input: {
  tenantId: string;
  invoiceId: string;
  actorUserId: string;
  reason: string;
}): Promise<InvoiceCancellationResult> {
  const result = await pool.query(
    "select * from public.cancel_invoice_and_reopen_assignment($1, $2, $3, $4)",
    [input.tenantId, input.invoiceId, input.actorUserId, input.reason.trim()],
  );
  const row = result.rows[0];
  if (!row) throw new Error("Factuurannulering gaf geen resultaat terug.");
  return {
    invoiceStatus: row.invoice_status,
    assignmentStatus: row.assignment_status,
    lifecycleVersion: Number(row.lifecycle_version),
    idempotent: Boolean(row.idempotent),
  };
}
