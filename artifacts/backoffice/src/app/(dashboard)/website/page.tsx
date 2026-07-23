import type { Metadata } from "next";
import Link from "next/link";
import {
  CircleAlert,
  FileText,
  Globe2,
  Settings2,
  ShieldCheck,
} from "lucide-react";
import type { WebsiteSiteSettings } from "@workspace/db";
import { getWebsiteOverviewAction } from "@/app/actions/website";
import { ForbiddenPage } from "@/components/layout/ForbiddenPage";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { WebsiteSettingsForm } from "@/components/website/WebsiteSettingsForm";
import { WebsiteTabs } from "@/components/website/WebsiteTabs";
import { TenantPageHeader, TenantPageShell } from "@/components/tenant-ui";
import { hasPermission } from "@/lib/auth/permissions";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Website" };

function initialSettings(name: string): WebsiteSiteSettings {
  const websiteName = name.trim().slice(0, 160) || "Mijn website";
  return {
    schemaVersion: 1,
    name: websiteName,
    defaultLocale: "nl-NL",
    theme: {
      schemaVersion: 1,
      colors: {
        background: "#FFFFFF",
        foreground: "#081D3A",
        primary: "#00B7B3",
        primaryForeground: "#FFFFFF",
        accent: "#E0FAFB",
        accentForeground: "#081D3A",
      },
      headingFont: "manrope",
      bodyFont: "inter",
      radius: "medium",
      spacing: "comfortable",
      contentWidth: "standard",
      buttonStyle: "solid",
      surfaceStyle: "bordered",
      logoMediaId: null,
      faviconMediaId: null,
    },
    contact: {
      companyName: websiteName,
      email: null,
      phone: null,
      street: null,
      postalCode: null,
      city: null,
      countryCode: "NL",
      openingHours: [],
    },
    socialLinks: [],
    defaultSeo: {
      title: websiteName.slice(0, 70),
      description:
        `${websiteName} — betrouwbare service en duidelijke afspraken.`.slice(
          0,
          170,
        ),
      canonicalPath: null,
      socialImageMediaId: null,
      socialImageUrl: null,
      indexable: true,
    },
    analytics: { provider: "none" },
    seoSettings: {
      schemaVersion: 1,
      structuredData: {
        enabled: true,
        organizationType: "organization",
      },
      webmasterVerification: {
        google: null,
        bing: null,
      },
    },
  };
}

