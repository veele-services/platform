export const dynamic = "force-dynamic";

import { getMyLeavePeriods, type LeavePeriod } from "@/actions/leave";
import { MobilePageShell } from "@/components/MobilePageShell";
import { VerlofForm } from "./VerlofForm";

const LEAVE_TYPE_LABELS: Record<string, string> = {
  vakantie: "Vakantie",
  ziekte: "Ziekte",
  overig: "Overig",
};

const STATUS_LABELS: Record<string, string> = {
  pending: "Open",
  approved: "Goedgekeurd",
  rejected: "Afgewezen",
};

const STATUS_STYLES: Record<string, string> = {
  pending: "bg-amber-50 text-amber-700",
  approved: "bg-emerald-50 text-emerald-700",
  rejected: "bg-red-50 text-red-600",
};

function formatDate(dateStr: string): string {
  const date = new Date(`${dateStr}T00:00:00`);
  return date.toLocaleDateString("nl-NL", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function getEndDate(period: LeavePeriod): string {
  return period.endDate ?? period.startDate;
}

function isExpired(period: LeavePeriod, today: string): boolean {
  return getEndDate(period) < today;
}

function splitLeavePeriods(periods: LeavePeriod[]) {
  const today = new Date().toISOString().slice(0, 10);
  return {
    open: periods.filter((period) => period.status === "pending" && !isExpired(period, today)),
    closed: periods.filter((period) => period.status !== "pending" && !isExpired(period, today)),
    expired: periods.filter((period) => isExpired(period, today)),
  };
}

export default async function VerlofPage() {
  const periods = await getMyLeavePeriods();
  const grouped = splitLeavePeriods(periods);

  return (
    <MobilePageShell
      title="Verlof"
      subtitle="Vraag verlof aan en volg je aanvragen."
    >
      <section className="rounded-[22px] bg-white p-4 shadow-[0_14px_34px_rgba(8,29,58,0.11)]">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-black text-[var(--color-primary)]">Nieuwe aanvraag</h2>
            <p className="mt-0.5 text-xs font-semibold text-slate-500">
              Compact invullen, daarna verwerkt planning je aanvraag.
            </p>
          </div>
        </div>
        <VerlofForm />
      </section>

      <LeaveGroup title="Open aanvragen" items={grouped.open} emptyText="Geen open verlofaanvragen." />
      <LeaveGroup title="Gesloten aanvragen" items={grouped.closed} emptyText="Geen gesloten verlofaanvragen." />
      <LeaveGroup title="Verlopen aanvragen" items={grouped.expired} emptyText="Geen verlopen verlofaanvragen." />
    </MobilePageShell>
  );
}

function LeaveGroup({
  title,
  items,
  emptyText,
}: {
  title: string;
  items: LeavePeriod[];
  emptyText: string;
}) {
  return (
    <section className="rounded-[22px] bg-white p-4 shadow-[0_14px_34px_rgba(8,29,58,0.09)]">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-base font-black text-[var(--color-primary)]">{title}</h2>
        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-black text-slate-500">
          {items.length}
        </span>
      </div>

      {items.length === 0 ? (
        <p className="rounded-2xl bg-slate-50 px-3 py-3 text-sm font-semibold text-slate-500">
          {emptyText}
        </p>
      ) : (
        <div className="space-y-2">
          {items.map((period) => (
            <LeaveItem key={period.id} period={period} />
          ))}
        </div>
      )}
    </section>
  );
}

function LeaveItem({ period }: { period: LeavePeriod }) {
  const range =
    period.endDate && period.endDate !== period.startDate
      ? `${formatDate(period.startDate)} - ${formatDate(period.endDate)}`
      : formatDate(period.startDate);

  return (
    <article className="rounded-2xl border border-slate-100 bg-[#F8FAFC] px-3 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-black text-[var(--color-primary)]">
            {LEAVE_TYPE_LABELS[period.leaveType] ?? period.leaveType}
          </p>
          <p className="mt-0.5 text-xs font-bold text-slate-500">{range}</p>
          {period.reason ? (
            <p className="mt-1 line-clamp-2 text-xs font-semibold text-slate-500">
              {period.reason}
            </p>
          ) : null}
        </div>
        <span
          className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-black ${
            STATUS_STYLES[period.status] ?? "bg-slate-100 text-slate-600"
          }`}
        >
          {STATUS_LABELS[period.status] ?? period.status}
        </span>
      </div>
    </article>
  );
}
