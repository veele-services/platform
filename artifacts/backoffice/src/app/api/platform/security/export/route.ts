import { NextResponse } from "next/server";
import {
  listPlatformSecurityDashboard,
  type PlatformSecurityDashboardFilters,
  type PlatformSecurityEventRow,
} from "@/app/actions/platform";

function csvCell(value: string | number | null | undefined): string {
  const raw = value === null || value === undefined ? "" : String(value);
  return `"${raw.replaceAll('"', '""')}"`;
}

function metadataCell(event: PlatformSecurityEventRow): string {
  if (!event.metadata) return "";
  return JSON.stringify(event.metadata);
}

function csvRows(events: PlatformSecurityEventRow[]): string {
  const header = [
    "created_at",
    "severity",
    "scope",
    "categories",
    "denial_type",
    "tenant_id",
    "tenant_name",
    "actor_id",
    "grant_id",
    "source",
    "action",
    "resource",
    "resource_id",
    "metadata",
  ];

  const rows = events.map((event) => [
    event.createdAt,
    event.severity,
    event.scope,
    event.categories.join("|"),
    event.denialType ?? "",
    event.tenantId ?? "",
    event.tenantName,
    event.actorId,
    event.grantId ?? "",
    event.source,
    event.action,
    event.resource ?? "",
    event.resourceId ?? "",
    metadataCell(event),
  ]);

  return [
    header.map(csvCell).join(","),
    ...rows.map((row) => row.map(csvCell).join(",")),
  ].join("\n");
}

function filterFromSearchParams(searchParams: URLSearchParams): PlatformSecurityDashboardFilters {
  return {
    tenantId: searchParams.get("tenantId") ?? undefined,
    actorId: searchParams.get("actorId") ?? undefined,
    eventType: searchParams.get("eventType") as PlatformSecurityDashboardFilters["eventType"],
    scope: searchParams.get("scope") as PlatformSecurityDashboardFilters["scope"],
    resource: searchParams.get("resource") ?? undefined,
    dateFrom: searchParams.get("dateFrom") ?? undefined,
    dateTo: searchParams.get("dateTo") ?? undefined,
    severity: searchParams.get("severity") as PlatformSecurityDashboardFilters["severity"],
    supportGrantId: searchParams.get("supportGrantId") ?? undefined,
    limit: 500,
  };
}

export async function GET(request: Request): Promise<NextResponse> {
  const dashboard = await listPlatformSecurityDashboard(filterFromSearchParams(new URL(request.url).searchParams));
  const csv = csvRows(dashboard.events);

  return new NextResponse(csv, {
    headers: {
      "Content-Disposition": `attachment; filename="fieldgrid-security-audit-${dashboard.generatedAt.slice(0, 10)}.csv"`,
      "Content-Type": "text/csv; charset=utf-8",
      "Cache-Control": "private, no-store",
    },
  });
}
