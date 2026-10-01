import sharp from "sharp";
import { PDFDocument } from "pdf-lib";
import { scanTicketBytes, ticketScanOptions, type ScanOptions } from "./scan";

/** Real scanner smoke: harmless EICAR anti-virus test string, then two valid
 * empty fixtures. No user files, provider emails, or secret configuration. */
export async function verifyTicketScanner(options: ScanOptions = ticketScanOptions()) {
  const eicar = Buffer.from('X5O!P%@AP[4\\PZX54(P^)7CC)7}$' + 'EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*');
  const threat = await scanTicketBytes(eicar, options);
  if (threat.status !== "rejected") throw new Error("Scanner weigert de gecontroleerde antivirustest niet; vrijgave geblokkeerd");
  const image = await sharp({ create: { width: 8, height: 8, channels: 3, background: "white" } }).png().toBuffer();
  const pdf = await PDFDocument.create(); pdf.addPage([100, 100]);
  for (const bytes of [image, await pdf.save()]) if ((await scanTicketBytes(bytes, options)).status !== "clean") throw new Error("Scanner accepteert het gecontroleerde geldige bestand niet");
  return { engine: threat.engine, databaseVersion: threat.databaseVersion, databaseAt: threat.databaseAt, eicarRejected: true, pngAccepted: true, pdfAccepted: true };
}
