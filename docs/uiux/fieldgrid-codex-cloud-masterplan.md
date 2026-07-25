# Fieldgrid — Codex Cloud Masterplan

## Volledige UI/UX-modernisering + Radix-first shadcn/ui-designsysteem + live planbordcorrectheid

**Repository:** `veele-services/platform`  
**Werkbranch:** `main` — bron voor alle ontwikkeling; geen gedeelde/live database  
**Testbranch:** `staging` — database, deploy, migraties en live acceptatie  
**Productie:** buiten scope  
**Doel:** alle punten uit de volledige UI/UX-audit uitvoeren, inclusief de twee aanvullende planbordproblemen, met een Radix-first shadcn/ui-architectuur, meerdere Codex Cloud-taken, subagents, onafhankelijke branches, integratie-PR's en harde eindgates.

---

# 1. Niet-onderhandelbare productregels

1. Er wordt nooit rechtstreeks ontwikkeld of gecommit op `main` of `staging`.
2. Iedere werktaak krijgt een eigen branch.
3. Alle featurebranches richten hun PR op de tijdelijke integratiebranch `codex/fieldgrid-uiux-master`.
4. Pas wanneer alle werkpakketten en gates groen zijn, gaat één PR van de integratiebranch naar `main`.
5. Daarna wordt `main` via een aparte releasecandidate naar `staging` gepromoveerd.
6. Databasewijzigingen zijn uitsluitend forward-only migraties. Bestaande, toegepaste migraties worden nooit aangepast.
7. Een staging-fout wordt niet alleen op `staging` gerepareerd. De fix wordt vanaf `main` gemaakt, naar `main` gemerged en opnieuw gepromoveerd.
8. Geen onafgemaakte tabs, placeholders, “komt later”-teksten of verborgen legacy-interfaces in een release.
9. Geen taak mag als voltooid worden gemarkeerd met openstaande TODO’s, uitgestelde acceptatiecriteria of niet-uitgevoerde verplichte tests.
10. “100% gereed” betekent in dit plan: ieder backlog-ID is geïmplementeerd, aantoonbaar getest, gereviewd, gedocumenteerd en afgevinkt in de traceability matrix. De integrator mag de eindstatus niet op groen zetten zolang één bewijsstuk ontbreekt.
11. Alle nieuwe en gemigreerde interactieve UI volgt een **Radix-first shadcn/ui-architectuur**. Radix UI is de gedrag-, toegankelijkheids- en state-laag; shadcn/ui is de canonieke Fieldgrid-componentlaag.
12. Productpagina’s importeren interactieve primitives via `@/components/ui` of een gedocumenteerde Fieldgrid-wrapper. Rechtstreekse `@radix-ui/react-*`-imports zijn alleen toegestaan in de centrale primitive-/adapterlaag.
13. Er worden geen eigen dialogs, alert dialogs, dropdowns, popovers, tooltips, selects, checkboxes, switches, radio groups, tabs, accordions, collapsibles of focus traps gebouwd wanneer een passende Radix/shadcn-primitieve bestaat.
14. De visuele uitwerking is strak, sober en professioneel: consistente ritmes, beperkte elevatie, beheerste radii, duidelijke typografie, minimale decoratie en geen speelse of template-achtige “card soup”.

## 1.1 Verplichte UI-architectuur: Radix-first met shadcn/ui

### Architectuurregel

Fieldgrid gebruikt **Radix UI als primaire interaction engine** en **shadcn/ui als lokale, aanpasbare componentarchitectuur**. De UI mag niet bestaan uit pagina-specifieke, handgemaakte interactiepatronen. Gedrag, focusmanagement, keyboardinteractie, open/closed state, portal rendering en ARIA-semantiek worden waar mogelijk door Radix-primitives geleverd. Fieldgrid-styling, varianten, design tokens en domeincompositie worden in de lokale shadcn/ui-laag vastgelegd.

De componentlagen zijn:

1. `@/components/ui/*` — canonieke shadcn/Radix-primitives, variants en basisstates.
2. `@/components/tenant-ui/*`, `@/components/platform-ui/*` en domeinwrappers — Fieldgrid-composities bovenop de canonieke primitives.
3. Pagina- en featurecomponenten — consumeren uitsluitend deze lagen en bouwen geen concurrerende primitivebibliotheek.

### Verplichte componentkeuzes

| Interactie                                 | Verplichte basis                                                                                           |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| Gewone bevestiging of formuliermodal       | shadcn `Dialog` op Radix Dialog                                                                            |
| Destructieve of risicovolle bevestiging    | shadcn `AlertDialog` op Radix Alert Dialog                                                                 |
| Zijpaneel / mobiele acties / edit drawer   | canonieke `Sheet`-compositie op Radix Dialog                                                               |
| Rijacties en overflowmenu’s                | Radix/shadcn `DropdownMenu`                                                                                |
| Contextmenu waar werkelijk passend         | Radix/shadcn `ContextMenu`                                                                                 |
| Kleine contextuele laag                    | Radix/shadcn `Popover`                                                                                     |
| Uitleg bij iconen en planbordblokken       | Radix/shadcn `Tooltip`; `HoverCard` alleen voor rijke preview                                              |
| Begrensde keuzelijst                       | Radix/shadcn `Select`                                                                                      |
| Zoekbare entiteitskeuze                    | shadcn `Command` + Radix `Popover` of `Dialog`                                                             |
| Checkbox, radio, switch, toggle            | Radix/shadcn `Checkbox`, `RadioGroup`, `Switch`, `Toggle`/`ToggleGroup`                                    |
| Tabs binnen een scherm                     | Radix/shadcn `Tabs`; route-tabs via één toegankelijke route-aware wrapper                                  |
| Inklapbare navigatie en secundaire content | Radix/shadcn `Collapsible` of `Accordion`                                                                  |
| Command palette                            | shadcn `Command` in Radix/shadcn `Dialog`                                                                  |
| Scrollbare drawer-/queuecontent            | Radix/shadcn `ScrollArea` waar custom contained scrolling nodig is; native documentscroll blijft standaard |
| Toastfeedback                              | de bestaande canonieke shadcn/Sonner-laag, niet een tweede notificatiesysteem                              |
| Tabellen                                   | semantische native tabel via shadcn `Table`; Radix alleen voor bijbehorende menus, filters en controls     |
| Formulieren                                | React Hook Form/Zod plus canonieke shadcn fields, labels, validation en Radix-keuzecontrols                |

### Gedragsregels

- Iedere overlay ondersteunt correcte focus-in, focus trap waar modal, `Escape`, buitenklik volgens productrisico, scroll lock en focus return naar de trigger.
- Gebruik Radix `Portal`-gedrag en één gedocumenteerde z-indexschaal. Geen pagina-specifieke `z-[9999]`-oplossingen.
- Gebruik `asChild` alleen wanneer het resulterende element semantisch correct blijft. Geen geneste buttons, links-in-buttons of meerdere interactieve roots.
- Style open, checked, selected, disabled en side/position states primair via Radix `data-state`, `data-side`, `data-disabled` en vergelijkbare attributes.
- Alle states zijn ontworpen: default, hover, focus-visible, pressed, open, selected, disabled, loading, invalid, success en destructive.
- Animaties zijn functioneel, 120–220 ms als standaard, en respecteren `prefers-reduced-motion`.
- Native HTML blijft leidend waar het semantisch beter is, zoals links, labels, forms, tabellen en date/time/file-inputs. “Radix-first” betekent geen onnodige wrapper om correcte native semantiek heen.
- Een nieuwe dependency is alleen toegestaan wanneer Radix/shadcn en de bestaande stack het aantoonbaar niet kunnen oplossen.

### Visuele kwaliteitslat

- Zakelijk, rustig en precies; geen generieke admin-template-uitstraling.
- Eén consistente spacing-rhythm, bij voorkeur gebaseerd op stappen van 4/8 px.
- Controls hebben consistente hoogte: compact desktop waar verantwoord, minimaal 44 px op touch.
- Richtwaarden: controls 8 px radius, cards/panels 12 px, grote dialogs/sheets maximaal 16 px tenzij een gedocumenteerde uitzondering bestaat.
- Schaduw uitsluitend voor echte elevatie: menus, dialogs, sheets en geselecteerde/dragstates; niet ieder genest vlak krijgt een shadow.
- Primaire CTA, statuskleur en merkaccent hebben elk een vaste semantiek.
- Geen overmatig glassmorphism, neon, zware gradients, grote pill-vormen, oversized hero-cards of decoratieve dashboards zonder taakwaarde.
- Dichtheid is bewust: tenant-backoffice comfortabel en operationeel; platformbeheer compacter, maar beide gebruiken dezelfde primitive- en tokenlaag.
- Op 320–1920 px blijven uitlijning, typografie, overlays en controls professioneel en voorspelbaar.

### Uitzonderingen en review

Een afwijking van de canonieke primitive moet in de PR worden gemotiveerd met:

- waarom de bestaande Radix/shadcn-component niet volstaat;
- toegankelijkheids- en keyboardgedrag;
- responsive gedrag;
- testdekking;
- waarom geen tweede concurrerend patroon ontstaat.

Zonder deze onderbouwing wordt de afwijking niet gemerged.

---

# 2. Aanvullende P0-specificatie: live werkelijke tijden op het planbord

## 2.1 Huidige oorzaak

De applicatie bewaart al:

- `actualStartedAt`
- `actualCompletedAt`

De personeelsacties vullen deze tijden bij starten en afronden. De detailweergave van een werkbon gebruikt al deels de werkelijke tijden. Het planbordmodel en de planbordquery gebruiken echter alleen `scheduledStart` en `scheduledEnd`. De planninglijst in de personeelsapp gebruikt eveneens alleen geplande tijden. Daarom blijft een werkbon visueel op bijvoorbeeld `11:00–12:00` staan, ook als hij werkelijk om `09:22` is gestart en om `09:44` is afgerond.

## 2.2 Gewenste tijdssemantiek

Geplande en werkelijke tijd blijven allebei bewaard. Geplande velden mogen niet destructief worden overschreven door uitvoeringsacties; zij zijn nodig voor audit, afwijkingsanalyse, SLA’s en historische planning.

Introduceer één gedeelde domeinfunctie, bijvoorbeeld:

```ts
resolveAssignmentEffectiveInterval({
  scheduledDate,
  scheduledStart,
  scheduledEnd,
  actualStartedAt,
  actualCompletedAt,
  status,
  now,
  timeZone: "Europe/Amsterdam",
});
```

De functie retourneert minimaal:

```ts
type EffectiveAssignmentInterval = {
  plannedDate: string | null;
  plannedStart: string | null;
  plannedEnd: string | null;
  effectiveDate: string | null;
  effectiveStart: string | null;
  effectiveEnd: string | null;
  endMode: "planned" | "actual" | "now" | "unknown";
  source: "planned" | "partly_actual" | "actual";
  isRunning: boolean;
  hasDeviation: boolean;
};
```

### Waarheidstabel

