import { UserRound } from "lucide-react";

export function StaffProfileRecovery() {
  return <main className="staff-blocked">
    <strong>Fieldgrid</strong>
    <UserRound/>
    <h1>Personeelsprofiel ontbreekt</h1>
    <p>Je account is nog niet aan een actieve personeelskaart gekoppeld. Vraag je beheerder dit te herstellen.</p>
    <form method="post" action="/auth/signout"><button className="ps-secondary">Uitloggen</button></form>
  </main>;
}
