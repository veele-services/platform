import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, mkdir, readFile, writeFile, readdir, copyFile, unlink, rmdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { rootCertificates } from "node:tls";
import { productionDatabaseUrl } from "../lib/env/production-database";
import { productionMigrationCommand } from "../lib/env/production-migration-command";
import { PRODUCTION_MIGRATION_CONFIG } from "../lib/env/production-migration-config";
import {
  formatStagingMigrationDiagnostic,
  stagingMigrationDiagnostic,
  type StagingMigrationPhase,
} from "../lib/env/staging-migration-diagnostic";

const execFileAsync = promisify(execFile);

async function runMigrationPhase(
  phase: StagingMigrationPhase,
  invocation: ReturnType<typeof productionMigrationCommand>,
  migrationNames: readonly string[],
) {
  try {
    // Capture, but never relay raw CLI diagnostics: database errors may
    // contain records or connection details. Credentials exist only in the
    // child environment.
    await execFileAsync(invocation.command, invocation.args, {
      env: invocation.env,
      timeout: 1_200_000,
      maxBuffer: 16 * 1024 * 1024,
    });
  } catch (failure) {
    console.error(`Veilige productionmigratiediagnose: ${formatStagingMigrationDiagnostic(stagingMigrationDiagnostic(phase, failure, migrationNames))}`);
    throw failure;
  }
}

async function main() {
  // Also guarded when invoked directly, before filesystem writes or connections.
  productionDatabaseUrl("MIGRATION_DATABASE_URL", process.env);
  const directory = await mkdtemp(join(tmpdir(), "fieldgrid-production-migrate-"));
  const created: string[] = [], folders: string[] = [];
  try {
    const supabase = join(directory, "supabase"), migrations = join(supabase, "migrations");
    await mkdir(supabase); folders.push(supabase);
    await mkdir(migrations); folders.push(migrations);
    const ca = join(directory, "roots.pem");
    await writeFile(ca, [...rootCertificates, await readFile(resolve("scripts/certs/supabase-root-2021.crt"), "utf8")].join("\n"), { mode: 0o600, flag: "wx" }); created.push(ca);
    const config = join(supabase, "config.toml");
    await writeFile(config, PRODUCTION_MIGRATION_CONFIG, { mode: 0o600, flag: "wx" }); created.push(config);
    const names = (await readdir(resolve("supabase/migrations"))).filter(name => /^\d{14}_[a-z0-9_]+\.sql$/.test(name)).sort();
    if (!names.length) throw new Error("Migraties ontbreken");
    for (const name of names) {
      const target = join(migrations, name);
      await copyFile(resolve("supabase/migrations", name), target); created.push(target);
    }
    await runMigrationPhase(
      "dry-run",
      productionMigrationCommand(process.env, directory, ca, { dryRun: true }),
      names,
    );
    console.log("Productiemigratieverbinding en migratievolgorde niet-schrijvend gevalideerd.");
    await runMigrationPhase(
      "apply",
      productionMigrationCommand(process.env, directory, ca),
      names,
    );
    console.log("Voorwaartse productionmigraties voltooid met geverifieerde TLS en geïsoleerde CLI-configuratie.");
  } finally {
    // Only remove the exact temporary files this process created. A CLI-created
    // extra file leaves the private directory for inspection instead of a broad rm.
    for (const file of created.reverse()) await unlink(file).catch(() => undefined);
    for (const folder of folders.reverse()) await rmdir(folder).catch(() => undefined);
    await rmdir(directory).catch(() => undefined);
  }
}
main().catch(() => {
  console.error("Productiemigratie geweigerd of mislukt. Controleer projectguard, TLS en migratiegeschiedenis; credentials en databasefouten worden niet gelogd.");
  process.exitCode = 1;
});
