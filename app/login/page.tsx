import type { Metadata } from "next";
import { ProductBrand } from "@/components/fieldgrid/brand";
import { LoginForm } from "./login-form";
import { isStaffLoginDestination } from "@/lib/auth/staff-login";

export const metadata: Metadata = { title: "Inloggen" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  const staffLogin = isStaffLoginDestination(next);
  return (
    <main className="auth-page">
      <section className="auth-card">
        <ProductBrand />
        <span className="eyebrow">{staffLogin ? "PERSONEELSPORTAAL" : "VEILIGE WERKOMGEVING"}</span>
        <h1>{staffLogin ? "Inloggen personeelsapp" : "Welkom terug"}</h1>
        <p>{staffLogin ? "Ontvang een eenmalige code op het e-mailadres van je personeelsaccount." : "Log in voor planning, uitvoering, rapportage en facturatie."}</p>
        <LoginForm next={next} staffLogin={staffLogin} />
      </section>
    </main>
  );
}