| Situatie                                                  | Positie en label                                                               |
| --------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Niet gestart                                              | Geplande datum en `scheduledStart–scheduledEnd`                                |
| Gestart, niet afgerond                                    | Werkelijke start tot huidig tijdstip; label `09:22–nu`                         |
| Afgerond                                                  | Werkelijke start tot werkelijke eindtijd; label `09:22–09:44`                  |
| Alleen werkelijke start aanwezig, status niet meer actief | Werkelijke start en best beschikbare eindtijd, plus datakwaliteitswaarschuwing |
| Werkelijk gestart op andere lokale datum                  | Toon op werkelijke datum in tijdzone `Europe/Amsterdam`                        |
| Geen bruikbare tijden                                     | Toon in ongeplande/afwijkende sectie, niet als misleidend tijdblok             |

### Visuele regels

- Zodra `actualStartedAt` bestaat, springt het tijdblok naar de werkelijke start.
- Tijdens `in_progress` groeit het blok elke minuut tot “nu”; er wordt daarvoor geen databasewrite per minuut uitgevoerd.
- Hanteer alleen voor de zichtbaarheid een minimale breedte van vijf minuten; de tekst en data blijven exact.
- Na afronden eindigt het blok exact op `actualCompletedAt`.
- Tooltip/detail toont:
  - `Werkelijk 09:22–09:44`
  - `Gepland 11:00–12:00`
  - `Afwijking −98 min gestart`
- Conflictdetectie in de actuele bordweergave gebruikt de effectieve intervallen.
- Historische/geplande rapportages blijven geplande en werkelijke waarden apart gebruiken.
- Actualisatie gebeurt via bestaande management-realtime-events en daarnaast via een minuut-ticker voor lopende blokken.
- Dezelfde helper wordt gebruikt in:
  - desktopplanbord;
  - dagweergave;
  - personeelsapp “Mijn planning”;
  - werkbondetail;
  - relevante tooltips en compacte kaarten.

## 2.3 Live acceptatiescenario

Met een werkbon gepland op `11:00–12:00`:

1. Medewerker start om `09:22`.
2. Binnen de realtime-refresh verschijnt het blok op `09:22–nu`.
3. De personeelsapp toont eveneens `09:22–nu`.
4. Medewerker rondt af om `09:44`.
5. Planbord en personeelsapp tonen `09:22–09:44`.
6. Het geplande tijdvak blijft in tooltip/detail zichtbaar.
7. Een paginaverversing, andere browser en nieuwe sessie geven exact hetzelfde resultaat.

---

# 3. Aanvullende P0-specificatie: selectie uit interessepeiling plant werkelijk in

## 3.1 Huidige oorzaak

De UI biedt afzonderlijke acties:

- `Selecteer`
- `Reserve`
- `Koppel`

`Selecteer` verandert alleen de status van de interesse-response naar `selected`. De koppeling in `assignment_personnel` wordt niet naar `assigned` gezet. Daardoor verschijnt de medewerker niet als ingepland en verschijnt de werkbon niet in zijn planning of als tijdblok op het planbord.

## 3.2 Gewenst domeingedrag

De actie `Selecteer` wordt functioneel `Selecteer en plan in`.

Binnen één database-transactie:

1. Verifieer tenant, opdracht, medewerker, laatste interesse-response en permissie.
2. Verifieer dat de medewerker actief is.
3. Lock de opdracht of gebruik een equivalent concurrency-safe mechanisme.
4. Bereken het werkelijk vereiste aantal plaatsen met één gedeelde helper:

```ts
requiredSlots = max(
  assignments.requiredPersonnelCount,
  distinctRequiredRoleCount,
  1,
);
```

5. Controleer of de medewerker al is toegewezen.
6. Voorkom onbedoelde overbezetting bij gelijktijdige selecties.
7. Update de nieuwste interesse-response naar `selected`.
8. Upsert `assignment_personnel` naar `status = "assigned"` met `assignedAt` en `assignedBy`.
9. Tel opnieuw het aantal bevestigde koppelingen.
10. Pas de opdrachtstatus aan:
    - volledige datum + begin/eindtijd én alle plaatsen gevuld:
      - `plannable`/toegestane voorbereidende status → `scheduled`;
    - nog niet alle plaatsen gevuld:
      - behoud `plannable`;
    - reeds `scheduled`, `seen`, `en_route`, `in_progress` of later:
      - nooit terugzetten;
    - eindstatus:
      - selectie blokkeren.
11. Schrijf afzonderlijke auditregels voor selectie, personeelskoppeling en eventuele statusovergang.
12. Emit realtime-events voor management én de geselecteerde medewerker.
13. Stuur één idempotente “Je bent ingepland”-melding.
14. Refresh routes en relevante pagina’s.
15. Het tijdblok verschijnt direct op het planbord wanneer datum en tijd volledig zijn.
16. Reserve blijft uitsluitend reserve en maakt geen personeelskoppeling.

Een interessepeiling kan nu alleen worden gestart als datum, begin- en eindtijd bestaan. Daarom hoort een succesvolle selectie uit zo’n peiling normaliter onmiddellijk planbaar op het bord te zijn.

## 3.3 UX-aanpassing

- Vervang `Selecteer` door `Inplannen`.
- Toon na succes:
  - `Medewerker ingepland. 2/2 plaatsen gevuld. Werkbon staat nu op Ingepland.`
  - of `Medewerker ingepland. 1/2 plaatsen gevuld. Nog één medewerker nodig.`
- Verberg de dubbele actie `Koppel` wanneer de kandidaat via een interessepeiling kan worden ingepland.
- Behoud een expliciete handmatige koppelactie voor kandidaten zonder interesse-response.
- Toon na selectie de nieuwe status direct zonder volledige gebruikersnavigatie te vereisen.

## 3.4 Verplichte randgevallen

- Dubbel klikken.
- Twee planners selecteren tegelijk.
- Medewerker was al `suggested`.
- Medewerker was al `assigned`.
- Laatste response staat al op `selected`.
- Vereist aantal is groter dan aantal unieke rollen.
- Vereist aantal is kleiner dan aantal unieke rollen.
- Werkbon heeft meerdere kandidaten met hetzelfde roltype.
- Werkbon is inmiddels gestart of afgerond.
- Medewerker is inactief.
- Tenantgrens wordt strikt gehandhaafd.
- Melding of routeberekening faalt na een geslaagde transactie; kerntransactie blijft correct en vervolgwerk is retrybaar.

---

# 4. Git- en branchmodel

## 4.1 Integratiebranch

De bootstraptaak maakt vanaf de actuele `main`:

```text
codex/fieldgrid-uiux-master
```

Deze branch is de tijdelijke basis voor alle werkpakketten.

## 4.2 Werkbranches

Iedere taak gebruikt:

```text
codex/fg-uiux-wNN-korte-naam
```

Voorbeelden:

```text
codex/fg-uiux-w01-live-planning
codex/fg-uiux-w04-design-system
codex/fg-uiux-w10-planboard-ux
```

## 4.3 PR-richting

Tijdens uitvoering:

```text
featurebranch -> codex/fieldgrid-uiux-master
```

Aan het einde:

```text
codex/fieldgrid-uiux-master -> main
```

Stagingpromotie:

```text
release/fieldgrid-uiux-staging-YYYYMMDD -> staging
```

De releasebranch wordt vanaf `staging` gemaakt en krijgt daarna een merge van de geaccepteerde `main`.

## 4.4 Regels voor conflicten

- Een taak start pas wanneer alle afhankelijke PR’s in de integratiebranch zijn gemerged.
- Voor start: `git fetch origin --prune`.
- Base altijd fast-forward synchroniseren.
- Nooit `git push --force`.
- Geen merge van `staging` naar een featurebranch.
- Gedeelde bestanden worden alleen parallel aangepast als de orchestrator expliciet heeft vastgesteld dat de wijzigingen onafhankelijk zijn.
- Bij overlap wordt één werkpakket eerst gemerged; de volgende taak rebased/merget de actuele integratiebranch en voert alle tests opnieuw uit.

---

# 5. Codex Cloud-omgeving

## Runtime

Pin:

```text
Node.js >=24 <25
pnpm 11.5.2
```

## Setupscript

```bash
set -euo pipefail
corepack enable
corepack prepare pnpm@11.5.2 --activate
pnpm install --frozen-lockfile
pnpm run typecheck:libs
```

## Onderhoudsscript voor hergebruikte container

```bash
set -euo pipefail
git status --short
pnpm install --frozen-lockfile
```

## Internet en geheimen

- Agentinternet standaard uit.
- Geen stagingdatabasecredentials in featuretaken.
- Geen productiesecrets.
- Nieuwe dependencies alleen wanneer aantoonbaar nodig en na controle van bestaande componenten.
- Database-integratie wordt lokaal/mocked getest waar mogelijk; echte migratie- en runtimeacceptatie gebeurt bij de stagingpromotie via bestaande CI/deploysecrets.
- Codex mag nooit database-URL’s, cookies, auth states, tokens of andere geheimen in logs, commits of PR-teksten plaatsen.

---

# 6. Root `AGENTS.md` dat W00 moet toevoegen

