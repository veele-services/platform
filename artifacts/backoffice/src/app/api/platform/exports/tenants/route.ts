import { NextResponse } from "next/server";
import { listPlatformTenantHealthForExport, type PlatformAcceleratorTenantHealthRow } from "@/app/actions/platform-accelerators";

function csvCell(value: string | number | null | undefined): string {
  const raw = value === null || value === undefined ? "" : String(value);
  return `"${raw.replaceAll('"', '""')}"`;
}

function signalCell(row: PlatformAcceleratorTenantHealthRow): string {
  return row.signals.map((signal) => `${signal.id}:${signal.status}`).join("|");
}

function csvRows(rows: PlatformAcceleratorTenantHealthRow[]): string {
  const header = [
    "tenant_id",
    "tenant_slug",
    "tenant_name",
    "tenant_status",
    "plan_key",
    "subscription_status",
    "primary_domain",
    "health_score",
    "health_status",
    "domains",
    "verified_domains",
    "sent_emails_7d",
    "failed_emails_7d",
    "enabled_modules",
    "active_users",
    "error_events_7d",
    "documents",
    "storage_bytes",
    "legacy_storage_paths",
    "smoke_status",
    "signals",
  ];

  const body = rows.map((row) => [
    row.tenantId,
    row.tenantSlug,
    row.tenantName,
    row.tenantStatus,
    row.planKey,
    row.subscriptionStatus ?? "",
    row.primaryDomain ?? "",
    row.score,
    row.status,
    row.metrics.domains,
    row.metrics.verifiedDomains,
    row.metrics.sentEmails7d,
    row.metrics.failedEmails7d,
    row.metrics.enabledModules,
    row.metrics.activeUsers,
    row.metrics.errorEvents7d,
    row.metrics.documents,
    row.metrics.storageBytes,
    row.metrics.legacyStoragePaths,
    row.metrics.latestSmokeStatus,
    signalCell(row),
  ]);

  return [header.map(csvCell).join(","), ...body.map((row) => row.map(csvCell).join(","))].join("\n");
}

export async function GET(): Promise<NextResponse> {
  const rows = await listPlatformTenantHealthForExport();
  const generatedAt = new Date().toISOString();

  return new NextResponse(csvRows(rows), {
    headers: {
      "Content-Disposition": `attachment; filename="fieldgrid-platform-tenants-${generatedAt.slice(0, 10)}.csv"`,
      "Content-Type": "text/csv; charset=utf-8",
      "Cache-Control": "private, no-store",
    },
  });
}
