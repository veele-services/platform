import { describe, it, expect } from "vitest";
// @ts-expect-error Node-only test harness intentionally remains JavaScript.
import { stagingWorkOrderTestUrl } from "../../scripts/work-order-test-target.mjs";
const ref = "abcdefghijklmnopqrst";
const env = { FIELDGRID_STAGING_SMOKE: "1", GITHUB_ACTIONS: "true", GITHUB_REF: "refs/heads/staging", DEPLOY_TARGET: "staging", APP_ENV: "development", APP_URL: "https://staging.fieldgrid.nl", EXPECTED_SUPABASE_PROJECT_REF: ref, FORBIDDEN_SUPABASE_PROJECT_REF: "ckdtiuemeygrnujjibnw", SUPABASE_URL: `https://${ref}.supabase.co`, MIGRATION_DATABASE_URL: `postgresql://postgres:fixture@db.${ref}.supabase.co:5432/postgres` };
describe("staging smoke target guard", () => {
  it("permits only the exact staging target and enforces verified TLS when omitted", () => expect(stagingWorkOrderTestUrl(env)).toBe(`${env.MIGRATION_DATABASE_URL}?sslmode=verify-full`));
  it("permits the expected session pooler with an explicit TLS mode", () => {
    const input = { ...env, MIGRATION_DATABASE_URL: `postgresql://postgres.${ref}:fixture@aws-1-eu-west-1.pooler.supabase.com:5432/postgres?sslmode=require` };
    expect(stagingWorkOrderTestUrl(input)).toBe(input.MIGRATION_DATABASE_URL.replace("sslmode=require", "sslmode=verify-full"));
  });
  it.each(["host=db.ck%64tiuemeygrnujjibnw.supabase.co&user=postgres", "user=postgres.zyxwvutsrqponmlkjihg", "database=other", "port=6543", "sslmode=disable", "sslmode=require&sslmode=disable", "options=-c%20search_path=public"])("rejects query overrides: %s", query => {
    expect(() => stagingWorkOrderTestUrl({ ...env, MIGRATION_DATABASE_URL: `${env.MIGRATION_DATABASE_URL}?${query}` })).toThrow();
  });
  it.each([ { GITHUB_REF: "refs/heads/main" }, { GITHUB_ACTIONS: "false" }, { APP_URL: "https://fieldgrid.nl" }, { EXPECTED_SUPABASE_PROJECT_REF: "ckdtiuemeygrnujjibnw" }, { FORBIDDEN_SUPABASE_PROJECT_REF: "" }, { MIGRATION_DATABASE_URL: "postgresql://postgres:fixture@db.ckdtiuemeygrnujjibnw.supabase.co:5432/postgres" }, { MIGRATION_DATABASE_URL: `postgresql://postgres.${ref}:fixture@evil.invalid:5432/postgres` }, { SUPABASE_URL: "https://ckdtiuemeygrnujjibnw.supabase.co" } ])("rejects unsafe target %o", patch => expect(() => stagingWorkOrderTestUrl({ ...env, ...patch })).toThrow());
});
