import { chromium } from "@playwright/test";
import { promises as fs } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const outputRoot = path.resolve(process.argv[2] ?? "test-results");

async function findScreenshots(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true }).catch(() => []);
  const files = [];
  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await findScreenshots(entryPath));
    else if (entry.isFile() && /^route-.+\.png$/.test(entry.name)) files.push(entryPath);
  }
  return files;
}

function escapeHtml(value) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function labelFor(file) {
  return path.basename(file, ".png").replace(/^route-/, "").replaceAll("-", " ");
}

function htmlFor(project, files) {
  const cards = files.map((file) => {
    const label = labelFor(file);
    const source = pathToFileURL(file).href;
    return `<figure><a href="${source}"><img src="${source}" alt="${escapeHtml(label)}"></a><figcaption>${escapeHtml(label)}</figcaption></figure>`;
  }).join("");

  return `<!doctype html><html lang="nl"><meta charset="utf-8"><title>Veele Services - ${project} route contact sheet</title><style>
  *{box-sizing:border-box}html{background:#071b30;color:#fff;font-family:Arial,sans-serif}body{margin:0;padding:32px}header{align-items:end;display:flex;justify-content:space-between;margin-bottom:24px}h1{font-size:32px;margin:0}p{color:#a6b7c8;margin:0}main{display:grid;gap:20px;grid-template-columns:repeat(4,minmax(0,1fr))}figure{background:#fff;border:1px solid #294157;border-radius:14px;box-shadow:0 10px 30px #0005;margin:0;overflow:hidden}a{background:#e7edf2;display:block;height:430px;overflow:hidden}img{display:block;height:auto;width:100%}figcaption{background:#102a42;color:#dce9f3;font-size:13px;font-weight:700;padding:12px 14px;text-transform:capitalize}
  </style><body><header><h1>${project} route audit</h1><p>${files.length} pagina's - volledige pagina, bovenaan uitgelijnd</p></header><main>${cards}</main></body></html>`;
}

const screenshots = await findScreenshots(outputRoot);
if (screenshots.length === 0) throw new Error(`Geen route-screenshots gevonden onder ${outputRoot}.`);

const projects = new Map([
  ["desktop", screenshots.filter((file) => file.includes("desktop-chromium"))],
  ["mobile", screenshots.filter((file) => file.includes("mobile-chromium"))],
]);

const browser = await chromium.launch();
try {
  for (const [project, files] of projects) {
    files.sort((a, b) => labelFor(a).localeCompare(labelFor(b), "nl"));
    if (files.length === 0) continue;
    const htmlPath = path.join(outputRoot, `visual-contact-sheet-${project}.html`);
    const pngPath = path.join(outputRoot, `visual-contact-sheet-${project}.png`);
    await fs.writeFile(htmlPath, htmlFor(project, files), "utf8");
    const page = await browser.newPage({ viewport: { width: 1800, height: 1000 } });
    await page.goto(pathToFileURL(htmlPath).href, { waitUntil: "load" });
    await page.locator("img").first().waitFor({ state: "visible" });
    await page.screenshot({ path: pngPath, fullPage: true });
    await page.close();
    console.log(`${project}: ${files.length} routes -> ${pngPath}`);
  }
} finally {
  await browser.close();
}
