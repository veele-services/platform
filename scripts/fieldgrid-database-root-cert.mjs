#!/usr/bin/env node
import { X509Certificate } from "node:crypto";
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";

export const FIELDGRID_DATABASE_SSL_ROOT_CERT_ENV =
  "FIELDGRID_DATABASE_SSL_ROOT_CERT";
export const SUPABASE_ROOT_2021_CA_SHA256 =
  "807025ad50d4ed219d2c9c7d299c004f824eb00cf7f65afef607d07b72e6cafa";

const MAX_CERTIFICATE_BYTES = 64 * 1024;

function normalizeFingerprint(value) {
  return value.replaceAll(":", "").toLowerCase();
}

export function inspectDatabaseRootCertificate(
  certificateBytes,
  { nowMs = Date.now() } = {},
) {
  const bytes = Buffer.from(certificateBytes);
  if (bytes.length === 0 || bytes.length > MAX_CERTIFICATE_BYTES) {
    throw new Error("Database root certificate has an invalid size.");
  }

  let certificate;
  try {
    certificate = new X509Certificate(bytes);
  } catch {
    throw new Error("Database root certificate is not valid X.509 PEM.");
  }
  const canonicalPem = certificate.toString();
  if (!bytes.equals(Buffer.from(canonicalPem, "utf8"))) {
    throw new Error(
      "Database root certificate must contain exactly one canonical PEM certificate.",
    );
  }

  const fingerprintSha256 = normalizeFingerprint(certificate.fingerprint256);
  if (fingerprintSha256 !== SUPABASE_ROOT_2021_CA_SHA256) {
    throw new Error("Database root certificate fingerprint is not trusted.");
  }
  if (!certificate.ca || !certificate.checkIssued(certificate)) {
    throw new Error("Database root certificate is not a self-issued CA.");
  }

  const validFromMs = Date.parse(certificate.validFrom);
  const validToMs = Date.parse(certificate.validTo);
  if (
    !Number.isFinite(nowMs) ||
    !Number.isFinite(validFromMs) ||
    !Number.isFinite(validToMs) ||
    nowMs < validFromMs ||
    nowMs > validToMs
  ) {
    throw new Error(
      "Database root certificate is outside its validity window.",
    );
  }

  return {
    fingerprintSha256,
    pem: canonicalPem,
    validFrom: certificate.validFrom,
    validTo: certificate.validTo,
  };
}

export function validateDatabaseRootCertificateFile(
  certificatePath,
  { nowMs = Date.now(), requirePrivatePermissions = true } = {},
) {
  const path = String(certificatePath ?? "").trim();
  if (!path || !isAbsolute(path)) {
    throw new Error(
      `${FIELDGRID_DATABASE_SSL_ROOT_CERT_ENV} must be an absolute path.`,
    );
  }

  let fileInfo;
  try {
    fileInfo = lstatSync(path);
  } catch {
    throw new Error("Database root certificate file is unavailable.");
  }
  if (
    fileInfo.isSymbolicLink() ||
    !fileInfo.isFile() ||
    fileInfo.size === 0 ||
    fileInfo.size > MAX_CERTIFICATE_BYTES
  ) {
    throw new Error(
      "Database root certificate must be a bounded regular file.",
    );
  }
  if (requirePrivatePermissions && (fileInfo.mode & 0o077) !== 0) {
    throw new Error("Database root certificate permissions must be 0600.");
  }

  return {
    path,
    ...inspectDatabaseRootCertificate(readFileSync(path), { nowMs }),
  };
}

