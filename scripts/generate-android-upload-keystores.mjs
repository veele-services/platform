#!/usr/bin/env node

import { randomBytes } from "node:crypto";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";

const signingRoot =
  process.env.FIELDGRID_ANDROID_SIGNING_DIR ??
  join(homedir(), ".local", "share", "fieldgrid-android", "signing");
const propertiesPath =
  process.env.FIELDGRID_ANDROID_SIGNING_PROPERTIES ??
  join(signingRoot, "android-signing.properties");

const profiles = [
  {
    prefix: "VEELE",
    alias: "veele-personnel-upload",
    file: join(signingRoot, "veele-personnel-upload.p12"),
    dname: "CN=Veele Personnel Upload, OU=Mobile, O=Veele Services, C=NL",
  },
  {
    prefix: "FIELDGRID",
    alias: "fieldgrid-personnel-upload",
    file: join(signingRoot, "fieldgrid-personnel-upload.p12"),
    dname: "CN=Fieldgrid Personnel Upload, OU=Mobile, O=Fieldgrid, C=NL",
  },
];

function keytoolBinary() {
  if (process.env.JAVA_HOME) {
    return join(
      process.env.JAVA_HOME,
      "bin",
      process.platform === "win32" ? "keytool.exe" : "keytool",
    );
  }
  return process.platform === "win32" ? "keytool.exe" : "keytool";
}

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

if (existsSync(propertiesPath)) {
  const existing = readFileSync(propertiesPath, "utf8");
  for (const profile of profiles) {
    if (
      !existing.includes(`${profile.prefix}_STORE_FILE=`) ||
      !existsSync(profile.file)
    ) {
      fail(
        `Signingconfig bestaat al maar profiel ${profile.prefix} is onvolledig. Herstel handmatig: ${propertiesPath}`,
      );
    }
  }
  process.stdout.write(
    `Uploadkeys bestaan al; niets overschreven: ${propertiesPath}\n`,
  );
  process.exit(0);
}

mkdirSync(dirname(propertiesPath), { recursive: true, mode: 0o700 });
mkdirSync(signingRoot, { recursive: true, mode: 0o700 });

const propertyLines = [
  "# Lokaal gegenereerde uploadkeys. Nooit committen of delen via chat/e-mail.",
];

for (const profile of profiles) {
  if (existsSync(profile.file)) {
    fail(
      `Keystore bestaat al zonder propertiesbestand; niets overschreven: ${profile.file}`,
    );
  }

  const password = randomBytes(32).toString("hex");
  const result = spawnSync(
    keytoolBinary(),
    [
      "-genkeypair",
      "-v",
      "-storetype",
      "PKCS12",
      "-keystore",
      profile.file,
      "-storepass",
      password,
      "-keypass",
      password,
      "-alias",
      profile.alias,
      "-keyalg",
      "RSA",
      "-keysize",
      "4096",
      "-validity",
      "10000",
      "-dname",
      profile.dname,
    ],
    { stdio: "inherit" },
  );
  if (result.status !== 0) {
    fail(`Uploadkey genereren mislukt voor ${profile.prefix}.`);
  }

  chmodSync(profile.file, 0o600);
  propertyLines.push(
    `${profile.prefix}_STORE_FILE=${profile.file}`,
    `${profile.prefix}_STORE_PASSWORD=${password}`,
    `${profile.prefix}_KEY_ALIAS=${profile.alias}`,
    `${profile.prefix}_KEY_PASSWORD=${password}`,
    "",
  );
}

writeFileSync(propertiesPath, `${propertyLines.join("\n")}\n`, {
  encoding: "utf8",
  mode: 0o600,
});
chmodSync(propertiesPath, 0o600);

process.stdout.write(
  [
    "Twee uploadkeys zijn lokaal aangemaakt.",
    `Signingconfig: ${propertiesPath}`,
    "Bewaar deze map versleuteld op minimaal twee veilige locaties.",
    "Wachtwoorden zijn bewust niet afgedrukt.",
    "",
  ].join("\n"),
);
