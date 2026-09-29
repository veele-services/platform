export type OpenInvoice = { id: string; totalCents: number; paidCents: number };

export function paymentAllocations(invoices: OpenInvoice[]) {
  const allocations = invoices.map((invoice) => ({ invoiceId: invoice.id, amountCents: invoice.totalCents - invoice.paidCents })).filter((item) => item.amountCents > 0);
  return { allocations, totalCents: allocations.reduce((sum, item) => sum + item.amountCents, 0) };
}

export function mollieAmount(amountCents: number) {
  if (!Number.isSafeInteger(amountCents) || amountCents <= 0) throw new Error("Bedrag moet een positief aantal centen zijn");
  return `${Math.floor(amountCents / 100)}.${String(amountCents % 100).padStart(2, "0")}`;
}
