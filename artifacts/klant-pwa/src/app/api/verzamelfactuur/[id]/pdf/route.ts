export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import PDFDocument from "pdfkit";
import { asc, eq, and, inArray } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  assignmentsTable,
  customerPaymentBatchItemsTable,
  customerPaymentBatchesTable,
  customersTable,
  invoicesTable,
  objectsTable,
} from "@workspace/db";
import { getMyCustomerIdentity } from "@/actions/customer";

export const runtime = "nodejs";

function fmtDate(value: string | Date | null | undefined): string {
  if (!value) return "-";
  const d = typeof value === "string" ? new Date(`${value.slice(0, 10)}T00:00:00`) : value;
  return d.toLocaleDateString("nl-NL", { day: "numeric", month: "long", year: "numeric" });
}

function fmtEurCents(cents: number | null | undefined): string {
  return ((cents ?? 0) / 100).toLocaleString("nl-NL", { style: "currency", currency: "EUR" });
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const identity = await getMyCustomerIdentity();
  if (!identity) return new NextResponse("Unauthorized", { status: 401 });

  const { id } = await params;
  const [batch] = await db
    .select({
      id: customerPaymentBatchesTable.id,
      customerName: customersTable.name,
      customerAddress: customersTable.address,
      customerPostalCode: customersTable.postalCode,
      customerCity: customersTable.city,
      status: customerPaymentBatchesTable.status,
      amountCents: customerPaymentBatchesTable.amountCents,
      subtotalCents: customerPaymentBatchesTable.subtotalCents,
      vatCents: customerPaymentBatchesTable.vatCents,
      discountCents: customerPaymentBatchesTable.discountCents,
      surchargeCents: customerPaymentBatchesTable.surchargeCents,
      periodStart: customerPaymentBatchesTable.periodStart,
      periodEnd: customerPaymentBatchesTable.periodEnd,
      objectName: objectsTable.name,
      createdAt: customerPaymentBatchesTable.createdAt,
    })
    .from(customerPaymentBatchesTable)
    .innerJoin(customersTable, eq(customersTable.id, customerPaymentBatchesTable.customerId))
    .leftJoin(objectsTable, eq(objectsTable.id, customerPaymentBatchesTable.objectId))
    .where(
      and(
        eq(customerPaymentBatchesTable.id, id),
        eq(customerPaymentBatchesTable.customerId, identity.customerId),
        eq(customersTable.tenantId, identity.tenantId),
        inArray(customerPaymentBatchesTable.status, ["open", "paid", "canceled", "expired", "failed"]),
      ),
    )
    .limit(1);

  if (!batch) return new NextResponse("Not found", { status: 404 });

  const items = await db
    .select({
      invoiceNumber: invoicesTable.invoiceNumber,
      assignmentCode: assignmentsTable.code,
      assignmentTitle: assignmentsTable.title,
      scheduledDate: assignmentsTable.scheduledDate,
      objectName: objectsTable.name,
      itemAmountCents: customerPaymentBatchItemsTable.amountCents,
    })
    .from(customerPaymentBatchItemsTable)
    .innerJoin(invoicesTable, eq(invoicesTable.id, customerPaymentBatchItemsTable.invoiceId))
    .innerJoin(assignmentsTable, eq(assignmentsTable.id, invoicesTable.assignmentId))
    .innerJoin(customersTable, eq(customersTable.id, invoicesTable.customerId))
    .leftJoin(objectsTable, eq(objectsTable.id, assignmentsTable.objectId))
    .where(
      and(
        eq(customerPaymentBatchItemsTable.batchId, id),
        eq(invoicesTable.customerId, identity.customerId),
        eq(customersTable.tenantId, identity.tenantId),
        eq(assignmentsTable.customerId, identity.customerId),
        eq(assignmentsTable.tenantId, identity.tenantId),
      ),
    )
    .orderBy(asc(assignmentsTable.scheduledDate), asc(invoicesTable.invoiceNumber));

  const doc = new PDFDocument({ size: "A4", margin: 55, bufferPages: true });
  const chunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));

  await new Promise<void>((resolve) => {
    doc.on("end", resolve);
    const navy = "#081D3A";
    const teal = "#00B7B3";
    const slate = "#64748B";
    const border = "#E2E8F0";
    const soft = "#F8FAFC";
    const L = 55;
    const R = 540;
    const W = R - L;
    let y = 148;

    doc.rect(0, 0, 595.28, 122).fill(navy);
    doc.fillColor("#FFFFFF").font("Helvetica-Bold").fontSize(22).text("VEELE", L, 38);
    doc.fillColor("#7DF3EF").font("Helvetica").fontSize(8).text("SERVICES", L + 2, 64, { characterSpacing: 2 });
    doc.fillColor("#FFFFFF").font("Helvetica-Bold").fontSize(19).text("VERZAMELFACTUUR", 300, 38, { width: 240, align: "right" });
    doc.fillColor("#C7D2FE").font("Helvetica").fontSize(9).text(batch.id.slice(0, 8).toUpperCase(), 300, 66, { width: 240, align: "right" });

    doc.roundedRect(L, y, W, 112, 12).fill(soft).strokeColor(border).stroke();
    doc.fillColor(slate).font("Helvetica-Bold").fontSize(8).text("KLANT", L + 18, y + 16);
    doc.fillColor(navy).font("Helvetica-Bold").fontSize(12).text(batch.customerName ?? identity.customerName, L + 18, y + 32, { width: 220 });
    const cityLine = [batch.customerPostalCode, batch.customerCity].filter(Boolean).join(" ");
    doc.fillColor("#111827").font("Helvetica").fontSize(9);
    if (batch.customerAddress) doc.text(batch.customerAddress, L + 18, y + 52, { width: 220 });
    if (cityLine) doc.text(cityLine, L + 18, y + 66, { width: 220 });

    const metaRows: [string, string][] = [
      ["Status", String(batch.status)],
      ["Aangemaakt", fmtDate(batch.createdAt)],
      ["Periode", batch.periodStart || batch.periodEnd ? `${fmtDate(batch.periodStart)} t/m ${fmtDate(batch.periodEnd)}` : "-"],
      ["Object", batch.objectName ?? "-"],
      ["Facturen", String(items.length)],
    ];
    let metaY = y + 18;
    for (const [label, value] of metaRows) {
      doc.fillColor(slate).font("Helvetica").fontSize(8).text(label, 340, metaY, { width: 80 });
      doc.fillColor(navy).font("Helvetica-Bold").fontSize(8).text(value, 425, metaY, { width: 110 });
      metaY += 16;
    }

    y += 142;
    doc.fillColor(navy).font("Helvetica-Bold").fontSize(13).text("Gebundelde facturen", L, y);
    y += 22;

    for (const item of items) {
      if (y > 730) {
        doc.addPage();
        y = 55;
      }
      doc.roundedRect(L, y, W, 42, 8).fill("#FFFFFF").strokeColor(border).stroke();
      doc.fillColor(teal).font("Helvetica-Bold").fontSize(8).text(item.invoiceNumber, L + 10, y + 12, { width: 84 });
      doc.fillColor(navy).font("Helvetica-Bold").fontSize(8).text(item.assignmentCode, L + 100, y + 8, { width: 80 });
      doc.fillColor("#111827").font("Helvetica").fontSize(8).text(item.assignmentTitle, L + 182, y + 8, { width: 150 });
      doc.fillColor(slate).text(fmtDate(item.scheduledDate), R - 145, y + 12, { width: 82 });
      doc.fillColor(navy).font("Helvetica-Bold").text(fmtEurCents(item.itemAmountCents), R - 62, y + 12, { width: 62, align: "right" });
      y += 50;
    }

    y += 10;
    if (y > 650) {
      doc.addPage();
      y = 55;
    }
    const totalsX = 330;
    doc.roundedRect(totalsX, y, 210, 132, 12).fill(soft).strokeColor(border).stroke();
    let ty = y + 18;
    for (const [label, value, strong] of [
      ["Subtotaal excl. BTW", fmtEurCents(batch.subtotalCents), false],
      ["BTW", fmtEurCents(batch.vatCents), false],
      ["Korting", `- ${fmtEurCents(batch.discountCents)}`, false],
      ["Toeslag", fmtEurCents(batch.surchargeCents), false],
      ["Totaal te betalen", fmtEurCents(batch.amountCents), true],
    ] as const) {
      doc.fillColor(strong ? navy : slate).font(strong ? "Helvetica-Bold" : "Helvetica").fontSize(strong ? 11 : 9);
      doc.text(label, totalsX + 16, ty, { width: 105 });
      doc.text(value, totalsX + 118, ty, { width: 76, align: "right" });
      ty += strong ? 22 : 18;
    }

    const range = doc.bufferedPageRange();
    for (let i = 0; i < range.count; i++) {
      doc.switchToPage(i);
      doc.fillColor(slate).font("Helvetica").fontSize(8)
        .text("Veele Services - Verzamelfactuur", L, 800, { width: W, align: "center" });
    }
    doc.end();
  });

  const pdfBuffer = Buffer.concat(chunks);
  return new NextResponse(new Uint8Array(pdfBuffer), {
    headers: {
      "Content-Type":        "application/pdf",
      "Content-Disposition": `inline; filename="verzamelfactuur-${batch.id.slice(0, 8)}.pdf"`,
      "Content-Length":      String(pdfBuffer.byteLength),
    },
  });
}
