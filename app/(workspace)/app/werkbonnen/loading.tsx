import Link from "next/link";

export default function WorkOrdersLoading() {
  return <section className="object-loading"><p role="status" aria-live="polite">Werkbonnen laden…</p><Link className="text-link" href="/app/werkbonnen">Terug naar werkbonnen</Link></section>;
}
