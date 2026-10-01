import sharp from "sharp";
import { PDFDocument, PDFDict, PDFName, PDFArray, PDFRef } from "pdf-lib";
import { createHash } from "node:crypto";
import { TICKET_FILE_LIMIT } from "./scan";

export const TICKET_FILE_MIMES = ["image/jpeg", "image/png", "image/webp", "application/pdf"] as const;
export function ticketFileName(name: string): string {
  const safe = name.normalize("NFKC").split(/[\\/]/).pop()?.replace(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g, "").trim().slice(0, 180);
  if (!safe || safe === "." || safe === "..") throw new Error("Ongeldige bestandsnaam");
  return safe;
}
export function ticketHash(bytes: Uint8Array) { return createHash("sha256").update(bytes).digest("hex"); }

/** Parsing is supplementary to antivirus, never an alternative to scanning. */
export async function validateTicketFile(bytes: Uint8Array, mime: string): Promise<Buffer> {
  if (!bytes.length || bytes.length > TICKET_FILE_LIMIT) throw new Error("Een bestand mag maximaal 10 MB zijn");
  const input = Buffer.from(bytes);
  if (mime === "application/pdf") {
    if (input.subarray(0, 5).toString("ascii") !== "%PDF-" || !input.subarray(-2048).includes(Buffer.from("%%EOF"))) throw new Error("Ongeldige PDF");
    const pdf = await PDFDocument.load(input, { ignoreEncryption: false, throwOnInvalidObject: true, updateMetadata: false });
    if (pdf.isEncrypted || pdf.getPageCount() < 1 || pdf.getPageCount() > 500) throw new Error("Deze PDF kan niet veilig worden verwerkt");
    const forbidden = new Set(["JavaScript", "JS", "Launch", "EmbeddedFiles", "RichMedia", "XFA", "OpenAction", "AA"]);
    const seen = new Set<unknown>();
    const inspect = (object: unknown, depth: number) => {
      if (depth > 80 || seen.size > 100000) throw new Error("PDF is te complex");
      if (!object || seen.has(object)) return;
      seen.add(object);
      if (object instanceof PDFRef) return inspect(pdf.context.lookup(object), depth + 1);
      if (object instanceof PDFDict) for (const [key, value] of object.entries()) {
        if (forbidden.has(key.decodeText()) || (key.decodeText() === "S" && value instanceof PDFName && ["JavaScript", "Launch", "GoToR", "SubmitForm", "ImportData"].includes(value.decodeText()))) throw new Error("Actieve PDF-inhoud is niet toegestaan");
        inspect(value, depth + 1);
      }
      if (object instanceof PDFArray) for (const value of object.asArray()) inspect(value, depth + 1);
    };
    for (const [, object] of pdf.context.enumerateIndirectObjects()) inspect(object, 0);
    return input;
  }
  const format = ({ "image/jpeg": "jpeg", "image/png": "png", "image/webp": "webp" } as Record<string, string>)[mime];
  if (!format) throw new Error("Gebruik JPG, PNG, WebP of PDF");
  const decoder = sharp(input, { limitInputPixels: 20000000, failOn: "warning" });
  const metadata = await decoder.metadata();
  if (metadata.format !== format || (metadata.pages ?? 1) !== 1) throw new Error("Bestandstype komt niet overeen");
  const clean = decoder.rotate();
  const output = await (format === "jpeg" ? clean.jpeg({ quality: 92 }) : format === "webp" ? clean.webp({ quality: 92 }) : clean.png()).toBuffer();
  if (output.length > TICKET_FILE_LIMIT) throw new Error("Afbeelding is na verwerking te groot");
  return output;
}

export async function readTicketBody(request: Request, expectedSize: number): Promise<Buffer> {
  if (!Number.isInteger(expectedSize) || expectedSize < 1 || expectedSize > TICKET_FILE_LIMIT || !request.body) throw new Error("Ongeldige bestandsgrootte");
  const declared = request.headers.get("content-length");
  if (declared && Number(declared) !== expectedSize) throw new Error("Bestandsgrootte gewijzigd");
  const reader = request.body.getReader(), chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) { const { value, done } = await reader.read(); if (done) break; total += value.length; if (total > expectedSize) { await reader.cancel(); throw new Error("Bestand is te groot"); } chunks.push(value); }
  } finally { reader.releaseLock(); }
  if (total !== expectedSize) throw new Error("Upload is onvolledig");
  return Buffer.concat(chunks);
}
