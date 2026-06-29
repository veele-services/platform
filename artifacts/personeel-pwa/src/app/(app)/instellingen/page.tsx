export const dynamic = "force-dynamic";

import Link from "next/link";
import { BellRing, ChevronRight, KeyRound, UserCircle } from "lucide-react";
import { MobilePageShell } from "@/components/MobilePageShell";

const SETTINGS_LINKS = [
  {
    href: "/profiel",
    label: "Profiel",
    description: "NAW-gegevens, telefoonnummer en profielfoto.",
    Icon: UserCircle,
  },
  {
    href: "/beveiliging",
    label: "Beveiliging",
    description: "Wachtwoord wijzigen en tweestapsverificatie beheren.",
    Icon: KeyRound,
  },
  {
    href: "/instellingen/meldingen",
    label: "Meldingen",
    description: "E-mail, push en planningvoorkeuren instellen.",
    Icon: BellRing,
  },
];

export default function InstellingenPage() {
  return (
    <MobilePageShell
      title="Instellingen"
      subtitle="Beheer je profiel, beveiliging en meldingen."
    >
      <section className="rounded-[22px] bg-white p-4 shadow-[0_14px_34px_rgba(8,29,58,0.10)] md:p-5">
        <div className="space-y-3">
          {SETTINGS_LINKS.map(({ href, label, description, Icon }) => (
            <Link
              key={href}
              href={href}
              className="flex items-center gap-3 rounded-[20px] border bg-white px-3 py-3 shadow-sm active:scale-[0.99]"
              style={{ borderColor: "var(--color-border)" }}
            >
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#E8FBFA] text-[#009E9A]">
                <Icon size={21} strokeWidth={2.4} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-black text-[#081D3A]">
                  {label}
                </span>
                <span className="block text-xs font-semibold text-slate-500">
                  {description}
                </span>
              </span>
              <ChevronRight size={19} className="text-slate-400" />
            </Link>
          ))}
        </div>
      </section>
    </MobilePageShell>
  );
}
