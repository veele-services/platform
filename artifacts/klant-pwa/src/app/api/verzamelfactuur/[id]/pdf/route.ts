export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import PDFDocument from "pdfkit";
import { asc, eq, and, inArray } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  getTenantBranding,
  assignmentsTable,
  customerPaymentBatchItemsTable,
  customerPaymentBatchesTable,
  customersTable,
  invoicesTable,
  objectsTable,
} from "@workspace/db";
import { getMyCustomerIdentity } from "@/actions/customer";
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
  const branding = await getTenantBranding(identity.tenantId);

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
    const L = PDF_PAGE.left;
    const R = PDF_PAGE.right;
    const W = R - L;
    let y = 148;

    const cityLine = [batch.customerPostalCode, batch.customerCity].filter(Boolean).join(" ");
    drawPdfHeader(doc, {
      title: "VERZAMELFACTUUR",
      reference: batch.id.slice(0, 8).toUpperCase(),
      brandTitle: branding.displayName.toUpperCase(),
      brandSubtitle: branding.customBrandingEnabled ? "" : "PLATFORM",
    });
    y = drawPdfRecipientPanel(doc, {
      y,
      label: "Klant",
      name: batch.customerName ?? identity.customerName,
      lines: [batch.customerAddress ?? "", cityLine],
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
      { label: "Factuur", x: L + 10, width: 84 },
      { label: "Opdracht", x: L + 100, width: 178 },
      { label: "Datum", x: R - 145, width: 82 },
      { label: "Totaal", x: R - 62, width: 62, align: "right" },
    ]);

    for (const item of items) {
      y = ensurePdfPage(doc, y, 48);
      doc.roundedRect(L, y, W, 42, 8).fill("#FFFFFF").strokeColor(PDF_BRAND.border).stroke();
      doc.fillColor(PDF_BRAND.cyan).font("Helvetica-Bold").fontSize(8).text(item.invoiceNumber, L + 10, y + 12, { width: 84 });
      doc.fillColor(PDF_BRAND.ink).font("Helvetica-Bold").fontSize(8).text(item.assignmentCode, L + 100, y + 8, { width: 80 });
      doc.fillColor(PDF_BRAND.ink).font("Helvetica").fontSize(8).text(item.assignmentTitle, L + 182, y + 8, { width: 96 });
      doc.fillColor(PDF_BRAND.slate).text(formatPdfDate(item.scheduledDate), R - 145, y + 12, { width: 82 });
      doc.fillColor(PDF_BRAND.ink).font("Helvetica-Bold").text(formatPdfEuroCents(item.itemAmountCents), R - 62, y + 12, { width: 62, align: "right" });
      y += 50;
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

    drawPdfFooter(doc, `${branding.displayName} - Verzamelfactuur gegenereerd.`);
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
