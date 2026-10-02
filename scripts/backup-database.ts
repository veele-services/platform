import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { rootCertificates } from "node:tls";
import { mkdtemp, readFile, writeFile, rename, unlink, rmdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { stagingDatabaseUrl } from "../lib/env/staging-database";

const run = promisify(execFile);
// GitHub's ubuntu-24.04 image currently ships PostgreSQL 16 client tools while
// new Supabase projects run PostgreSQL 17. Use one immutable PostgreSQL 17
// client image so pg_dump and pg_restore agree on the archive format. Secrets
// are inherited as environment variables; they never appear in Docker argv.
export const backupClientImage = "docker.io/library/postgres:17.8-bookworm@sha256:45e40832755b7133da62e701ee496d65afc5e4527c8ff5446c2f3bdd11bc58e3";

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
    if (!process.getuid || !process.getgid) throw new Error("Backupclient vereist een POSIX-runner");
    const dockerInfo = await run("docker", ["info", "--format", "{{json .SecurityOptions}}"], {
      env: { NODE_ENV: "production", PATH: process.env.PATH, LANG: "C.UTF-8" },
      timeout: 30_000, maxBuffer: 1024 * 1024,
    });
    // Root in a rootless daemon maps to the invoking host user. A rootful
    // daemon instead uses the runner's numeric identity for the private bind.
    const dockerInfoOutput = typeof (dockerInfo as unknown) === "string" ? dockerInfo as unknown as string : dockerInfo.stdout;
    const identity = dockerInfoOutput.includes("rootless") ? "0:0" : `${process.getuid()}:${process.getgid()}`;
    const clientEnvironment: NodeJS.ProcessEnv = { NODE_ENV: "production", PATH: process.env.PATH, LANG: "C.UTF-8", PGHOST: target.hostname, PGPORT: target.port || "5432", PGDATABASE: "postgres", PGUSER: decodeURIComponent(target.username), PGPASSWORD: decodeURIComponent(target.password), PGSSLMODE: "verify-full", PGSSLROOTCERT: "/backup/roots.pem", PGCONNECT_TIMEOUT: "15" };
    await run("docker", ["pull", backupClientImage], {
      env: { NODE_ENV: "production", PATH: process.env.PATH, LANG: "C.UTF-8" },
      timeout: 600_000, maxBuffer: 16 * 1024 * 1024,
    });
    await run("docker", [
      "run", "--rm", "--pull=never", "--read-only", "--cap-drop=ALL", "--security-opt=no-new-privileges",
      "--user", identity, "--network", "bridge", "--tmpfs", "/tmp:rw,noexec,nosuid,nodev,size=16m",
      "--mount", `type=bind,source=${tlsDirectory},target=/backup`,
      "-e", "PGHOST", "-e", "PGPORT", "-e", "PGDATABASE", "-e", "PGUSER", "-e", "PGPASSWORD",
      "-e", "PGSSLMODE", "-e", "PGSSLROOTCERT", "-e", "PGCONNECT_TIMEOUT",
      backupClientImage, "pg_dump", "--format=custom", "--no-owner", "--no-privileges", "--file", "/backup/backup.partial",
    ], {
      env: clientEnvironment,
      timeout: 600_000, maxBuffer: 16 * 1024 * 1024,
    });
    await run("docker", [
      "run", "--rm", "--pull=never", "--read-only", "--cap-drop=ALL", "--security-opt=no-new-privileges",
      "--user", identity, "--network", "none", "--mount", `type=bind,source=${tlsDirectory},target=/backup,readonly`,
      backupClientImage, "pg_restore", "--list", "/backup/backup.partial",
    ], {
      env: { NODE_ENV: "production", PATH: process.env.PATH, LANG: "C.UTF-8" },
      timeout: 120_000, maxBuffer: 32 * 1024 * 1024,
    });
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
