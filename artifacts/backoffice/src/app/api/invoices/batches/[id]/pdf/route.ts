import { NextResponse } from "next/server";
import PDFDocument from "pdfkit";
import { and, asc, eq } from "drizzle-orm";
import { hasPermission } from "@/lib/auth/permissions";
import { requireCurrentTenantId } from "@/lib/auth/tenant";
import { requireSensitiveRuntimeAccess } from "@/lib/security/sensitive-runtime";
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
import {
  PDF_BRAND,
  PDF_PAGE,
  drawPdfFooter,
  drawPdfHeader,
  drawPdfRecipientPanel,
  drawPdfSectionTitle,
  drawPdfTableHeader,
  drawPdfTotalPanel,
  formatPdfDate,
  formatPdfEuroCents,
  sanitizePdfFilename,
} from "@/lib/pdf-style";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function displayInvoiceNumber(
  value: string | null | undefined,
  fallback = "Factuur",
): string {
  return value?.trim() || fallback;
}

const COLLECTION_COLUMNS = [
  { label: "Factuurnummer", x: PDF_PAGE.left + 12, width: 88 },
  { label: "Omschrijving", x: PDF_PAGE.left + 112, width: 205 },
  { label: "Factuurdatum", x: PDF_PAGE.right - 152, width: 78 },
  {
    label: "Bedrag",
    x: PDF_PAGE.right - 70,
    width: 70,
    align: "right" as const,
  },
];

const BATCH_STATUS_LABELS: Record<string, string> = {
  active: "Actief",
  canceled: "Geannuleerd",
  cancelled: "Geannuleerd",
  draft: "Concept",
  expired: "Verlopen",
  failed: "Mislukt",
  open: "Openstaand",
  paid: "Betaald",
  partially_paid: "Deels betaald",
  sent: "Verzonden",
};

function displayBatchStatus(status: string): string {
  return BATCH_STATUS_LABELS[status] ?? status;
}

