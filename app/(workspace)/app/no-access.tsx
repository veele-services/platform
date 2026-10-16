import { ProductBrand } from "@/components/fieldgrid/brand";

export function NoAccess({ email }: { email: string | null }) {
  return <main className="auth-page"><section className="auth-card"><ProductBrand/><span className="eyebrow">GEEN WERKOMGEVING</span><h1>Je account is nog niet gekoppeld</h1><p>Vraag een tenantbeheerder om je account uit te nodigen. Ingelogd als {email ?? "onbekend"}.</p><form method="post" action="/auth/signout"><button className="secondary-button full">Uitloggen</button></form></section></main>;
}
