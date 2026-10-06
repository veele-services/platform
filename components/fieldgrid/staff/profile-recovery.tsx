import { FieldgridBrand } from "../brand";
import { UserRound } from "lucide-react";

export function StaffProfileRecovery({ tenantName, logoUrl }: { tenantName?: string; logoUrl?: string | null }) {
  return <main className="staff-blocked">
    <FieldgridBrand tenantName={tenantName ?? "Personeelsapp"} logoUrl={logoUrl}/>
    <UserRound/>
    <h1>Personeelsprofiel ontbreekt</h1>
    <p>Je account is nog niet aan een actieve personeelskaart gekoppeld. Vraag je beheerder dit te herstellen.</p>
    <form method="post" action="/auth/signout"><button className="ps-secondary">Uitloggen</button></form>
  </main>;
}
