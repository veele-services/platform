"use client";

import { createContext, useContext, useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { Info, X } from "lucide-react";
import { dismissAccountGuide, loadAccountGuides } from "@/lib/guides/actions";
import { guideCatalogue, isGuideKey, sectionGuideKeys, type GuideKey } from "@/lib/guides/catalogue";
import "./guide.css";

const GuideContext = createContext<{ ready: boolean; dismissed: Set<GuideKey>; record: (key: GuideKey) => void } | null>(null);

export function AccountGuideProvider({ initialDismissed, children }: { initialDismissed: GuideKey[] | null; children: ReactNode }) {
  const [dismissed, setDismissed] = useState(() => new Set(initialDismissed ?? []));
  const [ready,setReady] = useState(initialDismissed !== null);
  const path = usePathname();
  const live = useRef(false);
  const epoch = useRef(0);
  useEffect(() => {
    live.current = true;
    const generation = ++epoch.current;
    const refresh = async () => {
      if (document.visibilityState !== "visible" || !/^\/(app|staff|klant)(\/|$)/.test(path)) return;
      const current = await loadAccountGuides().catch(()=>null);
      if (live.current && generation === epoch.current && current) { setDismissed(previous => new Set([...previous,...current])); setReady(true); }
    };
    const clear = () => { epoch.current++; setReady(false); setDismissed(new Set()); };
    void refresh();
    window.addEventListener("focus",refresh);
    window.addEventListener("notifications-account-cleared",clear);
    return () => { live.current = false; window.removeEventListener("focus",refresh); window.removeEventListener("notifications-account-cleared",clear); };
  },[path]);
  return <GuideContext.Provider value={{ready,dismissed,record:key=>{if(live.current && ready)setDismissed(previous=>new Set([...previous,key]));}}}><span hidden aria-hidden="true" data-account-guides-ready={ready}/>{children}</GuideContext.Provider>;
}

export function GuideBanner({ guideKey, className = "" }: { guideKey?: string; className?: string }) {
  const account = useContext(GuideContext), path = usePathname();
  const [pending,start] = useTransition(),[error,setError] = useState("");
  if (!account?.ready || !guideKey || !isGuideKey(guideKey) || account.dismissed.has(guideKey) || !/^\/(app|staff|klant)(\/|$)/.test(path)) return null;
  const [title,explanation] = guideCatalogue[guideKey];
  return <aside className={`fg-guide ${className}`} aria-label={`Uitleg: ${title}`} data-guide-key={guideKey}>
    <Info className="fg-guide-icon" size={20} aria-hidden="true"/>
    <div className="fg-guide-copy"><strong>{title}</strong><p>{explanation}</p>{error && <p role="alert">{error}</p>}</div>
    <button type="button" className="fg-guide-dismiss" aria-label={`Uitleg over ${title} sluiten en als gelezen opslaan`} disabled={pending} onClick={()=>start(async()=>{setError("");try{const result=await dismissAccountGuide(guideKey);if(result.ok)account.record(guideKey);else setError(result.error);}catch{setError("De leesbevestiging is niet opgeslagen. Probeer het kruisje opnieuw.");}})}><X size={18}/></button>
  </aside>;
}

export function GuideForTitle({ title, className }: { title: string; className?: string }) { return <GuideBanner guideKey={sectionGuideKeys[title]} className={className}/>; }
