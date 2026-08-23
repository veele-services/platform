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
  bottom: 740,
} as const;

const PDF_CONTENT_WIDTH = PDF_PAGE.right - PDF_PAGE.left;

function fitPdfSingleLine(
  doc: PDFKit.PDFDocument,
  value: string,
  maxWidth: number,
): string {
  const normalized = value.replace(/\s+/gu, " ").trim() || "-";
  if (doc.widthOfString(normalized) <= maxWidth) return normalized;

  const suffix = "...";
  let start = 0;
  let end = normalized.length;
  while (start < end) {
    const middle = Math.ceil((start + end) / 2);
    const candidate = `${normalized.slice(0, middle).trimEnd()}${suffix}`;
    if (doc.widthOfString(candidate) <= maxWidth) start = middle;
    else end = middle - 1;
  }
  return `${normalized.slice(0, start).trimEnd()}${suffix}`;
}

function wrapPdfFooterLines(
  doc: PDFKit.PDFDocument,
  value: string,
  maxWidth: number,
): string[] {
  const words = value.replace(/\s+/gu, " ").trim().split(" ").filter(Boolean);
  if (words.length === 0) return ["-"];

  const lines: string[] = [];
  while (words.length > 0 && lines.length < 2) {
    if (lines.length === 1) {
      lines.push(fitPdfSingleLine(doc, words.join(" "), maxWidth));
      break;
    }

    let line = "";
    while (words.length > 0) {
      const candidate = line ? `${line} ${words[0]}` : words[0]!;
      if (doc.widthOfString(candidate) > maxWidth) break;
      line = candidate;
      words.shift();
    }
    if (!line) line = fitPdfSingleLine(doc, words.shift()!, maxWidth);
    lines.push(line);
  }
  return lines;
}

export type PdfMetaRow = [label: string, value: string];

