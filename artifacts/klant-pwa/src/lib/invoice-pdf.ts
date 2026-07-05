import PDFDocument from "pdfkit";
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

export type CustomerInvoicePdfLineItem = {
  category: "task" | "extra_work" | "material";
  code: string | null;
  description: string;
  quantity: string;
  unitPrice: string | null;
  price: string | null;
  invoiceable: boolean;
};

export type CustomerInvoicePdfData = {
  invoiceNumber: string;
  customerName: string;
  customerAddress: string | null;
  customerPostalCode: string | null;
  customerCity: string | null;
  assignmentCode: string;
  objectName: string | null;
  amount: string;
  vatPercentage: string;
  vatAmount: string;
  totalAmount: string;
  dueDate: string;
  createdAt: string;
  lineItems: CustomerInvoicePdfLineItem[];
};

function categoryLabel(category: string): string {
  if (category === "extra_work") return "Meerwerk";
  if (category === "material") return "Materiaal/verbruik";
  return "Werkzaamheden";
}

export async function generateCustomerInvoicePdf(invoice: CustomerInvoicePdfData): Promise<Buffer> {
  const doc = new PDFDocument({ size: "A4", margin: 55, bufferPages: true });
  const chunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));

  await new Promise<void>((resolve) => {
    doc.on("end", resolve);

    drawPdfHeader(doc, { title: "FACTUUR", reference: invoice.invoiceNumber });

    const L = PDF_PAGE.left;
    const R = PDF_PAGE.right;
    const W = R - L;
    let y = 148;

    const cityLine = [invoice.customerPostalCode, invoice.customerCity].filter(Boolean).join(" ");
    y = drawPdfRecipientPanel(doc, {
      y,
      label: "Factureren aan",
      name: invoice.customerName,
      lines: [invoice.customerAddress ?? "", cityLine],
      meta: [
      ["Factuurdatum", formatPdfDate(invoice.createdAt)],
      ["Vervaldatum", formatPdfDate(invoice.dueDate)],
      ["Opdracht", invoice.assignmentCode],
      ["Object", invoice.objectName ?? "-"],
      ],
    });

    y = drawPdfSectionTitle(doc, "Factuurregels", y);
    y = drawPdfTableHeader(doc, y, [
      { label: "Soort", x: L + 10, width: 78 },
      { label: "Omschrijving", x: L + 92, width: 205 },
      { label: "Aantal", x: R - 190, width: 48, align: "right" },
      { label: "Prijs", x: R - 130, width: 55, align: "right" },
      { label: "Totaal", x: R - 62, width: 62, align: "right" },
    ]);

    const items = invoice.lineItems.filter((item) => item.invoiceable);
    for (const item of items) {
      y = ensurePdfPage(doc, y, 46);
      const rowHeight = Math.max(36, doc.heightOfString(item.description, { width: 132 }) + 20);
      doc.roundedRect(L, y, W, rowHeight, 8).fill("#FFFFFF").strokeColor(PDF_BRAND.border).stroke();
      doc.fillColor(PDF_BRAND.cyan).font("Helvetica-Bold").fontSize(7).text(categoryLabel(item.category), L + 10, y + 13, { width: 78 });
      doc.fillColor(PDF_BRAND.ink).font("Helvetica-Bold").fontSize(8).text(item.code ?? "-", L + 92, y + 10, { width: 62 });
      doc.fillColor(PDF_BRAND.ink).font("Helvetica").fontSize(8).text(item.description, L + 158, y + 10, { width: 135 });
      doc.fillColor(PDF_BRAND.slate).text(item.quantity, R - 190, y + 13, { width: 48, align: "right" });
      doc.fillColor(PDF_BRAND.ink).text(formatPdfEuro(item.unitPrice), R - 130, y + 13, { width: 55, align: "right" });
      doc.fillColor(PDF_BRAND.ink).font("Helvetica-Bold").text(formatPdfEuro(item.price), R - 62, y + 13, { width: 62, align: "right" });
      y += rowHeight + 8;
    }

    if (items.length === 0) {
      doc.roundedRect(L, y, W, 44, 8).fill("#FFFFFF").strokeColor(PDF_BRAND.border).stroke();
      doc.fillColor(PDF_BRAND.slate).font("Helvetica").fontSize(9).text("Geen factureerbare regels gevonden.", L + 14, y + 15);
      y += 56;
    }

    const lineTotal = items.reduce((sum, item) => sum + parsePdfMoney(item.price), 0);
    y = ensurePdfPage(doc, y, 140);
    y += 10;
    y = drawPdfTotalPanel(doc, y, [
      { label: "Subtotaal excl. BTW", value: formatPdfEuro(invoice.amount) },
      { label: `BTW ${invoice.vatPercentage ?? "21"}%`, value: formatPdfEuro(invoice.vatAmount) },
      { label: "Totaal incl. BTW", value: formatPdfEuro(invoice.totalAmount), strong: true },
    ]);

    if (Math.abs(lineTotal - parsePdfMoney(invoice.amount)) > 0.01) {
      y = ensurePdfPage(doc, y, 48);
      doc.fillColor(PDF_BRAND.slate).font("Helvetica").fontSize(8).text(
        "Let op: het factuurbedrag kan handmatig zijn gecorrigeerd ten opzichte van de som van de regels.",
        L,
        y,
        { width: W },
      );
    }

    drawPdfFooter(doc, "Veele Services - Bedankt voor uw opdracht.");
    doc.end();
  });

  return Buffer.concat(chunks);
}
