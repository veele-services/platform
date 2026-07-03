import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, ArrowLeft } from "lucide-react";
import { ForbiddenPage } from "@/components/layout/ForbiddenPage";
import { hasPermission } from "@/lib/auth/permissions";
import { listInventoryIssues } from "@/app/actions/inventory-followup";

export const metadata: Metadata = {
  title: "Inventarisstoringen",
};

type Props = {
  searchParams: Promise<{ status?: string }>;
};

const STATUS_LABELS: Record<string, string> = {
  new: "Nieuw",
  in_progress: "In behandeling",
  waiting_supplier: "Wacht op leverancier",
  resolved: "Opgelost",
  unresolvable: "Niet op te lossen",
  cancelled: "Geannuleerd",
};

const SEVERITY_LABELS: Record<string, string> = {
  low: "Laag",
  normal: "Normaal",
  high: "Hoog",
  urgent: "Urgent",
};

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString("nl-NL");
}

function issueTone(severity: string) {
  if (severity === "urgent" || severity === "high") return { bg: "#FEF2F2", color: "#B91C1C" };
  return { bg: "#F1F5F9", color: "#475569" };
}

export default async function InventoryIssuesPage({ searchParams }: Props) {
  const canRead = await hasPermission("inventory", "view");
  if (!canRead) return <ForbiddenPage resource="inventory" action="view" />;

  const { status = "open" } = await searchParams;
  const issues = await listInventoryIssues({ status });

  return (
    <div className="mx-auto flex w-full max-w-[1500px] flex-col gap-6 p-8">
      <Link href="/inventory" className="inline-flex items-center gap-1 text-sm hover:underline" style={{ color: "#64748B" }}>
        <ArrowLeft className="h-4 w-4" />
        Inventarisbeheer
      </Link>

      <div className="veele-card flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5" style={{ color: "#B45309" }} />
            <h1 className="font-heading text-2xl font-bold" style={{ color: "#081D3A" }}>Inventarisstoringen</h1>
          </div>
          <p className="mt-1 text-sm" style={{ color: "#64748B" }}>
            Open meldingen, defecten en onderhoudsopvolging per tenant.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-sm">
          {[["open", "Open"], ["all", "Alles"], ["resolved", "Opgelost"]].map(([value, label]) => (
            <Link key={value} href={`/inventory/issues?status=${value}`} className="rounded-md border px-3 py-2 font-medium" style={{ borderColor: status === value ? "#0F766E" : "#CBD5E1", color: status === value ? "#0F766E" : "#334155" }}>
              {label}
            </Link>
          ))}
        </div>
      </div>

      <div className="veele-card overflow-hidden p-0">
        {issues.length === 0 ? (
          <p className="px-5 py-8 text-sm" style={{ color: "#64748B" }}>Geen inventarisstoringen gevonden.</p>
        ) : (
          <div className="divide-y" style={{ borderColor: "#E2E8F0" }}>
            {issues.map((issue) => {
              const tone = issueTone(issue.severity);
              return (
                <Link key={issue.id} href={`/inventory/issues/${issue.id}`} className="block px-5 py-4 hover:bg-slate-50">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold" style={{ color: "#081D3A" }}>{issue.inventoryCode} - {issue.inventoryName}</p>
                        <span className="rounded px-2 py-0.5 text-xs font-semibold" style={{ backgroundColor: tone.bg, color: tone.color }}>{SEVERITY_LABELS[issue.severity] ?? issue.severity}</span>
                        <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">{STATUS_LABELS[issue.status] ?? issue.status}</span>
                      </div>
                      <p className="mt-1 line-clamp-2 text-sm" style={{ color: "#64748B" }}>{issue.description}</p>
                      <p className="mt-1 text-xs" style={{ color: "#94A3B8" }}>
                        {issue.objectName ?? issue.personnelName ?? "Geen locatie"}{issue.assignmentCode ? ` - werkbon ${issue.assignmentCode}` : ""}
                      </p>
                    </div>
                    <p className="text-xs" style={{ color: "#94A3B8" }}>{formatDateTime(issue.createdAt)}</p>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
