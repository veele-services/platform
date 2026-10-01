"use client";
import Link from "next/link";
export default function Error({ retry }: { retry: () => void }) { return <section className="ticket-panel"><h1>Meldingen tijdelijk niet beschikbaar</h1><p role="alert">De gegevens konden niet veilig worden geladen. Probeer opnieuw.</p><div className="ticket-actions"><button className="primary-button" onClick={retry}>Opnieuw proberen</button><Link className="text-link" href="/staff/meldingen">Terug naar overzicht</Link></div></section>; }
