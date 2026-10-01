import { Client } from "pg";
import { assertMigrationHistory, readMigrationManifest, type MigrationHistoryRow } from "./migration-manifest";

async function main() {
  const expected = await readMigrationManifest();
  const client = new Client({ host: "127.0.0.1", port: 59322, user: "postgres", password: "postgres", database: "postgres", connectionTimeoutMillis: 5_000, query_timeout: 15_000 });
  await client.connect();
  try {
    const result = await client.query<MigrationHistoryRow>("select version, name, statements from supabase_migrations.schema_migrations order by version");
    assertMigrationHistory(expected, result.rows, true);
    console.log(`Schoon migratiemanifest gevalideerd: ${result.rows.length} inhoudshashes.`);
  } finally {
    await client.end();
  }
}

main().catch(() => {
  console.error("Lokaal migratiemanifest wijkt af. Genereer het uitsluitend opnieuw na een beoordeelde schone replay.");
  process.exitCode = 1;
});
