# 08 — Codex-masterprompt

Kopieer de onderstaande opdracht naar de implementerende Codex-run. Voeg alleen het concrete werkpakketnummer en, indien al beschikbaar, de actuele UIUX-master-SHA toe.

---

Je implementeert **Fieldflow Calm** voor de Fieldgrid tenant-backoffice. Dit is geen vrije restyle. Het goedgekeurde ontwerp, de volledige route-/actiepariteit, tenanttheming, whitelabeling, responsive gedrag, security en runtimebewijs vormen samen één contract.

## Autoriteit

Lees vóór iedere wijziging volledig:

1. `AGENTS.md`;
2. `docs/uiux/fieldflow-calm-handoff/README.md`;
3. alle genummerde documenten in die map;
4. `manifests/fieldflow-tokens.json`;
5. `manifests/theme-derivation.json` en `reference/theme-derivation.mjs` — de uitvoerbare autoriteit voor raw tenanttheme naar semantische tokens;
6. `manifests/component-states.json` — de uitputtende zichtbare component-, overlay- en feedbackstates;
7. `manifests/component-source-coverage.json` — de AST-exacte classificatie van iedere gedeelde UI-export en de koppeling met state-, route- en contractdekking;
8. `manifests/routes.json`;
9. `manifests/production-inventory.json` — de enige autoriteit voor bestaande features, acties en gates;
10. `manifests/acceptance.json`;
11. `manifests/surfaces.json` — de uitputtende whitelabeloppervlakken en native grens;
12. `manifests/risks.json` — de blokkerende risico- en bewijslifecycle;
13. `manifests/contract-root.json` en de vertrouwde base-workflow `.github/workflows/fieldflow-calm-contract-root.yml` — de extern geregistreerde integriteitsroot, inclusief validator-, test-, workflow- en volledige dependency-inputclosure; wijzig of roteer deze nooit binnen een gewone implementatie- of bewijspromotie-PR;
14. `evidence/visual/manifest.json`;
15. `evidence/visual/capture-contract.json` en de daarin in vaste volgorde gehashte `evidence/visual/canonical-theme.css` en `evidence/visual/reference-normalization.css`;
16. `evidence/prototype/source-manifest.json` en de daarin gehashte sourcearchive;
17. de bestaande UIUX-, theming-, security- en release-documenten die het README noemt.

Bij conflict geldt de autoriteitsvolgorde uit `00-BRON-EN-BESLUITEN.md`.

## Eerst controleren

1. Toon branch, HEAD, worktree en relevante remote refs.
2. Werk nooit op `main` of `staging`.
3. Bewijs dat de implementatiebasis de actuele `main` gecontroleerd bevat; zo niet, voer eerst W00-branchsync via een PR uit.
4. Voer `pnpm fieldgrid:fieldflow-calm-handoff:check` uit.
5. Controleer dat `contract-root.json#rootSha256` exact de beschermde Environment-variable is en dat de stabiele eindjob `Fieldflow Calm contract root` groen is; stop bij ontbrekende bootstrap, rootdrift, een gewijzigde root-workflow of een skipped/cancelled/denied verificatiejob. De eindjob moet via `always()` uitsluitend een echte `success` van de afzonderlijke protected-baseverificatie accepteren.
6. Leg de bestaande test-/visualbaseline van je scope vast. Voor de W00-prototypebaseline volg je `capture-contract.json` letterlijk: maak nooit zelf vrije evidencevelden. De achttien scenariorecords bestaan uit negen canonieke desktop-pixelsets met elk scenario-, contract-, runtime-errors-, Axe- en capture-JSON, plus negen mobiele productie-evidencesets met elk DOM-, geometry-, computed-styles-, setup-, runtime-errors-, Axe-, keyboard- en touch-JSON. Zet pas via een latere promotion-PR `BASELINE_READY` na inhoudelijke validatie van alle achttien records, live PR/run/job/reviewverificatie op de historische capture-HEAD en een geldige PNG Artifact Attestation van de al vertrouwde baselineworkflow.
7. Inventariseer alle files, routes, actions, permissions, modules, queryparameters, localStoragekeys, events en side effects binnen je werkpakket.
8. Controleer bestaand gebruikerswerk in de worktree en behoud unrelated wijzigingen.
9. Verifieer bronkoppelingen op de gepinde platformblob: start bij het exacte page-exportsymbool, volg alleen werkelijk gebruikte declaratieclosures en leg per actie de UI-handler/navigatie/state-witness plus het exacte Server Action-call- of `formAction`-target vast.
10. Behandel iedere kandidaatcheckout in protected verificatie als aanvallergestuurde data: voer, importeer of `source` nooit kandidaat-JavaScript, Actions, packageconfiguratie, lifecyclehooks, builds of tests. Accepteer alleen een exacte, schone kandidaat-SHA die afstamt van de exacte base en uitsluitend reguliere Git-blobs bevat; symlinks, submodules, niet-reguliere modes en filesystemresolutie buiten de Git-objectgrens zijn rood.

