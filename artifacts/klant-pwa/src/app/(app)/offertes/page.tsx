export const dynamic = "force-dynamic";

import {
  FileText,
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
} from "lucide-react";
import { getMyQuotes } from "@/actions/quotes";
import { OfferteActieButtons } from "@/components/OfferteActieButtons";
import { OfferteRegelitems } from "@/components/OfferteRegelitems";
import { PageShell } from "@/components/PageShell";

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "";
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("nl-NL", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatAmount(amount: string): string {
  return parseFloat(amount).toLocaleString("nl-NL", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
  });
}

const STATUS_CONFIG: Record<
  string,
  { label: string; bg: string; color: string; Icon: React.ElementType }
> = {
  draft: { label: "Concept", bg: "#F1F5F9", color: "#64748B", Icon: Clock },
  sent: {
    label: "Ter beoordeling",
    bg: "#FEF3C7",
    color: "#92400E",
    Icon: Clock,
  },
  approved: {
    label: "Goedgekeurd",
    bg: "#DCFCE7",
    color: "#166534",
    Icon: CheckCircle2,
  },
  rejected: {
    label: "Afgewezen",
    bg: "#FEE2E2",
    color: "#991B1B",
    Icon: XCircle,
  },
  expired: {
    label: "Verlopen",
    bg: "#F1F5F9",
    color: "#64748B",
    Icon: AlertTriangle,
  },
};

export default async function OffertesPage() {
  const quotes = await getMyQuotes();

  const pending = quotes.filter(
    (q) => q.assignmentStatus === "awaiting_approval",
  );
  const rest = quotes.filter((q) => q.assignmentStatus !== "awaiting_approval");

  return (
    <PageShell
      title="Offertes"
      subtitle="Controleer en keur offertes digitaal goed of af."
    >
      {quotes.length === 0 ? (
        <div className="rounded-2xl bg-white p-8 text-center shadow-sm">
          <FileText
            size={32}
            className="mx-auto mb-3"
            style={{ color: "var(--color-muted-fg)" }}
          />
          <p
            className="text-sm font-medium"
            style={{ color: "var(--color-primary)" }}
          >
            Nog geen offertes
          </p>
          <p
            className="mt-1 text-xs"
            style={{ color: "var(--color-secondary)" }}
          >
            Offertes verschijnen hier zodra ze zijn aangemaakt.
          </p>
        </div>
      ) : (
        <>
          {pending.length > 0 && (
            <QuoteGroup title="Uw goedkeuring vereist" quotes={pending} />
          )}
          {rest.length > 0 && (
            <QuoteGroup title="Eerder ontvangen" quotes={rest} />
          )}
        </>
      )}
    </PageShell>
  );
}

function QuoteGroup({
  title,
  quotes,
}: {
  title: string;
  quotes: Awaited<ReturnType<typeof getMyQuotes>>;
}) {
  return (
    <section>
      <h2
        className="mb-2 text-sm font-semibold uppercase tracking-wide"
        style={{ color: "var(--color-secondary)" }}
      >
        {title}
      </h2>
      <div
        className="hidden overflow-x-auto rounded-[22px] border bg-white shadow-sm md:block"
        style={{ borderColor: "var(--color-border)" }}
      >
        <div
          className="grid grid-cols-[10rem_minmax(18rem,1.5fr)_10rem_10rem_10rem] gap-4 border-b px-5 py-3 text-xs font-black uppercase tracking-[0.08em]"
          style={{
            borderColor: "var(--color-border)",
            color: "var(--color-secondary)",
          }}
        >
          <span>Offerte</span>
          <span>Opdracht</span>
          <span>Bedrag</span>
          <span>Geldig t/m</span>
          <span className="text-right">Status</span>
        </div>
        <div
          className="divide-y"
          style={{ borderColor: "var(--color-border)" }}
        >
          {quotes.map((q) => {
            const effectiveStatus = q.isExpired ? "expired" : q.status;
            const cfg = STATUS_CONFIG[effectiveStatus] ?? STATUS_CONFIG.draft;
            const StatusIcon = cfg.Icon;
            const needsAction = q.assignmentStatus === "awaiting_approval";

            return (
              <div
                key={q.id}
                className="grid grid-cols-[10rem_minmax(18rem,1.5fr)_10rem_10rem_10rem] items-center gap-4 px-5 py-4"
              >
                <span
                  className="font-mono text-xs font-black"
                  style={{ color: "var(--color-primary)" }}
                >
                  {q.quoteNumber}
                </span>
                <span className="min-w-0">
                  <span
                    className="block truncate text-sm font-black"
                    style={{ color: "var(--color-primary)" }}
                  >
                    {q.assignmentTitle}
                  </span>
                  {needsAction ? (
                    <span className="mt-1 inline-flex rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-black text-amber-700">
                      Actie vereist
                    </span>
                  ) : null}
                </span>
                <span
                  className="text-sm font-black"
                  style={{ color: "var(--color-primary)" }}
                >
                  {formatAmount(q.amount)}
                </span>
                <span
                  className="text-sm font-semibold"
                  style={{ color: "var(--color-secondary)" }}
                >
                  {formatDate(q.validityDate)}
                </span>
                <span className="text-right">
                  <span
                    className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-black"
                    style={{ backgroundColor: cfg.bg, color: cfg.color }}
                  >
                    <StatusIcon size={11} />
                    {cfg.label}
                  </span>
                </span>
                {needsAction ? (
                  <div
                    className="col-span-5 border-t pt-3"
                    style={{ borderColor: "var(--color-border)" }}
                  >
                    <OfferteRegelitems
                      lineItems={q.lineItems}
                      amount={q.amount}
                    />
                    <OfferteActieButtons
                      assignmentId={q.assignmentId}
                      title={q.assignmentTitle}
                    />
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>

      <div className="space-y-3 md:hidden">
        {quotes.map((q) => {
          const effectiveStatus = q.isExpired ? "expired" : q.status;
          const cfg = STATUS_CONFIG[effectiveStatus] ?? STATUS_CONFIG.draft;
          const StatusIcon = cfg.Icon;
          const needsAction = q.assignmentStatus === "awaiting_approval";

          return (
            <div key={q.id} className="rounded-2xl bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <span
                    className="font-mono text-xs rounded px-1.5 py-0.5"
                    style={{
                      backgroundColor: "var(--color-muted)",
                      color: "var(--color-secondary)",
                    }}
                  >
                    {q.quoteNumber}
                  </span>
                  <p
                    className="mt-2 truncate font-semibold"
                    style={{ color: "var(--color-primary)" }}
                  >
                    {q.assignmentTitle}
                  </p>
                  <p
                    className="mt-1 text-2xl font-bold"
                    style={{ color: "var(--color-primary)" }}
                  >
                    {formatAmount(q.amount)}
                  </p>
                  <p
                    className="mt-0.5 text-xs"
                    style={{ color: "var(--color-secondary)" }}
                  >
                    Geldig t/m: {formatDate(q.validityDate)}
                  </p>
                </div>
                <span
                  className="shrink-0 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium"
                  style={{ backgroundColor: cfg.bg, color: cfg.color }}
                >
                  <StatusIcon size={10} />
                  {cfg.label}
                </span>
              </div>

              <OfferteRegelitems lineItems={q.lineItems} amount={q.amount} />

              {needsAction && (
                <OfferteActieButtons
                  assignmentId={q.assignmentId}
                  title={q.assignmentTitle}
                />
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
