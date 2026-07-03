import pg from "pg";

const { Client } = pg;

const databaseUrl = process.env.DATABASE_URL;
const allowProduction =
  process.env.PHASE2_REPORT_ALLOW_PRODUCTION === "true" ||
  process.env.FIELDGRID_TENANT_HARDENING_REPORT_ALLOW_PRODUCTION === "true";
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
    "Refusing to run tenant hardening report against a production-looking target. Set FIELDGRID_TENANT_HARDENING_REPORT_ALLOW_PRODUCTION=true to override for read-only reporting.",
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

async function relationExists(client, relationName) {
  const row = await one(client, `select to_regclass($1) is not null as exists`, [
    `public.${relationName}`,
  ]);
  return Boolean(row?.exists);
}

async function inspectConstraintState(client, tableName) {
  const requiredCheckName = `${tableName}_tenant_id_required_check`;
  const tenantFkName = `${tableName}_tenant_id_fkey`;

  const row = await one(
    client,
    `select
       coalesce(bool_or(conname = $2), false) as required_check_exists,
       coalesce(bool_or(conname = $2 and convalidated), false) as required_check_validated,
       coalesce(bool_or(conname = $3), false) as tenant_fk_exists,
       coalesce(bool_or(conname = $3 and convalidated), false) as tenant_fk_validated
     from pg_constraint
     where conrelid = to_regclass('public.' || $1)`,
    [tableName, requiredCheckName, tenantFkName],
  );

  return {
    required_check: row?.required_check_exists ? requiredCheckName : "missing",
    required_check_validated: Boolean(row?.required_check_validated),
    tenant_fk: row?.tenant_fk_exists ? tenantFkName : "missing",
    tenant_fk_validated: Boolean(row?.tenant_fk_validated),
  };
}

async function inspectTenantTable(client, tableName) {
  const exists = await relationExists(client, tableName);
  if (!exists) {
    return {
      table_name: tableName,
      exists: false,
      total_rows: null,
      unresolved_tenant_id: null,
      tenant_id_nullable: null,
      tenant_id_default: null,
      tenant_fk: "missing-table",
      tenant_fk_validated: null,
      required_check: "missing-table",
      required_check_validated: null,
      ready_for_not_null: false,
      hardening_status: "missing-table",
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
      tenant_fk: "missing-column",
      tenant_fk_validated: null,
      required_check: "missing-column",
      required_check_validated: null,
      ready_for_not_null: false,
      hardening_status: "missing-column",
    };
  }

  const counts = await one(
    client,
    `select count(*)::int as total_rows,
            count(*) filter (where tenant_id is null)::int as unresolved_tenant_id
       from ${tableName}`,
  );

  const constraintState = await inspectConstraintState(client, tableName);
  const unresolved = Number(counts?.unresolved_tenant_id ?? 0);
  const readyForNotNull =
    unresolved === 0 &&
    column.is_nullable === "YES" &&
    column.column_default === null &&
    constraintState.tenant_fk_validated &&
    constraintState.required_check_validated;

  let hardeningStatus = "ready_for_not_null";
  if (column.is_nullable === "NO") hardeningStatus = "done_not_null";
  else if (column.column_default !== null) hardeningStatus = "default_must_be_removed";
  else if (unresolved > 0) hardeningStatus = "unresolved_rows";
  else if (!constraintState.tenant_fk_validated) hardeningStatus = "tenant_fk_validation_pending";
  else if (!constraintState.required_check_validated) hardeningStatus = "required_check_validation_pending";

  return {
    table_name: tableName,
    exists: true,
    total_rows: counts?.total_rows ?? 0,
    unresolved_tenant_id: unresolved,
    tenant_id_nullable: column.is_nullable,
    tenant_id_default: column.column_default,
    ...constraintState,
    ready_for_not_null: readyForNotNull,
    hardening_status: hardeningStatus,
  };
}

