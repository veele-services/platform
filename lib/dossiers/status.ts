// Separate dimensions; a read receipt or an overdue date never completes work.
export const executionLabels: Record<string, string> = { planned: "Gepland", released: "Vrijgegeven", seen: "Gezien", travelling: "Onderweg", in_progress: "In uitvoering", completed: "Afgerond", partial: "Deels uitgevoerd", not_done: "Niet uitgevoerd", cancelled: "Geannuleerd", returned: "Teruggestuurd", approved: "Goedgekeurd", under_review: "In beoordeling", correction_required: "Correctie nodig", invoice_ready: "Gereed voor facturatie", invoiced: "Gefactureerd" };
export const actionLabels: Record<string, string> = { open: "Open", progress: "In behandeling", waiting: "Wacht op medewerker", completed: "Afgerond", archived: "Gearchiveerd", active: "Actief", draft: "Concept", partial: "Deels uitgevoerd", not_done: "Niet uitgevoerd" };
export function requestStatus(state: string, needsReview = false) {
  if (state === "rejected") return "Afgewezen";
  if (state === "withdrawn") return "Ingetrokken";
  if (needsReview || ["review", "proposal"].includes(state)) return "In beoordeling";
  if (["completed", "partial", "not_done"].includes(state)) return "Verwerkt";
  return state === "new" ? "Ontvangen" : "In behandeling";
}
export function commercialStatus(state: string, accepted: boolean) {
  if (accepted) return "Goedgekeurd";
  if (state === "regular") return "Binnen contract";
  if (state === "rejected") return "Afgewezen";
  return "Akkoord nodig";
}
export function billingStatus(price: number, completed: boolean, approved: boolean, allocated: number, executed: number) {
  if (price === 0 || (completed && executed === 0)) return "Niet factureerbaar";
  if (!completed || !approved) return "Nog te controleren";
  if (allocated >= executed) return "Gefactureerd";
  return allocated > 0 ? "Deels gefactureerd" : "Gereed voor facturatie";
}
export const isClosedAction = (status: string) => ["completed", "not_done", "archived", "rejected", "withdrawn", "cancelled"].includes(status);
