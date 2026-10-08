"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import "./list-pagination.css";

export const LIST_PAGE_SIZES = [10, 25, 50, 100] as const;
const singular: Record<string, string> = { resultaten: "resultaat", werkbonnen: "werkbon", facturen: "factuur", klanten: "klant", objecten: "object", medewerkers: "medewerker", aanvragen: "aanvraag", offertes: "offerte", notities: "notitie", acties: "actie", bijlagen: "bijlage", registraties: "registratie", documenten: "document", berichten: "bericht", notificaties: "notificatie", afspraken: "afspraak", taken: "taak", templates: "template", overeenkomsten: "overeenkomst", tickets: "ticket" };
const preferenceStorage = (key: string) => `fieldgrid:list-size:${key}`;
function readPreference(key: string) {
  try { const value = Number(localStorage.getItem(preferenceStorage(key))); return LIST_PAGE_SIZES.some(size => size === value) ? value : null; } catch { return null; }
}
function writePreference(key: string, size: number) {
  try { localStorage.setItem(preferenceStorage(key), String(size)); } catch { /* A blocked preference store never prevents browsing. */ }
}

/** Page controls belong after their list's bordered surface, including empty lists. */
export function ListPagination({ total, page, pageSize, noun = "resultaten", busy = false, preferenceKey, href, pageSizeParam = "pageSize", onPageChange, onPageSizeChange }: {
  total: number; page: number; pageSize: number; noun?: string; busy?: boolean; preferenceKey: string;
  /** Existing route and query for server-paginated lists; callbacks take precedence. */
  href?: string; pageSizeParam?: string; onPageChange?: (page: number) => void; onPageSizeChange?: (size: number) => void;
}) {
  const router = useRouter(), loaded = useRef("");
  const pages = Math.max(1, Math.ceil(total / pageSize)), current = Math.max(1, Math.min(page, pages));
  const target = (nextPage: number, nextSize = pageSize) => {
    const [path, search = ""] = (href ?? "").split("?");
    const params = new URLSearchParams(search); params.set("page", String(nextPage)); params.set(pageSizeParam, String(nextSize));
    return `${path}?${params}`;
  };
  useEffect(() => {
    if (loaded.current === preferenceKey) return;
    loaded.current = preferenceKey;
    const preferred = readPreference(preferenceKey);
    if (preferred === null || preferred === pageSize) return;
    if (onPageSizeChange) onPageSizeChange(preferred);
    else if (href) {
      const [path, search = ""] = href.split("?"); const params = new URLSearchParams(search);
      // An explicit URL preference has priority, including links copied to colleagues.
      if (new URLSearchParams(window.location.search).has(pageSizeParam)) return;
      params.set(pageSizeParam, String(preferred)); params.set("page", "1"); router.replace(`${path}?${params}`, { scroll: false });
    }
  }, [preferenceKey, router, pageSize, pageSizeParam, href, onPageSizeChange]);
  const navigate = (next: number) => { if (onPageChange) onPageChange(next); else if (href) router.push(target(next), { scroll: false }); };
  return <nav className="list-pagination" aria-label={`Paginatie ${noun}`} aria-busy={busy}>
    <span className="list-pagination-summary" aria-live="polite">{total} {total === 1 ? singular[noun] ?? noun : noun} · pagina {current} van {pages}{busy && " · bijwerken…"}</span>
    <div className="list-pagination-controls"><label>Toon<select aria-label="Aantal per pagina" value={pageSize} disabled={busy} onChange={event => {
      const size = Number(event.target.value); writePreference(preferenceKey, size);
      if (onPageSizeChange) onPageSizeChange(size); else if (href) router.push(target(1, size), { scroll: false });
    }}>{[...new Set<number>([...LIST_PAGE_SIZES, pageSize])].sort((a,b)=>a-b).map(size=><option key={size} value={size}>{size}</option>)}</select><span>per pagina</span></label>
    <button className="secondary-button" aria-label="Vorige pagina" disabled={busy || current <= 1} onClick={() => navigate(current - 1)}><ChevronLeft size={16}/></button>
    <label className="list-page-picker"><span className="sr-only">Pagina</span><select aria-label="Ga naar pagina" value={current} disabled={busy || pages <= 1} onChange={event => navigate(Number(event.target.value))}>{Array.from({length: pages}, (_, index) => <option key={index + 1} value={index + 1}>{index + 1}</option>)}</select><span className="list-page-total">van {pages}</span></label>
    <button className="secondary-button" aria-label="Volgende pagina" disabled={busy || current >= pages} onClick={() => navigate(current + 1)}><ChevronRight size={16}/></button></div>
  </nav>;
}

/** Client pagination is only for a complete authorised collection, never a server page. */
export function useListPagination<T>(rows: readonly T[], initialSize = 25) {
  const [page, setPage] = useState(1), [pageSize, setSize] = useState(initialSize);
  const pages = Math.max(1, Math.ceil(rows.length / pageSize)), current = Math.min(page, pages);
  return { total: rows.length, page: current, pageSize, items: rows.slice((current - 1) * pageSize, current * pageSize), setPage,
    setPageSize: (size: number) => { setSize(size); setPage(1); } };
}
