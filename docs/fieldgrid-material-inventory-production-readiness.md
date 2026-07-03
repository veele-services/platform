# Fieldgrid materiaal- en inventarisbeheer productie-readiness

## Status

Datum: 2026-07-03
Fase: 12 - Afronding en productie-readiness
Status: canoniek releasecontract voor productiepromotie.

Dit document sluit het materiaal- en inventarisplan functioneel af. Het vervangt geen echte CI-resultaten, staging-copy migratietesten of handmatige productie-go/no-go, maar legt vast wat groen moet zijn voordat materiaalbeheer en inventarisbeheer als productiegeschikt worden beschouwd.

De fase blijft non-destructief: geen staging reset, geen rebuild, geen drop en geen automatische mutatie van bestaande staging-data.

## Doel van fase 12

Fase 12 rondt het plan af door de overgangsschuld expliciet te maken en productie-readiness meetbaar te maken.

Concreet betekent dit:

- legacy material fields worden niet meer gebruikt voor nieuwe runtime-beslissingen;
- oude vrije tekst flows blijven alleen bestaan als historische fallback of als `Overig`;
- nullable transition columns worden pas hard gemaakt na staging-copy validatie;
- monitoring is verplicht voor kritieke signalen;
- de production rollout checklist is leidend voor promotie;
- de canon, testmatrix en fase-11-hardening blijven verplichte bronnen.

## Legacy en historische fallback

Legacy material fields mogen alleen nog dienen als historical fallback. Nieuwe runtime-beslissingen moeten uit het nieuwe materiaal- en inventarismodel komen.

Toegestaan:

- historische weergave van oude materiaalregels;
- migratie/backfill naar het nieuwe model;
- rapportage die oude regels als `Overig` toont wanneer er geen catalogusmateriaal bestaat;
- auditbaar behoud van oude invoer voor bestaande rapporten.

Niet toegestaan:

- nieuwe factuurvoorstellen baseren op oude vrije tekst velden zonder goedkeuringsregel;
- voorraad muteren vanuit legacyvelden;
- kostprijs, verkoopprijs of klantzichtbaarheid uit legacyvelden afleiden;
- tenantcontext of modulechecks overslaan omdat een regel legacy is.

## Overig-flow

Oude vrije tekst flows worden vanaf de nieuwe module behandeld als `Overig`.

Regels:

- personeel mag `Overig` registreren zonder prijsvelden;
- management bepaalt bij bon-/rapportgoedkeuring of `Overig` factureerbaar is;
- management mag `EUR 0,00` kiezen;
- reden is verplicht bij prijs- of facturatieaanpassing;
- `customer_visible` blijft per regel;
- voorraad wordt alleen geraakt wanneer expliciet `Uit voorraad gebruiken` is gekozen.

## Nullable transition columns

Nullable transition columns zijn acceptabel tijdens overgang en backfill. Voor productie-hardening geldt een gefaseerde aanpak:

1. rapporteer nulls en unresolved rows;
2. backfill op staging-copy;
3. valideer dat runtime geen nieuwe nulls veroorzaakt;
4. voeg constraints of NOT NULL pas toe wanneer de staging-copy smoke groen is;
5. promoot daarna pas naar staging en productie.

Belangrijke families:

- tenant_id op gevoelige tenantdata;
- approval fields voor materiaal- en inventarisregels;
- customer visibility fields;
- storage path en signed URL metadata;
- audit actor, tenant en entity references;
- inventory QR token en scan audit metadata.

Auditregels mogen in specifieke platformcontexten bewust nullable blijven, maar tenant-audit moet tenant-aware zijn.

## Monitoring

Productie-readiness vereist monitoring op minimaal deze signalen:

