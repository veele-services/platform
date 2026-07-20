export type OfflineFailureKind = "transient" | "permanent" | "conflict";

export type OfflineFailureClassification = {
  code: string;
  diagnosticId: string | null;
  kind: OfflineFailureKind;
  message: string;
  retryAfterMs: number | null;
  sqlState: string | null;
  status: number | null;
};

const TRANSIENT_HTTP_STATUSES = new Set([408, 425, 429, 502, 503, 504]);
const PERMANENT_HTTP_STATUSES = new Set([400, 401, 403, 404, 409, 410, 422]);
const TRANSIENT_CODES = new Set([
  "network_error",
  "fetch_failed",
  "request_timeout",
  "temporarily_unavailable",
  "server_unavailable",
  "rate_limited",
  "40p01",
  "55p03",
  "53300",
  "53p01",
  "53p02",
  "53p03",
  "57014",
  "57p01",
  "57p02",
  "57p03",
  "08000",
  "08001",
  "08003",
  "08004",
  "08006",
  "08p01",
]);
const CONFLICT_CODES = new Set([
  "conflict",
  "expected_version_conflict",
  "stale_version",
]);
const PERMANENT_CODES = new Set([
  "authentication_required",
  "authorization_denied",
  "invalid_payload",
  "not_found",
  "session_expired",
  "business_rule_rejected",
  "tenant_mismatch",
  "mutation_superseded",
]);

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

function asStatus(value: unknown): number | null {
  const status = Number(value);
  return Number.isInteger(status) && status >= 100 && status <= 599 ? status : null;
}

function sanitizeMessage(value: unknown): string {
  const source = typeof value === "string" && value.trim()
    ? value.trim()
    : "Synchronisatie mislukt";
  return source
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]{12,}/giu, "Bearer [redacted]")
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/gu, "[redacted-jwt]")
    .replace(/(password|token|secret|authorization)\s*[:=]\s*\S+/giu, "$1=[redacted]")
    .slice(0, 240);
}

function retryAfterMs(record: Record<string, unknown>): number | null {
  const direct = Number(record.retryAfterMs);
  if (Number.isFinite(direct) && direct >= 0) return direct;
  const seconds = Number(record.retryAfterSeconds);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1_000;
  return null;
}

export function classifyOfflineSyncFailure(
  value: unknown,
  source: "exception" | "result" = value instanceof Error ? "exception" : "result",
): OfflineFailureClassification {
  const record = asRecord(value);
  const nested = asRecord(record.error);
  const structured = asRecord(record.failure);
  const status = asStatus(
    structured.status ?? record.status ?? record.statusCode ?? nested.status ?? nested.statusCode,
  );
  const rawCode = String(structured.code ?? record.code ?? nested.code ?? "").trim().toLowerCase();
  const rawSqlState = String(structured.sqlState ?? "").trim().toUpperCase();
  const sqlState = /^[0-9A-Z]{5}$/u.test(rawSqlState) ? rawSqlState : null;
  const rawDiagnosticId = String(structured.diagnosticId ?? "").trim();
  const diagnosticId = /^offline-[0-9a-f-]{36}$/iu.test(rawDiagnosticId) ? rawDiagnosticId : null;
  const message = sanitizeMessage(
    typeof record.error === "string"
      ? record.error
      : record.message ?? nested.message ?? (value instanceof Error ? value.message : value),
  );
  const normalizedMessage = message.toLowerCase();
  const retryAfter = retryAfterMs(structured) ?? retryAfterMs(record) ?? retryAfterMs(nested);

  if (
    structured.category === "conflict"
    || status === 409
    || CONFLICT_CODES.has(rawCode)
    || /\b(conflict|stale|expected[- ]?version|gelijktijdig|verouderde versie)\b/iu.test(message)
  ) {
    return { code: rawCode || "expected_version_conflict", diagnosticId, kind: "conflict", message, retryAfterMs: null, sqlState, status };
  }

  if (
    structured.retryable === true
    || structured.category === "transient"
    || record.retryable === true
    || nested.retryable === true
    || (status !== null && TRANSIENT_HTTP_STATUSES.has(status))
    || TRANSIENT_CODES.has(rawCode)
    || rawCode.startsWith("08")
    || (rawCode === "40001" && !/stale|version/iu.test(message))
    || value instanceof TypeError
    || value instanceof DOMException && ["AbortError", "TimeoutError"].includes(value.name)
    || /network|fetch failed|failed to fetch|timeout|timed out|connection|temporar|tijdelijk|server unavailable|database unavailable|rate limit/iu.test(normalizedMessage)
  ) {
    return { code: rawCode || (status ? `http_${status}` : "transport_failure"), diagnosticId, kind: "transient", message, retryAfterMs: retryAfter, sqlState, status };
  }

  if (
    structured.category === "permanent"
    || record.retryable === false
    || nested.retryable === false
    || (status !== null && PERMANENT_HTTP_STATUSES.has(status))
    || PERMANENT_CODES.has(rawCode)
    || /niet ingelogd|authentication|authorization|geen toegang|ongeldig|invalid|niet gevonden|not found|afgesloten|business rule|tenant/iu.test(normalizedMessage)
  ) {
    const code = rawCode || (status ? `http_${status}` : "permanent_rejection");
    return { code, diagnosticId, kind: "permanent", message, retryAfterMs: null, sqlState, status };
  }

  if (source === "exception") {
    return { code: rawCode || "unclassified_transport_failure", diagnosticId, kind: "transient", message, retryAfterMs: retryAfter, sqlState, status };
  }

  return { code: rawCode || "permanent_rejection", diagnosticId, kind: "permanent", message, retryAfterMs: null, sqlState, status };
}

export function computeOfflineRetryDelayMs({
  attempt,
  random = Math.random,
  retryAfterMs = null,
  status = null,
}: {
  attempt: number;
  random?: () => number;
  retryAfterMs?: number | null;
  status?: number | null;
}): number {
  const floor = status === 429 ? 2_000 : 1_000;
  const exponential = Math.min(60_000, floor * 2 ** Math.max(0, Math.min(attempt - 1, 8)));
  const boundedHint = retryAfterMs === null ? 0 : Math.min(5 * 60_000, Math.max(0, retryAfterMs));
  const jitter = 0.75 + Math.min(1, Math.max(0, random())) * 0.5;
  return Math.max(boundedHint, Math.round(exponential * jitter));
}
