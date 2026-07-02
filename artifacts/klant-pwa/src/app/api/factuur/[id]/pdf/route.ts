export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { db } from "@workspace/db";
import {
  assignmentExtraWorkTable,
  assignmentMaterialUsageTable,
  assignmentTasksTable,
  assignmentsTable,
  auditLogTable,
  customersTable,
  invoicesTable,
  objectsTable,
  taskCodesTable,
} from "@workspace/db";
import { and, asc, eq, inArray } from "drizzle-orm";
import { getMyCustomerIdentity } from "@/actions/customer";
import { generateCustomerInvoicePdf, type CustomerInvoicePdfLineItem } from "@/lib/invoice-pdf";

export const runtime = "nodejs";

function money(value: number): string {
  return (Math.round((value + Number.EPSILON) * 100) / 100).toFixed(2);
}

function parseMoney(value: string | null | undefined): number {
  const parsed = Number.parseFloat(value ?? "0");
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const identity = await getMyCustomerIdentity();
  if (!identity) return new NextResponse("Unauthorized", { status: 401 });

  const { id } = await params;

  const [invoice] = await db
    .select({
      id:                 invoicesTable.id,
      invoiceNumber:      invoicesTable.invoiceNumber,
      assignmentId:       invoicesTable.assignmentId,
      amount:             invoicesTable.amount,
      vatPercentage:      invoicesTable.vatPercentage,
      vatAmount:          invoicesTable.vatAmount,
      totalAmount:        invoicesTable.totalAmount,
      status:             invoicesTable.status,
      dueDate:            invoicesTable.dueDate,
      createdAt:          invoicesTable.createdAt,
      customerName:       customersTable.name,
      customerAddress:    customersTable.address,
      customerPostalCode: customersTable.postalCode,
      customerCity:       customersTable.city,
      assignmentCode:     assignmentsTable.code,
      objectName:         objectsTable.name,
    })
    .from(invoicesTable)
    .innerJoin(customersTable, eq(customersTable.id, invoicesTable.customerId))
    .innerJoin(assignmentsTable, eq(assignmentsTable.id, invoicesTable.assignmentId))
    .leftJoin(objectsTable, eq(objectsTable.id, assignmentsTable.objectId))
    .where(
      and(
        eq(invoicesTable.id, id),
        eq(invoicesTable.customerId, identity.customerId),
        eq(customersTable.tenantId, identity.tenantId),
        eq(assignmentsTable.customerId, identity.customerId),
        eq(assignmentsTable.tenantId, identity.tenantId),
        inArray(invoicesTable.status, ["sent", "paid", "cancelled"]),
      ),
    )
    .limit(1);

  if (!invoice) return new NextResponse("Not found", { status: 404 });

  const [taskRows, extraRows, materialRows] = await Promise.all([
    db
      .select({
        code:        taskCodesTable.code,
        name:        taskCodesTable.name,
        price:       taskCodesTable.price,
        invoiceable: taskCodesTable.invoiceable,
      })
      .from(assignmentTasksTable)
      .leftJoin(taskCodesTable, eq(taskCodesTable.id, assignmentTasksTable.taskCodeId))
      .where(eq(assignmentTasksTable.assignmentId, invoice.assignmentId))
      .orderBy(asc(assignmentTasksTable.sortOrder)),

    db
      .select({
        code: taskCodesTable.code,
        name: assignmentExtraWorkTable.taskCodeName,
        description: assignmentExtraWorkTable.description,
        hours: assignmentExtraWorkTable.hours,
        price: assignmentExtraWorkTable.price,
      })
      .from(assignmentExtraWorkTable)
      .leftJoin(taskCodesTable, eq(taskCodesTable.id, assignmentExtraWorkTable.taskCodeId))
      .where(eq(assignmentExtraWorkTable.assignmentId, invoice.assignmentId))
      .orderBy(asc(assignmentExtraWorkTable.createdAt)),

    db
      .select({
        name: assignmentMaterialUsageTable.name,
        quantity: assignmentMaterialUsageTable.quantity,
        unitPrice: assignmentMaterialUsageTable.unitPrice,
        unitLabel: assignmentMaterialUsageTable.unitLabel,
      })
      .from(assignmentMaterialUsageTable)
      .where(eq(assignmentMaterialUsageTable.assignmentId, invoice.assignmentId))
      .orderBy(asc(assignmentMaterialUsageTable.createdAt)),
  ]);

  const lineItems: CustomerInvoicePdfLineItem[] = [
    ...taskRows.map((row) => ({
      category: "task" as const,
      code: row.code ?? null,
      description: row.name ?? "Werkzaamheid",
      quantity: "1",
      unitPrice: row.invoiceable ? money(parseMoney(row.price)) : null,
      price: row.invoiceable ? money(parseMoney(row.price)) : null,
      invoiceable: Boolean(row.invoiceable),
    })),
    ...extraRows.map((row) => ({
      category: "extra_work" as const,
      code: row.code ?? null,
      description: row.description,
      quantity: row.hours ?? "1",
      unitPrice: row.hours ? money(parseMoney(row.price) / Math.max(parseMoney(row.hours), 1)) : money(parseMoney(row.price)),
      price: money(parseMoney(row.price)),
      invoiceable: parseMoney(row.price) > 0,
    })),
    ...materialRows.map((row) => {
      const quantity = parseMoney(row.quantity);
      const unitPrice = parseMoney(row.unitPrice);
      return {
        category: "material" as const,
        code: null,
        description: row.unitLabel ? `${row.name} (${row.unitLabel})` : row.name,
        quantity: row.quantity ?? "1",
        unitPrice: money(unitPrice),
        price: money(quantity * unitPrice),
        invoiceable: quantity > 0 && unitPrice > 0,
      };
    }),
  ];

  const pdfBuffer = await generateCustomerInvoicePdf({
    invoiceNumber: invoice.invoiceNumber,
    customerName: invoice.customerName ?? identity.customerName,
    customerAddress: invoice.customerAddress ?? null,
    customerPostalCode: invoice.customerPostalCode ?? null,
    customerCity: invoice.customerCity ?? null,
    assignmentCode: invoice.assignmentCode,
    objectName: invoice.objectName ?? null,
    amount: invoice.amount ?? "0",
    vatPercentage: invoice.vatPercentage ?? "21",
    vatAmount: invoice.vatAmount ?? "0",
    totalAmount: invoice.totalAmount ?? "0",
    dueDate: invoice.dueDate,
    createdAt: invoice.createdAt.toISOString(),
    lineItems,
  });

  await db.insert(auditLogTable).values({
    userId:     identity.userId,
    action:     "customer_download_invoice_pdf",
    resource:   "invoices",
    resourceId: invoice.id,
    metadata: {
      invoiceNumber: invoice.invoiceNumber,
      assignmentId:  invoice.assignmentId,
      customerId:    identity.customerId,
      tenantId:      identity.tenantId,
    },
  });

  return new NextResponse(new Uint8Array(pdfBuffer), {
    headers: {
      "Content-Type":        "application/pdf",
      "Content-Disposition": `inline; filename="${invoice.invoiceNumber.replace(/[^a-zA-Z0-9-_]/g, "-")}.pdf"`,
      "Content-Length":      String(pdfBuffer.byteLength),
    },
  });
}