| Signaal | Waarom | Actie |
| --- | --- | --- |
| negative stock | Negatieve voorraad mag, maar moet zichtbaar zijn. | Toon in dashboard en onderzoek opvallende patronen. |
| QR denials | QR-routes zijn gevoelig voor lekken en verkeerde rechten. | Alert bij spikes of cross-tenant pogingen. |
| cross-tenant denials | Bewijst dat grenspogingen worden geblokkeerd. | Log tenant, actor, host, route en entity type. |
| migration errors | Staging en productie mogen niet stranden op schema-overgang. | Blokkeer promotie tot smoke groen is. |
| stock conflicts | Offline/PWA-sync kan dubbele mutaties veroorzaken. | Detecteer idempotency-conflicten en rapporteer. |
| legacy material fallback | Legacy mag niet stil runtime blijven domineren. | Monitor oude fallback-weergaven en plan opruiming. |
| nullable transition column | Hardening mag pas na nul unresolved rows. | Rapporteer per tabel en kolom. |
| storage signed URL denial | Storage moet tenant-bound blijven. | Audit denied path guesses. |
| invoice approval conflict | Financiele verwerking moet gecontroleerd blijven. | Toon conflicten in goedkeuringsqueue. |
| notification scope denial | Notificaties mogen niet tenant-overstijgend lekken. | Log en onderzoek scope-denials. |

Deze signalen moeten zichtbaar zijn voor platformbeheer of operationele monitoring voordat productiepromotie plaatsvindt.

## Production rollout checklist

Gebruik deze checklist voor elke productiepromotie van materiaalbeheer of inventarisbeheer.

### Voorbereiding

- Fase-11-contractcheck is groen.
- Fase-12-readinesscheck is groen.
- `pnpm test` is groen.
- `pnpm run typecheck` is groen.
- `pnpm run build` is groen.
- Migratie smoke op lege database is groen.
- Migratie smoke op staging-copy is groen.
- Backfillrapport bevat geen blokkerende unresolved rows.
- Rollbackplan is bevestigd.
- Staging blijft bereikbaar tijdens de voorbereiding.

### Security

- demo-a kan demo-b en veele niet lezen.
- demo-b kan demo-a en veele niet lezen.
- veele is gewone tenant, geen platform-uitzondering.
- Host-first tenantcontext wint van tenant switcher.
- Storage path guessing faalt.
- signed URL checks zijn tenant-bound.
- QR-scan zonder login toont geen data.
- Support/platform-routes blijven gescheiden van tenantrollen.

### Functioneel

- Materiaalcodes volgen `M00001`.
- Inventariscodes volgen `I000001`.
- Personeel ziet geen prijsvelden.
- Personeel kan `Overig` registreren.
- Voorraadverbruik is optioneel.
- Management kan regels op `EUR 0,00` zetten.
- Management kan regels een bedrag geven.
- `customer_visible` bepaalt klantweergave per regel.
- Alleen goedgekeurde factureerbare regels gaan naar factuurvoorstel.
- Inventarisverhuur is optioneel factureerbaar.
- Storingen, onderhoud en keuringen blijven tenant-scoped.

### Na release

- Controleer negative stock signalen.
- Controleer QR denials.
- Controleer cross-tenant denials.
- Controleer migration errors.
- Controleer stock conflicts.
- Controleer legacy material fallback gebruik.
- Controleer factuurvoorstelregels.
- Controleer notificatiescope.

## Go/no-go

Go voor productie mag alleen wanneer:

- minimum green uit fase 11 volledig groen is;
- alle production gates uit fase 12 groen zijn;
- staging-copy migratie is uitgevoerd zonder datareset;
- monitoring is ingericht;
- rollbackplan bekend is;
- er geen P0/P1 security open staat voor materiaal, inventaris, storage, facturatie of QR-scans.

No-go wanneer:

- migratie op staging-copy faalt;
- cross-tenant denial tests ontbreken of falen;
- storage signed URL tests ontbreken of falen;
- QR-scan anoniem data toont;
- factuurvoorstellen niet-gekeurde regels meenemen;
- nullable transition columns nieuwe tenantdata zonder tenantcontext toelaten;
- staging alleen met reset/rebuild verder kan.

## Canon-afsluiting

Fase 12 sluit het plan af wanneer deze bronnen actueel blijven:

- `docs/research-material-inventory-management.md`;
- `docs/plan-material-inventory-management.md`;
- `docs/testmatrix-material-inventory-management.md`;
- `docs/fieldgrid-material-inventory-phase11-hardening.md`;
- `docs/fieldgrid-material-inventory-production-readiness.md`;
- `scripts/fieldgrid-material-inventory-phase11-hardening.mjs`;
- `scripts/fieldgrid-material-inventory-phase12-readiness.mjs`.

De praktische regel is simpel: geen productiepromotie zonder groen fase-11 bewijs en groen fase-12 readinessbewijs.
