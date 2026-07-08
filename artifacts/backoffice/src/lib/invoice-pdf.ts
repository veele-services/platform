import PDFDocument from "pdfkit";
import type { InvoiceDetail } from "@/app/actions/invoices";
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

function categoryLabel(category: string): string {
  if (category === "extra_work") return "Meerwerk";
  if (category === "material") return "Materiaal/verbruik";
  return "Werkzaamheden";
}

export async function generateInvoicePdf(invoice: InvoiceDetail): Promise<Buffer> {
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
