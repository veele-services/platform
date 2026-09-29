import { createHash } from "node:crypto";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { FieldgridBrand } from "@/components/fieldgrid/brand";
import { getBrandingLogoUrl } from "@/lib/branding/logo";
import { requestMatchesTenant } from "@/lib/tenancy/request";
import { PayButton } from "./pay-button";

const money = (cents: number) => new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(cents / 100);

export default async function PaymentPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ return?: string }> }) {
  const { token } = await params;
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const admin = createAdminClient();
  const { data: access } = await admin.from("external_action_tokens").select("*").eq("token_hash", tokenHash).eq("purpose", "payment").is("consumed_at", null).gt("expires_at", new Date().toISOString()).maybeSingle();
  if (!access) notFound();
  const { data: items } = await admin.from("invoice_group_items").select("invoice_id").eq("invoice_group_id", access.subject_id);
  const [{ data: tenant }, { data: branding }] = await Promise.all([
    admin.from("tenants").select("name,slug").eq("id", access.tenant_id).single(),
    admin.from("tenant_branding").select("primary_color,accent_color,logo_path").eq("tenant_id", access.tenant_id).maybeSingle(),
  ]);
  if (!tenant || !(await requestMatchesTenant(tenant.slug))) notFound();
  const logoUrl = await getBrandingLogoUrl(admin, branding?.logo_path);
  const { data: invoices } = await admin.from("invoices").select("id,invoice_number,total_cents,paid_cents,status").in("id", (items ?? []).map((item) => item.invoice_id));
  const openAmount = (invoices ?? []).reduce((sum, invoice) => sum + Math.max(0, invoice.total_cents - invoice.paid_cents), 0);
  const { return: returned } = await searchParams;
  return <main className="auth-page" style={{ "--tenant-primary": branding?.primary_color ?? "#0b1d3a", "--tenant-accent": branding?.accent_color ?? "#00b7b3" } as React.CSSProperties}><section className="auth-card payment-card"><div className="external-brand" style={{ background: branding?.primary_color ?? "#0b1d3a" }}><FieldgridBrand tenantName={tenant?.name} logoUrl={logoUrl}/></div><span className="eyebrow">BEVEILIGDE BETALING</span><h1>{openAmount > 0 ? money(openAmount) : "Betaald"}</h1><p>{returned ? "De betaalstatus wordt gecontroleerd. Ververs deze pagina wanneer de verwerking nog loopt." : "Controleer de facturen en ga verder naar de beveiligde betaalomgeving."}</p><div className="payment-lines">{(invoices ?? []).map((invoice) => <div key={invoice.id}><span>{invoice.invoice_number}</span><strong>{money(Math.max(0, invoice.total_cents - invoice.paid_cents))}</strong></div>)}</div>{openAmount > 0 ? <PayButton token={token}/> : <p className="auth-message success">Alle geselecteerde facturen zijn voldaan.</p>}<small>Geen account of klantportaal vereist · beveiligd door Fieldgrid.</small></section></main>;
}
