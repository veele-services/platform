"use server";

import { db } from "@workspace/db";
import {
  quotesTable,
  assignmentsTable,
  assignmentTasksTable,
  taskCodesTable,
} from "@workspace/db";
import { eq, desc, inArray, asc } from "drizzle-orm";
import { getMyCustomerId } from "./customer";
import type { QuoteStatus } from "@workspace/db";

export type QuoteLineItem = {
  code:        string | null;
  name:        string | null;
  price:       string | null;
  invoiceable: boolean;
};

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
  lineItems:        QuoteLineItem[];
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

  if (rows.length === 0) return [];

  // Batch-fetch all line items for all assignment IDs in one query
  const assignmentIds = [...new Set(rows.map((r) => r.assignmentId))];
  const taskRows = await db
    .select({
      assignmentId: assignmentTasksTable.assignmentId,
      code:         taskCodesTable.code,
      name:         taskCodesTable.name,
      price:        taskCodesTable.price,
      invoiceable:  taskCodesTable.invoiceable,
    })
    .from(assignmentTasksTable)
    .leftJoin(taskCodesTable, eq(assignmentTasksTable.taskCodeId, taskCodesTable.id))
    .where(inArray(assignmentTasksTable.assignmentId, assignmentIds))
    .orderBy(asc(assignmentTasksTable.sortOrder));

  // Group line items by assignmentId
  const linesByAssignment = new Map<string, QuoteLineItem[]>();
  for (const t of taskRows) {
    const list = linesByAssignment.get(t.assignmentId) ?? [];
    list.push({
      code:        t.code        ?? null,
      name:        t.name        ?? null,
      price:       t.price       ?? null,
      invoiceable: t.invoiceable ?? false,
    });
    linesByAssignment.set(t.assignmentId, list);
  }

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
    lineItems:        linesByAssignment.get(r.assignmentId) ?? [],
  }));
}

export async function getMyPendingQuoteCount(): Promise<number> {
  const quotes = await getMyQuotes();
  return quotes.filter((q) => q.assignmentStatus === "awaiting_approval").length;
}
