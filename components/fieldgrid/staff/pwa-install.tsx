"use client";

import Image from "next/image";
import { Download, Share, Smartphone } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Dialog, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { StaffDialogContent } from "./dialog-content";
import type { StaffPwaIdentity } from "@/lib/pwa/presentation";
import { installOnboardingCompleted, installVisit, parseInstallPreference, type StaffInstallPreference } from "@/lib/pwa/install-model";
import "./pwa-install.css";
import { clearStaffInstallEvent, getStaffInstallEvent, staffInstallReadyEvent, type StaffInstallEvent } from "./pwa-browser-events";

type Offer = "onboarding" | "reminder" | "settings" | null;
// Restricted-storage browsers still remember choices during this document's
// lifetime. Only opaque account scopes and a prompt preference are retained.
const memory = new Map<string, StaffInstallPreference>();
const done: StaffInstallPreference = { version: 1, phase: "done" };

function isInstalled() {
  return window.matchMedia("(display-mode: standalone)").matches
    || window.matchMedia("(display-mode: fullscreen)").matches
    || Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
}

export function useStaffPwaInstall({ scope, session, onboarded }: { scope: string; session: string | null; onboarded: boolean }) {
  const storageKey = `fieldgrid:pwa-install:${scope}`;
  const eventRef = useRef<StaffInstallEvent | null>(null);
  const [offer, setOffer] = useState<Offer>(null);
  const [installed, setInstalled] = useState(false);
  const [nativeReady, setNativeReady] = useState(false);
  const [ios, setIos] = useState(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const read = useCallback(() => {
    try { return parseInstallPreference(localStorage.getItem(storageKey)) ?? memory.get(storageKey) ?? null; }
    catch { return memory.get(storageKey) ?? null; }
  }, [storageKey]);
  const write = useCallback((value: StaffInstallPreference) => {
    memory.set(storageKey, value);
    try { localStorage.setItem(storageKey, JSON.stringify(value)); } catch { /* Installation stays usable without storage. */ }
  }, [storageKey]);

  useEffect(() => {
    let active = true;
    const display = window.matchMedia("(display-mode: standalone)");
    const updateInstalled = () => {
      if (isInstalled()) { write(done); setInstalled(true); setOffer(null); }
    };
    const beforeInstall = () => {
      const installEvent = getStaffInstallEvent();
      if (!installEvent) return;
      eventRef.current = installEvent; setNativeReady(true);
    };
    const appInstalled = () => { write(done); setInstalled(true); setOffer(null); eventRef.current = null; setNativeReady(false); };
    const timer = window.setTimeout(() => {
      beforeInstall();
      setIos(/iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1));
      const standalone = isInstalled(); setInstalled(standalone);
      const visit = () => {
        if (!active) return;
        const result = installVisit(read(), session, onboarded, standalone);
        if (result.preference) write(result.preference);
        if (result.remind) setOffer("reminder");
      };
      // Coordinate simultaneous login tabs so only one consumes the reminder.
      if (navigator.locks) void navigator.locks.request(storageKey, visit).catch(() => { if (active) visit(); });
      else visit();
    }, 0);
    const stored = (event: StorageEvent) => {
      if (event.key === storageKey && parseInstallPreference(event.newValue)?.phase === "done") setOffer(current => current === "reminder" ? null : current);
    };
    window.addEventListener(staffInstallReadyEvent, beforeInstall);
    window.addEventListener("appinstalled", appInstalled);
    window.addEventListener("storage", stored);
    display.addEventListener("change", updateInstalled);
    return () => { active = false; window.clearTimeout(timer); window.removeEventListener(staffInstallReadyEvent, beforeInstall); window.removeEventListener("appinstalled", appInstalled); window.removeEventListener("storage", stored); display.removeEventListener("change", updateInstalled); };
  }, [onboarded, read, session, storageKey, write]);

  const onboardingCompleted = () => {
    const standalone = isInstalled();
    write(installOnboardingCompleted(session, standalone));
    if (!standalone) { setMessage(""); setOffer("onboarding"); }
  };
  const openSettings = () => { setMessage(""); setOffer("settings"); };
  const close = () => { if (!pending) setOffer(null); };
  const install = () => {
    const event = eventRef.current;
    if (!event || pending) return;
    // Call synchronously in the user's click: awaiting first loses activation.
    let prompted: Promise<void>;
    try { prompted = event.prompt(); } catch { clearStaffInstallEvent(); eventRef.current = null; setNativeReady(false); setMessage("Gebruik het browsermenu om de app te installeren."); return; }
    clearStaffInstallEvent(); eventRef.current = null; setNativeReady(false); setPending(true); setMessage("");
    void Promise.resolve(prompted).then(() => event.userChoice).then(choice => {
      if (choice.outcome === "accepted") { write(done); setOffer(null); }
      else setMessage("Je kunt de app later installeren via Instellingen of het browsermenu.");
    }).catch(() => setMessage("Gebruik het browsermenu om de app te installeren.")).finally(() => setPending(false));
  };
  return { offer, installed, nativeReady, ios, pending, message, onboardingCompleted, openSettings, close, install };
}

