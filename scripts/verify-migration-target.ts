import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { rootCertificates } from "node:tls";
import { Client } from "pg";
import { stagingDatabaseUrl } from "../lib/env/staging-database";
import { assertMigrationHistory, readMigrationManifest, type MigrationHistoryRow } from "./migration-manifest";

async function main() {
  const target = stagingDatabaseUrl("MIGRATION_DATABASE_URL", process.env);
  target.searchParams.delete("sslmode");
  const migrationDirectory = path.resolve(process.cwd(), "supabase/migrations");
  const expected = (await readdir(migrationDirectory, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && entry.name.endsWith(".sql"))
    .map((entry) => {
      const match = /^(\d{14})_(.+)\.sql$/.exec(entry.name);
      if (!match) throw new Error(`Ongeldige migratiebestandsnaam: ${entry.name}`);
      return { version: match[1], name: match[2] };
    })
    .sort((left, right) => left.version.localeCompare(right.version));
  if (expected.length === 0) throw new Error("Repository bevat geen Fieldgrid-migraties");
  const manifest = await readMigrationManifest();
  if (manifest.length !== expected.length || manifest.some((entry, index) => entry.version !== expected[index]?.version || entry.name !== expected[index]?.name)) {
    throw new Error("Migratiebestanden en inhoudsmanifest lopen uiteen");
  }

  const client = new Client({ connectionString: target.toString(), options: "-c statement_timeout=15000", ssl: { rejectUnauthorized: true, ca: [...rootCertificates, await readFile(path.resolve("scripts/certs/supabase-root-2021.crt"), "utf8")] }, connectionTimeoutMillis: 10_000, query_timeout: 15_000 });
  await client.connect();
  try {
    const historyExists = await client.query<{ present: boolean }>("select to_regclass('supabase_migrations.schema_migrations') is not null as present");
    const remote = historyExists.rows[0]?.present
      ? (await client.query<MigrationHistoryRow>("select version, name, statements from supabase_migrations.schema_migrations order by version")).rows
      : [];

    const customTables = await client.query<{ count: string }>(`
      select count(*)::text
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relkind in ('r', 'p')
        and not exists (
          select 1 from pg_depend d
          where d.classid = 'pg_class'::regclass and d.objid = c.oid and d.deptype = 'e'
        )
    `);

    if (remote.length === 0 && Number(customTables.rows[0]?.count ?? 0) > 0) {
      throw new Error("Migratiedoel bevat publieke applicatietabellen zonder Fieldgrid V1-migratiegeschiedenis");
    }
    assertMigrationHistory(manifest, remote, process.env.REQUIRE_COMPLETE_MIGRATION_HISTORY === "true");
    console.log(`Migratiedoel gevalideerd: ${remote.length}/${expected.length} V1-migraties aanwezig.`);
  } finally {
    await client.end();
  }
}

main().catch(() => {
  console.error("Migratiedoelcontrole mislukt: controleer stagingprojectguard, TLS en V1-migratiegeschiedenis. Geen verbindingdetails gelogd.");
  process.exitCode = 1;
});
