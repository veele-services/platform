import { createHash, timingSafeEqual, X509Certificate } from "node:crypto";
import { lstatSync, readFileSync } from "node:fs";
import { isAbsolute } from "node:path";

const PROJECT_REF_PATTERN = /^[a-z0-9]{8,64}$/u;
const LOCAL_DATABASE_HOSTS = new Set(["127.0.0.1", "::1", "localhost"]);
const LIVE_RUNTIME_DATABASE_ROLE = "fieldgrid_runtime_app";
const SUPABASE_SESSION_POOLER_PORT = "5432";

type RuntimeEnvironment =
  | NodeJS.ProcessEnv
  | Record<string, string | undefined>;

export type DatabaseConnectionPurpose = "runtime" | "migration";

export type DatabaseConnectionConfig = {
  connectionString: string;
  ssl: false | { rejectUnauthorized: true; ca: string };
};

export function configuredDatabaseConnectionPurpose(
  env: RuntimeEnvironment = process.env,
): DatabaseConnectionPurpose {
  const configured = env.FIELDGRID_DATABASE_CONNECTION_PURPOSE?.trim();
  if (!configured || configured === "runtime") return "runtime";
  if (configured === "migration") return "migration";
  throw new Error("Database connection purpose is invalid.");
}

export const SUPABASE_ROOT_2021_CA_SHA256 =
  "807025ad50d4ed219d2c9c7d299c004f824eb00cf7f65afef607d07b72e6cafa";

const MAX_DATABASE_ROOT_CERTIFICATE_BYTES = 64 * 1024;

function required(env: RuntimeEnvironment, name: string): string {
  const value = env[name]?.trim();
  if (!value) {
    throw new Error(`Database environment guard requires ${name}.`);
  }
  return value;
}

function parseUrl(
  value: string,
  name: string,
  protocols: readonly string[],
): URL {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`Database environment guard rejected ${name}.`);
  }
  if (!protocols.includes(parsed.protocol) || !parsed.hostname) {
    throw new Error(`Database environment guard rejected ${name}.`);
  }
  return parsed;
}

function assertProjectRef(value: string): string {
  if (!PROJECT_REF_PATTERN.test(value)) {
    throw new Error("Database project identity is invalid.");
  }
  return value;
}

export function databaseProjectRef(databaseUrl: string): string {
  const parsed = parseUrl(databaseUrl, "DATABASE_URL", [
    "postgres:",
    "postgresql:",
  ]);
  if (parsed.search || parsed.hash) {
    throw new Error("Database connection URL overrides are forbidden.");
  }
  const direct = /^db\.([a-z0-9]+)\.supabase\.co$/u.exec(parsed.hostname)?.[1];
  const pooler = /^[a-z_][a-z0-9_-]*\.([a-z0-9]{8,64})$/u.exec(
    decodeURIComponent(parsed.username),
  )?.[1];
  if (direct && pooler && direct !== pooler) {
    throw new Error("Database project identity is conflicting.");
  }
  if (direct) return assertProjectRef(direct);
  if (parsed.hostname.endsWith(".pooler.supabase.com") && pooler) {
    return assertProjectRef(pooler);
  }
  throw new Error("Database project identity is unavailable.");
}

function equalSecretValues(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left, "utf8");
  const rightBytes = Buffer.from(right, "utf8");
  return (
    leftBytes.length === rightBytes.length &&
    timingSafeEqual(leftBytes, rightBytes)
  );
}

function databaseCredentialIdentity(databaseUrl: string): {
  role: string;
  password: string;
} {
  const parsed = parseUrl(databaseUrl, "DATABASE_URL", [
    "postgres:",
    "postgresql:",
  ]);
  let role: string;
  let password: string;
  try {
    role = decodeURIComponent(parsed.username);
    password = decodeURIComponent(parsed.password);
  } catch {
    throw new Error("Database credential encoding is invalid.");
  }
  const projectRef = parsed.hostname.endsWith(".pooler.supabase.com")
    ? role.match(/\.([a-z0-9]{8,64})$/u)?.[1]
    : undefined;
  if (projectRef) role = role.slice(0, -(projectRef.length + 1));
  if (!role || !password) {
    throw new Error("Database credentials must include a role and secret.");
  }
  return { role, password };
}

