# Gebruikers, rollen en rechten — historische implementatieanalyse

Dit document bewaart de query-first analyse van 1 oktober 2026. Het actuele managementmodel van 8 oktober staat in [tenant-management.md](tenant-management.md) en wordt geïmplementeerd door `20261008173000_tenant_management_roles.sql`. Het hieronder beschreven prototype wordt niet gedeployed.

Status van de historische analyse: in uitvoering, niet vrijgegeven voor deployment.

## Aangetroffen architectuur

Next.js 16.3.6, Supabase SSR 0.12.7, supabase-js 2.117.2 en lokaal PostgreSQL 17.6.
De hostname bepaalt de tenant; `getAuthContext` verifieert de gebruiker en leest
actieve memberships. `tenant_memberships.roles` bevat nog de oude `app_role`-enum.
Medewerker- en klantportalen hebben eigen relaties en mogen niet door een
backofficerol worden vervangen. Platformbeheer blijft een afzonderlijk domein.

De reproduceerbare inventaris vindt 77 public/private functies met oude rolcontroles en
157 public/storage-policies met `has_role`/`is_member` in de oorspronkelijke
prototype-inventaris. Dit zijn historische zoekresultaten,
geen bewijs dat elke controle vervangen moet worden: portaal- en systeemcontexten
moeten afzonderlijk worden beoordeeld. De destijds gevonden platformadmin-
bypass in `private.has_role` is in de release-securitymigratie verwijderd.
De bestaande expliciete tenantrollen blijven voor de huidige release leidend;
dit document beschrijft de nog niet geactiveerde uitbreidingsopdracht.
Het JSON-veld `customRoleCutover: pending` betekent daarom uitsluitend dat het
betreffende pad nog niet naar het toekomstige configureerbare rollenmodel is
omgezet. Het betekent niet dat de huidige release-autorisatie ongereviewd is:
die status en het aan de actuele inhoud gebonden bewijs staan canoniek in
`docs/security/authorization-review.json`.

Tickets en notificaties hebben al één `permission_catalog`, met 31 tenantrechten
en 19 platformrechten. Hun huidige toekenningen staan in `permission_grants`.
Dat register wordt uitgebreid, niet vervangen door een tweede register. De
bestaande directe tenantgrants moeten bij de definitieve omschakeling naar
expliciete custom rollen worden gemigreerd; platformgrants blijven afzonderlijk.

Lokaal gecontroleerde databaseprincipals: `anon` en `authenticated` zijn geen
superuser en hebben geen BYPASSRLS. `service_role` en `postgres` hebben BYPASSRLS.
Daarom moeten integratietests óók als `authenticated` draaien; een geslaagde
postgres-query bewijst geen autorisatie. Dit is geen verificatie van staging.

## Integratiekaart

