import { expect, it } from "vitest";
import { stagingMigrationCommand } from "./staging-migration-command";

const ref = "abcdefghijklmnopqrst";
const env = { DEPLOY_TARGET: "staging", APP_ENV: "development", EXPECTED_SUPABASE_PROJECT_REF: ref, FORBIDDEN_SUPABASE_PROJECT_REF: "ckdtiuemeygrnujjibnw", SUPABASE_URL: `https://${ref}.supabase.co`, MIGRATION_DATABASE_URL: `postgresql://postgres.${ref}:FICTITIOUS%21@aws-1-eu-west-1.pooler.supabase.com:5432/postgres?sslmode=require` };
it("keeps the password out of arguments, verifies TLS and suppresses ambient routing/legacy configuration", () => {
  const invocation = stagingMigrationCommand({ ...env, PGOPTIONS: "reference=ckdtiuemeygrnujjibnw", PGSERVICE: "legacy", PGHOSTADDR: "192.0.2.1", SUPABASE_DB_PASSWORD: "LEGACY", NODE_OPTIONS: "--require=legacy" }, "/tmp/fieldgrid-test", "/tmp/fieldgrid-test/roots.pem");
  expect(invocation.args.join(" ")).not.toMatch(/FICTITIOUS|LEGACY|ckdtiuemeygrnujjibnw/);
  expect(invocation.env.PGPASSWORD).toBe("FICTITIOUS!");
  expect(Object.keys(invocation.env).sort()).toEqual(["LANG", "NODE_ENV", "PATH", "PGCONNECT_TIMEOUT", "PGPASSWORD"]);
  const target = new URL(invocation.args[invocation.args.indexOf("--db-url") + 1]);
  expect(target.password).toBe("");
  expect(target.searchParams.get("sslmode")).toBe("verify-full");
  expect(target.searchParams.get("sslrootcert")).toBe("/tmp/fieldgrid-test/roots.pem");
  expect(target.searchParams.get("options")).toBe("-c statement_timeout=600000");
  expect(invocation.args).toContain("--skip-vault");
});
it("does not start the CLI for missing credentials or a foreign CA path", () => {
  expect(() => stagingMigrationCommand({ ...env, MIGRATION_DATABASE_URL: env.MIGRATION_DATABASE_URL.replace(":FICTITIOUS%21@", "@") }, "/tmp/fieldgrid-test", "/tmp/fieldgrid-test/roots.pem")).toThrow();
  expect(() => stagingMigrationCommand(env, "/tmp/fieldgrid-test", "/legacy/roots.pem")).toThrow();
});
