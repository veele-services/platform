"use server";

import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { requirePermission } from "@/lib/auth/permissions";
import { requirePlatformAdmin } from "@/lib/auth/platform";
import { requireCurrentTenantId } from "@/lib/auth/tenant";

export type GoogleMapsUsageAggregateRow = {
  key: string;
  label: string;
  events: number;
  successes: number;
  failures: number;
  rateLimited: number;
  averageResponseMs: number | null;
};

export type GoogleMapsUsageTenantRow = {
  tenantId: string;
  tenantName: string;
  events: number;
  successes: number;
  failures: number;
  rateLimited: number;
  cacheHits: number;
  deduped: number;
  activeDays: number;
  averageResponseMs: number | null;
  estimatedSkus: string[];
  anomalyReasons: string[];
};

export type GoogleMapsUsageFailureRow = {
  tenantId: string;
  tenantName: string;
  eventType: string;
  estimatedSku: string | null;
  cacheOrDedupeStatus: string;
  responseTimeMs: number | null;
  createdAt: string;
};

export type GoogleMapsUsageDashboard = {
  generatedAt: string;
  periodStart: string;
  periodEnd: string;
  summary: {
    totalEvents: number;
    successes: number;
    failures: number;
    rateLimited: number;
    cacheHits: number;
    deduped: number;
    averageResponseMs: number | null;
  };
  tenants: GoogleMapsUsageTenantRow[];
  anomalies: GoogleMapsUsageTenantRow[];
  byEvent: GoogleMapsUsageAggregateRow[];
  byProvider: GoogleMapsUsageAggregateRow[];
  bySku: GoogleMapsUsageAggregateRow[];
  byCacheStatus: GoogleMapsUsageAggregateRow[];
  recentFailures: GoogleMapsUsageFailureRow[];
};

type RawSummaryRow = {
  total_events: unknown;
  successes: unknown;
  failures: unknown;
  rate_limited: unknown;
  cache_hits: unknown;
  deduped: unknown;
  average_response_ms: unknown;
};

type RawTenantRow = {
  tenant_id: string;
  tenant_name: string;
  events: unknown;
  successes: unknown;
  failures: unknown;
  rate_limited: unknown;
  cache_hits: unknown;
  deduped: unknown;
  active_days: unknown;
  average_response_ms: unknown;
  estimated_skus: string | null;
};

type RawAggregateRow = {
  key: string | null;
  events: unknown;
  successes: unknown;
  failures: unknown;
  rate_limited: unknown;
  average_response_ms: unknown;
};

type RawFailureRow = {
  tenant_id: string;
  tenant_name: string;
  event_type: string;
  estimated_sku: string | null;
  cache_or_dedupe_status: string;
  response_time_ms: unknown;
  created_at: string | Date;
};

function rowsFrom<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  if (result && typeof result === "object" && "rows" in result) {
    return (result as { rows: T[] }).rows;
  }
  return [];
}

