import type { Metadata } from "next";
import { ProductBrand, FieldgridBrand } from "@/components/fieldgrid/brand";
import { LoginForm } from "./login-form";
import { isStaffLoginDestination } from "@/lib/auth/staff-login";
import { getLoginBrand } from "@/lib/auth/login-brand";
import { brandThemeStyle } from "@/lib/branding/palette";

export const metadata: Metadata = { title: "Inloggen" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  const staffLogin = isStaffLoginDestination(next);
  const brand = await getLoginBrand();
  return (
    <main className="auth-page" style={brandThemeStyle(brand?.primaryColor, brand?.accentColor)}>
      <section className="auth-card">
        {brand ? <FieldgridBrand tenantName={brand.name} logoUrl={brand.logoUrl} /> : <ProductBrand />}
        <span className="eyebrow">{staffLogin ? "PERSONEELSPORTAAL" : "VEILIGE WERKOMGEVING"}</span>
        <h1>{staffLogin ? "Inloggen personeelsapp" : "Welkom terug"}</h1>
        <p>Ontvang een eenmalige code op het e-mailadres van je account{brand ? ` bij ${brand.name}` : ""}.</p>
        <LoginForm next={next} />
      </section>
    </main>
  );
}
