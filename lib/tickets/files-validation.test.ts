import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { PDFDocument, PDFName, PDFString } from "pdf-lib";
import { readTicketBody, ticketFileName, ticketHash, validateTicketFile } from "./files-validation";

describe("ticket file full-content validation", () => {
  it("decodes and strips image metadata without accepting a MIME spoof", async () => {
    const original = await sharp({ create: { width: 20, height: 20, channels: 3, background: "red" } }).withExif({ IFD0: { Artist: "PRIVATE-CANARY" } }).jpeg().toBuffer();
    const clean = await validateTicketFile(original, "image/jpeg");
    expect((await sharp(clean).metadata()).exif).toBeUndefined(); expect(clean.includes(Buffer.from("PRIVATE-CANARY"))).toBe(false);
    await expect(validateTicketFile(original, "image/png")).rejects.toThrow();
  });
  it("accepts a complete PDF but rejects active content and truncated files", async () => {
    const doc = await PDFDocument.create(); doc.addPage(); const good = await doc.save();
    expect(await validateTicketFile(good, "application/pdf")).toEqual(Buffer.from(good));
    doc.catalog.set(PDFName.of("OpenAction"), doc.context.obj({ S: PDFName.of("JavaScript"), JS: PDFString.of("alert('not executed')") }));
    await expect(validateTicketFile(await doc.save(), "application/pdf")).rejects.toThrow("Actieve");
    await expect(validateTicketFile(good.subarray(0, 60), "application/pdf")).rejects.toThrow();
  });
  it("does not confuse signature checks with a valid decoded image", async () => {
    await expect(validateTicketFile(Buffer.from([137,80,78,71,13,10,26,10]), "image/png")).rejects.toThrow();
    await expect(validateTicketFile(Buffer.from("GIF89a arbitrary bytes"), "image/gif")).rejects.toThrow();
  });
  it("normalizes unsafe names and hashes the exact content", () => {
    expect(ticketFileName("../../bewijs\u202e\r\n.pdf")).toBe("bewijs.pdf"); expect(ticketFileName("C:\\fakepath\\foto.png")).toBe("foto.png");
    expect(() => ticketFileName(".." )).toThrow(); expect(ticketHash(Buffer.from("a"))).not.toBe(ticketHash(Buffer.from("b")));
  });
  it("enforces actual streamed size, not only client metadata", async () => {
    await expect(readTicketBody(new Request("http://localhost", { method: "PUT", body: "abcd" }), 3)).rejects.toThrow();
    await expect(readTicketBody(new Request("http://localhost", { method: "PUT", body: "a" }), 3)).rejects.toThrow();
    expect(await readTicketBody(new Request("http://localhost", { method: "PUT", body: "abc" }), 3)).toEqual(Buffer.from("abc"));
  });
});