async function inspectAssignmentsDefault(client) {
  const exists = await relationExists(client, "assignments");
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
  const exists = await relationExists(client, "audit_log");
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

async function inspectReadinessView(client) {
  if (!(await relationExists(client, "fieldgrid_tenant_id_hardening_readiness"))) {
    return [];
  }

  const result = await client.query(
    `select table_name,
            classification,
            nullable_by_design,
            total_rows,
            unresolved_tenant_id,
            tenant_id_nullable,
            tenant_id_default,
            tenant_fk_exists,
            tenant_fk_validated,
            required_check_exists,
            required_check_validated,
            ready_for_not_null,
            hardening_status
       from fieldgrid_tenant_id_hardening_readiness
      order by nullable_by_design, table_name`,
  );

  return result.rows;
}

function buildSprint8Summary(tableReports, readinessView, assignmentsDefault) {
  const effectiveRows = readinessView.length > 0 ? readinessView : tableReports;
  const sensitiveRows = effectiveRows.filter((row) => !row.nullable_by_design);
  const unresolvedCount = sensitiveRows.reduce(
    (sum, row) => sum + Number(row.unresolved_tenant_id ?? 0),
    0,
  );
  const defaultRiskCount =
    sensitiveRows.filter((row) => row.tenant_id_default !== null && row.tenant_id_default !== undefined).length +
    (assignmentsDefault.tenant_id_default ? 1 : 0);
  const unvalidatedCount = sensitiveRows.filter(
    (row) => row.tenant_fk_validated === false || row.required_check_validated === false,
  ).length;
  const readyForNotNull = sensitiveRows
    .filter((row) => row.ready_for_not_null === true)
    .map((row) => row.table_name);
  const notReady = sensitiveRows
    .filter((row) => !["ready_for_not_null", "done_not_null"].includes(row.hardening_status))
    .map((row) => row.table_name);

  return {
    unresolved_count: unresolvedCount,
    default_risk_count: defaultRiskCount,
    unvalidated_constraint_count: unvalidatedCount,
    ready_for_not_null_tables: readyForNotNull,
    not_ready_tables: notReady,
  };
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
    const readinessView = await inspectReadinessView(client);
    const sprint8Summary = buildSprint8Summary(tableReports, readinessView, assignmentsDefault);

    const report = {
      generated_at: new Date().toISOString(),
      app_env: appEnv,
      unresolved_count: sprint8Summary.unresolved_count,
      sprint8_summary: sprint8Summary,
      assignments_default: assignmentsDefault,
      tenant_tables: tableReports,
      tenant_id_hardening_readiness: readinessView,
      audit_log_nullable_by_resource: auditLog,
    };

    if (args.has("--json")) {
      console.log(JSON.stringify(report, null, 2));
    } else {
      console.log("# Fieldgrid tenant_id hardening report\n");
      console.log(`- Generated at: \`${report.generated_at}\``);
      console.log(`- Environment: \`${report.app_env}\``);
      console.log(`- Sensitive unresolved tenant_id rows: \`${report.unresolved_count}\``);
      console.log(`- Default risks: \`${sprint8Summary.default_risk_count}\``);
      console.log(`- Unvalidated constraints: \`${sprint8Summary.unvalidated_constraint_count}\``);
      console.log(`- Ready for later NOT NULL wave: \`${sprint8Summary.ready_for_not_null_tables.join(", ") || "none"}\``);
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
          "tenant_fk",
          "tenant_fk_validated",
          "required_check",
          "required_check_validated",
          "ready_for_not_null",
          "hardening_status",
        ]),
      );
      console.log("\n## Sprint 8 Readiness View\n");
      console.log(
        markdownTable(readinessView, [
          "table_name",
          "classification",
          "nullable_by_design",
          "total_rows",
          "unresolved_tenant_id",
          "tenant_id_nullable",
          "tenant_id_default",
          "tenant_fk_validated",
          "required_check_validated",
          "ready_for_not_null",
          "hardening_status",
        ]),
      );
      console.log("\n## Audit Log Nullable By Resource\n");
      console.log(markdownTable(auditLog, ["resource", "total_rows", "nullable_rows"]));
    }

    if (args.has("--fail-on-unresolved") && sprint8Summary.unresolved_count > 0) {
      process.exitCode = 1;
    }
    if (args.has("--fail-on-default") && sprint8Summary.default_risk_count > 0) {
      process.exitCode = 1;
    }
    if (args.has("--fail-on-unvalidated") && sprint8Summary.unvalidated_constraint_count > 0) {
      process.exitCode = 1;
    }
    if (args.has("--fail-on-not-ready") && sprint8Summary.not_ready_tables.length > 0) {
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
