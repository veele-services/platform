# Fieldgrid fase 6 productisering

Datum: 3 juli 2026  
Status: uitgevoerd op branch `codex/phase-6-productization-20260703`  
Scope: platform-admin onboarding, tenant first-run, usage dashboard en branding preview, zonder database- of migratiewijzigingen.

## Doel

Fase 6 brengt de beheerervaring dichter bij productniveau zonder bestaande staging-data te raken. Platform-admins kunnen nieuwe tenants duidelijker provisionen, tenantdetail toont een first-run voortgang, usage bevat documenten en storage-estimate, en branding kan per tenant visueel worden gecontroleerd.

## Uitgevoerd

- Platform-admin onboarding bovenop de bestaande provisioning service verduidelijkt:
  - tenantgegevens;
  - domein;
  - plan;
  - owner invite;
  - afronden via tenantdetail.
- Tenantdetail krijgt `firstRun` statusdata:
  - domein gekoppeld;
  - owner actief;
  - modules ingesteld;
  - sectoren ingesteld;
  - branding beoordeeld;
  - eerste data aanwezig.
- Tenantdetail toont first-run voortgang met completed/open status per stap.
- Usage dashboard is uitgebreid met:
  - documenten;
  - storage estimate op basis van `documents.size_bytes`;
  - bestaande users, klanten, objecten, personeel, opdrachten, modules, sectoren en supportgrants.
- Branding preview toegevoegd op tenantdetail:
  - display name;
  - platform name;
  - primary/accent color;
  - custom branding availability;
  - logo-status;
  - e-mail/PDF-achtige preview met signature.
- Geen bestaande tenant hoeft de wizard opnieuw te doorlopen.
- Geen schema, migratie, DDL, reset of stagingdatawijziging.

## Runtimecontract

De fase gebruikt bestaande data en resolvers:

1. `getPlatformTenantDetail()` blijft platform-admin only.
2. Usage wordt server-side uit tenant-scoped tabellen berekend.
3. Branding komt uit `getTenantBranding()` en respecteert plan gating voor custom branding.
4. First-run is een afgeleide checklist; het schrijft nog geen statusvelden.
5. Tenantdetail blijft de plek waar modules, sectoren, support grants, usage en branding samenkomen.

## Security en tenantgrenzen

Deze fase is read-only behalve bestaande provisioning/configuratieformulieren die al bestonden. Nieuwe usage- en brandinggegevens zijn alleen zichtbaar achter `requirePlatformAdmin()`.

Geraakte testmatrix-items:

- `FG-PLATFORM-ONBOARD-001`: platform-admin kan tenant via provisioningflow aanmaken.
- `FG-FIRST-RUN-001`: tenantdetail toont first-run voortgang.
- `FG-USAGE-001`: usage toont users, documenten, opdrachten, storage en actieve modules.
- `FG-BRANDING-001`: branding preview toont tenantkleuren en display name.
- `FG-AUDIT-001`: platformbeheer blijft platform-admin only.
- `FG-MODULE-001`: tenantdetail blijft moduleconfiguratie tonen.

## Staging-impact

Deze fase is staging-veilig:

- geen migraties;
- geen backfill;
- geen bestaande tenantdata gewijzigd door page load;
- onboarding is additive bovenop de bestaande provisioning service;
- first-run status is afgeleid en schrijft niets;
- storage usage is een estimate uit bestaande documentmetadata.

Voor promotie naar staging:

- `pnpm test`;
- `pnpm run typecheck`;
- bestaande buildworkflow;
- handmatige smoke:
  - `/platform` opent als platform-admin;
  - provisioningform blijft zichtbaar;
  - tenantdetail toont first-run;
  - tenantdetail toont documenten/storage usage;
  - tenantdetail toont branding preview;
  - normale tenantgebruiker mag platformroutes niet openen.

## Niet in deze fase

- Multi-step client-side wizard met opgeslagen tussenstappen.
- Muterende tenant first-run owner wizard in tenantcontext.
- Opslaan van first-run completion in database.
- Echte Supabase Storage usage; deze fase gebruikt documentmetadata als estimate.
- Branding editor of uploadflow.
- E-mail/PDF renderengine preview.

Deze punten blijven onderdeel van latere productisering of operationele readiness.
