import PDFDocument from "pdfkit";
import type { InvoiceDetail } from "@/app/actions/invoices";

const BRAND = {
  navy:   "#081D3A",
  teal:   "#00B7B3",
  slate:  "#64748B",
  border: "#E2E8F0",
  soft:   "#F8FAFC",
  ink:    "#111827",
};

function fmtDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "-";
  const normalized = dateStr.includes("T") ? dateStr.slice(0, 10) : dateStr;
  const d = new Date(`${normalized}T00:00:00`);
  return d.toLocaleDateString("nl-NL", { day: "numeric", month: "long", year: "numeric" });
}

function fmtEur(val: string | number | null | undefined): string {
  const amount = typeof val === "number" ? val : Number.parseFloat(val ?? "0");
  return Number.isFinite(amount)
    ? amount.toLocaleString("nl-NL", { style: "currency", currency: "EUR", minimumFractionDigits: 2 })
    : "EUR 0,00";
}

function parseMoney(value: string | null | undefined): number {
  const parsed = Number.parseFloat(value ?? "0");
  return Number.isFinite(parsed) ? parsed : 0;
}

function categoryLabel(category: string): string {
  if (category === "extra_work") return "Meerwerk";
  if (category === "material") return "Materiaal/verbruik";
  return "Werkzaamheden";
}

function drawHeader(doc: PDFKit.PDFDocument, title: string, reference: string) {
  doc.rect(0, 0, 595.28, 122).fill(BRAND.navy);
  doc.fillColor("#FFFFFF").font("Helvetica-Bold").fontSize(22).text("VEELE", 55, 38);
  doc.fillColor("#7DF3EF").font("Helvetica").fontSize(8).text("SERVICES", 57, 64, { characterSpacing: 2 });
  doc.fillColor("#FFFFFF").font("Helvetica-Bold").fontSize(19).text(title, 330, 38, { width: 210, align: "right" });
  doc.fillColor("#C7D2FE").font("Helvetica").fontSize(9).text(reference, 330, 66, { width: 210, align: "right" });
}

function drawFooter(doc: PDFKit.PDFDocument) {
  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(i);
    doc
      .font("Helvetica")
      .fontSize(8)
      .fillColor(BRAND.slate)
      .text("Veele Services - Een partner. Een standaard. Totale zorg.", 55, 800, {
        width: 485,
        align: "center",
      });
  }
}

function ensurePage(doc: PDFKit.PDFDocument, y: number, needed = 80): number {
  if (y + needed <= 770) return y;
  doc.addPage();
  return 55;
}

