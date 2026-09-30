import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { rootCertificates } from "node:tls";
import pg from "pg";

/** Remote use is deliberately restricted to the staging deploy job; never reads .env. */
export function stagingWorkOrderTestUrl(env) {
  const forbidden = "ckdtiuemeygrnujjibnw", expected = env.EXPECTED_SUPABASE_PROJECT_REF;
  if (env.FIELDGRID_STAGING_SMOKE !== "1" || env.GITHUB_ACTIONS !== "true" || env.GITHUB_REF !== "refs/heads/staging" || env.DEPLOY_TARGET !== "staging" || env.APP_ENV !== "development" || env.APP_URL !== "https://staging.fieldgrid.nl" || env.FORBIDDEN_SUPABASE_PROJECT_REF !== forbidden || !/^[a-z0-9]{20}$/.test(expected || "") || expected === forbidden) throw new Error("Staging rooktest geweigerd: omgeving of projectguard ontbreekt.");
  try {
    const api = new URL(env.SUPABASE_URL), db = new URL(env.MIGRATION_DATABASE_URL);
    if (api.protocol !== "https:" || api.hostname !== `${expected}.supabase.co` || !["postgres:", "postgresql:"].includes(db.protocol)) throw new Error();
    // pg allows query parameters to override the authority (host/user/database).
    // Only an explicit TLS mode is accepted; never let a validated staging URL
    // resolve to a different project through encoded connection parameters.
    if (db.hash || [...db.searchParams].some(([key, value]) => key !== "sslmode" || !["require", "verify-ca", "verify-full"].includes(value)) || db.searchParams.getAll("sslmode").length > 1) throw new Error();
    const direct = db.hostname === `db.${expected}.supabase.co`;
    const pool = /^aws-[a-z0-9-]+\.pooler\.supabase\.com$/.test(db.hostname) && decodeURIComponent(db.username) === `postgres.${expected}` && db.port === "5432";
    if ((!direct && !pool) || decodeURIComponent(db.href).includes(forbidden) || (db.pathname !== "/postgres")) throw new Error();
    // Always encrypt and authenticate the remote endpoint, including when the
    // configured migration URL omits a TLS mode. Avoid pg's changing require
    // alias semantics by selecting hostname/certificate verification explicitly.
    db.searchParams.set("sslmode", "verify-full");
    return db.toString();
  } catch { throw new Error("Staging rooktest geweigerd: database is niet aantoonbaar het stagingproject."); }
}

export function stagingWorkOrderTestOptions(env) {
  const url = new URL(stagingWorkOrderTestUrl(env));
  // pg parses URL sslmode into a new SSL object, replacing a separately passed
  // CA. The already validated URL may contain no routing options; move TLS
  // configuration into one explicit object so neither mode nor CA is lost.
  url.searchParams.delete("sslmode");
  return {
    connectionString: url.toString(),
    ssl: {
      rejectUnauthorized: true,
      ca: [...rootCertificates, readFileSync(new URL("./certs/supabase-root-2021.crt", import.meta.url), "utf8")],
    },
  };
}

export function safeWorkOrderConnectionError(error) {
  const codes = new Set(["SELF_SIGNED_CERT_IN_CHAIN", "DEPTH_ZERO_SELF_SIGNED_CERT", "UNABLE_TO_VERIFY_LEAF_SIGNATURE", "CERT_HAS_EXPIRED", "ERR_TLS_CERT_ALTNAME_INVALID", "ECONNREFUSED", "ECONNRESET", "ETIMEDOUT", "ENOTFOUND", "28P01", "28000", "53300", "57P03"]);
  const code = codes.has(error?.code) ? error.code : "ONBEKEND";
  return new Error(`Testdatabaseverbinding mislukt (${code}); credentials worden niet gelogd.`);
}

export async function workOrderTestDatabase() {
  let connection;
  if (process.env.FIELDGRID_STAGING_SMOKE) connection = stagingWorkOrderTestOptions(process.env);
  else {
    const local = JSON.parse(execFileSync("pnpm", ["supabase", "status", "-o", "json"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }));
    const url = new URL(local.DB_URL);
    if (url.hostname !== "127.0.0.1" || url.port !== "59322") throw new Error("Werkbontests vereisen de afgeschermde lokale database.");
    connection = { connectionString: local.DB_URL };
  }
  const client = new pg.Client({ ...connection, connectionTimeoutMillis: 10000, statement_timeout: 15000, idle_in_transaction_session_timeout: 60000 });
  try { await client.connect(); } catch (error) { throw safeWorkOrderConnectionError(error); }
  if (process.env.FIELDGRID_STAGING_SMOKE) {
    const query = client.query.bind(client);
    client.query = (...args) => {
      const sql = typeof args[0] === "string" ? args[0] : args[0]?.text;
      if (!sql || /\b(commit|end\s+transaction|prepare\s+transaction)\b/i.test(sql)) throw new Error("Staging rooktest mag zijn fictieve transactie nooit vastleggen.");
      return query(...args);
    };
  }
  return client;
}
