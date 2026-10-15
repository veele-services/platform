"use client";
export default function Error({reset}:{reset:()=>void}){return <main className="dossier-loading"><h1>Het dossier kon niet worden geladen</h1><p>Je gegevens zijn niet gewijzigd. Probeer het opnieuw.</p><button className="primary-button" onClick={reset}>Opnieuw proberen</button></main>;}
