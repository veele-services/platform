import { NextResponse } from "next/server";
import { listBillingExportRows } from "@/app/actions/platform-accelerators";

function csvCell(value: string | number | null | undefined): string {
  const raw = value === null || value === undefined ? "" : String(value);
  return `"${raw.replaceAll('"', '""')}"`;
}

function csvRows(
  rows: Awaited<ReturnType<typeof listBillingExportRows>>,
): string {
  const header = [
    "tenant_id",
    "tenant_slug",
    "tenant_name",
    "tenant_status",
    "plan_key",
    "plan_name",
    "subscription_status",
    "source",
    "starts_at",
    "current_period_starts_at",
    "current_period_ends_at",
    "canceled_at",
    "billing_reference",
    "manual_billing_notes",
    "updated_at",
  ];

  const body = rows.map((row) => [
    row.tenantId,
    row.tenantSlug,
    row.tenantName,
    row.tenantStatus,
    row.planKey,
    row.planName,
    row.subscriptionStatus,
    row.source,
    row.startsAt,
    row.currentPeriodStartsAt ?? "",
    row.currentPeriodEndsAt ?? "",
    row.canceledAt ?? "",
    row.billingReference ?? "",
    row.manualBillingNotes ?? "",
    row.updatedAt,
  ]);

  return [header.map(csvCell).join(","), ...body.map((row) => row.map(csvCell).join(","))].join("\n");
}

export async function GET(): Promise<NextResponse> {
  const rows = await listBillingExportRows();
  const generatedAt = new Date().toISOString();

  return new NextResponse(csvRows(rows), {
    headers: {
      "Content-Disposition": `attachment; filename="fieldgrid-billing-subscriptions-${generatedAt.slice(0, 10)}.csv"`,
      "Content-Type": "text/csv; charset=utf-8",
      "Cache-Control": "private, no-store",
    },
  });
}
