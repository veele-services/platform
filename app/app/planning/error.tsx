"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <section className="panel">
      <h1>Planbord tijdelijk niet beschikbaar</h1>
      <p>Je opgeslagen planning blijft behouden.</p>
      <button className="primary-button" onClick={reset}>
        Opnieuw proberen
      </button>
    </section>
  );
}
