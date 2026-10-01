export const planningLabels: Record<string, string> = { draft: "Concept", unassigned: "In te delen", tentative: "Voorlopig gepland", final: "Definitief gepland" };
export const reportLabels: Record<string, string> = { draft: "Concept", awaiting_signature: "Wacht op handtekening", waiting_signature: "Wacht op handtekening", review: "Ter controle", under_review: "Ter controle", submitted: "Ter controle", correction: "Correctie gevraagd", correction_required: "Correctie gevraagd", approved: "Goedgekeurd", superseded: "Vervangen" };
export const signatureLabels: Record<string, string> = { unavailable: "Rapportage niet ingeschakeld", none: "Niet nodig", not_required: "Niet nodig", optional: "Optioneel", required: "Verplicht", missing: "Ontbreekt", pending: "Ontbreekt", waiting: "Wacht op handtekening", signed: "Ontvangen", valid: "Ontvangen", waived: "Vrijgesteld" };
export const billingLabels: Record<string, string> = { unavailable: "Finance niet ingeschakeld", non_billable: "Niet factureerbaar", not_billable: "Niet factureerbaar", not_ready: "Nog niet gereed", pending: "Nog niet gereed", ready: "Gereed", invoice_ready: "Gereed", partial: "Deels gefactureerd", partially_invoiced: "Deels gefactureerd", invoiced: "Gefactureerd" };
export const priorityLabels: Record<string, string> = { low: "Laag", normal: "Normaal", high: "Hoog", urgent: "Spoed" };
export const sourceLabels: Record<string, string> = { manual: "Handmatig", request: "Aanvraag", quote: "Offerte", contract: "Contract", series: "Reeks", split: "Deelbon", followup: "Opvolgbon", duplicate: "Duplicaat" };
export const contactRoleLabels: Record<string, string> = { site: "Contact op locatie", requester: "Opdrachtgever", extra_approver: "Goedkeurder meerwerk", handover: "Oplevercontact", billing: "Factuurcontact" };
export function orderDate(value: string | null | undefined, timezone: string, withTime = true) {
  if (!value) return "Nog niet gepland";
  const date = new Date(value.length === 10 ? `${value}T12:00:00Z` : value);
  if (Number.isNaN(date.getTime())) return "Datum niet beschikbaar";
  return new Intl.DateTimeFormat("nl-NL", { dateStyle: "short", ...(withTime && value.length !== 10 ? { timeStyle: "short" as const } : {}), timeZone: timezone }).format(date);
}
export function orderHours(minutes: number) { return new Intl.NumberFormat("nl-NL", { maximumFractionDigits: 2 }).format(minutes / 60); }