```md
# Fieldgrid repository instructions

## Branch model

- `main` is the development/integration source branch and has no shared live database.
- `staging` is only for deployed database, migrations, and live acceptance.
- Never commit directly to `main` or `staging`.
- Feature branches target `codex/fieldgrid-uiux-master` during the UI/UX program.
- Never merge staging-only fixes back implicitly. Recreate every fix from main and re-promote.

## Toolchain

- Use Node >=24 <25.
- Use pnpm 11.5.2 only.
- Do not generate package-lock.json or yarn.lock.
- Prefer existing dependencies and existing shadcn/Radix/Tailwind primitives.
- Do not add a production dependency without documenting why current dependencies cannot solve the problem.

## Required checks

Run the narrowest relevant tests while developing, then before PR completion run:

- `pnpm run typecheck`
- `pnpm -r --if-present run build`
- relevant `node --test ...` suites
- `pnpm fieldgrid:dashboard-ui-audit:check`
- `pnpm fieldgrid:visual-regression-snapshots:check`
- any task-specific gate added by the work package

If a required check cannot run in the cloud environment, add or improve deterministic static/unit coverage and document the exact staging gate that must prove it. Do not silently skip it.

## Database and migrations

- Migrations are forward-only.
- Never edit, reorder, squash, or delete an already committed migration.
- Every schema change needs tenant isolation, RLS/security review, rollback reasoning, and a migration-order check.
- Prefer existing `actual_started_at`, `actual_completed_at`, assignment-personnel and interest-response fields over adding duplicate columns.
- Do not connect feature tasks to the staging database.

## UI/UX

- Mobile support is mandatory, not a later enhancement.
- Test at 320, 390, 430, 768, 1024, 1280, 1440, and 1920 widths where relevant.
- No unintended page-level horizontal overflow.
- Mobile touch targets are at least 44x44 px.
- All forms collapse to one column on narrow screens.
- Complex desktop planning must have a non-drag mobile/touch alternative.
- The UI architecture is Radix-first and follows shadcn/ui composition principles.
- Product pages import interactive primitives through `@/components/ui` or approved Fieldgrid wrappers. Direct `@radix-ui/react-*` imports belong only in shared primitive/adapter code.
- Do not hand-roll dialogs, alert dialogs, sheets, dropdowns, popovers, tooltips, selects, checkboxes, switches, radio groups, tabs, accordions, collapsibles, focus traps, or portal behavior when a canonical Radix/shadcn primitive exists.
- Use Radix data attributes for open/closed/checked/selected/disabled states and preserve focus return, Escape behavior, modal semantics, portal layering, and scroll locking.
- Use `asChild` only with one semantically valid interactive root; never create nested buttons or links.
- Use CVA/typed variants and `cn` in shared components instead of page-specific class forks.
- Use semantic design tokens. Do not add hardcoded Fieldgrid navy/teal/border colors in product components.
- Status is never communicated by color alone.
- Hide inaccessible tabs instead of showing an empty or forbidden tab.
- Hide unfinished features and placeholders.
- Dutch user-facing copy is required unless a technical identifier must remain English.
- Avoid duplicate page titles, duplicate actions, card-within-card clutter, raw implementation terminology, and generic admin-template styling.
- The final UI must look restrained, precise, consistent, and professionally finished across platform, tenant, customer, and personnel surfaces.

## Product timing rule

- Preserve planned times.
- Display effective times from actual start/completion when available.
- Running work orders display actual start to “now”.
- Use Europe/Amsterdam for user-facing work-order date/time decisions.
- Do not overwrite scheduled fields when personnel starts or completes work.

## Interest selection rule

- Selecting a candidate from an interest poll must atomically assign that personnel member.
- Reconcile filled slots using max(explicit required personnel, distinct required roles, 1).
- Transition to scheduled only when the full planned moment exists and all required slots are filled.
- Never regress an active/final workflow status.

## Accessibility and safety

- Preserve visible focus.
- Add keyboard alternatives for pointer/drag interactions.
- Add aria-sort, labels, dialog descriptions, and meaningful empty/loading states.
- Confirm destructive actions with an in-product dialog.
- Every async mutation needs pending, success, and error feedback.
- Do not log PII, secrets, full cookies, tokens, signatures, or sensitive form payloads.

## Subagents

- Delegate read-heavy exploration, test design, security review, accessibility review, and log analysis to parallel subagents.
- Avoid parallel agents editing the same files.
- Tell subagents exactly what to inspect, whether to wait for all results, and what summary with file paths to return.
- The parent agent owns final integration, test execution, and the PR.

## Completion

A work package is not complete until:

- every acceptance criterion is implemented;
- all relevant tests pass;
- no TODO/FIXME/deferred acceptance remains;
- a self-review and a separate subagent review found no unresolved P0/P1 issue;
- the PR body contains changed files, migration impact, test evidence, screenshots/evidence paths, risks, and rollback notes.

## Review guidelines

- Flag tenant-isolation or auth regressions as P0.
- Flag wrong dashboard data, workflow-status regression, lost scheduled/actual timing, non-idempotent assignment, inaccessible critical controls, and mobile blockers as P1.
- Verify migrations are forward-only.
- Verify actual-time behavior does not overwrite planned time.
- Verify interest selection creates an assigned personnel link transactionally.
- Flag a hand-built replacement for an available Radix/shadcn primitive, broken focus management, nested interactive elements, overlay z-index leakage, or inconsistent open/disabled/loading states as P1.
- Verify direct Radix imports are confined to the canonical shared primitive/adapter layer.
```

---

# 7. Volledige traceability matrix

## Nieuwe runtime-P0’s

| ID     | Verplichting                                           | Werkpakket |
| ------ | ------------------------------------------------------ | ---------- |
| PB-001 | Planbord gebruikt werkelijke starttijd                 | W01        |
| PB-002 | Lopende bon eindigt dynamisch op “nu”                  | W01        |
| PB-003 | Afgeronde bon gebruikt werkelijke eindtijd             | W01        |
| PB-004 | Geplande tijd blijft apart bewaard en zichtbaar        | W01        |
| PB-005 | Personeelsplanning gebruikt dezelfde effectieve tijd   | W01        |
| PB-006 | Realtime managementrefresh na start/afronding          | W01        |
| PB-007 | Minuutticker zonder DB-write                           | W01        |
| PB-008 | Conflicten gebruiken actuele intervallen               | W01        |
| PB-009 | Interesse-selectie maakt `assigned`-koppeling          | W01        |
| PB-010 | Vereiste plaatsen gebruiken expliciet aantal én rollen | W01        |
| PB-011 | Volledig bezet zet geldige bon op `scheduled`          | W01        |
| PB-012 | Selectie is idempotent en concurrency-safe             | W01        |
| PB-013 | Planbord en personeelsapp updaten na selectie          | W01        |
| PB-014 | Reserve plant niet in                                  | W01        |

## Radix/shadcn-verplichtingen

| ID        | Verplichting                                                                        | Werkpakket                |
| --------- | ----------------------------------------------------------------------------------- | ------------------------- |
| RADIX-001 | Architectuurdocument en canonieke component registry                                | W00/W04                   |
| RADIX-002 | Eén `components/ui` primitive-laag; geen concurrerende componentbibliotheek         | W04/W15                   |
| RADIX-003 | Dialogs en risicobevestigingen via Dialog/AlertDialog                               | W03/W04/W11               |
| RADIX-004 | Sheets, dropdowns, popovers, tooltips en hovercards via Radix/shadcn                | W04/W06/W07/W08/W10/W11   |
| RADIX-005 | Selects, comboboxes, checkboxes, radio groups, switches en toggles via Radix/shadcn | W04/W06/W07/W11           |
| RADIX-006 | Tabs, accordions en collapsibles via één toegankelijke Radix/shadcn-wrapper         | W04/W05/W08/W11           |
| RADIX-007 | Overlays hebben focus trap/return, Escape, scroll lock en correcte modaliteit       | W04/W14                   |
| RADIX-008 | Eén portal- en z-indexschaal zonder lokale z-index hacks                            | W04/W14                   |
| RADIX-009 | Veilig `asChild`-gebruik zonder nested interactive elements                         | W04/W14                   |
| RADIX-010 | Radix `data-state`-styling en reduced-motionconforme animaties                      | W04/W14                   |
| RADIX-011 | Typed CVA-varianten voor size, tone, density en state                               | W04/W06                   |
| RADIX-012 | Semantische design tokens; geen hardcoded canonieke merkkleuren                     | W04 en alle migratietaken |
| RADIX-013 | Geen dubbele primitives of pagina-specifieke dialog/menu/select-implementaties      | W04/W15                   |
| RADIX-014 | Platform raw controls migreren naar canonieke shadcn/Radix-components               | W11                       |
| RADIX-015 | FieldgridDataView gebruikt shadcn Table en Radix-controls                           | W06/W07                   |
| RADIX-016 | Formulierarchitectuur gebruikt shadcn fields en Radix-keuzecontrols                 | W03/W06/W11/W12           |
| RADIX-017 | Planbordcontrols en ondersteunende overlays zijn Radix/shadcn-gebaseerd             | W10                       |
| RADIX-018 | Command palette gebruikt shadcn Command + Radix Dialog/Popover                      | W05                       |
| RADIX-019 | Visuele kwaliteitslat strak, sober, consistent en professioneel                     | W04/W09/W11/W12/W13       |
| RADIX-020 | Component-, keyboard-, overlay- en visual-regressietests bewijzen compliance        | W14/W16                   |

## Audit P0

| ID     | Verplichting                                    | Werkpakket |
| ------ | ----------------------------------------------- | ---------- |
| UX-001 | Object-KPI-databronnen en labels corrigeren     | W02        |
| UX-002 | Formulieren op mobiel één kolom                 | W03        |
| UX-003 | Tabs zonder permissie/module verbergen          | W02        |
| UX-004 | Onvoltooide placeholders uit release-UI         | W02/W11    |
| UX-005 | Confirm-dialogs voor kritieke platformmutaties  | W03/W11    |
| UX-006 | Pending/success/error voor platformmutaties     | W03/W11    |
| UX-007 | Planbord zonder drag bedienbaar                 | W10        |
| UX-008 | Planbord keyboardbediening                      | W10        |
| UX-009 | Whitelabelcontrast automatisch veilig           | W04        |
| UX-010 | Mobiele bulkbars en drawers veilig              | W03/W06    |
| UX-011 | Zoekveldverwachting klopt met gedrag            | W05        |
| UX-012 | Verborgen legacy- en `false`-markup verwijderen | W02        |

## Audit P1

| ID     | Verplichting                                 | Werkpakket      |
| ------ | -------------------------------------------- | --------------- |
| UX-013 | Tenantnavigatie groeperen                    | W05             |
| UX-014 | Platformnavigatie groeperen                  | W05/W11         |
| UX-015 | Kaart als Planning-weergave, niet hoofdmenu  | W05             |
| UX-016 | Help/Roadmap/Releases uit primaire tenantnav | W05             |
| UX-017 | Onboarding en tabellen van platformdashboard | W11             |
| UX-018 | Centrale routeconfig                         | W05             |
| UX-019 | Alle tenantpagina’s op gedeelde shell/header | W06/W07/W08/W09 |
| UX-020 | Eén gedeelde dataview                        | W06             |
| UX-021 | Filters en chips standaardiseren             | W06/W07         |
| UX-022 | Detailtabs sticky en permission-aware        | W08             |
| UX-023 | Alleen actieve detailtab zwaar laden         | W08/W11         |
| UX-024 | Mobiele detailactiesheet                     | W08             |
| UX-025 | Personeelswidgets beter plaatsen             | W07             |
| UX-026 | Personeel standaardkolommen verminderen      | W07             |
| UX-027 | Planbord werkdagvenster/zoom/dichtheid       | W10             |
| UX-028 | Open werkbonnenwachtrij zichtbaar            | W10             |
| UX-029 | Optimistische planbordupdates + undo         | W10             |
| UX-030 | Platformtermen/statuswaarden vertalen        | W11/W13         |

## Audit P2

| ID     | Verplichting                                  | Werkpakket                |
| ------ | --------------------------------------------- | ------------------------- |
| UX-031 | Hardcoded merkkleuren naar semantische tokens | W04 en alle migratietaken |
| UX-032 | Platform- en tenantcomponenten harmoniseren   | W04/W11                   |
| UX-033 | Radius/spacing/densityschalen                 | W04                       |
| UX-034 | Saved views                                   | W06/W07/W10               |
| UX-035 | Kolomkeuze en tabeldichtheid                  | W06                       |
| UX-036 | Globale commandopalette                       | W05                       |
| UX-037 | Recent bekeken items/concepten                | W09                       |
| UX-038 | Betere empty states en skeletons              | W06/W08/W13               |
| UX-039 | Tabs tonen workflowstatus                     | W08                       |
| UX-040 | Desktoplogin visueel rijker                   | W12                       |
| UX-041 | Productbrede microcopyrichtlijnen             | W13                       |
| UX-042 | UX-analytics voor zoeken/filters/fouten       | W13                       |

## Verdere auditverplichtingen

