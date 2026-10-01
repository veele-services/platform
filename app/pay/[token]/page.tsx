import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { FieldgridBrand } from "@/components/fieldgrid/brand";
import { getBrandingLogoUrl } from "@/lib/branding/logo";
import { requestMatchesTenant } from "@/lib/tenancy/request";
import { paymentAccess } from "@/lib/payments/access";
import { PayButton } from "./pay-button";

const money = (cents: number) => new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(cents / 100);

export default async function PaymentPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ return?: string }> }) {
  const { token } = await params;
  const admin = createAdminClient();
  const access = await paymentAccess(admin, token);
  if (!access) notFound();
  const { tenant, invoices } = access;
  const { data: branding } = await admin.from("tenant_branding").select("primary_color,accent_color,logo_path").eq("tenant_id", access.tenant_id).maybeSingle();
  if (!tenant || !(await requestMatchesTenant(tenant.slug))) notFound();
  const logoUrl = await getBrandingLogoUrl(admin, branding?.logo_path);
  if (!(await paymentAccess(admin, token))) notFound();
  const openAmount = (invoices ?? []).reduce((sum, invoice) => sum + Math.max(0, invoice.total_cents - invoice.paid_cents), 0);
  const { return: returned } = await searchParams;
  return <main className="auth-page" style={{ "--tenant-primary": branding?.primary_color ?? "#222c35", "--tenant-accent": branding?.accent_color ?? "#41ac42" } as React.CSSProperties}><section className="auth-card payment-card"><div className="external-brand" style={{ background: branding?.primary_color ?? "#222c35" }}><FieldgridBrand tenantName={tenant?.name} logoUrl={logoUrl}/></div><span className="eyebrow">BEVEILIGDE BETALING</span><h1>{openAmount > 0 ? money(openAmount) : "Betaald"}</h1><p>{returned ? "De betaalstatus wordt gecontroleerd. Ververs deze pagina wanneer de verwerking nog loopt." : "Controleer de facturen en ga verder naar de beveiligde betaalomgeving."}</p><div className="payment-lines">{(invoices ?? []).map((invoice) => <div key={invoice.id}><span>{invoice.invoice_number}</span><strong>{money(Math.max(0, invoice.total_cents - invoice.paid_cents))}</strong></div>)}</div>{openAmount > 0 ? <PayButton token={token}/> : <p className="auth-message success">Alle geselecteerde facturen zijn voldaan.</p>}<small>Geen account of klantportaal vereist · beveiligd door Fieldgrid.</small></section></main>;
}
