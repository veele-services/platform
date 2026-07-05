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
import {
  PDF_BRAND,
  PDF_PAGE,
  drawPdfFooter,
  drawPdfHeader,
  drawPdfRecipientPanel,
  drawPdfSectionTitle,
  drawPdfTableHeader,
  drawPdfTotalPanel,
  ensurePdfPage,
  formatPdfDate,
  formatPdfEuroCents,
  sanitizePdfFilename,
} from "@/lib/pdf-style";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

    const L = PDF_PAGE.left;
    const R = PDF_PAGE.right;
    const W = R - L;
    let y = 148;

    drawPdfHeader(doc, { title: "VERZAMELFACTUUR", reference: batch.id.slice(0, 8).toUpperCase() });
    y = drawPdfRecipientPanel(doc, {
      y,
      label: "Klant",
      name: batch.customerName ?? "-",
      lines: [
        batch.customerAddress ?? "",
        [batch.customerPostalCode, batch.customerCity].filter(Boolean).join(" "),
      ],
      height: 118,
      meta: [
      ["Status", String(batch.status)],
      ["Aangemaakt", formatPdfDate(batch.createdAt)],
      ["Periode", batch.periodStart || batch.periodEnd ? `${formatPdfDate(batch.periodStart)} t/m ${formatPdfDate(batch.periodEnd)}` : "-"],
      ["Object", batch.objectName ?? "-"],
      ["Facturen", String(items.length)],
      ],
    });

    y = drawPdfSectionTitle(doc, "Gebundelde facturen", y);
    y = drawPdfTableHeader(doc, y, [
      { label: "Factuur", x: L + 10, width: 80 },
      { label: "Opdracht", x: L + 95, width: 170 },
      { label: "Datum", x: R - 190, width: 70 },
      { label: "Object", x: R - 116, width: 62 },
      { label: "Totaal", x: R - 55, width: 55, align: "right" },
    ]);

    for (const item of items) {
      y = ensurePdfPage(doc, y, 46);
      doc.roundedRect(L, y, W, 40, 8).fill("#FFFFFF").strokeColor(PDF_BRAND.border).stroke();
      doc.fillColor(PDF_BRAND.cyan).font("Helvetica-Bold").fontSize(8).text(item.invoiceNumber, L + 10, y + 12, { width: 80 });
      doc.fillColor(PDF_BRAND.ink).font("Helvetica-Bold").fontSize(8).text(item.assignmentCode, L + 95, y + 9, { width: 70 });
      doc.fillColor(PDF_BRAND.ink).font("Helvetica").fontSize(8).text(item.assignmentTitle, L + 166, y + 9, { width: 98 });
      doc.fillColor(PDF_BRAND.slate).text(formatPdfDate(item.scheduledDate), R - 190, y + 12, { width: 70 });
      doc.text(item.objectName ?? "-", R - 116, y + 12, { width: 62 });
      doc.fillColor(PDF_BRAND.ink).font("Helvetica-Bold").text(formatPdfEuroCents(item.itemAmountCents), R - 55, y + 12, { width: 55, align: "right" });
      y += 48;
    }

    y += 10;
    y = ensurePdfPage(doc, y, 145);
    y = drawPdfTotalPanel(doc, y, [
      { label: "Subtotaal excl. BTW", value: formatPdfEuroCents(batch.subtotalCents) },
      { label: "BTW", value: formatPdfEuroCents(batch.vatCents) },
      { label: "Korting", value: `- ${formatPdfEuroCents(batch.discountCents)}` },
      { label: "Toeslag", value: formatPdfEuroCents(batch.surchargeCents) },
      { label: "Totaal te betalen", value: formatPdfEuroCents(batch.amountCents), strong: true },
    ]);

    if (batch.notes) {
      y = ensurePdfPage(doc, y, 80);
      doc.fillColor(PDF_BRAND.ink).font("Helvetica-Bold").fontSize(11).text("Administratieve notitie", L, y);
      doc.fillColor(PDF_BRAND.ink).font("Helvetica").fontSize(9).text(batch.notes, L, y + 18, { width: W });
    }

    drawPdfFooter(doc, "Veele Services - Verzamelfactuur gegenereerd vanuit Fieldgrid.");
    doc.end();
  });

  const pdfBuffer = Buffer.concat(chunks);
  const filename = `${sanitizePdfFilename(`verzamelfactuur-${batch.id.slice(0, 8)}`, "verzamelfactuur")}.pdf`;

  return new NextResponse(new Uint8Array(pdfBuffer), {
    headers: {
      "Content-Type":        "application/pdf",
      "Content-Disposition": `inline; filename="${filename}"`,
      "Content-Length":      String(pdfBuffer.byteLength),
    },
  });
}
