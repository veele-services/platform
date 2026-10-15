"use client";
export default function Error({reset}:{reset:()=>void}){return <section className="resource-panel"><h1>Kennisbank tijdelijk niet beschikbaar</h1><p>Controleer je verbinding en probeer opnieuw.</p><button className="secondary-button" onClick={reset}>Opnieuw proberen</button></section>;}
