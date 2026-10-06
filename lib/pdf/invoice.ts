import "server-only";
import sharp from "sharp";
import { PDFDocument, StandardFonts, rgb, type PDFImage } from "pdf-lib";
import { FIELDGRID_PRIMARY, FIELDGRID_SECONDARY } from "@/lib/communications/templates";

export type InvoicePdfInput = {
  invoiceNumber: string; issuedOn: string; dueOn: string; tenantName: string; customerName: string;
  billingAddress: Record<string, unknown>; reference?: string; costCenter?: string;
  lines: Array<{ description: string; quantity: number; unit?: string; unitPriceCents: number; vatBasisPoints: number; totalCents: number; subtotalCents?: number; vatCents?: number }>;
  subtotalCents: number; vatCents: number; totalCents: number;
  primaryColor?: string; accentColor?: string; footer?: string | null; senderEmail?: string;
  logo?: Uint8Array; concept?: boolean;
  sender?: InvoiceCompany;
  recipient?: InvoiceCompany;
};
export type InvoiceCompany = { legalName?: string; address?: Record<string, unknown>; companyNumber?: string; vatNumber?: string; iban?: string; email?: string; phone?: string };
const money = (cents: number) => new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(cents / 100);
const color = (hex: string | undefined, fallback: string) => {
  const safe = /^#[0-9a-f]{6}$/i.test(hex ?? "") ? hex! : fallback;
  return rgb(...[1, 3, 5].map(i => parseInt(safe.slice(i, i + 2), 16) / 255) as [number, number, number]);
};

