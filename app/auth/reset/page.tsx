import { ProductBrand } from "@/components/fieldgrid/brand";
import { ResetForm } from "./reset-form";

export default async function ResetPage({ searchParams }: { searchParams: Promise<{ next?: string; invite?: string }> }) {
  const params = await searchParams;
  const next = params.next === "/staff" ? "/staff" : "/app";
  const invited = params.invite === "1" && next === "/staff";
  return <main className="auth-page"><section className="auth-card"><ProductBrand /><span className="eyebrow">{invited ? "PERSONEELSPORTAAL" : "ACCOUNT HERSTELLEN"}</span><h1>{invited ? "Kies je wachtwoord" : "Kies een nieuw wachtwoord"}</h1><p>{invited ? "Je uitnodiging is geaccepteerd. Kies een wachtwoord om je personeelsaccount te gebruiken. " : ""}Gebruik minimaal 10 tekens met hoofdletters, kleine letters en cijfers.</p><ResetForm next={next}/></section></main>;
}
