import sharp from "sharp";

export const REPORT_PDF_MAX_SOURCE_IMAGE_BYTES = 12 * 1024 * 1024;
export const REPORT_PDF_MAX_INPUT_PIXELS = 40_000_000;
export const REPORT_PDF_MAX_RENDER_DIMENSION = 1600;

type FetchImage = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

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

export async function fetchReportPdfImageBuffer(
  signedUrl: string,
  fetchImage: FetchImage = fetch,
): Promise<Buffer | null> {
  try {
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
    if (
      Number.isFinite(declaredLength) &&
      declaredLength > REPORT_PDF_MAX_SOURCE_IMAGE_BYTES
    )
      return null;

    const source = Buffer.from(await response.arrayBuffer());
    return normalizeReportPdfImageBuffer(source);
  } catch {
    return null;
  }
}
