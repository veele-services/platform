export function sanitizeGoogleMapsMetricMetadata(
  metadata: Record<string, unknown> | null | undefined,
): Record<string, string | number | boolean | null> {
  const sanitized: Record<string, string | number | boolean | null> = {};
  for (const [key, value] of Object.entries(metadata ?? {})) {
    if (
      /address|api.?key|secret|token|polyline|payload|place.?id|query|input|origin|destination|coordinate|lat|lng|postal|city|street/i.test(
        key,
      )
    ) {
      continue;
    }
    if (
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean" ||
      value === null
    ) {
      sanitized[key] = value;
    }
  }
  return sanitized;
}

