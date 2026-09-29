import { readdir } from "node:fs/promises";
import path from "node:path";
import { Client } from "pg";

const connectionString = process.env.MIGRATION_DATABASE_URL;
if (!connectionString) throw new Error("MIGRATION_DATABASE_URL ontbreekt");

async function main() {
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

  const client = new Client({ connectionString, connectionTimeoutMillis: 10_000, query_timeout: 15_000 });
  await client.connect();
  try {
    const historyExists = await client.query<{ present: boolean }>("select to_regclass('supabase_migrations.schema_migrations') is not null as present");
    const remote = historyExists.rows[0]?.present
      ? (await client.query<{ version: string; name: string }>("select version, name from supabase_migrations.schema_migrations order by version")).rows
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
    if (remote.length > expected.length) throw new Error("Migratiedoel bevat migraties buiten de Fieldgrid V1-baseline");
    remote.forEach((migration, index) => {
      const wanted = expected[index];
      if (!wanted || migration.version !== wanted.version || migration.name !== wanted.name) {
        throw new Error(`Migratiegeschiedenis wijkt af bij positie ${index + 1}`);
      }
    });
    console.log(`Migratiedoel gevalideerd: ${remote.length}/${expected.length} V1-migraties aanwezig.`);
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Migratiedoelcontrole mislukt");
  process.exitCode = 1;
});