| Onderdeel / codeherkomst | Huidige grens | Benodigde omschakeling en controle |
| --- | --- | --- |
| `lib/auth/context.ts`, `app/app/page.tsx` | actieve membership, enumrollen; staff-redirect | actuele `backoffice.access`, geen afgeleide moduletoegang; sessie-intrekking testen |
| `lib/data/workspace.ts`, backoffice-shell | brede `select('*')` per tabel; RLS | minimale projecties per module/recht; geen HR/financiële data in operationele props |
| `app/app/operations-actions.ts` | `hasAnyRole`; klant/contact/object/personeel/tarieven/huisstijl | aparte actiekeys; oude én nieuwe klant/object/personeelrelaties toetsen |
| `app/app/klanten`, `lib/customers` | dossier-RPC, klantrelatie en legacyrollen | klant-, contact-, notitie-, document- en commerciële inzage afzonderlijk; download opnieuw toetsen |
| `app/app/objecten`, `lib/objects`, `/api/objects/vault` | object-RPC, portaalbinding, actieve bon, tijdvenster, OTP | beheer en onthullen scheiden; OTP nooit zelfstandig recht; intrekking na OTP testen |
| `lib/personnel`, personeelswizard/dossier | legacy HR/management-grenzen, aparte documenten | operationele persoonsgegevens versus vertrouwelijk dossier; privévertrekpunten niet naar planners serialiseren |
| `app/app/planning`, `lib/travel` | planning-RPC en enumcontrole | plannen/herplannen plus alle betrokken objecten en medewerkers; routeberekening versus privéroutekaart scheiden |
| `lib/work-orders`, werkbon-RPC's | recordstatus, concrete toewijzing, enumrollen | lezen, aanmaken, toewijzen, annuleren, heropenen; bestaande status- en lineagecontroles behouden |
| `lib/commercial`, aanvragen/offertes | tenant-/klant-/objectrelaties, actor-RPC, beveiligde externe tokens | commerciële rechten, openbare snapshot, klantakkoord en opdrachtomzetting gescheiden houden |
| `app/app/finance-actions.ts` | finance-module én legacy financiële rol | lezen/muteren/versturen onderscheiden; rapportgoedkeuring geeft geen factuurrecht |
| `lib/tickets`, ticket-RPC's | capabilities + scope + categorie + actuele sessie | bestaande keys behouden; resolver aan roltoewijzingen verbinden; vertrouwelijke categorie blijft extra grens |
| `lib/notifications`, notificatie-RPC's | capabilities, ontvangerscope, broncontrole, OTP voor delegatie | bronrechten en actuele autorisatie bij levering behouden; directe tenantgrants vervangen |
| `lib/email-centre` (lopend werk) | nog onvolledige mailimplementatie | geen nog niet werkende emailrechten actief maken; hook-/providerconfig blijft eigen releasevoorwaarde |
| `/api/worker`, exports, signed downloads | beperkte systeem-RPC's / broncontrole | gebruikersopdracht bij uitvoering en download opnieuw controleren; geen rechten uit rolnaam |
| platformbeheer / Supabase Auth | aparte platformcontext en servicecredentials | tenantdelegatie mag geen platformgrants, secrets of eigendomsoverdracht opleveren |

## Uitvoeringsvolgorde

1. Reproduceerbare inventaris van actuele functies/policies en bestaande keys.
2. Query-first rollenmodel met samengestelde tenant-FK's, expliciete templates,
   rechten en delegatie afzonderlijk, gekoppelde scopes, revisies en audit.
3. Test CRUD/delegatie/intrekking/laatste beheerpad met echte sessies en beperkte
   principal. Geen mails aan echte gebruikers.
4. Module-voor-module actiekeys, veilige projecties, RLS/storage en workers
   omschakelen; pas dan het nieuwe model als enige tenantautoriteit activeren.
5. Gebruikers/Rollen/Rechten/Activiteit en wizard met impactcontrole aansluiten.
6. Legacy-mapping, onboarding en rollback zonder herleving van ingetrokken
   rechten verifiëren. Seeds mogen tenantaanpassingen nooit overschrijven.
7. Volledige regressie, visuele controle, reviewbare migratie, daarna expliciete
   main → staging-promotie volgens het bestaande releasecontract.

De zeven beoogde templates zijn Tenantbeheerder, Management, Planning,
Administratie / Finance, HR / Personeelsbeheer, Uitvoeringscoördinator en
Verkoop / Accountbeheer. Hun volledige operationele matrix is pas definitief
wanneer de corresponderende serverpaden werkelijk zijn omgezet. Geen wildcard,
geen automatische nieuwe rechten bij een nieuwe release. Beheer/delegatie geeft
geen impliciete HR-inzage of objectgeheimen.

## Releasegrens

Een lokaal rollenmodel alleen voldoet niet aan acceptatie. Zolang oude
autorisatiepaden nieuwe beperkingen kunnen omzeilen, mag de UI niet suggereren
dat intrekking applicatiebreed werkt en mag deze omschakeling niet deployen.
Ook de nog open releasevoorwaarden voor tickets/notificaties/mail blijven
gelden. Niet uitgevoerde controles worden niet als geslaagd gerapporteerd.

## Lokaal uitgevoerde implementatie en verificatie