function numberValue(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function nullableNumberValue(value: unknown): number | null {
  if (value == null) return null;
  const parsed = numberValue(value);
  return Number.isFinite(parsed) ? Math.round(parsed) : null;
}

function monthStart(date = new Date()): string {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1))
    .toISOString()
    .slice(0, 10);
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function splitSkuList(value: string | null): string[] {
  return (value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function aggregateLabel(key: string): string {
  const labels: Record<string, string> = {
    maps_view_opened: "Kaart geopend",
    autocomplete_request: "Adreszoekopdracht",
    autocomplete_session_started: "Autocomplete sessie gestart",
    autocomplete_selection: "Adresselectie",
    place_details_request: "Place Details",
    route_request: "Route-aanvraag",
    route_request_drive_traffic: "Autoroute met verkeer",
    route_request_bicycle: "Fietsroute",
    route_request_walk: "Wandelroute",
    route_request_transit: "OV-route",
    google_api_error: "Google API fout",
    google_api_rate_limited: "Rate limit",
    google_maps: "Google Maps Platform",
    maps_javascript_api_dynamic_map: "Maps JavaScript API - Dynamic Map",
    places_autocomplete_new: "Places API New - Autocomplete",
    places_autocomplete_session: "Places API New - Session",
    places_details_new_essentials: "Places API New - Details Essentials",
    routes_compute_routes: "Routes API - Compute Routes",
    miss: "Nieuwe aanvraag",
    hit: "Cache hit",
    cache_hit: "Cache hit",
    cache_miss: "Cache miss",
    deduped: "Samengevoegd",
    in_flight: "Gelijktijdig",
    rate_limited: "Rate limited",
    negative_cache: "Negatieve cache",
    bypass: "Direct event",
  };
  return labels[key] ?? key;
}

function mapAggregate(row: RawAggregateRow): GoogleMapsUsageAggregateRow {
  const key = row.key ?? "unknown";
  return {
    key,
    label: aggregateLabel(key),
    events: numberValue(row.events),
    successes: numberValue(row.successes),
    failures: numberValue(row.failures),
    rateLimited: numberValue(row.rate_limited),
    averageResponseMs: nullableNumberValue(row.average_response_ms),
  };
}

function anomalyReasons(row: Omit<GoogleMapsUsageTenantRow, "anomalyReasons">, averageTenantEvents: number): string[] {
  const reasons: string[] = [];
  const failureRate = row.events > 0 ? row.failures / row.events : 0;
  if (row.events >= Math.max(50, averageTenantEvents * 2)) reasons.push("Afwijkend veel events deze maand");
  if (failureRate >= 0.25 && row.failures >= 5) reasons.push("Hoge foutgraad");
  if (row.rateLimited > 0) reasons.push("Rate limiting geraakt");
  if (row.cacheHits + row.deduped === 0 && row.events >= 25) reasons.push("Geen cache/dedupe-effect zichtbaar");
  return reasons;
}

function mapFailure(row: RawFailureRow): GoogleMapsUsageFailureRow {
  return {
    tenantId: row.tenant_id,
    tenantName: row.tenant_name,
    eventType: row.event_type,
    estimatedSku: row.estimated_sku,
    cacheOrDedupeStatus: row.cache_or_dedupe_status,
    responseTimeMs: nullableNumberValue(row.response_time_ms),
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
  };
}

async function buildGoogleMapsUsageDashboard(input: {
  tenantId?: string;
}): Promise<GoogleMapsUsageDashboard> {
  const periodStart = monthStart();
  const periodEnd = today();
  const tenantPredicate = input.tenantId
    ? sql`AND usage.tenant_id = ${input.tenantId}::uuid`
    : sql``;

  const [
    summaryResult,
    tenantResult,
    eventResult,
    providerResult,
    skuResult,
    cacheResult,
    failureResult,
  ] = await Promise.all([
    db.execute(sql`
      SELECT
        count(*)::int AS total_events,
        count(*) FILTER (WHERE usage.success)::int AS successes,
        count(*) FILTER (WHERE NOT usage.success)::int AS failures,
        count(*) FILTER (WHERE usage.event_type = 'google_api_rate_limited' OR usage.cache_or_dedupe_status = 'rate_limited')::int AS rate_limited,
        count(*) FILTER (WHERE usage.cache_or_dedupe_status IN ('hit', 'cache_hit'))::int AS cache_hits,
        count(*) FILTER (WHERE usage.cache_or_dedupe_status IN ('deduped', 'in_flight'))::int AS deduped,
        round(avg(usage.response_time_ms))::int AS average_response_ms
      FROM google_maps_usage_events usage
      WHERE usage.request_date >= ${periodStart}::date
        AND usage.request_date <= ${periodEnd}::date
        ${tenantPredicate}
    `),
    db.execute(sql`
      SELECT
        usage.tenant_id::text AS tenant_id,
        tenants.name AS tenant_name,
        count(*)::int AS events,
        count(*) FILTER (WHERE usage.success)::int AS successes,
        count(*) FILTER (WHERE NOT usage.success)::int AS failures,
        count(*) FILTER (WHERE usage.event_type = 'google_api_rate_limited' OR usage.cache_or_dedupe_status = 'rate_limited')::int AS rate_limited,
        count(*) FILTER (WHERE usage.cache_or_dedupe_status IN ('hit', 'cache_hit'))::int AS cache_hits,
        count(*) FILTER (WHERE usage.cache_or_dedupe_status IN ('deduped', 'in_flight'))::int AS deduped,
        count(DISTINCT usage.request_date)::int AS active_days,
        round(avg(usage.response_time_ms))::int AS average_response_ms,
        string_agg(DISTINCT usage.estimated_sku, ', ' ORDER BY usage.estimated_sku) AS estimated_skus
      FROM google_maps_usage_events usage
      JOIN tenants ON tenants.id = usage.tenant_id
      WHERE usage.request_date >= ${periodStart}::date
        AND usage.request_date <= ${periodEnd}::date
        ${tenantPredicate}
      GROUP BY usage.tenant_id, tenants.name
      ORDER BY events DESC, tenant_name ASC
      LIMIT 20
    `),
    db.execute(sql`
      SELECT
        usage.event_type AS key,
        count(*)::int AS events,
        count(*) FILTER (WHERE usage.success)::int AS successes,
        count(*) FILTER (WHERE NOT usage.success)::int AS failures,
        count(*) FILTER (WHERE usage.event_type = 'google_api_rate_limited' OR usage.cache_or_dedupe_status = 'rate_limited')::int AS rate_limited,
        round(avg(usage.response_time_ms))::int AS average_response_ms
      FROM google_maps_usage_events usage
      WHERE usage.request_date >= ${periodStart}::date
        AND usage.request_date <= ${periodEnd}::date
        ${tenantPredicate}
      GROUP BY usage.event_type
      ORDER BY events DESC, key ASC
    `),
    db.execute(sql`
      SELECT
        usage.provider AS key,
        count(*)::int AS events,
        count(*) FILTER (WHERE usage.success)::int AS successes,
        count(*) FILTER (WHERE NOT usage.success)::int AS failures,
        count(*) FILTER (WHERE usage.event_type = 'google_api_rate_limited' OR usage.cache_or_dedupe_status = 'rate_limited')::int AS rate_limited,
        round(avg(usage.response_time_ms))::int AS average_response_ms
      FROM google_maps_usage_events usage
      WHERE usage.request_date >= ${periodStart}::date
        AND usage.request_date <= ${periodEnd}::date
        ${tenantPredicate}
      GROUP BY usage.provider
      ORDER BY events DESC, key ASC
    `),
    db.execute(sql`
      SELECT
        COALESCE(usage.estimated_sku, 'unknown') AS key,
        count(*)::int AS events,
        count(*) FILTER (WHERE usage.success)::int AS successes,
        count(*) FILTER (WHERE NOT usage.success)::int AS failures,
        count(*) FILTER (WHERE usage.event_type = 'google_api_rate_limited' OR usage.cache_or_dedupe_status = 'rate_limited')::int AS rate_limited,
        round(avg(usage.response_time_ms))::int AS average_response_ms
      FROM google_maps_usage_events usage
      WHERE usage.request_date >= ${periodStart}::date
        AND usage.request_date <= ${periodEnd}::date
        ${tenantPredicate}
      GROUP BY COALESCE(usage.estimated_sku, 'unknown')
      ORDER BY events DESC, key ASC
    `),
    db.execute(sql`
      SELECT
        usage.cache_or_dedupe_status AS key,
        count(*)::int AS events,
        count(*) FILTER (WHERE usage.success)::int AS successes,
        count(*) FILTER (WHERE NOT usage.success)::int AS failures,
        count(*) FILTER (WHERE usage.event_type = 'google_api_rate_limited' OR usage.cache_or_dedupe_status = 'rate_limited')::int AS rate_limited,
        round(avg(usage.response_time_ms))::int AS average_response_ms
      FROM google_maps_usage_events usage
      WHERE usage.request_date >= ${periodStart}::date
        AND usage.request_date <= ${periodEnd}::date
        ${tenantPredicate}
      GROUP BY usage.cache_or_dedupe_status
      ORDER BY events DESC, key ASC
    `),
    db.execute(sql`
      SELECT
        usage.tenant_id::text AS tenant_id,
        tenants.name AS tenant_name,
        usage.event_type,
        usage.estimated_sku,
        usage.cache_or_dedupe_status,
        usage.response_time_ms,
        usage.created_at
      FROM google_maps_usage_events usage
      JOIN tenants ON tenants.id = usage.tenant_id
      WHERE usage.request_date >= ${periodStart}::date
        AND usage.request_date <= ${periodEnd}::date
        AND NOT usage.success
        ${tenantPredicate}
      ORDER BY usage.created_at DESC
      LIMIT 10
    `),
  ]);

  const [summaryRow] = rowsFrom<RawSummaryRow>(summaryResult);
  const summary = {
    totalEvents: numberValue(summaryRow?.total_events),
    successes: numberValue(summaryRow?.successes),
    failures: numberValue(summaryRow?.failures),
    rateLimited: numberValue(summaryRow?.rate_limited),
    cacheHits: numberValue(summaryRow?.cache_hits),
    deduped: numberValue(summaryRow?.deduped),
    averageResponseMs: nullableNumberValue(summaryRow?.average_response_ms),
  };

  const rawTenants = rowsFrom<RawTenantRow>(tenantResult).map((row) => ({
    tenantId: row.tenant_id,
    tenantName: row.tenant_name,
    events: numberValue(row.events),
    successes: numberValue(row.successes),
    failures: numberValue(row.failures),
    rateLimited: numberValue(row.rate_limited),
    cacheHits: numberValue(row.cache_hits),
    deduped: numberValue(row.deduped),
    activeDays: numberValue(row.active_days),
    averageResponseMs: nullableNumberValue(row.average_response_ms),
    estimatedSkus: splitSkuList(row.estimated_skus),
  }));
  const averageTenantEvents =
    rawTenants.length > 0
      ? rawTenants.reduce((sum, row) => sum + row.events, 0) / rawTenants.length
      : 0;
  const tenants = rawTenants.map((row) => ({
    ...row,
    anomalyReasons: anomalyReasons(row, averageTenantEvents),
  }));

  return {
    generatedAt: new Date().toISOString(),
    periodStart,
    periodEnd,
    summary,
    tenants,
    anomalies: tenants.filter((tenant) => tenant.anomalyReasons.length > 0).slice(0, 8),
    byEvent: rowsFrom<RawAggregateRow>(eventResult).map(mapAggregate),
    byProvider: rowsFrom<RawAggregateRow>(providerResult).map(mapAggregate),
    bySku: rowsFrom<RawAggregateRow>(skuResult).map(mapAggregate),
    byCacheStatus: rowsFrom<RawAggregateRow>(cacheResult).map(mapAggregate),
    recentFailures: rowsFrom<RawFailureRow>(failureResult).map(mapFailure),
  };
}

export async function getPlatformGoogleMapsUsageDashboard(): Promise<GoogleMapsUsageDashboard> {
  await requirePlatformAdmin();
  return buildGoogleMapsUsageDashboard({});
}

export async function getTenantGoogleMapsUsageDashboard(): Promise<GoogleMapsUsageDashboard> {
  await requirePermission("planning", "read");
  const tenantId = await requireCurrentTenantId();
  return buildGoogleMapsUsageDashboard({ tenantId });
}
