import Link from "next/link";
import { redirect } from "next/navigation";
import { MapPin, ClipboardList, PlusCircle, CreditCard, ArrowRight, AlertCircle } from "lucide-react";
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
    style:                 "currency",
    currency:              "EUR",
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

  const activeCount = assignments.filter((a) =>
    ["scheduled", "in_progress", "seen", "plannable"].includes(a.status),
  ).length;
  const pendingCount = assignments.filter((a) =>
    ["requested", "review", "quote_preparation", "awaiting_approval", "approved"].includes(a.status),
  ).length;
  const recentAssignments = assignments.slice(0, 4);

  const hasOpenInvoices  = invoiceSummary.openCount > 0;
  const hasPendingQuotes = pendingQuoteCount > 0;

  return (
    <div className="space-y-5 p-4 md:p-0">

      {/* ── Welkomstbanner ────────────────────────────────────────── */}
      <div
        className="rounded-3xl px-5 py-5"
        style={{
          background: "linear-gradient(135deg, #1D7BC4 0%, #1565A8 100%)",
          color:      "#fff",
        }}
      >
        {/* Alle tekst volledig wit — contrast ≥ 4.5:1 op beide gradient-stops */}
        <p className="text-sm text-white">Welkom terug,</p>
        <h1 className="mt-0.5 text-2xl font-bold leading-tight text-white">
          {profile.contactName ?? profile.name}
        </h1>
        <p className="mt-0.5 text-sm font-medium text-white opacity-80">
          {profile.name}
        </p>

        {/* Compacte stats in de banner */}
        <div className="mt-4 flex gap-4">
          <div>
            <p className="text-2xl font-bold text-white">{activeCount}</p>
            <p className="text-xs text-white opacity-80">Actieve opdrachten</p>
          </div>
          <div
            className="w-px self-stretch"
            style={{ backgroundColor: "rgba(255,255,255,0.3)" }}
          />
          <div>
            <p className="text-2xl font-bold text-white">{pendingCount}</p>
            <p className="text-xs text-white opacity-80">In behandeling</p>
          </div>
        </div>
      </div>

      {/* ── Openstaande facturen CTA — prominente actiekaart ──────── */}
      {hasOpenInvoices && (
        <Link
          href="/klant/facturen"
          className="flex items-center gap-4 rounded-2xl p-4 shadow-sm active:scale-95 transition-transform"
          style={{ backgroundColor: "#FFF5F5", border: "1.5px solid #FECACA" }}
        >
          <div
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl"
            style={{ backgroundColor: "#FEE2E2" }}
          >
            <AlertCircle size={22} style={{ color: "#E02D3C" }} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-sm" style={{ color: "#9B1C1C" }}>
              {invoiceSummary.openCount === 1
                ? "1 factuur openstaand"
                : `${invoiceSummary.openCount} facturen openstaand`}
            </p>
            <p className="text-sm font-semibold" style={{ color: "#E02D3C" }}>
              {formatAmount(invoiceSummary.openTotal)} te betalen
            </p>
          </div>
          <div
            className="flex items-center gap-1 rounded-lg px-3 py-2 text-sm font-bold text-white shrink-0"
            style={{ backgroundColor: "#E02D3C" }}
          >
            <CreditCard size={14} className="mr-1" />
            Betalen
          </div>
        </Link>
      )}

      {/* ── Offerte-actiekaart ─────────────────────────────────────── */}
      {hasPendingQuotes && (
        <Link
          href="/klant/offertes"
          className="flex items-center gap-4 rounded-2xl p-4 shadow-sm active:scale-95 transition-transform"
          style={{ backgroundColor: "#FFFBEB", border: "1.5px solid #FDE68A" }}
        >
          <div
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl"
            style={{ backgroundColor: "#FEF3C7" }}
          >
            <AlertCircle size={22} style={{ color: "#B45309" }} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-sm" style={{ color: "#92400E" }}>
              {pendingQuoteCount === 1
                ? "1 offerte wacht op uw beoordeling"
                : `${pendingQuoteCount} offertes wachten op uw beoordeling`}
            </p>
          </div>
          <ArrowRight size={18} style={{ color: "#B45309" }} className="shrink-0" />
        </Link>
      )}

      {/* ── Snelkoppelingen ───────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-3">
        <Link
          href="/klant/opdrachten/aanvragen"
          className="flex flex-col items-center gap-2 rounded-2xl bg-white p-4 shadow-sm text-center active:scale-95 transition-transform"
        >
          <div
            className="flex h-11 w-11 items-center justify-center rounded-xl"
            style={{ backgroundColor: "var(--color-accent-muted)" }}
          >
            <PlusCircle size={22} style={{ color: "var(--color-accent)" }} />
          </div>
          <span className="text-xs font-semibold leading-snug" style={{ color: "var(--color-primary)" }}>
            Nieuw aanvragen
          </span>
        </Link>

        <Link
          href="/klant/objecten"
          className="flex flex-col items-center gap-2 rounded-2xl bg-white p-4 shadow-sm text-center active:scale-95 transition-transform"
        >
          <div
            className="flex h-11 w-11 items-center justify-center rounded-xl"
            style={{ backgroundColor: "rgba(8,29,58,0.06)" }}
          >
            <MapPin size={22} style={{ color: "var(--color-primary)" }} />
          </div>
          <span className="text-xs font-semibold leading-snug" style={{ color: "var(--color-primary)" }}>
            Mijn objecten
          </span>
        </Link>

        <Link
          href="/klant/opdrachten"
          className="flex flex-col items-center gap-2 rounded-2xl bg-white p-4 shadow-sm text-center active:scale-95 transition-transform"
        >
          <div
            className="flex h-11 w-11 items-center justify-center rounded-xl"
            style={{ backgroundColor: "rgba(8,29,58,0.06)" }}
          >
            <ClipboardList size={22} style={{ color: "var(--color-primary)" }} />
          </div>
          <span className="text-xs font-semibold leading-snug" style={{ color: "var(--color-primary)" }}>
            Opdrachten
          </span>
        </Link>
      </div>

      {/* ── Recente opdrachten ────────────────────────────────────── */}
      {recentAssignments.length > 0 && (
        <div className="rounded-3xl bg-white shadow-sm overflow-hidden">
          <div
            className="flex items-center justify-between px-4 py-3 border-b"
            style={{ borderColor: "var(--color-border)" }}
          >
            <h2 className="font-bold text-base" style={{ color: "var(--color-primary)" }}>
              Recente opdrachten
            </h2>
            <Link
              href="/klant/opdrachten"
              className="flex items-center gap-1 text-sm font-semibold"
              style={{ color: "var(--color-accent)" }}
            >
              Alles <ArrowRight size={14} />
            </Link>
          </div>
          <div className="divide-y" style={{ borderColor: "var(--color-border)" }}>
            {recentAssignments.map((a) => {
              const s = STATUS_COLOR[a.status] ?? { bg: "#F1F5F9", color: "#64748B" };
              return (
                <Link
                  key={a.id}
                  href={`/klant/opdrachten/${a.id}`}
                  className="flex items-center justify-between gap-3 px-4 py-3 active:bg-slate-50 transition-colors"
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
                    className="shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold"
                    style={{ backgroundColor: s.bg, color: s.color }}
                  >
                    {STATUS_LABEL[a.status] ?? a.status}
                  </span>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* Lege state */}
      {recentAssignments.length === 0 && !hasOpenInvoices && (
        <div
          className="flex flex-col items-center gap-3 rounded-3xl bg-white p-8 text-center shadow-sm"
        >
          <div
            className="flex h-14 w-14 items-center justify-center rounded-2xl"
            style={{ backgroundColor: "var(--color-accent-muted)" }}
          >
            <ClipboardList size={26} style={{ color: "var(--color-accent)" }} />
          </div>
          <div>
            <p className="font-bold" style={{ color: "var(--color-primary)" }}>
              Nog geen opdrachten
            </p>
            <p className="mt-1 text-sm" style={{ color: "var(--color-secondary)" }}>
              Dien uw eerste aanvraag in via de knop hierboven.
            </p>
          </div>
          <Link
            href="/klant/opdrachten/aanvragen"
            className="mt-1 inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white"
            style={{ backgroundColor: "var(--color-accent)" }}
          >
            <PlusCircle size={16} />
            Aanvraag indienen
          </Link>
        </div>
      )}
    </div>
  );
}
