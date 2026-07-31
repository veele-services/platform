export const dynamic = "force-dynamic";

import Link from "next/link";
import {
  Building2,
  CalendarDays,
  FileCheck2,
  FileText,
  HelpCircle,
  Headphones,
  Lightbulb,
  MailOpen,
  Settings,
  ShieldCheck,
  UserCircle,
  WalletCards,
} from "lucide-react";
import { PageShell } from "@/components/PageShell";
import {
  getCustomerPortalFeatureFlags,
  type CustomerPortalFeatureFlags,
} from "@/lib/portal-features";

const ITEMS = [
  {
    href: "/opdrachten",
    label: "Opdrachten",
    description: "Status, planning en opdrachtgeschiedenis.",
    Icon: CalendarDays,
  },
  {
    href: "/objecten",
    label: "Objecten",
    description: "Uw locaties en objectinformatie.",
    Icon: Building2,
  },
  {
    href: "/meldingen/tickets",
    label: "Support",
    description: "Tickets bekijken of een vraag stellen.",
    Icon: Headphones,
  },
  {
    href: "/offertes",
    label: "Offertes",
    description: "Offertes en akkoordstatus bekijken.",
    Icon: FileText,
    moduleKey: "finance",
  },
  {
    href: "/facturen",
    label: "Facturen",
    description: "Facturen, status en bestaande betaalopties.",
    Icon: WalletCards,
    moduleKey: "finance",
  },
  {
    href: "/documenten",
    label: "Documenten",
    description: "Gedeelde documenten downloaden.",
    Icon: FileText,
    moduleKey: "documents",
  },
  {
    href: "/rapporten",
    label: "Rapportages",
    description: "Goedgekeurde werkrapportages.",
    Icon: FileCheck2,
    moduleKey: "reporting",
  },
  {
    href: "/help",
    label: "Support",
    description: "Handleidingen en uitleg bij functies.",
    Icon: HelpCircle,
    moduleKey: "knowledgebase",
  },
  {
    href: "/roadmap/new",
    label: "Featurewens",
    description: "Dien een productwens in bij uw leverancier.",
    Icon: Lightbulb,
  },
  {
    href: "/meldingen",
    label: "Meldingen",
    description: "Actuele meldingen en acties.",
    Icon: MailOpen,
    moduleKey: "notifications",
  },
  {
    href: "/profiel",
    label: "Profiel",
    description: "Contactgegevens en bedrijfsprofiel.",
    Icon: UserCircle,
  },
  {
    href: "/beveiliging",
    label: "Beveiliging",
    description: "Wachtwoord en toegang beveiligen.",
    Icon: ShieldCheck,
  },
  {
    href: "/instellingen",
    label: "Instellingen",
    description: "E-mail- en notificatievoorkeuren.",
    Icon: Settings,
  },
] satisfies Array<{
  href: string;
  label: string;
  description: string;
  Icon: typeof Building2;
  moduleKey?: keyof CustomerPortalFeatureFlags;
}>;

type Props = {
  searchParams?: Promise<{ featureRequest?: string }>;
};

export default async function MeerPage({ searchParams }: Props) {
  const params = searchParams ? await searchParams : {};
  const featureFlags = await getCustomerPortalFeatureFlags();
  const visibleItems = ITEMS.filter(
    (item) => !item.moduleKey || featureFlags[item.moduleKey],
  );

  return (
    <PageShell
      title="Meer"
      subtitle="Alle klantportaalfuncties op een vaste plek."
    >
      {params.featureRequest === "sent" && (
        <div className="rounded-[18px] border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">
          Featurewens ontvangen. Bedankt voor uw input.
        </div>
      )}

      <section
        className="hidden rounded-xl border bg-white p-4 text-sm text-[var(--color-secondary)] md:block"
        style={{ borderColor: "var(--color-border)" }}
      >
        Op desktop vindt u deze onderdelen rechtstreeks in het hoofdmenu en het
        accountmenu.
      </section>

      <section className="grid gap-2 md:hidden">
        {visibleItems.map(({ href, label, description, Icon }) => (
          <Link
            key={href}
            href={href}
            className="rounded-xl border bg-white p-3 transition hover:bg-slate-50"
            style={{ borderColor: "var(--color-border)" }}
          >
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#E8FBFA] text-[#087C79]">
                <Icon size={19} />
              </span>
              <span className="min-w-0">
                <span
                  className="block text-sm font-semibold"
                  style={{ color: "var(--color-primary)" }}
                >
                  {label}
                </span>
                <span
                  className="mt-1 block text-sm font-semibold leading-6"
                  style={{ color: "var(--color-secondary)" }}
                >
                  {description}
                </span>
              </span>
            </div>
          </Link>
        ))}
      </section>

      <section
        className="rounded-xl border bg-white p-4 md:hidden"
        style={{ borderColor: "var(--color-border)" }}
      >
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#E8FBFA] text-[#087C79]">
            <Headphones size={21} />
          </span>
          <div>
            <h2
              className="text-lg font-semibold"
              style={{ color: "var(--color-primary)" }}
            >
              Hulp & contact
            </h2>
            <p
              className="mt-1 text-sm font-semibold leading-6"
              style={{ color: "var(--color-secondary)" }}
            >
              Stel een vraag over een object, opdracht, factuur of algemeen
              onderwerp via Support.
            </p>
            <Link
              href="/meldingen/tickets"
              className="mt-4 inline-flex rounded-2xl px-4 py-2.5 text-sm font-semibold text-white"
              style={{ backgroundColor: "var(--color-accent-accessible)" }}
            >
              Naar Support
            </Link>
          </div>
        </div>
      </section>
    </PageShell>
  );
}
