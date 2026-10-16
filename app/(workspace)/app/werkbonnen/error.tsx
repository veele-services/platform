"use client";

import Link from "next/link";

export default function WorkOrdersError({ retry }: { retry: () => void }) {
  return <section className="object-loading" role="alert"><h1>Werkbonnen zijn tijdelijk niet beschikbaar</h1><p>Probeer de gegevens opnieuw te laden.</p><button className="primary-button" onClick={retry}>Opnieuw proberen</button><Link className="text-link" href="/app/werkbonnen">Terug naar werkbonnen</Link></section>;
}
