import PDFDocument from "pdfkit";
import type { QuoteDetail } from "@/app/actions/quotes";
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

function statusLabel(status: string, isExpired: boolean): string {
  if (isExpired) return "Verlopen";
  if (status === "draft") return "Concept";
  if (status === "sent") return "Verzonden";
  if (status === "approved") return "Goedgekeurd";
  if (status === "rejected") return "Afgewezen";
  if (status === "expired") return "Verlopen";
  return status;
}

export async function generateQuotePdf(quote: QuoteDetail): Promise<Buffer> {
  const doc = new PDFDocument({ size: "A4", margin: 55, bufferPages: true });
  const chunks: Buffer[] = [];

  doc.on("data", (chunk: Buffer) => chunks.push(chunk));

  await new Promise<void>((resolve) => {
    doc.on("end", resolve);

    drawPdfHeader(doc, { title: "OFFERTE", reference: quote.quoteNumber });

    const L = PDF_PAGE.left;
    const R = PDF_PAGE.right;
    const W = R - L;
    let y = 148;

    y = drawPdfRecipientPanel(doc, {
      y,
      label: "Offerte voor",
      name: quote.customerName,
      lines: [quote.customerAddress ?? "", quote.customerCity ?? "", quote.customerEmail ?? ""],
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
      "Deze offerte is gebaseerd op de geselecteerde opdrachtregels en taakcodes. Bedragen zijn exclusief BTW tenzij anders vermeld.",
      L + 18,
      y + 34,
      { width: W - 36, lineGap: 2 },
    );
    y += 88;

    y = drawPdfSectionTitle(doc, "Offerte regels", y);
    const columns = {
      code: L + 10,
      task: L + 92,
      status: R - 178,
      amount: R - 78,
    };

    y = drawPdfTableHeader(doc, y, [
      { label: "Code", x: columns.code, width: 70 },
      { label: "Taak", x: columns.task, width: 200 },
      { label: "Type", x: columns.status, width: 90 },
      { label: "Bedrag", x: columns.amount, width: 78, align: "right" },
    ]);

    const rows = quote.lineItems.length > 0 ? quote.lineItems : [{ taskCodeCode: null, taskCodeName: "Geen regels", price: "0", invoiceable: false }];
    for (const item of rows) {
      y = ensurePdfPage(doc, y, 44);
      const taskName = item.taskCodeName ?? "-";
      const rowHeight = Math.max(38, doc.heightOfString(taskName, { width: 190 }) + 20);

      doc.roundedRect(L, y, W, rowHeight, 8).fill("#FFFFFF").strokeColor(PDF_BRAND.border).stroke();
      doc.fillColor(PDF_BRAND.cyan).font("Helvetica-Bold").fontSize(8).text(item.taskCodeCode ?? "-", columns.code, y + 13, { width: 70 });
      doc.fillColor(PDF_BRAND.ink).font("Helvetica").fontSize(9).text(taskName, columns.task, y + 11, { width: 200 });
      doc.fillColor(item.invoiceable ? PDF_BRAND.slate : PDF_BRAND.muted).font("Helvetica").fontSize(8).text(
        item.invoiceable ? "Factureerbaar" : "Niet factureerbaar",
        columns.status,
        y + 13,
        { width: 90 },
      );
      doc.fillColor(item.invoiceable ? PDF_BRAND.ink : PDF_BRAND.muted).font("Helvetica-Bold").fontSize(9).text(
        item.invoiceable ? formatPdfEuro(item.price) : "-",
        columns.amount,
        y + 13,
        { width: 78, align: "right" },
      );
      y += rowHeight + 8;
    }

    y = ensurePdfPage(doc, y, 120);
    y += 8;
    y = drawPdfTotalPanel(doc, y, [
      { label: "Totaal excl. BTW", value: formatPdfEuro(quote.amount), strong: true },
    ]);

    if (quote.notes) {
      y = ensurePdfPage(doc, y, 92);
      doc.roundedRect(L, y, W, 72, 10).fill(PDF_BRAND.soft).strokeColor(PDF_BRAND.border).stroke();
      doc.fillColor(PDF_BRAND.ink).font("Helvetica-Bold").fontSize(11).text("Toelichting", L + 16, y + 14);
      doc.fillColor(PDF_BRAND.ink).font("Helvetica").fontSize(9).text(quote.notes, L + 16, y + 32, { width: W - 32, lineGap: 2 });
      y += 88;
    }

    const calculatedTotal = quote.lineItems
      .filter((item) => item.invoiceable)
      .reduce((total, item) => total + parsePdfMoney(item.price), 0);
    if (Math.abs(calculatedTotal - parsePdfMoney(quote.amount)) > 0.01) {
      y = ensurePdfPage(doc, y, 52);
      doc.fillColor(PDF_BRAND.slate).font("Helvetica").fontSize(8).text(
        "Let op: het offertebedrag kan handmatig zijn gecorrigeerd ten opzichte van de som van de regels.",
        L,
        y,
        { width: W },
      );
    }

    drawPdfFooter(doc, "Veele Services - Offerte gegenereerd vanuit Fieldgrid.");
    doc.end();
  });

  return Buffer.concat(chunks);
}
