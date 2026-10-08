import type { Metadata } from "next";
import { ProductBrand, FieldgridBrand } from "@/components/fieldgrid/brand";
import { LoginForm } from "./login-form";
import { isStaffLoginDestination } from "@/lib/auth/staff-login";
import { getLoginBrand } from "@/lib/auth/login-brand";
import { brandThemeStyle } from "@/lib/branding/palette";
import { personnelThemeStyle } from "@/lib/staff/theme";
import "./staff-login.css";

export const metadata: Metadata = { title: "Inloggen" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  const staffLogin = isStaffLoginDestination(next);
  const brand = await getLoginBrand();
  return (
    <main className={`auth-page${staffLogin ? " staff-login" : ""}`} style={staffLogin ? personnelThemeStyle(brand?.primaryColor,brand?.accentColor) : brandThemeStyle(brand?.primaryColor, brand?.accentColor)}>
      {staffLogin && <aside className="staff-login-identity">
        {brand ? <FieldgridBrand tenantName={brand.name} logoUrl={brand.logoUrl}/> : <ProductBrand/>}
        <div><span>JOUW WERKDAG. GOED GEREGELD.</span><h2>Alles voor je werk.<br/><em>Op één plek.</em></h2><p>Je planning, werkbonnen en uren. Altijd bij de hand, waar je ook werkt.</p><div className="staff-login-features"><div><strong>01</strong><small>Je planning</small></div><div><strong>02</strong><small>Je werkbonnen</small></div><div><strong>03</strong><small>Je werkdag</small></div></div></div>
        <small>{brand?.name ?? "Fieldgrid"} · Personeelsapp</small>
      </aside>}
      <section className="auth-card">
        <FieldgridBrand tenantName={brand?.name} logoUrl={brand?.logoUrl}/>
        <span className="eyebrow">{staffLogin ? "PERSONEELSPORTAAL" : "VEILIGE WERKOMGEVING"}</span>
        <h1>{staffLogin ? "Inloggen personeelsapp" : "Welkom terug"}</h1>
        <p>Ontvang een eenmalige code op het e-mailadres van je account{brand ? ` bij ${brand.name}` : ""}.</p>
        <LoginForm next={next} />
      </section>
    </main>
  );
}
