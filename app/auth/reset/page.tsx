import { ProductBrand } from "@/components/fieldgrid/brand";
import { ResetForm } from "./reset-form";

export default function ResetPage() {
  return <main className="auth-page"><section className="auth-card"><ProductBrand /><span className="eyebrow">ACCOUNT HERSTELLEN</span><h1>Kies een nieuw wachtwoord</h1><p>Gebruik minimaal 10 tekens met hoofdletters, kleine letters en cijfers.</p><ResetForm /></section></main>;
}
