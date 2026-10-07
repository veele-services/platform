// Shared by deployment preflight, migration-history checks and backups. This
// module never loads .env files, opens a connection or includes values in errors.
type DeploymentEnvironment = Record<string, string | undefined>;
export type StagingDatabaseKey = "DATABASE_URL" | "MIGRATION_DATABASE_URL" | "BACKUP_DATABASE_URL";
export const forbiddenProductionRef = "ckdtiuemeygrnujjibnw";
export const currentProductionRef = "tqqknlrggmpslttisrck";
export function isForbiddenStagingProjectRef(ref: string) {
  return ref === forbiddenProductionRef || ref === currentProductionRef;
}

export function assertStagingProject(env: DeploymentEnvironment) {
  const expected = env.EXPECTED_SUPABASE_PROJECT_REF;
  if (env.DEPLOY_TARGET !== "staging" || env.APP_ENV !== "development" || env.FORBIDDEN_SUPABASE_PROJECT_REF !== forbiddenProductionRef || !/^[a-z0-9]{20}$/.test(expected ?? "") || isForbiddenStagingProjectRef(expected ?? "")) throw new Error("Stagingprojectguard ontbreekt of is ongeldig; verbinding geweigerd.");
  try {
    const api = new URL(env.SUPABASE_URL ?? "");
    if (api.protocol !== "https:" || api.hostname !== `${expected}.supabase.co` || api.port || api.username || api.password || api.pathname !== "/" || api.search || api.hash) throw new Error();
  } catch { throw new Error("Supabase-URL is niet aantoonbaar het stagingproject; verbinding geweigerd."); }
  return expected!;
}

export function stagingDatabaseUrl(name: StagingDatabaseKey, env: DeploymentEnvironment) {
  const expected = assertStagingProject(env);
  try {
    const url = new URL(env[name] ?? "");
    if (!["postgres:", "postgresql:"].includes(url.protocol) || url.pathname !== "/postgres" || url.hash) throw new Error();
    // libpq/pg query parameters can override host/user/database. Permit only a
    // known TLS mode; apply certificate verification in the calling adapter.
    if ([...url.searchParams].some(([key,value]) => key !== "sslmode" || !["require", "verify-ca", "verify-full"].includes(value)) || url.searchParams.getAll("sslmode").length > 1) throw new Error();
    const port = url.port || "5432", user = decodeURIComponent(url.username);
    const direct = url.hostname === `db.${expected}.supabase.co` && user === "postgres" && port === "5432";
    const pool = /^aws-[a-z0-9-]+\.pooler\.supabase\.com$/.test(url.hostname) && user === `postgres.${expected}` && (port === "5432" || (name === "DATABASE_URL" && port === "6543"));
    if (!direct && !pool) throw new Error();
    decodeURIComponent(url.password); // Reject malformed percent encoding now.
    url.port = port; // Do not allow pg/libpq to fall back to an inherited PGPORT.
    return url;
  } catch { throw new Error(`${name} is niet aantoonbaar een toegestane stagingverbinding; waarden worden niet gelogd.`); }
}
