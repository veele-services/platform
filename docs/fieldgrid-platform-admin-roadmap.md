# Fieldgrid platform-admin roadmap

Datum: 2026-07-04
Status: uitvoerbare roadmap na sprint 16
Gerelateerd: `docs/fieldgrid-saas-masterplan.md`, `docs/fieldgrid-saas-proof-sprint-plan.md`, `docs/fieldgrid-sprint-5-platform-admin.md`, `docs/deployment/fieldgrid-vps-domain-plan.md`

## 1. Doel

Deze roadmap beschrijft hoe de platform backoffice volledig wordt afgebouwd tot het centrale beheerportaal voor Fieldgrid.

Het uitgangspunt blijft:

- Fieldgrid is het SaaS-platform.
- Veele Services is een gewone tenant.
- Platform-admin is strikt gescheiden van tenant-admin.
- Host en domein bepalen de tenantcontext.
- Platformbeheerders beheren tenants, domeinen, subscriptions, support, audits, tickets en readiness.
- Tenantgebruikers krijgen geen platformbeheer.
- Custom tenantdomeinen zijn alleen beschikbaar voor Enterprise-klanten en worden alleen door platform-admins toegevoegd, geverifieerd en geactiveerd.

Elke fase moet als aparte versiebranch met PR worden uitgevoerd. Een fase is pas klaar als typecheck/build en de relevante runtime-smoke groen zijn.

## 2. Productbeeld

De platform backoffice moet uiteindelijk deze hoofdonderdelen hebben:

| Onderdeel | Doel |
| --- | --- |
| Platform dashboard | Dagelijks overzicht van tenants, incidenten, readiness, support, subscriptions en open acties. |
| Tenantlijst | Snel zoeken, filteren, sorteren en tenants openen. |
| Tenantdetail | Alles rond een tenant op een plek: status, plan, domeinen, modules, regio's, sectoren, gebruikers, branding, usage, readiness, support, audit en provisioning. |
| Onboarding | Nieuwe tenant veilig aanmaken, owner uitnodigen, modules/sectoren/regio's instellen en provisioning volgen. |
| Custom domains | Enterprise-only domeinbeheer met DNS-instructies, automatische verificatie, TLS en routing. |
| Subscriptions | Planbeheer, actieve subscription, limits, downgrades, upgrades en facturatievoorbereiding. |
| Ticketsysteem | Platform tickets voor support, incidenten, klantvragen en interne opvolging. |
| Meldingen | Platformmeldingen, tenantcommunicatie, serviceberichten en incidentupdates. |
| Audit en security | Platformacties, support access, tenantwijzigingen, downloads, denials en security-events doorzoekbaar. |
| Operations | Staging smoke, migration smoke, healthchecks, deploystatus, final external tenant gate. |
| Platformgebruikers | Owners, admins, support users, status, last seen, uitnodigen en deactiveren. |
| Instellingen | Platformhosts, domeinregels, mail/smtp, branding defaults, smoke targets en operationele toggles. |

## 3. Hard rules

- Platformroutes gebruiken altijd `requireAuth() -> requirePlatformUser() -> requirePlatformRole() -> audit`.
- Tenantacties vanuit platformbeheer mogen nooit op alleen een technische id vertrouwen; tenantstatus en scope worden server-side herbevestigd.
- Platform support is geen tenantrol. Support gebruikt expliciete support grants met reden, expiry en audit.
- Custom domains mogen alleen bij Enterprise, server-side afgedwongen.
- Domeinrouting mag alleen naar actieve tenants met een geverifieerd domein.
- Caddy on-demand TLS mag alleen certificaten aanvragen na een positief `ask` antwoord uit de applicatie.
- DNS-verificatie is nodig voor eigen tenantdomeinen. Zonder DNS-verificatie geen TLS en geen routing.
- Elke mutatie schrijft een platform audit-event.
- Mobiel en desktop zijn allebei releasecriteria; platformbeheer moet bruikbaar zijn op laptop, tablet en telefoon.

