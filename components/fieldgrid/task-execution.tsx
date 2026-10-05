"use client";
import { useEffect, useState } from "react";
import type { Row } from "@/lib/objects/model";
import { assignWorkOrderTask, getTaskCollaboration, recordTaskExecution, type TaskCollaboration } from "@/app/app/dossier-actions";
import { billingStatus, executionLabels } from "@/lib/dossiers/status";
import { ObjectForm } from "./objects/forms";
type ExecutionTask = Pick<Row<"work_order_tasks">,
  "id" | "task_name" | "quantity" | "unit" | "transferred_quantity" |
  "withdrawn_quantity" | "executed_quantity" | "completed_at" |
  "completion_note" | "execution_state" | "execution_version" |
  "is_extra_work" | "extra_work_status"
> & { unit_price_cents?: number };
export function TaskExecution({ task, editable = false, allocated = 0, reviewed = false }: { task: ExecutionTask; editable?: boolean; allocated?: number; reviewed?: boolean }) {
  const [open, setOpen] = useState(false);
  const [collaboration, setCollaboration] = useState<TaskCollaboration | null>(null), [details, setDetails] = useState(false), [error, setError] = useState("");
  useEffect(() => { if (!details) return; let active = true; getTaskCollaboration(task.id).then(result => { if (!active) return; if (result.ok) { setCollaboration(result.data); setError(""); } else setError(result.error); }).catch(() => { if (active) setError("Taakbijdragen niet beschikbaar."); }); return () => { active = false; }; }, [details, task.id, task.execution_version]);
  const ownQuantity = Math.max(0, task.quantity - task.transferred_quantity - task.withdrawn_quantity);
  const actual = task.executed_quantity ?? (task.completed_at ? ownQuantity : 0);
  const financial = task.unit_price_cents === undefined ? null : billingStatus(task.unit_price_cents, !!task.completed_at, reviewed && (!task.is_extra_work || task.extra_work_status === "approved"), allocated, actual);
  const resultState = task.transferred_quantity > 0 && ownQuantity <= actual ? "remaining_transferred" : task.completed_at && task.execution_state === "planned" ? "completed" : task.execution_state;
  return <article className="object-record">
    <header><h3>{task.task_name}</h3><span className="dossier-status">{executionLabels[resultState]}</span></header>
    <p>Uitgevoerd: {actual} van {ownQuantity} {task.unit} eigen werk.</p>
    {(task.transferred_quantity > 0 || task.withdrawn_quantity > 0) && <p className="dossier-muted">Oorspronkelijke scope: {task.quantity} {task.unit} · overgedragen: {task.transferred_quantity} · ingetrokken: {task.withdrawn_quantity}</p>}
    {task.completion_note && <p>{task.completion_note}</p>}
    {financial && <p className="dossier-muted">{financial}</p>}
    <button className="resource-action" aria-expanded={details} onClick={() => setDetails(!details)}>Taakverdeling en bijdragen</button>
    {details && <div>{error && <p role="alert">{error}</p>}{!collaboration && !error && <p role="status">Bijdragen laden…</p>}{collaboration && <><p>Toegewezen: {collaboration.crew.find(person => person.id === collaboration.assignedPersonnelId)?.name || "Gezamenlijke taak"}</p>{editable && collaboration.canAssign && <ObjectForm action={assignWorkOrderTask} label="Taak verdelen"><input type="hidden" name="taskId" value={task.id}/><input type="hidden" name="version" value={task.execution_version}/><label>Medewerker<select name="personnel" defaultValue={collaboration.assignedPersonnelId || ""}><option value="">Gezamenlijk</option>{collaboration.crew.map(person => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label></ObjectForm>}{collaboration.contributions.length ? <ul>{collaboration.contributions.map(contribution => <li key={contribution.id}>{contribution.actor} · <time dateTime={contribution.recordedAt}>{new Date(contribution.recordedAt).toLocaleString("nl-NL")}</time> · {executionLabels[contribution.result]} · totaal {contribution.fromQuantity} → {contribution.toQuantity} {task.unit}{contribution.note && <p>{contribution.note}</p>}</li>)}</ul> : <p className="dossier-muted">Nog geen geregistreerde taakbijdragen.</p>}</>}</div>}
    {editable && ownQuantity > 0 && <button className="resource-action" onClick={() => setOpen(!open)}>Resultaat / deeluitvoering</button>}
    {open && <ObjectForm action={recordTaskExecution} onSuccess={() => setOpen(false)}>
      <input type="hidden" name="taskId" value={task.id}/><input type="hidden" name="version" value={task.execution_version}/>
      <label>Uitvoeringsresultaat<select name="result" defaultValue={task.execution_state === "planned" ? "completed" : task.execution_state}><option value="in_progress">In uitvoering</option><option value="completed">Geheel uitgevoerd</option><option value="partial">Deels uitgevoerd</option><option value="not_done">Niet uitgevoerd</option><option value="not_applicable">Niet van toepassing (met reden)</option></select></label>
      <label>Werkelijk uitgevoerde hoeveelheid<input name="quantity" type="number" min="0" max={ownQuantity} step="0.001" required defaultValue={task.completed_at ? actual : ownQuantity}/></label>
      <label className="wide">Resultaat en resterend werk<textarea name="reason" rows={3} placeholder="Bij gedeeltelijk, niet uitgevoerd of n.v.t.: geef de reden en beschrijf het vervolg. Bij n.v.t. is de hoeveelheid 0."/></label>
      <p className="dossier-notice wide">Extra tijd is geen automatische toestemming voor extra kosten. Meerwerk vereist een afzonderlijke afspraak.</p>
    </ObjectForm>}
  </article>;
}
