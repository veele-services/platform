import { describe, expect, it } from "vitest";
import { assertProductionProject, productionDatabaseUrl } from "./production-database";
import { stagingDatabaseUrl } from "./staging-database";
import { productionMigrationCommand } from "./production-migration-command";

const project = "abcdefghijklmnopqrst", staging = "bbbbbbbbbbbbbbbbbbbb";
const password = "FICTITIOUS-production-password";
const env = { DEPLOY_TARGET: "production", APP_ENV: "production", EXPECTED_SUPABASE_PROJECT_REF: project, STAGING_SUPABASE_PROJECT_REF: staging, FORBIDDEN_SUPABASE_PROJECT_REF: "ckdtiuemeygrnujjibnw", SUPABASE_URL: `https://${project}.supabase.co`, MIGRATION_DATABASE_URL: `postgresql://postgres:${password}@db.${project}.supabase.co/postgres`, BACKUP_DATABASE_URL: `postgresql://postgres:${password}@db.${project}.supabase.co/postgres` };

describe("production project and connection isolation", () => {
  it("accepts only its explicit fresh project and keeps adapters mutually exclusive", () => {
    expect(assertProductionProject(env)).toBe(project);
    expect(productionDatabaseUrl("MIGRATION_DATABASE_URL", env).port).toBe("5432");
    expect(() => stagingDatabaseUrl("MIGRATION_DATABASE_URL", env)).toThrow("guard");
    expect(() => productionDatabaseUrl("MIGRATION_DATABASE_URL", { ...env, DEPLOY_TARGET: "staging", APP_ENV: "development" })).toThrow("guard");
  });
  it.each([
    { STAGING_SUPABASE_PROJECT_REF: "" }, { EXPECTED_SUPABASE_PROJECT_REF: "" },
    { EXPECTED_SUPABASE_PROJECT_REF: staging, SUPABASE_URL: `https://${staging}.supabase.co` },
    { EXPECTED_SUPABASE_PROJECT_REF: "ckdtiuemeygrnujjibnw", SUPABASE_URL: "https://ckdtiuemeygrnujjibnw.supabase.co" },
    { FORBIDDEN_SUPABASE_PROJECT_REF: "" }, { APP_ENV: "development" },
    { SUPABASE_URL: `https://${project}.supabase.co?host=evil.invalid` },
  ])("rejects missing guards and cross-environment API settings before connecting: %o", patch => {
    expect(() => assertProductionProject({ ...env, ...patch })).toThrow("geweigerd");
  });
  it.each([
    `postgresql://postgres:${password}@db.${staging}.supabase.co/postgres`,
    `postgresql://postgres:${password}@db.ckdtiuemeygrnujjibnw.supabase.co/postgres`,
    `postgresql://postgres.${staging}:${password}@aws-0-eu-central-1.pooler.supabase.com:5432/postgres`,
    `postgresql://postgres:${password}@db.${project}.supabase.co/postgres?host=evil.invalid`,
    `postgresql://postgres:${password}@db.${project}.supabase.co/postgres?sslmode=disable`,
    `postgresql://postgres:${password}@db.${project}.supabase.co/postgres?sslmode=require&sslmode=require`,
    `postgresql://postgres.${project}:${password}@aws-0-eu-central-1.pooler.supabase.com:6543/postgres`,
  ])("rejects a foreign, overridable or transaction-mode migration target without revealing the password", target => {
    try { productionDatabaseUrl("MIGRATION_DATABASE_URL", { ...env, MIGRATION_DATABASE_URL: target }); throw new Error("accepted unsafe connection"); }
    catch (error) { expect(String(error)).toContain("MIGRATION_DATABASE_URL"); expect(String(error)).not.toContain(password); }
  });
  it("allows a session pool for backup and a transaction pool only for runtime", () => {
    const session = `postgresql://postgres.${project}:${password}@aws-0-eu-central-1.pooler.supabase.com:5432/postgres`;
    expect(productionDatabaseUrl("BACKUP_DATABASE_URL", { ...env, BACKUP_DATABASE_URL: session }).port).toBe("5432");
    expect(productionDatabaseUrl("DATABASE_URL", { ...env, DATABASE_URL: session.replace(":5432/", ":6543/") }).port).toBe("6543");
  });
  it("pins migration identity and verified TLS, strips password from argv and inherited libpq overrides", () => {
    const command = productionMigrationCommand({ ...env, PGHOSTADDR: "192.0.2.1", PGOPTIONS: "unsafe", PGPORT: "6543", PGSERVICE: "legacy" }, "/tmp/production-fixture", "/tmp/production-fixture/roots.pem", { dryRun: true });
    expect(command.args.join(" ")).not.toContain(password);
    expect(command.args).toContain("--dry-run"); expect(command.args).not.toContain("--include-all");
    expect(command.env).toMatchObject({ PGPASSWORD: password, PGSSLMODE: "verify-full", PGSSLROOTCERT: "/tmp/production-fixture/roots.pem", SUPABASE_TELEMETRY_DISABLED: "1" });
    for (const key of ["PGHOSTADDR", "PGOPTIONS", "PGPORT", "PGSERVICE"]) expect(command.env).not.toHaveProperty(key);
  });
});
