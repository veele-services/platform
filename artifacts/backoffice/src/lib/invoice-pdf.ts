import PDFDocument from "pdfkit";
import type { InvoiceDetail } from "@/app/actions/invoices";
import { createQrMatrix } from "@/lib/qr-code";
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
  formatPdfEuro,
  parsePdfMoney,
} from "@/lib/pdf-style";

export type InvoicePdfOptions = {
  paymentQrUrl?: string | null;
};

function categoryLabel(category: string): string {
  if (category === "extra_work") return "Meerwerk";
  if (category === "material") return "Materiaal/verbruik";
  return "Werkzaamheden";
}

function drawPaymentQr(doc: PDFKit.PDFDocument, value: string, x: number, y: number, size: number): boolean {
  let matrix: boolean[][];
  try {
    matrix = createQrMatrix(value);
  } catch {
    return false;
  }

  const quietZone = 4;
  const moduleSize = size / (matrix.length + quietZone * 2);
  doc.save();
  doc.roundedRect(x, y, size, size, 8).fill("#FFFFFF").strokeColor(PDF_BRAND.border).stroke();
  doc.fillColor(PDF_BRAND.ink);
  matrix.forEach((row, rowIndex) => {
    row.forEach((dark, columnIndex) => {
      if (!dark) return;
      doc.rect(
        x + (columnIndex + quietZone) * moduleSize,
        y + (rowIndex + quietZone) * moduleSize,
        Math.ceil(moduleSize * 100) / 100,
        Math.ceil(moduleSize * 100) / 100,
      ).fill();
    });
  });
  doc.restore();
  return true;
}

function drawPaymentBlock(doc: PDFKit.PDFDocument, invoice: InvoiceDetail, y: number, paymentQrUrl: string | null | undefined): number {
  const settings = invoice.paymentSettings;
  const paymentUrl = invoice.paymentUrl?.trim();
  if (!paymentUrl || !settings) return y;
  const showLink = settings.showPaymentLinkOnInvoice;
  const showQr = settings.showPaymentQrOnInvoice;
  if (!showLink && !showQr) return y;

  const L = PDF_PAGE.left;
  const R = PDF_PAGE.right;
  const W = R - L;
  const qrSize = 82;
  const blockHeight = showQr ? 124 : 88;
  y = ensurePdfPage(doc, y, blockHeight + 18);

  doc.roundedRect(L, y, W, blockHeight, 10).fill("#F8FAFC").strokeColor(PDF_BRAND.border).stroke();
  doc.fillColor(PDF_BRAND.ink).font("Helvetica-Bold").fontSize(12).text(settings.paymentBlockTitle, L + 18, y + 16);
  doc.fillColor(PDF_BRAND.slate).font("Helvetica").fontSize(9).text(settings.paymentBlockText, L + 18, y + 36, {
    width: showQr ? W - qrSize - 56 : W - 36,
    lineGap: 2,
  });

  if (showLink) {
    doc.fillColor(PDF_BRAND.cyan).font("Helvetica-Bold").fontSize(9).text(settings.paymentLinkLabel, L + 18, y + 68, {
      width: 120,
      link: paymentUrl,
      underline: true,
    });
    doc.fillColor(PDF_BRAND.ink).font("Helvetica").fontSize(7).text(paymentUrl, L + 18, y + 84, {
      width: showQr ? W - qrSize - 56 : W - 36,
      lineGap: 1,
    });
  }

  if (showQr) {
    const qrRendered = drawPaymentQr(doc, paymentQrUrl?.trim() || paymentUrl, R - qrSize - 18, y + 18, qrSize);
    doc.fillColor(PDF_BRAND.slate).font("Helvetica").fontSize(7).text(
      qrRendered ? "Scan om te betalen" : "QR-code niet beschikbaar",
      R - qrSize - 18,
      y + qrSize + 24,
      { width: qrSize, align: "center" },
    );
  }

  return y + blockHeight + 14;
}