## 4. Fases

### Fase 1 - Platform shell en navigatie

Branch: `codex/platform-admin-shell-v1`

Doel: de platform backoffice krijgt een echte app-shell in plaats van losse pagina's.

Te bouwen:

- Responsive layout voor `/platform`.
- Linker sidebar op desktop.
- Mobile drawer met dezelfde navigatie.
- Topbar met platformgebruiker, rol, tenant/support context en uitloggen.
- Breadcrumbs voor tenantdetail en nested pagina's.
- Navigatie-items:
  - Dashboard
  - Tenants
  - Subscriptions
  - Tickets
  - Meldingen
  - Security en audit
  - Staging smoke
  - Platformgebruikers
  - Instellingen
- Actieve route highlight.
- Lege, loading en error states per pagina.

Definition of Done:

- `/platform` laadt op `admin.fieldgrid.nl`.
- Sidebar werkt op desktop.
- Drawer werkt op mobiel.
- Platform support users zien alleen support-toegestane onderdelen.
- Gewone tenantgebruikers krijgen geen platformtoegang.
- Playwright desktop en mobile screenshot zijn leesbaar zonder overlap.

### Fase 2 - Platform dashboard

Branch: `codex/platform-admin-dashboard-v1`

Doel: dagelijks startscherm voor platformbeheer.

Te bouwen:

- KPI's:
  - actieve tenants;
  - tenants in trial;
  - suspended tenants;
  - open platformtickets;
  - actieve support grants;
  - domeinen pending verification;
  - subscriptions past due;
  - smoke status.
- Actielijst:
  - nieuwe tenant onboarding hervatten;
  - domein verificatie nodig;
  - owner invite nog open;
  - support grant loopt bijna af;
  - smoke check blocked.
- Recente platform audit-events.
- Recente tickets en meldingen.
- Snelle links naar tenantdetail.

Definition of Done:

- Dashboarddata is server-side platform-scoped.
- Geen tenantdata wordt getoond zonder platformrol.
- Dashboard blijft bruikbaar op mobiel met gestapelde secties.

### Fase 3 - Tenantlijst 2.0

Branch: `codex/platform-tenant-list-v1`

Doel: tenants snel vinden, beoordelen en openen.

Te bouwen:

- Pagina `/platform/tenants`.
- Zoekveld op naam, slug, domein en owner e-mail.
- Filters:
  - status;
  - plan;
  - module;
  - sector;
  - regio;
  - domeinstatus;
  - readiness status.
- Tabel op desktop met kolommen:
  - tenant;
  - slug;
  - primair domein;
  - status;
  - plan;
  - owner;
  - modules;
  - laatste activiteit;
  - open acties.
- Compacte lijstweergave op mobiel.
- Bulk is nog niet nodig, behalve export/CSV later.

Definition of Done:

- Filters combineren correct.
- Elke rij linkt naar tenantdetail.
- Geen horizontale overflow op mobiel.
- Tenantlijst blijft snel door pagination of server-side limits.

### Fase 4 - Tenantdetail 2.0

Branch: `codex/platform-tenant-detail-v1`

Doel: tenantbeheer wordt een complete detailomgeving met tabs.

Tabs:

- Overzicht
- Subscription
- Domeinen
- Modules
- Sectoren en regio's
- Gebruikers en owner
- Branding
- Usage en readiness
- Support grants
- Tickets
- Meldingen
- Audit
- Provisioning

Te bouwen:

- Statuspaneel met tenantstatus, plan, primaire host en readiness.
- Lifecycle acties:
  - reactiveren;
  - suspenden;
  - archiveren;
  - rollbackbare provisioning retry.
- Per tab duidelijke forms, statuschips en auditbare acties.
- "Open tenant" links:
  - tenant root;
  - `/admin`;
  - `/klant`;
  - `/personeel`.

Definition of Done:

