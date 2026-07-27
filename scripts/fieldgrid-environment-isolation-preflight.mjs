#!/usr/bin/env node
import { createHash } from "node:crypto";
import { appendFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const SUPABASE_PROJECT_REF_PATTERN = /^[a-z0-9]{8,64}$/u;
const FINGERPRINT_PATTERN = /^[a-f0-9]{64}$/u;

function required(value, name) {
  const normalized = String(value ?? "").trim();
  if (!normalized) throw new Error(`${name} is required.`);
  return normalized;
}

function parseUrl(value, name, protocols) {
  let parsed;
  try {
    parsed = new URL(required(value, name));
  } catch {
    throw new Error(`${name} is not a valid URL.`);
  }
  if (!protocols.includes(parsed.protocol)) {
    throw new Error(`${name} uses an unsupported protocol.`);
  }
  if (!parsed.hostname || (parsed.username && name !== "DATABASE_URL")) {
    throw new Error(`${name} contains an invalid authority.`);
  }
  return parsed;
}

function assertConfiguredUrlMatchesEnvironment(value, name, environment) {
  const normalized = String(value ?? "").trim();
  if (!normalized) return;
  const parsed = parseUrl(normalized, name, ["https:"]);
  if (
    parsed.username ||
    parsed.password ||
    parsed.port ||
    parsed.search ||
    parsed.hash
  ) {
    throw new Error(`${name} contains an invalid public origin.`);
  }
  const fieldgridOwned =
    parsed.hostname === "fieldgrid.nl" ||
    parsed.hostname.endsWith(".fieldgrid.nl");
  if (!fieldgridOwned) return;
  const stagingOwned =
    parsed.hostname === "staging.fieldgrid.nl" ||
    parsed.hostname.endsWith(".staging.fieldgrid.nl");
  if (
    (environment === "staging" && !stagingOwned) ||
    (environment === "production" && stagingOwned)
  ) {
    throw new Error(`${name} belongs to the opposite environment.`);
  }
}

function assertProjectRef(value, source) {
  if (!SUPABASE_PROJECT_REF_PATTERN.test(value)) {
    throw new Error(
      `${source} does not expose a valid Supabase project identity.`,
    );
  }
  return value;
}

export function supabaseProjectRefFromDatabaseUrl(value) {
  const parsed = parseUrl(value, "DATABASE_URL", ["postgres:", "postgresql:"]);
  const directMatch = /^db\.([a-z0-9]+)\.supabase\.co$/u.exec(parsed.hostname);
  const decodedUser = decodeURIComponent(parsed.username);
  const poolerUserMatch = /^postgres\.([a-z0-9]+)$/u.exec(decodedUser);
  const directRef = directMatch?.[1] ?? null;
  const poolerRef = poolerUserMatch?.[1] ?? null;

  if (directRef && poolerRef && directRef !== poolerRef) {
    throw new Error("DATABASE_URL contains conflicting project identities.");
  }
  if (directRef) return assertProjectRef(directRef, "DATABASE_URL");
  if (parsed.hostname.endsWith(".pooler.supabase.com") && poolerRef) {
    return assertProjectRef(poolerRef, "DATABASE_URL");
  }
  throw new Error(
    "DATABASE_URL must use a Supabase direct or pooler project identity.",
  );
}

export function supabaseProjectRefFromPublicUrl(value) {
  const parsed = parseUrl(value, "NEXT_PUBLIC_SUPABASE_URL", ["https:"]);
  if (
    parsed.username ||
    parsed.password ||
    parsed.port ||
    parsed.pathname !== "/" ||
    parsed.search ||
    parsed.hash
  ) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL must be a credential-free Supabase origin.",
    );
  }
  const match = /^([a-z0-9]+)\.supabase\.co$/u.exec(parsed.hostname);
  if (!match?.[1]) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL does not expose a Supabase project identity.",
    );
  }
  return assertProjectRef(match[1], "NEXT_PUBLIC_SUPABASE_URL");
}

export function projectIdentityFingerprint(projectRef) {
  return createHash("sha256")
    .update(`fieldgrid-supabase-project:${projectRef}`, "utf8")
    .digest("hex");
}

