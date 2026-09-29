import "server-only";

import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

type InvoicePdfInput = {
  invoiceNumber: string;
  issuedOn: string;
  dueOn: string;
  tenantName: string;
  customerName: string;
  billingAddress: Record<string, unknown>;
  lines: Array<{ description: string; quantity: number; unitPriceCents: number; vatBasisPoints: number; totalCents: number }>;
  subtotalCents: number;
  vatCents: number;
  totalCents: number;
  accentColor: string;
  footer?: string | null;
};

const money = (cents: number) => new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(cents / 100);

function color(hex: string) {
  const safe = /^#[0-9a-f]{6}$/i.test(hex) ? hex.slice(1) : "00b7b3";
  return rgb(parseInt(safe.slice(0, 2), 16) / 255, parseInt(safe.slice(2, 4), 16) / 255, parseInt(safe.slice(4, 6), 16) / 255);
}

export async function renderInvoicePdf(input: InvoicePdfInput): Promise<Uint8Array> {
  const document = await PDFDocument.create();
  const page = document.addPage([595.28, 841.89]);
  const regular = await document.embedFont(StandardFonts.Helvetica);
  const bold = await document.embedFont(StandardFonts.HelveticaBold);
  const dark = rgb(0.04, 0.11, 0.23);
  const muted = rgb(0.38, 0.45, 0.52);
  const accent = color(input.accentColor);
  const left = 52;
  let y = 785;
  page.drawRectangle({ x: 0, y: 812, width: 595.28, height: 30, color: dark });
  page.drawText(input.tenantName, { x: left, y, size: 20, font: bold, color: dark });
  page.drawText("LOGO", { x: 475, y: y + 2, size: 10, font: bold, color: muted });
  y -= 55;
  page.drawText("FACTUUR", { x: left, y, size: 10, font: bold, color: accent });
  page.drawText(input.invoiceNumber, { x: left, y: y - 25, size: 23, font: bold, color: dark });
  page.drawText(`Factuurdatum: ${input.issuedOn}`, { x: 385, y, size: 9, font: regular, color: muted });
  page.drawText(`Vervaldatum: ${input.dueOn}`, { x: 385, y: y - 16, size: 9, font: regular, color: muted });
  y -= 80;
  page.drawText("FACTUUR AAN", { x: left, y, size: 9, font: bold, color: muted });
  page.drawText(input.customerName, { x: left, y: y - 19, size: 13, font: bold, color: dark });
  const address = [input.billingAddress.street, input.billingAddress.postal_code, input.billingAddress.city].filter(Boolean).join(" · ");
  if (address) page.drawText(String(address), { x: left, y: y - 36, size: 9, font: regular, color: muted });
  y -= 75;
  page.drawRectangle({ x: left, y, width: 491, height: 26, color: rgb(0.94, 0.97, 0.98) });
  page.drawText("Omschrijving", { x: left + 8, y: y + 9, size: 8, font: bold, color: muted });
  page.drawText("Aantal", { x: 350, y: y + 9, size: 8, font: bold, color: muted });
  page.drawText("BTW", { x: 408, y: y + 9, size: 8, font: bold, color: muted });
  page.drawText("Totaal", { x: 482, y: y + 9, size: 8, font: bold, color: muted });
  y -= 23;
  for (const line of input.lines.slice(0, 22)) {
    page.drawText(line.description.slice(0, 58), { x: left + 8, y, size: 9, font: regular, color: dark });
    page.drawText(String(line.quantity), { x: 350, y, size: 9, font: regular, color: dark });
    page.drawText(`${line.vatBasisPoints / 100}%`, { x: 408, y, size: 9, font: regular, color: dark });
    page.drawText(money(line.totalCents), { x: 482, y, size: 9, font: regular, color: dark });
    page.drawLine({ start: { x: left, y: y - 7 }, end: { x: 543, y: y - 7 }, thickness: 0.5, color: rgb(0.87, 0.91, 0.93) });
    y -= 27;
  }
  y = Math.min(y - 20, 250);
  const totals = [["Subtotaal", input.subtotalCents], ["BTW", input.vatCents], ["Te betalen", input.totalCents]] as const;
  totals.forEach(([label, cents], index) => {
    page.drawText(label, { x: 370, y: y - index * 24, size: index === 2 ? 12 : 9, font: index === 2 ? bold : regular, color: index === 2 ? dark : muted });
    page.drawText(money(cents), { x: 478, y: y - index * 24, size: index === 2 ? 12 : 9, font: index === 2 ? bold : regular, color: index === 2 ? dark : muted });
  });
  page.drawRectangle({ x: 0, y: 0, width: 595.28, height: 54, color: dark });
  page.drawText((input.footer || "Betaling via de beveiligde link in de factuurmail").slice(0, 95), { x: left, y: 22, size: 8, font: regular, color: rgb(0.82, 0.89, 0.93) });
  page.drawText("Powered by Fieldgrid", { x: 450, y: 22, size: 8, font: bold, color: accent });
  document.setTitle(`Factuur ${input.invoiceNumber}`);
  document.setProducer("Fieldgrid");
  return document.save({ useObjectStreams: false });
}
