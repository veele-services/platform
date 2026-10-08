"use client";
import { useCallback, useEffect, useState, useTransition } from "react";
import { readWorkOrderSignatureSettings, saveWorkOrderSignatureSettings } from "@/app/app/work-order-actions";
import type { SignatureSettings } from "@/lib/work-orders/model";
import "../tenant-settings.css";

export function WorkOrderSignatureSettings({ objectId }: { objectId?: string }) {
  const [data, setData] = useState<SignatureSettings | null>(null), [error, setError] = useState(""), [saved, setSaved] = useState(false), [pending, startTransition] = useTransition();
  const load = useCallback(async () => { const result = await readWorkOrderSignatureSettings(objectId); if (result.ok) setData(result.data); else setError(result.error); }, [objectId]);
  useEffect(() => { const timer = setTimeout(() => void load(), 0); return () => clearTimeout(timer); }, [load]);
  const change = (next: SignatureSettings) => { setSaved(false); setData(next); };
  return <section className="panel tenant-settings-panel wo-signature-settings" aria-label="Ondertekening van werkrapporten">
    <div className="section-heading"><div><span className="eyebrow">RAPPORTAGE</span><h2>Ondertekening van werkrapporten</h2></div></div>
    <p className="form-note">{objectId ? "Deze objectinstelling heeft voorrang op de template en tenantstandaard." : "De werkbon kan afwijken van het object, daarna geldt de template en ten slotte deze standaard."} Gepubliceerde afspraken en historische rapporten blijven behouden.</p>
    {error && <p role="alert" className="wo-error">{error}</p>}
    {!data && !error && <p role="status">Ondertekeninstellingen laden…</p>}
    {data && <form className="tenant-settings-form" onSubmit={event => {
      event.preventDefault(); startTransition(async () => {
        const result = await saveWorkOrderSignatureSettings({ objectId, mode: data.mode, employeeRequired: data.employeeRequired, allowWaivers: data.allowWaivers, waiverUsers: data.waiverUsers });
        if (!result.ok) { setError(result.error); setSaved(false); }
        else { setError(""); setSaved(true); await load(); }
      });
    }}>
      <fieldset className="tenant-settings-group" disabled={!data.canManage || pending}>
        <legend>Ondertekening</legend>
        <div className="tenant-settings-fields"><label className="wide">Klantondertekening<select value={data.mode} onChange={event => change({ ...data, mode: event.target.value as SignatureSettings["mode"] })}>
          {objectId && <option value="inherit">Template / tenantstandaard gebruiken</option>}
          <option value="none">Niet nodig</option><option value="optional">Optioneel</option><option value="required">Verplicht</option>
        </select></label></div>
        {!objectId && <div className="tenant-settings-options">
          <label className="tenant-settings-check"><input type="checkbox" checked={data.employeeRequired} onChange={event => change({ ...data, employeeRequired: event.target.checked })}/>Ook een medewerkerhandtekening verplicht</label>
          <label className="tenant-settings-check"><input type="checkbox" checked={data.allowWaivers} onChange={event => change({ ...data, allowWaivers: event.target.checked })}/>Gemotiveerde vrijstelling voor klantondertekening toestaan</label>
        </div>}
      </fieldset>
      {!objectId && data.allowWaivers && <fieldset className="tenant-settings-group" disabled={!data.canManage || pending}>
        <legend>Bevoegdheden voor vrijstelling</legend>
        <p>Kies wie een klantondertekening gemotiveerd mag vrijstellen.</p>
        <div className="tenant-settings-options">{data.reviewers.map(reviewer => <label className="tenant-settings-check" key={reviewer.id}>
          <input type="checkbox" checked={data.waiverUsers.includes(reviewer.id)} onChange={event => change({ ...data, waiverUsers: event.target.checked ? [...data.waiverUsers, reviewer.id] : data.waiverUsers.filter(id => id !== reviewer.id) })}/>{reviewer.name}
        </label>)}</div>
        <p>Een vrijstelling is versiegebonden en zichtbaar in het rapport. Ze vervangt nooit een verplichte medewerkerhandtekening.</p>
      </fieldset>}
      <p className="tenant-settings-notice">{data.affectedDrafts} nog niet gepubliceerde bonnen kunnen deze standaard gebruiken. Ondertekenen gebeurt uitsluitend in de personeelsapp.</p>
      {data.canManage && <footer className="tenant-settings-actions"><button className="primary-button" disabled={pending}>{pending ? "Opslaan…" : saved ? "Opgeslagen" : "Ondertekeninstellingen opslaan"}</button></footer>}
      {saved && <p className="tenant-settings-notice" role="status">De ondertekeninstellingen zijn opgeslagen.</p>}
    </form>}
  </section>;
}
