"use client";
export function NotificationError({ reset }: { reset: () => void }) { return <section className="nt-panel"><h1>Notificaties tijdelijk niet beschikbaar</h1><p role="alert">Controleer je verbinding en probeer opnieuw. Er is geen verzending bevestigd.</p><button className="secondary-button" onClick={reset}>Opnieuw proberen</button></section>; }
