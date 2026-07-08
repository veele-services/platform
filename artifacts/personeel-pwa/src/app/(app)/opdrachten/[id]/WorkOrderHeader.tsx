import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { FieldgridLogo, MobileHeaderBar } from "@/components/MobileHeader";
import { getMyTicketSummary } from "@/actions/messages";
import { getMyNotificationSummary } from "@/actions/notifications";
import { requireCurrentPersonnelPortalTenantId } from "@/lib/auth/tenant";
import { getTenantBranding } from "@workspace/db";
import { getHeaderStatus, type AssignmentView, type WorkOrderTab } from "./work-order-data";

type Props = {
  assignment: AssignmentView;
  activeTab:  WorkOrderTab;
};

const TABS: { key: WorkOrderTab; label: string }[] = [
  { key: "home", label: "Home" },
  { key: "werkzaamheden", label: "Werkzaamheden" },
  { key: "rapportage", label: "Rapportage" },
];

function tabHref(id: string, tab: WorkOrderTab): string {
  if (tab === "home") return `/opdrachten/${id}`;
  return `/opdrachten/${id}?tab=${tab}`;
}

export async function WorkOrderHeader({ assignment, activeTab }: Props) {
  const statusBadge = getHeaderStatus(assignment.status);
  const tenantId = await requireCurrentPersonnelPortalTenantId();
  const [notificationSummary, ticketSummary, branding] = await Promise.all([
    getMyNotificationSummary(),
    getMyTicketSummary(),
    tenantId ? getTenantBranding(tenantId) : Promise.resolve(null),
  ]);

  return (
    <section
      className="overflow-hidden text-white md:rounded-t-[32px]"
      style={{ background: `linear-gradient(180deg, ${branding?.primaryColor ?? "#06224A"} 0%, #061F44 100%)` }}
    >
      <MobileHeaderBar
        notificationSummary={notificationSummary}
        ticketSummary={ticketSummary}
        leading={
          <div className="flex min-w-0 items-center gap-3">
            <Link
              href="/opdrachten"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white active:scale-95"
              aria-label="Terug naar planning"
            >
              <ChevronLeft size={29} strokeWidth={2.35} />
            </Link>
            <FieldgridLogo branding={branding ?? undefined} />
          </div>
        }
      />

      <div className="flex items-end justify-between gap-3 px-5 pb-7 pt-4">
        <div className="min-w-0">
          <p className="mb-2 text-[13px] font-semibold uppercase tracking-wide text-white/72">
            Werkbon
          </p>
          <h1 className="min-w-0 truncate font-mono text-[25px] font-black leading-none tracking-tight">
            {assignment.code || "Werkbon"}
          </h1>
        </div>
        <span
          className="shrink-0 rounded-full px-4 py-2 text-[13px] font-black"
          style={{ backgroundColor: statusBadge.background, color: statusBadge.color }}
        >
          {statusBadge.label}
        </span>
      </div>

      <nav className="grid grid-cols-3 px-4 text-center text-[14px] font-bold">
        {TABS.map((tab) => {
          const isActive = tab.key === activeTab;

          return (
            <Link
              key={tab.key}
              href={tabHref(assignment.id, tab.key)}
              className="relative py-3"
              style={{ color: isActive ? "var(--color-accent)" : "rgba(255,255,255,0.78)" }}
            >
              {tab.label}
              {isActive ? (
                <span className="absolute inset-x-0 bottom-0 h-0.5 rounded-full" style={{ backgroundColor: "var(--color-accent)" }} />
              ) : null}
            </Link>
          );
        })}
      </nav>
    </section>
  );
}