| ID     | Verplichting                                    | Werkpakket |
| ------ | ----------------------------------------------- | ---------- |
| UX-043 | Rolgestuurd tenantdashboard                     | W09        |
| UX-044 | Acties tonen eigenaar/wachttijd/SLA             | W09        |
| UX-045 | “Doorgaan waar ik was”                          | W09        |
| UX-046 | Reistijd/buffer/beschikbaarheid op planbord     | W10        |
| UX-047 | Stabiele/verklaarde matchsortering              | W10        |
| UX-048 | Sticky formulierfooter                          | W06        |
| UX-049 | Progressive disclosure in formulieren           | W06/W07    |
| UX-050 | Tijdvalidatie en duurfeedback                   | W06        |
| UX-051 | Unsaved-changesbescherming                      | W06/W08    |
| UX-052 | Klantdetailtabs hergroeperen                    | W08        |
| UX-053 | Platformtenanttabs hergroeperen                 | W11        |
| UX-054 | Login gebruikt dynamische viewport/touchtargets | W12        |
| UX-055 | Status niet alleen met kleur                    | W04/W14    |
| UX-056 | Skeletons i.p.v. globale spinner                | W13        |
| UX-057 | Nederlandse metadata en terminologie            | W13        |
| UX-058 | 320/430/1024/1280/1920 regressietests           | W14        |
| UX-059 | `aria-sort`, focus, labels en screenreaderflow  | W14        |
| UX-060 | Final release bevat geen horizontale overflow   | W14/W16    |

---

# 8. Uitvoeringsgolven en afhankelijkheden

## Golf 0

- W00 Bootstrap en governance.

## Golf 1 — parallel na W00

- W01 Live planbordtijden en interesse-selectie.
- W02 Datacorrectheid, permission-gating en legacycleanup.
- W03 Responsive blockers en veilige mutaties.

## Golf 2

- W04 Radix-first designsystem en accessibility foundations.
- W05 Navigatie, route registry en zoeken.

W04 start na W03. W05 mag na W00 beginnen, maar moet vóór merge synchroniseren met W04.

## Golf 3

- W06 Radix/shadcn DataView en formulierprimitives.
- W12 Login/auth-UX.

W06 baseert op W04. W12 baseert op W04.

## Golf 4 — parallel

- W07 Overzichtspagina’s.
- W08 Detaildossiers.
- W09 Tenantdashboard.
- W11 Platformbeheer.

W07 vereist W06.  
W08 vereist W04 en waar nuttig W06.  
W09 vereist W04/W05.  
W11 vereist W04/W05/W06.

## Golf 5

- W10 Geavanceerd planbord-UX; vereist W01, W04, W05 en W06.
- W13 Microcopy, states, analytics en polish; vereist de gemigreerde schermen.

## Golf 6

- W14 Volledige QA, accessibility, performance en visual regression.
- W15 Integratie, code review en main-releasegate.

## Golf 7

- W16 Stagingpromotie, migraties, live E2E en acceptatie.

---

# 9. Algemene promptheader voor ieder werkpakket

Plak dit blok boven iedere taakprompt of laat W00 het in `docs/uiux/codex-task-template.md` vastleggen.

```text
Repository: veele-services/platform
Selected base branch in Codex Cloud: codex/fieldgrid-uiux-master
Do not work directly on main or staging.
Create/use the exact output branch named in this task.
Open the final PR against codex/fieldgrid-uiux-master.

Read AGENTS.md and docs/uiux/fieldgrid-codex-cloud-masterplan.md before changing files.

Radix/shadcn architecture is mandatory for every UI change:
- consume canonical components from `@/components/ui` or approved Fieldgrid wrappers;
- direct `@radix-ui/react-*` imports are allowed only in the shared primitive/adapter layer;
- never hand-roll a dialog, alert dialog, sheet, dropdown, popover, tooltip, select, checkbox, switch, radio group, tabs, accordion, collapsible, focus trap, or portal when a suitable Radix/shadcn primitive exists;
- preserve focus management, Escape, outside-interaction policy, focus return, portal layering, ARIA semantics and reduced motion;
- use typed CVA variants and semantic tokens rather than page-specific one-off styling;
- deliver a restrained, precise and professional Fieldgrid visual result, not a generic admin template.

Use subagents explicitly:
1. Spawn read-only explorer subagents for code mapping and test mapping.
2. Spawn a dedicated accessibility/security/reviewer subagent where requested.
3. Do not let parallel subagents edit the same files.
4. Wait for all requested subagents.
5. The parent agent owns implementation integration, tests, commits, and PR output.

Do not finish with an analysis-only response. Implement the complete scope.
Do not mark the task complete with TODOs, skipped required checks, placeholder UI, or deferred acceptance criteria.
If an assumption is necessary, choose the safest backwards-compatible behavior, document it, add a test, and continue.
If a check cannot run in the cloud environment, add deterministic coverage and identify the exact W16 staging proof. Never silently skip.
```

---

# 10. Codex Cloud prompt — W00 Bootstrap en governance

**Outputbranch:** `codex/fieldgrid-uiux-master`  
**Base in Cloud UI:** `main`  
**PR:** nog geen feature-PR nodig; deze branch wordt de integratiebranch. Eventueel een draft PR naar `main` voor zichtbaarheid.

```text
You are the bootstrap/integration owner for the complete Fieldgrid UI/UX program.

Create branch codex/fieldgrid-uiux-master from the latest origin/main. If Codex Cloud already created a task branch, rename it or create the requested branch and ensure all commits land there. Never modify staging.

Spawn and wait for three read-only subagents:
- Repository mapper: map apps, shared UI, planning domain, realtime, migrations, tests, CI scripts, and branch assumptions.
- Test mapper: inventory all existing Fieldgrid gates and identify which backlog IDs they already cover.
- Risk reviewer: identify tenant-isolation, workflow, migration, and parallel-branch conflict risks.

Then implement all bootstrap work:
1. Add root AGENTS.md using the masterplan content.
2. Add docs/uiux/fieldgrid-codex-cloud-masterplan.md.
3. Add docs/uiux/uiux-traceability.md containing every PB-*, UX-* and RADIX-* ID, owner work package, status, PR, tests, evidence, and staging result columns.
4. Add docs/uiux/design-decisions.md with fixed decisions:
   - Radix UI is the canonical interaction/accessibility layer and shadcn/ui is the canonical local Fieldgrid component layer;
   - direct Radix imports are restricted to shared primitive/adapters;
   - raw/custom interactive primitives require an explicit documented exception;
   - preserve planned and actual time separately;
   - Europe/Amsterdam for user-facing execution time;
   - current teal remains semantic interactive primary until a canonical brand spec explicitly changes it;
   - official logo green is brand-mark/success accent, not a second arbitrary CTA color;
   - platform and tenant share primitives but may use different information density;
   - mobile planning uses agenda/selection alternatives rather than shrinking the desktop Gantt.
5. Add docs/uiux/radix-shadcn-architecture.md and docs/uiux/component-registry.md describing canonical primitives, approved wrappers, import boundaries, overlay/z-index rules, `asChild` rules, native-control exceptions, variants, density, and migration status.
6. Add scripts/fieldgrid-uiux-master-gate.mjs that fails if:
   - any traceability item is missing;
   - a required item remains OPEN/DEFERRED at final-gate mode;
   - visible placeholder phrases such as “volgt in fase”, “komt later”, or equivalent remain in released platform/tenant routes, except allowlisted docs/tests;
   - hidden permanent `false &&` legacy UI remains in released components;
   - required final evidence paths are absent in strict mode;
   - a released feature imports `@radix-ui/react-*` outside approved shared primitive/adapter paths;
   - raw browser dialogs, page-specific custom overlay/focus-trap implementations, or non-allowlisted raw interactive controls remain;
   - duplicate canonical primitives are introduced outside the component registry.
7. Expose package scripts:
   - fieldgrid:uiux-master-gate
   - fieldgrid:uiux-master-gate:check
   - fieldgrid:uiux-master-gate:strict
8. Add a machine-readable docs/uiux/uiux-traceability.json.
9. Add docs/uiux/branch-and-staging-runbook.md with the exact feature -> integration -> main -> staging process.
10. Add docs/uiux/evidence/.gitkeep and define evidence naming.
11. Do not change product behavior in W00.

Run:
- pnpm run typecheck
- relevant node tests for the new gate
- pnpm fieldgrid:uiux-master-gate:check

Add tests for the gate itself. Commit and push the integration branch. Return a concise bootstrap report with files, commands, risks, and the exact branch SHA.
```

---

# 11. Codex Cloud prompt — W01 Live planbordcorrectheid en interesse-inplanning

**Outputbranch:** `codex/fg-uiux-w01-live-planning`  
**Base:** actuele `codex/fieldgrid-uiux-master`  
**PR:** naar `codex/fieldgrid-uiux-master`

```text
Implement PB-001 through PB-014 completely.

Before coding, spawn and wait for four subagents:
1. Domain explorer: trace scheduled/actual fields, status transitions, assignment_personnel, interest responses, required slot calculations, and all consumers.
2. Realtime explorer: trace management/personnel portal_realtime_events and refresh behavior.
3. Test designer: produce deterministic unit, DB-contract, concurrency, and UI scenarios.
4. Independent risk reviewer: inspect multi-personnel semantics, timezone/cross-midnight behavior, idempotency, tenant boundaries, and status regression risks.

The parent agent must integrate the design and own all writes.

Required implementation:

A. Shared effective-time domain
- Add one shared, pure, unit-tested effective interval resolver accessible to backoffice and personnel app without duplicating logic.
- Inputs include planned date/start/end, actual start/completion, status, now, timezone.
- Preserve scheduled values; never overwrite them during start/complete.
- Use Europe/Amsterdam for effective local date/time.
- Running assignments use actual start to now, labeled “nu”.
- Completed/not-completed assignments use actual start/completion.
- Handle legacy partial actual data explicitly.
- Add deviation metadata and planned-vs-actual label helpers.

B. Backoffice planning data
- Extend PlanningBoardAssignment and PlanningBoardPersonnelAssignment with actual timestamps and effective interval fields.
- Select actualStartedAt and actualCompletedAt in planning queries.
- Ensure assignments are included on the effective actual date where relevant.
- Position and size board blocks from effective intervals.
- Use effective intervals for current visual conflict detection.
- Keep route/planned schedule calculations based on planned schedule unless the route domain explicitly needs actual history.
- Provide tooltip/detail data showing planned and actual intervals.
- Running blocks update each minute client-side without DB writes.
- Ensure management realtime refresh after personnel start/complete/not-complete causes new server data to render.

C. Personnel app
- Change the “Mijn planning” cards and compact view to use the shared effective interval.
- Running work shows “09:22 - nu”.
- Completed work shows actual start/end.
- The work-order header/detail uses the same helper; remove divergent time logic.
- Existing minute refresh provider must update running labels.
- Sorting for current/historical assignments must remain logical when actual start differs from planned start.

D. Interest selection transaction
- Replace selected-only behavior with an atomic “select and assign” domain action.
- Update the latest matching interest response.
- Upsert assignment_personnel to assigned.
- Centralize requiredSlots = max(requiredPersonnelCount, distinct required roles, 1).
- Reuse the same helper in assignPersonnel and scheduleAssignmentOnBoard; fix current inconsistent calculations.
- Prevent slot overfill under concurrency unless an explicit separate override flow is used.
- Never regress active/final statuses.
- If full date/time exists and all slots are filled, transition eligible pre-scheduled status to scheduled.
- If partially filled, retain plannable and report remaining slots.
- Reserve must not assign.
- Make repeat calls idempotent.
- Add complete audit metadata and one notification.
- Emit management and personnel realtime refreshes.
- Refresh route contexts and all affected paths.

E. UI
- Change candidate action label from “Selecteer” to “Inplannen”.
- Remove/disable duplicate “Koppel” for a candidate with an active interest response.
- Show filled slot progress in success feedback.
- Refresh the planboard and assignment detail immediately.
- Make clear when a manual candidate without a poll response is merely linked versus fully scheduled.

F. Tests
At minimum:
- pure interval truth table, timezone and cross-midnight tests;
- running interval with injected now;
- planned values unchanged after actual execution;
- planning mapping uses actual interval;
- personnel list uses actual interval;
- selected response creates exactly one assigned link;
- repeated selection is idempotent;
- simultaneous selection does not silently overfill;
- requiredPersonnelCount > role count;
- role count > requiredPersonnelCount;
- partial slots retain plannable;
- final slot transitions to scheduled;
- active/final status not regressed;
- reserve does not assign;
- tenant A cannot select tenant B personnel;
- realtime event contract emitted;
- workflow notification emitted once;
- no migration unless existing schema is genuinely insufficient.

Add a dedicated gate/test script such as:
- fieldgrid:live-planning-consistency:check

Run:
- pnpm run typecheck
- relevant builds
- all new unit/contract tests
- existing planning, personnel, notification, security, and realtime tests
- fieldgrid:dashboard-ui-audit:check
- fieldgrid:uiux-master-gate:check

Update traceability PB-001..PB-014 with tests and evidence. Open a PR with before/after behavior and an explicit note that scheduled times remain preserved.
```

