import { readFileSync } from "node:fs";
import { rootCertificates } from "node:tls";
import { Client } from "pg";
import { productionDatabaseUrl } from "../lib/env/production-database";
import { configureProductionMerchant } from "../lib/operations/production-merchant";

async function main() {
  // Validate the actual connection before any provider request or client creation.
  const database = productionDatabaseUrl("MIGRATION_DATABASE_URL", process.env);
  database.searchParams.delete("sslmode");
  await configureProductionMerchant(process.env, {
    fetcher: fetch,
    log: console.log,
    connect: async () => {
      const client = new Client({ connectionString: database.href, options: "-c statement_timeout=15000", connectionTimeoutMillis: 10000,
        ssl: { rejectUnauthorized: true, ca: [...rootCertificates, readFileSync(new URL("./certs/supabase-root-2021.crt", import.meta.url), "utf8")] } });
      client.on("error", () => undefined);
      try { await client.connect(); return client; }
      catch { await client.end().catch(() => undefined); throw new Error("Productiedatabaseverbinding geweigerd."); }
    },
  });
}
main().catch(() => {
  console.error("Productie-merchantcontrole geweigerd of mislukt. Controleer tenant, bevestigd liveprofiel, exacte release en projectguard; geen credentials, profielgegevens of provideruitvoer gelogd.");
  process.exitCode = 1;
});
