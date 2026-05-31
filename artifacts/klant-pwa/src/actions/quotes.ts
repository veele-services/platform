"use server";

import { db } from "@workspace/db";
import { quotesTable, assignmentsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { getMyCustomerId } from "./customer";
import type { QuoteStatus } from "@workspace/db";

export type CustomerQuote = {
  id:               string;
  quoteNumber:      string;
  assignmentId:     string;
  assignmentTitle:  string;
  assignmentStatus: string;
  amount:           string;
  validityDate:     string;
  status:           QuoteStatus;
  isExpired:        boolean;
  createdAt:        string;
};

export async function getMyQuotes(): Promise<CustomerQuote[]> {
  const customerId = await getMyCustomerId();
  if (!customerId) return [];

  const today = new Date().toISOString().slice(0, 10);

  const rows = await db
    .select({
      id:               quotesTable.id,
      quoteNumber:      quotesTable.quoteNumber,
      assignmentId:     quotesTable.assignmentId,
      assignmentTitle:  assignmentsTable.title,
      assignmentStatus: assignmentsTable.status,
      amount:           quotesTable.amount,
      validityDate:     quotesTable.validityDate,
      status:           quotesTable.status,
      createdAt:        quotesTable.createdAt,
    })
    .from(quotesTable)
    .innerJoin(assignmentsTable, eq(quotesTable.assignmentId, assignmentsTable.id))
    .where(eq(quotesTable.customerId, customerId))
    .orderBy(desc(quotesTable.createdAt));

  return rows.map((r) => ({
    id:               r.id,
    quoteNumber:      r.quoteNumber,
    assignmentId:     r.assignmentId,
    assignmentTitle:  r.assignmentTitle,
    assignmentStatus: r.assignmentStatus,
    amount:           r.amount,
    validityDate:     r.validityDate,
    status:           r.status as QuoteStatus,
    isExpired:        r.status === "sent" && r.validityDate < today,
    createdAt:        r.createdAt.toISOString(),
  }));
}

export async function getMyPendingQuoteCount(): Promise<number> {
  const quotes = await getMyQuotes();
  return quotes.filter((q) => q.assignmentStatus === "awaiting_approval").length;
}
