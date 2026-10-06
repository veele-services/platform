"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { X } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { brandThemeStyle } from "@/lib/branding/palette";
import { useStaffDialogFocus } from "@/lib/staff/use-dialog-focus";
import { personnelThemeStyle } from "@/lib/staff/theme";
import { runNotificationCommand } from "@/app/notifications/actions";
import type { NotificationAccess, NotificationCommand } from "@/lib/notifications/model";
import "./notifications.css";

export function notificationDate(value: string | null, timezone: string) { return value ? new Intl.DateTimeFormat("nl-NL", { dateStyle: "short", timeStyle: "short", timeZone: timezone }).format(new Date(value)) : "—"; }
export const stateLabels: Record<string, string> = { draft: "Concept", scheduled: "Gepland", processing: "In verwerking", running: "Bezig", completed: "Afgerond", partial: "Gedeeltelijk mislukt", partially_failed: "Gedeeltelijk mislukt", paused: "Gepauzeerd", cancelled: "Ingetrokken", revoked: "Ingetrokken", expired: "Verlopen", queued: "In wachtrij", deferred: "Uitgesteld", pending: "In wachtrij", accepted: "Aangeboden aan provider", sent: "Aangeboden aan provider", failed: "Mislukt", uncertain: "Onzeker", suppressed: "Onderdrukt", unreachable: "Niet bereikbaar", available: "Beschikbaar", active: "Actief", planned: "Nog niet aangesloten", inherited: "Standaard", customized: "Aangepast", platform: "Beheerd door Fieldgrid", published: "Actieve versie" };
export function State({ value }: { value: string }) { return <span className="nt-status" data-state={value}>{stateLabels[value] ?? value}</span>; }
export function NotificationDialog({ access, title, description, children, onClose, dirty = false, busy = false }: { access: NotificationAccess; title: string; description: string; children: ReactNode; onClose: () => void; dirty?: boolean; busy?: boolean }) {
  const focus = useStaffDialogFocus(access.workspace === "staff");
  useEffect(() => { if (!dirty) return; const warn = (event: BeforeUnloadEvent) => event.preventDefault(); window.addEventListener("beforeunload", warn); return () => window.removeEventListener("beforeunload", warn); }, [dirty]);
  const close = () => { if (!busy && (!dirty || window.confirm("Onopgeslagen wijzigingen verwerpen?"))) onClose(); };
  return <Dialog open onOpenChange={open => { if (!open) close(); }}><DialogContent className={`nt-dialog${access.workspace === "staff" ? " ps-staff-dialog" : ""}`} aria-modal={access.workspace === "staff" ? true : undefined} showCloseButton={false} {...focus} style={access.workspace === "staff" ? personnelThemeStyle(access.tenant?.primaryColor,access.tenant?.accentColor) : brandThemeStyle(access.tenant?.primaryColor, access.tenant?.accentColor)}><header><div><small>Communicatie / notificaties</small><DialogTitle>{title}</DialogTitle><DialogDescription>{description}</DialogDescription></div><button type="button" className="icon-button" onClick={close} disabled={busy} aria-label="Sluiten"><X size={19}/></button></header><div className="nt-dialog-body">{children}</div></DialogContent></Dialog>;
}
export function useNotificationCommand(access: NotificationAccess) {
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const keys = useRef(new Map<string, string>());
  const execute = async (command: NotificationCommand, payload: unknown) => {
    if (busy) return null;
    setBusy(true); setError("");
    const fingerprint = command + JSON.stringify(payload);
    if (!keys.current.has(fingerprint)) keys.current.set(fingerprint, crypto.randomUUID());
    try { const result = await runNotificationCommand(access.workspace, command, payload, keys.current.get(fingerprint)!); if (!result.ok) setError(result.error); return result; }
    catch { setError("De actie is niet bevestigd. Je invoer blijft bewaard; probeer opnieuw."); return null; }
    finally { setBusy(false); }
  };
  return { busy, error, execute, clearError: () => setError("") };
}
export function ErrorMessage({ message }: { message: string }) { return message ? <p className="nt-error" role="alert">{message}</p> : null; }
