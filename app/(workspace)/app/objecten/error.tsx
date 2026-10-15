"use client";
export default function ErrorPage({reset}:{reset:()=>void}){return <main className="object-loading"><h1>Het objectdossier is tijdelijk niet beschikbaar</h1><p>Je gegevens zijn niet gewijzigd. Probeer de pagina opnieuw te laden.</p><button className="primary-button" onClick={reset}>Opnieuw proberen</button></main>;}
