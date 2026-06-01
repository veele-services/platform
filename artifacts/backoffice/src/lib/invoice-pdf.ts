import PDFDocument from "pdfkit";
import type { InvoiceDetail } from "@/app/actions/invoices";

function fmtDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("nl-NL", { day: "numeric", month: "long", year: "numeric" });
}

function fmtEur(val: string | null | undefined): string {
  if (!val) return "€ 0,00";
  return parseFloat(val).toLocaleString("nl-NL", {
    style:    "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
  });
}

export async function generateInvoicePdf(invoice: InvoiceDetail): Promise<Buffer> {
  const doc = new PDFDocument({ size: "A4", margin: 55, bufferPages: true });
  const chunks: Buffer[] = [];

  doc.on("data", (chunk: Buffer) => chunks.push(chunk));

  await new Promise<void>((resolve) => {
    doc.on("end", resolve);

    const PRIMARY   = "#081D3A";
    const SECONDARY = "#64748B";
    const MUTED     = "#CBD5E1";
    const ACCENT    = "#1A6BFA";

    const L = 55;
    const R = 540;

    doc
      .fontSize(22)
      .fillColor(ACCENT)
      .font("Helvetica-Bold")
      .text("Veele", L, 55);

    doc
      .fontSize(9)
      .fillColor(SECONDARY)
      .font("Helvetica")
      .text("Serviceplatform", L, 82);

    doc
      .fontSize(20)
      .fillColor(PRIMARY)
      .font("Helvetica-Bold")
      .text("FACTUUR", 350, 55, { width: 190, align: "right" });

    let y = 105;
    const labelX = 350;
    const valX   = 450;

    const createdDateStr = invoice.createdAt.slice(0, 10);
    const meta: [string, string][] = [
      ["Factuurnummer", invoice.invoiceNumber],
      ["Factuurdatum",  fmtDate(createdDateStr)],
      ["Vervaldatum",   fmtDate(invoice.dueDate)],
    ];

    for (const [label, value] of meta) {
      doc.fontSize(9).fillColor(SECONDARY).font("Helvetica").text(label, labelX, y, { width: 90 });
      doc.fontSize(9).fillColor(PRIMARY).font("Helvetica").text(value, valX, y, { width: 95 });
      y += 15;
    }

    doc
      .fontSize(9)
      .fillColor(SECONDARY)
      .font("Helvetica")
      .text("Aan:", L, 105);

    doc
      .fontSize(10)
      .fillColor(PRIMARY)
      .font("Helvetica-Bold")
      .text(invoice.customerName, L, 120, { width: 250 });

    let custY = 136;
    doc.fontSize(9).font("Helvetica").fillColor(SECONDARY);
    if (invoice.customerAddress) { doc.text(invoice.customerAddress, L, custY, { width: 250 }); custY += 13; }
    if (invoice.customerCity)    { doc.text(invoice.customerCity,    L, custY, { width: 250 }); }

    const tableTopY = 190;
    doc.moveTo(L, tableTopY).lineTo(R, tableTopY).strokeColor(MUTED).lineWidth(1).stroke();

    const colCode  = L;
    const colName  = L + 60;
    const colQty   = R - 200;
    const colUnit  = R - 140;
    const colTotal = R - 75;

    const hdrY = tableTopY + 8;
    doc.fontSize(8).fillColor(SECONDARY).font("Helvetica-Bold");
    doc.text("Code",         colCode,  hdrY, { width: 55 });
    doc.text("Omschrijving", colName,  hdrY, { width: 130 });
    doc.text("Aantal",       colQty,   hdrY, { width: 55, align: "right" });
    doc.text("Prijs/st.",    colUnit,  hdrY, { width: 60, align: "right" });
    doc.text("Totaal",       colTotal, hdrY, { width: 75, align: "right" });

    const hdrLineY = hdrY + 14;
    doc.moveTo(L, hdrLineY).lineTo(R, hdrLineY).strokeColor(MUTED).lineWidth(0.5).stroke();

    let rowY = hdrLineY + 8;
    doc.fontSize(9).font("Helvetica");

    const invoiceableItems = invoice.lineItems.filter((item) => item.invoiceable);
    for (const item of invoiceableItems) {
      if (rowY > 680) break;
      const qty       = 1;
      const unitPrice = parseFloat(item.price ?? "0");
      const lineTotal = qty * unitPrice;
      doc.fillColor(SECONDARY).text(item.taskCodeCode ?? "—", colCode,  rowY, { width: 55 });
      doc.fillColor(PRIMARY).text(item.taskCodeName ?? "—",   colName,  rowY, { width: 130 });
      doc.fillColor(SECONDARY).text(String(qty),              colQty,   rowY, { width: 55, align: "right" });
      doc.fillColor(PRIMARY).text(fmtEur(item.price),         colUnit,  rowY, { width: 60, align: "right" });
      doc.fillColor(PRIMARY).text(fmtEur(item.price ? String(lineTotal) : null), colTotal, rowY, { width: 75, align: "right" });
      rowY += 18;
    }

    const divY = rowY + 8;
    doc.moveTo(L, divY).lineTo(R, divY).strokeColor(MUTED).lineWidth(0.5).stroke();

    const totLabelX = 360;
    const totValX   = R - 80;
    let   totY      = divY + 12;

    doc.fontSize(9).fillColor(SECONDARY).font("Helvetica");
    doc.text("Subtotaal (excl. btw)",           totLabelX, totY, { width: 100 });
    doc.fillColor(PRIMARY).text(fmtEur(invoice.amount), totValX, totY, { width: 80, align: "right" });
    totY += 16;

    doc.fillColor(SECONDARY).text(`Btw ${invoice.vatPercentage ?? "21"}%`, totLabelX, totY, { width: 100 });
    doc.fillColor(PRIMARY).text(fmtEur(invoice.vatAmount),                  totValX,   totY, { width: 80, align: "right" });
    totY += 14;

    doc.moveTo(totLabelX, totY).lineTo(R, totY).strokeColor(MUTED).lineWidth(0.5).stroke();
    totY += 10;

    doc.fontSize(11).font("Helvetica-Bold").fillColor(PRIMARY);
    doc.text("Totaal",                    totLabelX, totY, { width: 100 });
    doc.text(fmtEur(invoice.totalAmount), totValX,   totY, { width: 80, align: "right" });

    doc
      .fontSize(8)
      .fillColor(SECONDARY)
      .font("Helvetica")
      .text(
        "Veele Serviceplatform  ·  Bedankt voor uw opdracht.",
        L,
        760,
        { width: R - L, align: "center" },
      );

    doc.end();
  });

  return Buffer.concat(chunks);
}
