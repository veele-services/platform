/** Event keys are retained in audit storage; people see concise Dutch messages. */
const historyLabels: Record<string, string> = {
  "work_order.created": "Werkbon aangemaakt",
  "work_order.updated": "Werkbon bijgewerkt",
  "work_order.open": "Werkbon geopend",
  "work_order.travel": "Medewerker is onderweg",
  "work_order.start": "Werkzaamheden gestart",
  "work_order.stop": "Eigen werkzaamheden afgerond",
  "work_order.pause": "Werkzaamheden gepauzeerd",
  "work_order.resume": "Werkzaamheden hervat",
  "work_order.return": "Werkbon teruggegeven aan planning",
  "work_order.complete": "Opleverrapport ingediend",
  "work_order.completed": "Werkbon gereedgemeld",
  "work_order.publish": "Planning gepubliceerd",
  "work_order.published": "Planning gepubliceerd",
  "work_order.archive": "Werkbon gearchiveerd",
  "work_order.archived": "Werkbon gearchiveerd",
  "work_order.cancel": "Werkbon geannuleerd",
  "work_order.cancelled": "Werkbon geannuleerd",
  "work_order.management_remove_assignment": "Medewerker van werkbon verwijderd",
  "work_order.checklist_answer": "Checklistantwoord vastgelegd",
  "work_order.communication": "Notitie of bestand toegevoegd",
  "work_order.signature_policy_changed": "Ondertekenafspraak bijgewerkt",
  "work_order.assignment_removed": "Medewerker van werkbon verwijderd",
  "work_order.management_status": "Status aangepast door beheer",
  "work_order.checklist_added": "Checklist toegevoegd",
  "work_order.signature_policy": "Ondertekenafspraak bijgewerkt",
  "work_order.report_submitted": "Opleverrapport ingediend",
  "work_order.report_approved": "Opleverrapport goedgekeurd",
  "work_order.report_returned": "Rapportcorrectie gevraagd",
  "status.planned": "Werkbon in te delen",
  "status.released": "Werkbon vrijgegeven",
  "status.seen": "Werkbon gezien",
  "status.travelling": "Medewerker is onderweg",
  "status.in_progress": "Werkzaamheden in uitvoering",
  "status.completed": "Werkbon gereedgemeld",
  "status.under_review": "Opleverrapport ter controle",
  "status.correction_required": "Rapportcorrectie gevraagd",
  "status.approved": "Werkbon goedgekeurd",
  "status.invoice_ready": "Werkbon gereed voor facturatie",
  "status.invoiced": "Werkbon gefactureerd",
  "status.returned": "Werkbon terug naar planning",
  "status.cancelled": "Werkbon geannuleerd",
};
const identifier = /(?:[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}|\b[a-f\d]{64}\b)/gi;
export function historyMessage(event: string): string {
  if (historyLabels[event]) return historyLabels[event];
  // Already translated activity titles are safe; never render unknown machine keys.
  return /[._]/.test(event) ? "Werkbondossier bijgewerkt" : event.replace(identifier, "").trim() || "Werkbondossier bijgewerkt";
}
export function historyActor(actor: string | null): string {
  if (!actor) return "Automatisch";
  const readable = actor.replace(identifier, "").trim();
  return readable || "Medewerker";
}
