import { createHash } from "node:crypto";
import { notFound } from "next/navigation";
import { FieldgridBrand } from "@/components/fieldgrid/brand";
import { createAdminClient } from "@/lib/supabase/admin";
import { getBrandingLogoUrl } from "@/lib/branding/logo";
import { requestMatchesTenant } from "@/lib/tenancy/request";
import { QuoteForm } from "./quote-form";

const money = (cents: number) => new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(cents / 100);

export default async function QuotePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const hash = createHash("sha256").update(token).digest("hex");
  const admin = createAdminClient();
  const { data: access } = await admin.from("external_action_tokens").select("*").eq("token_hash", hash).eq("purpose", "quote_acceptance").is("consumed_at", null).gt("expires_at", new Date().toISOString()).maybeSingle();
  if (!access) notFound();
  const { data: quote } = await admin.from("quotes").select("quote_number,total_cents,snapshot,status,expires_at").eq("id", access.subject_id).single();
  if (!quote) notFound();
  const [{ data: tenant }, { data: branding }] = await Promise.all([
    admin.from("tenants").select("name,slug").eq("id", access.tenant_id).single(),
    admin.from("tenant_branding").select("primary_color,accent_color,logo_path").eq("tenant_id", access.tenant_id).maybeSingle(),
  ]);
  if (!tenant || !(await requestMatchesTenant(tenant.slug))) notFound();
  const logoUrl = await getBrandingLogoUrl(admin, branding?.logo_path);
  const snapshot = quote.snapshot as Record<string, unknown>;
  return <main className="auth-page" style={{ "--tenant-primary": branding?.primary_color ?? "#222c35", "--tenant-accent": branding?.accent_color ?? "#41ac42" } as React.CSSProperties}><section className="auth-card"><div className="external-brand" style={{ background: branding?.primary_color ?? "#222c35" }}><FieldgridBrand tenantName={tenant?.name} logoUrl={logoUrl}/></div><span className="eyebrow">OFFERTESAKKOORD</span><h1>{quote.quote_number}</h1><p>{String(snapshot.description ?? "Dienstverlening")}</p><div className="quote-total"><span>Totaal inclusief btw</span><strong>{money(quote.total_cents)}</strong></div><QuoteForm token={token}/><small>Beveiligd door Fieldgrid</small></section></main>;
}
