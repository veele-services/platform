import { expect, it } from "vitest";
import { Client } from "pg";
import { assertStagingProject, forbiddenProductionRef, stagingDatabaseUrl } from "./staging-database";

const ref = "abcdefghijklmnopqrst";
const env = { DEPLOY_TARGET: "staging", APP_ENV: "development", EXPECTED_SUPABASE_PROJECT_REF: ref, FORBIDDEN_SUPABASE_PROJECT_REF: forbiddenProductionRef, SUPABASE_URL: `https://${ref}.supabase.co`, BACKUP_DATABASE_URL: `postgresql://postgres:FICTITIOUS%21@db.${ref}.supabase.co:5432/postgres?sslmode=require` };
it("accepts a direct target and session pooler without logging or connecting", () => {
  expect(assertStagingProject(env)).toBe(ref);
  expect(stagingDatabaseUrl("BACKUP_DATABASE_URL", env).hostname).toBe(`db.${ref}.supabase.co`);
  expect(stagingDatabaseUrl("BACKUP_DATABASE_URL", { ...env, BACKUP_DATABASE_URL: `postgresql://postgres.${ref}:FICTITIOUS@aws-1-eu-west-1.pooler.supabase.com:5432/postgres` }).port).toBe("5432");
});
it.each([
  {}, { ...env, EXPECTED_SUPABASE_PROJECT_REF: forbiddenProductionRef }, { ...env, FORBIDDEN_SUPABASE_PROJECT_REF: "" }, { ...env, DEPLOY_TARGET: "production" },
  { ...env, SUPABASE_URL: `https://${forbiddenProductionRef}.supabase.co` }, { ...env, SUPABASE_URL: `https://${ref}.supabase.co.attacker.invalid` },
])("fails closed when project identity is absent or wrong", invalid => expect(() => stagingDatabaseUrl("BACKUP_DATABASE_URL", invalid)).toThrow());
it.each([
  `postgresql://postgres.${ref}:FICTITIOUS@attacker.invalid:5432/postgres`,
  `postgresql://postgres:FICTITIOUS@db.${forbiddenProductionRef}.supabase.co:5432/postgres`,
  `postgresql://postgres.${ref}:FICTITIOUS@aws-1-eu-west-1.pooler.supabase.com:6543/postgres`,
  `${env.BACKUP_DATABASE_URL}&host=db.${forbiddenProductionRef}.supabase.co`,
  `${env.BACKUP_DATABASE_URL}&%75ser=postgres.other`, `${env.BACKUP_DATABASE_URL}&options=unsafe`,
  `${env.BACKUP_DATABASE_URL}&sslmode=disable`, `${env.BACKUP_DATABASE_URL}#fragment`,
  `postgresql://postgres:FICTITIOUS@db.${ref}.supabase.co:5432/other_database`,
  "postgresql://FICTITIOUS-PRIVATE-BAD-URL",
])("rejects URI overrides and wrong hosts without exposing the supplied value", invalid => {
  try { stagingDatabaseUrl("BACKUP_DATABASE_URL", { ...env, BACKUP_DATABASE_URL: invalid }); throw new Error("not rejected"); }
  catch (error) { expect(String(error)).toContain("niet aantoonbaar"); expect(String(error)).not.toContain("FICTITIOUS"); }
});
it("permits a transaction pool only for the ordinary runtime connection", () => {
  const url = `postgresql://postgres.${ref}:FICTITIOUS@aws-1-eu-west-1.pooler.supabase.com:6543/postgres`;
  expect(stagingDatabaseUrl("DATABASE_URL", { ...env, DATABASE_URL: url }).port).toBe("6543");
  expect(() => stagingDatabaseUrl("MIGRATION_DATABASE_URL", { ...env, MIGRATION_DATABASE_URL: url })).toThrow();
});
it("normalizes the default port before passing a validated URL to pg", () => {
  const value = `postgresql://postgres.${ref}:FICTITIOUS@aws-1-eu-west-1.pooler.supabase.com/postgres`;
  const original = process.env.PGPORT;
  try {
    process.env.PGPORT = "6543";
    const target = stagingDatabaseUrl("MIGRATION_DATABASE_URL", { ...env, MIGRATION_DATABASE_URL: value });
    const client = new Client({ connectionString: target.toString() });
    expect(target.port).toBe("5432");
    expect(client.port).toBe(5432);
  } finally { if (original === undefined) delete process.env.PGPORT; else process.env.PGPORT = original; }
});
