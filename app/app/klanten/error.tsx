"use client";
export default function Error({ reset }: { reset: () => void }) {
  return (
    <section className="dossier-card" role="alert">
      <h1>Klanten tijdelijk niet beschikbaar</h1>
      <p>Je gegevens zijn niet gewijzigd. Probeer de lijst opnieuw te laden.</p>
      <button className="secondary-button" onClick={reset}>
        Opnieuw proberen
      </button>
    </section>
  );
}
