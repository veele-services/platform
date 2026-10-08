"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRightLeft } from "lucide-react";
import { toast } from "sonner";
import { runManagementCommand } from "@/app/app/gebruikers/actions";
import { WorkOrderDialog } from "../work-orders/dialog";
import type { TenantContext } from "@/lib/auth/context";
import "./management.css";

export function OwnershipTransfer({ tenant }: { tenant: TenantContext }) {
  const [open, setOpen] = useState(false), [confirmed, setConfirmed] = useState(false), [pending, start] = useTransition(), [error, setError] = useState("");
  const request = useRef({ transferId: "", id: "" }), router = useRouter(), transfer = tenant.ownershipTransfer;
  if (!transfer) return null;
  const expires = new Intl.DateTimeFormat("nl-NL", { dateStyle: "medium", timeStyle: "short", timeZone: tenant.timezone }).format(new Date(transfer.expiresAt));
  return <><section className="panel management-transfer-box" aria-label="Eigendomsoverdracht"><div><strong>{transfer.sourceName} wil het eigenaarschap aan je overdragen</strong><p>Controleer de overdracht en log zo nodig opnieuw in met een inlogcode. Je kunt accepteren tot {expires}.</p></div>
    <button className="secondary-button" onClick={() => { setConfirmed(false); setError(""); setOpen(true); }}><ArrowRightLeft size={16}/>Overdracht bekijken</button></section>
    {open && <WorkOrderDialog tenant={tenant} eyebrow="EIGENAARSCHAP" title="Eigenaarschap accepteren" description="Na acceptatie krijg je alle tenantrechten en wordt de huidige eigenaar een managementgebruiker." busy={pending} onClose={() => setOpen(false)}>
      <div className="wo-dialog-body management-form"><p className="management-summary">{transfer.sourceName} heeft deze overdracht klaargezet. Controleer de organisatie en bevestig dat je het eigenaarschap wilt overnemen.</p>
        <label className="management-permission"><input type="checkbox" disabled={pending} checked={confirmed} onChange={event => setConfirmed(event.target.checked)}/><span>Ik accepteer het eigenaarschap van {tenant.name}.</span></label>
        {error && <><p className="wo-error" role="alert">{error}</p>{/opnieuw.*in|inlogcode/i.test(error) && <Link className="secondary-button" href="/login?next=%2Fapp">Opnieuw inloggen met een code</Link>}</>}
      </div><footer className="wizard-footer"><button className="secondary-button" disabled={pending} onClick={() => setOpen(false)}>Annuleren</button><button className="primary-button" disabled={pending || !confirmed} onClick={() => start(async () => {
        setError(""); if (request.current.transferId !== transfer.id) request.current = { transferId: transfer.id, id: crypto.randomUUID() };
        const result = await runManagementCommand({ command: "accept_transfer", input: { transferId: transfer.id }, requestId: request.current.id });
        if (!result.ok) { setError(result.error); return; } toast.success("Eigenaarschap overgedragen"); setOpen(false); router.refresh();
      })}>{pending ? "Accepteren…" : "Eigenaarschap accepteren"}</button></footer>
    </WorkOrderDialog>}
  </>;
}
