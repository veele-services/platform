import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import pg from "pg";

const { Client } = pg;

const managedSchemas = new Set([
  "auth",
  "extensions",
  "graphql",
  "graphql_public",
  "net",
  "pgsodium",
  "realtime",
  "storage",
  "supabase_functions",
  "vault",
]);

const databaseUrl = process.env.DATABASE_URL;
const appEnv = process.env.APP_ENV ?? "unknown";
const reportDir = process.env.REPORT_DIR ?? path.resolve(process.cwd(), "database-inspection", appEnv);

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required for database inspection.");
}

function isSystemSchemaSql(alias) {
  return `${alias}.nspname !~ '^pg_' and ${alias}.nspname <> 'information_schema'`;
}

async function collect(client, name, sql) {
  try {
    const result = await client.query(sql);
    return { name, ok: true, rows: result.rows };
  } catch (error) {
    return {
      name,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      rows: [],
    };
  }
}

function table(rows, columns) {
  if (rows.length === 0) {
    return "_No rows._";
  }

  const header = `| ${columns.join(" | ")} |`;
  const separator = `| ${columns.map(() => "---").join(" | ")} |`;
  const body = rows
    .map((row) =>
      `| ${columns
        .map((column) => {
          const value = row[column];
          if (value === null || value === undefined) return "";
          return String(value).replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
        })
        .join(" | ")} |`,
    )
    .join("\n");

  return `${header}\n${separator}\n${body}`;
}

function section(title, content) {
  return `\n## ${title}\n\n${content}\n`;
}

function summarizeDataset(dataset) {
  if (!dataset.ok) {
    return `Failed: ${dataset.error}`;
  }

  return `${dataset.rows.length} rows`;
}

function renderMarkdown(report) {
  const datasets = Object.fromEntries(report.datasets.map((dataset) => [dataset.name, dataset]));
  const schemas = datasets.schemas?.rows ?? [];
  const relations = datasets.relations?.rows ?? [];
  const publicRelations = relations.filter((relation) => relation.schema_name === "public");
  const managedRelations = relations.filter((relation) => managedSchemas.has(relation.schema_name));
  const policies = datasets.policies?.rows ?? [];
  const rlsRelations = relations.filter((relation) => relation.relrowsecurity || relation.relforcerowsecurity);

  let markdown = `# Database Inspection Report\n\n`;
  markdown += `- Environment: \`${report.environment}\`\n`;
  markdown += `- Generated at: \`${report.generated_at}\`\n`;
  markdown += `- Note: This report contains schema metadata only. It does not include table data.\n`;

  markdown += section(
    "Summary",
    table(
      report.datasets.map((dataset) => ({
        dataset: dataset.name,
        status: dataset.ok ? "ok" : "failed",
        result: summarizeDataset(dataset),
      })),
      ["dataset", "status", "result"],
    ),
  );

  markdown += section(
    "Schemas",
    table(
      schemas.map((schema) => ({
        schema_name: schema.schema_name,
        category: managedSchemas.has(schema.schema_name) ? "supabase-managed" : "application/custom",
      })),
      ["schema_name", "category"],
    ),
  );

  markdown += section(
    "Public Relations",
    table(
      publicRelations.map((relation) => ({
        relation: `${relation.schema_name}.${relation.relation_name}`,
        type: relation.relation_type,
        rls: relation.relrowsecurity ? "enabled" : "disabled",
        force_rls: relation.relforcerowsecurity ? "enabled" : "disabled",
        estimated_rows: relation.estimated_rows,
      })),
      ["relation", "type", "rls", "force_rls", "estimated_rows"],
    ),
  );

  markdown += section(
    "Supabase Managed Relations",
    table(
      managedRelations.map((relation) => ({
        relation: `${relation.schema_name}.${relation.relation_name}`,
        type: relation.relation_type,
        estimated_rows: relation.estimated_rows,
      })),
      ["relation", "type", "estimated_rows"],
    ),
  );

  markdown += section(
    "RLS Enabled Relations",
    table(
      rlsRelations.map((relation) => ({
        relation: `${relation.schema_name}.${relation.relation_name}`,
        rls: relation.relrowsecurity ? "enabled" : "disabled",
        force_rls: relation.relforcerowsecurity ? "enabled" : "disabled",
      })),
      ["relation", "rls", "force_rls"],
    ),
  );

  markdown += section(
    "Policies",
    table(
      policies.map((policy) => ({
        relation: `${policy.schemaname}.${policy.tablename}`,
        policy: policy.policyname,
        command: policy.cmd,
        roles: Array.isArray(policy.roles) ? policy.roles.join(", ") : policy.roles,
      })),
      ["relation", "policy", "command", "roles"],
    ),
  );

  return markdown;
}