function drawCollectionContinuation(
  doc: PDFKit.PDFDocument,
  reference: string,
): number {
  doc
    .fillColor(PDF_BRAND.slate)
    .font("Helvetica-Bold")
    .fontSize(7)
    .text("VERZAMELFACTUUR · VERVOLG", PDF_PAGE.left, 55, {
      characterSpacing: 1,
      lineBreak: false,
    });
  doc
    .fillColor(PDF_BRAND.ink)
    .font("Helvetica-Bold")
    .fontSize(8)
    .text(reference, PDF_PAGE.right - 180, 55, {
      width: 180,
      align: "right",
      lineBreak: false,
    });
  doc
    .moveTo(PDF_PAGE.left, 76)
    .lineTo(PDF_PAGE.right, 76)
    .strokeColor(PDF_BRAND.border)
    .lineWidth(0.7)
    .stroke();
  return drawPdfTableHeader(doc, 88, COLLECTION_COLUMNS);
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const canRead = await hasPermission("invoices", "read");
  if (!canRead) return new NextResponse("Forbidden", { status: 403 });

  const { id } = await params;
  const tenantId = await requireCurrentTenantId();
  await requireSensitiveRuntimeAccess({
    tenantId,
    scope: "tenant_invoices",
    accessLevel: "export",
    resourceType: "customer_payment_batches",
    resourceId: id,
    exportDownload: true,
    metadata: { format: "pdf" },
  });
  const branding = await getTenantBranding(tenantId);

  const [batch] = await db
    .select({
      id: customerPaymentBatchesTable.id,
      collectionNumber: customerPaymentBatchesTable.collectionNumber,
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
      objectName: objectsTable.name,
      createdAt: customerPaymentBatchesTable.createdAt,
    })
    .from(customerPaymentBatchesTable)
    .innerJoin(
      customersTable,
      eq(customersTable.id, customerPaymentBatchesTable.customerId),
    )
    .leftJoin(
      objectsTable,
      eq(objectsTable.id, customerPaymentBatchesTable.objectId),
    )
    .where(
      and(
        eq(customerPaymentBatchesTable.id, id),
        eq(customerPaymentBatchesTable.tenantId, tenantId),
      ),
    )
    .limit(1);

  if (!batch) return new NextResponse("Not found", { status: 404 });

  const items = await db
    .select({
      invoiceId: invoicesTable.id,
      invoiceNumber: invoicesTable.invoiceNumber,
      invoiceNumberSnapshot:
        customerPaymentBatchItemsTable.invoiceNumberSnapshot,
      invoiceDateSnapshot: customerPaymentBatchItemsTable.invoiceDateSnapshot,
      invoiceDate: invoicesTable.invoiceDate,
      invoiceCreatedAt: invoicesTable.createdAt,
      assignmentCode: assignmentsTable.code,
      assignmentTitle: assignmentsTable.title,
      objectName: objectsTable.name,
      itemAmountCents: customerPaymentBatchItemsTable.amountCents,
    })
    .from(customerPaymentBatchItemsTable)
    .innerJoin(
      invoicesTable,
      eq(invoicesTable.id, customerPaymentBatchItemsTable.invoiceId),
    )
    .innerJoin(
      assignmentsTable,
      eq(assignmentsTable.id, invoicesTable.assignmentId),
    )
    .leftJoin(objectsTable, eq(objectsTable.id, assignmentsTable.objectId))
    .where(
      and(
        eq(customerPaymentBatchItemsTable.batchId, id),
        eq(customerPaymentBatchItemsTable.tenantId, tenantId),
      ),
    )
    .orderBy(
      asc(assignmentsTable.scheduledDate),
      asc(invoicesTable.invoiceNumber),
    );

  const doc = new PDFDocument({ size: "A4", margin: 55, bufferPages: true });
  const chunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));

  await new Promise<void>((resolve) => {
    doc.on("end", resolve);

    const L = PDF_PAGE.left;
    const R = PDF_PAGE.right;
    const W = R - L;
    let y = 132;
    const reference =
      batch.collectionNumber?.trim() || batch.id.slice(0, 8).toUpperCase();

    drawPdfHeader(doc, {
      title: "VERZAMELFACTUUR",
      reference,
      brandTitle: branding.displayName.toUpperCase(),
      brandSubtitle: branding.customBrandingEnabled ? "" : "PLATFORM",
      primaryColor: branding.primaryColor,
      accentColor: branding.accentColor,
    });
    y = drawPdfRecipientPanel(doc, {
      y,
      label: "Klant",
      name: batch.customerName ?? "-",
      lines: [
        batch.customerAddress ?? "",
        [batch.customerPostalCode, batch.customerCity]
          .filter(Boolean)
          .join(" "),
      ],
      height: 104,
      meta: [
        ["Status", displayBatchStatus(batch.status)],
        ["Documentdatum", formatPdfDate(batch.createdAt)],
        [
          "Periode",
          batch.periodStart || batch.periodEnd
            ? `${formatPdfDate(batch.periodStart)} t/m ${formatPdfDate(batch.periodEnd)}`
            : "-",
        ],
        ["Object", batch.objectName ?? "Alle objecten"],
        ["Facturen", String(items.length)],
      ],
    });

    y = drawPdfSectionTitle(doc, "Gebundelde facturen", y);
    y = drawPdfTableHeader(doc, y, COLLECTION_COLUMNS);

    if (items.length === 0) {
      doc
        .fillColor(PDF_BRAND.slate)
        .font("Helvetica")
        .fontSize(9)
        .text("Er zijn geen facturen in deze verzamelfactuur.", L + 12, y + 8);
      y += 40;
    }

    for (const [index, item] of items.entries()) {
      const description = [
        item.assignmentTitle,
        item.objectName ? `Object: ${item.objectName}` : null,
      ]
        .filter(Boolean)
        .join("\n");
      doc.font("Helvetica").fontSize(8);
      const rowHeight = Math.max(
        46,
        doc.heightOfString(description, { width: 205 }) + 24,
      );
      if (y + rowHeight > PDF_PAGE.bottom) {
        doc.addPage();
        y = drawCollectionContinuation(doc, reference);
      }
      if (index % 2 === 1) doc.rect(L, y, W, rowHeight).fill(PDF_BRAND.soft);
      doc
        .moveTo(L, y + rowHeight)
        .lineTo(R, y + rowHeight)
        .strokeColor(PDF_BRAND.border)
        .lineWidth(0.5)
        .stroke();
      doc
        .fillColor(PDF_BRAND.cyan)
        .font("Helvetica-Bold")
        .fontSize(8)
        .text(
          displayInvoiceNumber(
            item.invoiceNumberSnapshot ?? item.invoiceNumber,
            item.invoiceId.slice(0, 8),
          ),
          L + 12,
          y + 13,
          { width: 88 },
        );
      doc
        .fillColor(PDF_BRAND.slate)
        .font("Helvetica-Bold")
        .fontSize(7)
        .text(item.assignmentCode, L + 112, y + 9, { width: 205 });
      doc
        .fillColor(PDF_BRAND.ink)
        .font("Helvetica")
        .fontSize(8)
        .text(description, L + 112, y + 20, { width: 205 });
      doc
        .fillColor(PDF_BRAND.slate)
        .font("Helvetica")
        .fontSize(8)
        .text(
          formatPdfDate(
            item.invoiceDateSnapshot ??
              item.invoiceDate ??
              item.invoiceCreatedAt,
          ),
          R - 152,
          y + 13,
          { width: 78 },
        );
      doc
        .fillColor(PDF_BRAND.ink)
        .font("Helvetica-Bold")
        .fontSize(8)
        .text(formatPdfEuroCents(item.itemAmountCents), R - 70, y + 13, {
          width: 70,
          align: "right",
        });
      y += rowHeight;
    }

    y += 18;
    const totalRows = [
      {
        label: "Subtotaal excl. BTW",
        value: formatPdfEuroCents(batch.subtotalCents),
      },
      { label: "BTW", value: formatPdfEuroCents(batch.vatCents) },
      ...(batch.discountCents > 0
        ? [
            {
              label: "Korting",
              value: `- ${formatPdfEuroCents(batch.discountCents)}`,
            },
          ]
        : []),
      ...(batch.surchargeCents > 0
        ? [
            {
              label: "Toeslag",
              value: formatPdfEuroCents(batch.surchargeCents),
            },
          ]
        : []),
      {
        label: "Totaal te betalen",
        value: formatPdfEuroCents(batch.amountCents),
        strong: true as const,
      },
    ];
    if (y + 55 + totalRows.length * 19 > PDF_PAGE.bottom) {
      doc.addPage();
      y = drawPdfSectionTitle(doc, "Samenvatting", 55);
    }
    drawPdfTotalPanel(doc, y, totalRows);

    drawPdfFooter(
      doc,
      `${branding.displayName} - Verzamelfactuur gegenereerd.`,
    );
    doc.end();
  });

  const pdfBuffer = Buffer.concat(chunks);
  const filenameReference =
    batch.collectionNumber?.trim() || batch.id.slice(0, 8);
  const filename = `${sanitizePdfFilename(`verzamelfactuur-${filenameReference}`, "verzamelfactuur")}.pdf`;

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
