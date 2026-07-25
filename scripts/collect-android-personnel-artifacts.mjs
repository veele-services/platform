#!/usr/bin/env node

import { createHash } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { resolve } from "node:path";

const repositoryRoot = resolve(import.meta.dirname, "..");
const androidRoot = resolve(
  repositoryRoot,
  "artifacts",
  "personeel-pwa",
  "android",
  "app",
  "build",
  "outputs",
);
const outputRoot = resolve(
  process.env.FIELDGRID_ANDROID_OUTPUT_DIR ??
    "/home/codex/output/fieldgrid-play",
);

const artifacts = [
  {
    brand: "veele",
    type: "apk",
    source: resolve(
      androidRoot,
      "apk",
      "veele",
      "release",
      "app-veele-release.apk",
    ),
    target: "veele-personeel-1.0.0-1.apk",
  },
  {
    brand: "veele",
    type: "aab",
    source: resolve(
      androidRoot,
      "bundle",
      "veeleRelease",
      "app-veele-release.aab",
    ),
    target: "veele-personeel-1.0.0-1.aab",
  },
  {
    brand: "fieldgrid",
    type: "apk",
    source: resolve(
      androidRoot,
      "apk",
      "fieldgrid",
      "release",
      "app-fieldgrid-release.apk",
    ),
    target: "fieldgrid-personeel-1.0.0-1.apk",
  },
  {
    brand: "fieldgrid",
    type: "aab",
    source: resolve(
      androidRoot,
      "bundle",
      "fieldgridRelease",
      "app-fieldgrid-release.aab",
    ),
    target: "fieldgrid-personeel-1.0.0-1.aab",
  },
];

for (const artifact of artifacts) {
  if (!existsSync(artifact.source)) {
    throw new Error(`Buildartefact ontbreekt: ${artifact.source}`);
  }
}

mkdirSync(outputRoot, { recursive: true });
const manifest = {
  generatedAt: new Date().toISOString(),
  sourceCommit: process.env.FIELDGRID_SOURCE_COMMIT ?? "local-unpushed",
  versionCode: 1,
  versionName: "1.0.0",
  artifacts: artifacts.map((artifact) => {
    const target = resolve(outputRoot, artifact.target);
    copyFileSync(artifact.source, target);
    const bytes = readFileSync(target);
    return {
      brand: artifact.brand,
      type: artifact.type,
      file: target,
      bytes: statSync(target).size,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    };
  }),
};

writeFileSync(
  resolve(outputRoot, "manifest.json"),
  `${JSON.stringify(manifest, null, 2)}\n`,
  "utf8",
);

process.stdout.write(
  `Vier ondertekende Android-artefacten verzameld in ${outputRoot}\n`,
);