const queries = [
  [
    "schemas",
    `
      select n.nspname as schema_name
      from pg_namespace n
      where ${isSystemSchemaSql("n")}
      order by n.nspname
    `,
  ],
  [
    "relations",
    `
      select
        n.nspname as schema_name,
        c.relname as relation_name,
        case c.relkind
          when 'r' then 'table'
          when 'p' then 'partitioned table'
          when 'v' then 'view'
          when 'm' then 'materialized view'
          when 'f' then 'foreign table'
          else c.relkind::text
        end as relation_type,
        c.relrowsecurity,
        c.relforcerowsecurity,
        greatest(c.reltuples::bigint, 0) as estimated_rows
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where ${isSystemSchemaSql("n")}
        and c.relkind in ('r', 'p', 'v', 'm', 'f')
      order by n.nspname, c.relname
    `,
  ],
  [
    "columns",
    `
      select
        table_schema,
        table_name,
        ordinal_position,
        column_name,
        data_type,
        udt_name,
        is_nullable,
        column_default,
        character_maximum_length,
        numeric_precision,
        numeric_scale,
        datetime_precision
      from information_schema.columns
      where table_schema not like 'pg_%'
        and table_schema <> 'information_schema'
      order by table_schema, table_name, ordinal_position
    `,
  ],
  [
    "constraints",
    `
      select
        n.nspname as schema_name,
        rel.relname as table_name,
        c.conname as constraint_name,
        c.contype as constraint_type,
        pg_get_constraintdef(c.oid, true) as definition
      from pg_constraint c
      join pg_namespace n on n.oid = c.connamespace
      left join pg_class rel on rel.oid = c.conrelid
      where ${isSystemSchemaSql("n")}
      order by n.nspname, rel.relname, c.conname
    `,
  ],
  [
    "indexes",
    `
      select schemaname, tablename, indexname, indexdef
      from pg_indexes
      where schemaname not like 'pg_%'
        and schemaname <> 'information_schema'
      order by schemaname, tablename, indexname
    `,
  ],
  [
    "policies",
    `
      select schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
      from pg_policies
      where schemaname not like 'pg_%'
        and schemaname <> 'information_schema'
      order by schemaname, tablename, policyname
    `,
  ],
  [
    "triggers",
    `
      select
        n.nspname as schema_name,
        c.relname as table_name,
        t.tgname as trigger_name,
        t.tgenabled as enabled,
        pg_get_triggerdef(t.oid, true) as definition
      from pg_trigger t
      join pg_class c on c.oid = t.tgrelid
      join pg_namespace n on n.oid = c.relnamespace
      where not t.tgisinternal
        and ${isSystemSchemaSql("n")}
      order by n.nspname, c.relname, t.tgname
    `,
  ],
  [
    "functions",
    `
      select
        n.nspname as schema_name,
        p.proname as function_name,
        pg_get_function_arguments(p.oid) as arguments,
        pg_get_function_result(p.oid) as result_type,
        l.lanname as language,
        p.prosecdef as security_definer,
        p.provolatile as volatility
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      join pg_language l on l.oid = p.prolang
      where ${isSystemSchemaSql("n")}
      order by n.nspname, p.proname, arguments
    `,
  ],
  [
    "enums",
    `
      select n.nspname as schema_name, t.typname as enum_name, e.enumlabel as enum_value, e.enumsortorder
      from pg_type t
      join pg_enum e on e.enumtypid = t.oid
      join pg_namespace n on n.oid = t.typnamespace
      where ${isSystemSchemaSql("n")}
      order by n.nspname, t.typname, e.enumsortorder
    `,
  ],
  [
    "sequences",
    `
      select sequence_schema, sequence_name, data_type, start_value, minimum_value, maximum_value, increment, cycle_option
      from information_schema.sequences
      where sequence_schema not like 'pg_%'
        and sequence_schema <> 'information_schema'
      order by sequence_schema, sequence_name
    `,
  ],
  [
    "extensions",
    `
      select e.extname as extension_name, e.extversion as version, n.nspname as schema_name
      from pg_extension e
      join pg_namespace n on n.oid = e.extnamespace
      order by e.extname
    `,
  ],
  [
    "views",
    `
      select schemaname, viewname, definition
      from pg_views
      where schemaname not like 'pg_%'
        and schemaname <> 'information_schema'
      order by schemaname, viewname
    `,
  ],
  [
    "drizzle_migrations",
    `
      select *
      from drizzle.__drizzle_migrations
      order by created_at
    `,
  ],
];

const client = new Client({ connectionString: databaseUrl });
await client.connect();

try {
  const datasets = [];
  for (const [name, sql] of queries) {
    datasets.push(await collect(client, name, sql));
  }

  const report = {
    environment: appEnv,
    generated_at: new Date().toISOString(),
    datasets,
  };

  await mkdir(reportDir, { recursive: true });
  await writeFile(path.join(reportDir, "schema-report.json"), JSON.stringify(report, null, 2));
  await writeFile(path.join(reportDir, "schema-report.md"), renderMarkdown(report));

  console.log(`Database inspection report written to ${reportDir}`);
} finally {
  await client.end();
}
