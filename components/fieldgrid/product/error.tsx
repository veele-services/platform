"use client";
export function ProductError({ reset }: { reset: () => void }) {
  return (
    <section className="panel">
      <h1>Productinformatie tijdelijk niet beschikbaar</h1>
      <p role="alert">Controleer je verbinding en probeer opnieuw.</p>
      <button className="secondary-button" onClick={reset}>
        Opnieuw proberen
      </button>
    </section>
  );
}
