import "server-only";
import { PDFDocument, StandardFonts, rgb, type PDFFont } from "pdf-lib";
import type { ReportVersion } from "./report-model";
import { reportExtraTotal } from "./report-model";

export function reportBrandColor(value: string): ReturnType<typeof rgb> {
  const hex = /^#[0-9a-f]{6}$/i.test(value) ? value.slice(1) : "333333";
  return rgb(parseInt(hex.slice(0, 2), 16) / 255, parseInt(hex.slice(2, 4), 16) / 255, parseInt(hex.slice(4, 6), 16) / 255);
}

/** Render only the explicit, frozen report DTO. Customer projections contain no
 * personnel identity; the technical integrity hash stays in the database. */
export async function renderWorkOrderReportPdf(report: ReportVersion, assets: Array<{ id: string; bytes: Uint8Array; mime: string }> = []): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica), bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const snapshot = report.snapshot;
  const primary = reportBrandColor(snapshot.tenant.primaryColor), accent = reportBrandColor(snapshot.tenant.accentColor);
  const ink = rgb(.07, .13, .20), muted = rgb(.40, .46, .52), line = rgb(.85, .89, .92), soft = rgb(.96, .97, .98);
  const left = 52, right = 543, width = right - left;
  let page = doc.addPage([595.28, 841.89]), y = 778;
  const safe = (value: string) => [...value].map(character => { try { font.encodeText(character); return character; } catch { return "?"; } }).join("");
  const wrapped = (value: string, size = 10, maxWidth = width, face = font) => {
    const output: string[] = [];
    for (const paragraph of safe(value).split("\n")) {
      let current = "";
      for (const word of paragraph.split(/\s+/)) {
        const proposed = current ? `${current} ${word}` : word;
        if (face.widthOfTextAtSize(proposed, size) <= maxWidth) { current = proposed; continue; }
        if (current) output.push(current);
        current = "";
        for (const character of word) {
          if (face.widthOfTextAtSize(current + character, size) > maxWidth) { output.push(current); current = ""; }
          current += character;
        }
      }
      output.push(current);
    }
    return output;
  };
  const frame = () => {
    page.drawRectangle({ x: 0, y: 812, width: 595.28, height: 30, color: primary });
    page.drawRectangle({ x: left, y: 803, width, height: 3, color: accent });
  };
  const next = () => {
    page = doc.addPage([595.28, 841.89]); y = 772; frame();
    page.drawText(safe(`${snapshot.tenant.name} · ${snapshot.number}`), { x: left, y, size: 12, font: bold, color: ink }); y -= 34;
  };
  const space = (height: number) => { if (y - height < 72) next(); };
  const text = (value: string, options: { size?: number; face?: PDFFont; color?: ReturnType<typeof rgb>; x?: number; maxWidth?: number } = {}) => {
    const size = options.size ?? 10, face = options.face ?? font;
    for (const part of wrapped(value, size, options.maxWidth ?? width, face)) {
      space(size + 6); page.drawText(part, { x: options.x ?? left, y, size, font: face, color: options.color ?? ink }); y -= size + 6;
    }
  };
  const heading = (title: string) => { space(62); y -= 14; page.drawText(safe(title), { x: left, y, size: 12, font: bold, color: ink }); y -= 12; page.drawLine({ start: { x: left, y }, end: { x: right, y }, thickness: .7, color: line }); y -= 20; };
  const row = (title: string, description: string, amount?: string) => {
    const titleWidth = amount ? width - 120 : width;
    const nameLines = wrapped(title, 10, titleWidth, bold), detailLines = description ? wrapped(description, 9, titleWidth) : [];
    // Keep ordinary rows together. Long notes/results can continue over pages.
    space(Math.min(120, (nameLines.length + detailLines.length) * 15 + 16));
    if (amount) page.drawText(safe(amount), { x: right - font.widthOfTextAtSize(safe(amount), 10), y, size: 10, font: bold, color: ink });
    text(title, { face: bold, maxWidth: titleWidth });
    if (description) text(description, { size: 9, color: muted, maxWidth: titleWidth });
    page.drawLine({ start: { x: left, y: y + 1 }, end: { x: right, y: y + 1 }, thickness: .5, color: line }); y -= 12;
  };
  const money = (cents: number) => new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(cents / 100);
  const stamp = (at: string, dateOnly = false) => new Intl.DateTimeFormat("nl-NL", { dateStyle: dateOnly ? "long" : "short", ...(dateOnly ? {} : { timeStyle: "short" }), timeZone: snapshot.timezone }).format(new Date(at));
  const resultLabels: Record<string, string> = { completed: "Uitgevoerd", partial: "Deels uitgevoerd", not_done: "Niet uitgevoerd", not_applicable: "Niet van toepassing", in_progress: "In uitvoering", planned: "Gepland" };

  frame();
  text(snapshot.tenant.name, { size: 20, face: bold, color: primary }); y -= 23;
  text("WERKRAPPORT", { size: 9, face: bold, color: accent }); y -= 14;
  text(snapshot.number, { size: 22, face: bold });
  text(`${snapshot.title} · rapportversie ${report.version}`, { size: 10, color: muted }); y -= 17;
  const address = [snapshot.object.address.street, snapshot.object.address.postal_code, snapshot.object.address.city].filter(value => typeof value === "string" && value).join(", ");
  row("Opdrachtgever", snapshot.customer.name);
  row(snapshot.object.name, address);
  if (snapshot.executionDate) row("Uitvoering", stamp(snapshot.executionDate, true));
  if (snapshot.endedAt) row("Werkzaamheden afgerond", stamp(snapshot.endedAt));
  heading("Samenvatting"); text(snapshot.summary);
  heading("Uitgevoerde werkzaamheden");
  for (const task of snapshot.tasks.filter(task => !task.extraWork)) {
    const scope = [`${task.code} · ${task.executedQuantity} van ${task.quantity} ${task.unit}`, resultLabels[task.result] ?? "Vastgelegd", task.transferredQuantity ? `Overgedragen restwerk: ${task.transferredQuantity} ${task.unit}` : "", task.withdrawnQuantity ? `Ingetrokken: ${task.withdrawnQuantity} ${task.unit}` : ""].filter(Boolean).join(" · ");
    row(task.name, scope);
  }
  if (snapshot.notes.length) { heading("Notities"); for (const note of snapshot.notes) row(note.createdAt ? stamp(note.createdAt) : "Werknotitie", note.body); }
  if (snapshot.tasks.some(task => task.extraWork)) {
    heading("Meerwerk");
    for (const task of snapshot.tasks.filter(task => task.extraWork)) row(task.name, `${task.executedQuantity} ${task.unit} · ${resultLabels[task.result] ?? "Vastgelegd"}`, task.extraUnitPriceCents == null ? "Ter beoordeling" : money(Math.round(task.executedQuantity * task.extraUnitPriceCents)));
  }
  if (snapshot.materials?.length) { heading("Materiaal"); for (const material of snapshot.materials) row(material.description, `${material.quantity} ${material.unit}${material.unitPriceCents == null ? "" : ` · ${money(material.unitPriceCents)} per ${material.unit}`}`, material.unitPriceCents == null ? "Inbegrepen" : money(Math.round(material.unitPriceCents * material.quantity))); }
  if (snapshot.expenses?.length) { heading("Onkosten"); for (const expense of snapshot.expenses) row(expense.description, "Onkosten bij deze uitvoering", money(expense.amountCents)); }
  space(70); y -= 8;
  page.drawRectangle({ x: left, y: y - 28, width, height: 40, color: soft });
  page.drawText("Totaal extra kosten", { x: left + 12, y: y - 12, size: 11, font: bold, color: ink });
  const total = money(reportExtraTotal(snapshot)); page.drawText(total, { x: right - 12 - bold.widthOfTextAtSize(total, 13), y: y - 12, size: 13, font: bold, color: primary }); y -= 50;
  if (snapshot.checklists?.length) {
    heading("Controles");
    for (const answer of snapshot.checklists) row(answer.question, `${answer.name} · ${answer.notApplicable ? `Niet van toepassing: ${answer.reason ?? ""}` : answer.type === "photo" ? "Bewijsfoto bijgevoegd" : answer.value === true ? "Ja / gecontroleerd" : answer.value === false ? "Nee" : String(answer.value ?? "")}${answer.unit ? ` ${answer.unit}` : ""}`);
  }
  if (snapshot.attachments.length) { heading("Bijlagen"); for (const attachment of snapshot.attachments) row(attachment.name, attachment.mime === "application/pdf" ? "Document bij deze rapportversie" : "Foto bij deze rapportversie"); }
  const signatures = report.signatures.filter(signature => report.projection !== "customer_copy" || signature.kind === "customer");
  if (signatures.length || report.waiver) heading("Ondertekening");
  for (const signature of signatures) {
    const asset = assets.find(candidate => candidate.id === signature.id);
    const image = asset?.mime === "image/png" ? await doc.embedPng(asset.bytes) : asset?.mime === "image/jpeg" ? await doc.embedJpg(asset.bytes) : null;
    const dimensions = image?.scaleToFit(270, 95); space((dimensions?.height ?? 0) + 80);
    text(signature.kind === "customer" ? "Opdrachtgever" : "Medewerker", { size: 9, color: muted });
    text(`${signature.name} · ${signature.capacity}`, { face: bold }); text(stamp(signature.signedAt), { size: 9, color: muted });
    if (image && dimensions) { page.drawImage(image, { x: left, y: y - dimensions.height, width: dimensions.width, height: dimensions.height }); y -= dimensions.height + 16; }
    if (signature.capturedBy && report.projection !== "customer_copy") text(`Intern vastgelegd door ${signature.capturedBy}`, { size: 8, color: muted });
  }
  if (report.waiver) text(`Klantondertekening vrijgesteld: ${report.waiver.reason}`, { size: 9, color: muted });
  else if (!signatures.length) { heading("Ondertekening"); text(report.policy.mode === "required" ? "Wacht op handtekening opdrachtgever" : "Geen klantondertekening vastgelegd", { size: 9, color: muted }); }
  for (const attachment of snapshot.attachments) {
    const asset = assets.find(candidate => candidate.id === attachment.id);
    if (!asset) continue;
    const image = asset.mime === "image/png" ? await doc.embedPng(asset.bytes) : asset.mime === "image/jpeg" ? await doc.embedJpg(asset.bytes) : null;
    if (!image) continue;
    const dimensions = image.scaleToFit(width, 360); space(dimensions.height + 48); heading(attachment.name);
    space(dimensions.height + 10); page.drawImage(image, { x: left, y: y - dimensions.height, width: dimensions.width, height: dimensions.height }); y -= dimensions.height + 18;
  }
  doc.getPages().forEach((sheet, index) => {
    sheet.drawLine({ start: { x: left, y: 52 }, end: { x: right, y: 52 }, thickness: .5, color: line });
    sheet.drawText(safe(`${snapshot.number} · rapportversie ${report.version} · ${index + 1} / ${doc.getPageCount()}`), { x: left, y: 35, size: 8, font, color: muted });
    sheet.drawText("Powered by Fieldgrid", { x: right - font.widthOfTextAtSize("Powered by Fieldgrid", 7), y: 35, size: 7, font, color: muted });
  });
  doc.setTitle(`Werkrapport ${snapshot.number} v${report.version}`); doc.setSubject("Uitgevoerde werkzaamheden en ondertekening"); doc.setProducer("Fieldgrid");
  return doc.save({ useObjectStreams: false });
}
