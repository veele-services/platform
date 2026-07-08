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

export type CustomerQuotePdfLineItem = {
  code: string | null;
  name: string | null;
  price: string | null;
  invoiceable: boolean;
};

export type CustomerQuotePdfData = {
  brandName?: string | null;
  quoteNumber: string;
  customerName: string;
  customerAddress: string | null;
  customerPostalCode: string | null;
  customerCity: string | null;
  assignmentCode: string;
  assignmentTitle: string;
  amount: string;
  validityDate: string;
  status: string;
  isExpired: boolean;
  createdAt: string;
  lineItems: CustomerQuotePdfLineItem[];
};

function statusLabel(status: string, isExpired: boolean): string {
  if (isExpired) return "Verlopen";
  if (status === "sent") return "Ter beoordeling";
  if (status === "approved") return "Goedgekeurd";
  if (status === "rejected") return "Afgewezen";
  if (status === "expired") return "Verlopen";
  return status;
}

export async function generateCustomerQuotePdf(quote: CustomerQuotePdfData): Promise<Buffer> {
  const brandName = quote.brandName?.trim() || "Fieldgrid";
  const isFieldgridBrand = brandName.toLowerCase() === "fieldgrid";
  const doc = new PDFDocument({ size: "A4", margin: 55, bufferPages: true });
  const chunks: Buffer[] = [];

  doc.on("data", (chunk: Buffer) => chunks.push(chunk));

  await new Promise<void>((resolve) => {
    doc.on("end", resolve);

    drawPdfHeader(doc, {
      title: "OFFERTE",
      reference: quote.quoteNumber,
      brandTitle: brandName.toUpperCase(),
      brandSubtitle: isFieldgridBrand ? "PLATFORM" : "",
    });

    const L = PDF_PAGE.left;
    const R = PDF_PAGE.right;
    const W = R - L;
    let y = 148;
    const cityLine = [quote.customerPostalCode, quote.customerCity].filter(Boolean).join(" ");

    y = drawPdfRecipientPanel(doc, {
      y,
      label: "Offerte voor",
      name: quote.customerName,
      lines: [quote.customerAddress ?? "", cityLine],
      meta: [
        ["Status", statusLabel(quote.status, quote.isExpired)],
        ["Offertedatum", formatPdfDate(quote.createdAt)],
        ["Geldig tot", formatPdfDate(quote.validityDate)],
        ["Opdracht", quote.assignmentCode],
      ],
    });

    doc.roundedRect(L, y, W, 64, 10).fill(PDF_BRAND.cyanSoft).strokeColor("#B6F4EF").stroke();
    doc.fillColor(PDF_BRAND.blue).font("Helvetica-Bold").fontSize(11).text(quote.assignmentTitle || "Opdracht", L + 18, y + 14, {
      width: W - 36,
    });
    doc.fillColor(PDF_BRAND.slate).font("Helvetica").fontSize(9).text(
      "Controleer deze offerte zorgvuldig. U kunt de offerte digitaal goedkeuren of afwijzen in het klantportaal.",
      L + 18,
      y + 34,
      { width: W - 36, lineGap: 2 },
    );
    y += 88;

    y = drawPdfSectionTitle(doc, "Offerte regels", y);
    y = drawPdfTableHeader(doc, y, [
      { label: "Code", x: L + 10, width: 70 },
      { label: "Taak", x: L + 92, width: 230 },
      { label: "Type", x: R - 178, width: 90 },
      { label: "Bedrag", x: R - 78, width: 78, align: "right" },
    ]);

    const rows = quote.lineItems.length > 0
      ? quote.lineItems
      : [{ code: null, name: "Geen regels", price: "0", invoiceable: false }];

    for (const item of rows) {
      y = ensurePdfPage(doc, y, 46);
      const taskName = item.name ?? "-";
      const rowHeight = Math.max(38, doc.heightOfString(taskName, { width: 220 }) + 20);

      doc.roundedRect(L, y, W, rowHeight, 8).fill("#FFFFFF").strokeColor(PDF_BRAND.border).stroke();
      doc.fillColor(PDF_BRAND.cyan).font("Helvetica-Bold").fontSize(8).text(item.code ?? "-", L + 10, y + 13, { width: 70 });
      doc.fillColor(PDF_BRAND.ink).font("Helvetica").fontSize(9).text(taskName, L + 92, y + 11, { width: 230 });
      doc.fillColor(item.invoiceable ? PDF_BRAND.slate : PDF_BRAND.muted).font("Helvetica").fontSize(8).text(
        item.invoiceable ? "Factureerbaar" : "Niet factureerbaar",
        R - 178,
        y + 13,
        { width: 90 },
      );
      doc.fillColor(item.invoiceable ? PDF_BRAND.ink : PDF_BRAND.muted).font("Helvetica-Bold").fontSize(9).text(
        item.invoiceable ? formatPdfEuro(item.price) : "-",
        R - 78,
        y + 13,
        { width: 78, align: "right" },
      );
      y += rowHeight + 8;
    }

    const calculatedTotal = quote.lineItems
      .filter((item) => item.invoiceable)
      .reduce((total, item) => total + parsePdfMoney(item.price), 0);

    y = ensurePdfPage(doc, y, 120);
    y += 8;
    y = drawPdfTotalPanel(doc, y, [
      { label: "Totaal excl. BTW", value: formatPdfEuro(quote.amount), strong: true },
    ]);

    if (Math.abs(calculatedTotal - parsePdfMoney(quote.amount)) > 0.01) {
      y = ensurePdfPage(doc, y, 48);
      doc.fillColor(PDF_BRAND.slate).font("Helvetica").fontSize(8).text(
        "Let op: het offertebedrag kan handmatig zijn gecorrigeerd ten opzichte van de som van de regels.",
        L,
        y,
        { width: W },
      );
    }

    drawPdfFooter(doc, `${brandName} - Offerte gegenereerd.`);
    doc.end();
  });

  return Buffer.concat(chunks);
}
