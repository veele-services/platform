"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { MessageSquareText, Plus, RefreshCw } from "lucide-react";
import { loadTicketAccess, loadTicketList } from "@/app/tickets/actions";
import { ticketPaths, ticketQuerySchema, type TicketAccess, type TicketListData, type TicketQuery } from "@/lib/tickets/model";
import { ticketStatusLabels, ticketNextActor } from "./presentation";
import "./tickets.css";

export function TicketContextPanel({ kind, id, workspace = "tenant" }: { kind: NonNullable<TicketQuery["contextKind"]>; id: string; workspace?: "staff" | "tenant" }) {
  const key = `${workspace}:${kind}:${id}`;
  const [loaded, setLoaded] = useState<{ key: string; access: TicketAccess; list: TicketListData } | null>(null), [error, setError] = useState("");
  const [pending, start] = useTransition();
  const load = useCallback(() => start(async () => {
    try {
      const access = await loadTicketAccess(workspace);
      if (!access.ok || !access.data.allowed) { setLoaded(null); return; }
      const list = await loadTicketList(workspace, ticketQuerySchema.parse({ contextKind: kind, contextId: id, pageSize: 10 }));
      if (!list.ok) { setLoaded(null); setError(list.error); return; }
      setError(""); setLoaded({ key, access: access.data, list: list.data });
    } catch { setLoaded(null); setError("De gekoppelde meldingen konden niet worden geladen."); }
  }), [workspace, kind, id, key]);
  useEffect(() => { load(); const focus = () => load(); window.addEventListener("focus", focus); return () => window.removeEventListener("focus", focus); }, [load]);
  if (error) return <section className="ticket-panel ticket-widget"><p className="ticket-error" role="alert">{error}</p><button className="secondary-button" disabled={pending} onClick={load}>Opnieuw proberen</button></section>;
  if (!loaded || loaded.key !== key) return null;
  const base = ticketPaths[workspace], query = `contextKind=${kind}&contextId=${encodeURIComponent(id)}`;
  return <section className="ticket-panel ticket-widget" aria-label={workspace === "staff" ? "Mijn meldingen bij deze context" : "Toegankelijke gekoppelde meldingen"}><div className="ticket-panel-header"><div><h2><MessageSquareText size={16}/> {workspace === "staff" ? "Mijn meldingen" : "Gekoppelde meldingen"}</h2><p>{workspace === "staff" ? "Alleen jouw eigen meldingen bij deze werkcontext." : "Alleen afzonderlijk toegestane meldingen. Dossiertoegang verleent geen extra ticketrechten."}</p></div><button className="resource-action" aria-label="Gekoppelde meldingen vernieuwen" onClick={load} disabled={pending}><RefreshCw size={15}/></button></div><div className="ticket-widget-list">{loaded.list.items.slice(0, 5).map(row => <Link className="ticket-widget-row" key={row.id} href={`${base}/${row.id}`} prefetch={false}><span><strong>{row.number} · {row.subject}</strong><small>{ticketNextActor(row.nextActor, workspace)}</small></span><span className="ticket-status">{ticketStatusLabels[row.status]}</span></Link>)}</div>{!loaded.list.items.length && <p className="ticket-muted">Nog geen toegankelijke meldingen bij deze context.</p>}<div className="ticket-actions">{loaded.access.canCreate && ["work_order", "object"].includes(kind) && <Link className="secondary-button" href={`${base}?${query}&new=1`} prefetch={false}><Plus size={14}/>Probleem melden</Link>}{loaded.list.total > 0 && <Link className="text-link" href={`${base}?${query}`} prefetch={false}>Alle gekoppelde meldingen ({loaded.list.total})</Link>}</div></section>;
}
