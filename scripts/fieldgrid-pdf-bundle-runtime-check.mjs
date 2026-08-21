import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const applications = [
  {
    name: "backoffice",
    directory: "artifacts/backoffice",
    compiledRoute: ".next/server/app/api/invoices/[id]/pdf/route.js",
  },
  {
    name: "klant-pwa",
    directory: "artifacts/klant-pwa",
    compiledRoute: ".next/server/app/api/factuur/[id]/pdf/route.js",
  },
];

function javascriptFiles(directory) {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...javascriptFiles(path));
    else if (entry.isFile() && entry.name.endsWith(".js")) files.push(path);
  }
  return files;
}

async function renderPdfFromInstalledPackage(applicationDirectory) {
  const requireFromApplication = createRequire(
    join(applicationDirectory, "package.json"),
  );
  const pdfkit = requireFromApplication("pdfkit");
  const PDFDocument = pdfkit.default ?? pdfkit;
  const doc = new PDFDocument({ size: "A4", margin: 55 });
  const chunks = [];

  const finished = new Promise((resolveFinished, rejectFinished) => {
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", resolveFinished);
    doc.on("error", rejectFinished);
  });

  doc.font("Helvetica").fontSize(12).text("Fieldgrid PDF-bundelcontrole");
  doc.end();
  await finished;
  return Buffer.concat(chunks);
}

for (const application of applications) {
  const applicationDirectory = join(repositoryRoot, application.directory);
  const serverDirectory = join(applicationDirectory, ".next/server");
  const compiledRoute = join(applicationDirectory, application.compiledRoute);

  assert.ok(
    existsSync(serverDirectory),
    `${application.name}: voer eerst de production build uit; .next/server ontbreekt`,
  );
  assert.ok(
    existsSync(compiledRoute),
    `${application.name}: gebouwde PDF-route ontbreekt: ${application.compiledRoute}`,
  );
  assert.match(
    readFileSync(compiledRoute, "utf8"),
    /\.exports\s*=\s*require\(["']pdfkit["']\)/u,
    `${application.name}: de gebouwde PDF-route gebruikt PDFKit niet als externe server-package`,
  );

  const bundledPdfkitFiles = javascriptFiles(serverDirectory).filter((path) =>
    readFileSync(path, "utf8").includes("data/Helvetica.afm"),
  );
  assert.deepEqual(
    bundledPdfkitFiles,
    [],
    `${application.name}: PDFKit is gebundeld zonder gegarandeerde AFM-data: ${bundledPdfkitFiles.join(", ")}`,
  );

  const pdf = await renderPdfFromInstalledPackage(applicationDirectory);
  assert.equal(
    pdf.subarray(0, 5).toString("ascii"),
    "%PDF-",
    `${application.name}: de gedeployde PDFKit-package genereert geen geldige PDF`,
  );

  console.log(
    `${application.name}: PDFKit extern en runtime-PDF geldig (${pdf.byteLength} bytes)`,
  );
}
