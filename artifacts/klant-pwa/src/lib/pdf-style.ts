export const PDF_BRAND = {
  navy: "#020617",
  blue: "#081D3A",
  cyan: "#00B7B3",
  cyanSoft: "#E6FFFD",
  slate: "#64748B",
  muted: "#94A3B8",
  border: "#DDE7F0",
  soft: "#F8FAFC",
  ink: "#0F172A",
  danger: "#DC2626",
} as const;

export const PDF_PAGE = {
  width: 595.28,
  height: 841.89,
  left: 55,
  right: 540,
  bottom: 770,
} as const;

export type PdfMetaRow = [label: string, value: string];

export function formatPdfDate(value: string | Date | null | undefined): string {
  if (!value) return "-";
  const date = typeof value === "string" ? new Date(`${value.slice(0, 10)}T00:00:00`) : value;
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("nl-NL", { day: "numeric", month: "long", year: "numeric" });
}

export function formatPdfEuro(value: string | number | null | undefined): string {
  const amount = typeof value === "number" ? value : Number.parseFloat(value ?? "0");
  return Number.isFinite(amount)
    ? amount.toLocaleString("nl-NL", { style: "currency", currency: "EUR", minimumFractionDigits: 2 })
    : "EUR 0,00";
}

export function formatPdfEuroCents(cents: number | null | undefined): string {
  return formatPdfEuro((cents ?? 0) / 100);
}

export function parsePdfMoney(value: string | null | undefined): number {
  const parsed = Number.parseFloat(value ?? "0");
  return Number.isFinite(parsed) ? parsed : 0;
}

