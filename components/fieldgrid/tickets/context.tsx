"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { Plus, RefreshCw } from "lucide-react";
import { loadTicketAccess, loadTicketList } from "@/app/tickets/actions";
import { ticketPaths, ticketQuerySchema, type TicketAccess, type TicketListData, type TicketQuery } from "@/lib/tickets/model";
import { ticketStatusLabels, ticketNextActor } from "./presentation";
import { ContentSection } from "../content-section";
import { ListPagination } from "../list-pagination";
import "./tickets.css";

export function TicketContextPanel({ kind, id, workspace = "tenant" }: { kind: NonNullable<TicketQuery["contextKind"]>; id: string; workspace?: "staff" | "tenant" }) {
  const [page, setPage] = useState(1), [pageSize, setPageSize] = useState(25);
  const key = `${workspace}:${kind}:${id}:${page}:${pageSize}`;
  const [loaded, setLoaded] = useState<{ key: string; access: TicketAccess; list: TicketListData } | null>(null), [error, setError] = useState("");
  const [pending, start] = useTransition();
  const load = useCallback(() => start(async () => {
    try {
      const access = await loadTicketAccess(workspace);
      if (!access.ok || !access.data.allowed) { setLoaded(null); return; }
      const list = await loadTicketList(workspace, ticketQuerySchema.parse({ contextKind: kind, contextId: id, page, pageSize }));
      if (!list.ok) { setLoaded(null); setError(list.error); return; }
      setError(""); setLoaded({ key, access: access.data, list: list.data });
    } catch { setLoaded(null); setError("De gekoppelde tickets konden niet worden geladen."); }
  }), [workspace, kind, id, key, page, pageSize]);
  useEffect(() => { load(); const focus = () => load(); window.addEventListener("focus", focus); return () => window.removeEventListener("focus", focus); }, [load]);
  if (error) return <section className="ticket-panel ticket-widget"><p className="ticket-error" role="alert">{error}</p><button className="secondary-button" disabled={pending} onClick={load}>Opnieuw proberen</button></section>;
  if (!loaded || loaded.key !== key) return null;
  const base = ticketPaths[workspace], query = `contextKind=${kind}&contextId=${encodeURIComponent(id)}`;
  return <><ContentSection className="ticket-widget" title={workspace === "staff" ? "Mijn tickets" : "Gekoppelde tickets"} help={workspace === "staff" ? "Jouw eigen tickets bij deze werkcontext." : "Toegankelijke tickets bij dit dossier."} actions={<>
    {loaded.access.canCreate && ["work_order", "object"].includes(kind) && <Link className="primary-button" href={`${base}?${query}&new=1`} prefetch={false}><Plus size={14}/>Ticket toevoegen</Link>}
    <button className="resource-action" aria-label="Gekoppelde tickets vernieuwen" onClick={load} disabled={pending}><RefreshCw size={15}/></button>
  </>}>
    <div className="ticket-widget-list">{loaded.list.items.map(row => <Link className="ticket-widget-row" key={row.id} href={`${base}/${row.id}`} prefetch={false}><span><strong>{row.number} · {row.subject}</strong><small>{ticketNextActor(row.nextActor, workspace)}</small></span><span className="ticket-status">{ticketStatusLabels[row.status]}</span></Link>)}</div>
    {!loaded.list.items.length && <p className="ticket-muted">Nog geen tickets bij deze context.</p>}
  </ContentSection><ListPagination total={loaded.list.total} page={loaded.list.page} pageSize={loaded.list.pageSize} noun="tickets" busy={pending} preferenceKey={`tickets:${workspace}:${loaded.access.userId}:${kind}:${id}`} onPageChange={setPage} onPageSizeChange={size => { setPageSize(size); setPage(1); }}/></>;
}
