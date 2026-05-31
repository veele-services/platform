import Link from "next/link";
import { redirect } from "next/navigation";
import { MapPin, ClipboardList, PlusCircle, Receipt, FileText } from "lucide-react";
import { getMyCustomerProfile } from "@/actions/customer";
import { getMyAssignments } from "@/actions/assignments";
import { getMyInvoiceSummary } from "@/actions/invoices";
import { getMyPendingQuoteCount } from "@/actions/quotes";
import { STATUS_LABEL, STATUS_COLOR } from "@/types/assignments";

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "";
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("nl-NL", { day: "numeric", month: "short" });
}

function formatAmount(amount: string): string {
  return parseFloat(amount).toLocaleString("nl-NL", {
    style:    "currency",
    currency: "EUR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

export default async function DashboardPage() {
  const [profile, assignments, invoiceSummary, pendingQuoteCount] = await Promise.all([
    getMyCustomerProfile(),
    getMyAssignments(),
    getMyInvoiceSummary(),
    getMyPendingQuoteCount(),
  ]);

  if (!profile) {
    redirect("/klant/login?error=" + encodeURIComponent("Geen klantprofiel gevonden voor dit account."));
  }

  const activeCount    = assignments.filter((a) =>
    ["scheduled", "in_progress", "seen", "plannable"].includes(a.status),
  ).length;
  const recentRequests = assignments.filter((a) =>
    ["requested", "review", "quote_preparation", "awaiting_approval", "approved"].includes(a.status),
  ).length;
  const recentAssignments = assignments.slice(0, 4);

  return (
    <div className="space-y-4 p-4">
      {/* Header */}
      <div className="rounded-2xl px-4 pt-6 pb-4" style={{ backgroundColor: "var(--color-primary)" }}>
        <div className="mb-1 flex items-center gap-2">
          <div
            className="flex h-8 w-8 items-center justify-center rounded-lg text-sm font-bold text-white"
            style={{ backgroundColor: "var(--color-accent)" }}
          >
            V
          </div>
          <span className="text-xs font-medium" style={{ color: "#94A3B8" }}>
            Veele Klantportaal
          </span>
        </div>
        <h1 className="mt-3 text-xl font-bold text-white">
          Welkom, {profile.contactName ?? profile.name}
        </h1>
        <p className="mt-0.5 text-sm" style={{ color: "#94A3B8" }}>
          {profile.name}
        </p>
      </div>

      {/* Stat tiles */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl bg-white p-4 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide" style={{ color: "var(--color-secondary)" }}>
            Actieve opdrachten
          </p>
          <p className="mt-2 text-3xl font-bold" style={{ color: "var(--color-primary)" }}>
            {activeCount}
          </p>
        </div>
        <div className="rounded-2xl bg-white p-4 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide" style={{ color: "var(--color-secondary)" }}>
            Openstaande aanvragen
          </p>
          <p className="mt-2 text-3xl font-bold" style={{ color: "var(--color-accent)" }}>
            {recentRequests}
          </p>
        </div>
        <Link
          href="/klant/facturen"
          className="rounded-2xl bg-white p-4 shadow-sm"
        >
          <p className="text-xs font-medium uppercase tracking-wide" style={{ color: "var(--color-secondary)" }}>
            Open facturen
          </p>
          {invoiceSummary.openCount > 0 ? (
            <>
              <p className="mt-2 text-3xl font-bold" style={{ color: "var(--color-destructive)" }}>
                {invoiceSummary.openCount}
              </p>
              <p className="mt-0.5 text-xs font-medium" style={{ color: "var(--color-secondary)" }}>
                {formatAmount(invoiceSummary.openTotal)} te betalen
              </p>
            </>
          ) : (
            <p className="mt-2 text-3xl font-bold" style={{ color: "var(--color-success)" }}>
              0
            </p>
          )}
        </Link>
        <Link
          href="/klant/offertes"
          className="rounded-2xl bg-white p-4 shadow-sm"
        >
          <p className="text-xs font-medium uppercase tracking-wide" style={{ color: "var(--color-secondary)" }}>
            Te beoordelen
          </p>
          <p
            className="mt-2 text-3xl font-bold"
            style={{ color: pendingQuoteCount > 0 ? "var(--color-warning)" : "var(--color-primary)" }}
          >
            {pendingQuoteCount}
          </p>
          {pendingQuoteCount > 0 && (
            <p className="mt-0.5 text-xs font-medium" style={{ color: "var(--color-secondary)" }}>
              {pendingQuoteCount === 1 ? "offerte wacht" : "offertes wachten"}
            </p>
          )}
        </Link>
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-3 gap-3">
        <Link
          href="/klant/opdrachten/aanvragen"
          className="flex flex-col items-center gap-2 rounded-2xl bg-white p-4 shadow-sm"
        >
          <div
            className="flex h-10 w-10 items-center justify-center rounded-xl"
            style={{ backgroundColor: "rgba(0,183,179,0.1)" }}
          >
            <PlusCircle size={20} style={{ color: "var(--color-accent)" }} />
          </div>
          <span className="text-center text-xs font-medium" style={{ color: "var(--color-primary)" }}>
            Aanvragen
          </span>
        </Link>
        <Link
          href="/klant/objecten"
          className="flex flex-col items-center gap-2 rounded-2xl bg-white p-4 shadow-sm"
        >
          <div
            className="flex h-10 w-10 items-center justify-center rounded-xl"
            style={{ backgroundColor: "rgba(8,29,58,0.06)" }}
          >
            <MapPin size={20} style={{ color: "var(--color-primary)" }} />
          </div>
          <span className="text-center text-xs font-medium" style={{ color: "var(--color-primary)" }}>
            Objecten
          </span>
        </Link>
        <Link
          href="/klant/opdrachten"
          className="flex flex-col items-center gap-2 rounded-2xl bg-white p-4 shadow-sm"
        >
          <div
            className="flex h-10 w-10 items-center justify-center rounded-xl"
            style={{ backgroundColor: "rgba(8,29,58,0.06)" }}
          >
            <ClipboardList size={20} style={{ color: "var(--color-primary)" }} />
          </div>
          <span className="text-center text-xs font-medium" style={{ color: "var(--color-primary)" }}>
            Opdrachten
          </span>
        </Link>
      </div>

      {/* Recent assignments */}
      {recentAssignments.length > 0 && (
        <div className="rounded-2xl bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold" style={{ color: "var(--color-primary)" }}>
              Recente opdrachten
            </h2>
            <Link href="/klant/opdrachten" className="text-xs font-medium" style={{ color: "var(--color-accent)" }}>
              Alles →
            </Link>
          </div>
          <div className="space-y-2">
            {recentAssignments.map((a) => {
              const s = STATUS_COLOR[a.status] ?? { bg: "#F1F5F9", color: "#64748B" };
              return (
                <div
                  key={a.id}
                  className="flex items-center justify-between gap-3 rounded-xl p-3"
                  style={{ backgroundColor: "var(--color-muted)" }}
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold" style={{ color: "var(--color-primary)" }}>
                      {a.title}
                    </p>
                    {a.scheduledDate && (
                      <p className="mt-0.5 text-xs" style={{ color: "var(--color-secondary)" }}>
                        {formatDate(a.scheduledDate)}
                      </p>
                    )}
                  </div>
                  <span
                    className="shrink-0 rounded-full px-2 py-0.5 text-xs font-medium"
                    style={{ backgroundColor: s.bg, color: s.color }}
                  >
                    {STATUS_LABEL[a.status] ?? a.status}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
