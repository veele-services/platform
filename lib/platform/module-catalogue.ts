/** Presentation of the existing tenant modules; server entitlements remain
 * enforced by the native platform commands and module-specific access checks. */
export const platformModuleCatalogue = [
  {id: "planning", name: "Planning", description: "Afspraakblokken, planbord, dispatch en live werkbonnen.", available: true, dependencies: []},
  {id: "personeel", name: "Personeel", description: "Personeelsapp, uren, certificaten en documenten.", available: true, dependencies: []},
  {id: "rapportage", name: "Rapportage", description: "Tijdlijn, bewijs, handtekening en controle.", available: true, dependencies: ["planning"]},
  {id: "finance", name: "Facturatie", description: "Facturen, e-mail en betalingen via Mollie.", available: true, dependencies: ["planning", "rapportage"]},
  {id: "tickets", name: "Tickets & support", description: "Afgeschermde personeelsmeldingen en bewuste supportvragen aan Fieldgrid.", available: true, dependencies: []},
  {id: "klantportaal", name: "Klantportaal", description: "Afspraken, objecten, aanvragen, facturen en eigen tickets voor expliciet gekoppelde klantcontacten.", available: true, dependencies: []},
  {id: "website", name: "Publieke website", description: "Aanvragen en publieke tenantpagina’s.", available: false, dependencies: []},
] as const;
export type PlatformModule = (typeof platformModuleCatalogue)[number];
export type PlatformModuleId = Exclude<PlatformModule["id"], "website">;
