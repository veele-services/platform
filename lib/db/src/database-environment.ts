import { createHash } from "node:crypto";

const PROJECT_REF_PATTERN = /^[a-z0-9]{8,64}$/u;
const LOCAL_DATABASE_HOSTS = new Set(["127.0.0.1", "::1", "localhost"]);

type RuntimeEnvironment =
  | NodeJS.ProcessEnv
  | Record<string, string | undefined>;

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
  const direct = /^db\.([a-z0-9]+)\.supabase\.co$/u.exec(parsed.hostname)?.[1];
  const pooler = /^postgres\.([a-z0-9]+)$/u.exec(
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