## Niet onderhandelen

- Alleen Fieldflow Calm; geen conceptswitcher of andere ontwerpen.
- Exacte rustige spacing en geometrie uit de tokens.
- Desktop-first en volledig responsive op 320, 390, 430, 768, 1024, 1280, 1440 en 1920.
- Alle controls/hitareas minimaal 44×44.
- Geen documentbrede horizontale overflow.
- Alle huidige productiefeatures en deeplinks behouden.
- Server Components/Actions blijven tenant-, permission- en moduleautoriteit.
- Alleen een top-level geëxporteerde `async` callable in een echte `"use server"` directive-proloog geldt als Server Action; modulebereikbaarheid zonder def-use- of action-owner-witness geldt nooit als bewijs.
- Geen businesslogicfork voor Fieldflow.
- Alleen canonical `@/components/ui` en `@/components/tenant-ui`.
- Geen native browserdialogs.
- Geen status alleen via kleur.
- Geen hardcoded tenantbrandkleur in productcomponenten.
- Tenantprimary verandert geen semantische status- of planbordbetekenis.
- Radix-portals erven het effectieve tenantthema.
- Whitelabel lekt geen Fieldgridnaam/asset op tenant-facing surfaces wanneer geactiveerd.
- Geen `.tenant-admin-compact` of globale class-name spacing rewrite in de Fieldflowboom.
- Geen nieuwe schemawaarde voor UI-versieselectie. W01 voert wel de vooraf
  gecontracteerde forward migration uit voor expliciete assetmodes, monotone
  `theme_revision` en immutable document-appearance-snapshots, met lege-DB-,
  upgrade-, backfill-, rollback- en tenantisolatiebewijs.
- Geen onafgemaakte knop, inert tab, placeholder of uitgesteld kernscenario.
- Geen baseline-update zonder expliciete review.
- Geen wijziging aan `package.json`, lockfile, workspaceconfiguratie, `.npmrc`, pnpmfile-/installhooks of patches buiten een afzonderlijke contract-rootrotatie; de volledige dependency-inputclosure is normatief gehasht.
- Geen lifecycleclaim die gelijk blijft maar bewijs wijzigt, een state overslaat of terugzet. Alleen exact één voorwaartse stap per PR is toegestaan.

## Uitvoering

Implementeer uitsluitend het aangewezen werkpakket uit `06-IMPLEMENTATIERUNBOOK.md`, inclusief de afhankelijkheden die aantoonbaar nog ontbreken.

Voor iedere route/capability/action:

1. Koppel de exacte route-, capability- en action-ID’s uit beide manifesten aan de relevante acceptance-ID’s.
2. Hergebruik bestaande loader/Server Action.
3. Bereken zichtbaarheid per specifieke permission en module.
4. Bouw default, loading, empty, filtered-empty, forbidden, not-found, pending, success, validation, servererror, stale en offline/realtime state waar relevant.
5. Bouw desktop, compact desktop, tablet en telefooncompositie.
6. Verifieer muis, keyboard en touch.
7. Controleer tenant default/platform/Enterprise custom.
8. Voeg unit/integration/browser/visual tests toe.
9. Eindig de implementatie-PR op immutable implementation HEAD **C** en produceer alle runtime-/staging-/releasebewijzen, attestaties en reviews exact op **C**. Registreer de gehashte index en precies één lifecycleovergang pas in een latere, smalle promotion-PR op HEAD **D**, waarbij **C** ancestor van **D** blijft.

## Thema en whitelabel

