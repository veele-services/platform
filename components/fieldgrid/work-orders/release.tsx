"use client";

import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import type { TenantContext } from "@/lib/auth/context";
import { hasManagementPermission } from "@/lib/management/model";
import { mutateWorkOrder } from "@/app/app/work-order-actions";
import { WorkOrderDialog } from "./dialog";

export function canReleaseWorkOrder(tenant: TenantContext, order: { status: string; start: string | null; end: string | null }, crew: Array<{ status: string }>) {
  return tenant.roles.some(role => ["tenant_admin", "management", "planner"].includes(role))
    && hasManagementPermission(tenant, "backoffice.work_orders.write")
    && hasManagementPermission(tenant, "backoffice.functions.mutate_work_order")
    && order.status === "planned" && Boolean(order.start && order.end)
    && crew.some(assignment => assignment.status === "planned");
}

/** Every entry point uses the existing versioned publication command. */
export function WorkOrderReleaseDialog({ order, tenant, onClose, onSaved }: {
  order: { id: string; number: string; version: number };
  tenant: TenantContext; onClose: () => void; onSaved: () => void;
}) {
  const [error, setError] = useState(""), [pending, start] = useTransition();
  const mutation = useRef(crypto.randomUUID());
  return <WorkOrderDialog title="Werkbon vrijgeven" eyebrow="UITVOERING" size="compact" description={order.number} tenant={tenant} busy={pending} onClose={onClose}>
    <div className="wo-dialog-body"><p>Geef de opgeslagen planning vrij voor alle ingeplande medewerkers. Zij krijgen toegang tot deze werkbon in de personeelsapp.</p><p>Controleer vóór vrijgave de taken, datum en bezetting. Niet-opgeslagen wijzigingen worden niet meegenomen.</p>{error && <p className="wo-error" role="alert">{error}</p>}</div>
    <footer className="wizard-footer"><button className="secondary-button" disabled={pending} onClick={onClose}>Annuleren</button><button className="primary-button" disabled={pending} onClick={() => start(async () => {
      setError("");
      try {
        const result = await mutateWorkOrder({ orderId: order.id, version: order.version, mutationId: mutation.current, action: "publish" });
        if (!result.ok) { setError(result.error); return; }
        toast.success("Werkbon vrijgegeven"); onSaved();
      } catch { setError("Vrijgave is niet bevestigd. Controleer de actuele status of probeer hetzelfde verzoek opnieuw."); }
    })}>{pending ? "Vrijgeven…" : "Werkbon vrijgeven"}</button></footer>
  </WorkOrderDialog>;
}
