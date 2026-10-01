import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { TENANT_SLUG_HEADER } from "@/lib/tenancy/hostname";
import { FieldgridBrand } from "@/components/fieldgrid/brand";
import { brandThemeStyle } from "@/lib/branding/palette";
import { VerifyForm } from "./verify-form";

export const metadata: Metadata = { title: "Account bevestigen", robots: { index: false, follow: false }, referrer: "no-referrer" };
export default async function VerifyPage() {
  const slug = (await headers()).get(TENANT_SLUG_HEADER), db = createAdminClient();
  const tenant = slug ? (await db.from("tenants").select("id,name").eq("slug", slug).eq("status", "active").maybeSingle()).data : null;
  if (slug && !tenant) notFound();
  const branding = tenant ? (await db.from("tenant_branding").select("primary_color,accent_color,logo_path").eq("tenant_id", tenant.id).maybeSingle()).data : null;
  return <main className="auth-page" style={brandThemeStyle(branding?.primary_color, branding?.accent_color)}><section className="auth-card">
    <FieldgridBrand tenantName={tenant?.name} logoUrl={tenant && branding?.logo_path ? `/api/branding/${tenant.id}/email-logo` : null}/>
    <span className="eyebrow">JE ACCOUNT</span><h1>Bevestig je aanvraag</h1>
    <p>Ga verder met de accountactie die je zojuist per e-mail hebt ontvangen.</p><VerifyForm/>
  </section></main>;
}