function assertDistinctDatabaseCredentials(
  runtimeUrl: string,
  migrationUrl: string,
): void {
  const runtime = databaseCredentialIdentity(runtimeUrl);
  const migration = databaseCredentialIdentity(migrationUrl);
  if (
    equalSecretValues(runtimeUrl, migrationUrl) ||
    equalSecretValues(runtime.role, migration.role) ||
    equalSecretValues(runtime.password, migration.password)
  ) {
    throw new Error(
      "Runtime and migration database principals and secrets must be distinct.",
    );
  }
}

function assertLiveMigrationSessionEndpoint(migrationUrl: string): void {
  const parsed = parseUrl(migrationUrl, "FIELDGRID_MIGRATION_DATABASE_URL", [
    "postgres:",
    "postgresql:",
  ]);
  if (parsed.port !== SUPABASE_SESSION_POOLER_PORT) {
    throw new Error(
      "Live migration database endpoint must be session-affine on port 5432.",
    );
  }
}

function liveDatabaseCertificateAuthority(env: RuntimeEnvironment): string {
  const certificatePath = required(env, "FIELDGRID_DATABASE_SSL_ROOT_CERT");
  if (!isAbsolute(certificatePath)) {
    throw new Error("Database root certificate path must be absolute.");
  }

  let fileInfo;
  try {
    fileInfo = lstatSync(certificatePath);
  } catch {
    throw new Error("Database root certificate file is unavailable.");
  }
  if (
    fileInfo.isSymbolicLink() ||
    !fileInfo.isFile() ||
    fileInfo.size === 0 ||
    fileInfo.size > MAX_DATABASE_ROOT_CERTIFICATE_BYTES
  ) {
    throw new Error(
      "Database root certificate must be a bounded regular file.",
    );
  }
  if ((fileInfo.mode & 0o077) !== 0) {
    throw new Error("Database root certificate permissions must be 0600.");
  }

  const certificateBytes = readFileSync(certificatePath);
  let certificate: X509Certificate;
  try {
    certificate = new X509Certificate(certificateBytes);
  } catch {
    throw new Error("Database root certificate is not valid X.509 PEM.");
  }
  const canonicalPem = certificate.toString();
  if (!certificateBytes.equals(Buffer.from(canonicalPem, "utf8"))) {
    throw new Error(
      "Database root certificate must contain exactly one canonical PEM certificate.",
    );
  }
  const fingerprint = certificate.fingerprint256
    .replaceAll(":", "")
    .toLowerCase();
  if (
    fingerprint !== SUPABASE_ROOT_2021_CA_SHA256 ||
    !certificate.ca ||
    !certificate.checkIssued(certificate) ||
    Date.now() < Date.parse(certificate.validFrom) ||
    Date.now() > Date.parse(certificate.validTo)
  ) {
    throw new Error("Database root certificate is not the trusted active CA.");
  }
  return canonicalPem;
}

function databaseUrlForPurpose(
  purpose: DatabaseConnectionPurpose,
  env: RuntimeEnvironment,
): string {
  const runtimeUrl = required(env, "DATABASE_URL");
  const appEnvironment = env.APP_ENV?.trim().toLowerCase();
  const liveEnvironment =
    appEnvironment === "staging" || appEnvironment === "production";

  if (
    liveEnvironment &&
    databaseCredentialIdentity(runtimeUrl).role !== LIVE_RUNTIME_DATABASE_ROLE
  ) {
    throw new Error("Live runtime database principal is not permitted.");
  }
  if (purpose === "runtime" || !liveEnvironment) return runtimeUrl;

  // A migration process receives two independent credentials. Prove that the
  // unused runtime credential belongs to this exact live environment as well;
  // validating only the selected admin URL would permit cross-project drift.
  assertDatabaseEnvironmentIsolation(env);

  const migrationUrl = required(env, "FIELDGRID_MIGRATION_DATABASE_URL");
  assertLiveMigrationSessionEndpoint(migrationUrl);
  assertDistinctDatabaseCredentials(runtimeUrl, migrationUrl);
  return migrationUrl;
}

/**
 * Builds the only supported node-postgres connection configuration for Fieldgrid.
 * Live connections are queryless and always verify the server certificate. Local
 * loopback tests may opt out with DB_SSL=false or PGSSLMODE=disable.
 */
