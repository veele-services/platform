export const dynamic = "force-dynamic";

import Link from "next/link";
import {
  Building2,
  FileCheck2,
  FileText,
  Headphones,
  MailOpen,
  Receipt,
  Settings,
  ShieldCheck,
  UserCircle,
  WalletCards,
} from "lucide-react";
import { PageShell } from "@/components/PageShell";

const ITEMS = [
  { href: "/profiel",      label: "Profiel",       description: "Contactgegevens en bedrijfsprofiel.", Icon: UserCircle },
  { href: "/beveiliging",  label: "Beveiliging",   description: "Wachtwoord en toegang beveiligen.", Icon: ShieldCheck },
  { href: "/instellingen", label: "Instellingen",  description: "E-mail- en notificatievoorkeuren.", Icon: Settings },
  { href: "/facturen",     label: "Facturen",      description: "Openstaande en betaalde facturen.", Icon: Receipt },
  { href: "/betalingen",   label: "Betalingen",    description: "Mollie betalingen en verzamelbetalingen.", Icon: WalletCards },
  { href: "/rapporten",    label: "Rapportages",   description: "Goedgekeurde werkrapportages.", Icon: FileCheck2 },
  { href: "/documenten",   label: "Documenten",    description: "Gedeelde documenten downloaden.", Icon: FileText },
  { href: "/objecten",     label: "Objecten",      description: "Uw locaties en objectinformatie.", Icon: Building2 },
  { href: "/meldingen",    label: "Meldingen",     description: "Actuele meldingen en acties.", Icon: MailOpen },
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
              Voor spoed of vragen over lopende aanvragen kunt u contact opnemen met Veele Services.
              De ticketfunctie voor klanten wordt later op deze plek uitgebreid.
            </p>
          </div>
        </div>
      </section>
    </PageShell>
  );
}
