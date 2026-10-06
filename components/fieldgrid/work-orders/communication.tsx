"use client";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addWorkOrderCommunication } from "@/app/app/work-order-file-actions";
import { CUSTOMER_DOCUMENT_ACCEPT } from "@/lib/customers/documents";

export function WorkOrderCommunication({ orderId }: { orderId: string }) {
  const [id, setId] = useState(() => crypto.randomUUID()), [error, setError] = useState(""), [pending, transition] = useTransition();
  const ref = useRef<HTMLFormElement>(null), router = useRouter();
  return <form ref={ref} className="dossier-form" onChange={() => setId(crypto.randomUUID())} onSubmit={e => {
    e.preventDefault(); const data = new FormData(e.currentTarget); setError("");
    transition(async () => { try { const r = await addWorkOrderCommunication(data); if (!r.ok) { setError(r.error); return; } ref.current?.reset(); setId(crypto.randomUUID()); router.refresh(); } catch { setError("Opslaan is niet bevestigd. Probeer opnieuw; je invoer blijft bewaard."); } });
  }}>
    <input type="hidden" name="orderId" value={orderId}/><input type="hidden" name="mutationId" value={id}/>
    <label className="wide">Notitie<textarea name="body" maxLength={5000} disabled={pending}/></label>
    <label className="wide">Document of foto<input type="file" name="file" accept={CUSTOMER_DOCUMENT_ACCEPT} disabled={pending}/><small>PDF, JPG of PNG · maximaal 10 MB. Upload geen gevoelige toegangsgegevens.</small></label>
    <label className="check wide"><input type="checkbox" name="customerVisible" disabled={pending}/>Opnemen in het klantrapport na controle</label>
    {error && <p className="wo-error wide" role="alert">{error}</p>}
    <button className="primary-button wide" disabled={pending}>{pending ? "Opslaan…" : "Notitie / bestand toevoegen"}</button>
  </form>;
}
