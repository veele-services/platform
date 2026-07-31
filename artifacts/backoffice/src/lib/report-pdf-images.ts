import sharp from "sharp";

export const REPORT_PDF_MAX_SOURCE_IMAGE_BYTES = 12 * 1024 * 1024;
export const REPORT_PDF_MAX_TOTAL_SOURCE_BYTES = 36 * 1024 * 1024;
export const REPORT_PDF_MAX_ATTACHMENTS = 24;
export const REPORT_PDF_MAX_INPUT_PIXELS = 40_000_000;
export const REPORT_PDF_MAX_RENDER_DIMENSION = 1600;

type FetchImage = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export type ReportPdfImage = {
  buffer: Buffer | null;
  sourceBytes: number;
};

async function readBoundedResponseBody(
  response: Response,
  maxBytes: number,
): Promise<{ buffer: Buffer | null; sourceBytes: number }> {
  if (!response.body || maxBytes <= 0) {
    return { buffer: null, sourceBytes: 0 };
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let receivedBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;

      receivedBytes += value.byteLength;
      if (receivedBytes > maxBytes) {
        await reader.cancel("Fieldgrid report PDF source limit exceeded");
        return { buffer: null, sourceBytes: maxBytes };
      }
      chunks.push(value);
    }
  } catch {
    return {
      buffer: null,
      sourceBytes: Math.min(receivedBytes, maxBytes),
    };
  } finally {
    reader.releaseLock();
  }

  return {
    buffer: Buffer.concat(
      chunks.map((chunk) =>
        Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength),
      ),
      receivedBytes,
    ),
    sourceBytes: receivedBytes,
  };
}

/**
 * PDFKit accepts JPEG and PNG, while assignment uploads also accept WebP.
 * Normalize every usable image to a bounded JPEG before it reaches PDFKit so
 * an unsupported, corrupt or unexpectedly large attachment cannot abort the
 * complete report download.
 */
export async function normalizeReportPdfImageBuffer(
  source: Buffer,
): Promise<Buffer | null> {
  if (
    source.byteLength === 0 ||
    source.byteLength > REPORT_PDF_MAX_SOURCE_IMAGE_BYTES
  )
    return null;

  try {
    return await sharp(source, {
      failOn: "error",
      limitInputPixels: REPORT_PDF_MAX_INPUT_PIXELS,
    })
      .rotate()
      .resize({
        width: REPORT_PDF_MAX_RENDER_DIMENSION,
        height: REPORT_PDF_MAX_RENDER_DIMENSION,
        fit: "inside",
        withoutEnlargement: true,
      })
      .flatten({ background: "#FFFFFF" })
      .jpeg({ quality: 84, progressive: false })
      .toBuffer();
  } catch {
    return null;
  }
}

export async function fetchReportPdfImage(
  signedUrl: string,
  fetchImage: FetchImage = fetch,
  maxSourceBytes = REPORT_PDF_MAX_SOURCE_IMAGE_BYTES,
): Promise<ReportPdfImage | null> {
  try {
    const effectiveLimit = Math.min(
      REPORT_PDF_MAX_SOURCE_IMAGE_BYTES,
      Math.max(0, maxSourceBytes),
    );
    if (effectiveLimit === 0) return null;

    const response = await fetchImage(signedUrl, {
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) return null;

    const contentType =
      response.headers
        .get("content-type")
        ?.split(";", 1)[0]
        ?.trim()
        .toLowerCase() ?? "";
    if (
      contentType &&
      !contentType.startsWith("image/") &&
      contentType !== "application/octet-stream"
    ) {
      return null;
    }

    const declaredLength = Number.parseInt(
      response.headers.get("content-length") ?? "",
      10,
    );
    if (Number.isFinite(declaredLength) && declaredLength > effectiveLimit)
      return null;

    const source = await readBoundedResponseBody(response, effectiveLimit);
    if (!source.buffer) {
      return source.sourceBytes > 0
        ? { buffer: null, sourceBytes: source.sourceBytes }
        : null;
    }

    const buffer = await normalizeReportPdfImageBuffer(source.buffer);
    return { buffer, sourceBytes: source.sourceBytes };
  } catch {
    return null;
  }
}

export async function fetchReportPdfImageBuffer(
  signedUrl: string,
  fetchImage: FetchImage = fetch,
  maxSourceBytes = REPORT_PDF_MAX_SOURCE_IMAGE_BYTES,
): Promise<Buffer | null> {
  return (
    (await fetchReportPdfImage(signedUrl, fetchImage, maxSourceBytes))
      ?.buffer ?? null
  );
}
