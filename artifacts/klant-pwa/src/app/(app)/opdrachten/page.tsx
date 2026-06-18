export const dynamic = "force-dynamic";

import Link from "next/link";
import { ClipboardList, PlusCircle, FileText } from "lucide-react";
import { getMyAssignments } from "@/actions/assignments";
import { STATUS_LABEL, STATUS_COLOR } from "@/types/assignments";
import { OfferteActieButtons } from "@/components/OfferteActieButtons";
import type { QuoteStatus } from "@workspace/db";

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "";
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("nl-NL", { weekday: "short", day: "numeric", month: "short" });
}

function formatAmount(amount: string | null): string {
  if (!amount) return "";
  return parseFloat(amount).toLocaleString("nl-NL", { style: "currency", currency: "EUR" });
}

const ACTIVE_STATUSES = new Set(["scheduled", "seen", "in_progress", "plannable"]);
const OPEN_STATUSES   = new Set(["requested", "review", "quote_preparation", "approved"]);

const QUOTE_STATUS_BADGE: Partial<Record<QuoteStatus, { label: string; bg: string; color: string }>> = {
  sent:     { label: "Offerte verstuurd",    bg: "#FEF9C3", color: "#A16207" },
  approved: { label: "Offerte geaccepteerd", bg: "#DCFCE7", color: "#15803D" },
  rejected: { label: "Offerte afgewezen",    bg: "#FEE2E2", color: "#DC2626" },
  expired:  { label: "Offerte verlopen",     bg: "#F1F5F9", color: "#64748B" },
};

