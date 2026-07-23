import {
  Building2,
  CalendarCheck2,
  Check,
  MapPin,
  ShieldCheck,
  Sparkles,
  UsersRound,
} from "lucide-react";
import { cn } from "@/lib/utils";

const variants = {
  schoonmaak: {
    icon: Sparkles,
    label: "Schoonmaak",
    copy: "Zichtbare kwaliteit, passend bij het ritme van uw locatie.",
    detail: "Werkprogramma",
  },
  beveiliging: {
    icon: ShieldCheck,
    label: "Beveiliging",
    copy: "Professionele aandacht voor mensen, toegang en omgeving.",
    detail: "Locatiebeeld",
  },
  facilitair: {
    icon: UsersRound,
    label: "Facilitair",
    copy: "Gastvrije ondersteuning die de dagelijkse operatie laat werken.",
    detail: "Dagelijkse regie",
  },
  algemeen: {
    icon: Building2,
    label: "Veele Services",
    copy: "Schoon. Veilig. Gastvrij. Onder één heldere regie.",
    detail: "Eén overzicht",
  },
};

export function ServiceVisual({ kind = "algemeen", className }: { kind?: keyof typeof variants; className?: string }) {
  const item = variants[kind];
  const Icon = item.icon;

  return (
    <div className={cn("relative isolate min-h-[360px] overflow-hidden rounded-[2rem] border border-white/15 bg-[var(--navy-900)] p-5 text-white shadow-[var(--shadow-lg)] sm:p-7", className)}>
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_76%_18%,rgba(41,211,194,.25),transparent_24%),linear-gradient(145deg,transparent_38%,rgba(255,255,255,.035)_38.2%,transparent_38.6%)]" />
      <div className="absolute -right-28 top-16 size-72 rounded-full border-[42px] border-white/[.04]" />

      <div className="relative flex items-center justify-between border-b border-white/10 pb-4">
        <div className="flex items-center gap-3">
          <span className="flex size-9 items-center justify-center rounded-xl bg-[var(--aqua)] text-brand-navy shadow-[0_10px_28px_rgba(41,211,194,.2)]"><Icon aria-hidden="true" className="size-[1.1rem]" /></span>
          <span>
            <span className="block text-[9px] font-bold uppercase tracking-[.18em] text-white/40">Servicebeeld</span>
            <span className="mt-0.5 block text-xs font-bold">{item.label}</span>
          </span>
        </div>
        <span className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[.05] px-2.5 py-1 text-[9px] font-bold uppercase tracking-[.12em] text-white/55">
          <span className="size-1.5 rounded-full bg-[var(--aqua)] shadow-[0_0_12px_var(--aqua)]" />
          In beeld
        </span>
      </div>

      <div className="relative mt-5 grid min-h-[270px] gap-3 sm:grid-cols-[1.25fr_.75fr]">
        <div className="relative flex min-h-56 flex-col justify-between overflow-hidden rounded-[1.4rem] border border-white/10 bg-[linear-gradient(145deg,rgba(255,255,255,.09),rgba(255,255,255,.025))] p-5 backdrop-blur-sm sm:min-h-0">
          <div className="absolute -right-10 -top-10 size-40 rounded-full border border-[var(--aqua)]/20" />
          <div className="absolute -right-1 top-9 size-24 rounded-full border border-[var(--aqua)]/15" />
          <span className="relative flex size-16 items-center justify-center rounded-full border border-[var(--aqua)]/25 bg-[var(--aqua)]/10 text-brand-aqua">
            <span className="absolute inset-2 rounded-full border border-dashed border-[var(--aqua)]/30" />
            <Icon aria-hidden="true" className="relative size-6" />
          </span>
          <div className="relative">
            <p className="max-w-sm text-xl font-extrabold leading-[1.15] tracking-[-.035em] sm:text-2xl">{item.copy}</p>
            <div className="mt-4 flex items-center gap-2 text-[11px] font-semibold text-white/60"><span className="flex size-5 items-center justify-center rounded-full bg-[var(--aqua)] text-brand-navy"><Check aria-hidden="true" className="size-3" /></span>Duidelijke afspraken</div>
          </div>
        </div>

        <div className="hidden gap-3 sm:grid sm:grid-rows-[1fr_auto]">
          <div className="rounded-[1.4rem] border border-white/10 bg-white/[.05] p-4">
            <p className="text-[9px] font-bold uppercase tracking-[.16em] text-white/40">{item.detail}</p>
            <div className="mt-4 space-y-2.5">
              {[82, 64, 74].map((width, index) => (
                <div key={width} className="flex items-center gap-2">
                  <span className={`size-1.5 rounded-full ${index === 0 ? "bg-[var(--aqua)]" : "bg-white/20"}`} />
                  <span className="h-1.5 rounded-full bg-white/12" style={{ width: `${width}%` }} />
                </div>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <span className="flex aspect-square items-center justify-center rounded-[1.1rem] border border-white/10 bg-white/[.045] text-white/55"><MapPin aria-hidden="true" className="size-5" /></span>
            <span className="flex aspect-square items-center justify-center rounded-[1.1rem] border border-white/10 bg-[var(--aqua)] text-brand-navy"><CalendarCheck2 aria-hidden="true" className="size-5" /></span>
          </div>
        </div>
      </div>
    </div>
  );
}