/** Render the supplied accounting snapshot only; totals are authoritative cents. */
export async function renderInvoicePdf(input: InvoicePdfInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica), bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const primary = color(input.primaryColor, FIELDGRID_PRIMARY), accent = color(input.accentColor, FIELDGRID_SECONDARY);
  const ink = rgb(.10, .16, .21), muted = rgb(.40, .46, .52), rule = rgb(.85, .89, .92), soft = rgb(.96, .97, .98);
  const left = 48, right = 547, width = right - left;
  const safe = (text: string) => [...text.replace(/\t/g, " ")].map(c => { try { font.encodeText(c); return c; } catch { return "?"; } }).join("");
  const wrap = (value: string, size: number, max: number, face = font) => {
    const lines: string[] = [];
    for (const paragraph of value.split("\n").map(safe)) {
      let current = "";
      for (const word of paragraph.split(/\s+/)) {
        const proposed = current ? `${current} ${word}` : word;
        if (face.widthOfTextAtSize(proposed, size) <= max) { current = proposed; continue; }
        if (current) lines.push(current);
        current = "";
        for (const character of word) {
          if (face.widthOfTextAtSize(current + character, size) > max) { lines.push(current); current = ""; }
          current += character;
        }
      }
      lines.push(current);
    }
    return lines;
  };
  let logo: PDFImage | undefined;
  if (input.logo) {
    try {
      const bytes = await sharp(input.logo, { limitInputPixels: 16_000_000 }).rotate().resize(600, 220, { fit: "inside", withoutEnlargement: true }).png().toBuffer();
      logo = await doc.embedPng(bytes);
    } catch {
      // A damaged historical image must not prevent the accounting snapshot
      // from being read. Use the normal Fieldgrid wordmark in that case.
      logo = undefined;
    }
  }
  let page = doc.addPage([595.28, 841.89]), y = 0;
  const text = (value: string, x: number, at: number, size = 9, face = font, tint = ink) => page.drawText(safe(value), { x, y: at, size, font: face, color: tint });
  const alignRight = (value: string, end: number, at: number, size = 9, face = font, tint = ink) => text(value, end - face.widthOfTextAtSize(safe(value), size), at, size, face, tint);
  const brand = (continuation = false) => {
    page.drawRectangle({ x: 0, y: 830, width: 595.28, height: 12, color: primary });
    page.drawRectangle({ x: 0, y: 826, width: 595.28, height: 4, color: accent });
    if (logo) {
      const dimensions = logo.scaleToFit(170, 48);
      page.drawImage(logo, { x: left, y: 759 + (48 - dimensions.height) / 2, width: dimensions.width, height: dimensions.height });
    } else text("Fieldgrid", left, 777, 26, bold, primary);
    alignRight(input.concept ? "CONCEPTFACTUUR" : "FACTUUR", right, 792, 10, bold, accent);
    const reference = wrap(input.invoiceNumber, 15, 255, bold);
    reference.forEach((part, i) => alignRight(part, right, 766 - i * 18, 15, bold, primary));
    if (continuation) { text(`${input.tenantName} · vervolg`, left, 738, 9, font, muted); y = 705; }
  };
  const headings = () => {
    page.drawRectangle({ x: left, y: y - 6, width, height: 28, color: soft });
    text("Omschrijving", left + 10, y + 4, 8, bold, muted);
    alignRight("Aantal", 338, y + 4, 8, bold, muted);
    alignRight("Tarief", 408, y + 4, 8, bold, muted);
    alignRight("Btw", 452, y + 4, 8, bold, muted);
    alignRight("Excl. btw", right - 10, y + 4, 8, bold, muted);
    y -= 28;
  };
  const next = (table = true) => { page = doc.addPage([595.28, 841.89]); brand(true); if (table) headings(); };
  brand();
  const date = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) ? value.split("-").reverse().join("-") : value;
  y = Math.min(735, 746 - (wrap(input.invoiceNumber, 15, 255, bold).length - 1) * 18);
  const companyRows = (name: string, company: InvoiceCompany, address: Record<string, unknown>) => {
    const street = String(address.street ?? [address.street_name, address.house_number, address.house_letter, address.house_addition].filter(Boolean).join(" "));
    const locality = [address.postal_code, address.city, address.country && address.country !== "NL" ? address.country : ""].filter(Boolean).join(" ");
    const rows: Array<[string,string]> = [["Adres",[street,locality].filter(Boolean).join("\n")], ["KvK",company.companyNumber ?? ""], ["Btw",company.vatNumber ?? ""], ["IBAN",company.iban ?? ""], ["E-mail",company.email ?? ""], ["Telefoon",company.phone ?? ""]];
    return { name:wrap(company.legalName || name,11,215,bold), rows:rows.map(([label,value])=>({label,lines:wrap(value,8.5,158)})) };
  };
  const sender = companyRows(input.tenantName,{email:input.senderEmail,...input.sender},input.sender?.address ?? {});
  const recipient = companyRows(input.customerName,input.recipient ?? {},input.billingAddress);
  const companyHeight = (company:ReturnType<typeof companyRows>) => 49 + company.name.length * 16 + company.rows.reduce((total,row)=>total+Math.max(1,row.lines.length)*13+5,0);
  const blockHeight = Math.max(companyHeight(sender),companyHeight(recipient));
  const block = (company:ReturnType<typeof companyRows>,x:number,label:string) => {
    page.drawRectangle({x,y:y-blockHeight,width:239,height:blockHeight,color:soft});
    text(label,x+12,y-20,7.5,bold,accent);
    let at=y-42;
    company.name.forEach(part=>{text(part,x+12,at,11,bold,primary);at-=16;});
    at-=7;
    company.rows.forEach(row=>{
      text(row.label,x+12,at,8,font,muted);
      row.lines.forEach((part,index)=>text(part,x+68,at-index*13,8.5));
      at-=Math.max(1,row.lines.length)*13+5;
    });
  };
  block(sender,left,"AFZENDER");block(recipient,left+260,"FACTUUR AAN");
  y -= blockHeight+26;
  const meta: Array<[string, string]> = [["Factuurdatum", date(input.issuedOn)], ["Vervaldatum", date(input.dueOn)]];
  if (input.reference) meta.push(["Referentie", input.reference]);
  if (input.costCenter) meta.push(["Kostenplaats", input.costCenter]);
  for (let index = 0; index < meta.length; index += 2) {
    const heights: number[] = [];
    for (const [column, [label, value]] of meta.slice(index, index + 2).entries()) {
      const x = left + column * 270, values = wrap(value, 10, 225);
      text(label.toUpperCase(), x, y, 7.5, bold, muted);
      values.forEach((part, i) => text(part, x, y - 17 - i * 14, 10));
      heights.push(20 + values.length * 14);
    }
    y -= Math.max(...heights);
    if (y < 180) next(false);
  }
  y -= 20; headings();
  for (const item of input.lines) {
    const description = wrap(item.description, 9, 239), quantity = new Intl.NumberFormat("nl-NL", { maximumFractionDigits: 3 }).format(item.quantity);
    const rowHeight = description.length * 14 + (item.unit ? 13 : 0) + 16;
    if (y - Math.min(rowHeight, 180) < 90) next();
    const top = y;
    alignRight(quantity, 338, top, 8.5);
    alignRight(money(item.unitPriceCents), 408, top, 8.5);
    alignRight(`${item.vatBasisPoints / 100}%`, 452, top, 8.5);
    alignRight(money(item.subtotalCents ?? Math.round(item.quantity * item.unitPriceCents)), right - 10, top, 8.5);
    for (const part of description) { if (y < 90) next(); text(part, left + 10, y, 9); y -= 14; }
    if (item.unit) { text(`Eenheid: ${item.unit}`, left + 10, y, 8, font, muted); y -= 13; }
    page.drawLine({ start: { x: left, y: y - 3 }, end: { x: right, y: y - 3 }, thickness: .5, color: rule }); y -= 19;
  }
  const rates = new Map<number, number>();
  input.lines.forEach(item => rates.set(item.vatBasisPoints, (rates.get(item.vatBasisPoints) ?? 0) + (item.vatCents ?? Math.round((item.subtotalCents ?? item.quantity * item.unitPriceCents) * item.vatBasisPoints / 10000))));
  // Legacy callers can omit per-line VAT. Preserve the authoritative total.
  const detailed = input.lines.every(item => item.vatCents != null);
  const totals: Array<[string, number]> = [["Subtotaal excl. btw", input.subtotalCents], ...(detailed ? Array.from(rates, ([rate, value]): [string, number] => [`Btw ${rate / 100}%`, value]) : [["Btw", input.vatCents] as [string, number]])];
  const totalsHeight = totals.length * 23 + 90;
  if (y - totalsHeight < 90) next(false);
  y -= 16;
  totals.forEach(([label, value]) => { text(label, 324, y, 9, font, muted); alignRight(money(value), right - 10, y, 10); y -= 23; });
  page.drawRectangle({ x: 311, y: y - 26, width: right - 311, height: 43, color: primary });
  text("Totaal incl. btw", 324, y - 10, 10, bold, rgb(1, 1, 1));
  alignRight(money(input.totalCents), right - 10, y - 10, 13, bold, rgb(1, 1, 1));
  y -= 65;
  const paymentNote = input.concept ? "Concept ter controle. Maak de factuur definitief voor verzending en betaling." : `Graag betalen vóór ${date(input.dueOn)}. Vermeld ${input.invoiceNumber} bij de betaling.`;
  for (const part of wrap(paymentNote, 8, width)) { if (y < 90) next(false); text(part, left, y, 8, font, muted); y -= 13; }
  doc.getPages().forEach((sheet, index) => {
    page = sheet;
    page.drawLine({ start: { x: left, y: 67 }, end: { x: right, y: 67 }, thickness: .6, color: rule });
    wrap(input.footer ?? input.tenantName, 7, width - 65).slice(0, 3).forEach((part, i) => text(part, left, 50 - i * 11, 7, font, muted));
    alignRight(`${index + 1} / ${doc.getPageCount()}`, right, 50, 8, font, muted);
  });
  doc.setTitle(`${input.concept ? "Conceptfactuur" : "Factuur"} ${input.invoiceNumber}`); doc.setProducer("Fieldgrid");
  return doc.save({ useObjectStreams: false });
}