export function sanitizePdfFilename(value: string, fallback: string): string {
  const sanitized = value.replace(/[^a-zA-Z0-9-_]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  return sanitized || fallback;
}

export function drawPdfHeader(
  doc: PDFKit.PDFDocument,
  input: {
    title: string;
    reference: string;
    brandTitle?: string;
    brandSubtitle?: string;
  },
) {
  const rawBrandTitle = (input.brandTitle ?? "FIELDGRID").trim() || "FIELDGRID";
  const brandTitle = rawBrandTitle.length > 14 ? `${rawBrandTitle.slice(0, 13)}.` : rawBrandTitle;
  const brandSubtitle = input.brandSubtitle === undefined ? "PLATFORM" : input.brandSubtitle.trim();
  const titleFontSize = brandTitle.length > 10 ? 11 : brandTitle.length > 8 ? 13 : 16;

  doc.rect(0, 0, PDF_PAGE.width, 122).fill(PDF_BRAND.navy);
  doc.roundedRect(PDF_PAGE.left, 30, 96, 54, 8).fill("#FFFFFF");
  doc.fillColor(PDF_BRAND.blue).font("Helvetica-Bold").fontSize(titleFontSize).text(brandTitle, PDF_PAGE.left + 14, 43, {
    width: 68,
    align: "center",
    height: 16,
    ellipsis: true,
  });
  if (brandSubtitle) {
    doc.fillColor(PDF_BRAND.cyan).font("Helvetica-Bold").fontSize(6).text(brandSubtitle, PDF_PAGE.left + 14, 62, {
      width: 68,
      align: "center",
      characterSpacing: 1.8,
    });
  }
  doc.roundedRect(PDF_PAGE.width - 270, 30, 215, 54, 8).fill("#0F172A");
  doc.fillColor("#FFFFFF").font("Helvetica-Bold").fontSize(18).text(input.title, PDF_PAGE.width - 255, 42, {
    width: 185,
    align: "right",
  });
  doc.fillColor("#A7F3D0").font("Helvetica").fontSize(9).text(input.reference, PDF_PAGE.width - 255, 66, {
    width: 185,
    align: "right",
  });
  doc.roundedRect(PDF_PAGE.left, 104, 90, 4, 2).fill(PDF_BRAND.cyan);
}

export function drawPdfFooter(doc: PDFKit.PDFDocument, text: string) {
  const range = doc.bufferedPageRange();
  for (let index = 0; index < range.count; index++) {
    doc.switchToPage(index);
    doc
      .font("Helvetica")
      .fontSize(8)
      .fillColor(PDF_BRAND.slate)
      .text(text, PDF_PAGE.left, 800, {
        width: PDF_PAGE.right - PDF_PAGE.left,
        align: "center",
      });
    doc
      .fillColor(PDF_BRAND.muted)
      .fontSize(7)
      .text(`Pagina ${index + 1} van ${range.count}`, PDF_PAGE.left, 812, {
        width: PDF_PAGE.right - PDF_PAGE.left,
        align: "center",
      });
  }
}

export function ensurePdfPage(doc: PDFKit.PDFDocument, y: number, needed = 80): number {
  if (y + needed <= PDF_PAGE.bottom) return y;
  doc.addPage();
  return PDF_PAGE.left;
}

export function drawPdfSectionTitle(doc: PDFKit.PDFDocument, title: string, y: number): number {
  doc.fillColor(PDF_BRAND.ink).font("Helvetica-Bold").fontSize(13).text(title, PDF_PAGE.left, y);
  doc.roundedRect(PDF_PAGE.left, y + 19, 42, 3, 2).fill(PDF_BRAND.cyan);
  return y + 34;
}

export function drawPdfRecipientPanel(
  doc: PDFKit.PDFDocument,
  input: {
    y: number;
    label: string;
    name: string;
    lines: string[];
    meta: PdfMetaRow[];
    height?: number;
  },
): number {
  const L = PDF_PAGE.left;
  const W = PDF_PAGE.right - PDF_PAGE.left;
  const height = input.height ?? 112;

  doc.roundedRect(L, input.y, W, height, 10).fill(PDF_BRAND.soft).strokeColor(PDF_BRAND.border).lineWidth(1).stroke();
  doc.fillColor(PDF_BRAND.slate).font("Helvetica-Bold").fontSize(8).text(input.label.toUpperCase(), L + 18, input.y + 16);
  doc.fillColor(PDF_BRAND.ink).font("Helvetica-Bold").fontSize(13).text(input.name || "-", L + 18, input.y + 33, { width: 230 });
  doc.fillColor(PDF_BRAND.ink).font("Helvetica").fontSize(9);

  let lineY = input.y + 54;
  for (const line of input.lines.filter(Boolean)) {
    doc.text(line, L + 18, lineY, { width: 230 });
    lineY += 13;
  }

  const metaX = 342;
  let metaY = input.y + 18;
  for (const [label, value] of input.meta) {
    doc.fillColor(PDF_BRAND.slate).font("Helvetica").fontSize(8).text(label, metaX, metaY, { width: 82 });
    doc.fillColor(PDF_BRAND.ink).font("Helvetica-Bold").fontSize(8).text(value, metaX + 90, metaY, { width: 105 });
    metaY += 16;
  }

  return input.y + height + 30;
}

export function drawPdfTableHeader(
  doc: PDFKit.PDFDocument,
  y: number,
  columns: Array<{ label: string; x: number; width: number; align?: "left" | "right" | "center" }>,
): number {
  doc.roundedRect(PDF_PAGE.left, y, PDF_PAGE.right - PDF_PAGE.left, 28, 8).fill(PDF_BRAND.navy);
  doc.fillColor("#FFFFFF").font("Helvetica-Bold").fontSize(8);
  for (const column of columns) {
    doc.text(column.label, column.x, y + 10, { width: column.width, align: column.align ?? "left" });
  }
  return y + 36;
}

export function drawPdfTotalPanel(
  doc: PDFKit.PDFDocument,
  y: number,
  rows: Array<{ label: string; value: string; strong?: boolean }>,
  width = 226,
): number {
  const x = PDF_PAGE.right - width;
  const height = Math.max(88, 26 + rows.length * 19);

  doc.roundedRect(x, y, width, height, 10).fill(PDF_BRAND.soft).strokeColor(PDF_BRAND.border).stroke();
  let rowY = y + 17;
  for (const row of rows) {
    doc.fillColor(row.strong ? PDF_BRAND.ink : PDF_BRAND.slate).font(row.strong ? "Helvetica-Bold" : "Helvetica").fontSize(row.strong ? 11 : 9);
    doc.text(row.label, x + 16, rowY, { width: width - 112 });
    doc.text(row.value, x + width - 92, rowY, { width: 76, align: "right" });
    rowY += row.strong ? 22 : 18;
  }

  return y + height + 24;
}
