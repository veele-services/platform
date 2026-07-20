import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const content = JSON.parse(fs.readFileSync(path.join(root, "content/website-content.json"), "utf8"));
const promptFiles = [
  "docs/photo-prompts/brand-local-conversion.md",
  "docs/photo-prompts/cleaning-security.md",
  "docs/photo-prompts/facility-sectors.md",
];

const source = promptFiles
  .map((file) => fs.readFileSync(path.join(root, file), "utf8"))
  .join("\n");

const routeMarkers = [...source.matchAll(/^\*\*Routes?(?: en plaatsing|\/plaatsing):\*\*/gm)];
const blocks = routeMarkers.map((marker, index) => source.slice(
  marker.index,
  routeMarkers[index + 1]?.index ?? source.length,
));

const normalize = (value) => value
  .normalize("NFKC")
  .toLocaleLowerCase("nl-NL")
  .replace(/[“”„'‘’`]/g, "")
  .replace(/[^\p{L}\p{N}/]+/gu, " ")
  .replace(/\s+/g, " ")
  .trim();

const failures = [];
let placementCount = 0;

for (const page of content.pages) {
  const routeToken = `\`${page.slug}\``;
  const routeBlocks = blocks.filter((block) => block.includes(routeToken));
  const hasHero = routeBlocks.some((block) => /\bhero\b/i.test(block));
  placementCount += 1;

  if (!hasHero) failures.push(`${page.slug}: hero ontbreekt`);

  for (const [index, section] of (page.sections ?? []).entries()) {
    placementCount += 1;
    const heading = normalize(section.heading);
    const matched = routeBlocks.some((block) => normalize(block).includes(heading));
    if (!matched) failures.push(`${page.slug}: sectie ${index + 1} “${section.heading}” ontbreekt`);
  }
}

for (const [index, block] of blocks.entries()) {
  const required = [
    [/\*\*(?:Doelbestand(?: en formaat|, master en crops)?|Bestand):\*\*/i, "doelbestand"],
    [/\b(?:7680|8192)\s*[×x]\s*\d{4}\b/i, "8K-masterafmeting"],
    [/\b(?:desktop|webexports?)\b/i, "desktop-export"],
    [/\bmobiel(?:e)?\b/i, "mobiele export"],
    [/\*\*Prompt:\*\*|```text/i, "uitgeschreven prompt"],
    [/logo/i, "logo-instructie"],
    [/negative prompt/i, "negative prompt"],
  ];

  for (const [pattern, label] of required) {
    if (!pattern.test(block)) failures.push(`promptblok ${index + 1}: ${label} ontbreekt`);
  }
}

if (content.pages.length !== 44 || placementCount !== 223) {
  failures.push(`contentinventaris onverwacht: ${content.pages.length} routes, ${placementCount} plaatsingen`);
}

if (failures.length) {
  console.error(`Fotopromptcontrole mislukt (${failures.length}):`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`Fotopromptcontrole geslaagd: ${content.pages.length} routes en ${placementCount} plaatsingen gedekt door ${blocks.length} zelfstandige promptblokken.`);