- Gebruik de bestaande resolver als uitgangspunt.
- Scheid eligibility, tenant override en white-labelpresentatie expliciet.
- Theme SSR vóór render; portal-safe.
- Leid semantische tokens deterministisch af.
- Test contrast op alle states.
- Gebruik echte tenant assets met server-side ownership.
- Test missing/broken/wide logo en lange naam.
- Test tenant A→B→A zonder stale style/data.
- Zoek alle tenant-facing Fieldgrid/defaultkleurlekken.
- Behoud juridische document snapshots.
- Als securitypolicy, storageownership, SSRF of roledatareconciliatie een migratie vereist: stop het visuele werkpakket, maak een apart gecontroleerd hardeningplan en volg de migratieregels. Verberg dit nooit in CSS/UI.

## Planbord

Volg `04-PLANBORD.md` letterlijk:

- horizontale uren/verticale medewerkers;
- kwartiersnap;
- pointeroffset;
- typed pastel/status;
- queue↔board;
- expliciet unassign versus release;
- één pure client/server placementengine;
- alleen plannable/scheduled movable;
- geen verborgen rebalancing;
- versioned/idempotent mutation;
- echte optimistic update/rollback;
- volledige version-safe undo;
- tenantgescopeerde realtime;
- planned en actual apart;
- Europe/Amsterdam;
- echte week;
- day/month/map via gedeelde regels;
- volledig non-drag mobile;
- keyboard en announcements.

Een gewone drop mag geen tweede opdracht stil wijzigen.

## Review tijdens uitvoering

Gebruik parallelle read-only agents voor:

- route/action/permission parity;
- theme/whitelabel/tenantisolatie;
- planbord/domeininvarianten;
- responsive/accessibility/visual parity;
- tests/release/rollback.

Laat een agent geen bestand wijzigen dat een andere agent tegelijk bewerkt. Integreer feedback zelf. Na implementatie:

1. self-review diff;
2. aparte onafhankelijke P0/P1 functioneel/securityreview;
3. aparte onafhankelijke visual/a11yreview;
4. los alle P0/P1 op;
5. herhaal tests na iedere fix.

## Tests

Voer minimaal de per-PR- en domeingates uit hoofdstuk 07 uit. Voor integratie voer je de volledige integratiegate uit.

Browserbewijs moet:

- echte runtime + authfixtures gebruiken;
- nul `manual`/niet-uitgevoerd bevatten;
- iedere route/action/state/role/theme/viewport uit scope dekken;
- console/page/request/server/hydrationerrors verzamelen;
- overflow/touch/contrast/Axe/keyboard meten;
- screenshots/traces op exacte implementation HEAD **C** opslaan.

## Traceability

Voor ieder geraakt requirement:

```json
{
  "id": "FFC-...",
  "state": "VERIFIED_LOCAL",
  "evidence": {
    "commit": "0123456789abcdef0123456789abcdef01234567",
    "index": "outputs/fieldflow-calm/FFC-example.evidence.json#sha256=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
  }
}
```

De gehashte v2-index volgt exact `acceptance.json#evidenceContract.indexSchema`: `subjectId`, `verification` en `headCommit` zijn exact het requirement en de historische implementation HEAD **C** in `evidence.commit`; ieder codepad is een werkelijk in de implementatie-PR gewijzigd bestand met blob-SHA-256 op **C**. Gebruik uitsluitend de vaste command-ID’s en exacte commandregels uit de catalogus, inclusief `--evidence-subject` en het bijbehorende gehashte rapportpad. Vrije shellcommands zoals `true`, `echo` of een los `pnpm test` zijn nooit bewijs.

Een runtime-/stagingclaim bevat exact één machineleesbaar, door de trusted base-workflow geattesteerd JSON-rapport. Controleer dat dit rapport hetzelfde subject, implementation HEAD **C**, verification en provenance bindt, de gedeclareerde routes (wildcards volledig uitgebreid), themes, viewports en densities exact dekt, command-/test-ID’s koppelt, uitsluitend geslaagde assertions bevat, nul failed/skipped/notRun/manual rapporteert en alle vijf errorchannels leeg heeft. Controleer de verplichte attachments en hun hashes. De validator moet de Git-ancestry, ongewijzigde trusted workflow op implementatiebase én **C**, historische succesvolle GitHub Actions-run/job en GitHub Artifact Attestation live verifiëren; API-/attestationfouten zijn rood.

