# Fieldgrid branch-recovery analyse: main naar staging

Datum: 1 juli 2026  
Doel: vastleggen wat er volgens de Fieldgrid-canon moest gebeuren, wat in de huidige branchhistorie door elkaar is geraakt, en welke herstelpunten eerst inhoudelijk opgelost moeten worden voordat er een nieuw uitvoeringsplan wordt gemaakt.

## 1. Bronnen en beperkingen

Deze analyse is gebaseerd op de repository-inhoud en lokale Git-historie in deze checkout. De opgegeven GitHub-documenten `masterplan.txt` en `followup.txt` waren vanuit deze omgeving niet rechtstreeks op te halen via raw GitHub vanwege een `403 Forbidden` tunnelfout; daarom zijn de lokaal aanwezige canonieke Fieldgrid-documenten, migratiedocumentatie, tests en merge-historie gebruikt als bewijsbasis.

Gebruikte controles:

- `git log --first-parent --oneline --max-count=30`
- `git log --oneline --decorate --graph --all --max-count=80`
- `rg "tenant_user_roles|tenantRole|hasPermission|activeTenant|tenant_domains|platform_users" -n --glob '!node_modules'`
- inspectie van `docs/fieldgrid-saas-masterplan.md`, `docs/fieldgrid-rbac-migration.md`, `docs/fieldgrid-cross-tenant-testmatrix.md`, relevante Drizzle schema's, SQL-migraties en API/backoffice-authcode.

## 2. Wat er moest gebeuren volgens de Fieldgrid-canon

De beoogde richting is niet een losse Veele-specifieke doorontwikkeling, maar een gecontroleerde migratie naar Fieldgrid als SaaS-platform:

1. **Fieldgrid is het platform.** Veele Services is geen apart platform of speciale architectuurcase, maar een normale tenant binnen Fieldgrid.
2. **Domeinmodel:** `fieldgrid.nl` is het hoofddomein; `platform.fieldgrid.nl` is bedoeld voor platform-admin; tenants krijgen subdomeinen zoals `veele.fieldgrid.nl`.
3. **Databasekeuze:** één gedeelde database met sterke tenant-isolatie. Alle query's, policies en applicatielogica moeten tenantcontext expliciet respecteren.
4. **Tenantconfiguratie:** modules zijn per tenant aan/uit te zetten; sectoren blijven een globale catalogus met tenant-toewijzing.
5. **RBAC-migratie:** globale rollen blijven als templates/catalogus bruikbaar, maar daadwerkelijke gebruikersrollen en permissies moeten tenant-scoped worden via `tenant_roles`, `tenant_role_permissions` en `tenant_user_roles`.
6. **Teststrategie:** cross-tenant tests moeten aantonen dat permissies altijd worden bepaald door de combinatie `userId` + actieve `tenantId`, en dat data, documenten, PDF's, storage-objecten en portalroutes niet over tenants heen lekken.

## 3. Verwachte volgorde van werk

Uit de lokale documenten en mergegeschiedenis volgt een logische volgorde die sequentieel had moeten worden afgerond:

| Stap | Bedoeling | Verwachte afhankelijkheid |
| --- | --- | --- |
| 1 | Fieldgrid-canon en branding vastleggen | Geen technische afhankelijkheden; bepaalt richting. |
| 2 | Cross-tenant data-classificatie en testmatrix documenteren | Nodig om technische wijzigingen te toetsen. |
| 3 | Tenant-basismodel en domeinresolutie introduceren | Nodig vóór tenant switcher en tenant-scoped permissies. |
| 4 | Tenant switcher/backoffice tenantcontext toevoegen | Moet aansluiten op één centrale tenantresolver. |
| 5 | Tenant-RBAC datamodel kiezen en migreren | Moet één canoniek schema opleveren. |
| 6 | Permission helpers/API-auth omschakelen naar tenantcontext | Moet exact aansluiten op het gekozen RBAC-schema. |
| 7 | Rollen-instellingenpagina aanpassen op tenantrollen | Moet bouwen op werkende tenant-RBAC helpers. |
| 8 | Cross-tenant permissietests toevoegen en laten slagen | Validatie van de hele keten. |

Het kernprobleem is dat stappen 3 t/m 8 deels parallel zijn ontwikkeld en gemerged, waardoor meerdere varianten van hetzelfde datamodel naast elkaar zijn beland.

## 4. Wat er in de huidige branchhistorie is misgegaan

### 4.1 `staging`-werk lijkt in `main`/huidige lijn terug gemerged te zijn

De first-parent geschiedenis toont dat na de canonieke Fieldgrid-documentatie meerdere feature-PR's en staging/main-merges door elkaar lopen. Opvallend zijn onder meer:

