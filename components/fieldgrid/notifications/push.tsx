"use client";
import { useCallback, useEffect, useState } from "react";
import { clientEnv } from "@/lib/env/client";
import { workspaceLabels, type NotificationWorkspace } from "@/lib/notifications/model";
import "./notifications.css";

type Devices = { active: boolean; currentDeviceId: string | null; contexts: NotificationWorkspace[]; unsubscribeBrowser: boolean; devices: Array<{ id: string; label: string; isCurrent: boolean; contexts: NotificationWorkspace[]; active: boolean; lastSeenAt: string | null; canRevoke: boolean }> };
export function NotificationPushControl({ workspace }: { workspace: NotificationWorkspace }) {
  const [data, setData] = useState<Devices | null>(null), [status, setStatus] = useState("Registratie controleren…"), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [supported, setSupported] = useState(false), [permission, setPermission] = useState<NotificationPermission>("default");
  const request = useCallback(async (payload: Record<string, unknown>) => {
    const response = await fetch("/api/notifications/push", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ workspace, ...payload }) });
    const value = await response.json(); if (!response.ok || !value.ok) throw new Error("De apparaatregistratie is niet bevestigd. Controleer je toegang en probeer opnieuw.");
    return value as Devices;
  }, [workspace]);
  const refresh = useCallback(async () => {
    const available = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
    setSupported(available);
    if (!available) { setStatus("Niet ondersteund op dit apparaat. In-app en toegestane e-mail blijven beschikbaar."); return; }
    setPermission(Notification.permission);
    try {
      const registration = await navigator.serviceWorker.getRegistration("/");
      const subscription = await registration?.pushManager.getSubscription();
      const fresh = await request({ action: "status", ...(subscription ? { subscription: { endpoint: subscription.endpoint } } : {}) });
      setData(fresh); setError("");
      const installed = window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone;
      setStatus(Notification.permission === "denied" ? "Geweigerd door de browser. Pas de browserinstellingen aan om push in te schakelen." : fresh.active && subscription && Notification.permission === "granted" ? "Actief op dit apparaat" : /iPad|iPhone|iPod/.test(navigator.userAgent) && !installed ? "Voeg deze website eerst aan je beginscherm toe en open de app vanaf daar." : Notification.permission === "granted" ? "Toestemming verleend, registratie ontbreekt of is verlopen." : "Nog niet ingeschakeld voor deze omgeving.");
    } catch (error) { setData(null); setStatus("Registratie niet bevestigd."); setError(error instanceof Error ? error.message : "Controleer je verbinding."); }
  }, [request]);
  useEffect(() => { let live = true; queueMicrotask(() => { if (live) void refresh(); }); const focus = () => { void refresh(); }; window.addEventListener("focus", focus); return () => { live = false; window.removeEventListener("focus", focus); }; }, [refresh]);
  const change = async (action: "subscribe" | "unsubscribe" | "revoke", deviceId?: string) => {
    if (busy) return; setBusy(true); setError("");
    try {
      if (action === "subscribe") {
        if (!supported || !clientEnv.NEXT_PUBLIC_VAPID_PUBLIC_KEY) throw new Error("Push is hier nog niet beschikbaar.");
        if (Notification.permission === "denied") throw new Error("Push is geweigerd in de browserinstellingen.");
        if (await Notification.requestPermission() !== "granted") throw new Error("Je hebt geen toestemming voor push gegeven.");
        await navigator.serviceWorker.register("/sw.js"); const registration = await navigator.serviceWorker.ready;
        const value = clientEnv.NEXT_PUBLIC_VAPID_PUBLIC_KEY.replace(/-/g, "+").replace(/_/g, "/");
        const key = Uint8Array.from(atob(value.padEnd(Math.ceil(value.length / 4) * 4, "=")), c => c.charCodeAt(0));
        const subscription = await registration.pushManager.getSubscription() ?? await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
        await request({ action, subscription: { endpoint: subscription.endpoint, keys: subscription.toJSON().keys } });
      } else {
        const registration = await navigator.serviceWorker.getRegistration("/"), subscription = await registration?.pushManager.getSubscription();
        const result = await request({ action, ...(deviceId ? { deviceId } : {}), ...(subscription ? { subscription: { endpoint: subscription.endpoint } } : {}) });
        if (result.unsubscribeBrowser && subscription) await subscription.unsubscribe();
      }
      await refresh();
    } catch (error) { setError(error instanceof Error ? error.message : "De wijziging is niet bevestigd."); }
    finally { setBusy(false); }
  };
  return <section className="nt-device"><h3>Push op dit apparaat</h3><p role="status">{status}</p><p className="nt-muted">Push bevat een beperkte melding, geen privétekst. Inschakelen wijzigt je opgeslagen kanaalvoorkeuren niet.</p><div className="nt-actions"><button className="secondary-button" disabled={busy || !supported || permission === "denied"} onClick={() => { void change("subscribe"); }}>Inschakelen / registratie herstellen</button>{data?.active && <button className="secondary-button" disabled={busy} onClick={() => { void change("unsubscribe"); }}>Push hier uitschakelen</button>}</div>{error && <p className="nt-error" role="alert">{error}</p>}{data?.devices.length ? <div className="nt-device-list"><h3>Mijn apparaten</h3>{data.devices.map(device => <article key={device.id}><div><strong>{device.label || "Geregistreerde browser"}{device.isCurrent ? " · dit apparaat" : ""}</strong><small>{device.contexts.map(c => workspaceLabels[c]).join(" · ")} · {device.active ? "Geregistreerd" : "Uitgeschakeld"}</small></div>{device.canRevoke && device.active && <button className="text-link" disabled={busy} onClick={() => { if (window.confirm("Dit apparaat afmelden voor je account? Andere apparaten blijven actief.")) void change("revoke", device.id); }}>Apparaat afmelden</button>}</article>)}</div> : null}</section>;
}
