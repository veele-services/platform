export const dynamic = "force-dynamic";

import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowRight,
  Bell,
  Building2,
  CheckCircle2,
  FileCheck2,
  FileText,
  Headphones,
  PlusCircle,
  Receipt,
  ShieldCheck,
  Siren,
} from "lucide-react";
import { getMyCustomerProfile } from "@/actions/customer";
import { getMyAssignments } from "@/actions/assignments";
import { getMyInvoiceSummary } from "@/actions/invoices";
import { getMyPendingQuoteCount } from "@/actions/quotes";
import { getMyObjects } from "@/actions/objects";
import { getMyReports } from "@/actions/reports";
import { getMyCustomerNotifications } from "@/actions/notifications";
import { STATUS_COLOR, STATUS_LABEL } from "@/types/assignments";
import type { ReactNode } from "react";

function formatAmount(amount: string): string {
  return Number.parseFloat(amount || "0").toLocaleString("nl-NL", {
    style: "currency",
    currency: "EUR",
  });
}

function formatDate(value: string | null): string {
  if (!value) return "Nog niet gepland";
  return new Date(`${value}T00:00:00`).toLocaleDateString("nl-NL", {
    day: "numeric",
    month: "short",
  });
}

function StatCard({
  icon,
  title,
  value,
  hint,
  href,
}: {
  icon: ReactNode;
  title: string;
  value: string | number;
  hint: string;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="rounded-[18px] border bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
      style={{ borderColor: "var(--color-border)" }}
    >
      <div className="flex items-start gap-3">
        <span
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl"
          style={{ backgroundColor: "#E8FBFA", color: "var(--color-accent)" }}
        >
          {icon}
        </span>
        <span className="min-w-0">
          <span
            className="block text-sm font-black"
            style={{ color: "var(--color-primary)" }}
          >
            {title}
          </span>
          <span
            className="mt-2 block text-[27px] font-black leading-none"
            style={{ color: "var(--color-primary)" }}
          >
            {value}
          </span>
          <span
            className="mt-1 block text-xs font-bold"
            style={{ color: "var(--color-accent)" }}
          >
            {hint}
          </span>
        </span>
      </div>
    </Link>
  );
}

function QuickAction({
  href,
  title,
  subtitle,
  icon,
  primary = false,
}: {
  href: string;
  title: string;
  subtitle: string;
  icon: ReactNode;
  primary?: boolean;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 rounded-[16px] border p-4 shadow-sm transition active:scale-[0.99]"
      style={{
        background: primary
          ? "linear-gradient(135deg, #06224A 0%, #07366F 100%)"
          : "#FFFFFF",
        borderColor: primary ? "transparent" : "var(--color-border)",
        color: primary ? "#FFFFFF" : "var(--color-primary)",
      }}
    >
      <span
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl"
        style={{
          backgroundColor: primary ? "rgba(0,183,179,0.22)" : "#E8FBFA",
          color: primary ? "#7DF4EE" : "var(--color-accent)",
        }}
      >
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-black">{title}</span>
        <span
          className="mt-0.5 block text-xs font-semibold"
          style={{
            color: primary ? "rgba(255,255,255,0.7)" : "var(--color-secondary)",
          }}
        >
          {subtitle}
        </span>
      </span>
    </Link>
  );
}

