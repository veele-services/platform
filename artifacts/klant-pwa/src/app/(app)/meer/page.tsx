export const dynamic = "force-dynamic";

import Link from "next/link";
import {
  Building2,
  CalendarDays,
  FileCheck2,
  FileText,
  Headphones,
  MailOpen,
  Settings,
  ShieldCheck,
  UserCircle,
  WalletCards,
} from "lucide-react";
import { PageShell } from "@/components/PageShell";

const ITEMS = [
  { href: "/opdrachten",        label: "Opdrachten",   description: "Status, planning en opdrachtgeschiedenis.", Icon: CalendarDays },
  { href: "/objecten",          label: "Objecten",     description: "Uw locaties en objectinformatie.", Icon: Building2 },
  { href: "/meldingen/tickets", label: "Support",      description: "Tickets bekijken of een vraag stellen.", Icon: Headphones },
  { href: "/financieel",        label: "Financieel",   description: "Facturen, betalingen en offertes.", Icon: WalletCards },
  { href: "/documenten",        label: "Documenten",   description: "Gedeelde documenten downloaden.", Icon: FileText },
  { href: "/rapporten",         label: "Rapportages",  description: "Goedgekeurde werkrapportages.", Icon: FileCheck2 },
  { href: "/meldingen",         label: "Meldingen",    description: "Actuele meldingen en acties.", Icon: MailOpen },
  { href: "/profiel",           label: "Profiel",      description: "Contactgegevens en bedrijfsprofiel.", Icon: UserCircle },
  { href: "/beveiliging",       label: "Beveiliging",  description: "Wachtwoord en toegang beveiligen.", Icon: ShieldCheck },
  { href: "/instellingen",      label: "Instellingen", description: "E-mail- en notificatievoorkeuren.", Icon: Settings },
];

export default function MeerPage() {
  return (
    <PageShell title="Meer" subtitle="Alle klantportaalfuncties op een vaste plek.">
      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {ITEMS.map(({ href, label, description, Icon }) => (
          <Link
            key={href}
            href={href}
            className="rounded-[22px] border bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
            style={{ borderColor: "var(--color-border)" }}
          >
            <div className="flex items-start gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#E8FBFA] text-[#087C79]">
                <Icon size={21} />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-black" style={{ color: "var(--color-primary)" }}>
                  {label}
                </span>
                <span className="mt-1 block text-sm font-semibold leading-6" style={{ color: "var(--color-secondary)" }}>
                  {description}
                </span>
              </span>
            </div>
          </Link>
        ))}
      </section>

      <section className="rounded-[22px] bg-white p-5 shadow-sm">
        <div className="flex items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#E8FBFA] text-[#087C79]">
            <Headphones size={21} />
          </span>
          <div>
            <h2 className="text-lg font-black" style={{ color: "var(--color-primary)" }}>
              Hulp & contact
            </h2>
            <p className="mt-1 text-sm font-semibold leading-6" style={{ color: "var(--color-secondary)" }}>
              Stel een vraag over een object, opdracht, factuur of algemeen onderwerp via Support.
            </p>
            <Link
              href="/meldingen/tickets"
              className="mt-4 inline-flex rounded-2xl px-4 py-2.5 text-sm font-black text-white"
              style={{ backgroundColor: "var(--color-accent)" }}
            >
              Naar Support
            </Link>
          </div>
        </div>
      </section>
    </PageShell>
  );
}