---

# 12. Codex Cloud prompt — W02 Datacorrectheid, permission-gating en legacycleanup

**Outputbranch:** `codex/fg-uiux-w02-correctness-permissions`

```text
Implement UX-001, UX-003, UX-004, and UX-012.

Spawn and wait for:
- one data-semantics subagent;
- one permission/module visibility subagent;
- one dead-code/placeholder scanner;
- one reviewer focused on trust and tenant isolation.

Required work:
1. Trace every object dashboard statistic from query to label. Correct the current semantic mismatches. Add tests proving each visible label maps to the intended field/formula. Do not guess; rename query fields or compute explicit values.
2. Audit customer, object, assignment, personnel, platform tenant, and other detail tab arrays. Build visible tab lists from permissions and enabled modules before rendering.
3. A user without permission must not see a clickable tab that renders nothing or a ForbiddenPage inside a dossier.
4. Hide all unreleased platform placeholder tabs/cards/routes from normal release UI behind explicit development/preview feature flags.
5. Remove hidden legacy headers, permanent `false &&` UI blocks, duplicate old implementations, and stale disabled markup from released components.
6. Remove misleading “volgt in fase”, “databron wordt later gekoppeld”, and similar user-facing placeholder copy.
7. Preserve route compatibility where external links may exist; redirect hidden placeholder routes to a sensible released parent or return a real not-found state.
8. Add static scans and component tests.
9. Update traceability.

Run full typecheck/build, relevant permission/security tests, page tests, and the master gate. Open PR to integration branch.
```

---

# 13. Codex Cloud prompt — W03 Responsive blockers en veilige mutaties

**Outputbranch:** `codex/fg-uiux-w03-responsive-safety`

```text
Implement UX-002, UX-005, UX-006, UX-010, UX-048, UX-050, UX-051, and the immediate responsive blockers.

Spawn and wait for:
- mobile layout auditor;
- form behavior auditor;
- mutation safety auditor;
- accessibility reviewer.

Required work:
1. Audit every backoffice and platform form grid. Narrow screens must use one column; only move to 2/3 columns at explicit sm/md breakpoints.
2. Make create/edit Sheets fullscreen or nearly fullscreen on narrow mobile, with safe-area-aware padding.
3. Add sticky form action footers with pending states.
4. Add start/end validation, duration feedback, and sensible time auto-fill where forms contain time ranges.
5. Add unsaved-changes protection using the canonical shadcn/Radix AlertDialog. Preserve focus return and never use raw browser dialogs for normal in-app navigation.
6. Make bulk action bars wrap safely or become mobile bottom action bars with an overflow menu.
7. Ensure all mobile touch targets are at least 44x44 px.
8. Add canonical shadcn/Radix AlertDialogs for destructive platform actions: delete/remove tenant access, revoke support access, lifecycle changes, destructive domain actions, and provisioning retry where risk exists.
9. Add pending, disabled, success, error, and retry feedback to platform server-action forms using shared shadcn controls and the canonical toast/inline-alert layer.
10. Add responsive tests at 320, 390, 430, 768, and 1024 for affected screens.
11. Replace affected custom/raw interactive controls only with existing canonical shadcn/Radix primitives; W04 owns the full primitive/token consolidation.
12. Update traceability and evidence.

Run typecheck, builds, relevant action tests, raw-dialog checks, responsive screenshot/static tests, and master gate.
```

---

# 14. Codex Cloud prompt — W04 Radix-first designsystem en accessibility foundations

**Outputbranch:** `codex/fg-uiux-w04-design-system`

```text
Implement UX-009, UX-031, UX-032, UX-033, UX-055 and RADIX-001 through RADIX-013 plus RADIX-019.

This is the canonical UI-architecture task. Radix UI must become the behavior/accessibility foundation; shadcn/ui must become the sole local primitive/component layer used by product features.

Spawn and wait for:
- Radix/shadcn architecture and import-boundary agent;
- token/style inventory agent;
- accessibility/contrast/focus agent;
- component API/CVA agent;
- visual quality and migration reviewer.

Required work:
1. Inventory:
   - everything under `components/ui` and existing shadcn components;
   - all direct `@radix-ui/react-*` imports;
   - raw/custom dialogs, overlays, menus, popovers, tooltips, selects, checkboxes, switches, radio groups, tabs, accordions, collapsibles and focus traps;
   - duplicate primitives and page-specific variants;
   - hardcoded colors, radii, shadows, typography, z-index and animation values.
2. Define and document the three-layer architecture:
   - canonical `components/ui` primitives;
   - Fieldgrid tenant/platform/domain compositions;
   - feature/page consumers.
3. Restrict direct Radix imports to the primitive/adapter layer. Add a static test/lint-like gate with a narrow documented allowlist.
4. Ensure canonical shadcn/Radix components exist and are production-ready for:
   - Button, Input, Textarea, Label and form feedback;
   - Dialog, AlertDialog and Sheet;
   - DropdownMenu, ContextMenu, Popover, Tooltip and HoverCard;
   - Select and searchable Combobox (`Command` + Popover/Dialog);
   - Checkbox, RadioGroup, Switch, Toggle and ToggleGroup;
   - Tabs, Accordion and Collapsible;
   - ScrollArea, Separator, Avatar, Badge/StatusBadge;
   - Card/Panel, Empty, Skeleton, Table and toolbar compositions;
   - canonical Sonner/toast integration.
5. Do not overwrite existing shadcn files blindly with CLI output. Diff, preserve Fieldgrid behavior, migrate deliberately and keep APIs typed.
6. Use CVA for variant families such as size, tone, density, destructive, selected and loading. Avoid page-level variant forks.
7. Standardize interaction states:
   - default, hover, focus-visible, active/pressed, open, selected, checked, disabled, loading, invalid and success;
   - Radix `data-state`, `data-side`, `data-disabled` and related attributes are the styling source where applicable.
8. Standardize overlay behavior:
   - focus entry/trap/return;
   - Escape and outside-interaction policy;
   - modal versus non-modal semantics;
   - portal container and one documented z-index scale;
   - scroll locking and nested overlay behavior;
   - collision-aware placement.
9. Document and test safe `asChild` usage. Prevent nested interactive elements and multiple roots.
10. Extend semantic tokens for:
    - brand structure/navy;
    - interactive primary teal;
    - official brand-mark green/success;
    - surfaces and elevation;
    - neutral, info, success, warning and danger;
    - planning match/block/warning;
    - actual-vs-planned deviation;
    - sidebar active foreground computed for contrast.
11. Implement tenant branding contrast validation. Choose black/white foreground automatically and surface configuration warnings.
12. Standardize visual scales:
    - spacing rhythm;
    - control/card/dialog radii;
    - compact/normal/comfortable density;
    - control heights including 44px touch minimum;
    - restrained elevation;
    - typography hierarchy;
    - 120–220ms functional motion with reduced-motion support.
13. Set a professional visual bar:
    - no generic admin-template styling;
    - no excessive gradients, glassmorphism, pills, shadows or nested card clutter;
    - clear hierarchy, precise alignment and restrained color usage.
14. Add `docs/uiux/radix-shadcn-architecture.md` and update `docs/uiux/component-registry.md` with ownership, import path, allowed use, variants and migration status.
15. Migrate shared primitives first and a representative tenant plus platform surface. Later tasks migrate the remaining screens.
16. Add deterministic fixture pages or stories covering all states and responsive sizes.
17. Add component tests for keyboard behavior, focus return, Escape, outside click, portal layering, `asChild`, reduced motion and variant consistency.
18. Do not globally change teal to green. Keep teal as interactive primary and official logo green as brand/success accent until an approved brand decision changes it.
19. Update every owned UX-* and RADIX-* traceability row.

Run typecheck, builds, import-boundary/static tests, contrast tests, component tests, axe/accessibility checks where available, visual snapshots and the master gate.
```

---

# 15. Codex Cloud prompt — W05 Navigatie, route registry en globale zoekervaring

**Outputbranch:** `codex/fg-uiux-w05-navigation-search`

```text
Implement UX-011, UX-013 through UX-018, and UX-036.

Spawn and wait for:
- tenant information architecture agent;
- platform information architecture agent;
- route/search explorer;
- keyboard/accessibility reviewer.

Required work:
1. Create one typed central route registry for tenant and platform routes containing title, breadcrumb, nav group, icon, permission, module/feature flag, help key, search context, and release visibility.
2. Refactor Sidebar, PlatformShell, DashboardHeader and route labels to consume the registry. Build grouped navigation with the canonical Radix/shadcn Collapsible, Tooltip and DropdownMenu components rather than page-specific menu behavior.
3. Group tenant navigation:
   - Dagelijkse operatie: Dashboard, Planning, Opdrachten
   - Relaties en locaties: Klanten, Objecten
   - Mensen en middelen: Personeel, Verlof, Materialen, Inventaris
   - Administratie: Offertes, Rapporten, Facturen, Documenten
   - Communicatie: Tickets, Nieuws
   - Beheer: Instellingen
4. Remove Map as a separate primary item; make it a Planning view.
5. Move Help, Releases, and Roadmap into support/account/what-is-new surfaces rather than the primary daily nav.
6. Group platform navigation:
   - Overzicht
   - Tenant lifecycle
   - Service
   - Product
   - Security & operations
   - Platformbeheer
7. Persist platform sidebar collapse like tenant sidebar.
8. Build a real global command/search palette opened by Ctrl/Cmd+K using the canonical shadcn `Command` inside Radix/shadcn `Dialog` (and `Popover` for inline searchable selectors):
   - search assignment code/title, customer, object, personnel and relevant finance entities subject to permission;
   - group results by entity;
   - expose commands such as New assignment, Planning today, Switch tenant;
   - show recent items when empty;
   - fully keyboard accessible.
9. Until global data is available, never label a context-only field “Snel zoeken”. Use precise context copy.
10. Remove duplicate route title sources and incomplete route arrays.
11. Prove Radix focus entry/return, Escape behavior, collapsed navigation keyboard flow, tooltip behavior in icon-only mode, and no nested interactive elements. Add navigation, permission, keyboard and responsive shell tests.
12. Update UX-* and RADIX-* traceability.
```

