import {headers} from "next/headers";
import {notFound} from "next/navigation";
import {createAdminClient} from "@/lib/supabase/admin";
import {TENANT_SLUG_HEADER} from "@/lib/tenancy/hostname";
import {FieldgridBrand} from "@/components/fieldgrid/brand";
import {brandThemeStyle} from "@/lib/branding/palette";
import {getBrandingLogoUrl} from "@/lib/branding/logo";
import {commercialModuleEnabled} from "@/lib/commercial/access";
import {PublicRequestForm} from "./form";
export default async function IntakePage(){
 const slug=(await headers()).get(TENANT_SLUG_HEADER);if(!slug)notFound();const admin=createAdminClient();const {data:tenant}=await admin.from("tenants").select("id,name").eq("slug",slug).eq("status","active").single();if(!tenant||!await commercialModuleEnabled(admin,tenant.id))notFound();const {data:b}=await admin.from("tenant_branding").select("primary_color,accent_color,logo_path").eq("tenant_id",tenant.id).single();
 return <main className="auth-page" style={brandThemeStyle(b?.primary_color,b?.accent_color)}><section className="auth-card commercial-intake"><FieldgridBrand tenantName={tenant.name} logoUrl={await getBrandingLogoUrl(admin,b?.logo_path)}/><h1>Nieuwe aanvraag</h1><p>Vertel wat je nodig hebt. We nemen contact op om de werkzaamheden en locatie af te stemmen.</p><PublicRequestForm/></section></main>;
}
