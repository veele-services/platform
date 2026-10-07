// Production adapters never load local files, open connections or log values.
import { forbiddenProductionRef, type StagingDatabaseKey } from "./staging-database";

type Environment = Record<string, string | undefined>;
export type ProductionDatabaseKey = StagingDatabaseKey;

export function assertProductionProject(env: Environment) {
  const expected = env.EXPECTED_SUPABASE_PROJECT_REF;
  const staging = env.STAGING_SUPABASE_PROJECT_REF;
  if (env.DEPLOY_TARGET !== "production" || env.APP_ENV !== "production" ||
    env.FORBIDDEN_SUPABASE_PROJECT_REF !== forbiddenProductionRef ||
    !/^[a-z0-9]{20}$/.test(expected ?? "") || !/^[a-z0-9]{20}$/.test(staging ?? "") ||
    staging === forbiddenProductionRef || expected === staging || expected === forbiddenProductionRef) {
    throw new Error("Productieprojectguard ontbreekt of is ongeldig; verbinding geweigerd.");
  }
  try {
    const api = new URL(env.SUPABASE_URL ?? "");
    if (api.protocol !== "https:" || api.hostname !== `${expected}.supabase.co` || api.port || api.username || api.password || api.pathname !== "/" || api.search || api.hash) throw new Error();
  } catch { throw new Error("Supabase-URL is niet aantoonbaar het productieproject; verbinding geweigerd."); }
  return expected!;
}

export function productionDatabaseUrl(name: ProductionDatabaseKey, env: Environment) {
  const expected = assertProductionProject(env);
  try {
    const url = new URL(env[name] ?? "");
    if (!["postgres:", "postgresql:"].includes(url.protocol) || url.pathname !== "/postgres" || url.hash) throw new Error();
    if ([...url.searchParams].some(([key, value]) => key !== "sslmode" || !["require", "verify-ca", "verify-full"].includes(value)) || url.searchParams.getAll("sslmode").length > 1) throw new Error();
    const port = url.port || "5432", user = decodeURIComponent(url.username);
    const direct = url.hostname === `db.${expected}.supabase.co` && user === "postgres" && port === "5432";
    const pool = /^aws-[a-z0-9-]+\.pooler\.supabase\.com$/.test(url.hostname) && user === `postgres.${expected}` && (port === "5432" || (name === "DATABASE_URL" && port === "6543"));
    if ((!direct && !pool) || !decodeURIComponent(url.password)) throw new Error();
    url.port = port;
    return url;
  } catch { throw new Error(`${name} is niet aantoonbaar een toegestane productieverbinding; waarden worden niet gelogd.`); }
}