---

# 16. Codex Cloud prompt — W06 Radix/shadcn DataView en formulierprimitives

**Outputbranch:** `codex/fg-uiux-w06-data-form-primitives`

```text
Implement UX-020, UX-021, UX-034, UX-035, UX-038, UX-048, UX-049, UX-050, reusable parts of UX-010/UX-051, and RADIX-004 through RADIX-006, RADIX-011, RADIX-015 and RADIX-016.

Prerequisite: W04 merged. Consume its canonical primitives; do not create a second UI layer.

Spawn and wait for:
- table/list architecture agent;
- Radix filter/menu/combobox agent;
- form architecture agent;
- accessibility/focus/test agent;
- visual density reviewer.

Build a production-ready `FieldgridDataView` using shadcn composition and Radix controls:
- semantic desktop table through shadcn `Table`;
- tablet compact table/hybrid;
- mobile cards;
- sticky headers;
- sortable columns with `aria-sort`;
- row selection through canonical Checkbox;
- bulk action slot;
- row actions through DropdownMenu;
- filters through Sheet/Popover/Select/Combobox as appropriate;
- column chooser through DropdownMenu or Command;
- density through ToggleGroup;
- saved views through Popover/Dialog;
- pagination through canonical Buttons;
- result count;
- layout-preserving Skeletons;
- distinct no-data and no-filter-results Empty states;
- URL-synchronized filters and active filter chips;
- export overflow slot;
- full-row click with explicit quick-view/detail semantics.

Build shared form primitives on shadcn/Radix:
- responsive FormSection and FormGrid;
- canonical Label/Input/Textarea/form-message integration;
- Select for bounded choices;
- searchable Combobox from Command + Popover/Dialog;
- Checkbox, RadioGroup, Switch and ToggleGroup where applicable;
- sticky FormActions;
- UnsavedChangesGuard using AlertDialog;
- TimeRangeField with duration and validation;
- progressive “Meer opties” through Collapsible/Accordion;
- async submit feedback;
- mobile full-screen Sheet conventions;
- destructive actions through AlertDialog.

Requirements:
1. Feature/page code imports primitives through `@/components/ui` or approved Fieldgrid wrappers; no direct Radix imports.
2. Do not hand-roll overlay/focus/menu/select behavior.
3. Avoid a new dependency unless necessary and documented.
4. Do not migrate all pages in this task; provide fixtures and migrate one low-risk representative page.
5. Preserve server-side filtering and pagination.
6. Filter text fields use local state plus submit or 300–500 ms debounce; no router update on every keystroke without debounce.
7. Saved views are user-local first if no backend model exists; document persistence and provide a later server migration seam.
8. Every primitive supports default, hover, focus-visible, selected/open, disabled, loading and invalid states.
9. Test focus return, Escape, portal layering, overlay nesting, keyboard selection, touch sizes and reduced motion.
10. Add comprehensive component tests and responsive fixtures.
11. Update UX-* and RADIX-* traceability.
```

---

# 17. Codex Cloud prompt — W07 Overzichtspagina’s migreren

**Outputbranch:** `codex/fg-uiux-w07-overviews`

```text
Implement UX-019, UX-025, UX-026, UX-034 and page-level completion of the shared DataView migration.

Prerequisite: W06 merged.

Spawn and wait for one explorer/reviewer per domain:
- assignments;
- customers;
- objects;
- personnel.
Agents may inspect in parallel but the parent coordinates writes by file/domain to avoid shared-component conflicts.

Migrate all four overview domains to the canonical shadcn/Radix component stack. Remove raw/custom selects, dropdowns, checkboxes, menus, sheets and duplicated table controls. Use:
- TenantPageShell;
- TenantPageHeader;
- FieldgridDataView;
- standardized toolbar/filter chips;
- standardized empty/loading states;
- standardized pagination;
- responsive mobile cards;
- saved views and density/column controls where useful.

Specific requirements:
Assignments:
- result count, primary action, full-row detail behavior;
- next required workflow action visible;
- no duplicate custom table implementation.

Customers:
- keep common filters visible, move exports and secondary actions to More;
- preserve bulk actions and server-side exports.

Objects:
- use corrected W02 metrics;
- debounced/applied text filters;
- consistent selected rows and bulk actions.

Personnel:
- remove duplicate title;
- use shared shell/header;
- move capacity/flexpool widgets before or beside the list;
- default columns: name, role, region, availability, workload/next shift, portal, active status, actions;
- secondary fields available via column chooser;
- make quick-view behavior explicit.

Add responsive, keyboard, overlay/focus and accessibility tests for each domain. Remove superseded table/mobile-card and custom primitive code after parity is proven. Update UX-* and RADIX-* traceability.
```

---

# 18. Codex Cloud prompt — W08 Detaildossiers

**Outputbranch:** `codex/fg-uiux-w08-detail-dossiers`

```text
Implement UX-022 through UX-024, UX-039, UX-051, UX-052 and active-tab loading for customer/object/assignment details.

Spawn and wait for:
- customer dossier agent;
- object dossier agent;
- assignment dossier agent;
- performance/accessibility reviewer.

Required work:
1. Build visible tab lists from permission and module availability.
2. Make detail navigation sticky below the application header using one canonical route-aware Tabs adapter based on Radix Tabs semantics; preserve deep links and correct tab keyboard behavior.
3. Add fade/scroll controls on desktop and a compact section selector on very narrow mobile using canonical Select/Popover controls.
4. Load header data plus only active heavy tab data. Stream or lazy-load optional summary data; do not fetch every tab on every request.
5. Add prefetch only for likely adjacent tabs when safe.
6. Add a mobile sticky “Acties” button opening the canonical Radix/shadcn Sheet; preserve desktop sticky action aside and correct focus return.
7. Group customer dossier navigation into:
   - Overzicht
   - Operationeel
   - Financieel
   - Documenten
   - Communicatie
   - Historie
   Keep deep links backwards compatible through redirects/mapping.
8. Assignment tabs show workflow state, not only counts:
   - Offerte · Wacht op akkoord
   - Rapport · Ter controle
   - Factuur · Concept
9. Add a compact “Volgende stap” bar to assignment detail.
10. Remove old hidden assignment header/legacy detail markup.
11. Add unsaved-change protection for detail editors through the canonical AlertDialog.
12. Preserve permissions, tenant isolation, and existing URLs.
13. Add query-count/performance tests or instrumentation proving inactive tabs are not loaded.
14. Migrate dossier menus, tooltips, dialogs, selects and tabs to canonical shadcn/Radix wrappers; no direct Radix imports in feature files.
15. Update UX-* and RADIX-* traceability.
```

---

# 19. Codex Cloud prompt — W09 Tenantdashboard

**Outputbranch:** `codex/fg-uiux-w09-tenant-dashboard`

```text
Implement UX-043, UX-044, UX-045 and the tenant-dashboard visual hierarchy improvements.

Spawn and wait for:
- planner persona agent;
- administration persona agent;
- management persona agent;
- dashboard accessibility/performance reviewer.

Required work:
1. Preserve the action-first command-center concept.
2. Derive a role/persona-aware default layout:
   - Planner: unplanned work, conflicts, absence, capacity, route issues.
   - Administration: reports, invoices, payments, quotes.
   - Management: financials, capacity, SLA/customer risks.
3. Do not hide permitted data permanently; allow persona switch/customize or a sensible all-role fallback.
4. Give one primary attention panel visual priority; do not present every metric as equal.
5. Action items show owner/role, oldest waiting time, SLA/urgency, and direct next action where data exists.
6. Add “Doorgaan waar ik was” using recent entity/route state:
   - recent assignment;
   - customer/object;
   - last planning date/view;
   - unsaved or resumable concept where available.
7. Add lightweight personalization persistence without new backend schema unless justified.
8. Reduce card soup: use canonical Card/Panel, Separator, Tooltip and menu primitives with sections/dividers and restrained elevation.
9. Ensure first viewport remains calm at 1024 and 1440 widths.
10. Apply the W04 professional visual bar: exact spacing, disciplined typography, no one-off gradients/pills/shadows, and consistent interaction states.
11. Add role tests, permission tests, empty/loading states, Radix overlay/focus tests where used, and screenshots.
12. Update UX-* and RADIX-* traceability.
```

---

# 20. Codex Cloud prompt — W10 Geavanceerd planbord-UX

**Outputbranch:** `codex/fg-uiux-w10-planboard-ux`

```text
Implement UX-007, UX-008, UX-027 through UX-029, UX-046, UX-047 and saved-view behavior for planning.

Prerequisites: W01, W04, W05, W06 merged.

Spawn and wait for:
- planner workflow agent;
- keyboard/accessibility agent;
- tablet/mobile interaction agent;
- performance/optimistic-state agent;
- independent planning-domain reviewer.

Required work:

Radix/shadcn interaction architecture:
- zoom, density and view controls use canonical ToggleGroup;
- bounded filters/sorts use Select; searchable entity filters use Command + Popover;
- explanations and conflict reasons use Tooltip/Popover;
- queue/detail/mobile panels use Sheet or Dialog;
- risky override confirmations use AlertDialog;
- dropdown actions use DropdownMenu;
- contained queue/drawer scrolling may use ScrollArea, while the core timeline keeps purpose-built performant scrolling;
- no direct Radix imports or hand-built overlay/focus behavior in planboard feature files.

Desktop:
1. Default timeline to configured/relevant workday window, not 00:00–24:00.
2. Add “Volledige dag”.
3. Add zoom modes Compact/Normaal/Ruim/Werkdag passend.
4. Add row density Compact/Normaal/Ruim.
5. Persist user choices.
6. Make open work-order queue visible and collapsible with count of open slots, sorting, filters, and draggable cards.
7. Add optional detail drawer that does not obscure essential timeline context.
8. Show travel-time blocks, buffers, availability windows, breaks, and overtime/contract-hour warnings where data exists.
9. During drag hover show blocked/warning states and exact reasons before drop.
10. Provide a proposed nearest valid slot.
11. Implement optimistic move/schedule updates with undo and rollback on failure.
12. Stable personnel ordering:
    - explicit “Gesorteerd op beste match” indicator;
    - switch to retain fixed order;
    - sort options name/region/availability/load/match;
    - animated but non-disorienting row changes.

Keyboard:
- select a work order;
- choose personnel;
- move in 5/15-minute increments;
- confirm/cancel;
- announce slot, employee, warnings and conflicts;
- no critical function depends on mouse drag.

Tablet:
- employee list + focused time window;
- pointer/long-press support only as enhancement;
- queue and detail as drawers.

Mobile:
- do not shrink the Gantt;
- day agenda;
- expandable employee schedules;
- separate unplanned list;
- flow: choose work order -> choose employee -> choose time -> confirm;
- 44px targets and safe-area bottom actions.

Performance:
- avoid full board refresh for every local visual tick;
- virtualize/contain rendering if data scale requires it;
- prove acceptable behavior with large deterministic fixtures.

Add comprehensive interaction tests, Radix overlay/focus tests, visual fixtures, keyboard tests, and update UX-* plus RADIX-017/RADIX-020 traceability.
```

