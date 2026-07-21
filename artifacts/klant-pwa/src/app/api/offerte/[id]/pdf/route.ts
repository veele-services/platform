export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { db } from "@workspace/db";
import {
  getTenantBranding,
  assignmentTasksTable,
  assignmentsTable,
  auditLogTable,
  customersTable,
  quotesTable,
  taskCodesTable,
  type QuoteStatus,
} from "@workspace/db";
import { and, asc, eq, inArray } from "drizzle-orm";
import { getMyCustomerIdentity } from "@/actions/customer";
import { generateCustomerQuotePdf, type CustomerQuotePdfLineItem } from "@/lib/quote-pdf";
import { sanitizePdfFilename } from "@/lib/pdf-style";

export const runtime = "nodejs";

const CUSTOMER_VISIBLE_QUOTE_STATUSES: QuoteStatus[] = ["sent", "approved", "rejected", "expired"];

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const identity = await getMyCustomerIdentity();
  if (!identity) return new NextResponse("Unauthorized", { status: 401 });

  const { id } = await params;
  const today = new Date().toISOString().slice(0, 10);

  const [quote] = await db
    .select({
      id: quotesTable.id,
      quoteNumber: quotesTable.quoteNumber,
      assignmentId: quotesTable.assignmentId,
      assignmentCode: assignmentsTable.code,
      assignmentTitle: assignmentsTable.title,
      amount: quotesTable.amount,
      validityDate: quotesTable.validityDate,
      status: quotesTable.status,
      createdAt: quotesTable.createdAt,
      customerName: customersTable.name,
      customerAddress: customersTable.address,
      customerPostalCode: customersTable.postalCode,
      customerCity: customersTable.city,
    })
    .from(quotesTable)
    .innerJoin(assignmentsTable, eq(quotesTable.assignmentId, assignmentsTable.id))
    .innerJoin(customersTable, eq(quotesTable.customerId, customersTable.id))
    .where(
      and(
        eq(quotesTable.id, id),
        eq(quotesTable.customerId, identity.customerId),
        eq(assignmentsTable.customerId, identity.customerId),
        eq(assignmentsTable.tenantId, identity.tenantId),
        eq(customersTable.tenantId, identity.tenantId),
        inArray(quotesTable.status, CUSTOMER_VISIBLE_QUOTE_STATUSES),
      ),
    )
    .limit(1);

  if (!quote) return new NextResponse("Not found", { status: 404 });

  const taskRows = await db
    .select({
      code: taskCodesTable.code,
      name: taskCodesTable.name,
      price: taskCodesTable.price,
      invoiceable: taskCodesTable.invoiceable,
    })
    .from(assignmentTasksTable)
    .leftJoin(taskCodesTable, eq(taskCodesTable.id, assignmentTasksTable.taskCodeId))
    .where(eq(assignmentTasksTable.assignmentId, quote.assignmentId))
    .orderBy(asc(assignmentTasksTable.sortOrder));

  const lineItems: CustomerQuotePdfLineItem[] = taskRows.map((row) => ({
    code: row.code ?? null,
    name: row.name ?? null,
    price: row.price ?? null,
    invoiceable: Boolean(row.invoiceable),
  }));
  const branding = await getTenantBranding(identity.tenantId);

  const pdfBuffer = await generateCustomerQuotePdf({
    brandName: branding.displayName,
    quoteNumber: quote.quoteNumber,
    customerName: quote.customerName ?? identity.customerName,
    customerAddress: quote.customerAddress ?? null,
    customerPostalCode: quote.customerPostalCode ?? null,
    customerCity: quote.customerCity ?? null,
    assignmentCode: quote.assignmentCode,
    assignmentTitle: quote.assignmentTitle,
    amount: quote.amount ?? "0",
    validityDate: quote.validityDate,
    status: quote.status,
    isExpired: quote.status === "sent" && quote.validityDate < today,
    createdAt: quote.createdAt.toISOString(),
    lineItems,
  });

  await db.insert(auditLogTable).values({
    userId: identity.userId,
    action: "customer_download_quote_pdf",
    resource: "quotes",
    resourceId: quote.id,
    metadata: {
      quoteNumber: quote.quoteNumber,
      assignmentId: quote.assignmentId,
      customerId: identity.customerId,
      tenantId: identity.tenantId,
    },
  });

  const filename = `${sanitizePdfFilename(quote.quoteNumber, `offerte-${quote.id.slice(0, 8)}`)}.pdf`;

  return new NextResponse(new Uint8Array(pdfBuffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": String(pdfBuffer.byteLength),
      "Cache-Control": "private, no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
