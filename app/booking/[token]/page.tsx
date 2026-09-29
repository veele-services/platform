import { createHash } from "node:crypto";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { FieldgridBrand } from "@/components/fieldgrid/brand";
import { getBrandingLogoUrl } from "@/lib/branding/logo";
import { requestMatchesTenant } from "@/lib/tenancy/request";
import { BookingForm } from "./booking-form";

export default async function BookingPage({ params }: { params: Promise<{ token: string }> }) {
  const { token: rawToken } = await params;
  const hash = createHash("sha256").update(rawToken).digest("hex");
  const admin = createAdminClient();
  const { data: token } = await admin.from("external_action_tokens").select("*").eq("token_hash", hash).eq("purpose", "booking").is("consumed_at", null).gt("expires_at", new Date().toISOString()).maybeSingle();
  if (!token) notFound();
  const [{ data: tenant }, { data: branding }, { data: options }] = await Promise.all([
    admin.from("tenants").select("name,slug,timezone").eq("id", token.tenant_id).single(),
    admin.from("tenant_branding").select("primary_color,accent_color,logo_path").eq("tenant_id", token.tenant_id).maybeSingle(),
    admin.from("booking_options").select("slot_id").eq("tenant_id", token.tenant_id).eq("token_id", token.id),
  ]);
  if (!tenant || !(await requestMatchesTenant(tenant.slug))) notFound();
  const logoUrl = await getBrandingLogoUrl(admin, branding?.logo_path);
  const slotIds = (options ?? []).map((item) => item.slot_id);
  const { data: slots } = slotIds.length ? await admin.from("appointment_slots").select("id,starts_at,ends_at").in("id", slotIds).eq("status", "available").gt("starts_at", new Date().toISOString()).order("starts_at") : { data: [] };
  return <main className="auth-page" style={{ "--tenant-primary": branding?.primary_color ?? "#0b1d3a", "--tenant-accent": branding?.accent_color ?? "#00b7b3" } as React.CSSProperties}><section className="auth-card payment-card booking-card"><div className="external-brand" style={{ background: branding?.primary_color ?? "#0b1d3a" }}><FieldgridBrand tenantName={tenant?.name} logoUrl={logoUrl}/></div><span className="eyebrow">VEILIGE BOEKING</span><h1>Kies je afspraak</h1><p>Deze link is eenmalig. Zodra je bevestigt wordt de plek atomair gereserveerd.</p><BookingForm token={rawToken} slots={slots ?? []} timezone={tenant?.timezone ?? "Europe/Amsterdam"}/><small>Beveiligd door Fieldgrid</small></section></main>;
}
