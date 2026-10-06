"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LockKeyhole, ShieldCheck } from "lucide-react";
import type { VisitContext } from "@/lib/objects/model";
import { ObjectVisit } from "./visit";

type Reply = { ok: boolean; error?: string; challengeId?: string; grantId?: string; expiresAt?: string; context?: VisitContext };

/** Dossier content is requested only after the server confirms the live grant.
 * Never persist the code, grant or dossier in storage or route/search state. */
export function SecureObjectVisit({ objectId, orderId, timezone }: { objectId: string; orderId: string; timezone: string }) {
  const [challenge, setChallenge] = useState("");
  const [code, setCode] = useState("");
  const [access, setAccess] = useState<{ id: string; expires: string; context: VisitContext } | null>(null);
  const [seconds, setSeconds] = useState(0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const epoch = useRef(0);
  const grant = useRef("");
  const call = useCallback(async (operation: string, input: Record<string, string> = {}): Promise<Reply> => {
    try {
      const response = await fetch("/api/objects/vault", { method: "POST", credentials: "same-origin", cache: "no-store", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ objectId, orderId, itemId: null, operation, input }) });
      return await response.json();
    } catch { return { ok: false, error: "Geen verbinding. Bevestig je toegang opnieuw zodra je online bent." }; }
  }, [objectId, orderId]);
  const clear = useCallback(() => {
    epoch.current++;
    const id = grant.current;
    grant.current = "";
    setAccess(null); setCode(""); setChallenge(""); setSeconds(0);
    if (id) void call("hide", { grantId: id });
  }, [call]);
  useEffect(() => {
    const lifecycle = epoch;
    const hide = () => { if (grant.current) clear(); else setCode(""); };
    const visibility = () => { if (document.hidden) hide(); };
    window.addEventListener("blur", hide); window.addEventListener("offline", hide); window.addEventListener("pagehide", hide);
    document.addEventListener("visibilitychange", visibility);
    return () => { window.removeEventListener("blur", hide); window.removeEventListener("offline", hide); window.removeEventListener("pagehide", hide); document.removeEventListener("visibilitychange", visibility); lifecycle.current++; if (grant.current) void call("hide", { grantId: grant.current }); grant.current = ""; };
  }, [call, clear]);
  useEffect(() => {
    if (!access) return;
    let running = false;
    const tick = () => { const remaining = Math.max(0, Math.ceil((Date.parse(access.expires) - Date.now()) / 1000)); setSeconds(remaining); if (!remaining) clear(); };
    const timer = window.setInterval(tick, 1000);
    const poll = window.setInterval(async () => { if (running) return; running = true; const generation = epoch.current; const result = await call("check", { grantId: access.id }); running = false; if (generation === epoch.current && !result.ok) { clear(); setMessage("Je toegang is verlopen of gewijzigd. Vraag een nieuwe code aan."); } }, 5000);
    return () => { clearInterval(timer); clearInterval(poll); };
  }, [access, call, clear]);
  const dossierAccess = useMemo(() => access ? { grantId: access.id, expiresAt: access.expires } : undefined, [access]);
  const requestCode = async () => {
    setBusy(true); setMessage(""); const generation = epoch.current;
    const result = await call("request");
    if (generation === epoch.current) { if (result.ok && result.challengeId) { setChallenge(result.challengeId); setCode(""); setMessage("De code is per e-mail verzonden en twee minuten geldig."); } else setMessage(result.error ?? "Verificatie niet beschikbaar."); }
    setBusy(false);
  };
  const verify = async () => {
    setBusy(true); setMessage(""); const generation = epoch.current;
    const verified = await call("verify", { challengeId: challenge, code }); setCode("");
    if (generation !== epoch.current) { if (verified.grantId) void call("hide", { grantId: verified.grantId }); setBusy(false); return; }
    if (!verified.ok || !verified.grantId || !verified.expiresAt) { setMessage(verified.error ?? "De code is ongeldig of verlopen."); setBusy(false); return; }
    grant.current = verified.grantId;
    const dossier = await call("dossier", { grantId: verified.grantId });
    if (generation === epoch.current) {
      if (dossier.ok && dossier.context) { setAccess({ id: verified.grantId, expires: verified.expiresAt, context: dossier.context }); setSeconds(Math.max(0, Math.ceil((Date.parse(verified.expiresAt) - Date.now()) / 1000))); }
      else { clear(); setMessage(dossier.error ?? "Dossier niet beschikbaar."); }
    }
    setBusy(false);
  };
  return <div className="secure-object-visit">
    {access ? <><div className="secure-visit-session"><span role="timer"><ShieldCheck size={16}/>Inzage · {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")}</span><button type="button" className="secondary-button" onClick={clear}>Dossier vergrendelen</button></div><ObjectVisit context={access.context} timezone={timezone} embedded dossierAccess={dossierAccess}/></> : <section className="dossier-card secure-visit-confirmation"><LockKeyhole size={28}/><h3>Bevestig je dossierinzage</h3><p>Je ontvangt een eenmalige e-mailcode. De code is twee minuten geldig; daarna kun je het dossier maximaal vijf minuten bekijken.</p><button type="button" className="secondary-button" disabled={busy} onClick={() => void requestCode()}>{busy ? "Bezig…" : challenge ? "Nieuwe code versturen" : "Code per e-mail versturen"}</button>{challenge && <form onSubmit={(event) => { event.preventDefault(); void verify(); }}><label className="field">E-mailcode<input autoComplete="one-time-code" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} required value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}/></label><button className="primary-button" disabled={busy || code.length !== 6}>Dossier openen</button></form>}</section>}
    {message && <p className="auth-message" role="status">{message}</p>}
  </div>;
}
