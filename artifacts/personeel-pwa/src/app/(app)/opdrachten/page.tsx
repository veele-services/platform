export const dynamic = "force-dynamic";

import { ChevronRight, UserCircle } from "lucide-react";
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

function getCurrentWeekDays(): PlanningWeekDay[] {
  const today = todayKey();
  const todayDate = parseDateKey(today);
  const dayOfWeek = todayDate.getUTCDay() === 0 ? 7 : todayDate.getUTCDay();
  const monday = new Date(todayDate);
  monday.setUTCDate(todayDate.getUTCDate() - dayOfWeek + 1);

  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(monday);
    date.setUTCDate(monday.getUTCDate() + index);

    return {
      key:      formatDateKey(date),
      label:    DAY_LABELS[date.getUTCDay()],
      day:      date.getUTCDate(),
      isActive: formatDateKey(date) === today,
    };
  });
}

function VeeleLogo() {
  return (
    <div className="flex items-center gap-2.5">
      <span className="relative flex h-10 w-10 items-center justify-center">
        <span
          className="absolute h-9 w-2.5 -rotate-[24deg] rounded-full"
          style={{ backgroundColor: "#00B7B3" }}
        />
        <span className="absolute h-9 w-2.5 rotate-[24deg] rounded-full bg-white" />
      </span>
      <span className="leading-none">
        <span className="block text-[18px] font-black tracking-[0.24em] text-white">VEELE</span>
        <span className="mt-1 block text-[8px] font-bold tracking-[0.43em]" style={{ color: "#BFECEA" }}>
          SERVICES
        </span>
      </span>
    </div>
  );
}

function RealtimeIndicator() {
  return (
    <div className="inline-flex shrink-0 items-center gap-2 text-xs font-semibold sm:text-sm" style={{ color: "#9DE7E5" }}>
      <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: "#4ED9D5" }} />
      Realtime gekoppeld
    </div>
  );
}

function StatusPill({ status }: { status: PlanningStatus }) {
  const style = STATUS_STYLES[status];

  return (
    <span
      className="rounded-lg px-3 py-1 text-xs font-black tracking-wide"
      style={{ backgroundColor: style.background, color: style.color }}
    >
      {status}
    </span>
  );
}

function PlanningCard({ item }: { item: MockPlanningItem }) {
  return (
    <article
      className="relative rounded-[18px] bg-white px-5 py-4 shadow-sm"
      style={{ boxShadow: "0 10px 28px rgba(8,29,58,0.07)" }}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="font-mono text-[15px] font-black leading-tight" style={{ color: "var(--color-primary)" }}>
            {item.code}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <p className="text-[24px] font-black leading-none tracking-tight" style={{ color: "var(--color-primary)" }}>
              {item.time}
            </p>
            {item.isNow ? (
              <span className="inline-flex items-center gap-1.5 text-xs font-black uppercase" style={{ color: "var(--color-accent)" }}>
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: "var(--color-accent)" }} />
                Nu
              </span>
            ) : null}
          </div>
        </div>
        <StatusPill status={item.status} />
      </div>

      <div className="mt-2 pr-8">
        <h2 className="text-[18px] font-black leading-tight" style={{ color: "var(--color-primary)" }}>
          {item.objectName}
        </h2>
        <p className="mt-1 text-[16px] font-semibold leading-tight" style={{ color: "var(--color-primary)" }}>
          {item.contactName}
        </p>
        <p className="mt-1 text-[15px] font-medium leading-tight" style={{ color: "var(--color-primary)" }}>
          {item.address}
        </p>
        <p className="mt-1 text-[15px] font-medium leading-tight" style={{ color: "var(--color-primary)" }}>
          {item.postalCity}
        </p>
        <p className="mt-1 text-[15px] font-medium leading-tight" style={{ color: "var(--color-primary)" }}>
          {item.phone}
        </p>
      </div>

      <ChevronRight
        className="absolute right-5 top-1/2 -translate-y-1/2"
        size={28}
        strokeWidth={2.2}
        style={{ color: "#96A3B6" }}
      />
    </article>
  );
}

export default function OpdrachtenPage() {
  const weekDays = getCurrentWeekDays();

  return (
    <div className="min-h-screen bg-[#F6F8FB] md:rounded-[32px] md:bg-white">
      <section
        className="relative overflow-hidden px-6 pb-4 pt-8 text-white md:rounded-t-[32px]"
        style={{ background: "linear-gradient(180deg, #06224A 0%, #061F44 100%)" }}
      >
        <div className="flex items-center justify-between">
          <VeeleLogo />
          <button
            type="button"
            className="flex h-11 w-11 items-center justify-center rounded-full bg-white text-[#061F44] shadow-lg active:scale-95"
            aria-label="Profiel"
          >
            <UserCircle size={30} strokeWidth={2.5} />
          </button>
        </div>

        <div className="mt-8 flex flex-wrap items-end justify-between gap-3">
          <h1 className="text-[34px] font-black leading-none tracking-tight">Mijn planning</h1>
          <RealtimeIndicator />
        </div>

        <PlanningWeekStrip days={weekDays} />
      </section>

      <section className="space-y-3 px-4 pb-8 pt-3">
        {MOCK_ITEMS.map((item) => (
          <PlanningCard key={item.code} item={item} />
        ))}
      </section>
    </div>
  );
}
