import { describe, it, expect } from "vitest";
import { X509Certificate } from "node:crypto";
import { Client } from "pg";
// @ts-expect-error Node-only test harness intentionally remains JavaScript.
import { localWorkOrderTestUrl, stagingWorkOrderTestUrl, stagingWorkOrderTestOptions, safeWorkOrderConnectionError } from "../../scripts/work-order-test-target.mjs";
const ref = "abcdefghijklmnopqrst";
const env = { FIELDGRID_STAGING_SMOKE: "1", GITHUB_ACTIONS: "true", GITHUB_REF: "refs/heads/staging", DEPLOY_TARGET: "staging", APP_ENV: "development", APP_URL: "https://staging.fieldgrid.nl", EXPECTED_SUPABASE_PROJECT_REF: ref, FORBIDDEN_SUPABASE_PROJECT_REF: "ckdtiuemeygrnujjibnw", SUPABASE_URL: `https://${ref}.supabase.co`, MIGRATION_DATABASE_URL: `postgresql://postgres:fixture@db.${ref}.supabase.co:5432/postgres` };
describe("staging smoke target guard", () => {
  it("permits only the exact staging target and enforces verified TLS when omitted", () => expect(stagingWorkOrderTestUrl(env)).toBe(`${env.MIGRATION_DATABASE_URL}?sslmode=verify-full`));
  it("permits the expected session pooler with an explicit TLS mode", () => {
    const input = { ...env, MIGRATION_DATABASE_URL: `postgresql://postgres.${ref}:fixture@aws-1-eu-west-1.pooler.supabase.com:5432/postgres?sslmode=require` };
    expect(stagingWorkOrderTestUrl(input)).toBe(input.MIGRATION_DATABASE_URL.replace("sslmode=require", "sslmode=verify-full"));
  });
  it.each(["", "?sslmode=require", "?sslmode=verify-full"])("the driver retains the provider CA and hostname verification: %s", suffix => {
    const options = stagingWorkOrderTestOptions({ ...env, MIGRATION_DATABASE_URL: env.MIGRATION_DATABASE_URL + suffix });
    const client = new Client(options);
    const parsed = (client as unknown as { connectionParameters: { host: string; ssl: { ca: string[]; rejectUnauthorized: boolean; checkServerIdentity?: unknown } } }).connectionParameters;
    expect(parsed.host).toBe(`db.${ref}.supabase.co`);
    expect(parsed.ssl.rejectUnauthorized).toBe(true);
    expect(parsed.ssl.checkServerIdentity).toBeUndefined();
    const ca = new X509Certificate(parsed.ssl.ca.at(-1)!);
    expect(ca.subject).toContain("Supabase Root 2021 CA");
    expect(ca.ca).toBe(true);
    expect(ca.fingerprint256).toBe("80:70:25:AD:50:D4:ED:21:9D:2C:9C:7D:29:9C:00:4F:82:4E:B0:0C:F7:F6:5A:FE:F6:07:D0:7B:72:E6:CA:FA");
    expect(ca.verify(ca.publicKey)).toBe(true);
    expect(new Date(ca.validTo).getTime()).toBeGreaterThan(new Date("2030-01-01").getTime());
  });
  it("connection diagnostics never expose a URL, password or arbitrary provider error", () => {
    expect(safeWorkOrderConnectionError({ code: "SELF_SIGNED_CERT_IN_CHAIN", message: "private-value" }).message).toContain("SELF_SIGNED_CERT_IN_CHAIN");
    expect(safeWorkOrderConnectionError({ code: "private-value", message: "private-value" }).message).not.toContain("private-value");
  });
  it("does not pass an ambient pooler project override to the driver", () => {
    const previous = process.env.PGOPTIONS;
    try {
      process.env.PGOPTIONS = "reference=ckdtiuemeygrnujjibnw";
      const client = new Client(stagingWorkOrderTestOptions(env));
      const parsed = (client as unknown as { connectionParameters: { options: string } }).connectionParameters;
      expect(parsed.options).toBe("-c statement_timeout=15000");
      expect(parsed.options).not.toContain("ckdtiuemeygrnujjibnw");
    } finally { if (previous === undefined) delete process.env.PGOPTIONS; else process.env.PGOPTIONS = previous; }
  });
  it("pins an omitted direct port before the driver can inherit PGPORT", () => {
    const previous = process.env.PGPORT;
    try {
      process.env.PGPORT = "6543";
      const client = new Client(stagingWorkOrderTestOptions({ ...env, MIGRATION_DATABASE_URL: env.MIGRATION_DATABASE_URL.replace(":5432", "") }));
      const parsed = (client as unknown as { connectionParameters: { port: number } }).connectionParameters;
      expect(parsed.port).toBe(5432);
    } finally { if (previous === undefined) delete process.env.PGPORT; else process.env.PGPORT = previous; }
  });
  it.each(["postgresql://other:fixture@db.abcdefghijklmnopqrst.supabase.co:5432/postgres", "postgresql://postgres:fixture@db.abcdefghijklmnopqrst.supabase.co:6543/postgres"])("rejects an unapproved direct role or port", url => {
    expect(() => stagingWorkOrderTestUrl({ ...env, MIGRATION_DATABASE_URL: url })).toThrow();
  });
  it("never allows committing local fixture suites into the staging smoke target", () => {
    const previous = process.env.FIELDGRID_STAGING_SMOKE;
    try {
      process.env.FIELDGRID_STAGING_SMOKE = "1";
      expect(() => localWorkOrderTestUrl()).toThrow("uitsluitend lokaal");
    } finally { if (previous === undefined) delete process.env.FIELDGRID_STAGING_SMOKE; else process.env.FIELDGRID_STAGING_SMOKE = previous; }
  });
  it.each(["/tmp", "/home/codex/repos/fieldgrid", "/tmp/fieldgrid-release-migrations.a/../b"])("rejects an unrelated replay directory before inspecting it: %s", path => {
    const previous = process.env.FIELDGRID_LOCAL_REPLAY_DIR;
    try {
      process.env.FIELDGRID_LOCAL_REPLAY_DIR = path;
      expect(() => localWorkOrderTestUrl()).toThrow("Ongeldige lokale");
    } finally { if (previous === undefined) delete process.env.FIELDGRID_LOCAL_REPLAY_DIR; else process.env.FIELDGRID_LOCAL_REPLAY_DIR = previous; }
  });
  it.each(["host=db.ck%64tiuemeygrnujjibnw.supabase.co&user=postgres", "user=postgres.zyxwvutsrqponmlkjihg", "database=other", "port=6543", "sslmode=disable", "sslmode=require&sslmode=disable", "options=-c%20search_path=public"])("rejects query overrides: %s", query => {
    expect(() => stagingWorkOrderTestUrl({ ...env, MIGRATION_DATABASE_URL: `${env.MIGRATION_DATABASE_URL}?${query}` })).toThrow();
  });
  it.each([ { GITHUB_REF: "refs/heads/main" }, { GITHUB_ACTIONS: "false" }, { APP_URL: "https://fieldgrid.nl" }, { EXPECTED_SUPABASE_PROJECT_REF: "ckdtiuemeygrnujjibnw" }, { FORBIDDEN_SUPABASE_PROJECT_REF: "" }, { MIGRATION_DATABASE_URL: "postgresql://postgres:fixture@db.ckdtiuemeygrnujjibnw.supabase.co:5432/postgres" }, { MIGRATION_DATABASE_URL: `postgresql://postgres.${ref}:fixture@evil.invalid:5432/postgres` }, { SUPABASE_URL: "https://ckdtiuemeygrnujjibnw.supabase.co" } ])("rejects unsafe target %o", patch => expect(() => stagingWorkOrderTestUrl({ ...env, ...patch })).toThrow());
});