- Iedere mutatie controleert platformrol server-side.
- Iedere mutatie schrijft audit.
- Tenantdetail is bruikbaar op mobiel zonder tab-overlap.

### Fase 5 - Onboarding en provisioning 2.0

Branch: `codex/platform-onboarding-v2`

Doel: een nieuwe tenant kan zonder SQL worden aangemaakt en veilig afgerond.

Te bouwen:

- Wizard met stappen:
  - tenantgegevens;
  - plan;
  - Fieldgrid subdomain;
  - modules;
  - sectoren;
  - regio's;
  - branding;
  - owner invite;
  - review;
  - provisioning run.
- Save/resume blijft werken.
- Duplicate slug/domain geeft duidelijke fout.
- Provisioning run heeft status, stappen, retry en rollback.
- Owner invite en tenant first-run worden gekoppeld aan readiness.

Definition of Done:

- Nieuwe tenant met `demo-x.fieldgrid.nl` is na wizard bereikbaar.
- Owner kan first-run starten.
- Mislukte provisioning kan veilig opnieuw.
- Alle stappen zijn auditbaar.

### Fase 6 - Enterprise custom domains

Branch: `codex/platform-custom-domains-v1`

Doel: een Enterprise tenant kan via platformbeheer een eigen domein krijgen, bijvoorbeeld `veele-services.nl`, waarna Fieldgrid automatisch via dat domein werkt zodra DNS klopt.

Belangrijk onderscheid:

- Fieldgrid kan niet zomaar DNS-records wijzigen bij een klant zonder DNS-provider credentials.
- Wat wel volledig geautomatiseerd kan worden:
  - token aanmaken;
  - DNS-instructies tonen;
  - DNS publiek controleren;
  - domeineigendom verifiëren;
  - Caddy toestemming geven voor TLS;
  - certificaat automatisch laten aanvragen;
  - host naar de juiste tenant laten routeren;
  - status en fouten tonen in platformbeheer.

#### 6.1 Enterprise gate

Custom domains mogen alleen als:

- tenant actief is;
- actieve subscription `enterprise` is, of plan limit `custom_domains` aan staat;
- domein niet platform-reserved is;
- domein niet al aan een andere tenant hangt;
- domein geen intern Fieldgrid platformhost is;
- platformgebruiker rol `owner` of `admin` heeft.

Server-side acties moeten dit altijd opnieuw controleren. UI-disabled is alleen gemak, geen beveiliging.

#### 6.2 Datamodel

Bestaand fundament:

- `tenant_domains.domain`
- `tenant_domains.type`
- `tenant_domains.is_primary`
- `tenant_domains.verification_status`
- `tenant_domains.verified_at`

Aanvullen in een migratie:

- `verification_token`
- `verification_method`
- `dns_txt_name`
- `dns_target`
- `dns_last_checked_at`
- `dns_last_error`
- `tls_status`
- `tls_last_checked_at`
- `tls_last_error`
- `activated_at`
- `disabled_at`
- `disabled_reason`
- `created_by_platform_user_id`
- `verified_by_platform_user_id`

Optioneel voor historie:

- `tenant_domain_checks` met domain id, check type, status, details en timestamp.

Statussen:

- `pending_dns`
- `dns_seen`
- `verified`
- `tls_pending`
- `active`
- `failed`
- `disabled`
- `disabled_plan`

#### 6.3 Platform UI

Plaats: tenantdetail tab `Domeinen`.

Velden:

- Domeinnaam, bijvoorbeeld `veele-services.nl`.
- Type:
  - Fieldgrid subdomain;
  - custom domain.
- Primair domein ja/nee.
- Redirect alias ja/nee, bijvoorbeeld `www.veele-services.nl -> veele-services.nl`.

UI toont:

- Enterprise badge.
- DNS-instructies.
- Kopieerknoppen voor records.
- Status per record.
- Laatste checktijd.
- Laatste foutmelding in gewone taal.
- Knoppen:
  - DNS opnieuw controleren;
  - TLS opnieuw controleren;
  - activeren;
  - primair maken;
  - uitschakelen;
  - verwijderen.

