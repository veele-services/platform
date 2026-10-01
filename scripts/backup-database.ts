import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { rootCertificates } from "node:tls";
import { mkdtemp, readFile, writeFile, rename, unlink, rmdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { stagingDatabaseUrl } from "../lib/env/staging-database";

const run = promisify(execFile);
async function main() {
  // Fail before creating directories or connecting, even outside the workflow.
  const target = stagingDatabaseUrl("BACKUP_DATABASE_URL", process.env);
  const runnerTemp = resolve(process.env.RUNNER_TEMP ?? "");
  const file = resolve(process.env.BACKUP_OUTPUT_PATH ?? "");
  if (!runnerTemp || runnerTemp === "/" || !file.startsWith(`${runnerTemp}/`) || file !== join(runnerTemp, "fieldgrid-staging-backup.dump")) throw new Error("Ongeldig backupdoel");
  const tlsDirectory = await mkdtemp(join(runnerTemp, "fieldgrid-backup-tls-"));
  const ca = join(tlsDirectory, "roots.pem"), partial = join(tlsDirectory, "backup.partial");
  let partialCreated = false;
  try {
    await writeFile(ca, [...rootCertificates, await readFile(resolve("scripts/certs/supabase-root-2021.crt"), "utf8")].join("\n"), { mode: 0o600, flag: "wx" });
    // Reserve a private file; only this invocation owns it. Never overwrite a
    // previous backup and never inherit PGHOSTADDR/PGSERVICE/PGOPTIONS overrides.
    await writeFile(partial, "", { mode: 0o600, flag: "wx" });
    partialCreated = true;
    await run("pg_dump", ["--format=custom", "--no-owner", "--no-privileges", "--file", partial], {
      env: { NODE_ENV: "production", PATH: process.env.PATH, LANG: "C.UTF-8", PGHOST: target.hostname, PGPORT: target.port || "5432", PGDATABASE: "postgres", PGUSER: decodeURIComponent(target.username), PGPASSWORD: decodeURIComponent(target.password), PGSSLMODE: "verify-full", PGSSLROOTCERT: ca, PGCONNECT_TIMEOUT: "15" },
      timeout: 600_000, maxBuffer: 1024 * 1024,
    });
    await run("pg_restore", ["--list", partial], { env: { NODE_ENV: "production", PATH: process.env.PATH, LANG: "C.UTF-8" }, maxBuffer: 32 * 1024 * 1024 });
    await rename(partial, file);
    partialCreated = false;
    console.log("Stagingbackup gemaakt en gevalideerd voor versleutelde overdracht.");
  } finally {
    if (partialCreated) await unlink(partial).catch(error => { if (error.code !== "ENOENT") throw error; });
    await unlink(ca).catch(error => { if (error.code !== "ENOENT") throw error; });
    await rmdir(tlsDirectory);
  }
}
main().catch(() => {
  console.error("Stagingbackup geweigerd of mislukt. Controleer projectguard, TLS en het private runnerdoel; geen credentials of provideruitvoer gelogd.");
  process.exitCode = 1;
});