export function validateEnvironmentIsolation(env = process.env) {
  const environment = required(env.APP_ENV, "APP_ENV");
  const target = required(
    env.TARGET_ENVIRONMENT ?? env.TARGET ?? environment,
    "TARGET_ENVIRONMENT",
  );
  if (!["staging", "production"].includes(environment)) {
    throw new Error("APP_ENV must be staging or production.");
  }
  if (target !== environment) {
    throw new Error("Deployment target and APP_ENV differ.");
  }

  const appUrl = parseUrl(env.APP_URL, "APP_URL", ["https:"]);
  const expectedAppHost =
    environment === "staging" ? "staging.fieldgrid.nl" : "app.fieldgrid.nl";
  if (
    appUrl.hostname !== expectedAppHost ||
    appUrl.username ||
    appUrl.password ||
    appUrl.port ||
    appUrl.search ||
    appUrl.hash
  ) {
    throw new Error("APP_URL does not match the selected environment.");
  }
  for (const name of [
    "NEXT_PUBLIC_APP_URL",
    "SITE_URL",
    "NEXT_PUBLIC_SITE_URL",
    "NEXT_PUBLIC_MARKETING_SITE_URL",
  ]) {
    assertConfiguredUrlMatchesEnvironment(env[name], name, environment);
  }
  for (const [index, origin] of String(
    env.FIELDGRID_RECOVERY_ALLOWED_ORIGINS ?? "",
  )
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
    .entries()) {
    assertConfiguredUrlMatchesEnvironment(
      origin,
      `FIELDGRID_RECOVERY_ALLOWED_ORIGINS[${index}]`,
      environment,
    );
  }
  const customExpectedHost = String(
    env.FIELDGRID_CUSTOM_EXPECTED_HOST ?? "",
  ).trim();
  if (customExpectedHost) {
    assertConfiguredUrlMatchesEnvironment(
      `https://${customExpectedHost}`,
      "FIELDGRID_CUSTOM_EXPECTED_HOST",
      environment,
    );
  }

  const databaseProjectRef = supabaseProjectRefFromDatabaseUrl(
    env.DATABASE_URL,
  );
  const publicProjectRef = supabaseProjectRefFromPublicUrl(
    env.NEXT_PUBLIC_SUPABASE_URL,
  );
  if (databaseProjectRef !== publicProjectRef) {
    throw new Error(
      "DATABASE_URL and NEXT_PUBLIC_SUPABASE_URL target different projects.",
    );
  }

  const expectedProjectRef = required(
    env.EXPECTED_SUPABASE_PROJECT_REF,
    "EXPECTED_SUPABASE_PROJECT_REF",
  );
  if (databaseProjectRef !== expectedProjectRef) {
    throw new Error(
      "Configured database does not match the expected environment project.",
    );
  }
  const forbiddenProjectRef = String(
    env.FORBIDDEN_SUPABASE_PROJECT_REF ?? "",
  ).trim();
  if (forbiddenProjectRef && databaseProjectRef === forbiddenProjectRef) {
    throw new Error(
      "Configured database matches the forbidden opposite environment project.",
    );
  }

  return {
    environment,
    appHost: expectedAppHost,
    projectFingerprint: projectIdentityFingerprint(databaseProjectRef),
  };
}

export function assertDistinctProjectFingerprints(staging, production) {
  if (
    !FINGERPRINT_PATTERN.test(staging) ||
    !FINGERPRINT_PATTERN.test(production)
  ) {
    throw new Error("Database project fingerprint is missing or invalid.");
  }
  if (staging === production) {
    throw new Error(
      "Staging and production resolve to the same database project.",
    );
  }
  return true;
}

function parseArgs(argv) {
  const options = {
    validate: false,
    emitGithubOutput: false,
    compare: null,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--validate") options.validate = true;
    else if (argument === "--emit-github-output") {
      options.emitGithubOutput = true;
    } else if (argument === "--compare") {
      options.compare = [argv[index + 1] ?? "", argv[index + 2] ?? ""];
      index += 2;
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }
  return options;
}

export function runCli(argv = process.argv.slice(2), env = process.env) {
  const options = parseArgs(argv);
  if (options.compare) {
    assertDistinctProjectFingerprints(options.compare[0], options.compare[1]);
    process.stdout.write(
      "Fieldgrid database projects are distinct; no identifiers were logged.\n",
    );
    return;
  }
  if (!options.validate) {
    throw new Error("Use --validate or --compare.");
  }

  const result = validateEnvironmentIsolation(env);
  if (options.emitGithubOutput) {
    const outputPath = required(env.GITHUB_OUTPUT, "GITHUB_OUTPUT");
    appendFileSync(
      outputPath,
      `project_fingerprint=${result.projectFingerprint}\n`,
      { encoding: "utf8", mode: 0o600 },
    );
  }
  process.stdout.write(
    `Fieldgrid ${result.environment} environment isolation passed; no database identifier was logged.\n`,
  );
}

const isEntrypoint =
  process.argv[1] &&
  fileURLToPath(import.meta.url) ===
    fileURLToPath(new URL(`file://${process.argv[1]}`));

if (isEntrypoint) {
  try {
    runCli();
  } catch (error) {
    process.stderr.write(
      `fieldgrid-environment-isolation-preflight: ${
        error instanceof Error ? error.message : String(error)
      }\n`,
    );
    process.exitCode = 1;
  }
}