---

# 21. Codex Cloud prompt — W11 Platformbeheer vereenvoudigen

**Outputbranch:** `codex/fg-uiux-w11-platform`

```text
Implement UX-014, UX-017, UX-023, UX-030, UX-032, UX-053 and platform-specific safety/consistency.

Prerequisites: W04, W05, W06 merged.

Spawn and wait for:
- platform dashboard/IA agent;
- tenant lifecycle/detail agent;
- forms/security agent;
- performance/accessibility reviewer.

Required work:

Platform shell:
1. Consume central route registry and grouped navigation.
2. Persist sidebar collapse.
3. Use canonical Fieldgrid mark in collapsed mode.
4. Harmonize primitives/tokens with tenant backoffice while retaining denser platform information presentation. Replace plain/raw platform buttons, selects, checkboxes, dialogs, tabs, collapsibles and menus with the canonical shadcn/Radix stack.

Platform dashboard:
1. Keep only:
   - platform health;
   - attention actions;
   - tenant risks;
   - recent security events;
   - active onboarding/provisioning summary;
   - latest release;
   - primary quick actions.
2. Remove the full onboarding wizard.
3. Remove complete tenant/platform-user/support tables.
4. Link to dedicated routes.

Tenant list:
- shared filter pattern;
- common filters visible, advanced filters in drawer;
- active chips;
- saved views for domain problems, past due, provisioning blocked, expiring trial;
- hybrid tablet layout;
- translated statuses;
- full-row navigation.

Tenant detail:
Group into:
- Overzicht
- Plan en scope
- Domein en merk
- Gebruikers en toegang
- Operations
- Communicatie

Maintain compatibility for old tab URLs through the canonical route-aware Radix Tabs adapter.

Performance:
- fetch only active tab data;
- do not load all platform users, audit, grants, provisioning and modules on every tab.

Support access:
- Dutch user terms;
- duration presets 30m/1h/4h/end of day/custom;
- explicit tenant, user, reason, expiry, timezone and audit warning;
- confirm before grant/revoke through AlertDialog;
- pending/success/error states;
- Select, Checkbox, Dialog/Sheet, DropdownMenu, Accordion/Collapsible and Tooltip come from the canonical shared layer.

Hide unfinished tickets/notifications until feature-ready.

Replace raw English UI values: tenant, owner, grant, revoke, readiness, retry, smoke where a Dutch user term is appropriate; preserve technical identifiers in detail/audit views.

Add platform security, permission, performance, responsive, keyboard, focus-return, overlay and action tests. Update UX-* and RADIX-* traceability, especially RADIX-014.
```

---

# 22. Codex Cloud prompt — W12 Login en authenticatie-UX

**Outputbranch:** `codex/fg-uiux-w12-login-auth`

```text
Implement UX-040, UX-054 and login consistency.

Prerequisite: W04 merged.

Spawn and wait for:
- responsive login agent;
- auth/accessibility agent;
- branding/whitelabel reviewer.

Required work:
1. Change English metadata and awkward copy to correct Dutch.
2. Replace fixed viewport layout with min-height 100dvh, safe-area support, and vertical scrolling under mobile keyboard/small landscape.
3. Make controls at least 44px high on touch devices.
4. Preserve safe next-path behavior and all auth/security logic.
5. Add a refined desktop split layout with restrained Fieldgrid product/brand context; collapse to the focused form on mobile.
6. Support tenant whitelabeling and automatic contrast from W04.
7. Do not expose dev accounts outside development.
8. Standardize error, success, loading, password visibility and forgot-password interactions with the canonical shadcn form, alert and button components; do not keep a separate login-only primitive system.
9. Apply the W04 professional visual bar: precise split layout, restrained brand treatment, consistent radii/elevation, and no decorative template effects.
10. Test narrow mobile, keyboard navigation, high zoom, long tenant names, errors, whitelabel contrast, focus-visible and disabled/loading states.
11. Update UX-* and RADIX-* traceability.
```

---

# 23. Codex Cloud prompt — W13 Microcopy, states, analytics en polish

**Outputbranch:** `codex/fg-uiux-w13-content-states`

```text
Implement UX-030, UX-037, UX-038, UX-041, UX-042, UX-056 and UX-057 after the main screen migrations.

Spawn and wait for:
- terminology/microcopy agent;
- empty/loading/error state agent;
- analytics/privacy agent;
- final visual consistency reviewer.

Required work:
1. Add docs/uiux/terminology.md with canonical Dutch terms:
   - Opdracht vs Werkbon;
   - Organisatie vs technical tenant;
   - Eigenaar vs owner;
   - Supporttoegang vs grant;
   - Gereedheid vs readiness;
   - status translations.
2. Apply terminology across released tenant/platform metadata and UI.
3. Replace generic empty states with the canonical shadcn `Empty` composition:
   - no data;
   - no filter results;
   - no permission;
   - recoverable error;
   each with a useful next step.
4. Add layout-preserving canonical Skeletons for dashboards, lists, detail headers/tabs and planning.
5. Add recent-items and resumable-context polish where W09 introduced it.
6. Add privacy-safe UX analytics events for:
   - search submitted/result selected;
   - filter applied/cleared;
   - saved view;
   - form started/completed/abandoned;
   - mutation error category;
   - planboard move/undo;
   - command palette use.
7. Do not log query contents, PII, addresses, notes, signatures, auth data or secrets. Hash/aggregate only where necessary.
8. Create an event schema and tests.
9. Remove duplicate one-off alerts, toasts, tooltips, empty states and status treatments in favor of the canonical shadcn/Radix layer.
10. Remove duplicate, raw-English, implementation-oriented, or inconsistent copy.
11. Perform a final professional visual-polish pass against RADIX-019 and update UX-* plus RADIX-* traceability.
```

---

# 24. Codex Cloud prompt — W14 Volledige QA, Radix-compliance, accessibility, performance en visual regression

**Outputbranch:** `codex/fg-uiux-w14-qa-gates`

```text
Implement UX-058, UX-059, UX-060 and prove all prior work.

Do not primarily redesign features. This task is an adversarial quality pass.

Spawn and wait for at least seven read-only/reviewer subagents:
1. Accessibility.
2. Responsive/overflow.
3. Security/tenant isolation.
4. Planning/workflow correctness.
5. Performance/data loading.
6. Visual/design consistency.
7. Radix/shadcn primitive, overlay and import-boundary compliance.

Review the complete integration branch and fix every confirmed P0/P1 issue.

Required test matrix:
- widths: 320x568, 390x844, 430x932, 768x1024, 1024x768, 1280x800, 1440x1100, 1920x1080;
- roles: platform owner/admin/support, tenant management/planner/administration, customer, personnel;
- states: populated, empty, filtered-empty, loading, error, long names, 99+ badge, many active filters, banners open, offline/realtime reconnect;
- keyboard-only critical flows;
- 200% browser zoom;
- touch-target checks;
- page-level horizontal overflow;
- focus visibility and focus order;
- aria-sort and tab semantics;
- contrast including whitelabel colors;
- no raw browser dialogs;
- no hand-built replacement for an available Radix/shadcn primitive;
- no direct `@radix-ui/react-*` import outside approved shared primitive/adapter paths;
- no non-allowlisted raw select/checkbox/switch/menu/dialog implementations in released product screens;
- Dialog/AlertDialog/Sheet/Dropdown/Popover/Select/Tabs pass focus entry, trap where modal, Escape, outside-interaction, focus-return and portal-layering tests;
- no nested buttons/links caused by unsafe `asChild`;
- all open/closed/checked/selected/disabled/loading/invalid states are visually coherent;
- reduced-motion behavior is verified;
- no placeholder UI;
- no hidden legacy;
- no forbidden-audience links;
- no PII in analytics/logs.

Critical E2E contracts:
1. Planned 11:00–12:00; actual start 09:22; board/personnel show 09:22–nu.
2. Actual complete 09:44; board/personnel show 09:22–09:44 and planned time remains available.
3. Interest candidate selected; assigned link exists; final required slot sets scheduled; planboard/personnel update.
4. Reserve does not assign.
5. Mobile can plan without drag.
6. Keyboard can plan without mouse.
7. Unsaved form warns.
8. Destructive platform mutation confirms and reports status.

Performance:
- prove inactive dossier tabs are not eagerly queried;
- prove board minute tick does not force DB writes;
- use realistic large fixtures;
- document measured server/query/render improvements.

Extend existing visual and final gate scripts rather than creating disconnected checks.

Run every relevant repository gate, full typecheck/build, recursive security/domain tests, UI contracts, Radix import/primitive compliance checks, visual regression checks and the UI/UX master gate. Update every PB-*, UX-* and RADIX-* traceability row with evidence.
```

---

# 25. Codex Cloud prompt — W15 Integratie en main-releasegate

**Outputbranch:** `codex/fg-uiux-w15-integration`  
**Base:** latest integration branch  
**Doel:** finale reparaties; daarna PR van `codex/fieldgrid-uiux-master` naar `main`

```text
Act as release integrator for the complete Fieldgrid UI/UX program.

First spawn and wait for parallel read-only agents:
- traceability auditor;
- diff conflict/duplication auditor;
- migration auditor;
- P0/P1 code reviewer;
- documentation/evidence auditor;
- final test-log auditor.

Tasks:
1. Verify every PB-*, UX-* and RADIX-* item is DONE with PR, test and evidence references.
2. Search for duplicate implementations, stale compatibility code, hidden legacy UI, hardcoded canonical colors, placeholder copy, inaccessible tabs, raw dialogs, custom replacements for Radix/shadcn primitives, direct Radix imports outside the approved layer, unsafe `asChild`, overlay z-index hacks and inconsistent component states.
3. Verify all feature branches were merged to codex/fieldgrid-uiux-master and no accepted commit exists only on an abandoned branch.
4. Verify migrations are ordered, forward-only, tenant-safe and documented.
5. Resolve all integration regressions.
6. Run:
   - pnpm run typecheck
   - pnpm -r --if-present run build
   - all recursive domain/security tests
   - UI contract tests
   - migration order check
   - dashboard UI audit strict/static portions available without staging auth
   - visual regression check
   - Radix/shadcn import-boundary, primitive and overlay compliance checks
   - all new W01–W14 gates
   - fieldgrid:uiux-master-gate:strict
7. Request Codex GitHub code review and resolve every P0/P1 finding.
8. Produce docs/uiux/final-main-release-report.md:
   - backlog completion;
   - PR/commit map;
   - migrations;
   - tests;
   - known non-release-blocking observations only;
   - staging test plan;
   - Radix/shadcn compliance summary and approved exceptions;
   - rollback.
9. Open the final PR codex/fieldgrid-uiux-master -> main.
10. Do not merge if any required check, evidence row, review or acceptance item is missing.

The final response must state either:
- READY FOR MAIN MERGE with complete evidence; or
- BLOCKED with exact unresolved items.
Never call it ready based on best effort.
```

