import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, ArrowRight, Inbox } from "lucide-react";
import { ForbiddenPage } from "@/components/layout/ForbiddenPage";
import {
  TenantCommandBar,
  TenantPageHeader,
  TenantPageShell,
  TenantWorkbenchLayout,
  TenantWorkbenchPanel,
} from "@/components/tenant-ui";
import { hasPermission } from "@/lib/auth/permissions";
import { listInventoryIssues } from "@/app/actions/inventory-followup";

export const metadata: Metadata = {
  title: "Inventarisstoringen",
};

type Props = {
  searchParams: Promise<{ status?: string; itemId?: string }>;
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

  const { status = "open", itemId } = await searchParams;
  const itemQuery = itemId ? `&itemId=${encodeURIComponent(itemId)}` : "";
  const issues = await listInventoryIssues({ status, itemId });

  const urgentCount = issues.filter((issue) => issue.severity === "urgent" || issue.severity === "high").length;
  const openCount = issues.filter((issue) => !["resolved", "cancelled", "unresolvable"].includes(issue.status)).length;

  return (
    <TenantPageShell size="wide">
      <TenantPageHeader
        title="Inventarisstoringen"
        description="Review-inbox voor defecten, onderhoudsopvolging en leverancieracties."
        breadcrumbs={[{ label: "Inventarisbeheer", href: "/inventory" }, { label: "Storingen" }]}
        badges={
          urgentCount > 0 ? (
            <span className="rounded bg-red-50 px-2 py-1 text-xs font-semibold text-red-700">
              {urgentCount} urgent/hoog
            </span>
          ) : null
        }
        meta={<span>{openCount} open in huidige selectie</span>}
      />

      <TenantCommandBar
        title="Ticketinbox"
        description="Filter op werkvoorraad en open een melding om status, bewijs en onderhoud te reviewen."
        filters={
          <div className="flex flex-wrap gap-2 text-sm">
            {[["open", "Open"], ["all", "Alles"], ["resolved", "Opgelost"]].map(([value, label]) => (
              <Link
                key={value}
                href={`/inventory/issues?status=${value}${itemQuery}`}
                className="rounded-md border px-3 py-2 font-medium"
                style={{ borderColor: status === value ? "#0F766E" : "#CBD5E1", color: status === value ? "#0F766E" : "#334155" }}
              >
                {label}
              </Link>
            ))}
          </div>
        }
      />

      <TenantWorkbenchLayout
        aside={
          <TenantWorkbenchPanel title="Reviewregels" description="Gebruik iedere melding als ticket met status, bewijs en eventuele onderhoudsactie.">
            <div className="space-y-3 px-4 py-4 text-sm text-muted-foreground">
              <ReviewStep label="1. Intake" value="Controleer locatie, prioriteit en omschrijving." />
              <ReviewStep label="2. Opvolging" value="Zet status naar in behandeling of wacht op leverancier." />
              <ReviewStep label="3. Afronding" value="Leg oplossing, bewijs en onderhoud vast." />
            </div>
          </TenantWorkbenchPanel>
        }
      >
        <TenantWorkbenchPanel
          title="Meldingen"
          description={issues.length === 0 ? "Geen tickets in deze selectie." : `${issues.length} ticket${issues.length === 1 ? "" : "s"} gevonden.`}
        >
          {issues.length === 0 ? (
            <div className="flex items-center gap-3 px-5 py-8 text-sm text-muted-foreground">
              <Inbox className="h-5 w-5" />
              Geen inventarisstoringen gevonden.
            </div>
          ) : (
            <div className="divide-y divide-border">
              {issues.map((issue) => {
                const tone = issueTone(issue.severity);
                return (
                  <Link key={issue.id} href={`/inventory/issues/${issue.id}`} className="block px-5 py-4 hover:bg-slate-50">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-semibold text-foreground">{issue.inventoryCode} - {issue.inventoryName}</p>
                          <span className="rounded px-2 py-0.5 text-xs font-semibold" style={{ backgroundColor: tone.bg, color: tone.color }}>
                            {SEVERITY_LABELS[issue.severity] ?? issue.severity}
                          </span>
                          <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">
                            {STATUS_LABELS[issue.status] ?? issue.status}
                          </span>
                        </div>
                        <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{issue.description}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {issue.objectName ?? issue.personnelName ?? "Geen locatie"}{issue.assignmentCode ? ` - werkbon ${issue.assignmentCode}` : ""}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
                        {formatDateTime(issue.createdAt)}
                        <ArrowRight className="h-3.5 w-3.5" />
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </TenantWorkbenchPanel>
      </TenantWorkbenchLayout>
    </TenantPageShell>
  );
}

function ReviewStep({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-muted/30 px-3 py-2">
      <div className="flex items-center gap-2 font-medium text-foreground">
        <AlertTriangle className="h-3.5 w-3.5 text-amber-700" />
        {label}
      </div>
      <p className="mt-1 text-xs leading-5">{value}</p>
    </div>
  );
}
