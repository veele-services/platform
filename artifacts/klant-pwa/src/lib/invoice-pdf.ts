import PDFDocument from "pdfkit";
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

export type CustomerInvoicePdfPaymentSettings = {
  paymentProvider: "none" | "mollie";
  mollieEnabled: boolean;
  showPaymentLinkOnInvoice: boolean;
  showPaymentQrOnInvoice: boolean;
  paymentBlockTitle: string;
  paymentBlockText: string;
  paymentLinkLabel: string;
};

export type CustomerInvoicePdfCompanySnapshot = {
  legalName: string;
  tradeName: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  postalCode: string | null;
  city: string | null;
  country: string;
  kvkNumber: string | null;
  vatNumber: string | null;
  iban: string | null;
  bic: string | null;
  administrationEmail: string | null;
  phone: string | null;
  website: string | null;
  logoUrl: string | null;
  primaryColor: string;
  secondaryColor: string;
  defaultPaymentTermDays: number;
};

export type CustomerInvoicePdfTemplateSettings = {
  logoUrl: string | null;
  primaryColor: string;
  secondaryColor: string;
  introText: string | null;
  footerText: string | null;
  paymentInstruction: string;
  showLogo: boolean;
  showCompanyFooter: boolean;
  showKvkFooter: boolean;
  showVatFooter: boolean;
  showIbanFooter: boolean;
};

export type CustomerInvoicePdfOptions = {
  paymentQrUrl?: string | null;
};

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
  brandName?: string | null;
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
  paymentUrl?: string | null;
  paymentSettings: CustomerInvoicePdfPaymentSettings;
  companySnapshot: CustomerInvoicePdfCompanySnapshot;
  templateSettings: CustomerInvoicePdfTemplateSettings;
  lineItems: CustomerInvoicePdfLineItem[];
};

function categoryLabel(category: string): string {
  if (category === "extra_work") return "Meerwerk";
  if (category === "material") return "Materiaal/verbruik";
  return "Werkzaamheden";
}

function safePdfColor(value: string | null | undefined, fallback: string): string {
  return /^#[0-9A-Fa-f]{6}$/u.test(value ?? "") ? value! : fallback;
}

function companyDisplayName(invoice: CustomerInvoicePdfData): string {
  return invoice.companySnapshot.tradeName || invoice.companySnapshot.legalName || invoice.brandName || "Fieldgrid";
}

function companyLines(invoice: CustomerInvoicePdfData): string[] {
  const company = invoice.companySnapshot;
  return [
    company.legalName,
    company.addressLine1,
    company.addressLine2,
    [company.postalCode, company.city].filter(Boolean).join(" "),
    company.country,
  ].filter((line): line is string => Boolean(line?.trim()));
}

function renderPaymentInstruction(invoice: CustomerInvoicePdfData): string {
  return invoice.templateSettings.paymentInstruction
    .replace(/\{\{payment_term_days\}\}/gu, String(invoice.companySnapshot.defaultPaymentTermDays))
    .replace(/\{\{invoice_number\}\}/gu, invoice.invoiceNumber);
}

function footerText(invoice: CustomerInvoicePdfData): string {
  const template = invoice.templateSettings;
  const company = invoice.companySnapshot;
  if (template.footerText?.trim()) return template.footerText.trim();
  const parts = [companyDisplayName(invoice)];
  if (template.showKvkFooter && company.kvkNumber) parts.push(`KVK ${company.kvkNumber}`);
  if (template.showVatFooter && company.vatNumber) parts.push(`BTW ${company.vatNumber}`);
  if (template.showIbanFooter && company.iban) parts.push(`IBAN ${company.iban}`);
  return parts.filter(Boolean).join(" - ") || `${companyDisplayName(invoice)} - Factuur gegenereerd.`;
}

function logoUrl(invoice: CustomerInvoicePdfData): string | null {
  return invoice.templateSettings.logoUrl || invoice.companySnapshot.logoUrl;
}

async function fetchPdfLogoBuffer(url: string | null): Promise<Buffer | null> {
  if (!url) return null;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (!["https:", "http:"].includes(parsed.protocol)) return null;

  try {
    const response = await fetch(parsed, { signal: AbortSignal.timeout(5000) });
    if (!response.ok) return null;
    const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
    if (!contentType.startsWith("image/png") && !contentType.startsWith("image/jpeg")) return null;
    const contentLength = Number(response.headers.get("content-length") ?? "0");
    if (contentLength > 1_500_000) return null;
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.byteLength > 1_500_000) return null;
    return bytes;
  } catch {
    return null;
  }
}