export function databaseNodePostgresSslConfig(env = process.env) {
  const sslMode = String(env.PGSSLMODE ?? "")
    .trim()
    .toLowerCase();
  const dbSsl = String(env.DB_SSL ?? "")
    .trim()
    .toLowerCase();
  const rejectUnauthorized = String(env.DB_SSL_REJECT_UNAUTHORIZED ?? "")
    .trim()
    .toLowerCase();
  if (
    sslMode !== "verify-full" ||
    !["1", "true"].includes(dbSsl) ||
    !["1", "true"].includes(rejectUnauthorized)
  ) {
    throw new Error("Live database TLS must use verified certificate mode.");
  }
  const certificate = validateDatabaseRootCertificateFile(
    env[FIELDGRID_DATABASE_SSL_ROOT_CERT_ENV],
  );
  return { rejectUnauthorized: true, ca: certificate.pem };
}

function decodeCanonicalBase64(value) {
  const encoded = String(value ?? "").trim();
  if (
    !encoded ||
    encoded.length % 4 !== 0 ||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(
      encoded,
    )
  ) {
    throw new Error(
      "Database root certificate secret is not canonical base64.",
    );
  }
  const bytes = Buffer.from(encoded, "base64");
  if (bytes.toString("base64") !== encoded) {
    throw new Error(
      "Database root certificate secret is not canonical base64.",
    );
  }
  return bytes;
}

export function installDatabaseRootCertificateFromBase64({
  encodedCertificate,
  outputPath,
  nowMs = Date.now(),
}) {
  const path = String(outputPath ?? "").trim();
  if (!path || !isAbsolute(path)) {
    throw new Error(
      "Database root certificate output must be an absolute path.",
    );
  }
  const bytes = decodeCanonicalBase64(encodedCertificate);
  inspectDatabaseRootCertificate(bytes, { nowMs });

  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const temporaryPath = `${path}.${process.pid}.tmp`;
  try {
    writeFileSync(temporaryPath, bytes, { flag: "wx", mode: 0o600 });
    chmodSync(temporaryPath, 0o600);
    renameSync(temporaryPath, path);
    chmodSync(path, 0o600);
  } finally {
    if (existsSync(temporaryPath)) unlinkSync(temporaryPath);
  }
  return validateDatabaseRootCertificateFile(path, { nowMs });
}

function usage() {
  return `Fieldgrid trusted database root certificate\n\nUsage:\n  node scripts/fieldgrid-database-root-cert.mjs --check --file /absolute/path.crt\n  node scripts/fieldgrid-database-root-cert.mjs --install-from-env ENV_NAME --out /absolute/path.crt\n`;
}

function parseArgs(argv) {
  const options = {
    check: false,
    file: "",
    installFromEnv: "",
    out: "",
    help: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--check") options.check = true;
    else if (argument === "--file") options.file = argv[++index] ?? "";
    else if (argument === "--install-from-env") {
      options.installFromEnv = argv[++index] ?? "";
    } else if (argument === "--out") options.out = argv[++index] ?? "";
    else if (argument === "--help" || argument === "-h") options.help = true;
    else throw new Error(`Unknown argument: ${argument}`);
  }
  return options;
}

export function runCli(argv = process.argv.slice(2), env = process.env) {
  const options = parseArgs(argv);
  if (options.help) {
    process.stdout.write(usage());
    return null;
  }

  let result;
  if (
    options.check &&
    options.file &&
    !options.installFromEnv &&
    !options.out
  ) {
    result = validateDatabaseRootCertificateFile(options.file);
  } else if (
    !options.check &&
    options.installFromEnv &&
    options.out &&
    !options.file &&
    /^[A-Z][A-Z0-9_]*$/u.test(options.installFromEnv)
  ) {
    result = installDatabaseRootCertificateFromBase64({
      encodedCertificate: env[options.installFromEnv],
      outputPath: options.out,
    });
  } else {
    throw new Error("Choose exactly one complete certificate operation.");
  }

  process.stdout.write(
    `Fieldgrid database root certificate is valid (${result.fingerprintSha256}).\n`,
  );
  return result;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    runCli();
  } catch (error) {
    process.stderr.write(
      `[fieldgrid:database-root-cert] ${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  }
}
