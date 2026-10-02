export type StagingMigrationPhase = "dry-run" | "apply";

export type StagingMigrationCategory =
  | "authentication"
  | "tls"
  | "pooler"
  | "transport"
  | "timeout"
  | "history"
  | "statement"
  | "unknown";

export type StagingMigrationDiagnostic = Readonly<{
  phase: StagingMigrationPhase;
  category: StagingMigrationCategory;
  connection?: "direct" | "session-pooler";
  migration?: string;
  sqlstate?: string;
}>;

const migrationNamePattern = /^\d{14}_[a-z0-9_]+\.sql$/;

// SQLSTATE values are safe only when explicitly classified here. In
// particular, an arbitrary child-process `code` must never become log output.
const sqlstateCategories = new Map<string, StagingMigrationCategory>([
  ["0A000", "statement"], ["2BP01", "statement"],
  ["08000", "transport"], ["08001", "transport"], ["08003", "transport"],
  ["08004", "transport"], ["08006", "transport"], ["08007", "transport"],
  ["08P01", "transport"], ["28000", "authentication"], ["28P01", "authentication"],
  ["23502", "statement"], ["23503", "statement"], ["23505", "statement"],
  ["23514", "statement"], ["3D000", "history"], ["40001", "statement"],
  ["40P01", "statement"], ["42501", "statement"], ["42601", "statement"],
  ["42701", "statement"], ["42703", "statement"], ["42704", "statement"],
  ["42710", "statement"], ["42804", "statement"], ["42883", "statement"],
  ["42P01", "statement"], ["42P06", "statement"], ["42P07", "statement"],
  ["42P13", "statement"], ["53300", "transport"], ["55P03", "timeout"],
  ["57014", "timeout"], ["57P01", "transport"], ["57P02", "transport"],
  ["57P03", "transport"], ["P0001", "statement"], ["XX000", "statement"],
]);

const safeText = (value: unknown) => {
  if (typeof value === "string") return value;
  if (Buffer.isBuffer(value)) return value.toString("utf8");
  return "";
};

function failureOutputText(failure: unknown) {
  if (!failure || typeof failure !== "object") return safeText(failure);
  const record = failure as Record<string, unknown>;
  const cause = record.cause && typeof record.cause === "object"
    ? record.cause as Record<string, unknown>
    : undefined;
  // Only process output is suitable classification input. Node includes the
  // complete executable and arguments in child-process error messages; those
  // arguments can contain harmless connection options such as `sslmode` and
  // `sslrootcert`. Inspecting `message` would therefore turn unrelated CLI
  // failures into false TLS diagnoses. Structured error codes are considered
  // separately by `sqlstateFrom`.
  //
  // Bound inspection cost while retaining both the start and end of CLI
  // diagnostics. This text is classification input only and is never returned.
  return [record.stderr, record.stdout, cause?.stderr, cause?.stdout]
    .map(safeText)
    .map((text) => text.length > 1_048_576
      ? `${text.slice(0, 524_288)}\n${text.slice(-524_288)}`
      : text)
    .filter(Boolean)
    .join("\n");
}

function connectionFrom(failure: unknown) {
  if (!failure || typeof failure !== "object") return undefined;
  const record = failure as Record<string, unknown>;
  const cause = record.cause && typeof record.cause === "object"
    ? record.cause as Record<string, unknown>
    : undefined;
  // `execFile` repeats the full command in Error.message. Inspect that value
  // only for an allowlisted connection class; never return the URL, hostname,
  // project ref, user or any other part of the untrusted text.
  const text = [record.message, cause?.message, record.stderr, cause?.stderr]
    .map(safeText)
    .join("\n");
  const direct = /\bdb\.[a-z0-9]{20}\.supabase\.co(?=[:/\s?]|$)/iu.test(text);
  const pooler = /\baws-[a-z0-9-]+\.pooler\.supabase\.com(?=[:/\s?]|$)/iu.test(text);
  if (direct === pooler) return undefined;
  return direct ? "direct" as const : "session-pooler" as const;
}

