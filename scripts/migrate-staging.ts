import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, mkdir, readFile, writeFile, readdir, copyFile, unlink, rmdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { rootCertificates } from "node:tls";
import { stagingDatabaseUrl } from "../lib/env/staging-database";
import { stagingMigrationCommand } from "../lib/env/staging-migration-command";

async function main() {
  // Also guarded when invoked directly, before filesystem writes or connections.
  stagingDatabaseUrl("MIGRATION_DATABASE_URL", process.env);
  const directory = await mkdtemp(join(tmpdir(), "fieldgrid-staging-migrate-"));
  const created: string[] = [], folders: string[] = [];
  try {
    const supabase = join(directory, "supabase"), migrations = join(supabase, "migrations");
    await mkdir(supabase); folders.push(supabase);
    await mkdir(migrations); folders.push(migrations);
    const ca = join(directory, "roots.pem");
    await writeFile(ca, [...rootCertificates, await readFile(resolve("scripts/certs/supabase-root-2021.crt"), "utf8")].join("\n"), { mode: 0o600, flag: "wx" }); created.push(ca);
    const config = join(supabase, "config.toml");
    await copyFile(resolve("supabase/config.toml"), config); created.push(config);
    const names = (await readdir(resolve("supabase/migrations"))).filter(name => /^\d{14}_[a-z0-9_]+\.sql$/.test(name)).sort();
    if (!names.length) throw new Error("Migraties ontbreken");
    for (const name of names) {
      const target = join(migrations, name);
      await copyFile(resolve("supabase/migrations", name), target); created.push(target);
    }
    const invocation = stagingMigrationCommand(process.env, directory, ca);
    // Capture, but do not relay CLI diagnostics: database errors can contain
    // sensitive records. Credentials are exclusively in the child's environment.
    await promisify(execFile)(invocation.command, invocation.args, { env: invocation.env, timeout: 1_200_000, maxBuffer: 16 * 1024 * 1024 });
    console.log("Voorwaartse stagingmigraties voltooid met geverifieerde TLS en geïsoleerde CLI-configuratie.");
  } finally {
    // Only remove the exact temporary files this process created. A CLI-created
    // extra file leaves the private directory for inspection instead of a broad rm.
    for (const file of created.reverse()) await unlink(file).catch(() => undefined);
    for (const folder of folders.reverse()) await rmdir(folder).catch(() => undefined);
    await rmdir(directory).catch(() => undefined);
  }
}
main().catch(() => {
  console.error("Stagingmigratie geweigerd of mislukt. Controleer projectguard, TLS en migratiegeschiedenis; credentials en databasefouten worden niet gelogd.");
  process.exitCode = 1;
});
