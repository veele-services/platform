import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { FieldgridBrand, ProductBrand } from "@/components/fieldgrid/brand";
import { getBrandingLogoUrl } from "@/lib/branding/logo";
import { createAdminClient } from "@/lib/supabase/admin";
import { TENANT_SLUG_HEADER } from "@/lib/tenancy/hostname";

export default async function HomePage() {
  const slug = (await headers()).get(TENANT_SLUG_HEADER);
  if (!slug) {
    return (
      <main className="auth-page">
        <section className="auth-card">
          <ProductBrand />
          <span className="eyebrow">FIELD SERVICE PLATFORM</span>
          <h1>Werk georganiseerd.</h1>
          <p>Planning, uitvoering, rapportage en facturatie in één veilige omgeving.</p>
          <a className="primary-button full" href="/login">Inloggen</a>
        </section>
      </main>
    );
  }

  const admin = createAdminClient();
  const { data: tenant } = await admin.from("tenants").select("id,name").eq("slug", slug).eq("status", "active").maybeSingle();
  if (!tenant) notFound();
  const { data: branding } = await admin.from("tenant_branding").select("primary_color,accent_color,logo_path").eq("tenant_id", tenant.id).maybeSingle();
  const logoUrl = await getBrandingLogoUrl(admin, branding?.logo_path);

  return (
    <main className="auth-page" style={{ "--tenant-primary": branding?.primary_color ?? "#222c35", "--tenant-accent": branding?.accent_color ?? "#41ac42" } as React.CSSProperties}>
      <section className="auth-card">
        <div className="external-brand" style={{ background: branding?.primary_color ?? "#222c35" }}>
          <FieldgridBrand tenantName={tenant.name} logoUrl={logoUrl} />
        </div>
        <span className="eyebrow">VEILIGE WERKOMGEVING</span>
        <h1>Welkom bij {tenant.name}</h1>
        <p>Open je persoonlijke Fieldgrid-werkruimte om verder te gaan.</p>
        <a className="primary-button full" href="/login">Inloggen</a>
      </section>
    </main>
  );
}