export default async function DashboardPage() {
  const [
    profile,
    assignments,
    invoiceSummary,
    pendingQuoteCount,
    objects,
    reports,
    notifications,
  ] = await Promise.all([
    getMyCustomerProfile(),
    getMyAssignments(),
    getMyInvoiceSummary(),
    getMyPendingQuoteCount(),
    getMyObjects(),
    getMyReports(),
    getMyCustomerNotifications(),
  ]);

  if (!profile) {
    redirect(
      "/login?error=" +
        encodeURIComponent("Geen klantprofiel gevonden voor dit account."),
    );
  }

  const openAssignments = assignments.filter((a) =>
    [
      "requested",
      "review",
      "quote_preparation",
      "awaiting_approval",
      "approved",
      "plannable",
      "scheduled",
      "seen",
      "in_progress",
    ].includes(a.status),
  );
  const recentAssignments = assignments.slice(0, 4);
  const recentObjects = objects.slice(0, 3);
  const recentNotifications = notifications
    .filter((item) => item.category !== "system")
    .slice(0, 4);

  return (
    <div className="mx-auto w-full max-w-[1500px] space-y-5 px-3.5 pb-[calc(6.4rem+var(--safe-bottom))] pt-4 md:px-1 md:pb-0 md:pt-1 xl:space-y-6">
      <section
        className="rounded-[26px] bg-white p-5 shadow-sm md:border md:px-6 md:py-5"
        style={{ borderColor: "var(--color-border)" }}
      >
        <p
          className="text-sm font-bold"
          style={{ color: "var(--color-secondary)" }}
        >
          Goedemiddag!
        </p>
        <div className="mt-1 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1
              className="text-[30px] font-black leading-tight md:text-[38px]"
              style={{ color: "var(--color-primary)" }}
            >
              Welkom terug bij Veele Services
            </h1>
            <p
              className="mt-1 text-sm font-medium"
              style={{ color: "var(--color-secondary)" }}
            >
              {profile.name} · overzicht van actuele aanvragen, rapporten,
              facturen en objecten.
            </p>
          </div>
          <Link
            href="/profiel"
            className="hidden rounded-full border px-4 py-2 text-sm font-black md:inline-flex"
            style={{
              borderColor: "var(--color-border)",
              color: "var(--color-primary)",
            }}
          >
            {profile.contactName ?? profile.name}
          </Link>
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-4 xl:gap-4">
        <QuickAction
          href="/opdrachten/aanvragen"
          title="Opdracht aanvragen"
          subtitle="Start direct een aanvraag"
          icon={<PlusCircle size={22} />}
          primary
        />
        <QuickAction
          href="/opdrachten/aanvragen"
          title="Spoedaanvraag"
          subtitle="24/7 bereikbaar"
          icon={<Siren size={22} />}
        />
        <QuickAction
          href="/rapporten"
          title="Rapportages"
          subtitle="Bekijk rapportages"
          icon={<FileCheck2 size={22} />}
        />
        <QuickAction
          href="/meldingen/tickets"
          title="Support"
          subtitle="Ticket of vraag stellen"
          icon={<Headphones size={22} />}
        />
      </section>

      <section className="grid gap-3 md:grid-cols-4 xl:gap-4">
        <StatCard
          href="/opdrachten"
          icon={<PlusCircle size={21} />}
          title="Open aanvragen"
          value={openAssignments.length}
          hint="Bekijk status"
        />
        <StatCard
          href="/rapporten"
          icon={<FileText size={21} />}
          title="Rapportages beschikbaar"
          value={reports.length}
          hint="Nieuwe rapporten"
        />
        <StatCard
          href="/facturen"
          icon={<Receipt size={21} />}
          title="Open facturen"
          value={formatAmount(invoiceSummary.openTotal)}
          hint={`${invoiceSummary.openCount} openstaand`}
        />
        <StatCard
          href="/objecten"
          icon={<Building2 size={21} />}
          title="Objecten"
          value={objects.length}
          hint="Actief in beheer"
        />
      </section>

      {pendingQuoteCount > 0 ? (
        <Link
          href="/offertes"
          className="flex items-center gap-3 rounded-[20px] border bg-amber-50 px-5 py-4 shadow-sm"
          style={{ borderColor: "#FDE68A" }}
        >
          <ShieldCheck size={22} style={{ color: "#B45309" }} />
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-black text-amber-900">
              {pendingQuoteCount} offerte{pendingQuoteCount === 1 ? "" : "s"}{" "}
              wacht{pendingQuoteCount === 1 ? "" : "en"} op akkoord
            </span>
            <span className="block text-xs font-semibold text-amber-700">
              Controleer en keur offertes direct digitaal goed.
            </span>
          </span>
          <ArrowRight size={18} className="text-amber-800" />
        </Link>
      ) : null}

      <section className="grid gap-4 lg:grid-cols-[1fr_1.15fr_1fr] xl:gap-5">
        <div
          className="rounded-[22px] border bg-white p-4 shadow-sm"
          style={{ borderColor: "var(--color-border)" }}
        >
          <div className="mb-3 flex items-center justify-between">
            <h2
              className="text-base font-black"
              style={{ color: "var(--color-primary)" }}
            >
              Mijn objecten
            </h2>
            <Link
              href="/objecten"
              className="text-xs font-black"
              style={{ color: "var(--color-accent)" }}
            >
              Bekijk alle
            </Link>
          </div>
          <div className="space-y-3">
            {recentObjects.length > 0 ? (
              recentObjects.map((object, index) => (
                <Link
                  key={object.id}
                  href={`/objecten/${object.id}`}
                  className="flex items-center gap-3 rounded-2xl border p-2.5"
                  style={{ borderColor: "var(--color-border)" }}
                >
                  <span
                    className="flex h-14 w-16 shrink-0 items-center justify-center rounded-xl text-sm font-black text-white"
                    style={{
                      background: ["#0E7490", "#155E75", "#0369A1"][index % 3],
                    }}
                  >
                    {object.name.slice(0, 2).toUpperCase()}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span
                      className="block truncate text-sm font-black"
                      style={{ color: "var(--color-primary)" }}
                    >
                      {object.name}
                    </span>
                    <span
                      className="block truncate text-xs font-semibold"
                      style={{ color: "var(--color-secondary)" }}
                    >
                      {[object.address, object.city].filter(Boolean).join(", ")}
                    </span>
                  </span>
                  <span className="rounded-full bg-[#E8FBFA] px-2 py-1 text-[10px] font-black text-[#087C79]">
                    Actief
                  </span>
                </Link>
              ))
            ) : (
              <p
                className="rounded-2xl bg-slate-50 p-4 text-sm font-semibold"
                style={{ color: "var(--color-secondary)" }}
              >
                Geen objecten beschikbaar.
              </p>
            )}
          </div>
        </div>

        <div
          className="rounded-[22px] border bg-white p-4 shadow-sm"
          style={{ borderColor: "var(--color-border)" }}
        >
          <div className="mb-3 flex items-center justify-between">
            <h2
              className="text-base font-black"
              style={{ color: "var(--color-primary)" }}
            >
              Lopende aanvragen
            </h2>
            <Link
              href="/opdrachten"
              className="text-xs font-black"
              style={{ color: "var(--color-accent)" }}
            >
              Bekijk alle
            </Link>
          </div>
          <div className="space-y-2.5">
            {recentAssignments.length > 0 ? (
              recentAssignments.map((assignment) => {
                const cfg = STATUS_COLOR[assignment.status] ?? {
                  bg: "#F1F5F9",
                  color: "#64748B",
                };
                return (
                  <Link
                    key={assignment.id}
                    href={`/opdrachten/${assignment.id}`}
                    className="flex items-center gap-3 rounded-2xl border px-3 py-3"
                    style={{ borderColor: "var(--color-border)" }}
                  >
                    <FileText
                      size={17}
                      style={{ color: "var(--color-secondary)" }}
                    />
                    <span className="min-w-0 flex-1">
                      <span
                        className="block font-mono text-xs font-black"
                        style={{ color: "var(--color-primary)" }}
                      >
                        {assignment.code}
                      </span>
                      <span
                        className="block truncate text-xs font-semibold"
                        style={{ color: "var(--color-secondary)" }}
                      >
                        {assignment.title} ·{" "}
                        {formatDate(assignment.scheduledDate)}
                      </span>
                    </span>
                    <span
                      className="rounded-full px-2 py-1 text-[10px] font-black"
                      style={{ backgroundColor: cfg.bg, color: cfg.color }}
                    >
                      {STATUS_LABEL[assignment.status] ?? assignment.status}
                    </span>
                  </Link>
                );
              })
            ) : (
              <p
                className="rounded-2xl bg-slate-50 p-4 text-sm font-semibold"
                style={{ color: "var(--color-secondary)" }}
              >
                Nog geen aanvragen.
              </p>
            )}
          </div>
        </div>

        <div
          className="rounded-[22px] border bg-white p-4 shadow-sm"
          style={{ borderColor: "var(--color-border)" }}
        >
          <div className="mb-3 flex items-center justify-between">
            <h2
              className="text-base font-black"
              style={{ color: "var(--color-primary)" }}
            >
              Recente activiteit
            </h2>
            <Link
              href="/meldingen"
              className="text-xs font-black"
              style={{ color: "var(--color-accent)" }}
            >
              Alle meldingen
            </Link>
          </div>
          <div className="space-y-2.5">
            {recentNotifications.length > 0 ? (
              recentNotifications.map((item) => (
                <Link
                  key={item.id}
                  href={item.href}
                  className="flex items-start gap-3 rounded-2xl border px-3 py-3"
                  style={{ borderColor: "var(--color-border)" }}
                >
                  <span
                    className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full"
                    style={{
                      backgroundColor:
                        item.priority === "high" ? "#FEF3C7" : "#E8FBFA",
                      color:
                        item.priority === "high"
                          ? "#B45309"
                          : "var(--color-accent)",
                    }}
                  >
                    {item.priority === "high" ? (
                      <Bell size={15} />
                    ) : (
                      <CheckCircle2 size={15} />
                    )}
                  </span>
                  <span className="min-w-0">
                    <span
                      className="block line-clamp-1 text-sm font-black"
                      style={{ color: "var(--color-primary)" }}
                    >
                      {item.title}
                    </span>
                    <span
                      className="mt-0.5 block line-clamp-2 text-xs font-semibold"
                      style={{ color: "var(--color-secondary)" }}
                    >
                      {item.body}
                    </span>
                  </span>
                </Link>
              ))
            ) : (
              <p
                className="rounded-2xl bg-slate-50 p-4 text-sm font-semibold"
                style={{ color: "var(--color-secondary)" }}
              >
                Geen recente activiteit.
              </p>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