function migrationFrom(text: string, allowedMigrationNames: readonly string[]) {
  const allowed = [...new Set(allowedMigrationNames.filter((value) => migrationNamePattern.test(value)))];
  const allowedSet = new Set(allowed);
  let applying: string | undefined;
  for (const match of text.matchAll(/\bApplying migration\s+(\d{14}_[a-z0-9_]+)(?:\.sql)?\b/giu)) {
    const name = `${match[1]}.sql`;
    if (allowedSet.has(name)) applying = name;
  }
  // The last migration explicitly being applied is the failing candidate.
  // Dry-run output does not use that marker, so fall back to the first known
  // repository migration mentioned in the CLI's ordered plan.
  if (applying) return applying;
  return allowed
    .map((name) => ({ name, position: Math.min(
      ...[text.indexOf(name), text.indexOf(name.slice(0, -4))].filter((value) => value >= 0),
    ) }))
    .filter(({ position }) => Number.isFinite(position))
    .sort((left, right) => left.position - right.position)[0]?.name;
}

function sqlstateFrom(text: string, failure: unknown) {
  const candidates: string[] = [];
  if (failure && typeof failure === "object") {
    const record = failure as Record<string, unknown>;
    if (typeof record.code === "string") candidates.push(record.code.toUpperCase());
    if (record.cause && typeof record.cause === "object") {
      const code = (record.cause as Record<string, unknown>).code;
      if (typeof code === "string") candidates.push(code.toUpperCase());
    }
  }
  for (const expression of [
    /\bSQLSTATE[\s:=()"']+([0-9A-Z]{5})\b/giu,
    /["'](?:sqlstate|sql_state)["']\s*:\s*["']([0-9A-Z]{5})["']/giu,
    /["']code["']\s*:\s*["']([0-9A-Z]{5})["']/giu,
  ]) {
    for (const match of text.matchAll(expression)) candidates.push(match[1].toUpperCase());
  }
  return candidates.find((value) => sqlstateCategories.has(value));
}

function categoryFrom(text: string, sqlstate?: string): StagingMigrationCategory {
  if (sqlstate) return sqlstateCategories.get(sqlstate) ?? "unknown";
  const normalized = text.toLowerCase();
  if (/password authentication|authentication failed|failed sasl|scram/.test(normalized)) return "authentication";
  if (/certificate|unknown authority|x509|tls handshake|sslrootcert|sslmode/.test(normalized)) return "tls";
  if (/supavisor|pgbouncer|pooler|prepared statement/.test(normalized)) return "pooler";
  if (/statement timeout|context deadline|timed out|timeout expired/.test(normalized)) return "timeout";
  if (/migration history|remote migration|migration versions|schema_migrations/.test(normalized)) return "history";
  if (/unexpected eof|connection (?:reset|refused|terminated|closed)|dial (?:tcp|error)|network/.test(normalized)) return "transport";
  if (/applying migration|at statement|database error|failed to execute/.test(normalized)) return "statement";
  return "unknown";
}

/**
 * Reduces an untrusted CLI/process failure to an allowlisted diagnostic. The
 * returned value deliberately contains no database message, stdout or stderr.
 */
export function stagingMigrationDiagnostic(
  phase: StagingMigrationPhase,
  failure: unknown,
  allowedMigrationNames: readonly string[],
): StagingMigrationDiagnostic {
  const text = failureOutputText(failure);
  const sqlstate = sqlstateFrom(text, failure);
  const migration = migrationFrom(text, allowedMigrationNames);
  const connection = connectionFrom(failure);
  return Object.freeze({
    phase,
    category: categoryFrom(text, sqlstate),
    ...(connection ? { connection } : {}),
    ...(migration ? { migration } : {}),
    ...(sqlstate ? { sqlstate } : {}),
  });
}

export function formatStagingMigrationDiagnostic(diagnostic: StagingMigrationDiagnostic) {
  return [
    `phase=${diagnostic.phase}`,
    `category=${diagnostic.category}`,
    ...(diagnostic.connection ? [`connection=${diagnostic.connection}`] : []),
    ...(diagnostic.migration ? [`migration=${diagnostic.migration}`] : []),
    ...(diagnostic.sqlstate ? [`sqlstate=${diagnostic.sqlstate}`] : []),
  ].join(" ");
}
