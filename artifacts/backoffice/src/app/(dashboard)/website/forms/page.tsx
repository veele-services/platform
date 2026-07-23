import type { Metadata } from "next";
import Link from "next/link";
import { getWebsiteFormsAction } from "@/app/actions/website-forms";
import { ForbiddenPage } from "@/components/layout/ForbiddenPage";
import { WebsiteFormsEditor } from "@/components/website/WebsiteFormsEditor";
import { WebsiteTabs } from "@/components/website/WebsiteTabs";
import { TenantPageHeader, TenantPageShell } from "@/components/tenant-ui";
import { hasPermission } from "@/lib/auth/permissions";

export const metadata: Metadata = { title: "Websiteformulieren" };

export default async function WebsiteFormsPage() {
  const [canRead, canWrite] = await Promise.all([
    hasPermission("website_forms", "read"),
    hasPermission("website_forms", "write"),
  ]);
  if (!canRead) {
    return <ForbiddenPage resource="website_forms" action="read" />;
  }
  const view = await getWebsiteFormsAction();
  return (
    <TenantPageShell>
      <TenantPageHeader
        title="Formulieren"
        description="Beheer de velden, verwerking en notificatie van publieke tenantformulieren."
        breadcrumbs={[
          { label: "Website", href: "/website" },
          { label: "Formulieren" },
        ]}
      />
      <WebsiteTabs />
      {!view ? (
        <section className="veele-card">
          <h2 className="font-semibold text-slate-950">Nog geen website</h2>
          <p className="mt-2 text-sm text-slate-600">
            Initialiseer eerst de website voordat u formulieren configureert.
          </p>
          <Link
            href="/website"
            className="mt-4 inline-block text-sm font-medium text-cyan-700"
          >
            Naar website-overzicht →
          </Link>
        </section>
      ) : (
        <WebsiteFormsEditor view={view} canWrite={canWrite} />
      )}
    </TenantPageShell>
  );
}
