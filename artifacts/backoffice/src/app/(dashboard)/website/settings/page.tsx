import type { Metadata } from "next";
import Link from "next/link";
import { getWebsiteSettingsAction } from "@/app/actions/website";
import { ForbiddenPage } from "@/components/layout/ForbiddenPage";
import { WebsiteSettingsForm } from "@/components/website/WebsiteSettingsForm";
import { WebsiteTabs } from "@/components/website/WebsiteTabs";
import { TenantPageHeader, TenantPageShell } from "@/components/tenant-ui";
import { hasPermission } from "@/lib/auth/permissions";

export const metadata: Metadata = { title: "Website-instellingen" };

export default async function WebsiteSettingsPage() {
  const [canRead, canWrite] = await Promise.all([
    hasPermission("website_settings", "read"),
    hasPermission("website_settings", "write"),
  ]);
  if (!canRead) {
    return <ForbiddenPage resource="website_settings" action="read" />;
  }

  const site = await getWebsiteSettingsAction();
  return (
    <TenantPageShell size="default">
      <TenantPageHeader
        title="Website-instellingen"
        description="Beheer publieke identiteit, contactgegevens, gecontroleerde huisstijl en SEO-standaarden. Opslaan maakt niets automatisch live."
        breadcrumbs={[
          { label: "Website", href: "/website" },
          { label: "Instellingen" },
        ]}
      />
      <WebsiteTabs />
      {site ? (
        <WebsiteSettingsForm
          siteId={site.id}
          authoringRevision={site.authoringRevision}
          initialSettings={site.settings}
          canWrite={canWrite}
        />
      ) : (
        <section className="veele-card">
          <h2 className="font-semibold text-slate-950">Nog geen website</h2>
          <p className="mt-2 text-sm text-slate-600">
            Initialiseer eerst een beheerde website vanuit het overzicht.
          </p>
          <Link
            href="/website"
            className="mt-4 inline-block text-sm font-medium text-cyan-700"
          >
            Naar website-overzicht →
          </Link>
        </section>
      )}
    </TenantPageShell>
  );
}
