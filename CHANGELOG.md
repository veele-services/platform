# Changelog

Alle relevante wijzigingen aan Fieldgrid worden in dit bestand vastgelegd.

## 1.0.0 - 2026-09-29

### Toegevoegd

- Volledige multi-tenant V1 voor backoffice, personeels-PWA en veilige externe offerte-, boekings- en betaallinks.
- Supabase-schema met geforceerde RLS, private Storage, audittrail, idempotente domeinfuncties en versievaste migraties.
- Werkbonplanning, dispatch, tijdregistratie, rapportcorrecties, meerwerk, facturatie en Mollie-reconciliatie.
- Factuurmail via SendGrid v3 Mail Send, met tenantafzendercontrole, onveranderlijke PDF-bijlage en dubbele-verzendbeveiliging.
- Web Push/outbox-worker, Google Routes-integratie en expliciete providerfoutafhandeling.
- Herbruikbare CI voor `main` en expliciete, atomaire promotie van een bewezen
  `main`-SHA via branch `staging` en de exclusief gelabelde stagingrunner,
  inclusief Playwright-gate, preflight, backup, healthcheck en coderollback.
- Fail-closed staging-tenantroutering op `{slug}.staging.fieldgrid.nl`, met
  `/app` en `/staff` als werkruimtes en projectref-guards rond iedere
  stagingdatabaseverbinding.
- Private tenantlogo-upload en -weergave in backoffice, personeels-PWA en veilige externe flows.
- Aparte platform-backoffice op `/platform` met tenantoverzicht, herstelbare zesstaps-onboarding, huisstijl-, module- en communicatiebeheer.
- Vier tenantgebonden, versievaste berichttemplates voor facturen, prijsopgaven, nieuwe werkbonnen en planningswijzigingen, inclusief live HTML- en pushpreview.
- HTML- en tekstmail via SendGrid voor facturen en prijsopgaven, met veilige transactielinks en vastgelegde template- en brandingsnapshot per verzending.
- Fieldgrid-basishuisstijl met `#222C35` als primaire kleur en `#41AC42` als secundaire kleur voor platform en nieuwe tenants.
- Module-entitlements als autorisatiegrens in navigatie, server actions, RLS en database-triggers, inclusief security-definer RPC-bescherming.
- Platformbeheerde whitelabel-entitlement: tenantlogo's staan zonder dubbele naam/subtitel, Fieldgrid-attributie staat onderin de sidebar zolang whitelabel uitstaat en tenantkleuren gelden in de volledige werkruimte.
- E-mailheaders tonen uitsluitend het tenantlogo of, zonder logo, de tenantnaam; de veilige tenantwebsitelink staat in de voettekst.
- Unit-, databasecontract-, RLS-, browser- en visuele regressietests.
