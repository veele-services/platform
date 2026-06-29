import { NextResponse } from "next/server";
import PDFDocument from "pdfkit";
import { asc, eq } from "drizzle-orm";
import { hasPermission } from "@/lib/auth/permissions";
import { db } from "@workspace/db";
import {
  assignmentsTable,
  customerPaymentBatchItemsTable,
  customerPaymentBatchesTable,
  customersTable,
  invoicesTable,
  objectsTable,
} from "@workspace/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function fmtDate(value: string | Date | null | undefined): string {
  if (!value) return "-";
  const d = typeof value === "string" ? new Date(`${value.slice(0, 10)}T00:00:00`) : value;
  return d.toLocaleDateString("nl-NL", { day: "numeric", month: "long", year: "numeric" });
}

function fmtEurCents(cents: number | null | undefined): string {
  return ((cents ?? 0) / 100).toLocaleString("nl-NL", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
  });
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const canRead = await hasPermission("invoices", "read");
  if (!canRead) return new NextResponse("Forbidden", { status: 403 });

  const { id } = await params;

  const [batch] = await db
    .select({
      id: customerPaymentBatchesTable.id,
      customerId: customerPaymentBatchesTable.customerId,
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
      notes: customerPaymentBatchesTable.notes,
      objectName: objectsTable.name,
      createdAt: customerPaymentBatchesTable.createdAt,
    })
    .from(customerPaymentBatchesTable)
    .innerJoin(customersTable, eq(customersTable.id, customerPaymentBatchesTable.customerId))
    .leftJoin(objectsTable, eq(objectsTable.id, customerPaymentBatchesTable.objectId))
    .where(eq(customerPaymentBatchesTable.id, id))
    .limit(1);

  if (!batch) return new NextResponse("Not found", { status: 404 });

  const items = await db
    .select({
      invoiceId: invoicesTable.id,
      invoiceNumber: invoicesTable.invoiceNumber,
      assignmentCode: assignmentsTable.code,
      assignmentTitle: assignmentsTable.title,
      scheduledDate: assignmentsTable.scheduledDate,
      objectName: objectsTable.name,
      amount: invoicesTable.amount,
      vatAmount: invoicesTable.vatAmount,
      totalAmount: invoicesTable.totalAmount,
      itemAmountCents: customerPaymentBatchItemsTable.amountCents,
    })
    .from(customerPaymentBatchItemsTable)
    .innerJoin(invoicesTable, eq(invoicesTable.id, customerPaymentBatchItemsTable.invoiceId))
    .innerJoin(assignmentsTable, eq(assignmentsTable.id, invoicesTable.assignmentId))
    .leftJoin(objectsTable, eq(objectsTable.id, assignmentsTable.objectId))
    .where(eq(customerPaymentBatchItemsTable.batchId, id))
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

    doc.roundedRect(L, y, W, 118, 12).fill(soft).strokeColor(border).stroke();
    doc.fillColor(slate).font("Helvetica-Bold").fontSize(8).text("KLANT", L + 18, y + 16);
    doc.fillColor(navy).font("Helvetica-Bold").fontSize(12).text(batch.customerName ?? "-", L + 18, y + 32, { width: 220 });
    doc.fillColor("#111827").font("Helvetica").fontSize(9);
    let addressY = y + 50;
    if (batch.customerAddress) {
      doc.text(batch.customerAddress, L + 18, addressY, { width: 220 });
      addressY += 13;
    }
    const cityLine = [batch.customerPostalCode, batch.customerCity].filter(Boolean).join(" ");
    if (cityLine) doc.text(cityLine, L + 18, addressY, { width: 220 });

    const metaX = 340;
    const metaRows: [string, string][] = [
      ["Status", String(batch.status)],
      ["Aangemaakt", fmtDate(batch.createdAt)],
      ["Periode", batch.periodStart || batch.periodEnd ? `${fmtDate(batch.periodStart)} t/m ${fmtDate(batch.periodEnd)}` : "-"],
      ["Object", batch.objectName ?? "-"],
      ["Facturen", String(items.length)],
    ];
    let metaY = y + 18;
    for (const [label, value] of metaRows) {
      doc.fillColor(slate).font("Helvetica").fontSize(8).text(label, metaX, metaY, { width: 80 });
      doc.fillColor(navy).font("Helvetica-Bold").fontSize(8).text(value, metaX + 85, metaY, { width: 110 });
      metaY += 16;
    }

    y += 148;
    doc.fillColor(navy).font("Helvetica-Bold").fontSize(13).text("Gebundelde facturen", L, y);
    y += 22;
    doc.roundedRect(L, y, W, 26, 8).fill(navy);
    doc.fillColor("#FFFFFF").font("Helvetica-Bold").fontSize(8);
    doc.text("Factuur", L + 10, y + 9, { width: 80 });
    doc.text("Opdracht", L + 95, y + 9, { width: 170 });
    doc.text("Datum", R - 190, y + 9, { width: 70 });
    doc.text("Object", R - 116, y + 9, { width: 62 });
    doc.text("Totaal", R - 55, y + 9, { width: 55, align: "right" });
    y += 34;

    for (const item of items) {
      if (y > 730) {
        doc.addPage();
        y = 55;
      }
      doc.roundedRect(L, y, W, 40, 8).fill("#FFFFFF").strokeColor(border).stroke();
      doc.fillColor(teal).font("Helvetica-Bold").fontSize(8).text(item.invoiceNumber, L + 10, y + 12, { width: 80 });
      doc.fillColor(navy).font("Helvetica-Bold").fontSize(8).text(item.assignmentCode, L + 95, y + 9, { width: 70 });
      doc.fillColor("#111827").font("Helvetica").fontSize(8).text(item.assignmentTitle, L + 166, y + 9, { width: 98 });
      doc.fillColor(slate).text(fmtDate(item.scheduledDate), R - 190, y + 12, { width: 70 });
      doc.text(item.objectName ?? "-", R - 116, y + 12, { width: 62 });
      doc.fillColor(navy).font("Helvetica-Bold").text(fmtEurCents(item.itemAmountCents), R - 55, y + 12, { width: 55, align: "right" });
      y += 48;
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

    if (batch.notes) {
      y += 154;
      doc.fillColor(navy).font("Helvetica-Bold").fontSize(11).text("Administratieve notitie", L, y);
      doc.fillColor("#111827").font("Helvetica").fontSize(9).text(batch.notes, L, y + 18, { width: W });
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
  const filename = `verzamelfactuur-${batch.id.slice(0, 8)}.pdf`;

  return new NextResponse(new Uint8Array(pdfBuffer), {
    headers: {
      "Content-Type":        "application/pdf",
      "Content-Disposition": `inline; filename="${filename}"`,
      "Content-Length":      String(pdfBuffer.byteLength),
    },
  });
}