Voor non-Enterprise:

- Formulier is niet actief.
- Tekst: "Custom domains zijn beschikbaar voor Enterprise tenants."
- Server weigert alsnog elke custom-domain mutatie.

#### 6.4 DNS-instructies voor `veele-services.nl`

Voorbeeld dat platformbeheer moet tonen als een platform-admin `veele-services.nl` toevoegt:

| Type | Naam | Waarde | Doel |
| --- | --- | --- | --- |
| TXT | `_fieldgrid-verification.veele-services.nl` | `fieldgrid-site-verification=<token>` | Bewijst dat de tenant dit domein mag gebruiken. |
| A | `veele-services.nl` | `<FIELDGRID_PUBLIC_IPV4>` | Stuurt het hoofddomein naar de Fieldgrid VPS. |
| AAAA | `veele-services.nl` | `<FIELDGRID_PUBLIC_IPV6>` | Alleen tonen als IPv6 actief is. |
| CNAME | `www.veele-services.nl` | `veele-services.nl` | Alleen nodig als `www` ook moet werken. Voeg `www.veele-services.nl` dan ook als alias toe. |

Voor een subdomein zoals `app.veele-services.nl`:

| Type | Naam | Waarde | Doel |
| --- | --- | --- | --- |
| TXT | `_fieldgrid-verification.app.veele-services.nl` | `fieldgrid-site-verification=<token>` | Bewijst domeineigendom. |
| CNAME | `app.veele-services.nl` | `<tenant-slug>.fieldgrid.nl` | Stuurt het subdomein naar Fieldgrid. |

Cloudflare-regel:

- Tijdens eerste verificatie en TLS-aanvraag bij voorkeur DNS-only gebruiken.
- Als Cloudflare proxy later aan gaat, moet SSL op Full Strict staan en moet het origin-certificaat geldig blijven.

#### 6.5 Verificatieflow

1. Platform-admin voegt domein toe.
2. Applicatie maakt token en pending domain record.
3. UI toont DNS-records.
4. Platform-admin zet DNS bij klant/provider.
5. Platform-admin klikt "Controleer DNS".
6. Server controleert:
   - TXT token bestaat;
   - A/AAAA/CNAME wijst naar Fieldgrid;
   - domein is niet dubbel gekoppeld;
   - tenant is Enterprise en actief.
7. Bij succes wordt `verification_status = verified`.
8. Caddy `ask` endpoint mag dit domein voortaan goedkeuren.
9. Eerste HTTPS request op het custom domain triggert TLS.
10. Na succesvolle TLS-check wordt domein `active`.
11. Host resolver koppelt requests op dit domein aan de tenant.

#### 6.6 Caddy en TLS

Voor Fieldgrid subdomains blijft wildcard TLS via `*.fieldgrid.nl` genoeg.

Voor willekeurige custom domains is Caddy on-demand TLS nodig met een streng `ask` endpoint.

Concept:

```caddyfile
{
  on_demand_tls {
    ask http://127.0.0.1:<API_INTERNAL_PORT>/internal/caddy/ask-domain
  }
}

:443 {
  tls {
    on_demand
  }

  encode zstd gzip

  handle /klant* {
    reverse_proxy 127.0.0.1:<KLANT_PWA_PORT>
  }

  handle /personeel* {
    reverse_proxy 127.0.0.1:<PERSONEEL_PWA_PORT>
  }

  handle /api/* {
    reverse_proxy 127.0.0.1:<API_PORT>
  }

  handle {
    reverse_proxy 127.0.0.1:<BACKOFFICE_PORT>
  }
}
```

Het echte Caddyfile moet naast de bestaande expliciete hosts en wildcardregels worden gevalideerd. Vaste hosts zoals `www.fieldgrid.nl`, `admin.fieldgrid.nl` en `staging.fieldgrid.nl` blijven expliciet.

#### 6.7 Ask endpoint

Endpoint:

