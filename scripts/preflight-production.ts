import { assertProductionRuntime } from "../lib/env/production-runtime";
import { productionDatabaseUrl } from "../lib/env/production-database";

try {
  assertProductionRuntime(process.env);
  const fixed = { DEPLOY_ROOT: "/opt/fieldgrid/production", SERVICE_NAME: "fieldgrid@production.service", HEALTHCHECK_URL: "https://fieldgrid.nl/api/healthz", NODE_ENV: "production" };
  for (const [name, value] of Object.entries(fixed)) if (process.env[name] !== value) throw new Error();
  if (!/^[0-9a-f]{40}$/.test(process.env.RELEASE_SHA ?? "") || process.env.RELEASE_SHA !== process.env.DEPLOYMENT_VERSION || process.env.RELEASE_SHA !== process.env.ACCEPTED_RELEASE_SHA) throw new Error();
  for (const name of ["DATABASE_URL", "MIGRATION_DATABASE_URL", "BACKUP_DATABASE_URL"] as const) productionDatabaseUrl(name, process.env);
  console.log("Productiepreflight geslaagd; runtime-scannercontrole volgt bij activatie.");
} catch {
  console.error("Productiepreflight geweigerd. Controleer de vaste identiteit, acceptatie-SHA, providerconfiguratie en projectguards; waarden worden niet gelogd.");
  process.exitCode = 1;
}