export default async function OpdrachtenPage() {
  const assignments = await getMyAssignments();

  const quotes  = assignments.filter((a) => a.status === "awaiting_approval");
  const active  = assignments.filter((a) => ACTIVE_STATUSES.has(a.status));
  const open    = assignments.filter((a) => OPEN_STATUSES.has(a.status));
  const history = assignments.filter(
    (a) => a.status !== "awaiting_approval" && !ACTIVE_STATUSES.has(a.status) && !OPEN_STATUSES.has(a.status),
  );

  return (
    <div className="space-y-4 p-4 md:p-0">
      <div className="flex items-center justify-between">
        <h1 className="text-xl md:text-2xl font-bold" style={{ color: "var(--color-primary)" }}>
          Mijn opdrachten
        </h1>
        <Link
          href="/klant/opdrachten/aanvragen"
          className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-medium text-white"
          style={{ backgroundColor: "var(--color-accent)" }}
        >
          <PlusCircle size={14} />
          Aanvragen
        </Link>
      </div>

      {assignments.length === 0 && (
        <div className="rounded-2xl bg-white p-8 text-center shadow-sm">
          <ClipboardList size={32} className="mx-auto mb-3" style={{ color: "var(--color-muted-fg)" }} />
          <p className="text-sm font-medium" style={{ color: "var(--color-primary)" }}>
            Nog geen opdrachten
          </p>
          <p className="mt-1 text-xs" style={{ color: "var(--color-secondary)" }}>
            Dien een nieuwe aanvraag in om te beginnen.
          </p>
          <Link
            href="/klant/opdrachten/aanvragen"
            className="mt-4 inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-medium text-white"
            style={{ backgroundColor: "var(--color-accent)" }}
          >
            <PlusCircle size={16} />
            Opdracht aanvragen
          </Link>
        </div>
      )}

      {/* ── Offertes — actie vereist ─────────────────────────────────────────── */}
      {quotes.length > 0 && (
        <section>
          <div className="mb-2 flex items-center gap-1.5">
            <FileText size={14} style={{ color: "#92400E" }} />
            <h2
              className="text-sm font-semibold uppercase tracking-wide"
              style={{ color: "#92400E" }}
            >
              Offertes — actie vereist
            </h2>
          </div>
          <div
            className="rounded-2xl p-1 space-y-2"
            style={{ backgroundColor: "#FEF9C3" }}
          >
            {quotes.map((a) => {
              const s = STATUS_COLOR[a.status] ?? { bg: "#F1F5F9", color: "#64748B" };
              return (
                <div key={a.id} className="rounded-xl bg-white p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span
                          className="font-mono text-xs rounded px-1.5 py-0.5 shrink-0"
                          style={{ backgroundColor: "var(--color-muted)", color: "var(--color-secondary)" }}
                        >
                          {a.code}
                        </span>
                        {a.quoteNumber && (
                          <span
                            className="font-mono text-xs rounded px-1.5 py-0.5 shrink-0"
                            style={{ backgroundColor: "#FEF9C3", color: "#92400E" }}
                          >
                            {a.quoteNumber}
                          </span>
                        )}
                      </div>
                      <p className="truncate font-semibold" style={{ color: "var(--color-primary)" }}>
                        {a.title}
                      </p>
                      {a.objectName && (
                        <p className="mt-0.5 truncate text-xs" style={{ color: "var(--color-muted-fg)" }}>
                          {a.objectName}{a.objectCity ? ` · ${a.objectCity}` : ""}
                        </p>
                      )}
                      {/* Quote amount + validity for the action card */}
                      {(a.quoteAmount || a.quoteValidityDate) && (
                        <div className="mt-2 flex flex-wrap gap-3 items-baseline">
                          {a.quoteAmount && (
                            <span className="text-sm font-semibold" style={{ color: "var(--color-primary)" }}>
                              {formatAmount(a.quoteAmount)}
                            </span>
                          )}
                          {a.quoteValidityDate && (
                            <span className="text-xs" style={{ color: "var(--color-secondary)" }}>
                              Geldig t/m {formatDate(a.quoteValidityDate)}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                    <span
                      className="shrink-0 rounded-full px-2 py-0.5 text-xs font-medium"
                      style={{ backgroundColor: s.bg, color: s.color }}
                    >
                      {STATUS_LABEL[a.status] ?? a.status}
                    </span>
                  </div>
                  <OfferteActieButtons assignmentId={a.id} title={a.title} />
                </div>
              );
            })}
          </div>
        </section>
      )}

      {active.length > 0 && (
        <AssignmentGroup title="In uitvoering" items={active} />
      )}
      {open.length > 0 && (
        <AssignmentGroup title="Lopende aanvragen" items={open} />
      )}
      {history.length > 0 && (
        <AssignmentGroup title="Afgerond" items={history} />
      )}
    </div>
  );
}

function AssignmentGroup({
  title,
  items,
}: {
  title: string;
  items: ReturnType<typeof getMyAssignments> extends Promise<infer T> ? T : never;
}) {
  return (
    <section>
      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide" style={{ color: "var(--color-secondary)" }}>
        {title}
      </h2>
      <div className="space-y-2">
        {items.map((a) => {
          const s = STATUS_COLOR[a.status] ?? { bg: "#F1F5F9", color: "#64748B" };
          const quoteBadge = a.quoteStatus ? QUOTE_STATUS_BADGE[a.quoteStatus] : null;
          return (
            <Link
              key={a.id}
              href={`/opdrachten/${a.id}`}
              className="block rounded-2xl bg-white p-4 shadow-sm transition-all active:scale-[0.99]"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span
                      className="font-mono text-xs rounded px-1.5 py-0.5 shrink-0"
                      style={{ backgroundColor: "var(--color-muted)", color: "var(--color-secondary)" }}
                    >
                      {a.code}
                    </span>
                  </div>
                  <p className="truncate font-semibold" style={{ color: "var(--color-primary)" }}>
                    {a.title}
                  </p>
                  {a.objectName && (
                    <p className="mt-0.5 truncate text-xs" style={{ color: "var(--color-muted-fg)" }}>
                      {a.objectName}{a.objectCity ? ` · ${a.objectCity}` : ""}
                    </p>
                  )}
                  {a.scheduledDate && (
                    <p className="mt-0.5 text-xs" style={{ color: "var(--color-secondary)" }}>
                      {formatDate(a.scheduledDate)}
                      {a.scheduledStart ? ` · ${a.scheduledStart}` : ""}
                    </p>
                  )}
                  {/* Quote status badge — only for non-draft statuses */}
                  {quoteBadge && (
                    <span
                      className="mt-1.5 inline-block rounded-full px-2 py-0.5 text-xs font-medium"
                      style={{ backgroundColor: quoteBadge.bg, color: quoteBadge.color }}
                    >
                      {quoteBadge.label}
                    </span>
                  )}
                </div>
                <span
                  className="shrink-0 rounded-full px-2 py-0.5 text-xs font-medium"
                  style={{ backgroundColor: s.bg, color: s.color }}
                >
                  {STATUS_LABEL[a.status] ?? a.status}
                </span>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