```text
GET /internal/caddy/ask-domain?domain=veele-services.nl
```

Geeft alleen `200` terug als:

- domein exact bestaat in `tenant_domains`;
- type `custom_domain` is;
- status `verified` of `active` is;
- tenant actief is;
- tenant Enterprise is;
- domein niet disabled is;
- domein geen platformhost is.

Alle andere gevallen:

- `403`
- geen details lekken
- audit/rate-limit alleen op opvallende patronen, niet op elke normale Caddy-check.

#### 6.8 Routing

Als custom domain actief is:

- `https://veele-services.nl` opent de tenant-root.
- `https://veele-services.nl/admin` opent tenant backoffice.
- `https://veele-services.nl/klant` opent klantenportaal en app.
- `https://veele-services.nl/personeel` opent personeelsportaal en app.

Host resolvers in backoffice, klant-PWA, personeel-PWA en API moeten dezelfde regel gebruiken:

1. normaliseer host;
2. blokkeer platformhosts;
3. zoek exact in `tenant_domains`;
4. vereis verified/active domain;
5. vereis actieve tenant;
6. gebruik gevonden tenant als hostcontext.

#### 6.9 Downgrade en uitschakelen

Als een Enterprise tenant naar Starter/Professional gaat:

- nieuwe custom domains worden direct geweigerd;
- bestaande custom domains krijgen status `disabled_plan` op het afgesproken moment;
- Caddy `ask` geeft dan geen toestemming meer;
- platformbeheer toont waarom het domein uit staat;
- herstel kan alleen door upgrade naar Enterprise en expliciete platform-admin actie.

#### 6.10 Tests

Minimale tests:

- Non-Enterprise tenant kan geen custom domain toevoegen.
- Enterprise tenant kan pending custom domain toevoegen.
- Platformhost kan niet als tenantdomain worden gekoppeld.
- Duplicate domain faalt.
- TXT verification faalt met verkeerd token.
- TXT verification slaagt met correct token.
- A/CNAME mismatch geeft duidelijke status.
- `ask-domain` geeft 200 voor verified Enterprise domain.
- `ask-domain` geeft 403 voor pending, disabled, non-Enterprise en onbekende domains.
- Custom host resolveert naar juiste tenant in backoffice, klant-PWA, personeel-PWA en API.
- `/admin`, `/klant` en `/personeel` blijven correct routeren.
- Audit-events bestaan voor add, verify, activate, primary, disable en remove.

### Fase 7 - Subscriptions en plans

Branch: `codex/platform-subscriptions-v1`

Doel: abonnementen worden productmatig beheerbaar.

Te bouwen:

- Pagina `/platform/subscriptions`.
- Planlijst met Starter, Professional, Enterprise.
- Per plan:
  - modules;
  - limits;
  - custom roles;
  - custom domains;
  - supportniveau;
  - max seats later optioneel.
- Tenant subscription detail:
  - status;
  - start/einde periode;
  - trial;
  - active;
  - past due;
  - canceled;
  - expired.
- Upgrade/downgrade flow met gevolgen tonen.
- Manual billing notitievelden.
- Later uitbreidbaar naar payment provider.

Definition of Done:

- Subscription status is leidend voor Enterprise-only features.
- Planwissel werkt transactioneel.
- Planwissel schrijft audit.
- Downgrade toont impact op modules/custom domains.

### Fase 8 - Platform ticketsysteem

Branch: `codex/platform-ticketing-v1`

Doel: platformvragen, incidenten en opvolging worden beheerd in platform-admin.

Te bouwen:

- Pagina `/platform/tickets`.
- Tickettypes:
  - support;
  - incident;
  - onboarding;
  - billing;
  - domain;
  - security.
- Ticketstatus:
  - open;
  - in behandeling;
  - wacht op klant;
  - wacht op intern;
  - opgelost;
  - gesloten.
- Koppelingen:
  - tenant;
  - subscription;
  - domain;
  - support grant;
  - smoke run;
  - audit event.
