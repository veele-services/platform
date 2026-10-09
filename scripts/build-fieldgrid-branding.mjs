import { readFile, writeFile } from "node:fs/promises";
import sharp from "sharp";

// The supplied, outlined SVG artwork is the source of truth. Commit generated
// variants so public branding does not need a runtime image provider.
const directory = new URL("../public/branding/", import.meta.url);
for (const variant of ["icon", "logo", "wordmark"]) {
  const source = await readFile(new URL(`fieldgrid-${variant}.svg`, directory), "utf8");
  const light = source.replaceAll("#092848", "#ffffff").replaceAll("#368341", "#8ed59b");
  await writeFile(new URL(`fieldgrid-${variant}-light.svg`, directory), light);
}

const icon = await readFile(new URL("fieldgrid-icon.svg", directory));
for (const size of [192, 512]) {
  for (const maskable of [false, true]) {
    // A maskable icon keeps every tile inside the central 80% safe circle.
    const artworkSize = Math.round(size * (maskable ? 0.56 : 0.8));
    const artwork = await sharp(icon).resize(artworkSize, artworkSize).png().toBuffer();
    await sharp({ create: { width: size, height: size, channels: 3, background: "#ffffff" } })
      .composite([{ input: artwork, gravity: "centre" }])
      .png()
      .toFile(new URL(`fieldgrid-icon${maskable ? "-maskable" : ""}-${size}.png`, directory).pathname);
  }
}

const appleArtwork = await sharp(icon).resize(144, 144).png().toBuffer();
await sharp({ create: { width: 180, height: 180, channels: 3, background: "#ffffff" } })
  .composite([{ input: appleArtwork, gravity: "centre" }])
  .png()
  .toFile(new URL("fieldgrid-apple-touch-icon.png", directory).pathname);

const favicon = icon.toString("utf8").replace("<g transform=", '<rect width="140" height="140" rx="24" fill="#ffffff"/>\n<g transform=');
await writeFile(new URL("../public/favicon.svg", import.meta.url), favicon);
console.log("Fieldgrid SVG variants, Android icons and Apple touch icon generated.");
