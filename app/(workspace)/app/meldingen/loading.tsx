import Link from "next/link";
export default function Loading() { return <section className="ticket-panel"><p role="status" aria-live="polite">Meldingen laden…</p><Link className="text-link" href="/app/meldingen">Terug naar overzicht</Link></section>; }
