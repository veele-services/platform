#!/usr/bin/env node

import { createHash } from "node:crypto";
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { basename, resolve } from "node:path";
import { spawnSync } from "node:child_process";

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
const androidSdkRoot =
  process.env.ANDROID_SDK_ROOT ??
  process.env.ANDROID_HOME ??
  resolve(homedir(), ".local", "share", "fieldgrid-android", "sdk");
const javaHome =
  process.env.JAVA_HOME ??
  resolve(homedir(), ".local", "share", "fieldgrid-android", "jdk-21");
const buildToolsRoot = resolve(androidSdkRoot, "build-tools", "36.0.0");
const commandEnvironment = {
  ...process.env,
  JAVA_HOME: javaHome,
  PATH: `${resolve(javaHome, "bin")}:${process.env.PATH ?? ""}`,
};

const apps = [
  {
    brand: "veele",
    packageId: "nl.veeleservices.personeel",
    label: "Veele Personeel",
    runtimeUrl: "https://veeleservices.fieldgrid.nl/personeel",
    apk: resolve(
      androidRoot,
      "apk",
      "veele",
      "release",
      "app-veele-release.apk",
    ),
    aab: resolve(
      androidRoot,
      "bundle",
      "veeleRelease",
      "app-veele-release.aab",
    ),
  },
  {
    brand: "fieldgrid",
    packageId: "nl.fieldgrid.personeel",
    label: "Fieldgrid Personeel",
    runtimeUrl: "https://fieldgrid.nl/personeel",
    apk: resolve(
      androidRoot,
      "apk",
      "fieldgrid",
      "release",
      "app-fieldgrid-release.apk",
    ),
    aab: resolve(
      androidRoot,
      "bundle",
      "fieldgridRelease",
      "app-fieldgrid-release.aab",
    ),
  },
];

function fail(message) {
  throw new Error(message);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: repositoryRoot,
    encoding: "utf8",
    env: commandEnvironment,
    maxBuffer: 16 * 1024 * 1024,
    ...options,
  });

  if (result.error || result.status !== 0) {
    const detail = [result.error?.message, result.stderr, result.stdout]
      .filter(Boolean)
      .join("\n")
      .trim();
    fail(
      `Commando mislukt: ${command} ${args.join(" ")}${detail ? `\n${detail}` : ""}`,
    );
  }

  return `${result.stdout ?? ""}${result.stderr ?? ""}`;
}

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function readZipJson(archive, entry) {
  const raw = run("unzip", ["-p", archive, entry]);
  try {
    return JSON.parse(raw);
  } catch {
    fail(`Ongeldige JSON in ${basename(archive)}:${entry}`);
  }
}

function metadataFromApk(path) {
  const output = run(resolve(buildToolsRoot, "aapt2"), [
    "dump",
    "badging",
    path,
  ]);
  const packageLine = output
    .split(/\r?\n/u)
    .find((line) => line.startsWith("package:"));
  const targetLine = output
    .split(/\r?\n/u)
    .find((line) => line.startsWith("targetSdkVersion:"));
  const labelLine = output
    .split(/\r?\n/u)
    .find((line) => line.startsWith("application-label:"));

  const packageId = packageLine?.match(/name='([^']+)'/u)?.[1];
  const versionCode = packageLine?.match(/versionCode='([^']+)'/u)?.[1];
  const versionName = packageLine?.match(/versionName='([^']+)'/u)?.[1];
  const targetSdk = targetLine?.match(/'([^']+)'/u)?.[1];
  const label = labelLine?.match(/'([^']+)'/u)?.[1];

  if (!packageId || !versionCode || !versionName || !targetSdk || !label) {
    fail(`APK-metadata kon niet volledig worden gelezen: ${path}`);
  }

  return { packageId, versionCode, versionName, targetSdk, label };
}

function verifyApk(path) {
  const output = run(resolve(buildToolsRoot, "apksigner"), [
    "verify",
    "--verbose",
    "--print-certs",
    path,
  ]);
  if (
    !/Verified using v2 scheme \(APK Signature Scheme v2\): true/u.test(output)
  ) {
    fail(`APK mist een geldige v2-handtekening: ${path}`);
  }
  const certificateSha256 = output.match(
    /Signer #1 certificate SHA-256 digest:\s*([0-9a-f]+)/iu,
  )?.[1];
  if (!certificateSha256) {
    fail(`APK-certificaat kon niet worden gelezen: ${path}`);
  }
  return certificateSha256.toLowerCase();
}

function verifyAab(path) {
  const output = run(resolve(javaHome, "bin", "jarsigner"), ["-verify", path]);
  if (!/jar verified/iu.test(output)) {
    fail(`AAB-handtekening kon niet worden bevestigd: ${path}`);
  }
}

