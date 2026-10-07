import { fileURLToPath } from "node:url";
import { productionDatabaseUrl } from "./production-database";

const migrationClientPath = fileURLToPath(
  new URL("../../node_modules/supabase-migration-client/dist/supabase.js", import.meta.url),
);

/** Build a subprocess contract, not a shell command. Values never go to logs.
 * The workdir contains only reviewed config/migrations, no legacy .env files. */
export function productionMigrationCommand(
  env: Record<string, string | undefined>,
  workdir: string,
  caPath: string,
  options: { dryRun?: boolean } = {},
) {
  const target = productionDatabaseUrl("MIGRATION_DATABASE_URL", env);
  const password = decodeURIComponent(target.password);
  if (!password || !workdir.startsWith("/") || !caPath.startsWith(`${workdir}/`)) throw new Error("Migratieconfiguratie onvolledig; verbinding geweigerd.");
  target.password = "";
  target.searchParams.set("sslmode", "verify-full");
  target.searchParams.set("sslrootcert", caPath);
  target.searchParams.set("options", "-c statement_timeout=600000");
  // The preceding target guard accepts only an exact local-history prefix.
  // Do not use --include-all: that flag can override the CLI's own ordering
  // refusal and is unnecessary for a verified prefix.
  // The pinned 2.109.1 Go migration client predates the TypeScript-only
  // --skip-vault flag. The isolated workdir is written from
  // PRODUCTION_MIGRATION_CONFIG and deliberately has no [db.vault] section.
  const args = [migrationClientPath, "db", "push", "--db-url", target.toString(), "--workdir", workdir, "--yes"];
  if (options.dryRun) args.push("--dry-run");
  return {
    command: process.execPath,
    args,
    env: {
      NODE_ENV: "production" as const, PATH: env.PATH, LANG: "C.UTF-8",
      HOME: workdir, PGPASSWORD: password, PGCONNECT_TIMEOUT: "15",
      // Go CLI <=2.109 can lose TLS query parameters while normalizing its
      // connection URL. These libpq variables are consulted again by its
      // final pgx parse and keep certificate + hostname verification strict.
      PGSSLMODE: "verify-full", PGSSLROOTCERT: caPath,
      // The migration process needs no usage reporting; keep command metadata
      // and connection failures inside the ephemeral hosted job.
      SUPABASE_TELEMETRY_DISABLED: "1", DO_NOT_TRACK: "1",
    },
  };
}
