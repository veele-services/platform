export const CUSTOMER_DOCUMENT_MAX_BYTES = 10 * 1024 * 1024;
export const CUSTOMER_DOCUMENT_ACCEPT = ".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png";

/** A name/category gate, not a claim to inspect the contents of a PDF or image. */
export function validateDossierDocumentName(title: string, fileName: string) {
  if (/\b(VOG|BSN|paspoort|identiteitsbewijs|medisch|diagnose|medicatie|alarmcode|kluiscode|wachtwoord)\b|verklaring.omtrent.gedrag|identiteitskopie/i.test(`${title} ${fileName}`)) {
    throw new Error("Upload geen medische documenten, identiteits- of VOG-kopieën en geen geheime toegangscodes. Gebruik het daarvoor bedoelde proces.");
  }
}

const signatures = {
  "application/pdf": { extension: "pdf", bytes: [0x25, 0x50, 0x44, 0x46, 0x2d] },
  "image/jpeg": { extension: "jpg", bytes: [0xff, 0xd8, 0xff] },
  "image/png": { extension: "png", bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
} as const;

export function customerDocumentExtension(mimeType: string, bytes: Uint8Array): string {
  const format = signatures[mimeType as keyof typeof signatures];
  if (!format || bytes.length === 0 || bytes.length > CUSTOMER_DOCUMENT_MAX_BYTES) {
    throw new Error("Gebruik PDF, JPG of PNG van maximaal 10 MB");
  }
  if (!format.bytes.every((byte, index) => bytes[index] === byte)) {
    throw new Error("De bestandsinhoud komt niet overeen met PDF, JPG of PNG");
  }
  return format.extension;
}

export function customerDocumentFileName(name: string): string {
  return name.split(/[\\/]/).pop()!.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 255) || "document";
}