---

# 26. Codex Cloud prompt — W16 Stagingpromotie en live DB-acceptatie

**Outputbranch:** `release/fieldgrid-uiux-staging-YYYYMMDD`  
**Base in Cloud UI:** `staging`  
**Voorwaarde:** W15 is naar `main` gemerged.

```text
Promote the accepted Fieldgrid UI/UX release from main to staging. Production is out of scope.

Branch procedure:
1. Fetch origin.
2. Create release/fieldgrid-uiux-staging-YYYYMMDD from the latest origin/staging.
3. Merge origin/main into the release branch with a normal merge commit.
4. Resolve only documented staging/environment differences.
5. Never introduce a staging-only feature fix. If product code needs fixing, stop, create a main-based fix branch, merge it to main, then restart/rebuild the release candidate.

Before opening the staging PR:
- run typecheck/build/static gates;
- run migration order and schema checks;
- list every migration that will apply;
- verify no destructive/unreviewed migration;
- verify environment-variable expectations.

Open PR to staging and monitor CI/deploy.

After deployment, run the full live acceptance suite using staging auth/evidence:
1. Apply migrations exactly once.
2. Runtime safety and RLS/security gates.
3. Staging smoke and promotion gates.
4. Dashboard UI audit for platform, tenant, customer and personnel at all required viewports.
5. Customer/personnel final gate.
6. Live planboard actual-time scenario.
7. Live interest-selection-to-scheduled scenario.
8. Mobile/touch alternative planning.
9. Keyboard planning.
10. Permission-aware tabs.
11. Critical platform confirmations.
12. Visual snapshots and overflow checks.
13. Realtime start/complete/select events across separate sessions.
14. Offline personnel action sync for start/complete and eventual board correction.
15. No migration drift or failed background jobs.
16. Live Radix overlay acceptance: focus trap/return, Escape, nested menu/dialog behavior, mobile Sheet, Select/Combobox keyboard flow and z-index with banners/header.
17. Visual approval confirms the result is consistently strak, sober and professional across platform and tenant backoffices.

Store evidence under the configured output directory and link it in docs/uiux/staging-acceptance-report.md.

Failure policy:
- Do not patch staging directly.
- Record exact reproduction, logs without secrets, failed traceability IDs and rollback/deactivation steps.
- Create a main-based fix branch.
- Re-promote after main is green.

Success policy:
- Mark every staging column in traceability DONE.
- Run fieldgrid:uiux-master-gate:strict with staging evidence.
- Request Codex code review on the staging PR.
- Resolve all P0/P1 findings.
- Merge to staging only when the report says STAGING ACCEPTED.
- Do not create or update any production branch/deployment.
```

---

# 27. Master-orchestrator prompt

Deze prompt is bedoeld voor een langlopende Codex Cloud-taak die de integratiebranch bewaakt. Hij vervangt de afzonderlijke werkpakketten niet; hij controleert afhankelijkheden en integratie.

```text
You are the Fieldgrid UI/UX program orchestrator.

Repository: veele-services/platform
Program branch: codex/fieldgrid-uiux-master
Source branch: main
Test branch: staging
Production: out of scope

Read AGENTS.md and the complete docs/uiux masterplan.

Use subagents for:
- current dependency/PR graph;
- traceability audit;
- overlapping-file/conflict risk;
- test/evidence status;
- migration status.

Your responsibilities:
1. Keep codex/fieldgrid-uiux-master fast-forward/current with accepted work.
2. Enforce the work-package dependency graph.
3. Do not merge a work-package PR with failing checks, unresolved P0/P1 review findings, missing PB/UX/RADIX traceability updates, or incomplete acceptance.
4. Detect overlapping writes before parallel tasks start and serialize conflicting work.
5. After each merge, run the integration smoke/typecheck set and update docs/uiux/program-status.md.
6. Reject “partial”, “follow-up later”, placeholder, or TODO-based completion.
7. Ensure no feature task targets main or staging directly.
8. Ensure DB migrations are forward-only and only live-tested during W16.
9. Ensure the W01 runtime planning rules remain invariant through later UI refactors.
10. Enforce Radix-first shadcn/ui architecture: canonical import boundaries, no duplicate primitives, no raw custom overlays, and consistent professional visual quality.
11. At the end, invoke the W15 releasegate process. Do not declare the program done before W16 staging acceptance.

Return on every run:
- merged work packages;
- blocked work packages;
- dependency state;
- failing tests;
- traceability completion percentage;
- next exact task prompts that may safely start in parallel.
```

---

# 28. PR-template voor alle werkpakketten

```md
## Werkpakket

WNN — naam

## Backlog

- PB/UX IDs:

## Samenvatting

Wat is functioneel veranderd?

## Belangrijkste bestanden

- pad — reden

## Database

- Geen migratie
  of
- Nieuwe forward-only migratie(s):
- Tenant/RLS-impact:
- Staging apply plan:

## Responsive bewijs

- 320:
- 390:
- 430:
- 768:
- 1024:
- 1280:
- 1440:
- 1920:

## Accessibility

- Keyboard:
- Screenreader/ARIA:
- Focus:
- Contrast:
- Touch:

## shadcn/ui + Radix compliance

- [ ] Canonieke componenten uit `@/components/ui`/goedgekeurde wrappers gebruikt
- [ ] Geen directe Radix-import in feature/pagecode
- [ ] Geen handgemaakte vervanging voor beschikbare primitive
- [ ] Dialog/Sheet/Menu/Popover/Select/Tabs focus, Escape en focus-return getest
- [ ] `asChild` semantisch veilig; geen nested interactive elements
- [ ] Portal/z-index en reduced motion gecontroleerd
- [ ] Professionele visual bar en alle interaction states gecontroleerd
- Afwijkingen/allowlist met motivatie:

## Tests

- [ ] typecheck
- [ ] build
- [ ] task-specific unit tests
- [ ] domain/security tests
- [ ] visual/static gate
- [ ] master gate

Commands and results:

## Risico en rollback

- Risico:
- Rollback/feature flag:

## Traceability/evidence

- IDs bijgewerkt:
- Evidencepaden:

## Review

- [ ] Self-review
- [ ] Subagent reviewer
- [ ] @codex review
- [ ] Geen open P0/P1
```

---

# 29. Harde finale Definition of Done

De gehele opdracht is pas afgerond wanneer:

1. Alle PB-001 t/m PB-014 zijn live bewezen.
2. Alle UX-001 t/m UX-060 zijn DONE.
3. Alle RADIX-001 t/m RADIX-020 zijn DONE met code-, test- en visual evidence.
4. `main` bevat alle geaccepteerde code en migraties.
5. `staging` bevat exact de geaccepteerde main-release plus gedocumenteerde environmentconfiguratie.
6. Geen featurefix bestaat alleen op staging.
7. Alle migraties zijn toegepast en de migratievolgorde is groen.
8. Typecheck en alle builds zijn groen.
9. Alle security-, RLS-, domain-, UI-contract-, Radix-compliance-, visual- en staginggates zijn groen.
10. Planbord start/complete/select werkt realtime in twee gelijktijdige sessies.
11. Personeelsplanning toont dezelfde werkelijke tijden als het planbord.
12. Geplande tijden zijn niet verloren of overschreven.
13. Interesse-selectie is atomair, idempotent, concurrency-safe en zichtbaar op planbord.
14. Mobiel kan plannen zonder desktopdrag.
15. Keyboard-only planning werkt.
16. Geen onbedoelde horizontale overflow op de volledige viewportmatrix.
17. Geen zichtbaar placeholderproduct.
18. Geen tab zonder permissie.
19. Geen destructieve kritieke actie zonder canonieke AlertDialog, bevestiging en feedback.
20. Geen raw Engelse producttermen buiten technische/auditcontext.
21. Geen hardcoded canonical brandkleuren buiten allowlist.
22. Geen permanente verborgen legacy-UI.
23. Geen open TODO/FIXME gekoppeld aan dit programma.
24. Feature- en paginacode bevat geen directe `@radix-ui/react-*`-imports buiten de goedgekeurde primitive/adapterlaag.
25. Er bestaan geen pagina-specifieke custom dialogs, sheets, dropdowns, popovers, tooltips, selects, checkboxes, switches, radio groups, tabs, accordions, collapsibles of focus traps wanneer een canonieke primitive beschikbaar is.
26. Alle Dialogs, AlertDialogs, Sheets, Menus, Popovers, Selects en Tabs voldoen aan focus entry/return, Escape, modaliteit, portal/z-index, keyboard en screenreaderacceptatie.
27. `asChild` veroorzaakt nergens geneste interactieve elementen of ongeldige semantiek.
28. Alle primitives hebben consistente default, hover, focus-visible, open/selected, disabled, loading, invalid en destructive states.
29. Alle motion respecteert `prefers-reduced-motion`.
30. `docs/uiux/radix-shadcn-architecture.md` en `docs/uiux/component-registry.md` zijn actueel en alle afwijkingen zijn expliciet goedgekeurd.
31. Platform-, tenant-, customer- en personnel-surfaces gebruiken dezelfde primitive- en tokenlaag met alleen bewust verschillende informatiedichtheid.
32. Een onafhankelijke visual review bevestigt dat de interface strak, netjes, sober en professioneel is en niet oogt als een generieke admin-template.
33. Iedere PR heeft Codex review gehad en geen open P0/P1.
34. De traceability matrix bevat PR, test, evidence en stagingresultaat voor ieder PB-, UX- en RADIX-ID.
35. `docs/uiux/staging-acceptance-report.md` eindigt met `STAGING ACCEPTED`.
36. Productie is niet gewijzigd.

---

# 30. Praktische startvolgorde in Codex Cloud

1. Start W00 op `main`.
2. Selecteer daarna `codex/fieldgrid-uiux-master` als basis voor W01, W02 en W03.
3. Merge die drie PR’s pas na afzonderlijke review.
4. Start W04 Radix-first design system en W05 volgens afhankelijkheden.
5. Start W06 Radix/shadcn primitives en W12.
6. Start W07, W08, W09 en W11.
7. Start W10 en W13.
8. Start W14.
9. Laat W15 de integratiebranch vrijgeven naar main.
10. Start W16 vanaf staging nadat main is gemerged.

Bij iedere nieuwe Cloud-taak moet eerst worden gecontroleerd dat de geselecteerde basisbranch de laatste gemergede afhankelijkheden bevat.
