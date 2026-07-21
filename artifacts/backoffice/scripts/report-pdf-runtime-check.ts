import assert from "node:assert/strict";
import PDFDocument from "pdfkit";
import {
  REPORT_PDF_MAX_SOURCE_IMAGE_BYTES,
  fetchReportPdfImageBuffer,
  normalizeReportPdfImageBuffer,
} from "../src/lib/report-pdf-images.ts";

const ONE_PIXEL_WEBP = Buffer.from(
  "UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AAAAAA",
  "base64",
);

async function renderPdf(image: Buffer): Promise<Buffer> {
  const doc = new PDFDocument({ size: "A4", margin: 55, bufferPages: true });
  const chunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));

  const finished = new Promise<void>((resolve, reject) => {
    doc.on("end", resolve);
    doc.on("error", reject);
  });

  doc.image(image, 55, 55, { fit: [120, 120] });
  doc.end();
  await finished;
  return Buffer.concat(chunks);
}

async function main() {
  const normalizedWebp = await normalizeReportPdfImageBuffer(ONE_PIXEL_WEBP);
  assert.ok(normalizedWebp, "a valid WebP upload must be normalized");
  assert.equal(
    normalizedWebp.subarray(0, 3).toString("hex"),
    "ffd8ff",
    "normalization must produce a PDFKit-safe JPEG",
  );

  const renderedPdf = await renderPdf(normalizedWebp);
  assert.equal(
    renderedPdf.subarray(0, 5).toString("ascii"),
    "%PDF-",
    "the normalized image must render into a PDF",
  );

  assert.equal(
    await normalizeReportPdfImageBuffer(Buffer.from("not-an-image")),
    null,
  );
  assert.equal(
    await normalizeReportPdfImageBuffer(
      Buffer.alloc(REPORT_PDF_MAX_SOURCE_IMAGE_BYTES + 1),
    ),
    null,
    "oversized image sources must be rejected before decoding",
  );

  const fetchedWebp = await fetchReportPdfImageBuffer(
    "https://storage.invalid/photo.webp",
    async () =>
      new Response(ONE_PIXEL_WEBP, {
        status: 200,
        headers: {
          "content-type": "image/webp",
          "content-length": String(ONE_PIXEL_WEBP.byteLength),
        },
      }),
  );
  assert.ok(fetchedWebp, "a fetched WebP must be normalized");

  const rejectedVideo = await fetchReportPdfImageBuffer(
    "https://storage.invalid/video.mp4",
    async () =>
      new Response(ONE_PIXEL_WEBP, {
        status: 200,
        headers: { "content-type": "video/mp4" },
      }),
  );
  assert.equal(
    rejectedVideo,
    null,
    "video attachments must not be passed to PDFKit as images",
  );

  const rejectedDeclaredSize = await fetchReportPdfImageBuffer(
    "https://storage.invalid/oversized.jpg",
    async () =>
      new Response(ONE_PIXEL_WEBP, {
        status: 200,
        headers: {
          "content-type": "image/jpeg",
          "content-length": String(REPORT_PDF_MAX_SOURCE_IMAGE_BYTES + 1),
        },
      }),
  );
  assert.equal(
    rejectedDeclaredSize,
    null,
    "oversized responses must be rejected before buffering",
  );

  console.log(
    JSON.stringify({
      normalizedWebp: true,
      pdfBytes: renderedPdf.byteLength,
      invalidImageRejected: true,
      videoRejected: true,
      oversizedRejected: true,
    }),
  );
}

void main();
