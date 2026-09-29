import { describe, expect, it } from "vitest";
import { CUSTOMER_DOCUMENT_MAX_BYTES, customerDocumentExtension, customerDocumentFileName } from "./documents";

describe("customer document validation", () => {
  it.each([
    ["application/pdf", [0x25, 0x50, 0x44, 0x46, 0x2d], "pdf"],
    ["image/jpeg", [0xff, 0xd8, 0xff], "jpg"],
    ["image/png", [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], "png"],
  ])("accepts matching %s signatures", (mimeType, bytes, extension) => {
    expect(customerDocumentExtension(mimeType as string, Uint8Array.from(bytes as number[]))).toBe(extension);
  });
  it("rejects unsupported types, disguised HTML, empty and oversized files", () => {
    const html = new TextEncoder().encode("<html>not a PDF</html>");
    expect(() => customerDocumentExtension("text/html", html)).toThrow("Gebruik PDF");
    expect(() => customerDocumentExtension("application/pdf", html)).toThrow("bestandsinhoud");
    expect(() => customerDocumentExtension("application/pdf", new Uint8Array())).toThrow("Gebruik PDF");
    expect(() => customerDocumentExtension("application/pdf", new Uint8Array(CUSTOMER_DOCUMENT_MAX_BYTES + 1))).toThrow("maximaal 10 MB");
  });
  it("normalizes download filenames without exposing local paths or control characters", () => {
    expect(customerDocumentFileName("C:\\fakepath\\contract.pdf")).toBe("contract.pdf");
    expect(customerDocumentFileName("/tmp/contract\r\n.pdf")).toBe("contract.pdf");
    expect(customerDocumentFileName(" ")).toBe("document");
    expect(customerDocumentFileName("a".repeat(300))).toHaveLength(255);
  });
});