export function databaseConnectionConfig(
  purpose: DatabaseConnectionPurpose,
  env: RuntimeEnvironment = process.env,
): DatabaseConnectionConfig {
  const connectionString = databaseUrlForPurpose(purpose, env);
  const parsed = parseUrl(connectionString, "DATABASE_URL", [
    "postgres:",
    "postgresql:",
  ]);
  if (
    !parsed.username ||
    !parsed.pathname.slice(1) ||
    parsed.search ||
    parsed.hash
  ) {
    throw new Error("Database connection URL is not safely configured.");
  }

  const isolation = assertDatabaseEnvironmentIsolation({
    ...env,
    DATABASE_URL: connectionString,
  });
  if (isolation.environment === "local") {
    const sslMode = (env.DB_SSL ?? env.PGSSLMODE ?? "").trim().toLowerCase();
    if (!sslMode || ["0", "false", "disable"].includes(sslMode)) {
      return { connectionString, ssl: false };
    }
  } else {
    const sslMode = (env.DB_SSL ?? env.PGSSLMODE ?? "").trim().toLowerCase();
    if (
      sslMode &&
      !["1", "true", "require", "verify-ca", "verify-full"].includes(sslMode)
    ) {
      throw new Error("Live database TLS cannot be disabled or weakened.");
    }
    const rejectUnauthorized = (env.DB_SSL_REJECT_UNAUTHORIZED ?? "true")
      .trim()
      .toLowerCase();
    if (!["1", "true"].includes(rejectUnauthorized)) {
      throw new Error("Live database certificate verification is required.");
    }
  }

  return {
    connectionString,
    ssl: {
      rejectUnauthorized: true,
      ca: liveDatabaseCertificateAuthority(env),
    },
  };
}

export function publicSupabaseProjectRef(publicUrl: string): string {
  const parsed = parseUrl(publicUrl, "NEXT_PUBLIC_SUPABASE_URL", ["https:"]);
  if (
    parsed.username ||
    parsed.password ||
    parsed.port ||
    parsed.pathname !== "/" ||
    parsed.search ||
    parsed.hash
  ) {
    throw new Error("Supabase public project identity is invalid.");
  }
  const projectRef = /^([a-z0-9]+)\.supabase\.co$/u.exec(parsed.hostname)?.[1];
  if (!projectRef) {
    throw new Error("Supabase public project identity is unavailable.");
  }
  return assertProjectRef(projectRef);
}

export function databaseProjectFingerprint(projectRef: string): string {
  return createHash("sha256")
    .update(`fieldgrid-supabase-project:${projectRef}`, "utf8")
    .digest("hex");
}

export function assertDatabaseEnvironmentIsolation(
  env: RuntimeEnvironment = process.env,
): {
  environment: "local" | "staging" | "production";
  projectFingerprint: string | null;
} {
  const databaseUrl = required(env, "DATABASE_URL");
  const appEnvironment = env.APP_ENV?.trim().toLowerCase();

  if (appEnvironment !== "staging" && appEnvironment !== "production") {
    const parsed = parseUrl(databaseUrl, "DATABASE_URL", [
      "postgres:",
      "postgresql:",
    ]);
    if (!LOCAL_DATABASE_HOSTS.has(parsed.hostname)) {
      throw new Error(
        "Remote databases require explicit staging or production isolation.",
      );
    }
    return { environment: "local", projectFingerprint: null };
  }

  const target = required(env, "TARGET_ENVIRONMENT");
  if (target !== appEnvironment) {
    throw new Error("Database target and APP_ENV differ.");
  }
  const expectedProjectRef = assertProjectRef(
    required(env, "EXPECTED_SUPABASE_PROJECT_REF"),
  );
  const actualProjectRef = databaseProjectRef(databaseUrl);
  const publicProjectRef = publicSupabaseProjectRef(
    required(env, "NEXT_PUBLIC_SUPABASE_URL"),
  );
  if (
    actualProjectRef !== publicProjectRef ||
    actualProjectRef !== expectedProjectRef
  ) {
    throw new Error(
      "Database project identity does not match its environment.",
    );
  }

  const forbiddenProjectRef = env.FORBIDDEN_SUPABASE_PROJECT_REF?.trim();
  if (
    forbiddenProjectRef &&
    actualProjectRef === assertProjectRef(forbiddenProjectRef)
  ) {
    throw new Error(
      "Database project identity matches the opposite environment.",
    );
  }

  return {
    environment: appEnvironment,
    projectFingerprint: databaseProjectFingerprint(actualProjectRef),
  };
}