`scripts/sql/authorization-roles.sql` is uitsluitend een query-first werkbestand,
nog geen deploymentmigratie. Het is toegepast op de afgeschermde lokale
database (127.0.0.1:59322), niet op staging. Bestaande tenantgebruikers zijn niet
omgezet en geen tenant heeft de nieuwe autorisatie aangezet gekregen.

Gebouwd in deze laag:

- Uitbreiding van het bestaande rechtenregister met classificatie, status,
  herkomst en definitieversie; twaalf concrete rechten voor rollenbeheer.
- Private, RLS-beveiligde tabellen voor templates, tenantrollen, rolrechten,
  afzonderlijke delegatie, membershiptoewijzingen, revisies, audit en retries.
- Zeven idempotent aan te maken template-identiteiten, met bescherming tegen
  naamconflicten en het overschrijven van tenantaanpassingen. **De operationele
  standaardmatrix is nog niet gevuld:** Tenantbeheerder/Management hebben in
  deze tussenstap de twaalf beheercontextrechten; de vijf overige templates
  bevatten alleen `backoffice.access`. Dit is uitdrukkelijk geen releaseseed.
- Geauthenticeerde query- en command-RPC's voor rollen, register, gebruikers,
  activiteit, aanmaken, wijzigen, dupliceren, herstellen, toewijzen, intrekken
  en archiveren. Directe tabelmutaties zijn niet toegestaan.
- Vaste grenzen tussen tenant/platform, gekoppelde scopes per grant, controle
  van resource-ID's, expliciete afhankelijkheden en gedelegeerde bereiken.
- Recente verificatie op basis van de door Auth onderhouden sessie-aanmaak,
  niet een clientveld of vernieuwde JWT-timestamp. Alle mutaties vereisen
  momenteel een login van maximaal vijf minuten geleden.
- Rolrevisie én globale tenantautorisatierevisie beschermen opgeslagen
  bewerkingen en beoordeelde impact; een retry met dezelfde sleutel/payload
  geeft dezelfde uitkomst terug, zonder dubbele audit of toewijzing.
- Tenantgebonden transactielock en controle op een blijvend actief beheerpad;
  een tijdelijke toewijzing is geen vervanging voor de laatste beheerder.
  Na omschakeling gebruiken membershipdeactivering en Auth-blokkering dezelfde
  controle. Echte gelijktijdige transacties zijn nog niet apart getest.
- De bestaande `ticket_has_cap` is aangesloten op roltoewijzingen voor een
  omgeschakelde tenant, zonder terugval naar oude directe tenantgrants.
  Platformgrants blijven gescheiden. De oude resolver blijft alleen vóór de
  omschakeling actief; het werkbestand activeert die omschakeling nergens.

Uitgevoerde controles:

```sh
node --test scripts/test-authorization-roles.mjs \
  scripts/test-notification-permissions.mjs scripts/test-tickets.mjs \
  scripts/test-notifications.mjs scripts/test-notification-delivery.mjs
pnpm exec eslint scripts/inventory-authorization.mjs scripts/test-authorization-roles.mjs
git diff --check
```

De gecombineerde databasetest meldt **75 geslaagde tests, nul failures**
(inclusief de vijf overkoepelende Node-tests). De autorisatietests gebruiken
fictieve gebruikers/sessies en de `authenticated`/`anon`-principal. Alle
fixturegegevens worden teruggedraaid; er worden geen echte mails verstuurd.
Gerichte lint en diffcontrole slagen. Dit is geen volledige build-, browser-,
staging- of applicatiebrede autorisatieacceptatie.

Nog uit te voeren: volledige operationele rechtenmatrix; omzetting van de
overige server-/RLS-/storage-/workerpaden en veilige serializers; legacy-mapping
en onboarding; eigenaarschap/governance; Gebruikers/Rollen/Rechten/Activiteit-UI
en scopes/wizard; impactpreview en beheerde vervanging bij archiveren; realtime-
en downloadintrekking; concurrentietests; E2E/visuele controle; gecontroleerde
release- en herstelmigratie. Daarom nog geen commit, push of deployment.

Referenties voor het ontwerp: [PostgreSQL 17 RLS](https://www.postgresql.org/docs/17/ddl-rowsecurity.html)
en [OWASP Authorization Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html).
