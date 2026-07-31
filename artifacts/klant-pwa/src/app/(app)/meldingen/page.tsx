export const dynamic = "force-dynamic";

import Link from "next/link";
import { notFound } from "next/navigation";
import {
  AlertTriangle,
  Bell,
  CalendarClock,
  CheckCircle2,
  FileCheck2,
  FileText,
  MessageSquareText,
  Newspaper,
  Receipt,
  Sparkles,
} from "lucide-react";
import {
  getMyCustomerNotifications,
  getMyCustomerOpenActions,
  markCustomerNotificationReadAndOpen,
} from "@/actions/notifications";
import { getMyCustomerTicketSummary } from "@/actions/tickets";
import { PageShell } from "@/components/PageShell";
import { getCustomerPortalFeatureFlags } from "@/lib/portal-features";
import { NotificationOpenButton } from "./NotificationOpenButton";

const CATEGORY_ICON = {
  invoice: Receipt,
  quote: FileText,
  report: FileCheck2,
  request: Bell,
  planning: CalendarClock,
  news: Newspaper,
  releases: Sparkles,
  message: MessageSquareText,
  system: CheckCircle2,
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("nl-NL", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function MeldingenPage() {
  const featureFlags = await getCustomerPortalFeatureFlags();
  if (!featureFlags.notifications) notFound();

  const [communication, openActions, ticketSummary] = await Promise.all([
    getMyCustomerNotifications(),
    getMyCustomerOpenActions({
      finance: featureFlags.finance,
      reporting: featureFlags.reporting,
    }),
    getMyCustomerTicketSummary(),
  ]);
  const visibleCommunication = communication.filter(
    (item) => item.kind === "communication" && item.category !== "system",
  );

  return (
    <PageShell
      title="Meldingen"
      subtitle={[
        "Belangrijke updates over aanvragen en planning",
        featureFlags.finance ? "financiële acties" : null,
        featureFlags.reporting ? "rapportages" : null,
      ]
        .filter(Boolean)
        .join(", ")}
    >
      <section className="grid gap-4 lg:grid-cols-[1fr_22rem]">
        <div className="space-y-5">
          <section>
            <div className="mb-3">
              <h2 className="text-base font-semibold text-[var(--color-primary)]">
                Berichten
              </h2>
              <p className="text-sm text-[var(--color-secondary)]">
                Updates die u kunt lezen en als gelezen kunt markeren.
              </p>
            </div>
            <div className="space-y-2">
              {visibleCommunication.length > 0 ? (
                visibleCommunication.map((item) => {
                  const Icon = CATEGORY_ICON[item.category] ?? Bell;
                  const high = item.priority === "high";
                  return (
                    <form
                      key={item.id}
                      action={markCustomerNotificationReadAndOpen}
                    >
                      <input
                        type="hidden"
                        name="notificationId"
                        value={item.id}
                      />
                      <NotificationOpenButton highlighted={high}>
                        <span className="flex items-start gap-3">
                          <span
                            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg"
                            style={{
                              backgroundColor: high ? "#FEF3C7" : "#E8FBFA",
                              color: high ? "#B45309" : "var(--color-accent)",
                            }}
                          >
                            <Icon size={20} />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="flex flex-wrap items-center gap-2">
                              <span
                                className="text-sm font-semibold"
                                style={{ color: "var(--color-primary)" }}
                              >
                                {item.title}
                              </span>
                              {high ? (
                                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800">
                                  Actie nodig
                                </span>
                              ) : null}
                            </span>
                            <span
                              className="mt-1 block text-sm font-semibold leading-6"
                              style={{ color: "var(--color-secondary)" }}
                            >
                              {item.body}
                            </span>
                            <span
                              className="mt-2 block text-xs font-bold"
                              style={{ color: "var(--color-muted-fg)" }}
                            >
                              {formatDate(item.createdAt)}
                            </span>
                          </span>
                        </span>
                      </NotificationOpenButton>
                    </form>
                  );
                })
              ) : (
                <p
                  className="rounded-xl border bg-white p-4 text-sm text-[var(--color-secondary)]"
                  style={{ borderColor: "var(--color-border)" }}
                >
                  Geen ongelezen communicatie.
                </p>
              )}
            </div>
          </section>

          <section>
            <div className="mb-3">
              <h2 className="text-base font-semibold text-[var(--color-primary)]">
                Open acties
              </h2>
              <p className="text-sm text-[var(--color-secondary)]">
                Deze verdwijnen automatisch zodra de onderliggende actie is
                afgerond.
              </p>
            </div>
            <div className="space-y-2">
              {openActions.length > 0 ? (
                openActions.map((item) => {
                  const Icon = CATEGORY_ICON[item.category] ?? Bell;
                  return (
                    <Link
                      key={item.id}
                      href={item.href}
                      className="flex items-start gap-3 rounded-xl border bg-white p-3 transition hover:bg-slate-50"
                      style={{ borderColor: "var(--color-border)" }}
                    >
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-50 text-amber-700">
                        <Icon size={19} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold text-[var(--color-primary)]">
                          {item.title}
                        </span>
                        <span className="mt-0.5 block text-sm text-[var(--color-secondary)]">
                          {item.body}
                        </span>
                      </span>
                    </Link>
                  );
                })
              ) : (
                <p
                  className="rounded-xl border bg-white p-4 text-sm text-[var(--color-secondary)]"
                  style={{ borderColor: "var(--color-border)" }}
                >
                  Geen open acties. Nieuwe aanvragen of acties verschijnen hier
                  automatisch.
                </p>
              )}
            </div>
          </section>
        </div>

        <aside className="space-y-4">
          <Link
            href="/meldingen/tickets"
            className="block rounded-[22px] bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
          >
            <div className="flex items-start gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#E8FBFA] text-[#087C79]">
                <MessageSquareText size={21} />
              </span>
              <div className="min-w-0 flex-1">
                <h2
                  className="text-lg font-semibold"
                  style={{ color: "var(--color-primary)" }}
                >
                  Contact & tickets
                </h2>
                <p
                  className="mt-1 text-sm font-semibold"
                  style={{ color: "var(--color-secondary)" }}
                >
                  {ticketSummary.openCount === 0
                    ? "Geen open tickets."
                    : `${ticketSummary.openCount} open ticket${ticketSummary.openCount === 1 ? "" : "s"}.`}
                </p>
              </div>
              {ticketSummary.unreadCount > 0 ? (
                <span className="flex h-7 min-w-7 items-center justify-center rounded-full bg-red-500 px-2 text-xs font-semibold text-white">
                  {ticketSummary.unreadCount}
                </span>
              ) : null}
            </div>

            {ticketSummary.recent.length > 0 ? (
              <div className="mt-4 space-y-2">
                {ticketSummary.recent.map((ticket) => (
                  <div
                    key={ticket.id}
                    className="rounded-2xl bg-slate-50 px-3 py-2.5"
                  >
                    <p
                      className="line-clamp-1 text-sm font-semibold"
                      style={{ color: "var(--color-primary)" }}
                    >
                      {ticket.subject}
                    </p>
                    <p
                      className="mt-1 line-clamp-1 text-xs font-semibold"
                      style={{ color: "var(--color-muted-fg)" }}
                    >
                      {ticket.lastMessagePreview ?? "Nog geen berichtinhoud"}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <p
                className="mt-5 rounded-2xl bg-slate-50 px-4 py-3 text-sm font-semibold leading-6"
                style={{ color: "var(--color-secondary)" }}
              >
                Start een ticket voor vragen over facturen, objecten, opdrachten
                of ondersteuning.
              </p>
            )}
          </Link>

          <div className="rounded-[22px] bg-white p-5 shadow-sm">
            <div className="flex items-start gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#E8FBFA] text-[#087C79]">
                <AlertTriangle size={21} />
              </span>
              <div>
                <h2
                  className="text-lg font-semibold"
                  style={{ color: "var(--color-primary)" }}
                >
                  Actueel overzicht
                </h2>
                <p
                  className="mt-1 text-sm font-semibold"
                  style={{ color: "var(--color-secondary)" }}
                >
                  {openActions.length === 0
                    ? "Er zijn geen openstaande acties."
                    : `${openActions.length} open actie${openActions.length === 1 ? "" : "s"}.`}
                </p>
              </div>
            </div>
            <p
              className="mt-5 rounded-2xl bg-slate-50 px-4 py-3 text-sm font-semibold leading-6"
              style={{ color: "var(--color-secondary)" }}
            >
              Deze lijst is gekoppeld aan uw actuele workflowdata. Zodra
              facturen betaald zijn, offertes beoordeeld zijn of aanvragen
              doorlopen, verdwijnt de actie automatisch.
            </p>
          </div>
        </aside>
      </section>
    </PageShell>
  );
}