export default async function WebsiteOverviewPage() {
  const [canRead, canWriteSettings] = await Promise.all([
    hasPermission("website", "read"),
    hasPermission("website_settings", "write"),
  ]);
  if (!canRead) return <ForbiddenPage resource="website" action="read" />;

  const overview = await getWebsiteOverviewAction();
  if (!overview.site) {
    return (
      <TenantPageShell size="default">
        <TenantPageHeader
          title="Website"
          description="Maak een beheerde, tenant-eigen website aan. Publicatie en domeinkoppeling blijven afzonderlijke gecontroleerde stappen."
          badges={<Badge variant="outline">Niet geïnitialiseerd</Badge>}
        />
        <WebsiteTabs />
        {canWriteSettings ? (
          <WebsiteSettingsForm
            initialSettings={initialSettings(overview.tenantName)}
            canWrite
            initialize
          />
        ) : (
          <section className="veele-card">
            <h2 className="text-base font-semibold text-slate-900">
              Nog geen website
            </h2>
            <p className="mt-2 text-sm text-slate-600">
              Een gebruiker met website-instellingen schrijfrecht moet de
              website eerst initialiseren.
            </p>
          </section>
        )}
      </TenantPageShell>
    );
  }

  const site = overview.site;
  const managed = site.deliveryMode === "managed_cms";
  return (
    <TenantPageShell>
      <TenantPageHeader
        title={site.name}
        eyebrow="Websitebeheer"
        description="Operationele waarheid over delivery, domein, conceptinhoud en actieve publicatie."
        badges={
          <>
            <Badge>{managed ? "Beheerde website" : "Custom Next.js"}</Badge>
            <Badge variant="outline">Revisie {site.authoringRevision}</Badge>
          </>
        }
        actions={
          <Link
            href="/website/pages"
            className={cn(buttonVariants({ variant: "default" }))}
          >
            Pagina&apos;s beheren
          </Link>
        }
      />
      <WebsiteTabs />

      {!managed && (
        <section className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
          <div className="flex gap-3">
            <CircleAlert
              className="mt-0.5 h-5 w-5 shrink-0"
              aria-hidden="true"
            />
            <div>
              <h2 className="font-semibold">Custom website is actief</h2>
              <p className="mt-1">
                Wijzigingen in de beheerde CMS-inhoud worden niet live zolang
                Custom Next.js actief is. Deployment-infrastructuur en
                route-keys blijven verborgen voor tenantgebruikers.
              </p>
            </div>
          </div>
        </section>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          icon={<Globe2 />}
          label="Publiek domein"
          value={site.canonicalHostname ?? "Nog niet gekoppeld"}
          detail={
            site.canonicalDomainStatus ??
            "Domeinkoppeling vereist vóór publicatie"
          }
        />
        <MetricCard
          icon={<FileText />}
          label="Pagina's"
          value={String(site.pageCount)}
          detail={`${site.draftPageCount} conceptpagina${site.draftPageCount === 1 ? "" : "'s"}`}
        />
        <MetricCard
          icon={<ShieldCheck />}
          label="Actieve publicatie"
          value={
            site.activePublicationSequence
              ? `#${site.activePublicationSequence}`
              : "Geen"
          }
          detail={
            site.activePublicationHash?.slice(0, 12) ??
            "Live inhoud blijft ongewijzigd"
          }
        />
        <MetricCard
          icon={<Settings2 />}
          label="Delivery-revisie"
          value={String(site.deliveryRevision)}
          detail={
            managed
              ? "Managed CMS"
              : site.activeCustomReleaseId
                ? `Release ${site.activeCustomReleaseId}`
                : "Custom release afgeschermd"
          }
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ActionCard
          href="/website/settings"
          title="Website-instellingen"
          description="Werk publieke identiteit, contactgegevens, gecontroleerde huisstijl en SEO-standaarden bij."
        />
        <ActionCard
          href="/website/pages"
          title="Pagina's"
          description="Maak pagina's, beheer metadata en bewerk schema-gedreven contentsecties."
        />
        <ActionCard
          href="/website/navigation"
          title="Navigatie"
          description="Orden header-, footer- en juridische menu's met veilige interne en externe bestemmingen."
        />
        <ActionCard
          href="/website/forms"
          title="Formulieren"
          description="Configureer publieke contact-, offerte-, terugbel- en spoedformulieren met veilige verwerking."
        />
        <ActionCard
          href="/website/submissions"
          title="Inzendingen"
          description="Verwerk aanvragen, bewaak notificaties en converteer expliciet en idempotent naar leads."
        />
        <ActionCard
          href="/website/review"
          title="Preview en publiceren"
          description="Bekijk de volledige draft, los diagnostiek op en activeer alleen een exact gereviewde immutable publicatie."
        />
      </div>
    </TenantPageShell>
  );
}

function MetricCard({
  icon,
  label,
  value,
  detail,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <section className="veele-card">
      <div className="flex items-center gap-2 text-sm font-medium text-slate-600 [&_svg]:h-4 [&_svg]:w-4">
        {icon}
        {label}
      </div>
      <p className="mt-3 break-words text-xl font-semibold text-slate-950">
        {value}
      </p>
      <p className="mt-1 break-words text-xs text-slate-500">{detail}</p>
    </section>
  );
}

function ActionCard({
  href,
  title,
  description,
}: {
  href: string;
  title: string;
  description: string;
}) {
  return (
    <Link
      href={href}
      className="veele-card block transition-shadow hover:shadow-md"
    >
      <h2 className="font-semibold text-slate-950">{title}</h2>
      <p className="mt-2 text-sm leading-6 text-slate-600">{description}</p>
      <p className="mt-4 text-sm font-medium text-cyan-700">Openen →</p>
    </Link>
  );
}
