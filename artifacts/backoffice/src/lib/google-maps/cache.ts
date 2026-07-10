import "server-only";

import { createHash } from "node:crypto";
import type { GoogleMapsDedupeStatus } from "./types";

type InFlightEntry<T> = {
  promise: Promise<T>;
  createdAt: number;
};

const inFlightRequests = new Map<string, InFlightEntry<unknown>>();

export function stableGoogleMapsDedupeKey(parts: Array<string | number | boolean | null | undefined>): string {
  const normalized = parts.map((part) => (part === null || part === undefined ? "" : String(part)));
  return createHash("sha256").update(normalized.join("|")).digest("hex");
}

export async function dedupeGoogleMapsRequest<T>(
  key: string,
  factory: () => Promise<T>,
  options: { maxAgeMs?: number; now?: number } = {},
): Promise<{ status: GoogleMapsDedupeStatus; value: T }> {
  const now = options.now ?? Date.now();
  const maxAgeMs = options.maxAgeMs ?? 10_000;
  const existing = inFlightRequests.get(key) as InFlightEntry<T> | undefined;

  if (existing && now - existing.createdAt <= maxAgeMs) {
    return { status: "deduped", value: await existing.promise };
  }

  const promise = factory().finally(() => {
    const current = inFlightRequests.get(key);
    if (current?.promise === promise) inFlightRequests.delete(key);
  });

  inFlightRequests.set(key, { promise, createdAt: now });
  return { status: "miss", value: await promise };
}

export function clearGoogleMapsDedupeState(): void {
  inFlightRequests.clear();
}