export async function generateInvoicePdf(invoice: InvoiceDetail, options: InvoicePdfOptions = {}): Promise<Buffer> {
  const brandName = invoice.brandName?.trim() || "Fieldgrid";
  const isFieldgridBrand = brandName.toLowerCase() === "fieldgrid";
  const doc = new PDFDocument({ size: "A4", margin: 55, bufferPages: true });
  const chunks: Buffer[] = [];

  doc.on("data", (chunk: Buffer) => chunks.push(chunk));

  await new Promise<void>((resolve) => {
    doc.on("end", resolve);

    drawPdfHeader(doc, {
      title: "FACTUUR",
      reference: invoice.invoiceNumber,
      brandTitle: brandName.toUpperCase(),
      brandSubtitle: isFieldgridBrand ? "PLATFORM" : "",
    });

    const L = PDF_PAGE.left;
    const R = PDF_PAGE.right;
    const W = R - L;
    let y = 148;

    y = drawPdfRecipientPanel(doc, {
      y,
      label: "Factureren aan",
      name: invoice.customerName,
      lines: [
        invoice.customerAddress ?? "",
        [invoice.customerPostalCode, invoice.customerCity].filter(Boolean).join(" "),
      ],
      meta: [
      ["Factuurdatum", formatPdfDate(invoice.createdAt)],
      ["Vervaldatum", formatPdfDate(invoice.dueDate)],
      ["Opdracht", invoice.assignmentCode],
      ["Object", invoice.objectName ?? "-"],
      ],
    });

    y = drawPdfSectionTitle(doc, "Factuurregels", y);

    const columns = {
      category: L,
      description: L + 88,
      quantity: R - 190,
      unit: R - 130,
      total: R - 62,
    };

    y = drawPdfTableHeader(doc, y, [
      { label: "Soort", x: columns.category + 10, width: 70 },
      { label: "Omschrijving", x: columns.description, width: 180 },
      { label: "Aantal", x: columns.quantity, width: 48, align: "right" },
      { label: "Prijs", x: columns.unit, width: 55, align: "right" },
      { label: "Totaal", x: columns.total, width: 62, align: "right" },
    ]);

    const invoiceableItems = invoice.lineItems.filter((item) => item.invoiceable);
    for (const item of invoiceableItems) {
      y = ensurePdfPage(doc, y, 46);
      const lineTotal = parsePdfMoney(item.price);
      const rowHeight = Math.max(34, doc.heightOfString(item.description, { width: 175 }) + 18);
      doc.roundedRect(L, y, W, rowHeight, 8).fill("#FFFFFF").strokeColor(PDF_BRAND.border).stroke();
      doc.fillColor(PDF_BRAND.cyan).font("Helvetica-Bold").fontSize(7).text(categoryLabel(item.category), columns.category + 10, y + 12, { width: 70 });
      doc.fillColor(PDF_BRAND.ink).font("Helvetica-Bold").fontSize(9).text(item.taskCodeCode ?? "-", columns.description, y + 10, { width: 65 });
      doc.fillColor(PDF_BRAND.ink).font("Helvetica").fontSize(8).text(item.description, columns.description + 70, y + 10, { width: 108 });
      doc.fillColor(PDF_BRAND.slate).font("Helvetica").fontSize(8).text(item.quantity, columns.quantity, y + 12, { width: 48, align: "right" });
      doc.fillColor(PDF_BRAND.ink).text(formatPdfEuro(item.unitPrice), columns.unit, y + 12, { width: 55, align: "right" });
      doc.fillColor(PDF_BRAND.ink).font("Helvetica-Bold").text(formatPdfEuro(lineTotal), columns.total, y + 12, { width: 62, align: "right" });
      y += rowHeight + 8;
    }

    if (invoiceableItems.length === 0) {
      doc.roundedRect(L, y, W, 44, 8).fill("#FFFFFF").strokeColor(PDF_BRAND.border).stroke();
      doc.fillColor(PDF_BRAND.slate).font("Helvetica").fontSize(9).text("Geen factureerbare regels gevonden.", L + 14, y + 15);
      y += 56;
    }

    y = ensurePdfPage(doc, y, 140);
    y += 10;
    y = drawPdfTotalPanel(doc, y, [
      { label: "Subtotaal excl. BTW", value: formatPdfEuro(invoice.amount) },
      { label: `BTW ${invoice.vatPercentage ?? "21"}%`, value: formatPdfEuro(invoice.vatAmount) },
      { label: "Totaal incl. BTW", value: formatPdfEuro(invoice.totalAmount), strong: true },
    ]);

    y = drawPaymentBlock(doc, invoice, y, options.paymentQrUrl);

    if (invoice.notes) {
      y = ensurePdfPage(doc, y, 80);
      doc.fillColor(PDF_BRAND.ink).font("Helvetica-Bold").fontSize(11).text("Toelichting", L, y);
      doc.fillColor(PDF_BRAND.ink).font("Helvetica").fontSize(9).text(invoice.notes, L, y + 18, { width: W, lineGap: 2 });
    }

    drawPdfFooter(doc, `${brandName} - Factuur gegenereerd.`);
    doc.end();
  });

  return Buffer.concat(chunks);
}
