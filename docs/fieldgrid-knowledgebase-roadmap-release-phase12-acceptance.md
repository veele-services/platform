# Fieldgrid knowledgebase, roadmap en releases - fase 12 acceptance

Status: uitvoerbare Playwright QA-harness met statische gate, live screenshots en strict evidence mode.

## Doel

Fase 12 bewijst dat knowledgebase, roadmap, releases, tooltips, TipTap-rendering, media access en notificatie-events op de echte runtime-oppervlakken blijven werken voor:

- platform admin;
- tenant admin;
- klantportaal;
- personeelsapp.

De harness schrijft bewijs naar:

`outputs/kb-roadmap-release-phase12-acceptance`

Daarin komen:

- `phase12-acceptance.json`;
- `screenshots/*.png` zodra live role inputs aanwezig zijn.

## Commando's

Statische contractcheck:

```bash
pnpm fieldgrid:kb-roadmap-release-phase12-acceptance:check
```

Live run met alle beschikbare role inputs:

```bash
pnpm fieldgrid:kb-roadmap-release-phase12-acceptance
```

Strict CI/staging gate:

```bash
pnpm fieldgrid:kb-roadmap-release-phase12-acceptance:strict
```

Strict mode faalt als niet alle vier de rollen een base URL en geldige sessie hebben.

## Vereiste role inputs voor strict evidence

Platform admin:

- `FIELDGRID_PHASE12_PLATFORM_BASE_URL`
- `FIELDGRID_PHASE12_PLATFORM_COOKIE` of `FIELDGRID_PHASE12_PLATFORM_STORAGE_STATE`

Tenant admin:

- `FIELDGRID_PHASE12_TENANT_BASE_URL`
- `FIELDGRID_PHASE12_TENANT_COOKIE` of `FIELDGRID_PHASE12_TENANT_STORAGE_STATE`

Klantportaal:

- `FIELDGRID_PHASE12_CUSTOMER_BASE_URL`
- `FIELDGRID_PHASE12_CUSTOMER_COOKIE` of `FIELDGRID_PHASE12_CUSTOMER_STORAGE_STATE`

Personeelsapp:

- `FIELDGRID_PHASE12_PERSONNEL_BASE_URL`
- `FIELDGRID_PHASE12_PERSONNEL_COOKIE` of `FIELDGRID_PHASE12_PERSONNEL_STORAGE_STATE`

Voor PWA's mag de base URL de basePath bevatten. Voorbeeld:

- `https://tenant.fieldgrid.nl/klant`
- `https://tenant.fieldgrid.nl/personeel`

## Viewports

Elke live run gebruikt:

- `390x844` mobiel;
- `768x1024` tablet;
- `1440x1100` desktop.

## Runtimechecks

De live harness controleert per screenshot:

- geen HTTP 5xx;
- geen server error tekst of digest;
- geen horizontale overflow;
- geen dialog/sheet overflow;
- geen kapotte afbeeldingen;
- geen gevoelige runtime strings in no-access/error states;
- autocomplete combobox aanwezig op help;
- help-iconen/tooltips aanwezig waar verwacht;
- TipTap/editor oppervlak aanwezig waar verwacht;
- roadmapstatussen en triage-oppervlak zichtbaar;
- release-oppervlak zichtbaar;
- onbekende help/release media-ids geven geen leesbare 2xx response.

## Statische contractchecks

De check-mode borgt dat de repo nog steeds bevat:

- shortcode/deeplinkroutes;
- help search/autocomplete routes en componenten;
- FeatureHelp/tooltip triggers;
- TipTap tabellen, callouts, media, video, preview en link sanitizing;
- release media en release category beheer;
- roadmap quick triage/statushistorie;
- notification events en queue/worker koppeling;
- private signed media routes;
- fase-12 package scripts.

## Acceptatiecriterium

Fase 12 is klaar wanneer:

- de statische gate groen is;
- strict evidence op staging/CI met vier ingelogde rollen groen draait;
- screenshots voor alle rollen en viewports in de artifact directory staan;
- build/typecheck/migratie gates groen zijn in de CI omgeving met Node 24 en volledige native dependencies.
