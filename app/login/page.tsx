import type { Metadata } from "next";
import { ProductBrand } from "@/components/fieldgrid/brand";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Inloggen" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return (
    <main className="auth-page">
      <section className="auth-card">
        <ProductBrand />
        <span className="eyebrow">VEILIGE WERKOMGEVING</span>
        <h1>Welkom terug</h1>
        <p>Log in voor planning, uitvoering, rapportage en facturatie.</p>
        <LoginForm next={next} />
      </section>
    </main>
  );
}
