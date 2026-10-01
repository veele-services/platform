import type { NotificationAccess, NotificationSettings, NotificationTemplate } from "./model";
export function canCreateCampaign(access: NotificationAccess) { return ["send_staff", "send_customers", "send_platform"].some(p => access.permissions.includes(p)); }
export function notificationPolicyImpact(access: NotificationAccess, data: NotificationSettings, dimensions: { tenantId: string; context: string; typeCode: string; channel: string }) {
  const { tenantId, context, typeCode, channel } = dimensions;
  // The server enumerates only active, configurable tenants. A chosen tenant is
  // one authorized scope, never the length of that (possibly limited) catalog.
  const tenantCount = !tenantId ? data.impact.globalActiveTenantCount : tenantId === access.tenant?.id ? data.impact.activeTenantCount : data.tenants.some(tenant => tenant.id === tenantId) ? 1 : null;
  const rules = data.rules.filter(rule => rule.status === "active" && (!typeCode || rule.code === typeCode) && (!context || rule.contexts.some(value => value === context)) && (!channel || rule.channels.some(value => value === channel)));
  const emailRules = !channel || channel === "email" ? rules.filter(rule => rule.channels.includes("email")) : [];
  return { tenantCount, rules, quoteMail: emailRules.some(rule => rule.code.startsWith("quote.")), invoiceMail: emailRules.some(rule => rule.code.startsWith("invoice.")) };
}
const reasons: Record<string, string> = {
  allowed: "De actuele regels staan dit kanaal toe.", already_started: "Een eerdere providerpoging is al gestart; er volgt geen automatische dubbele verzending.",
  channel_unavailable: "Dit kanaal is niet beschikbaar voor dit notificatietype.", default_off: "Dit kanaal staat standaard uit.",
  module_unavailable: "De benodigde module is niet beschikbaar.", personal_off: "De ontvanger heeft dit kanaal uitgeschakeld.",
  recipient_inactive: "De ontvanger heeft geen actuele toegang.", source_unavailable: "De bron is niet meer beschikbaar binnen de actuele toegang.",
  tenant_inactive: "De organisatie is niet actief.", type_unavailable: "Dit notificatietype is nog niet beschikbaar.",
  platform_blocked: "Geblokkeerd door platformbeleid.", global_off: "Geblokkeerd door platformbeleid.", tenant_blocked: "Geblokkeerd door organisatiebeleid.",
  disabled_at_enqueue: "Deze melding stond bij het aanmaken uit en wordt niet alsnog verstuurd.", policy_disabled: "Uitgeschakeld door het actuele notificatiebeleid.", policy_suppressed: "Onderdrukt door het actuele notificatiebeleid.",
  campaign_paused: "De verzending is gepauzeerd.", expired: "Het verzendvenster is verlopen.", interrupted_send: "De provideruitkomst is onzeker; opnieuw verzenden gebeurt niet automatisch.",
  planning_bundled: "Samengevoegd met een recentere planningswijziging.", quiet_hours: "Uitgesteld tot na de rusttijden van de ontvanger.", no_active_device: "Er is geen actief geregistreerd apparaat.",
  no_selected_channel: "Geen actueel bereikbaar kanaal binnen de gekozen kanalen.",
  "Toegestaan door alle beleidslagen": "Toegestaan door alle beleidslagen.",
  "Deels toegestaan; specifieke type-, module- en kanaalregels blijven gelden": "Deels toegestaan; specifieke type-, module- en kanaalregels blijven gelden.",
  "Geblokkeerd door platformbeleid": "Geblokkeerd door platformbeleid.", "Geblokkeerd door organisatiebeleid": "Geblokkeerd door organisatiebeleid.",
  "Benodigde module niet beschikbaar": "De benodigde module is niet beschikbaar.", "Niet toegestaan door de actuele regels": "Niet toegestaan door de actuele regels.",
};
export function notificationReason(value: string) { return value ? reasons[value] ?? "Controleer de actuele toegang, voorkeuren en beleidsinstellingen voor deze melding." : ""; }
const examples: Record<string, string> = { bedrijfsnaam: "Voorbeeldorganisatie", tenant_name: "Voorbeeldorganisatie", klantnaam: "Voorbeeldklant", recipient_name: "Robin Voorbeeld", medewerkernaam: "Robin Voorbeeld", title: "Voorbeeldnotificatie", body: "Dit is een fictief voorbeeld, geen echte verzending.", datum: "30 september 2026", date: "30 september 2026", bonnummer: "WB-VOORBEELD", number: "VOORBEELD-001", factuurnummer: "FACT-VOORBEELD", locatie: "Voorbeeldlocatie", object_name: "Voorbeeldlocatie", sender_name: "Voorbeeldafzender", action_label: "Openen" };
export function templatePreviewText(value: string, allowed: string[]) { return value.replace(/\{\{?([a-zA-Z_][a-zA-Z0-9_.]*)\}?\}/g, (whole, key: string) => allowed.includes(key) ? examples[key] ?? `[voorbeeld ${key}]` : whole); }
export function templateDraftError(value: { title: string; body: string; ctaLabel: string }, data: NotificationTemplate) {
  if (!value.title.trim() || /[\r\n]/.test(value.title)) return "Vul een titel zonder regelafbreking in.";
  if (!value.body.trim()) return "Vul een berichttekst in.";
  const all = `${value.title}\n${value.body}\n${value.ctaLabel}`, tokens = [...all.matchAll(/\{\{?([a-zA-Z_][a-zA-Z0-9_.]*)\}?\}/g)].map(m => m[1]);
  if (data.channel === "push" && (value.title.length > 80 || value.body.length > 160)) return "Houd push beperkt tot 80 tekens voor de titel en 160 voor de tekst.";
  if (data.channel === "push" && tokens.some(token => token !== "bedrijfsnaam")) return "Push mag alleen de variabele {bedrijfsnaam} gebruiken.";
  const invalid = tokens.find(t => !data.variables.some(v => v.name === t));
  if (invalid) return `Onbekende variabele: ${invalid}.`;
  const missing = data.variables.find(v => v.required && !tokens.includes(v.name));
  if (missing) return `Verplichte variabele ontbreekt: ${missing.name}.`;
  if (/<\/?[a-z][\s\S]*>/i.test(all)) return "Gebruik gewone tekst; HTML-opmaak is niet toegestaan.";
  return "";
}