- Interne notities.
- Publieke tenantnotities later optioneel.
- Prioriteit en SLA.

Definition of Done:

- Ticketlijst en detail werken mobiel.
- Tickets zijn platform-scoped.
- Ticketacties schrijven audit.
- Domeinverificatie kan automatisch een platformticket maken bij herhaald falen.

### Fase 9 - Meldingen en communicatie

Branch: `codex/platform-notifications-v1`

Doel: platformbeheerders kunnen tenants en interne users gericht informeren.

Te bouwen:

- Pagina `/platform/notifications`.
- Meldingen naar:
  - alle platformgebruikers;
  - specifieke tenant owners;
  - tenants per plan;
  - tenants met module;
  - tenants met open readiness issue.
- Templates:
  - onderhoud;
  - storing;
  - onboarding reminder;
  - domain DNS reminder;
  - subscription warning.
- Kanalen:
  - in-app;
  - e-mail;
  - push later indien relevant.
- Verzendschema:
  - direct;
  - gepland.

Definition of Done:

- Meldingen zijn auditbaar.
- Tenantselectie is zichtbaar voor verzending.
- Geen cross-tenant lek in ontvangers.

### Fase 10 - Audit, security en support

Branch: `codex/platform-security-audit-v1`

Doel: security en support access worden centraal controleerbaar.

Te bouwen:

- Security dashboard 2.0.
- Filters op:
  - tenant;
  - actor;
  - eventtype;
  - resource;
  - datum;
  - severity;
  - support grant.
- Export voor audits.
- Support break-glass:
  - reden verplicht;
  - max TTL;
  - scope verplicht;
  - revoke;
  - access-log zichtbaar.
- Denial events:
  - direct-id denial;
  - module denial;
  - storage denial;
  - tenant mismatch;
  - platform access denial.

Definition of Done:

- Support grant zonder reden/expiry faalt.
- Support grant verloopt hard.
- Alle support acties staan in audit.
- Security dashboard is bruikbaar op mobiel.

### Fase 11 - Operations en staging smoke

Branch: `codex/platform-operations-v1`

Doel: platformbeheer krijgt live zicht op deployment, staging en final gates.

Te bouwen:

- Pagina `/platform/operations`.
- Staging smoke dashboard integreren.
- Migration smoke status:
  - lege database;
  - staging-copy;
  - laatste run;
  - laatste fout.
- Healthchecks:
  - backoffice;
  - api;
  - klant-PWA;
  - personeel-PWA;
  - database;
  - storage;
  - mail.
- Final external tenant gate.
- Run history en handmatige rerun-knop.

Definition of Done:

- Operationspagina kan zonder terminal aangeven wat stuk is.
- Smoke result bevat timestamp en omgeving.
- Mutating smoke heeft cleanup-contract.

### Fase 12 - Platformgebruikers en instellingen

Branch: `codex/platform-users-settings-v1`

Doel: platformteam kan zichzelf en platformconfiguratie beheren.

Te bouwen:

- Platformgebruikers:
  - uitnodigen;
  - rol wijzigen;
  - status wijzigen;
  - last seen;
  - MFA/status later.
- Rollen:
  - owner;
  - admin;
  - support.
- Instellingen:
  - platformhosts;
  - support TTL default;
  - custom domain DNS target;
  - Caddy ask mode;
  - SMTP/system mail;
  - platformbrede SMTP-instellingen direct aanpasbaar in platform-admin;
  - SendGrid API als aanbevolen beheerde mailprovider, met Resend API en SMTP als fallback;
  - standaard tenantafzenders volgens `<mail>@<slug>.fieldgrid.nl`;
  - eigen maildomeinen alleen voor Enterprise en alleen gekoppeld door platform support;
  - default branding;
  - smoke targets.

Definition of Done:

- Owner kan admins/support beheren.
- Admin kan geen owner degraderen zonder ownerrechten.
- Support kan platformgebruikers niet beheren.
- Wijzigingen zijn auditbaar.

