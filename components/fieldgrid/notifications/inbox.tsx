"use client";
import { useCallback, useEffect, useRef, useState, type MouseEvent } from "react";
import { EmptyState } from "../empty-state";
import { ActionIcon, ActionLink } from "../action-icon";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell, Check, CheckCheck, Archive, ExternalLink, RefreshCw, X, Eye } from "lucide-react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { brandThemeStyle } from "@/lib/branding/palette";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { loadNotificationAccess, loadNotificationDetail, loadNotificationInbox } from "@/app/notifications/actions";
import { notificationPaths, notificationQuerySchema, type NotificationAccess, type NotificationInbox, type NotificationItem, type NotificationWorkspace } from "@/lib/notifications/model";
import { ErrorMessage, notificationDate, useNotificationCommand } from "./shared";
import { createNotificationRequestGate } from "@/lib/notifications/request-gate";
import { personnelThemeStyle } from "@/lib/staff/theme";

export function NotificationBell({ workspace, actorKey }: { workspace: NotificationWorkspace; actorKey: string }) {
  const [loaded, setLoaded] = useState<{ key: string; access: NotificationAccess; inbox: NotificationInbox } | null>(null), [error, setError] = useState("");
  const key = `${workspace}:${actorKey}`;
  const [deniedKey, setDeniedKey] = useState<string | null>(null);
  const gate = useRef(createNotificationRequestGate());
  const refresh = useCallback(async () => {
    const ticket = gate.current.begin(key);
    try {
      const access = await loadNotificationAccess(workspace);
      if (!gate.current.current(ticket)) return;
      if (!access.ok) { setLoaded(null); setError(access.error); return; }
      if (!access.data.allowed || !access.data.permissions.includes("read_own")) { setLoaded(null); setDeniedKey(key); return; }
      setDeniedKey(null);
      const inbox = await loadNotificationInbox(workspace, notificationQuerySchema.parse({ pageSize: 5 }));
      if (!gate.current.current(ticket)) return;
      if (!inbox.ok) { setLoaded(null); setError(inbox.error); return; }
      setLoaded({ key, access: access.data, inbox: inbox.data }); setError("");
    } catch { if (gate.current.current(ticket)) { setLoaded(null); setError("Notificaties zijn tijdelijk niet beschikbaar."); } }
  }, [workspace, key]);
  useEffect(() => { gate.current.reset(key); const currentGate = gate.current; let live = true; const load = () => { if (live && document.visibilityState === "visible") void refresh(); }; load(); const timer = window.setInterval(load, 30000); window.addEventListener("focus", load); window.addEventListener("notifications-changed", load); const clear = () => { live = false; currentGate.reset(null); setLoaded(null); setError(""); }; window.addEventListener("notifications-account-cleared", clear); return () => { live = false; currentGate.reset(null); window.clearInterval(timer); window.removeEventListener("focus", load); window.removeEventListener("notifications-changed", load); window.removeEventListener("notifications-account-cleared", clear); }; }, [refresh, key]);
  if (deniedKey === key) return null;
  if (!loaded || loaded.key !== key) return error ? <Link className="nt-bell-button icon-button" href={notificationPaths[workspace]} aria-label="Notificaties openen"><Bell size={18}/></Link> : <button className="nt-bell-button icon-button" type="button" disabled aria-label="Notificaties laden" aria-busy="true"><Bell size={18}/></button>;
  return <Popover onOpenChange={open => { if (open) void refresh().catch(() => setError("Notificaties zijn tijdelijk niet beschikbaar.")); }}><PopoverTrigger asChild><button className="nt-bell nt-bell-button icon-button" aria-label={`Notificaties, ${loaded.inbox.unreadCount} ongelezen`}><Bell size={18}/>{loaded.inbox.unreadCount > 0 && <span>{loaded.inbox.unreadCount > 99 ? "99+" : loaded.inbox.unreadCount}</span>}</button></PopoverTrigger><PopoverContent className={`nt-bell-panel${workspace === "staff" ? " ps-staff-popover" : ""}`} style={workspace === "staff" ? personnelThemeStyle(loaded.access.tenant?.primaryColor,loaded.access.tenant?.accentColor) : undefined} align="end" collisionPadding={10}><div className="nt-actions"><strong>Mijn notificaties</strong><Link href={`${notificationPaths[workspace]}/instellingen`}>Voorkeuren</Link></div><InboxRows access={loaded.access} data={loaded.inbox} compact/><Link className="text-link" href={notificationPaths[workspace]}>Alles bekijken</Link></PopoverContent></Popover>;
}
export function InboxRows({ access, data, compact = false }: { access: NotificationAccess; data: NotificationInbox; compact?: boolean }) {
  const key = `${access.workspace}:${access.userId}:${access.tenant?.id ?? "platform"}`;
  const gate = useRef(createNotificationRequestGate());
  const trigger = useRef<HTMLAnchorElement | null>(null);
  const [selected, setSelected] = useState<{key: string; data: NotificationItem} | null>(null), [opening, setOpening] = useState<string | null>(null), [error, setError] = useState("");
  const open = async (id: string) => {
    const request = gate.current.begin(key); setOpening(id); setError("");
    const result = await loadNotificationDetail(access.workspace, id);
    if (!gate.current.current(request)) return;
    setOpening(null);
    if (result.ok) setSelected({key, data: result.data}); else { setSelected(null); setError(result.error); }
  };
  useEffect(() => { const current = gate.current; current.reset(key); return () => current.reset(null); }, [key]);
  const close = () => { gate.current.reset(key); setSelected(null); setOpening(null); setError(""); };
  const openLink = (event: MouseEvent<HTMLAnchorElement>, id: string) => {
    if (event.button || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault(); trigger.current = event.currentTarget; void open(id);
  };
  return <>{compact ? <div className="nt-inbox compact">{data.items.map(item => <Link key={item.id} className={`nt-inbox-item${item.readAt ? "" : " unread"}`} href={`${notificationPaths[access.workspace]}/${item.id}`} prefetch={false}><div><small>{item.senderName} · {notificationDate(item.createdAt, access.timezone)}</small><strong>{item.title}</strong><p>{item.summary || item.body}</p>{item.ackRequired && !item.acknowledgedAt && <span className="nt-status">Ontvangstbevestiging gevraagd</span>}</div></Link>)}{!data.items.length && <EmptyState title="Nog geen notificaties" description="Nieuwe meldingen verschijnen hier zodra je ze ontvangt."/>}</div> : <div className="table-scroll" aria-busy={!!opening}><table className="resource-table nt-inbox-table"><thead><tr>{["Melding", "Afzender", "Ontvangen", "Status", "Acties"].map(label => <th key={label} scope="col">{label}</th>)}</tr></thead><tbody>{data.items.map(item => <tr key={item.id} className={item.readAt ? undefined : "unread"}><td><Link href={`${notificationPaths[access.workspace]}/${item.id}`} prefetch={false} onClick={event => openLink(event, item.id)}>{item.title}</Link><small className="nt-inbox-summary">{item.summary || item.body}</small></td><td>{item.senderName}</td><td>{notificationDate(item.createdAt, access.timezone)}</td><td><span className="nt-status">{item.readAt ? "Gelezen" : "Ongelezen"}</span>{item.ackRequired && !item.acknowledgedAt && <small>Bevestiging gevraagd</small>}</td><td className="actions-column"><ActionLink label="Notificatie openen" title={`Open ${item.title}`} className="resource-action" icon={<Eye size={16}/>} href={`${notificationPaths[access.workspace]}/${item.id}`} prefetch={false} onClick={event => openLink(event, item.id)}/></td></tr>)}{!data.items.length && <tr><td colSpan={5}><EmptyState title="Nog geen notificaties" description="Nieuwe meldingen verschijnen hier. Pas eventueel je filters aan."/></td></tr>}</tbody></table></div>}

  {opening && <p className="nt-muted" role="status">Notificatie openen…</p>}<ErrorMessage message={error}/>
  {selected?.key === key && <NotificationDetail access={access} data={selected.data} onClose={close} onRestoreFocus={()=>trigger.current?.focus()} onChanged={() => open(selected.data.id)}/>}</>;
}
export function InboxActions({ access, unreadCount }: { access: NotificationAccess; unreadCount: number }) {
  const router = useRouter(), action = useNotificationCommand(access);
  return <><ActionIcon label="Alles gelezen" icon={<Check size={16}/>} className="secondary-button" title="Alle notificaties als gelezen markeren" disabled={action.busy || !unreadCount} onClick={async () => { const result = await action.execute("inbox_read_all", {}); if (result?.ok) { router.refresh(); window.dispatchEvent(new Event("notifications-changed")); } }}/><ErrorMessage message={action.error}/></>;
}
export function NotificationDetail({ access, data, onClose, onChanged, onRestoreFocus }: { access: NotificationAccess; data: NotificationItem; onClose?: () => void; onChanged?: () => Promise<void>; onRestoreFocus?: () => void }) {
  const router = useRouter(), action = useNotificationCommand(access);
  const close = () => { if (onClose) onClose(); else router.replace(notificationPaths[access.workspace], {scroll: false}); };
  const mutate = async (command: "inbox_read" | "inbox_unread" | "inbox_archive" | "inbox_unarchive" | "inbox_ack") => {
    const result = await action.execute(command, { id: data.id, version: data.version });
    if (result?.ok) { if (onChanged) await onChanged(); router.refresh(); window.dispatchEvent(new Event("notifications-changed")); }
  };
  return <Dialog open onOpenChange={open => { if (!open) close(); }}><DialogContent showCloseButton={false} className="nt-dialog nt-detail-dialog" onCloseAutoFocus={event=>{if(onRestoreFocus){event.preventDefault();onRestoreFocus();}}} style={{...brandThemeStyle(access.tenant?.primaryColor, access.tenant?.accentColor), width:"min(620px, calc(100vw - 24px))",maxWidth:620}}>
    <header className="nt-detail-heading"><span className="nt-detail-icon"><Bell size={20}/></span><div><DialogTitle>{data.title}</DialogTitle><DialogDescription>{data.senderName} · {notificationDate(data.createdAt, access.timezone)}</DialogDescription></div><button type="button" className="icon-button nt-detail-close" aria-label="Sluiten" onClick={close}><X size={18}/></button></header>
    <div className="nt-detail-body"><p className="nt-prose">{data.body || data.summary}</p>
      {!data.sourceAvailable && <p className="nt-notice">De oorspronkelijke inhoud is niet meer beschikbaar binnen je huidige toegang.</p>}
      <p className="nt-muted">{data.readAt ? `Gelezen op ${notificationDate(data.readAt, access.timezone)}.` : "Nog niet als gelezen gemarkeerd."} {data.acknowledgedAt ? `Ontvangst bevestigd op ${notificationDate(data.acknowledgedAt, access.timezone)}.` : ""}</p>
      {data.ackRequired && <p className="nt-notice">Ontvangst bevestigen is geen akkoord op een offerte, overeenkomst, werkbon of betaling.</p>}<ErrorMessage message={action.error}/>
    </div>
    <footer className="nt-detail-footer"><div className="nt-actions">
      {data.allowedActions.includes(data.readAt ? "unread" : "read") && <button className="secondary-button nt-detail-icon-action" aria-label={data.readAt ? "Ongelezen markeren" : "Gelezen markeren"} title={data.readAt ? "Ongelezen markeren" : "Gelezen markeren"} disabled={action.busy} onClick={() => { void mutate(data.readAt ? "inbox_unread" : "inbox_read"); }}><Check size={16}/></button>}
      {data.allowedActions.includes(data.archivedAt ? "unarchive" : "archive") && <button className="secondary-button nt-detail-icon-action" aria-label={data.archivedAt ? "Terug naar inbox" : "Archiveren"} title={data.archivedAt ? "Terug naar inbox" : "Archiveren"} disabled={action.busy} onClick={() => { void mutate(data.archivedAt ? "inbox_unarchive" : "inbox_archive"); }}><Archive size={16}/></button>}
      <button className="secondary-button nt-detail-refresh" aria-label="Notificatie vernieuwen" disabled={action.busy} onClick={() => { if (onChanged) void onChanged(); else router.refresh(); }}><RefreshCw size={15}/></button>
      {data.ackRequired && !data.acknowledgedAt && data.allowedActions.includes("ack") && <button className="primary-button nt-detail-icon-action" aria-label="Ontvangst bevestigen" title="Ontvangst bevestigen" disabled={action.busy} onClick={() => { void mutate("inbox_ack"); }}><CheckCheck size={16}/></button>}
    </div><div className="nt-actions nt-detail-primary">
      {data.targetPath && data.sourceAvailable && <Link className="primary-button" href={data.targetPath} prefetch={false}><ExternalLink size={15}/>{data.actionLabel || "Bron openen"}</Link>}
    </div></footer>
  </DialogContent></Dialog>;
}
