import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { FieldgridBrand } from "@/components/fieldgrid/brand";
import { createAdminClient } from "@/lib/supabase/admin";
import { getInvitationTenant } from "@/lib/personnel/invite-tenant";
import { brandThemeStyle } from "@/lib/branding/palette";
import { InviteForm } from "./invite-form";

export const metadata: Metadata = { title: "Uitnodiging personeelsportaal", robots: { index: false, follow: false }, referrer: "no-referrer" };

export default async function InvitePage({ searchParams }: { searchParams: Promise<{ tenant?: string }> }) {
  const { tenant: slug } = await searchParams;
  const tenant = slug ? await getInvitationTenant(slug) : null;
  if (!tenant) notFound();
  const admin = createAdminClient();
  const { data: branding } = await admin.from("tenant_branding").select("logo_path,primary_color,accent_color").eq("tenant_id", tenant.id).maybeSingle();
  return <main className="auth-page personnel-invite-page" style={brandThemeStyle(branding?.primary_color, branding?.accent_color)}>
    <section className="auth-card"><FieldgridBrand tenantName={tenant.name} logoUrl={branding?.logo_path ? `/api/branding/${tenant.id}/email-logo` : null}/>
      <span className="eyebrow">PERSONEELSPORTAAL</span><h1>Welkom bij {tenant.name}</h1>
      <p>Je bent uitgenodigd als personeelslid. Accepteer de uitnodiging en kies daarna je eigen wachtwoord. Vervolgens kun je jouw planning en werkbonnen bekijken.</p>
      <InviteForm tenantSlug={tenant.slug}/>
    </section>
  </main>;
}
