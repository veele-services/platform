import { readFileSync } from "node:fs";
import { rootCertificates } from "node:tls";
import { Client } from "pg";
import { diagnoseAuthMail } from "../lib/operations/auth-mail-diagnostic";

diagnoseAuthMail(process.env, {
  fetch,
  log: line => console.log(line),
  database: connectionString => {
    const client = new Client({
      connectionString,
      // Override ambient PGOPTIONS before any query, including transaction setup.
      options: "-c default_transaction_read_only=on -c statement_timeout=10000",
      connectionTimeoutMillis: 10_000, query_timeout: 15_000, idle_in_transaction_session_timeout: 30_000,
      ssl: { rejectUnauthorized: true, ca: [...rootCertificates, readFileSync(new URL("./certs/supabase-root-2021.crt", import.meta.url), "utf8")] },
    });
    // pg can emit connection errors between queries. Never let an unhandled
    // EventEmitter error print raw database diagnostics outside our safe catch.
    client.on("error", () => undefined);
    return client;
  },
}).then(ok => { if (!ok) process.exitCode = 1; }).catch(() => {
  console.error("Auth-maildiagnose geweigerd of mislukt; geen credentials of ruwe response-/databasegegevens worden gelogd.");
  process.exitCode = 1;
});