export type StaffPwaInstall = ReturnType<typeof useStaffPwaInstall>;

export function StaffPwaInstallDialog({ identity, controller }: { identity: StaffPwaIdentity; controller: StaffPwaInstall }) {
  const { offer, installed, nativeReady, ios, pending, message, close, install } = controller;
  return <Dialog open={offer !== null} onOpenChange={open => { if (!open) close(); }}>
    <StaffDialogContent className="ps-pwa-dialog" showCloseButton={false} onEscapeKeyDown={event => { if (pending) event.preventDefault(); }}>
      <DialogHeader>
        <div className="ps-pwa-brand"><Image unoptimized src={identity.iconUrl} width={80} height={80} alt={`Appicoon van ${identity.name}`}/></div>
        <span className="eyebrow">{offer === "onboarding" ? "Je profiel is klaar" : offer === "reminder" ? "Eenmalige herinnering" : "Op dit apparaat"}</span>
        <DialogTitle>{installed ? "App geïnstalleerd" : `Installeer ${identity.name}`}</DialogTitle>
        <DialogDescription>{installed ? "Open de personeelsapp via het icoon op je beginscherm." : "Zet je personeelsapp op je beginscherm en open je werkdag direct."}</DialogDescription>
      </DialogHeader>
      {!installed && (nativeReady && !ios ? <p className="ps-pwa-intro"><Smartphone aria-hidden="true"/>Je browser opent het installatievenster zodra je hieronder op installeren drukt.</p> : <div className="ps-pwa-instructions">
        <h3>{ios ? "Installeren op iPhone of iPad" : "Installeren via je browser"}</h3>
        {ios ? <ol><li>Open deze pagina in Safari.</li><li>Tik op <Share aria-hidden="true"/> <strong>Deel</strong> (eventueel via het menu).</li><li>Kies <strong>Zet op beginscherm</strong>, laat <strong>Open als webapp</strong> aan staan als die optie verschijnt en tik op <strong>Voeg toe</strong>.</li></ol> : <ol><li>Open het menu van je browser.</li><li>Kies <strong>App installeren</strong>, <strong>Toevoegen aan startscherm</strong> of <strong>Pagina toevoegen aan → Startscherm</strong>.</li><li>Bevestig de installatie. Ontbreekt de optie? Open deze pagina in Chrome of Samsung Internet.</li></ol>}
      </div>)}
      {offer === "reminder" && <p className="ps-pwa-note">Dit is de laatste automatische herinnering. Je vindt installeren daarna bij Instellingen.</p>}
      {message && <p role="status" className="ps-pwa-note">{message}</p>}
      <DialogFooter>
        <Button type="button" variant="outline" disabled={pending} onClick={close}>{offer === "settings" || installed ? "Sluiten" : "Voor nu overslaan"}</Button>
        {!installed && nativeReady && !ios && <Button type="button" disabled={pending} onClick={install}><Download aria-hidden="true"/>{pending ? "Installeren…" : "App installeren"}</Button>}
      </DialogFooter>
    </StaffDialogContent>
  </Dialog>;
}

export function StaffPwaInstallSetting({ controller }: { controller: StaffPwaInstall }) {
  return <section className="ps-pwa-setting" aria-label="Personeelsapp installeren"><div><Smartphone aria-hidden="true"/><div><h3>Personeelsapp op je beginscherm</h3><p>{controller.installed ? "Je gebruikt de geïnstalleerde app op dit apparaat." : "Installeer de app op dit apparaat voor snelle toegang tot je werkdag."}</p></div></div><button type="button" className="ps-secondary" onClick={controller.openSettings}>{controller.installed ? "Installatie bekijken" : "App installeren"}</button></section>;
}
