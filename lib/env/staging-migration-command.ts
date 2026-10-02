import { stagingDatabaseUrl } from "./staging-database";

/** Build a subprocess contract, not a shell command. Values never go to logs.
 * The workdir contains only reviewed config/migrations, no legacy .env files. */
export function stagingMigrationCommand(
  env: Record<string, string | undefined>,
  workdir: string,
  caPath: string,
  options: { dryRun?: boolean } = {},
) {
  const target = stagingDatabaseUrl("MIGRATION_DATABASE_URL", env);
  const password = decodeURIComponent(target.password);
  if (!password || !workdir.startsWith("/") || !caPath.startsWith(`${workdir}/`)) throw new Error("Migratieconfiguratie onvolledig; verbinding geweigerd.");
  target.password = "";
  target.searchParams.set("sslmode", "verify-full");
  target.searchParams.set("sslrootcert", caPath);
  target.searchParams.set("options", "-c statement_timeout=600000");
  // The preceding target guard accepts only an exact local-history prefix.
  // Do not use --include-all: that flag can override the CLI's own ordering
  // refusal and is unnecessary for a verified prefix.
  const args = ["exec", "supabase", "db", "push", "--db-url", target.toString(), "--workdir", workdir, "--skip-vault", "--yes"];
  if (options.dryRun) args.push("--dry-run");
  return {
    command: "pnpm",
    args,
    env: {
      NODE_ENV: "production" as const, PATH: env.PATH, LANG: "C.UTF-8",
      PGPASSWORD: password, PGCONNECT_TIMEOUT: "15",
    },
  };
}
