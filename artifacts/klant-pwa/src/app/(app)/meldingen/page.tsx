export const dynamic = "force-dynamic";

import Link from "next/link";
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
} from "lucide-react";
import { getMyCustomerNotifications } from "@/actions/notifications";
import { PageShell } from "@/components/PageShell";

const CATEGORY_ICON = {
  invoice: Receipt,
  quote:   FileText,
  report:  FileCheck2,
  request: Bell,
  planning: CalendarClock,
  news: Newspaper,
  message: MessageSquareText,
  system:  CheckCircle2,
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("nl-NL", {
    day:    "numeric",
    month:  "long",
    year:   "numeric",
    hour:   "2-digit",
    minute: "2-digit",
  });
}

export default async function MeldingenPage() {
  const notifications = await getMyCustomerNotifications();
  const actionable = notifications.filter((item) => item.category !== "system");

  return (
    <PageShell
      title="Meldingen"
      subtitle="Belangrijke updates over aanvragen, offertes, rapportages en facturen."
    >
      <section className="grid gap-4 lg:grid-cols-[1fr_22rem]">
        <div className="space-y-3">
          {notifications.map((item) => {
            const Icon = CATEGORY_ICON[item.category] ?? Bell;
            const high = item.priority === "high";
            return (
              <Link
                key={item.id}
                href={item.href}
                className="block rounded-[22px] border bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
                style={{ borderColor: high ? "#FDE68A" : "var(--color-border)" }}
              >
                <div className="flex items-start gap-3">
                  <span
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl"
                    style={{
                      backgroundColor: high ? "#FEF3C7" : "#E8FBFA",
                      color:           high ? "#B45309" : "var(--color-accent)",
                    }}
                  >
                    <Icon size={20} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-black" style={{ color: "var(--color-primary)" }}>
                        {item.title}
                      </span>
                      {high ? (
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-black text-amber-800">
                          Actie nodig
                        </span>
                      ) : null}
                    </span>
                    <span className="mt-1 block text-sm font-semibold leading-6" style={{ color: "var(--color-secondary)" }}>
                      {item.body}
                    </span>
                    <span className="mt-2 block text-xs font-bold" style={{ color: "var(--color-muted-fg)" }}>
                      {formatDate(item.createdAt)}
                    </span>
                  </span>
                </div>
              </Link>
            );
          })}
        </div>

        <aside className="rounded-[22px] bg-white p-5 shadow-sm">
          <div className="flex items-start gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#E8FBFA] text-[#087C79]">
              <AlertTriangle size={21} />
            </span>
            <div>
              <h2 className="text-lg font-black" style={{ color: "var(--color-primary)" }}>
                Actueel overzicht
              </h2>
              <p className="mt-1 text-sm font-semibold" style={{ color: "var(--color-secondary)" }}>
                {actionable.length === 0
                  ? "Er zijn geen openstaande acties."
                  : `${actionable.length} actuele melding${actionable.length === 1 ? "" : "en"}.`}
              </p>
            </div>
          </div>
          <p className="mt-5 rounded-2xl bg-slate-50 px-4 py-3 text-sm font-semibold leading-6" style={{ color: "var(--color-secondary)" }}>
            Deze lijst is gekoppeld aan uw actuele workflowdata. Zodra facturen betaald zijn,
            offertes beoordeeld zijn of aanvragen doorlopen, verdwijnt de actie automatisch.
          </p>
        </aside>
      </section>
    </PageShell>
  );
}
