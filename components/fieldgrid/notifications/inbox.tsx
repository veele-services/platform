"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell, Check, Archive, ExternalLink, RefreshCw } from "lucide-react";
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
  const gate = useRef(createNotificationRequestGate());
  const refresh = useCallback(async () => {
    const ticket = gate.current.begin(key);
    try {
      const access = await loadNotificationAccess(workspace);
      if (!gate.current.current(ticket)) return;
      if (!access.ok || !access.data.allowed || !access.data.permissions.includes("read_own")) { setLoaded(null); return; }
      const inbox = await loadNotificationInbox(workspace, notificationQuerySchema.parse({ pageSize: 5 }));
      if (!gate.current.current(ticket)) return;
      if (!inbox.ok) { setLoaded(null); setError(inbox.error); return; }
      setLoaded({ key, access: access.data, inbox: inbox.data }); setError("");
    } catch { if (gate.current.current(ticket)) { setLoaded(null); setError("Notificaties zijn tijdelijk niet beschikbaar."); } }
  }, [workspace, key]);
  useEffect(() => { gate.current.reset(key); const currentGate = gate.current; let live = true; const load = () => { if (live && document.visibilityState === "visible") void refresh(); }; load(); const timer = window.setInterval(load, 30000); window.addEventListener("focus", load); window.addEventListener("notifications-changed", load); const clear = () => { live = false; currentGate.reset(null); setLoaded(null); setError(""); }; window.addEventListener("notifications-account-cleared", clear); return () => { live = false; currentGate.reset(null); window.clearInterval(timer); window.removeEventListener("focus", load); window.removeEventListener("notifications-changed", load); window.removeEventListener("notifications-account-cleared", clear); }; }, [refresh, key]);
  if (!loaded || loaded.key !== key) return error ? <Link className="icon-button" href={notificationPaths[workspace]} aria-label="Notificaties openen"><Bell size={18}/></Link> : null;
  return <Popover onOpenChange={open => { if (open) void refresh().catch(() => setError("Notificaties zijn tijdelijk niet beschikbaar.")); }}><PopoverTrigger asChild><button className="nt-bell icon-button" aria-label={`Notificaties, ${loaded.inbox.unreadCount} ongelezen`}><Bell size={18}/>{loaded.inbox.unreadCount > 0 && <span>{loaded.inbox.unreadCount > 99 ? "99+" : loaded.inbox.unreadCount}</span>}</button></PopoverTrigger><PopoverContent className={`nt-bell-panel${workspace === "staff" ? " ps-staff-popover" : ""}`} style={workspace === "staff" ? personnelThemeStyle(loaded.access.tenant?.primaryColor,loaded.access.tenant?.accentColor) : undefined} align="end" collisionPadding={10}><div className="nt-actions"><strong>Mijn notificaties</strong><Link href={`${notificationPaths[workspace]}/instellingen`}>Voorkeuren</Link></div><InboxRows access={loaded.access} data={loaded.inbox} compact/>{!loaded.inbox.items.length && <p className="nt-muted">Geen notificaties.</p>}<Link className="text-link" href={notificationPaths[workspace]}>Alles bekijken</Link></PopoverContent></Popover>;
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
  return <><div className={`nt-inbox${compact ? " compact" : ""}`} aria-busy={!!opening}>{data.items.map(item => <Link key={item.id} className={`nt-inbox-item${item.readAt ? "" : " unread"}`} href={`${notificationPaths[access.workspace]}/${item.id}`} prefetch={false} onClick={event => {
    if (compact || event.button || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault(); trigger.current=event.currentTarget; void open(item.id);
  }}><div><small>{item.senderName} · {notificationDate(item.createdAt, access.timezone)}</small><strong>{item.title}</strong><p>{item.summary || item.body}</p>{item.ackRequired && !item.acknowledgedAt && <span className="nt-status">Ontvangstbevestiging gevraagd</span>}</div></Link>)}</div>
  {opening && <p className="nt-muted" role="status">Notificatie openen…</p>}<ErrorMessage message={error}/>
  {selected?.key === key && <NotificationDetail access={access} data={selected.data} onClose={close} onRestoreFocus={()=>trigger.current?.focus()} onChanged={() => open(selected.data.id)}/>}</>;
}
export function InboxActions({ access, unreadCount }: { access: NotificationAccess; unreadCount: number }) {
  const router = useRouter(), action = useNotificationCommand(access);
  return <><button className="secondary-button" aria-label="Alles gelezen" title="Alle notificaties als gelezen markeren" disabled={action.busy || !unreadCount} onClick={async () => { const result = await action.execute("inbox_read_all", {}); if (result?.ok) { router.refresh(); window.dispatchEvent(new Event("notifications-changed")); } }}><Check size={16}/></button><ErrorMessage message={action.error}/></>;
}
export function NotificationDetail({ access, data, onClose, onChanged, onRestoreFocus }: { access: NotificationAccess; data: NotificationItem; onClose?: () => void; onChanged?: () => Promise<void>; onRestoreFocus?: () => void }) {
  const router = useRouter(), action = useNotificationCommand(access);
  const close = () => { if (onClose) onClose(); else router.replace(notificationPaths[access.workspace], {scroll: false}); };
  const mutate = async (command: "inbox_read" | "inbox_unread" | "inbox_archive" | "inbox_unarchive" | "inbox_ack") => {
    const result = await action.execute(command, { id: data.id, version: data.version });
    if (result?.ok) { if (onChanged) await onChanged(); router.refresh(); window.dispatchEvent(new Event("notifications-changed")); }
  };
  return <Dialog open onOpenChange={open => { if (!open) close(); }}><DialogContent className="nt-dialog nt-detail-dialog" onCloseAutoFocus={event=>{if(onRestoreFocus){event.preventDefault();onRestoreFocus();}}} style={{...brandThemeStyle(access.tenant?.primaryColor, access.tenant?.accentColor), width:"min(620px, calc(100vw - 24px))",maxWidth:620}}>
    <header className="nt-detail-heading"><span className="nt-detail-icon"><Bell size={20}/></span><div><DialogTitle>{data.title}</DialogTitle><DialogDescription>{data.senderName} · {notificationDate(data.createdAt, access.timezone)}</DialogDescription></div></header>
    <div className="nt-detail-body"><p className="nt-prose">{data.body || data.summary}</p>
      {!data.sourceAvailable && <p className="nt-notice">De oorspronkelijke inhoud is niet meer beschikbaar binnen je huidige toegang.</p>}
      <p className="nt-muted">{data.readAt ? `Gelezen op ${notificationDate(data.readAt, access.timezone)}.` : "Nog niet als gelezen gemarkeerd."} {data.acknowledgedAt ? `Ontvangst bevestigd op ${notificationDate(data.acknowledgedAt, access.timezone)}.` : ""}</p>
      {data.ackRequired && <p className="nt-notice">Ontvangst bevestigen is geen akkoord op een offerte, overeenkomst, werkbon of betaling.</p>}<ErrorMessage message={action.error}/>
    </div>
    <footer className="nt-detail-footer"><div className="nt-actions">
      {data.allowedActions.includes(data.readAt ? "unread" : "read") && <button className="secondary-button" disabled={action.busy} onClick={() => { void mutate(data.readAt ? "inbox_unread" : "inbox_read"); }}><Check size={15}/>{data.readAt ? "Ongelezen markeren" : "Gelezen markeren"}</button>}
      {data.allowedActions.includes(data.archivedAt ? "unarchive" : "archive") && <button className="secondary-button" disabled={action.busy} onClick={() => { void mutate(data.archivedAt ? "inbox_unarchive" : "inbox_archive"); }}><Archive size={15}/>{data.archivedAt ? "Terug naar inbox" : "Archiveren"}</button>}
      <button className="secondary-button nt-detail-refresh" aria-label="Notificatie vernieuwen" disabled={action.busy} onClick={() => { if (onChanged) void onChanged(); else router.refresh(); }}><RefreshCw size={15}/></button>
    </div><div className="nt-actions nt-detail-primary">
      <button className="secondary-button" onClick={close}>Sluiten</button>
      {data.ackRequired && !data.acknowledgedAt && data.allowedActions.includes("ack") && <button className="primary-button" disabled={action.busy} onClick={() => { void mutate("inbox_ack"); }}>Ontvangst bevestigen</button>}
      {data.targetPath && data.sourceAvailable && <Link className="primary-button" href={data.targetPath} prefetch={false}><ExternalLink size={15}/>{data.actionLabel || "Bron openen"}</Link>}
    </div></footer>
  </DialogContent></Dialog>;
}