- PR #46, #47 en #49 leggen Fieldgrid-canon, branding en data-classificatie vast.
- PR #56 voegt een `platform_users`-achtige guard toe, waarna PR #57 die wijziging revert.
- PR #60 is een merge vanuit `main` in de huidige lijn.
- PR #61 t/m #64 voegen achtereenvolgens tenant-RBAC migratie, permission helpers, rolleninstellingen en tests toe.
- Binnen featurebranches zijn daarnaast merges vanuit `staging` en `main` zichtbaar voordat alle afhankelijkheden lineair waren afgerond.

Daardoor is de branch niet meer eenvoudig te lezen als: eerst basis, daarna resolver, daarna RBAC, daarna UI, daarna tests. De huidige tree bevat meerdere technische interpretaties van hetzelfde onderwerp.

### 4.2 Vier migraties gebruiken hetzelfde nummer `055`

Er bestaan momenteel meerdere migraties met prefix `055`:

- `055_tenant_domains.sql`
- `055_tenant_roles.sql`
- `055_tenant_scoped_rbac.sql`
- `055_tenant_rbac_backfill.sql`

Dit is een hard herstelpunt. In migratiesystemen is de bestandsvolgorde onderdeel van de productiegeschiedenis. Vier inhoudelijk verschillende migraties met hetzelfde nummer maken de volgorde ambigu, vergroten de kans dat omgevingen verschillende schema's krijgen, en maken rollback/validatie onbetrouwbaar.

### 4.3 Er zijn drie concurrerende RBAC-schema's in code en SQL

De repository bevat meerdere definities voor dezelfde tabellen:

1. `lib/db/src/schema/tenant-rbac.ts` definieert het nieuwere model met:
   - `tenant_roles.template_role_id`
   - `tenant_role_permissions.tenant_role_id`
   - `tenant_user_roles.tenant_role_id`
   - `source_user_role_id`

2. `lib/db/src/schema/tenant-roles.ts` definieert ook `tenant_roles`, `tenant_role_permissions` en `tenant_user_roles`, maar met een andere shape:
   - primaire sleutels op combinaties;
   - `is_custom` op rollen;
   - geen `template_role_id`;
   - geen `id` op role-permission/user-role records.

3. `lib/db/src/schema/tenant-user-roles.ts` en `lib/db/src/schema/tenant-role-permissions.ts` definiëren nog een ouder tenant-scoped model waarin `tenant_user_roles` en `tenant_role_permissions` direct naar globale `roles.id` verwijzen via `role_id`.

Deze drie modellen kunnen niet tegelijk waar zijn. Het resultaat is dat verschillende applicatielagen tegen verschillende kolommen programmeren.

### 4.4 API-auth gebruikt een ander RBAC-model dan het nieuwere backfill-schema

De API-auth middleware leest `tenantUserRolesTable.roleId` en `tenantRolePermissionsTable.roleId`. Dat past bij het oudere model waarin tenant-permissies direct aan globale rollen hangen. De nieuwere backfillmigratie en `tenant-rbac.ts` werken juist met `tenant_role_id` en tenantrollen als echte entiteit.

Gevolg: als de database volgens de nieuwere backfill wordt opgebouwd, kan code die `role_id` verwacht falen of altijd lege permissies teruggeven. Als de database volgens het oudere model is opgebouwd, sluit de rollen-instellingenpagina of nieuwere tenantrollenlogica niet goed aan.

### 4.5 Tests valideren slechts een deel van de gewenste werkelijkheid

De aanwezige tests controleren dat tenant-permissies tenantcontext gebruiken en dat cross-tenant write/read verschillen bestaan. Dat is waardevol, maar onvoldoende als de onderliggende schema's elkaar tegenspreken. Een test kan slagen op source-patterns of geïsoleerde fixtures terwijl de echte migratievolgorde of runtime databasekolommen niet kloppen.

### 4.6 Documentatie en implementatie zijn uit elkaar gaan lopen

`docs/fieldgrid-rbac-migration.md` beschrijft de backfill naar tenantrollen als canonieke richting. De codebase bevat echter nog de oudere rechtstreekse `role_id`-variant en een tweede `tenant-roles.ts`-variant. Hierdoor is onduidelijk welk bestand de bron van waarheid is voor vervolgwerk.

## 5. Huidige risicobeoordeling

| Risico | Impact | Waarschijnlijkheid | Toelichting |
| --- | --- | --- | --- |
| Migraties draaien in verkeerde volgorde of botsen | Hoog | Hoog | Vier `055`-migraties en meerdere definities voor dezelfde tabellen. |
| API geeft onterecht geen permissies of te veel permissies | Hoog | Middel/hoog | Authcode en migraties verwachten verschillende kolommen. |
| Rollen-instellingenpagina beheert andere rollen dan runtime gebruikt | Hoog | Middel/hoog | Tenantrollenmodel is niet eenduidig. |
| Staging bevat gedeeltelijke implementaties die niet reproduceerbaar zijn vanuit main | Hoog | Middel | Branches zijn door elkaar gemerged; main moet herstelbron worden. |
| Nieuwe fixes stapelen bovenop verkeerde basis | Hoog | Hoog | Zonder eerst canoniek datamodel te kiezen blijven vervolgtaken conflicteren. |

