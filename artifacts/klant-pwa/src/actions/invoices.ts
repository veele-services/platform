"use server";

import { db } from "@workspace/db";
import { invoicesTable, paymentsTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { getMyCustomerId } from "./customer";
import type { InvoiceStatus } from "@workspace/db";

export type CustomerInvoice = {
  id:            string;
  invoiceNumber: string;
  assignmentId:  string;
  amount:        string;
  vatAmount:     string;
  totalAmount:   string;
  status:        InvoiceStatus;
  dueDate:       string;
  paidDate:      string | null;
  checkoutUrl:   string | null;
  createdAt:     string;
};

export async function getMyInvoices(): Promise<CustomerInvoice[]> {
  const customerId = await getMyCustomerId();
  if (!customerId) return [];

  const rows = await db
    .select({
      id:            invoicesTable.id,
      invoiceNumber: invoicesTable.invoiceNumber,
      assignmentId:  invoicesTable.assignmentId,
      amount:        invoicesTable.amount,
      vatAmount:     invoicesTable.vatAmount,
      totalAmount:   invoicesTable.totalAmount,
      status:        invoicesTable.status,
      dueDate:       invoicesTable.dueDate,
      paidDate:      invoicesTable.paidDate,
      checkoutUrl:   paymentsTable.checkoutUrl,
      createdAt:     invoicesTable.createdAt,
    })
    .from(invoicesTable)
    .leftJoin(
      paymentsTable,
      and(
        eq(paymentsTable.invoiceId, invoicesTable.id),
        eq(paymentsTable.status, "open"),
      ),
    )
    .where(eq(invoicesTable.customerId, customerId))
    .orderBy(desc(invoicesTable.createdAt));

  return rows.map((r) => ({
    id:            r.id,
    invoiceNumber: r.invoiceNumber,
    assignmentId:  r.assignmentId,
    amount:        r.amount,
    vatAmount:     r.vatAmount,
    totalAmount:   r.totalAmount,
    status:        r.status as InvoiceStatus,
    dueDate:       r.dueDate,
    paidDate:      r.paidDate ?? null,
    checkoutUrl:   r.checkoutUrl ?? null,
    createdAt:     r.createdAt.toISOString(),
  }));
}

export async function getMyInvoice(invoiceId: string): Promise<CustomerInvoice | null> {
  const customerId = await getMyCustomerId();
  if (!customerId) return null;

  const rows = await db
    .select({
      id:            invoicesTable.id,
      invoiceNumber: invoicesTable.invoiceNumber,
      assignmentId:  invoicesTable.assignmentId,
      amount:        invoicesTable.amount,
      vatAmount:     invoicesTable.vatAmount,
      totalAmount:   invoicesTable.totalAmount,
      status:        invoicesTable.status,
      dueDate:       invoicesTable.dueDate,
      paidDate:      invoicesTable.paidDate,
      checkoutUrl:   paymentsTable.checkoutUrl,
      createdAt:     invoicesTable.createdAt,
    })
    .from(invoicesTable)
    .leftJoin(
      paymentsTable,
      and(
        eq(paymentsTable.invoiceId, invoicesTable.id),
        eq(paymentsTable.status, "open"),
      ),
    )
    .where(
      and(
        eq(invoicesTable.id, invoiceId),
        eq(invoicesTable.customerId, customerId),
      ),
    )
    .limit(1);

  const r = rows[0];
  if (!r) return null;

  return {
    id:            r.id,
    invoiceNumber: r.invoiceNumber,
    assignmentId:  r.assignmentId,
    amount:        r.amount,
    vatAmount:     r.vatAmount,
    totalAmount:   r.totalAmount,
    status:        r.status as InvoiceStatus,
    dueDate:       r.dueDate,
    paidDate:      r.paidDate ?? null,
    checkoutUrl:   r.checkoutUrl ?? null,
    createdAt:     r.createdAt.toISOString(),
  };
}

export async function getMyInvoiceSummary(): Promise<{
  openCount:  number;
  openTotal:  string;
}> {
  const invoices = await getMyInvoices();
  const open = invoices.filter((i) => i.status === "sent");
  const openTotal = open.reduce((sum, i) => sum + parseFloat(i.totalAmount || "0"), 0);
  return {
    openCount: open.length,
    openTotal: openTotal.toFixed(2),
  };
}
