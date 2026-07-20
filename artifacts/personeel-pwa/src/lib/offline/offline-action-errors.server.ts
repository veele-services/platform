import { randomUUID } from "node:crypto";

import type {
  OfflineActionFailureCategory,
  OfflineActionFailureResult,
} from "./offline-action-contract";

const TRANSIENT_SQLSTATES = new Set([
  "40001",
  "40P01",
  "55P03",
  "53300",
  "57P01",
  "57P02",
  "57P03",
]);

type FailureOptions = {
  category: OfflineActionFailureCategory;
  code: string;
  conflictVersion?: number | null;
  message: string;
  retryAfterMs?: number | null;
  sqlState?: string | null;
  status?: number | null;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

function safeCode(value: unknown): string {
  const normalized = String(value ?? "").trim().toUpperCase();
  return /^[A-Z0-9_]{2,64}$/u.test(normalized) ? normalized : "UNCLASSIFIED_FAILURE";
}

function safeStatus(value: unknown): number | null {
  const status = Number(value);
  return Number.isInteger(status) && status >= 100 && status <= 599 ? status : null;
}

function errorChain(value: unknown): Record<string, unknown>[] {
  const records: Record<string, unknown>[] = [];
  let current = asRecord(value);
  for (let depth = 0; depth < 4 && Object.keys(current).length > 0; depth += 1) {
    records.push(current);
    current = asRecord(current.cause);
  }
  return records;
}

function isExpectedVersionConflict(code: string, message: string): boolean {
  return code === "EXPECTED_VERSION_CONFLICT"
    || /conflict|expected[- _]?version|stale|werkbon is aangepast|gelijktijdig|verouderde versie/iu.test(message);
}

function isTransientSqlState(sqlState: string): boolean {
  return TRANSIENT_SQLSTATES.has(sqlState) || sqlState.startsWith("08");
}

function transientSemanticCode(sqlState: string): string {
  if (sqlState === "40001") return "serialization_failure";
  if (sqlState === "40P01") return "deadlock_detected";
  if (sqlState === "55P03") return "lock_not_available";
  if (sqlState === "53300") return "too_many_connections";
  if (["57P01", "57P02", "57P03"].includes(sqlState)) return "database_restarting";
  if (sqlState.startsWith("08")) return "connection_exception";
  return "temporarily_unavailable";
}

export function createOfflineActionFailure({
  category,
  code,
  conflictVersion = null,
  message,
  retryAfterMs = null,
  sqlState = null,
  status = null,
}: FailureOptions): OfflineActionFailureResult {
  return {
    success: false,
    error: message,
    failure: {
      category,
      code: safeCode(code).toLowerCase(),
      conflictVersion,
      diagnosticId: `offline-${randomUUID()}`,
      retryAfterMs,
      retryable: category === "transient",
      sqlState: sqlState && /^[0-9A-Z]{5}$/u.test(sqlState) ? sqlState : null,
      status,
    },
  };
}

export function permanentOfflineActionFailure(
  message: string,
  code: string,
): OfflineActionFailureResult {
  return createOfflineActionFailure({ category: "permanent", code, message });
}

export function normalizeOfflineServerActionError(
  error: unknown,
  fallbackMessage = "Bijwerken mislukt. Probeer het later opnieuw.",
): OfflineActionFailureResult {
  const record = asRecord(error);
  const chain = errorChain(error);
  const sqlState = safeCode(chain.find((entry) => entry.code)?.code);
  const internalMessage = chain
    .flatMap((entry) => [entry.message, entry.detail, entry.hint])
    .filter((value): value is string => typeof value === "string")
    .join(" ");
  const status = safeStatus(record.status ?? record.statusCode);
  const conflictVersion = Number(record.conflictVersion);

  if (isExpectedVersionConflict(sqlState, internalMessage)) {
    return createOfflineActionFailure({
      category: "conflict",
      code: "expected_version_conflict",
      conflictVersion: Number.isInteger(conflictVersion) && conflictVersion >= 0 ? conflictVersion : null,
      message: "Conflict: deze werkbon is aangepast. Vernieuw en probeer opnieuw.",
      sqlState: sqlState === "UNCLASSIFIED_FAILURE" ? null : sqlState,
      status,
    });
  }

  if (
    isTransientSqlState(sqlState)
    || [408, 425, 429, 502, 503, 504].includes(status ?? 0)
    || /connection|temporar|timeout|database unavailable|server unavailable/iu.test(internalMessage)
  ) {
    return createOfflineActionFailure({
      category: "transient",
      code: transientSemanticCode(sqlState),
      message: fallbackMessage,
      sqlState: sqlState === "UNCLASSIFIED_FAILURE" ? null : sqlState,
      status,
    });
  }

  if (sqlState === "42501") {
    return createOfflineActionFailure({
      category: "permanent",
      code: "authorization_denied",
      message: "Geen toegang tot deze werkbon.",
      sqlState,
      status,
    });
  }

  return createOfflineActionFailure({
    category: "permanent",
    code: "database_failure",
    message: fallbackMessage,
    sqlState: sqlState === "UNCLASSIFIED_FAILURE" ? null : sqlState,
    status,
  });
}
