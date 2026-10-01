import { createHash } from "node:crypto";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { FieldgridBrand } from "@/components/fieldgrid/brand";
import { getBrandingLogoUrl } from "@/lib/branding/logo";
import { requestMatchesTenant } from "@/lib/tenancy/request";
import { commercialModuleEnabled } from "@/lib/commercial/access";
import { BookingForm } from "./booking-form";

export default async function BookingPage({ params }: { params: Promise<{ token: string }> }) {
  const { token: rawToken } = await params;
  const hash = createHash("sha256").update(rawToken).digest("hex");
  const admin = createAdminClient();
  const { data: token } = await admin.from("external_action_tokens").select("*").eq("token_hash", hash).eq("purpose", "booking").is("revoked_at", null).gt("expires_at", new Date().toISOString()).maybeSingle();
  if (!token) notFound();
  const [{ data: tenant }, { data: branding }, { data: options }, enabled] = await Promise.all([
    admin.from("tenants").select("name,slug,timezone").eq("status","active").eq("id", token.tenant_id).single(),
    admin.from("tenant_branding").select("primary_color,accent_color,logo_path").eq("tenant_id", token.tenant_id).maybeSingle(),
    admin.from("booking_options").select("slot_id").eq("tenant_id", token.tenant_id).eq("token_id", token.id),
    commercialModuleEnabled(admin,token.tenant_id),
  ]);
  if (!tenant || !enabled || !(await requestMatchesTenant(tenant.slug))) notFound();
  const logoUrl = await getBrandingLogoUrl(admin, branding?.logo_path);
  const slotIds = (options ?? []).map((item) => item.slot_id);
  const { data: slots } = slotIds.length ? await admin.from("appointment_slots").select("id,starts_at,ends_at,capacity,booked_count").eq("tenant_id",token.tenant_id).in("id", slotIds).eq("status", "available").gt("starts_at", new Date().toISOString()).order("starts_at") : { data: [] };
  return <main className="auth-page" style={{ "--tenant-primary": branding?.primary_color ?? "#222c35", "--tenant-accent": branding?.accent_color ?? "#41ac42" } as React.CSSProperties}><section className="auth-card payment-card booking-card"><div className="external-brand" style={{ background: branding?.primary_color ?? "#222c35" }}><FieldgridBrand tenantName={tenant?.name} logoUrl={logoUrl}/></div><span className="eyebrow">VEILIGE BOEKING</span><h1>{token.consumed_at?"Afspraak bevestigd":token.booking_kind==="inspection"?"Plan een opname":"Plan de uitvoering"}</h1><p>{token.consumed_at?"Je gekozen tijdvak is vastgelegd. Neem voor een wijziging contact op met de planner.":"Je reserveert het aangeboden tijdvak. Deze boeking geeft geen akkoord op een offerte en verandert geen prijsafspraken."}</p>{!token.consumed_at&&<BookingForm token={rawToken} slots={(slots ?? []).filter(s=>s.booked_count<s.capacity)} timezone={tenant.timezone}/> }<small>Beveiligd door Fieldgrid</small></section></main>;
}
