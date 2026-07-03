import pg from "pg";

const { Client } = pg;

const databaseUrl = process.env.DATABASE_URL;
const allowProduction = process.env.PHASE2_REPORT_ALLOW_PRODUCTION === "true";
const appEnv = process.env.APP_ENV ?? "unknown";
const args = new Set(process.argv.slice(2));

const sensitiveTables = [
  "documents",
  "reports",
  "quotes",
  "invoices",
  "payments",
  "customer_payment_batches",
  "customer_payment_batch_items",
];

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required for tenant hardening report.");
}

if (!allowProduction && (/production|prod/i.test(appEnv) || /production|prod/i.test(databaseUrl))) {
  throw new Error(
    "Refusing to run tenant hardening report against a production-looking target. Set PHASE2_REPORT_ALLOW_PRODUCTION=true to override for read-only reporting.",
  );
}

function markdownTable(rows, columns) {
  if (rows.length === 0) return "_No rows._";
  const header = `| ${columns.join(" | ")} |`;
  const separator = `| ${columns.map(() => "---").join(" | ")} |`;
  const body = rows
    .map((row) =>
      `| ${columns
        .map((column) => {
          const value = row[column];
          if (value === null || value === undefined) return "";
          return String(value).replace(/\|/gu, "\\|").replace(/\r?\n/gu, " ");
        })
        .join(" | ")} |`,
    )
    .join("\n");
  return `${header}\n${separator}\n${body}`;
}

async function one(client, sql, params = []) {
  const result = await client.query(sql, params);
  return result.rows[0] ?? null;
}

async function tableExists(client, tableName) {
  const row = await one(
    client,
    `select exists(
       select 1
       from information_schema.tables
       where table_schema = 'public'
         and table_name = $1
     ) as exists`,
    [tableName],
  );
  return Boolean(row?.exists);
}

async function inspectTenantTable(client, tableName) {
  const exists = await tableExists(client, tableName);
  if (!exists) {
    return {
      table_name: tableName,
      exists: false,
      total_rows: null,
      unresolved_tenant_id: null,
      tenant_id_nullable: null,
      tenant_id_default: null,
      required_check: "missing-table",
      required_check_validated: null,
      ready_for_not_null: false,
    };
  }

  const column = await one(
    client,
    `select is_nullable, column_default
       from information_schema.columns
      where table_schema = 'public'
        and table_name = $1
        and column_name = 'tenant_id'`,
    [tableName],
  );

  if (!column) {
    return {
      table_name: tableName,
      exists: true,
      total_rows: null,
      unresolved_tenant_id: null,
      tenant_id_nullable: "missing-column",
      tenant_id_default: null,
      required_check: "missing-column",
      required_check_validated: null,
      ready_for_not_null: false,
    };
  }

  const counts = await one(
    client,
    `select count(*)::int as total_rows,
            count(*) filter (where tenant_id is null)::int as unresolved_tenant_id
       from ${tableName}`,
  );

  const check = await one(
    client,
    `select conname, convalidated
       from pg_constraint
      where conrelid = to_regclass('public.' || $1)
        and conname = $2`,
    [tableName, `${tableName}_tenant_id_required_check`],
  );

  const unresolved = Number(counts?.unresolved_tenant_id ?? 0);

  return {
    table_name: tableName,
    exists: true,
    total_rows: counts?.total_rows ?? 0,
    unresolved_tenant_id: unresolved,
    tenant_id_nullable: column.is_nullable,
    tenant_id_default: column.column_default,
    required_check: check?.conname ?? "missing",
    required_check_validated: check?.convalidated ?? false,
    ready_for_not_null: unresolved === 0 && column.is_nullable === "YES",
  };
}

async function inspectAssignmentsDefault(client) {
  const exists = await tableExists(client, "assignments");
  if (!exists) return { table_name: "assignments", tenant_id_default: "missing-table", ok: false };

  const column = await one(
    client,
    `select is_nullable, column_default
       from information_schema.columns
      where table_schema = 'public'
        and table_name = 'assignments'
        and column_name = 'tenant_id'`,
  );

  return {
    table_name: "assignments",
    tenant_id_nullable: column?.is_nullable ?? "missing-column",
    tenant_id_default: column?.column_default ?? null,
    ok: Boolean(column && column.is_nullable === "NO" && column.column_default === null),
  };
}

async function inspectAuditLog(client) {
  const exists = await tableExists(client, "audit_log");
  if (!exists) return [];

  const result = await client.query(
    `select resource,
            count(*)::int as total_rows,
            count(*) filter (where tenant_id is null)::int as nullable_rows
       from audit_log
      group by resource
      order by nullable_rows desc, resource asc
      limit 25`,
  );

  return result.rows;
}

async function main() {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  try {
    const tableReports = [];
    for (const tableName of sensitiveTables) {
      tableReports.push(await inspectTenantTable(client, tableName));
    }

    const assignmentsDefault = await inspectAssignmentsDefault(client);
    const auditLog = await inspectAuditLog(client);
    const unresolvedCount = tableReports.reduce(
      (sum, row) => sum + Number(row.unresolved_tenant_id ?? 0),
      0,
    );

    const report = {
      generated_at: new Date().toISOString(),
      app_env: appEnv,
      unresolved_count: unresolvedCount,
      assignments_default: assignmentsDefault,
      tenant_tables: tableReports,
      audit_log_nullable_by_resource: auditLog,
    };

    if (args.has("--json")) {
      console.log(JSON.stringify(report, null, 2));
    } else {
      console.log("# Fieldgrid phase 2 tenant hardening report\n");
      console.log(`- Generated at: \`${report.generated_at}\``);
      console.log(`- Environment: \`${report.app_env}\``);
      console.log(`- Sensitive unresolved tenant_id rows: \`${report.unresolved_count}\``);
      console.log("\n## Assignments Default\n");
      console.log(markdownTable([assignmentsDefault], ["table_name", "tenant_id_nullable", "tenant_id_default", "ok"]));
      console.log("\n## Sensitive Tenant Tables\n");
      console.log(
        markdownTable(tableReports, [
          "table_name",
          "exists",
          "total_rows",
          "unresolved_tenant_id",
          "tenant_id_nullable",
          "tenant_id_default",
          "required_check",
          "required_check_validated",
          "ready_for_not_null",
        ]),
      );
      console.log("\n## Audit Log Nullable By Resource\n");
      console.log(markdownTable(auditLog, ["resource", "total_rows", "nullable_rows"]));
    }

    if (args.has("--fail-on-unresolved") && unresolvedCount > 0) {
      process.exitCode = 1;
    }
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error("Tenant hardening report failed:");
  console.error(error);
  process.exit(1);
});