function drawCompanyPanel(doc: PDFKit.PDFDocument, invoice: CustomerInvoicePdfData, y: number, logoBuffer: Buffer | null): number {
  const L = PDF_PAGE.left;
  const R = PDF_PAGE.right;
  const W = R - L;
  const company = invoice.companySnapshot;
  const template = invoice.templateSettings;
  const primary = safePdfColor(template.primaryColor || company.primaryColor, PDF_BRAND.blue);
  const accent = safePdfColor(template.secondaryColor || company.secondaryColor, PDF_BRAND.cyan);

  doc.roundedRect(L, y, W, 76, 10).fill("#FFFFFF").strokeColor(PDF_BRAND.border).stroke();
  doc.fillColor(PDF_BRAND.slate).font("Helvetica-Bold").fontSize(8).text("AFZENDER", L + 18, y + 14);
  const textWidth = template.showLogo && logoBuffer ? 190 : 220;
  doc.fillColor(primary).font("Helvetica-Bold").fontSize(13).text(companyDisplayName(invoice), L + 18, y + 30, { width: textWidth });
  doc.fillColor(PDF_BRAND.ink).font("Helvetica").fontSize(8).text(companyLines(invoice).slice(1).join(" - "), L + 18, y + 50, { width: 250 });

  const metaRows: Array<[string, string | null]> = [
    ["E-mail", company.administrationEmail],
    ["Telefoon", company.phone],
    ["Website", company.website],
    ["IBAN", company.iban],
  ];
  let metaY = y + 14;
  for (const [label, value] of metaRows.filter(([, value]) => Boolean(value))) {
    doc.fillColor(PDF_BRAND.slate).font("Helvetica").fontSize(7).text(label, R - 170, metaY, { width: 52 });
    doc.fillColor(PDF_BRAND.ink).font("Helvetica-Bold").fontSize(7).text(value ?? "-", R - 112, metaY, { width: 112, align: "right" });
    metaY += 13;
  }

  if (template.showLogo && logoBuffer) {
    try {
      doc.image(logoBuffer, R - 86, y + 18, { fit: [68, 36], align: "center", valign: "center" });
    } catch {
      doc.roundedRect(R - 62, y + 48, 44, 10, 5).fill(accent);
    }
  } else if (template.showLogo) {
    doc.roundedRect(R - 62, y + 48, 44, 10, 5).fill(accent);
  }
  return y + 96;
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

function drawPaymentBlock(doc: PDFKit.PDFDocument, invoice: CustomerInvoicePdfData, y: number, paymentQrUrl: string | null | undefined): number {
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

export async function generateCustomerInvoicePdf(invoice: CustomerInvoicePdfData, options: CustomerInvoicePdfOptions = {}): Promise<Buffer> {
  const brandName = companyDisplayName(invoice);
  const isFieldgridBrand = brandName.toLowerCase() === "fieldgrid";
  const primary = safePdfColor(invoice.templateSettings.primaryColor || invoice.companySnapshot.primaryColor, PDF_BRAND.blue);
  const accent = safePdfColor(invoice.templateSettings.secondaryColor || invoice.companySnapshot.secondaryColor, PDF_BRAND.cyan);
  const logoBuffer = await fetchPdfLogoBuffer(logoUrl(invoice));
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
      primaryColor: primary,
      accentColor: accent,
    });

    const L = PDF_PAGE.left;
    const R = PDF_PAGE.right;
    const W = R - L;
    let y = 142;

    y = drawCompanyPanel(doc, invoice, y, logoBuffer);

    if (invoice.templateSettings.introText) {
      y = ensurePdfPage(doc, y, 52);
      doc.fillColor(PDF_BRAND.ink).font("Helvetica").fontSize(9).text(invoice.templateSettings.introText, L, y, { width: W, lineGap: 2 });
      y += Math.min(56, doc.heightOfString(invoice.templateSettings.introText, { width: W }) + 22);
    }

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

    y = ensurePdfPage(doc, y, 48);
    doc.fillColor(PDF_BRAND.slate).font("Helvetica").fontSize(8).text(renderPaymentInstruction(invoice), L, y, { width: W, lineGap: 2 });
    y += Math.min(54, doc.heightOfString(renderPaymentInstruction(invoice), { width: W }) + 18);

    y = drawPaymentBlock(doc, invoice, y, options.paymentQrUrl);

    if (Math.abs(lineTotal - parsePdfMoney(invoice.amount)) > 0.01) {
      y = ensurePdfPage(doc, y, 48);
      doc.fillColor(PDF_BRAND.slate).font("Helvetica").fontSize(8).text(
        "Let op: het factuurbedrag kan handmatig zijn gecorrigeerd ten opzichte van de som van de regels.",
        L,
        y,
        { width: W },
      );
    }

    drawPdfFooter(doc, footerText(invoice));
    doc.end();
  });

  return Buffer.concat(chunks);
}