Noem iets alleen `VERIFIED_LOCAL` na een live GitHub `APPROVED` review op exact implementation HEAD **C** met de vereiste `FIELDFLOW-EVIDENCE`-bodymarkering, een andere login dan `authorId` en volledige subject/implementatie-PR/rol/timestampbinding. `VERIFIED_STAGING` vereist twee verschillende logins voor `functional-security` en `visual-a11y`. `RELEASED` vereist daarnaast `releasedCommit === evidence.commit === C` en een live succesvolle GitHub deployment/status voor `production` op **C**.

Promotie gebeurt altijd in twee fasen om commit-self-reference te vermijden. Fase 1 is de gemergede implementatie-PR op **C** met het echte bewijs. Fase 2 is een latere kandidaat-HEAD **D** die uitsluitend de gehashte evidence-index en de eerstvolgende lifecyclestate toevoegt. De protected-baseworkflow leest **D** alleen als inert Git-data, bewijst **C→D** ancestry en verifieert alle objecten op **C** live; **D** wordt nooit als de geteste implementation HEAD voorgesteld. Bij gelijkblijvende state moet de volledige lifecyclepayload identiek blijven. De enige ketens zijn acceptance `CONTRACTED → IMPLEMENTED → VERIFIED_LOCAL → VERIFIED_STAGING → RELEASED`, risico `OPEN → MITIGATED → VERIFIED_LOCAL → VERIFIED_STAGING → CLOSED` en baseline `CONTRACTED → BASELINE_READY`. Gebruik geen top-level traceabilityvelden.

## Stopvoorwaarden

Stop en rapporteer concreet wanneer:

- basis niet actueel is;
- een route/action/permissioncontract tegenstrijdig is;
- een P0/P1 niet veilig binnen scope kan worden gesloten;
- credentials/fixtures ontbreken voor verplicht bewijs;
- een onverwachte schema/data/securitymigration nodig is;
- businesslogic moet worden gedupliceerd;
- alleen client-side beveiliging mogelijk lijkt;
- baselineverandering ontwerpbesluit vereist;
- protected workflow/permission actie blokkeert;
- base/kandidaat-repository, SHA, baseref of ancestry niet exact kan worden bewezen;
- een checkout symlink, submodule, niet-reguliere Git-entry, gewijzigde/untracked data of een filesystemescape bevat;
- kandidaatcode of kandidaatconfiguratie uitgevoerd zou moeten worden om te valideren;
- dependency-inputclosure of immutable Action-pin afwijkt zonder afzonderlijke contract-rootrotatie;
- een lifecyclestate teruggaat, meer dan één stap springt, bij gelijkblijvende state bewijs wijzigt of historische implementation HEAD **C** met promotion-HEAD **D** verwisselt.

Geef bewijs, impact, veiligste opties en gevraagde beslissing. Markeer niets als klaar.

## Oplevering

Maak een featurebranch `codex/fieldflow-calm-wNN-korte-scope` en een PR naar de actuele `codex/fieldgrid-uiux-master`. Gebruik `09-PR-TEMPLATE.md`.

Final response bevat:

- uitkomst;
- branch/commit/PR;
- routes/actions/acceptance-ID’s;
- theme/whitelabelimpact;
- responsive/keyboard/touch;
- exacte tests + resultaat;
- evidence;
- migrations: buiten W01 geen of apart volledig beschreven; voor W01 exacte
  migration, lege-DB-, upgrade-, backfill-, rollback- en
  tenantisolatieresultaten;
- open P0/P1: nul;
- rollback;
- volgende afhankelijke werkpakket.

---

## Programma-opdracht

Wanneer Codex het volledige programma uitvoert:

1. maak eerst W00 af;
2. daarna W01→W04;
3. voer W05–W10 parallel uit waar fileownership niet botst;
4. integreer in W11;
5. bouw/voer W12 strict gate uit;
6. W13 onafhankelijke reviews + mainpromotie;
7. W14 stagingpilot;
8. wacht op expliciete release-sign-off voordat global default wijzigt;
9. verwijder legacy niet in hetzelfde programma.
