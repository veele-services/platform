"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, X } from "lucide-react";
import type { SearchGroup, SearchResult } from "@/lib/search/model";
import { confirmDiscard } from './unsaved-form';
import { useDashboardPresentation } from './presentation';
import {SourceReferenceDialog} from './management-cockpit/source-dialog';

const sourceKinds:Record<string,string>={customers:'customer',objects:'object',orders:'work_order',requests:'commercial_request',quotes:'quote',people:'personnel',invoices:'invoice'};

export function GlobalSearch({ actorKey }: { actorKey: string }) {
  const sites=useDashboardPresentation()==='sites';
  const router = useRouter();
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const generation = useRef(0), pending = useRef<AbortController | null>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [refreshVersion,setRefreshVersion]=useState(0);
  const [source,setSource]=useState<{kind:string;id:string}|null>(null);
  const closeSource=useCallback(()=>setSource(null),[]);
  const [response, setResponse] = useState<{ key: string; query: string; groups: SearchGroup[]; error?: string } | null>(null);
  const normalized = query.trim();
  const valid = normalized.length >= 3;
  const current = response?.key === actorKey && response.query === normalized ? response : null;
  const groups = current?.groups ?? [];
  const results = groups.flatMap(group => group.results.map(result=>({...result,group:group.id})));
  const loading = valid && !current;
  const visible = open && valid;
  const forget = useCallback(() => { generation.current++; pending.current?.abort(); setResponse(null); setQuery(""); setOpen(false); setActive(-1); setSource(null); }, []);

  useEffect(() => {
    if (!valid) return;
    const controller = new AbortController(), currentGeneration = ++generation.current;
    pending.current = controller;
    const timer = window.setTimeout(async () => {
      try {
        const result = await fetch("/api/search", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ query: normalized }), signal: controller.signal, cache: "no-store" });
        if (result.status === 403) { if (!controller.signal.aborted && currentGeneration === generation.current) forget(); return; }
        if (!result.ok) throw new Error("Search unavailable");
        const data = await result.json() as { groups: SearchGroup[] };
        if (!controller.signal.aborted && currentGeneration === generation.current) setResponse({ key: actorKey, query: normalized, groups: data.groups });
      } catch {
        if (!controller.signal.aborted && currentGeneration === generation.current) setResponse({ key: actorKey, query: normalized, groups: [], error: "Zoeken is tijdelijk niet beschikbaar. Probeer opnieuw." });
      }
    }, 250);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [actorKey, normalized, valid, forget, refreshVersion]);
  useEffect(() => {
    const close = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    const refresh=()=>{if(valid&&open&&document.visibilityState==='visible'){setResponse(null);setRefreshVersion(v=>v+1)}};
    document.addEventListener("pointerdown", close);
    window.addEventListener("notifications-account-cleared", forget);
    window.addEventListener('focus',refresh);const timer=setInterval(refresh,30000);
    return () => { document.removeEventListener("pointerdown", close); window.removeEventListener("notifications-account-cleared", forget);window.removeEventListener('focus',refresh);clearInterval(timer); };
  }, [forget,valid,open]);
  useEffect(() => {
    if (active >= 0) document.getElementById(`${id}-${active}`)?.scrollIntoView({ block: "nearest" });
  }, [active, id]);
  const navigate = (result:SearchResult,group:string) => { if(sites&&sourceKinds[group]){forget();setSource({kind:sourceKinds[group],id:result.id});return}if (!confirmDiscard()) return; forget(); router.push(result.href); };
  let index = -1;
  return <><div ref={root} className="shell-global-search">
    <div className="shell-search-field"><Search size={17} aria-hidden="true"/><input type="search" aria-label={sites?'Zoeken in Fieldgrid':'Zoek in je organisatie'} placeholder={sites?'Zoek in jouw omgeving…':'Zoek in je organisatie…'} role="combobox" aria-autocomplete="list" aria-expanded={visible} aria-controls={visible ? `${id}-list` : undefined} aria-activedescendant={visible && active >= 0 && results[active] ? `${id}-${active}` : undefined} autoComplete="off" value={query} maxLength={100} onChange={event => { setQuery(event.target.value); setActive(-1); setOpen(true); }} onFocus={() => setOpen(true)} onKeyDown={event => {
      if (event.key === "Escape") { setOpen(false); setActive(-1);if(sites)setQuery(''); }
      if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); setOpen(true); setActive(value => results.length ? value < 0 ? event.key === "ArrowDown" ? 0 : results.length - 1 : (value + (event.key === "ArrowDown" ? 1 : -1) + results.length) % results.length : -1); }
      if (event.key === "Enter") { event.preventDefault(); const result=results[active>=0?active:0];if(result)navigate(result,result.group); }
      if (event.key === "Tab") setOpen(false);
    }}/>{query && <button type="button" className="shell-search-clear" aria-label="Zoekopdracht wissen" onClick={() => { setQuery(""); setActive(-1); root.current?.querySelector("input")?.focus(); }}><X size={15}/></button>}</div>
    {visible && <div className={sites?'mc-search-results':'shell-search-results'} id={`${id}-list`} role="listbox" aria-label="Zoekresultaten" aria-busy={loading}>
      {loading ? <p role="status">Zoeken…</p> : current?.error ? <p role="status">{current.error}</p> : !results.length ? <div className="shell-search-empty"><Search size={22}/><strong>Geen resultaten</strong><p>Probeer een andere naam of een ander nummer.</p></div> : groups.map(group => <div key={group.id} role="group" aria-labelledby={`${id}-${group.id}`}><h3 id={`${id}-${group.id}`}>{group.title}</h3>{group.results.map(result => { const position = ++index; return <button type="button" tabIndex={-1} role="option" aria-selected={active === position} id={`${id}-${position}`} key={result.id} onPointerMove={() => setActive(position)} onPointerDown={event => event.preventDefault()} onClick={() => navigate(result,group.id)}><strong>{result.title}</strong>{result.detail && <small>{result.detail}</small>}</button>; })}</div>)}
    </div>}
    {visible && <span className="sr-only" role="status" aria-live="polite">{current && !current.error ? `${results.length} resultaten gevonden` : ""}</span>}
  </div>{source&&<SourceReferenceDialog kind={source.kind} id={source.id} onClose={closeSource} onForbidden={closeSource}/>}</>;
}
