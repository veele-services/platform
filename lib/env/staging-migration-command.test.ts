import { expect, it } from "vitest";
import { stagingMigrationCommand } from "./staging-migration-command";

const ref = "abcdefghijklmnopqrst";
const env = { DEPLOY_TARGET: "staging", APP_ENV: "development", EXPECTED_SUPABASE_PROJECT_REF: ref, FORBIDDEN_SUPABASE_PROJECT_REF: "ckdtiuemeygrnujjibnw", SUPABASE_URL: `https://${ref}.supabase.co`, MIGRATION_DATABASE_URL: `postgresql://postgres.${ref}:FICTITIOUS%21@aws-1-eu-west-1.pooler.supabase.com:5432/postgres?sslmode=require` };
it("keeps the password out of arguments, verifies TLS and suppresses ambient routing/legacy configuration", () => {
  const invocation = stagingMigrationCommand({ ...env, PGOPTIONS: "reference=ckdtiuemeygrnujjibnw", PGSERVICE: "legacy", PGHOSTADDR: "192.0.2.1", SUPABASE_DB_PASSWORD: "LEGACY", NODE_OPTIONS: "--require=legacy" }, "/tmp/fieldgrid-test", "/tmp/fieldgrid-test/roots.pem");
  expect(invocation.command).toBe(process.execPath);
  expect(invocation.args[0]).toMatch(/\/node_modules\/supabase-migration-client\/dist\/supabase\.js$/);
  expect(invocation.args.slice(1, 3)).toEqual(["db", "push"]);
  expect(invocation.args.join(" ")).not.toMatch(/FICTITIOUS|LEGACY|ckdtiuemeygrnujjibnw/);
  expect(invocation.env.PGPASSWORD).toBe("FICTITIOUS!");
  expect(invocation.env.HOME).toBe("/tmp/fieldgrid-test");
  expect(invocation.env.PGSSLMODE).toBe("verify-full");
  expect(invocation.env.PGSSLROOTCERT).toBe("/tmp/fieldgrid-test/roots.pem");
  expect(Object.keys(invocation.env).sort()).toEqual([
    "DO_NOT_TRACK", "HOME", "LANG", "NODE_ENV", "PATH",
    "PGCONNECT_TIMEOUT", "PGPASSWORD", "PGSSLMODE", "PGSSLROOTCERT",
    "SUPABASE_TELEMETRY_DISABLED",
  ]);
  const target = new URL(invocation.args[invocation.args.indexOf("--db-url") + 1]);
  expect(target.password).toBe("");
  expect(target.searchParams.get("sslmode")).toBe("verify-full");
  expect(target.searchParams.get("sslrootcert")).toBe("/tmp/fieldgrid-test/roots.pem");
  expect(target.searchParams.get("options")).toBe("-c statement_timeout=600000");
  expect(invocation.args).not.toContain("--skip-vault");
  expect(invocation.args).not.toContain("--include-all");
});
it("does not start the CLI for missing credentials or a foreign CA path", () => {
  expect(() => stagingMigrationCommand({ ...env, MIGRATION_DATABASE_URL: env.MIGRATION_DATABASE_URL.replace(":FICTITIOUS%21@", "@") }, "/tmp/fieldgrid-test", "/tmp/fieldgrid-test/roots.pem")).toThrow();
  expect(() => stagingMigrationCommand(env, "/tmp/fieldgrid-test", "/legacy/roots.pem")).toThrow();
});
it("can validate the same isolated target without applying migrations", () => {
  const invocation = stagingMigrationCommand(env, "/tmp/fieldgrid-test", "/tmp/fieldgrid-test/roots.pem", { dryRun: true });
  expect(invocation.args).toContain("--dry-run");
  expect(invocation.args.filter((value) => value === "--db-url")).toHaveLength(1);
  expect(invocation.env.PGPASSWORD).toBe("FICTITIOUS!");
});
