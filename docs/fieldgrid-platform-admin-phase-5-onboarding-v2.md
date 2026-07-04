# Fieldgrid platform-admin fase 5 - Onboarding en provisioning 2.0

Status: geimplementeerd als dedicated platform onboardingomgeving.

## Scope

Fase 5 maakt tenantaanmaak uitvoerbaar zonder SQL via `/platform/onboarding`.

Gebouwd:

- Dedicated platformroute voor onboarding en provisioning.
- Wizardstappen voor tenantgegevens, plan, Fieldgrid subdomain, modules, sectoren, regio's, branding, owner invite, review en provisioning run.
- Save/resume op `tenant_provisioning_runs` met wizardmetadata versie 2.
- Server-side preflight voor duplicate slug, duplicate domain, platformhost-blokkade, owner e-mail en Fieldgrid subdomain.
- Runhistorie met provisioningstappen, retry, rollbackpad, owner invite status en tenant first-run readiness.
- Sidebar en dashboard verwijzen naar de nieuwe onboardingpagina.

## Acceptatie

- Een nieuwe tenant zoals `demo-x` krijgt standaard `demo-x.fieldgrid.nl`.
- Duplicate slug/domain wordt server-side als geblokkeerde preflight getoond.
- Mislukte runs kunnen veilig worden herstart; runs met aangemaakte tenant en failed-status kunnen handmatig rollbacken.
- Owner invite en tenant first-run status zijn zichtbaar in de runkaart.

## Resterend runtimebewijs

De lokale typecheck bewaakt de wiring. Echte provisioning met Supabase owner invite blijft staging-smoke met echte `DATABASE_URL` en mailconfiguratie.