### Fase 13 - Mobile responsiveness en UI polish

Branch: `codex/platform-mobile-polish-v1`

Doel: de hele platform-admin voelt als een echte beheerapp op mobiel, tablet en desktop.

Te controleren:

- Geen horizontale overflow.
- Geen overlappende tekst.
- Tabellen hebben compacte mobile layouts.
- Lange domeinen breken netjes af.
- Buttons blijven bruikbaar op touch.
- Dialogen passen binnen telefoonviewport.
- Sidebar/drawer sluit na navigatie.
- Statuschips en tabs blijven leesbaar.
- Empty/error/loading states zijn consistent.

Definition of Done:

- Playwright screenshots voor:
  - 390px mobiel;
  - 768px tablet;
  - 1440px desktop.
- Platform dashboard, tenantlijst, tenantdetail, domains, tickets en audit zijn gecheckt.

### Fase 14 - Acceptatie en release gate

Branch: `codex/platform-admin-final-gate-v1`

Doel: platform-admin wordt releasewaardig verklaard.

Te doen:

- Runtime tests voor platform owner/admin/support.
- Tenant A/B/Veele host-first checks.
- Enterprise custom domain staging test.
- Non-Enterprise custom domain denial.
- Caddy ask endpoint staging test.
- Tenant lifecycle smoke.
- Subscription downgrade smoke.
- Ticket lifecycle smoke.
- Meldingen smoke.
- Audit export smoke.
- Mobile screenshots.
- Build en typecheck volledig groen.

Definition of Done:

- Alle P0/P1 canonpunten voor platformbeheer zijn done of expliciet post-launch accepted.
- Er is een go/no-go checklist met eigenaar per open uitzondering.
- Staging blijft bereikbaar.
- PR kan naar `main`.

## 5. Aanbevolen uitvoeringsvolgorde

1. Fase 1: shell en navigatie.
2. Fase 3: tenantlijst naar eigen pagina.
3. Fase 4: tenantdetail tabs.
4. Fase 6: custom domains, omdat dit nu nodig is voor Enterprise en eigen domeinen.
5. Fase 7: subscriptions, zodat Enterprise gates netjes beheerd worden.
6. Fase 2: dashboard met echte data uit de nieuwe pagina's.
7. Fase 8: tickets.
8. Fase 9: meldingen.
9. Fase 10: audit/security.
10. Fase 11: operations.
11. Fase 12: platformgebruikers/instellingen.
12. Fase 13: mobile polish.
13. Fase 14: final gate.

Fase 5 onboarding kan parallel met fase 3/4 doorlopen, maar moet niet custom domains blokkeren.

## 6. PR-regel per fase

Elke fase krijgt:

- eigen branch;
- eigen commit;
- eigen PR naar `main`;
- korte PR-body met doel, scope, tests en risico's;
- geen hergebruik van oude featurebranches.

Minimale checks:

```text
pnpm run typecheck
pnpm -r --if-present run build
```

Voor database- of routingfases ook:

```text
pnpm --filter @workspace/db run db:migrate
```

Voor UI-fases:

```text
Playwright desktop/mobile smoke
```

## 7. Eerste custom-domain implementatiepakket

Voor de eerste concrete custom-domain PR is de kleinste veilige scope:

1. Migratie met extra `tenant_domains` kolommen.
2. Plan limit `custom_domains` of harde Enterprise-check.
3. Platform tenantdetail domain UI met DNS-instructies.
4. DNS TXT/A/CNAME verificatie.
5. Caddy ask endpoint.
6. Host resolver accepteert verified custom domains.
7. Audit-events.
8. Unit/integration tests.
9. Staging instructie voor Caddy on-demand TLS.

Niet in eerste PR:

- automatische wijzigingen bij externe DNS-providers;
- payment provider;
- self-service custom domains voor tenants;
- wildcard custom domains voor klantdomeinen;
- automatische Cloudflare onboarding namens klanten.
