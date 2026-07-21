import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const root = fileURLToPath(new URL("../../", import.meta.url));
const read = (path) =>
  readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

const route = read(
  "artifacts/backoffice/src/app/api/reports/[id]/pdf/route.ts",
);
const imagePipeline = read("artifacts/backoffice/src/lib/report-pdf-images.ts");

test("report PDF access follows the reports:read product contract and fails closed with HTTP 403", () => {
  assert.match(
    route,
    /getSensitiveRuntimeAccess\(\{[\s\S]*scope: "reports",[\s\S]*accessLevel: "full_read"/u,
  );
  assert.match(route, /exportDownload: true/u);
  assert.match(
    route,
    /if \(!sensitiveAccess\.allowed\)\s+return new NextResponse\("Forbidden", \{ status: 403 \}\)/u,
  );
  assert.doesNotMatch(route, /requireSensitiveRuntimeAccess/u);
});

test("report PDF attachments are bounded, normalized and individually fail-safe", () => {
  assert.match(imagePipeline, /sharp\(source, \{/u);
  assert.match(imagePipeline, /limitInputPixels: REPORT_PDF_MAX_INPUT_PIXELS/u);
  assert.match(imagePipeline, /\.resize\(\{/u);
  assert.match(imagePipeline, /\.jpeg\(\{ quality: 84/u);
  assert.match(imagePipeline, /!contentType\.startsWith\("image\/"\)/u);
  assert.match(
    imagePipeline,
    /declaredLength > REPORT_PDF_MAX_SOURCE_IMAGE_BYTES/u,
  );
  assert.match(
    route,
    /createSignedUrl\(safeStoragePath, 300\)[\s\S]*catch \{/u,
  );
  assert.match(
    route,
    /omittedAttachmentCount = rawPhotos\.length - photoBuffers\.length/u,
  );
  assert.match(route, /try \{[\s\S]*doc\.image\(photoBuffers\[i\]!/u);
});

test("report PDF stream errors reject and footers do not create phantom pages", () => {
  assert.match(route, /doc\.on\("error", reject\)/u);
  assert.match(route, /doc\.switchToPage\(range\.start \+ i\)/u);
  assert.match(route, /doc\.page\.margins\.bottom = 0/u);
  assert.match(route, /doc\.page\.margins\.bottom = bottomMargin/u);
});

test("WebP normalization renders with PDFKit while invalid, video and oversized inputs are skipped", () => {
  const output = execFileSync(
    "pnpm",
    [
      "--filter",
      "@workspace/backoffice",
      "exec",
      "tsx",
      "scripts/report-pdf-runtime-check.ts",
    ],
    { cwd: root, encoding: "utf8", timeout: 30_000 },
  );
  const result = JSON.parse(output.trim().split("\n").at(-1));

  assert.equal(result.normalizedWebp, true);
  assert.ok(result.pdfBytes > 100);
  assert.equal(result.invalidImageRejected, true);
  assert.equal(result.videoRejected, true);
  assert.equal(result.oversizedRejected, true);
});
