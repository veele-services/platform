import type { Metadata } from "next";
import { FieldgridBrand, ProductBrand } from "@/components/fieldgrid/brand";
import { getLoginBrand } from "@/lib/auth/login-brand";
import { brandThemeStyle } from "@/lib/branding/palette";
import { VerifyForm } from "./verify-form";

export const metadata: Metadata = { title: "Account bevestigen", robots: { index: false, follow: false }, referrer: "no-referrer" };
export default async function VerifyPage() {
  const brand = await getLoginBrand();
  return <main className="auth-page" style={brandThemeStyle(brand?.primaryColor, brand?.accentColor)}><section className="auth-card">
    {brand ? <FieldgridBrand tenantName={brand.name} logoUrl={brand.logoUrl}/> : <ProductBrand/>}
    <span className="eyebrow">JE ACCOUNT</span><h1>Bevestig je aanvraag</h1>
    <p>Ga verder met de accountactie die je zojuist per e-mail hebt ontvangen.</p><VerifyForm/>
  </section></main>;
}
