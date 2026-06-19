export const dynamic = "force-dynamic";

import { ChevronRight } from "lucide-react";
import { PlanningWeekStrip, type PlanningWeekDay } from "@/components/PlanningWeekStrip";

type PlanningStatus = "NIEUW" | "GEZIEN" | "GESTART" | "AFGEROND";

type MockPlanningItem = {
  code: string;
  time: string;
  isNow?: boolean;
  objectName: string;
  contactName: string;
  address: string;
  postalCity: string;
  phone: string;
  status: PlanningStatus;
};

const MOCK_ITEMS: MockPlanningItem[] = [
  {
    code:        "SCH-2026-0600001",
    time:        "08:00 - 10:00",
    isNow:       true,
    objectName:  "VvE Residentie Zeezicht",
    contactName: "Chantal Veele",
    address:     "Strandweg 14",
    postalCity:  "2586 JK Den Haag",
    phone:       "06-34108400",
    status:      "NIEUW",
  },
  {
    code:        "BEV-2026-0600002",
    time:        "14:00 - 22:00",
    objectName:  "Horeca De Haven",
    contactName: "Michael Veele",
    address:     "Westplein 8",
    postalCity:  "3016 BM Rotterdam",
    phone:       "06-24291576",
    status:      "GEZIEN",
  },
  {
    code:        "FAC-2026-0600003",
    time:        "18:00 - 23:30",
    objectName:  "Eventlocatie Houtrust",
    contactName: "Danny de Groot",
    address:     "Laan van Poot 353",
    postalCity:  "2566 DA Den Haag",
    phone:       "070-1234567",
    status:      "GESTART",
  },
  {
    code:        "SCH-2026-0600004",
    time:        "07:30 - 09:00",
    objectName:  "Kantoor Weststaete",
    contactName: "Jeroen Smit",
    address:     "Delftseplein 27",
    postalCity:  "3013 AA Rotterdam",
    phone:       "010-5551234",
    status:      "AFGEROND",
  },
];

const STATUS_STYLES: Record<PlanningStatus, { background: string; color: string }> = {
  NIEUW:     { background: "#EAF5FF", color: "#2563A9" },
  GEZIEN:    { background: "#E9FBF5", color: "#139873" },
  GESTART:   { background: "#FFF4D8", color: "#C68212" },
  AFGEROND:  { background: "#E6F8ED", color: "#249357" },
};

const DAY_LABELS = ["Zo", "Ma", "Di", "Wo", "Do", "Vr", "Za"];
const DAYS_BEFORE_TODAY = 14;
const TOTAL_PLANNING_DAYS = 35;

function todayKey(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Amsterdam",
    year:     "numeric",
    month:    "2-digit",
    day:      "2-digit",
  }).format(new Date());
}

function parseDateKey(dateKey: string): Date {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function formatDateKey(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getPlanningDays(): PlanningWeekDay[] {
  const today = todayKey();
  const todayDate = parseDateKey(today);
  const firstDate = new Date(todayDate);
  firstDate.setUTCDate(todayDate.getUTCDate() - DAYS_BEFORE_TODAY);

  return Array.from({ length: TOTAL_PLANNING_DAYS }, (_, index) => {
    const date = new Date(firstDate);
    date.setUTCDate(firstDate.getUTCDate() + index);

    return {
      key:      formatDateKey(date),
      label:    DAY_LABELS[date.getUTCDay()],
      day:      date.getUTCDate(),
      isActive: formatDateKey(date) === today,
    };
  });
}

function RealtimeIndicator() {
  return (
    <span
      className="h-2.5 w-2.5 shrink-0 rounded-full"
      style={{ backgroundColor: "#4ED9D5", boxShadow: "0 0 0 4px rgba(78,217,213,0.15)" }}
      aria-label="Realtime gekoppeld"
      title="Realtime gekoppeld"
    />
  );
}

function StatusPill({ status }: { status: PlanningStatus }) {
  const style = STATUS_STYLES[status];

  return (
    <span
      className="rounded-lg px-2.5 py-1 text-[11px] font-black tracking-wide"
      style={{ backgroundColor: style.background, color: style.color }}
    >
      {status}
    </span>
  );
}

function PlanningCard({ item }: { item: MockPlanningItem }) {
  return (
    <article
      className="relative rounded-[18px] bg-white px-4 py-3.5 shadow-sm"
      style={{ boxShadow: "0 10px 24px rgba(8,29,58,0.06)" }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono text-[12px] font-black leading-tight" style={{ color: "var(--color-primary)" }}>
            {item.code}
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <p className="text-[21px] font-black leading-none tracking-tight" style={{ color: "var(--color-primary)" }}>
              {item.time}
            </p>
            {item.isNow ? (
              <span className="inline-flex items-center gap-1.5 text-[11px] font-black uppercase" style={{ color: "var(--color-accent)" }}>
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: "var(--color-accent)" }} />
                Nu
              </span>
            ) : null}
          </div>
        </div>
        <StatusPill status={item.status} />
      </div>

      <div className="mt-2 pr-8">
        <h2 className="text-[16px] font-black leading-tight" style={{ color: "var(--color-primary)" }}>
          {item.objectName}
        </h2>
        <p className="mt-1 text-[14px] font-semibold leading-tight" style={{ color: "var(--color-primary)" }}>
          {item.contactName}
        </p>
        <p className="mt-0.5 text-[13px] font-medium leading-tight" style={{ color: "var(--color-primary)" }}>
          {item.address}
        </p>
        <p className="mt-0.5 text-[13px] font-medium leading-tight" style={{ color: "var(--color-primary)" }}>
          {item.postalCity}
        </p>
        <p className="mt-0.5 text-[13px] font-medium leading-tight" style={{ color: "var(--color-primary)" }}>
          {item.phone}
        </p>
      </div>

      <ChevronRight
        className="absolute right-5 top-1/2 -translate-y-1/2"
        size={24}
        strokeWidth={2.2}
        style={{ color: "#96A3B6" }}
      />
    </article>
  );
}

export default function OpdrachtenPage() {
  const planningDays = getPlanningDays();

  return (
    <div className="min-h-screen bg-[#F6F8FB] md:rounded-[32px] md:bg-white">
      <section
        className="relative overflow-hidden px-4 pb-3 pt-4 text-white md:rounded-t-[32px]"
        style={{ background: "linear-gradient(180deg, #06224A 0%, #061F44 100%)" }}
      >
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h1 className="text-[27px] font-black leading-none tracking-tight">Mijn planning</h1>
          <RealtimeIndicator />
        </div>

        <PlanningWeekStrip days={planningDays} />
      </section>

      <section className="space-y-3 px-3.5 pb-8 pt-3">
        {MOCK_ITEMS.map((item) => (
          <PlanningCard key={item.code} item={item} />
        ))}
      </section>
    </div>
  );
}
