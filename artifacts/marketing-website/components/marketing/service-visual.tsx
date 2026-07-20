import { Building2, Check, ShieldCheck, Sparkles, UsersRound } from "lucide-react";
import { cn } from "@/lib/utils";

const variants = {
  schoonmaak: { icon: Sparkles, label: "Schoonmaak", copy: "Zichtbare kwaliteit, passend bij het ritme van uw locatie." },
  beveiliging: { icon: ShieldCheck, label: "Beveiliging", copy: "Professionele aandacht voor mensen, toegang en omgeving." },
  facilitair: { icon: UsersRound, label: "Facilitair", copy: "Gastvrije ondersteuning die de dagelijkse operatie laat werken." },
  algemeen: { icon: Building2, label: "Veele Services", copy: "Schoon. Veilig. Gastvrij. Onder één heldere regie." },
};

export function ServiceVisual({ kind = "algemeen", className }: { kind?: keyof typeof variants; className?: string }) {
  const item = variants[kind];
  const Icon = item.icon;

  return (
    <div className={cn("relative isolate min-h-[360px] overflow-hidden rounded-[2rem] border border-white/15 bg-[var(--navy-900)] p-5 text-white shadow-[var(--shadow-lg)] sm:p-8", className)}>
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_78%_12%,rgba(41,211,194,.28),transparent_24%),linear-gradient(135deg,transparent_25%,rgba(255,255,255,.04)_25.2%,transparent_25.6%)]" />
      <div className="absolute -bottom-28 -right-24 size-80 rounded-full border-[48px] border-white/[.045]" />
      <div className="absolute inset-x-5 top-5 h-28 rounded-2xl border border-white/10 bg-white/[.045] sm:inset-x-8 sm:top-8">
        <div className="flex h-full items-center gap-4 px-5">
          <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-[var(--aqua)] text-brand-navy shadow-[0_10px_28px_rgba(41,211,194,.25)]"><Icon aria-hidden="true" className="size-6" /></div>
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[.18em] text-brand-aqua">{item.label}</p>
            <div className="mt-2 h-2 w-36 max-w-full rounded-full bg-white/15"><div className="h-full w-2/3 rounded-full bg-white/45" /></div>
            <div className="mt-2 h-2 w-24 rounded-full bg-white/10" />
          </div>
        </div>
      </div>
      <div className="absolute inset-x-5 bottom-5 top-40 grid gap-3 sm:inset-x-8 sm:bottom-8 sm:grid-cols-[1.25fr_.75fr]">
        <div className="flex flex-col justify-end rounded-2xl border border-white/10 bg-[linear-gradient(145deg,rgba(255,255,255,.09),rgba(255,255,255,.025))] p-5 backdrop-blur-sm">
          <p className="max-w-sm text-xl font-extrabold leading-tight tracking-[-.025em] sm:text-2xl">{item.copy}</p>
          <div className="mt-5 flex items-center gap-2 text-xs font-semibold text-white/60"><span className="flex size-5 items-center justify-center rounded-full bg-[var(--aqua)] text-brand-navy"><Check aria-hidden="true" className="size-3" /></span> Duidelijke afspraken</div>
        </div>
        <div className="hidden flex-col justify-between rounded-2xl border border-white/10 bg-white/[.055] p-4 sm:flex">
          <div className="ml-auto size-2 rounded-full bg-[var(--aqua)] shadow-[0_0_18px_var(--aqua)]" />
          <div className="space-y-2">
            {["w-4/5", "w-full", "w-2/3"].map((width) => <div key={width} className={`h-2 rounded-full bg-white/15 ${width}`} />)}
          </div>
        </div>
      </div>
    </div>
  );
}