function verifyRuntimeConfig(config, app) {
  if (
    config.appId !== app.packageId ||
    config.appName !== app.label ||
    config.server?.url !== app.runtimeUrl ||
    config.server?.cleartext !== false
  ) {
    fail(
      `Capacitorconfig klopt niet voor ${app.brand}: verwacht ${app.packageId} op ${app.runtimeUrl}.`,
    );
  }
}

const requiredTools = [
  resolve(buildToolsRoot, "aapt2"),
  resolve(buildToolsRoot, "apksigner"),
  resolve(javaHome, "bin", "jarsigner"),
];
for (const tool of requiredTools) {
  if (!existsSync(tool))
    fail(`Vereist verificatieprogramma ontbreekt: ${tool}`);
}

const dirty = run("git", [
  "status",
  "--porcelain",
  "--untracked-files=no",
]).trim();
if (
  dirty &&
  process.env.FIELDGRID_ALLOW_DIRTY_ANDROID_BUILD?.toLowerCase() !== "true"
) {
  fail(
    "Artifactcollectie gestopt: de worktree bevat ongecommitteerde tracked wijzigingen. Commit eerst of zet FIELDGRID_ALLOW_DIRTY_ANDROID_BUILD=true alleen voor lokale ontwikkeling.",
  );
}

const actualCommit = run("git", ["rev-parse", "HEAD"]).trim();
const requestedCommit = process.env.FIELDGRID_SOURCE_COMMIT?.trim();
if (requestedCommit && requestedCommit !== actualCommit) {
  fail(
    `FIELDGRID_SOURCE_COMMIT ${requestedCommit} is niet de huidige HEAD ${actualCommit}.`,
  );
}

for (const app of apps) {
  for (const artifact of [app.apk, app.aab]) {
    if (!existsSync(artifact)) {
      fail(`Buildartefact ontbreekt: ${artifact}`);
    }
  }
}

const verifiedApps = apps.map((app) => {
  const metadata = metadataFromApk(app.apk);
  if (
    metadata.packageId !== app.packageId ||
    metadata.label !== app.label ||
    metadata.targetSdk !== "36"
  ) {
    fail(
      `APK-identiteit klopt niet voor ${app.brand}: ${JSON.stringify(metadata)}.`,
    );
  }
  if (!/^[1-9][0-9]*$/u.test(metadata.versionCode)) {
    fail(`Ongeldige versionCode voor ${app.brand}: ${metadata.versionCode}`);
  }

  const apkConfig = readZipJson(app.apk, "assets/capacitor.config.json");
  const aabConfig = readZipJson(app.aab, "base/assets/capacitor.config.json");
  verifyRuntimeConfig(apkConfig, app);
  verifyRuntimeConfig(aabConfig, app);

  const certificateSha256 = verifyApk(app.apk);
  verifyAab(app.aab);

  return { ...app, metadata, certificateSha256 };
});

const versions = new Set(
  verifiedApps.map(
    (app) => `${app.metadata.versionName}:${app.metadata.versionCode}`,
  ),
);
if (versions.size !== 1) {
  fail("Veele en Fieldgrid zijn niet met dezelfde releaseversie gebouwd.");
}

mkdirSync(outputRoot, { recursive: true, mode: 0o700 });
chmodSync(outputRoot, 0o700);

const artifacts = [];
for (const app of verifiedApps) {
  for (const [type, source] of [
    ["apk", app.apk],
    ["aab", app.aab],
  ]) {
    const target = resolve(
      outputRoot,
      `${app.brand}-personeel-${app.metadata.versionName}-${app.metadata.versionCode}.${type}`,
    );
    copyFileSync(source, target);
    chmodSync(target, 0o600);
    artifacts.push({
      brand: app.brand,
      packageId: app.packageId,
      runtimeUrl: app.runtimeUrl,
      type,
      file: target,
      bytes: statSync(target).size,
      sha256: sha256(target),
      uploadCertificateSha256: app.certificateSha256,
    });
  }
}

const { versionCode, versionName } = verifiedApps[0].metadata;
const manifest = {
  generatedAt: new Date().toISOString(),
  sourceCommit: actualCommit,
  sourceDirty: Boolean(dirty),
  versionCode: Number(versionCode),
  versionName,
  targetSdk: 36,
  verification: {
    apkSignatureSchemeV2: true,
    aabJarSignature: true,
    capacitorRuntimeConfig: true,
  },
  artifacts,
};

const manifestPath = resolve(outputRoot, "manifest.json");
writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, {
  encoding: "utf8",
  mode: 0o600,
});
chmodSync(manifestPath, 0o600);

process.stdout.write(
  `Vier geverifieerde, ondertekende Android-artefacten verzameld in ${outputRoot}\n`,
);