## 6. Wat inhoudelijk opgelost moet worden

Dit is nog geen uitvoeringsplan, maar de herstelopgave bestaat inhoudelijk uit de volgende beslissingen en correcties:

1. **Kies één canoniek RBAC-datamodel.** De meest consistente richting met de Fieldgrid-canon is het model waarin globale `roles` templates blijven en echte tenanttoewijzingen via `tenant_roles` verlopen. Dat betekent: `tenant_user_roles.tenant_role_id` en `tenant_role_permissions.tenant_role_id` zijn leidend.
2. **Verwijder of deprecieer concurrerende schemafiles.** Er mag niet tegelijk een `tenant-rbac.ts`, `tenant-roles.ts`, `tenant-user-roles.ts` en `tenant-role-permissions.ts` bestaan die dezelfde tabellen verschillend typeren.
3. **Herordeneer migraties.** De vier `055`-migraties moeten een unieke, lineaire volgorde krijgen. Bestaande al-uitgerolde staging-state moet apart worden behandeld met idempotente repairmigraties in plaats van destructieve herschrijving.
4. **Maak authhelpers runtime-consistent.** API, backoffice server actions en settingspagina's moeten dezelfde tenantresolver en hetzelfde RBAC-schema gebruiken.
5. **Bepaal hoe `platform_users`/platform-admin terugkomt.** De eerdere platform user guard is teruggedraaid. Platform-admin moet pas terugkomen nadat tenantresolutie en tenantrollen stabiel zijn, zodat platformrechten niet per ongeluk tenantisolatie omzeilen.
6. **Maak main de herstelbron.** Nieuwe commits moeten naar `main` gaan; staging moet later vanuit main worden bijgewerkt. Staging mag niet als bron van waarheid dienen zolang de gemengde migratiegeschiedenis niet is gereconcilieerd.
7. **Breid validatie uit van source-checks naar migratie/runtime checks.** Naast unit/source tests zijn minimaal schema-compatibiliteitschecks nodig: migraties toepassen op lege database, migraties toepassen op staging-achtige database, en permissiequeries uitvoeren tegen echte tabellen.

## 7. Aanbevolen herstelrichting zonder al een taakplan te maken

De veiligste inhoudelijke richting is een consolidatie-aanpak:

- **Niet cherry-picken op basis van PR-volgorde alleen.** De PR-volgorde is vervuild door merges vanuit andere branches.
- **Wel per domein canoniseren:** eerst tenant/domeinresolutie, daarna RBAC-schema, daarna permission helpers, daarna UI, daarna tests.
- **Behoud bestaande data waar mogelijk.** Omdat staging mogelijk al een variant van de tabellen heeft, moeten repairmigraties tolerant zijn voor bestaande kolommen en indexen.
- **Maak het datamodel expliciet leidend in docs én code.** Eén schemafile, één migratieset, één authpad.
- **Gebruik main als schone herstelbranch.** Staging wordt pas bijgewerkt nadat main een reproduceerbare migratie- en teststatus heeft.

## 8. Open punten voor het latere plan

Voor het daadwerkelijke plan moeten nog expliciet beantwoord worden:

1. Welke migraties zijn al toegepast op staging en in welke volgorde?
2. Welke van de drie RBAC-varianten draait nu daadwerkelijk in staging?
3. Moeten al bestaande staging-tabellen worden gemigreerd met `ALTER TABLE`, of kan staging opnieuw worden opgebouwd?
4. Welke applicatie is leidend voor auth: backoffice helpers, API middleware, of gedeelde package-code?
5. Moet de rollen-instellingenpagina bestaande globale rollen blijven tonen als templates, of alleen tenantrollen beheren?
6. Welke smoke tests zijn verplicht voordat main naar staging gaat?

## 9. Conclusie

Er is niet één simpele bug ontstaan, maar een sequencing-probleem: afhankelijke Fieldgrid-taken zijn parallel ontwikkeld en daarna in een gemengde volgorde gemerged. Het zichtbare symptoom is vooral het concurrerende tenant-RBAC datamodel met dubbele migratienummers en meerdere schemafiles voor dezelfde tabellen. De eerstvolgende stap moet daarom geen nieuwe feature-implementatie zijn, maar consolidatie: één canoniek tenantmodel, één RBAC-schema, unieke migraties, en daarna pas helpers, UI en tests daarop rechttrekken.
