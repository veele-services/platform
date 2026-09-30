"use client";
import { useCallback, useEffect, useState, useTransition } from "react";
import { readWorkOrderSignatureSettings, saveWorkOrderSignatureSettings } from "@/app/app/work-order-actions";
import type { SignatureSettings } from "@/lib/work-orders/model";

export function WorkOrderSignatureSettings({ objectId }: { objectId?: string }) {
  const [data, setData] = useState<SignatureSettings | null>(null), [error, setError] = useState(""), [saved, setSaved] = useState(false), [pending, startTransition] = useTransition();
  const load = useCallback(async () => { const r = await readWorkOrderSignatureSettings(objectId); if (r.ok) setData(r.data); else setError(r.error); }, [objectId]);
  useEffect(() => { const t = setTimeout(() => void load(), 0); return () => clearTimeout(t); }, [load]);
  return <section className="wo-card"><h2>Ondertekening van werkrapporten</h2>
    <p>{objectId ? "Deze objectinstelling heeft voorrang op de template en tenantstandaard." : "De werkbon kan afwijken van het object, daarna geldt de template en ten slotte deze standaard."} Gepubliceerde afspraken en historische rapporten blijven behouden.</p>
    {error && <p role="alert" className="wo-error">{error}</p>}{!data && !error && <p>Laden…</p>}
    {data && <form className="dossier-form" onSubmit={e => { e.preventDefault(); startTransition(async () => { const r = await saveWorkOrderSignatureSettings({ objectId, mode: data.mode, employeeRequired: data.employeeRequired, allowWaivers: data.allowWaivers, waiverUsers: data.waiverUsers }); if (!r.ok) setError(r.error); else { setError(""); setSaved(true); await load(); } }); }}>
      <label>Klantondertekening<select disabled={!data.canManage || pending} value={data.mode} onChange={e => { setSaved(false); setData({ ...data, mode: e.target.value as SignatureSettings['mode'] }); }}>{objectId && <option value="inherit">Template / tenantstandaard gebruiken</option>}<option value="none">Niet nodig</option><option value="optional">Optioneel</option><option value="required">Verplicht</option></select></label>
      {!objectId && <><label className="check"><input type="checkbox" disabled={!data.canManage || pending} checked={data.employeeRequired} onChange={e => { setSaved(false); setData({ ...data, employeeRequired: e.target.checked }); }}/>Ook een medewerkerhandtekening verplicht</label><label className="check"><input type="checkbox" disabled={!data.canManage || pending} checked={data.allowWaivers} onChange={e => { setSaved(false); setData({ ...data, allowWaivers: e.target.checked }); }}/>Gemotiveerde vrijstelling voor klantondertekening toestaan</label>
      {data.allowWaivers && <fieldset className="wide"><legend>Wie mag een klantondertekening gemotiveerd vrijstellen?</legend>{data.reviewers.map(r => <label className="check" key={r.id}><input disabled={!data.canManage || pending} type="checkbox" checked={data.waiverUsers.includes(r.id)} onChange={e => { setSaved(false); setData({ ...data, waiverUsers: e.target.checked ? [...data.waiverUsers, r.id] : data.waiverUsers.filter(id => id !== r.id) }); }}/>{r.name}</label>)}<p className="dossier-muted">Een vrijstelling is versiegebonden en zichtbaar in het rapport. Ze vervangt nooit een verplichte medewerkerhandtekening.</p></fieldset>}</>}
      <p className="dossier-notice wide">{data.affectedDrafts} nog niet gepubliceerde bonnen kunnen deze standaard gebruiken. Ondertekenen gebeurt uitsluitend in de personeelsapp.</p>
      {data.canManage && <button className="primary-button" disabled={pending}>{pending ? "Opslaan…" : saved ? "Opgeslagen" : "Ondertekeninstellingen opslaan"}</button>}
    </form>}
  </section>;
}
