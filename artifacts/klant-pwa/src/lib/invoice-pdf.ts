import PDFDocument from "pdfkit";

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

const BRAND = {
  navy:   "#081D3A",
  teal:   "#00B7B3",
  slate:  "#64748B",
  border: "#E2E8F0",
  soft:   "#F8FAFC",
  ink:    "#111827",
};

function fmtDate(value: string | null | undefined): string {
  if (!value) return "-";
  const d = new Date(`${value.slice(0, 10)}T00:00:00`);
  return d.toLocaleDateString("nl-NL", { day: "numeric", month: "long", year: "numeric" });
}

function fmtEur(value: string | number | null | undefined): string {
  const amount = typeof value === "number" ? value : Number.parseFloat(value ?? "0");
  return Number.isFinite(amount)
    ? amount.toLocaleString("nl-NL", { style: "currency", currency: "EUR", minimumFractionDigits: 2 })
    : "EUR 0,00";
}

function categoryLabel(category: string): string {
  if (category === "extra_work") return "Meerwerk";
  if (category === "material") return "Materiaal/verbruik";
  return "Werkzaamheden";
}

function drawHeader(doc: PDFKit.PDFDocument, invoiceNumber: string) {
  doc.rect(0, 0, 595.28, 122).fill(BRAND.navy);
  doc.fillColor("#FFFFFF").font("Helvetica-Bold").fontSize(22).text("VEELE", 55, 38);
  doc.fillColor("#7DF3EF").font("Helvetica").fontSize(8).text("SERVICES", 57, 64, { characterSpacing: 2 });
  doc.fillColor("#FFFFFF").font("Helvetica-Bold").fontSize(19).text("FACTUUR", 350, 38, { width: 210, align: "right" });
  doc.fillColor("#C7D2FE").font("Helvetica").fontSize(9).text(invoiceNumber, 350, 66, { width: 210, align: "right" });
}

export async function generateCustomerInvoicePdf(invoice: CustomerInvoicePdfData): Promise<Buffer> {
  const doc = new PDFDocument({ size: "A4", margin: 55, bufferPages: true });
  const chunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));

  await new Promise<void>((resolve) => {
    doc.on("end", resolve);
    drawHeader(doc, invoice.invoiceNumber);

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

    doc.roundedRect(L, y, W, 26, 8).fill(BRAND.navy);
    doc.fillColor("#FFFFFF").font("Helvetica-Bold").fontSize(8);
    doc.text("Soort", L + 10, y + 9, { width: 78 });
    doc.text("Omschrijving", L + 92, y + 9, { width: 205 });
    doc.text("Aantal", R - 190, y + 9, { width: 48, align: "right" });
    doc.text("Prijs", R - 130, y + 9, { width: 55, align: "right" });
    doc.text("Totaal", R - 62, y + 9, { width: 62, align: "right" });
    y += 34;

    const items = invoice.lineItems.filter((item) => item.invoiceable);
    for (const item of items) {
      if (y > 730) {
        doc.addPage();
        y = 55;
      }
      doc.roundedRect(L, y, W, 36, 8).fill("#FFFFFF").strokeColor(BRAND.border).stroke();
      doc.fillColor(BRAND.teal).font("Helvetica-Bold").fontSize(7).text(categoryLabel(item.category), L + 10, y + 13, { width: 78 });
      doc.fillColor(BRAND.navy).font("Helvetica-Bold").fontSize(8).text(item.code ?? "-", L + 92, y + 10, { width: 62 });
      doc.fillColor(BRAND.ink).font("Helvetica").fontSize(8).text(item.description, L + 158, y + 10, { width: 135 });
      doc.fillColor(BRAND.slate).text(item.quantity, R - 190, y + 13, { width: 48, align: "right" });
      doc.fillColor(BRAND.ink).text(fmtEur(item.unitPrice), R - 130, y + 13, { width: 55, align: "right" });
      doc.fillColor(BRAND.navy).font("Helvetica-Bold").text(fmtEur(item.price), R - 62, y + 13, { width: 62, align: "right" });
      y += 44;
    }

    y += 10;
    const totalsX = 330;
    doc.roundedRect(totalsX, y, 210, 112, 12).fill(BRAND.soft).strokeColor(BRAND.border).stroke();
    let ty = y + 18;
    for (const [label, value, strong] of [
      ["Subtotaal excl. BTW", fmtEur(invoice.amount), false],
      [`BTW ${invoice.vatPercentage ?? "21"}%`, fmtEur(invoice.vatAmount), false],
      ["Totaal incl. BTW", fmtEur(invoice.totalAmount), true],
    ] as const) {
      doc.fillColor(strong ? BRAND.navy : BRAND.slate).font(strong ? "Helvetica-Bold" : "Helvetica").fontSize(strong ? 11 : 9);
      doc.text(label, totalsX + 16, ty, { width: 105 });
      doc.text(value, totalsX + 118, ty, { width: 76, align: "right" });
      ty += strong ? 22 : 18;
    }

    const range = doc.bufferedPageRange();
    for (let i = 0; i < range.count; i++) {
      doc.switchToPage(i);
      doc.fillColor(BRAND.slate).font("Helvetica").fontSize(8)
        .text("Veele Services - Bedankt voor uw opdracht.", L, 800, { width: W, align: "center" });
    }

    doc.end();
  });

  return Buffer.concat(chunks);
}