export function formatPdfDate(value: string | Date | null | undefined): string {
  if (!value) return "-";
  const date =
    typeof value === "string"
      ? new Date(`${value.slice(0, 10)}T00:00:00`)
      : value;
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("nl-NL", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export function formatPdfEuro(
  value: string | number | null | undefined,
): string {
  const amount =
    typeof value === "number" ? value : Number.parseFloat(value ?? "0");
  return Number.isFinite(amount)
    ? amount.toLocaleString("nl-NL", {
        style: "currency",
        currency: "EUR",
        minimumFractionDigits: 2,
      })
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
  const sanitized = value
    .replace(/[^a-zA-Z0-9-_]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return sanitized || fallback;
}

export function drawPdfHeader(
  doc: PDFKit.PDFDocument,
  input: {
    title: string;
    reference: string;
    brandTitle?: string;
    brandSubtitle?: string;
    primaryColor?: string;
    accentColor?: string;
  },
) {
  const primaryColor = /^#[0-9A-Fa-f]{6}$/u.test(input.primaryColor ?? "")
    ? input.primaryColor!
    : PDF_BRAND.navy;
  const accentColor = /^#[0-9A-Fa-f]{6}$/u.test(input.accentColor ?? "")
    ? input.accentColor!
    : PDF_BRAND.cyan;
  const brandTitle = (input.brandTitle ?? "FIELDGRID").trim() || "FIELDGRID";
  const brandSubtitle =
    input.brandSubtitle === undefined ? "PLATFORM" : input.brandSubtitle.trim();
  const titleFontSize =
    brandTitle.length > 24 ? 12 : brandTitle.length > 16 ? 14 : 17;

  doc.rect(0, 0, PDF_PAGE.width, 112).fill(primaryColor);
  doc.roundedRect(PDF_PAGE.left, 28, 4, 54, 2).fill(accentColor);
  doc
    .fillColor("#FFFFFF")
    .font("Helvetica-Bold")
    .fontSize(titleFontSize)
    .text(brandTitle, PDF_PAGE.left + 17, 34, {
      width: 225,
      height: 22,
      ellipsis: true,
    });
  if (brandSubtitle) {
    doc
      .fillColor(accentColor)
      .font("Helvetica-Bold")
      .fontSize(7)
      .text(brandSubtitle.toUpperCase(), PDF_PAGE.left + 17, 61, {
        width: 225,
        characterSpacing: 1.5,
      });
  }
  doc
    .fillColor(PDF_BRAND.muted)
    .font("Helvetica-Bold")
    .fontSize(7)
    .text("DOCUMENT", PDF_PAGE.width - 275, 28, {
      width: 220,
      align: "right",
      characterSpacing: 1.4,
    });
  doc
    .fillColor("#FFFFFF")
    .font("Helvetica-Bold")
    .fontSize(18)
    .text(input.title, PDF_PAGE.width - 275, 43, {
      width: 220,
      align: "right",
    });
  doc
    .fillColor(accentColor)
    .font("Helvetica-Bold")
    .fontSize(8)
    .text(`NR. ${input.reference}`, PDF_PAGE.width - 275, 69, {
      width: 220,
      align: "right",
      characterSpacing: 0.5,
    });
}

export function drawPdfFooter(doc: PDFKit.PDFDocument, text: string) {
  const range = doc.bufferedPageRange();
  for (let index = 0; index < range.count; index++) {
    doc.switchToPage(index);
    doc
      .moveTo(PDF_PAGE.left, 758)
      .lineTo(PDF_PAGE.right, 758)
      .strokeColor(PDF_BRAND.border)
      .lineWidth(0.6)
      .stroke();
    doc.font("Helvetica").fontSize(7).fillColor(PDF_BRAND.slate);
    const footerLines = wrapPdfFooterLines(doc, text, PDF_CONTENT_WIDTH - 120);
    for (const [lineIndex, line] of footerLines.entries()) {
      doc.text(line, PDF_PAGE.left, 767 + lineIndex * 9, {
        width: PDF_CONTENT_WIDTH - 120,
        lineBreak: false,
      });
    }
    doc
      .fillColor(PDF_BRAND.muted)
      .fontSize(7)
      .text(
        `Pagina ${index + 1} van ${range.count}`,
        PDF_PAGE.right - 100,
        771,
        {
          width: 100,
          align: "right",
          lineBreak: false,
        },
      );
  }
}

export function ensurePdfPage(
  doc: PDFKit.PDFDocument,
  y: number,
  needed = 80,
): number {
  if (y + needed <= PDF_PAGE.bottom) return y;
  doc.addPage();
  return PDF_PAGE.left;
}

export function drawPdfSectionTitle(
  doc: PDFKit.PDFDocument,
  title: string,
  y: number,
): number {
  doc
    .fillColor(PDF_BRAND.ink)
    .font("Helvetica-Bold")
    .fontSize(12)
    .text(title, PDF_PAGE.left, y);
  doc.roundedRect(PDF_PAGE.left, y + 19, 36, 3, 1.5).fill(PDF_BRAND.cyan);
  return y + 32;
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
  const height = input.height ?? 104;

  doc
    .roundedRect(L, input.y, W, height, 8)
    .fill("#FFFFFF")
    .strokeColor(PDF_BRAND.border)
    .lineWidth(0.8)
    .stroke();
  doc.roundedRect(L, input.y, 4, height, 2).fill(PDF_BRAND.cyan);
  doc
    .fillColor(PDF_BRAND.slate)
    .font("Helvetica-Bold")
    .fontSize(7)
    .text(input.label.toUpperCase(), L + 18, input.y + 15, {
      characterSpacing: 1,
    });
  doc
    .fillColor(PDF_BRAND.ink)
    .font("Helvetica-Bold")
    .fontSize(13)
    .text(input.name || "-", L + 18, input.y + 31, { width: 230 });
  doc.fillColor(PDF_BRAND.ink).font("Helvetica").fontSize(9);

  let lineY = input.y + 53;
  for (const line of input.lines.filter(Boolean)) {
    doc.text(line, L + 18, lineY, { width: 230 });
    lineY += 13;
  }

  const metaX = 337;
  doc
    .moveTo(metaX - 17, input.y + 15)
    .lineTo(metaX - 17, input.y + height - 15)
    .strokeColor(PDF_BRAND.border)
    .lineWidth(0.7)
    .stroke();
  let metaY = input.y + 16;
  for (const [label, value] of input.meta) {
    doc
      .fillColor(PDF_BRAND.slate)
      .font("Helvetica")
      .fontSize(8)
      .text(label, metaX, metaY, { width: 82 });
    doc.fillColor(PDF_BRAND.ink).font("Helvetica-Bold").fontSize(8);
    doc.text(fitPdfSingleLine(doc, value, 105), metaX + 90, metaY, {
      width: 105,
      lineBreak: false,
    });
    metaY += 16;
  }

  return input.y + height + 27;
}

export function drawPdfTableHeader(
  doc: PDFKit.PDFDocument,
  y: number,
  columns: Array<{
    label: string;
    x: number;
    width: number;
    align?: "left" | "right" | "center";
  }>,
): number {
  doc
    .roundedRect(PDF_PAGE.left, y, PDF_CONTENT_WIDTH, 26, 6)
    .fill(PDF_BRAND.navy);
  doc.fillColor("#FFFFFF").font("Helvetica-Bold").fontSize(8);
  for (const column of columns) {
    doc.text(column.label, column.x, y + 9, {
      width: column.width,
      align: column.align ?? "left",
    });
  }
  return y + 32;
}

export function drawPdfTotalPanel(
  doc: PDFKit.PDFDocument,
  y: number,
  rows: Array<{ label: string; value: string; strong?: boolean }>,
  width = 226,
): number {
  const x = PDF_PAGE.right - width;
  const height = Math.max(76, 28 + rows.length * 19);

  doc
    .roundedRect(x, y, width, height, 8)
    .fill(PDF_BRAND.soft)
    .strokeColor(PDF_BRAND.border)
    .lineWidth(0.8)
    .stroke();
  doc.roundedRect(x, y, 4, height, 2).fill(PDF_BRAND.cyan);
  let rowY = y + 17;
  for (const row of rows) {
    if (row.strong) {
      doc
        .moveTo(x + 16, rowY - 7)
        .lineTo(x + width - 16, rowY - 7)
        .strokeColor(PDF_BRAND.border)
        .lineWidth(0.7)
        .stroke();
    }
    doc
      .fillColor(row.strong ? PDF_BRAND.ink : PDF_BRAND.slate)
      .font(row.strong ? "Helvetica-Bold" : "Helvetica")
      .fontSize(row.strong ? 11 : 9);
    doc.text(row.label, x + 16, rowY, { width: width - 112 });
    doc.text(row.value, x + width - 92, rowY, { width: 76, align: "right" });
    rowY += row.strong ? 22 : 18;
  }

  return y + height + 24;
}