export async function generateInvoicePdf(invoice: InvoiceDetail): Promise<Buffer> {
  const doc = new PDFDocument({ size: "A4", margin: 55, bufferPages: true });
  const chunks: Buffer[] = [];

  doc.on("data", (chunk: Buffer) => chunks.push(chunk));

  await new Promise<void>((resolve) => {
    doc.on("end", resolve);

    drawHeader(doc, "FACTUUR", invoice.invoiceNumber);

    const L = 55;
    const R = 540;
    const W = R - L;
    let y = 148;

    doc.roundedRect(L, y, W, 104, 12).fill(BRAND.soft).strokeColor(BRAND.border).stroke();
    doc.fillColor(BRAND.slate).font("Helvetica-Bold").fontSize(8).text("FACTUREREN AAN", L + 18, y + 16);
    doc.fillColor(BRAND.navy).font("Helvetica-Bold").fontSize(12).text(invoice.customerName, L + 18, y + 32, { width: 220 });
    doc.fillColor(BRAND.ink).font("Helvetica").fontSize(9);
    let custY = y + 50;
    if (invoice.customerAddress) {
      doc.text(invoice.customerAddress, L + 18, custY, { width: 220 });
      custY += 13;
    }
    const cityLine = [invoice.customerPostalCode, invoice.customerCity].filter(Boolean).join(" ");
    if (cityLine) doc.text(cityLine, L + 18, custY, { width: 220 });

    const metaX = 360;
    const metaRows: [string, string][] = [
      ["Factuurdatum", fmtDate(invoice.createdAt)],
      ["Vervaldatum", fmtDate(invoice.dueDate)],
      ["Opdracht", invoice.assignmentCode],
      ["Object", invoice.objectName ?? "-"],
    ];
    let metaY = y + 18;
    for (const [label, value] of metaRows) {
      doc.fillColor(BRAND.slate).font("Helvetica").fontSize(8).text(label, metaX, metaY, { width: 80 });
      doc.fillColor(BRAND.navy).font("Helvetica-Bold").fontSize(8).text(value, metaX + 85, metaY, { width: 95 });
      metaY += 16;
    }

    y += 135;
    doc.fillColor(BRAND.navy).font("Helvetica-Bold").fontSize(13).text("Factuurregels", L, y);
    y += 22;

    const columns = {
      category: L,
      description: L + 88,
      quantity: R - 190,
      unit: R - 130,
      total: R - 62,
    };

    doc.roundedRect(L, y, W, 26, 8).fill(BRAND.navy);
    doc.fillColor("#FFFFFF").font("Helvetica-Bold").fontSize(8);
    doc.text("Soort", columns.category + 10, y + 9, { width: 70 });
    doc.text("Omschrijving", columns.description, y + 9, { width: 180 });
    doc.text("Aantal", columns.quantity, y + 9, { width: 48, align: "right" });
    doc.text("Prijs", columns.unit, y + 9, { width: 55, align: "right" });
    doc.text("Totaal", columns.total, y + 9, { width: 62, align: "right" });
    y += 34;

    const invoiceableItems = invoice.lineItems.filter((item) => item.invoiceable);
    for (const item of invoiceableItems) {
      y = ensurePage(doc, y, 46);
      const lineTotal = parseMoney(item.price);
      const rowHeight = Math.max(34, doc.heightOfString(item.description, { width: 175 }) + 18);
      doc.roundedRect(L, y, W, rowHeight, 8).fill("#FFFFFF").strokeColor(BRAND.border).stroke();
      doc.fillColor(BRAND.teal).font("Helvetica-Bold").fontSize(7).text(categoryLabel(item.category), columns.category + 10, y + 12, { width: 70 });
      doc.fillColor(BRAND.navy).font("Helvetica-Bold").fontSize(9).text(item.taskCodeCode ?? "-", columns.description, y + 10, { width: 65 });
      doc.fillColor(BRAND.ink).font("Helvetica").fontSize(8).text(item.description, columns.description + 70, y + 10, { width: 108 });
      doc.fillColor(BRAND.slate).font("Helvetica").fontSize(8).text(item.quantity, columns.quantity, y + 12, { width: 48, align: "right" });
      doc.fillColor(BRAND.ink).text(fmtEur(item.unitPrice), columns.unit, y + 12, { width: 55, align: "right" });
      doc.fillColor(BRAND.navy).font("Helvetica-Bold").text(fmtEur(lineTotal), columns.total, y + 12, { width: 62, align: "right" });
      y += rowHeight + 8;
    }

    if (invoiceableItems.length === 0) {
      doc.roundedRect(L, y, W, 44, 8).fill("#FFFFFF").strokeColor(BRAND.border).stroke();
      doc.fillColor(BRAND.slate).font("Helvetica").fontSize(9).text("Geen factureerbare regels gevonden.", L + 14, y + 15);
      y += 56;
    }

    y = ensurePage(doc, y, 140);
    y += 10;
    const totalsX = 330;
    doc.roundedRect(totalsX, y, 210, 112, 12).fill(BRAND.soft).strokeColor(BRAND.border).stroke();
    let ty = y + 18;
    const totalRows: [string, string, boolean][] = [
      ["Subtotaal excl. BTW", fmtEur(invoice.amount), false],
      [`BTW ${invoice.vatPercentage ?? "21"}%`, fmtEur(invoice.vatAmount), false],
      ["Totaal incl. BTW", fmtEur(invoice.totalAmount), true],
    ];
    for (const [label, value, strong] of totalRows) {
      doc.fillColor(strong ? BRAND.navy : BRAND.slate).font(strong ? "Helvetica-Bold" : "Helvetica").fontSize(strong ? 11 : 9);
      doc.text(label, totalsX + 16, ty, { width: 105 });
      doc.text(value, totalsX + 118, ty, { width: 76, align: "right" });
      ty += strong ? 22 : 18;
      if (!strong && label.startsWith("BTW")) {
        doc.moveTo(totalsX + 16, ty - 4).lineTo(totalsX + 194, ty - 4).strokeColor(BRAND.border).lineWidth(0.5).stroke();
      }
    }

    if (invoice.notes) {
      y += 136;
      y = ensurePage(doc, y, 80);
      doc.fillColor(BRAND.navy).font("Helvetica-Bold").fontSize(11).text("Toelichting", L, y);
      doc.fillColor(BRAND.ink).font("Helvetica").fontSize(9).text(invoice.notes, L, y + 18, { width: W, lineGap: 2 });
    }

    drawFooter(doc);
    doc.end();
  });

  return Buffer.concat(chunks);
}
