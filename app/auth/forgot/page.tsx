import { ProductBrand } from "@/components/fieldgrid/brand";
import { ForgotForm } from "./forgot-form";

export default function ForgotPage() {
  return <main className="auth-page"><section className="auth-card"><ProductBrand /><span className="eyebrow">ACCOUNT HERSTELLEN</span><h1>Nieuw wachtwoord</h1><p>Je ontvangt alleen een e-mail wanneer het account bestaat.</p><ForgotForm /></section></main>;
}
