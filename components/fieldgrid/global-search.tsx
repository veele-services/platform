"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, X } from "lucide-react";
import type { SearchGroup } from "@/lib/search/model";

export function GlobalSearch({ actorKey }: { actorKey: string }) {
  const router = useRouter();
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [response, setResponse] = useState<{ key: string; query: string; groups: SearchGroup[]; error?: string } | null>(null);
  const normalized = query.trim();
  const valid = normalized.length >= 3;
  const current = response?.key === actorKey && response.query === normalized ? response : null;
  const groups = current?.groups ?? [];
  const results = groups.flatMap(group => group.results);
  const loading = valid && !current;
  const visible = open && valid;

  useEffect(() => {
    if (!valid) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const result = await fetch("/api/search", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ query: normalized }), signal: controller.signal, cache: "no-store" });
        if (!result.ok) throw new Error("Search unavailable");
        const data = await result.json() as { groups: SearchGroup[] };
        if (!controller.signal.aborted) setResponse({ key: actorKey, query: normalized, groups: data.groups });
      } catch {
        if (!controller.signal.aborted) setResponse({ key: actorKey, query: normalized, groups: [], error: "Zoeken is tijdelijk niet beschikbaar. Probeer opnieuw." });
      }
    }, 250);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [actorKey, normalized, valid]);
  useEffect(() => {
    const close = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    const clear = () => { setResponse(null); setQuery(""); setOpen(false); };
    document.addEventListener("pointerdown", close);
    window.addEventListener("notifications-account-cleared", clear);
    return () => { document.removeEventListener("pointerdown", close); window.removeEventListener("notifications-account-cleared", clear); };
  }, []);
  useEffect(() => {
    if (active >= 0) document.getElementById(`${id}-${active}`)?.scrollIntoView({ block: "nearest" });
  }, [active, id]);
  const navigate = (href: string) => { setOpen(false); setQuery(""); setResponse(null); router.push(href); };
  let index = -1;
  return <div ref={root} className="shell-global-search">
    <div className="shell-search-field"><Search size={17} aria-hidden="true"/><input type="search" aria-label="Zoek in je organisatie" placeholder="Zoek in je organisatie…" role="combobox" aria-autocomplete="list" aria-expanded={visible} aria-controls={visible ? `${id}-list` : undefined} aria-activedescendant={visible && active >= 0 && results[active] ? `${id}-${active}` : undefined} autoComplete="off" value={query} maxLength={100} onChange={event => { setQuery(event.target.value); setActive(-1); setOpen(true); }} onFocus={() => setOpen(true)} onKeyDown={event => {
      if (event.key === "Escape") { setOpen(false); setActive(-1); }
      if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); setOpen(true); setActive(value => results.length ? value < 0 ? event.key === "ArrowDown" ? 0 : results.length - 1 : (value + (event.key === "ArrowDown" ? 1 : -1) + results.length) % results.length : -1); }
      if (event.key === "Enter") { event.preventDefault(); if (results[active]) navigate(results[active].href); }
      if (event.key === "Tab") setOpen(false);
    }}/>{query && <button type="button" className="shell-search-clear" aria-label="Zoekopdracht wissen" onClick={() => { setQuery(""); setActive(-1); root.current?.querySelector("input")?.focus(); }}><X size={15}/></button>}</div>
    {visible && <div className="shell-search-results" id={`${id}-list`} role="listbox" aria-label="Zoekresultaten" aria-busy={loading}>
      {loading ? <p role="status">Zoeken…</p> : current?.error ? <p role="status">{current.error}</p> : !results.length ? <div className="shell-search-empty"><Search size={22}/><strong>Geen resultaten</strong><p>Probeer een andere naam of een ander nummer.</p></div> : groups.map(group => <div key={group.id} role="group" aria-labelledby={`${id}-${group.id}`}><h3 id={`${id}-${group.id}`}>{group.title}</h3>{group.results.map(result => { const position = ++index; return <button type="button" tabIndex={-1} role="option" aria-selected={active === position} id={`${id}-${position}`} key={result.id} onPointerMove={() => setActive(position)} onPointerDown={event => event.preventDefault()} onClick={() => navigate(result.href)}><strong>{result.title}</strong>{result.detail && <small>{result.detail}</small>}</button>; })}</div>)}
    </div>}
    {visible && <span className="sr-only" role="status" aria-live="polite">{current && !current.error ? `${results.length} resultaten gevonden` : ""}</span>}
  </div>;
}
