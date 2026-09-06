# 07 — Acceptatie, bewijs, release en rollback

## 1. Statusmodel

```text
CONTRACTED → IMPLEMENTED → VERIFIED_LOCAL → VERIFIED_STAGING → RELEASED
```

Evidence staat uitsluitend in `requirement.evidence` als `{ commit, index, releasedCommit? }`. `index` is een repository-relatieve `pad#sha256=<64 lowercase hex>`-verwijzing naar één JSON-index die `subjectId`, `verification` en `headCommit` exact aan requirement, verificatiemethode en de historische implementation HEAD in `evidence.commit` bindt en de GitHub-login van de implementatie-eigenaar als `authorId` noemt. Top-level kopieën en legacy bewijsarrays zijn ongeldig.

| Status           | Vereist bewijs                                                                                                                                                                                                                                           |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CONTRACTED       | nog geen implementatieclaim; geen evidence nodig                                                                                                                                                                                                         |
| IMPLEMENTED      | exacte `commit` + gehashte index met `verification` + echte Git-bestandspaden en SHA-256 van ieder bestand op die commit                                                                                                                                 |
| VERIFIED_LOCAL   | voorgaande plus vaste requirementgebonden gate-ID’s, exact één machineleesbaar runtime-JSON-rapport, alle gedeclareerde assen, nul failures/skips/errors, Git-ancestry, geattesteerde GitHub Actions-run en één live review op implementation HEAD **C** |
| VERIFIED_STAGING | voorgaande plus exact één machineleesbaar stagingrapport en afzonderlijke live `functional-security`- en `visual-a11y`-reviews op **C**                                                                                                                  |
| RELEASED         | voorgaande plus `releasedCommit` gelijk aan implementation HEAD **C** en live succesvolle GitHub production deployment van **C**                                                                                                                         |

Een eis mag geen status overslaan en kan niet `N/A` worden. De protected-basevalidator vergelijkt ieder subject in base en kandidaat en accepteert uitsluitend een identieke lifecyclepayload of precies de eerstvolgende state in de bijbehorende keten:

| Contract   | Toegestane voorwaartse stappen                                            |
| ---------- | ------------------------------------------------------------------------- |
| Acceptance | `CONTRACTED → IMPLEMENTED → VERIFIED_LOCAL → VERIFIED_STAGING → RELEASED` |
| Risico     | `OPEN → MITIGATED → VERIFIED_LOCAL → VERIFIED_STAGING → CLOSED`           |
| Baseline   | `CONTRACTED → REFERENCE_READY → BASELINE_READY`                           |

Bij gelijkblijvende state blijven state, evidence en alle overige lifecyclevelden exact gelijk. Voor capture betekent dit dat runtime-image digest, opgeloste fonts en `scenarioEvidence` niet mogen worden vervangen. Bij één voorwaartse stap moet de volledige bewijsset van de nieuwe state in dezelfde kandidaat aanwezig en live verifieerbaar zijn. Overslaan — inclusief rechtstreeks `CONTRACTED → BASELINE_READY` — terugzetten, een onbekende state, bewijs wissen of vervangen zonder stateovergang, een veld uit een latere state vooruit invullen en een claim zonder extern overeenkomende contractroot falen gesloten. Een legitieme scopewijziging gebeurt via een afzonderlijk gereviewde contractwijziging en is geen lifecycleomweg. `manual`, `NOT_RUN`, nul captures of een ontbrekende fixture is geen groen resultaat.

De v3-index bevat exact `schemaVersion`, `subjectId`, `headCommit`, `authorId`, `verification`, `codePaths`, `commands`, `artifacts`, `reviewers`, `provenance` en `release` (plus alleen voor een gesloten risico `residualRisk`/`closureDecision`). `provenance` bevat exact afzonderlijke `runtime`- en `staging`records: voor ieder vereist rapport één record en anders `null`. Verschillende fasen mogen verschillende runs, jobs en artifacts hebben, maar binden dezelfde implementatie-PR, base en HEAD. Ieder codepad is een werkelijk in de historische implementatie-PR gewijzigd bestand en de blob-SHA-256 wordt op `headCommit` berekend. Een bestandsnaam, vrije commandtekst of bestandshash is op zichzelf nooit bewijs.

Commands gebruiken uitsluitend de vijf IDs uit `acceptance.json#evidenceContract.indexSchema.commandCatalog`. Hun commandregel is exact, noemt `--evidence-subject <requirement-id>` en verwijst met pad én hash naar het bijbehorende rapport. De validator leidt uit `requirement.verification` af of naast `fieldflow-runtime` ook `fieldflow-browser` en/of `fieldflow-visual` vereist is; staging en release voegen hun eigen vaste gate toe. `true`, `echo`, een zelfgekozen `pnpm test`, `manual`, `NOT_RUN`, `skipped`, een niet-nul exitcode, een ontbrekend ID of een niet-gekoppeld rapport falen gesloten.

Er is per vereiste fase exact één canoniek JSON-rapport (`mediaType=application/json`, `reportKind=runtime|staging`). De inhoud bindt `subjectId`, `headCommit`, `verification` en dezelfde provenance en bevat exact:

- canoniek gesorteerde, unieke `coverage.routes/themes/viewports/densities`, waarbij wildcardroutes door de validator naar de volledige routeset worden uitgebreid;
- `coverage.commandIds/testIds`, met minimaal één unieke test-ID en minimaal één unieke assertion per test-ID;
- uitsluitend assertions met `status=passed` en een inhoudelijke message;
- `summary` met het exacte assertionaantal als `passed` en nul `failed`, `skipped`, `notRun` en `manual`;
- lege arrays voor `console`, `page`, `request`, `server` en `hydration` errors;
- gehashte, getypeerde attachments: minimaal JUnit voor runtime, log voor staging, trace voor browserbewijs en screenshot plus geometry voor visueel bewijs.

Provenance is geen zelfverklaarde boolean. De validator controleert live de historische PR en de Actions-run, check-suite en exacte attempt-job. `Actions run.pull_requests` is uitdrukkelijk geen trustbron, omdat die lijst bij `pull_request_target` leeg kan zijn. De trusted workflow `.github/workflows/fieldflow-calm-evidence.yml` moet met dezelfde blobhash op de main-executorcommit, implementatie-PR-base en implementation HEAD staan. Evidenceproductie is een expliciete A/B/C-keten: A is de disposable non-OIDC producer waarop alleen kandidaatcommands mogen draaien; B is een nieuwe non-OIDC runner die uitsluitend byte-identieke base-owned validators en dependencies uitvoert; C is de enige OIDC-signer. Alles wat A na kandidaatuitvoering kan beïnvloeden — raw bestanden, receipt, nonce, artifactinhoud, `PATH`, `GITHUB_ENV`, `GITHUB_OUTPUT`, `GITHUB_PATH` en andere file-commandpaden — is onbetrouwbaar en niet-authenticerend. B leidt zijn immutable naam en alle event-, run-, attempt-, HEAD-, job- en artifactbindingen zelf af, downloadt naar een afzonderlijke incoming-directory, weigert symlinks/hardlinks/padontsnapping en eist de exacte schema- en hashgebonden bestandsclosure voordat het een eigen attempt-uniek validated artifact uploadt. C downloadt alleen dat validated artifact. De Artifact Attestation wordt met exacte cert-identity op `refs/heads/main`, OIDC-issuer, signer/source-digest, SLSA-v1 predicate-type, hosted-runnerverbod voor self-hosted en exacte run-attempt geverifieerd. Alleen certificaatvelden en het in-toto-statementenvelope/subject worden vertrouwd; nooit zelfverklaarde predicate-inhoud. De signeruitvoer wordt onmiddellijk uit `RUNNER_TEMP` naar het promotion-ready pakket gekopieerd, gehasht en offline met `gh attestation verify --bundle` gecontroleerd; de HEAD-unieke, ingecheckte bundle is daarna de duurzame trustbron. Artifact-ID, finale gesigneerde naam en digest blijven historische transportmetadata in het post-upload indexrecord; raw-, validated- en finalenaam bevatten exact `runAttempt`, zodat immutable artifactnamen ook bij reruns uniek blijven. Beschikbaarheid, expiry, bytegrootte of retention van het remote Actions-artifact zijn geen toekomstige promotievoorwaarde; de 90 dagen retention is alleen operationeel transportbeleid. Raw- en validated-transportnamen mogen nooit in de index staan. Het runtime-/stagingrapport bevat uitsluitend de pre-upload provenanceprojectie en dus geen artifact- of bundlevelden. De implementatiebase moet een echte Git-ancestor van implementation HEAD zijn en die implementation HEAD moet weer ancestor van de latere promotion-HEAD zijn.

Een reviewerrecord bindt GitHub-login, rol, requirement-ID, exacte implementation HEAD, implementatie-PR-nummer, review-ID en timestamp. De live GitHub review moet de laatste review van die login op die implementation HEAD zijn, `APPROVED` zijn, minimaal write/maintain/admin collaboratorpermission hebben en de body bevat exact `FIELDFLOW-EVIDENCE: subject=<id>; head=<sha>; role=<role>`. Auteur, dubbele reviewer, oude-head review, een review op promotion-HEAD of alleen `independent: true` faalt. Kan de validator GitHub API of de ingecheckte Artifact Attestation-bundle niet verifiëren, dan blijft de claim ongeverifieerd. Voor release controleert hij daarnaast live deployment-ID, status-ID, environment `production`, succesvolle status en dezelfde implementatiecommit.

### Tweefasenpromotie zonder self-reference

Een implementatie kan haar eigen commit niet betrouwbaar in een bestand binnen diezelfde commit opnemen. Bewijsregistratie gebruikt daarom verplicht twee gescheiden pull requests:

1. **Implementatiefase C.** De implementatie-PR eindigt op immutable implementation HEAD **C**. Trusted CI draait op **C** en produceert rapporten en attestaties; alle reviews en, voor release, de production deployment binden exact **C**. De implementatie-PR wordt zonder vooruitgeschoven lifecycleclaim gemerged.
2. **Promotiefase D.** Een latere, smalle promotion-PR eindigt op kandidaat-HEAD **D** en wijzigt alleen het lifecyclemanifest plus de exacte transitieve bewijsclosure die de nieuwe claim nodig heeft: de gehashte evidence-index, haar canonieke rapporten, attachments, verificatiematrixshards en shardattachments. Historische `index.codePaths` horen nadrukkelijk niet bij die D-allowlist. `evidence.commit`, index `headCommit`, codeblobs, CI, reviews en deployment blijven exact **C** aanwijzen. **C** is ancestor van **D**, maar **D** is nooit het bewezen implementatiesubject.

De `pull_request_target`-validator uit de vertrouwde promotion-base behandelt **D** alleen als data. Hij valideert de indexhash, de base→kandidaat-stateovergang, ancestry **C→D**, iedere op C gehashte `codePaths`-blob opnieuw byte-exact op D, de volledige net-wijziging van de unieke merge-base van protected base en C naar C opnieuw byte- en mode-exact op D, een NUL-safe base→D-diff zonder rename-detectie en alle historische GitHub-objecten live. Daardoor kan geen bewezen implementatie- of capturebestand tussen C en D worden teruggedraaid of weggelaten. Zodra een lifecyclestate vooruitgaat, zijn uitsluitend het werkelijk gewijzigde lifecyclemanifest en de daaruit getypeerd bereikbare bewijsbestanden toegestaan; verwijderingen, renames, uitvoerbare blobs, verweesd bewijs en ieder ander pad falen gesloten. Zonder lifecycleovergang blijft een gewone implementatie- of contract-PR mogelijk. De promotion-PR mag geen normatief contract, validator, workflow, dependency-input of implementatiecode meesmokkelen; zo'n wijziging vereist zijn eigen contract- of implementatieproces. Hetzelfde patroon geldt afzonderlijk voor beide capturepromoties, met `capture-contract.json`, haar exact gerefereerde scenarioartefacten, een historische capture-HEAD **C** en latere promotion-HEAD **D**. W00 promoveert uitsluitend `CONTRACTED → REFERENCE_READY`; W12 gebruikt een nieuwe C/D-cyclus voor uitsluitend `REFERENCE_READY → BASELINE_READY`. Een rootrotatie blijft een derde, afzonderlijk beheerdersproces en mag nooit door kandidaatcode worden uitgevoerd.

Omdat deze repository implementatie-PR's normaal als squashcommit op de protected base landt terwijl historische CI/reviews aan de originele PR-head C blijven binden, bouwt de promotionbranch D beide geschiedenissen expliciet samen: vertrek vanaf C en merge de actuele protected base, of vertrek vanaf de actuele protected base en merge C als tweede parent. Los eventuele conflicten zo op dat de volledige C-netwijziging aanwezig blijft; de validator vereist zowel protected-base→D als C→D ancestry en vergelijkt de C-tree inhoudelijk. Een gewone promotionbranch die alleen vanaf de squashcommit start, kan C niet bewijzen en faalt bewust gesloten.

## 2. Gates

### Handoffgate, nu beschikbaar

```bash
pnpm fieldgrid:fieldflow-calm-handoff:check
```

Valideert:

- alle huidige dashboard-/authpages staan exact in routes.json;
- de vastgezette platform-/prototypecommits en blobdigest van alle geïnventariseerde pagebronnen kloppen;
- manifestcounts en IDs;
- iedere route heeft structureel capabilities, acties, states, permission, responsive patroon en workpackage;
- acceptance IDs zijn uniek en volledig;
- het statusmodel en de gehashte, subject-/historische implementation-HEAD-gebonden evidence-index worden exact afgedwongen;
- tokencontract bevat verplichte geometry/viewports/planbordregels;
- reference screenshots bestaan, hashes/afmetingen kloppen en prototype-only labchrome heeft een vast normalisatiecontract;
- pakket bevat geen onafgemaakte placeholders.

Een groene handoffgate betekent uitsluitend dat de overdrachtssnapshot intern consistent en reproduceerbaar is. Zij bewijst niet dat prose over actions/permissions nog overeenkomt met een later gewijzigde bron, dat Fieldflow al is geïmplementeerd of dat runtime-/releasegates groen zijn. W00 synchroniseert eerst de branches en reconcilieert de action-, permission-, module- en entitlementinventaris opnieuw tegen de dan actuele bron.

De repo-lokale digestconstanten zijn niet de uiteindelijke trustbron. `manifests/contract-root.json` bindt de complete digestvector, validator, tests, workflow, packagecommand én alle getrackte dependency-/workspace-/registry-/pnpmhook-/patchinputs. De verificatiematrix bindt dezelfde normatieve inputs, maar gebruikt voor acceptance en risico uitsluitend de projectie zonder `state`/`evidence` en voor baseline de projectie zonder `state` en met runtime-image, opgeloste fonts en scenario-evidence op `null`; daardoor kan bewijs de lifecycle vooruitzetten zonder de normatieve matrix of haar planroot zelf ongeldig te maken. Na goedkeuring/merge zet een repositorybeheerder de `rootSha256` in de beschermde Environment `fieldflow-calm-contract` onder `FIELDFLOW_CALM_TRUSTED_ROOT_SHA256` en maakt alleen de stabiele eindjob `Fieldflow Calm contract root` verplicht.

De workflow gebruikt uitsluitend `pull_request_target` op iedere PR naar de exacte beschermde base, zonder `paths` of `workflow_dispatch`; `pull_request_review` is geen toegestane trigger. De workflowdefinitie, `github.ref` en `github.workflow_ref` moeten van `main` komen, terwijl `pull_request.base.ref` exact `codex/fieldgrid-uiux-master` blijft. Main-executor, protected base en kandidaat worden afzonderlijk gecheckt en moeten dezelfde workflowblob dragen. Event, repository, refs/SHA's, PR-nummer, externe root en ancestry worden fail-closed gecontroleerd; Actions zijn op volledige commit-SHA's gepind. Forkcontent is expliciet onveilig en blijft inert. Voor installatie moet een exacte diffguard bewijzen dat geen package-, lock-, workspace-, `.npmrc`-, pnpmfile- of patchinput tussen base en kandidaat veranderde; daarna gebruikt de kandidaat alleen de reeds aan de trusted base gebonden dependencygraph met `--ignore-scripts`. De privileged producer gebruikt geen setup-node/pnpm-cache, zodat kandidaatprocessen geen store kunnen vergiftigen die een latere trusted run opslaat of hergebruikt. Historische provenance wordt zonder `run.pull_requests` gekoppeld via de live PR, run, check-suite en exacte attempt-job; de gehashte lokale bundle draagt de cryptografische bewijsduurzaamheid. Een aparte `always()`-job met de vaste naam wordt uitsluitend groen na een echte `success` van de verificatiejob, zodat denied, skipped, cancelled en failed geen ontbrekende of misleidend groene status opleveren.

Iedere gevorderde acceptance-, risico- of baselineclaim faalt zonder exact de beschermde root, de toegestane base→kandidaat-lifecycleovergang en het vereiste tweefasenbewijs. Rootrotatie gebeurt in een aparte contractwijziging met product/design-, functioneel/security- en visual/a11ygoedkeuring; de wijzigende PR registreert zijn eigen root nooit zelf.

### Genormaliseerde desktopreferentie in W00, mobiele baseline in W12

`evidence/visual/capture-contract.json` is een eigen fail-closed bewijscontract. In `CONTRACTED` zijn runtime-image digest, opgeloste fontfiles en `scenarioEvidence` exact `null`. W00 produceert in een historische capture-HEAD eerst de gepinde runtime/fontpayload en exact negen genormaliseerde desktoprecords in de volgorde van `desktopCanonicalPixel.scenarioIds`; ieder bevat een unieke PNG en vijf unieke JSON-artefacten voor pixel- en geometriebewijs. Een latere smalle promotion-PR mag dan uitsluitend `CONTRACTED → REFERENCE_READY` uitvoeren.

W12 produceert daarna in een nieuwe historische evidence-HEAD exact negen mobiele productierecords in de volgorde van `mobileResponsiveContract.scenarioIds`. Een tweede smalle promotion-PR mag uitsluitend `REFERENCE_READY → BASELINE_READY` uitvoeren: de runtime-/fontpayload en alle negen bestaande desktoprecords blijven byte-identiek en in dezelfde volgorde; de negen mobiele records worden als suffix toegevoegd. Zij bevatten ieder een productiescreenshot plus acht unieke JSON-artefacten voor semantische geometrie, productiestijlen, productie-DOM, Axe, toetsenbord, touch, setup en runtimefouten en worden nooit tegen een verkleinde prototype-PNG vergeleken. Alle recordartefacten worden samen met scenario-ID, prototypecommit, capturecontractroot, runtime-image digest, Playwright-/Chromiumdriver en exact dezelfde GitHub Actions-run in `captureBinding.sha256` vastgezet. De attestation bevat exact het manifest plus alle PNG-subjecten: 10 subjects voor `REFERENCE_READY` en 19 voor `BASELINE_READY`, met unieke veilige basenames en de volledige manifest-hashset als sidecarclosure. De HEAD-unieke bundle `normalized/attestations/<headCommit>.bundle.json` en het geattesteerde manifest worden samen ingecheckt. Iedere screenshot moet daarmee een geldige GitHub Artifact Attestation van de trusted `.github/workflows/fieldflow-calm-visual-baseline.yml` hebben; die workflowblob is identiek op main-executor, PR-base en de bijbehorende capture/evidence-HEAD.

De validator leest de JSON-inhoud, niet alleen de hash:

- `setupActionLog` bevat iedere genummerde `beforeEach`-instructie, exact iedere getypeerde profielstap en iedere DOM-sentinel in de contractvolgorde, allemaal `passed`, zonder setupfouten; voor mobiel bindt dit daarnaast de per-scenario productieactie en semantische sentinel;
- `runtimeErrorLog` bevat exact de kanalen console errors/warnings, page errors, request failures, HTTP 4xx/5xx, server errors, hydration errors, unhandled rejections en onverwachte third-party requests; alle arrays zijn leeg;
- desktop-`computedGeometry` bevat de exacte unie van viewport- en patternselectors, intern nagerekende x/y/width/height-delta's van maximaal 1 px en een volledige unieke inventaris van DOM-interactiedoelen van minimaal 44×44 px;
- desktop-`computedStyles` bindt beide capture-only stylesheethashes, semantic- en resolutionhash, `document.fonts.ready`, alle opgeloste fontfiles, rootvariabelen en bij wizard/Sheet ook de body-level Radix-portalvariabelen;
- desktop-`domSnapshot` bewijst `body[data-concept="fieldflow"]`, exact één full-viewport `.fg-app`, de setup-sentinels en hetzelfde interactiedoelaantal, plus nul `.lab-bar`, `.concept-caption`, `Herstel demo` en verborgen productieknopen;
- de mobiele productieartefacten bewijzen exact de gecontracteerde shell- en patroonregio's, minimaal 44×44 px targets, minimaal 8 px tussen controls, 16 px tussen containers, 12 px tekst-tot-borderpadding, nul horizontale overflow, geladen productiefonts/rootvariabelen, nul capture-CSS of prototypechrome, nul serious/critical Axe-bevindingen, volledig geslaagde keyboard- en non-drag-touchtraces, terugkeerfocus en live announcements.

`authorId` is de live GitHub-PR-auteur. Per scenario zijn exact twee unieke reviews nodig: één `product-design` en één `visual-a11y`, beide `APPROVED` op exact de bijbehorende historische capture/evidence-HEAD, nooit van de auteur. De reviewbody bevat `FIELDFLOW-BASELINE: scenario=<scenarioId>; binding=<captureBinding.sha256>; role=<role>`. De validator lost PR, run, exacte attempt-job en reviews live via GitHub op en verifieert de ingecheckte bundle offline; zonder API-toegang of geldige lokale Artifact Attestation blijft de state dus op haar vorige geldige stap. Een lege JSON, zelfgekozen reviewernaam, oude-head review, willekeurige screenshot met geloofwaardige afmetingen of mobiel bewijs zonder alle negen productieartefacten faalt.

### Implementatiegate, te bouwen in W12

```bash
pnpm fieldgrid:fieldflow-calm:check
pnpm fieldgrid:fieldflow-calm:visual --run --strict
pnpm fieldgrid:fieldflow-calm:staging --strict
pnpm fieldgrid:fieldflow-calm:release --verify
```

Alle vier leveren met `-- --evidence-subject <id> --report <veilig-json-pad>` een deterministisch rapport volgens het indexschema; browserbewijs gebruikt op dezelfde manier `pnpm fieldgrid:playwright:evidence`. W12 activeert deze al root-gebonden deliverables door de ontbrekende containment-capabele trusted runner via een afzonderlijke rootrotatie toe te voegen. Tot die runner aanwezig is falen evidence- en baselineproductie bewust gesloten. Een implementatie-PR mag de workflow of runner niet tegelijk wijzigen en als bewijsbron gebruiken: eerst mergen en als nieuwe base vertrouwen, daarna bewijs produceren. Die runner moet kandidaatcommands in een container/VM/cgroupgrens starten met read-only kandidaatbron en één dedicated writable outputroot. De kandidaatprocessomgeving bevat geen producer-nonce, GitHub-token/credential/secret, `GITHUB_ENV`, `GITHUB_OUTPUT`, `GITHUB_PATH`, `GITHUB_STEP_SUMMARY`, Actions-runtimecredential of ander runner-file-commandpad. De runner wacht op alle kinderen, beëindigt de volledige procesgroep/cgroup en bewijst dat geen kandidaatproces meer leeft voordat raw transport mogelijk is; A deelt geen schrijfbare bron, dependencycache of package-output met B of C. Job A krijgt alleen minimale leesrechten, B minimaal `actions: read`, `contents: read` en `pull-requests: read`, en uitsluitend C krijgt `id-token: write` en `attestations: write`. C attesteert het door B gevalideerde runtime-/stagingrapport, bewaart de bundle als `outputs/fieldflow-calm/attestations/<subject>.<mode>.<head>.bundle.json` en uploadt rapport, attachments en volledige verification-matrixclosure samen als het finale pakket. Iedere artifactnaam bevat de exacte run-attempt.

Deze gate faalt wanneer:

- auth/fixtures ontbreken;
- geen screenshot is gemaakt;
- route, actie, role, state, theme of viewport ontbreekt;
- status `manual` of niet-uitgevoerd is;
- baseline ontbreekt;
- traceability-ID dubbel/ongedekt is;
- geometry/pixels buiten grens vallen;
- pageoverflow/touch/contrast/Axe faalt;
- console, page, request, server of hydrationerror bestaat;
- baseline zonder expliciete review is gewijzigd.

## 3. Basistests per feature-PR

```bash
corepack enable
node --version
pnpm --version
pnpm install --frozen-lockfile
pnpm fieldgrid:fieldflow-calm-handoff:check
pnpm --filter @workspace/backoffice run typecheck
pnpm --filter @workspace/backoffice run build
pnpm fieldgrid:uiux-design-system:check
pnpm fieldgrid:uiux-responsive-forms:check
pnpm fieldgrid:uiux-browser-dialogs:check
pnpm fieldgrid:uiux-master-gate:check
git diff --check <base-sha>...HEAD
```

Versies:

- Node 24.x;
- pnpm 11.5.2.

## 4. Domeingates

Voer volgens scope aanvullend uit:

```bash
pnpm fieldgrid:uiux-navigation:check
pnpm fieldgrid:uiux-data-view:check
pnpm fieldgrid:uiux-detail-dossiers:check
pnpm fieldgrid:uiux-dashboard:check
pnpm fieldgrid:uiux-planboard:check
pnpm fieldgrid:uiux-platform:check
pnpm fieldgrid:uiux-auth:check
pnpm fieldgrid:uiux-analytics:check
pnpm fieldgrid:live-planning-consistency:check
pnpm fieldgrid:staffing-capacity-invariants:check
```

Source-/regextests zijn nuttige guards, geen runtimebewijs.

## 5. Integratiegate

```bash
pnpm test
pnpm run typecheck
pnpm -r --if-present run build
pnpm fieldgrid:test:contract-static
pnpm fieldgrid:test:unit-domain
pnpm fieldgrid:test:security-source
pnpm fieldgrid:uiux-design-system:check
pnpm fieldgrid:uiux-responsive-forms:check
pnpm fieldgrid:uiux-browser-dialogs:check
pnpm fieldgrid:uiux-navigation:check
pnpm fieldgrid:uiux-data-view:check
pnpm fieldgrid:uiux-detail-dossiers:check
pnpm fieldgrid:uiux-dashboard:check
pnpm fieldgrid:uiux-planboard:check
pnpm fieldgrid:dashboard-ui-audit:check
pnpm fieldgrid:visual-regression-snapshots:check
pnpm fieldgrid:uiux-master-gate:check
pnpm fieldgrid:fieldflow-calm:check
pnpm fieldgrid:playwright:install
pnpm fieldgrid:playwright
pnpm fieldgrid:playwright:evidence
pnpm fieldgrid:fieldflow-calm:visual --run --strict
```

De twee `fieldgrid:fieldflow-calm:*` implementatiecommando’s zijn W12-deliverables. Het bestaande visual/dashboardcheck mag niet als bewijs gelden wanneer de output `manual` is.

## 6. Runtime evidence-as

Minimumdimensies:

| As            | Waarden                                                                                       |
| ------------- | --------------------------------------------------------------------------------------------- |
| Viewport      | 320, 390, 430, 768, 1024, 1280, 1440, 1920                                                    |
| Zoom          | 100%, 200%                                                                                    |
| Input         | pointer, keyboard, touch                                                                      |
| Motion        | normal, reduced                                                                               |
| Contrastmodus | normal, forced colors/high contrast                                                           |
| Theme         | default, platform override, dark, light, red, yellow, monochrome, invalid                     |
| Density       | compact, comfortable, spacious; ieder met eigen geometrysnapshot en ≥44px targets             |
| Asset         | normal, none, broken, wide, tall                                                              |
| Plan          | Starter, Professional, Enterprise override off, Enterprise override on                        |
| Tenant        | A, B, A→B→A                                                                                   |
| Permission    | owner/admin, planning, finance, manager, staff, readonly, bookkeeper, support context         |
| State         | loading, populated, empty, filtered empty, forbidden, error, pending, success, stale, offline |
| Locale/data   | lange Nederlandse copy, grote bedragen, DST, midnight                                         |

Gebruik pairwise selectie voor gewone pagina’s, maar volledige kruising voor:

- shell;
- brandingeditor;
- planbord;
- role/permissionbeheer;
- login/auth;
- PDF/e-mail;
- tenantwissel.

Voor de 60 componentcapturecases is deze selectie volledig machineleesbaar in
`component-states.json.caseExecutionMatrix.axisCoverage`. Shell,
branding-editor, planboard en permissions bevatten samen 26 kritieke execution
units en draaien een volledig Cartesian kruisproduct van de passende vijf
viewport-/zoomprofielen, zeven themes, drie densities, twee motionwaarden, twee
contrastmodi en drie permissionprofielen: 32.760 runs. De overige 36 cases
gebruiken het vastgezette pair-closure-algoritme met 182 runs per case: 6.552
runs. Iedere kritieke scope bevat aantoonbaar alle 2.268 verschillende
ascombinaties; over vier scopes zijn dat 9.072 distincte scopecombinaties. De
componentassensuite telt exact 39.312 unit-/caseruns; de 300 canonieke
viewport-/zoomruns zijn daarin een verplichte subset. Login/auth, PDF/e-mail en
tenantwissel blijven daarnaast volledige kruisproducten in hun route- of
surfacebewijs en worden niet ten onrechte bij de 60 componentcases opgeteld.

### 6.1 Deterministische requirement- en bewijsbinding

[`verification-matrix.json`](./manifests/verification-matrix.json) is de
machineleesbare uitvoeringsautoriteit naast `acceptance.json`. Zij bindt elk van
de 145 requirement-ID's aan exact opgeloste route-, capability-, action-,
component(case)-, surface(target)- en risk-ID's. Iedere requirementstream bevat
eerst één subjecttuple per gekoppeld subject en daarna een deterministische
pair-closure over rol, input, state, viewport/zoom, density, motion,
contrastmodus en tenantbrand. `FFC-RSP-001` voegt daar zonder sampling exact
`79 routes × 8 breedtes = 632` responsive tuples aan toe; `FFC-ROUTE-001` bindt
één subjecttuple aan iedere actuele route, capability en actie, inclusief de
globale shellsubjects.

De drie gedeelde whitelabelmatrices voor auth, PDF/e-mail en tenantwissel zijn
volledige lexicografische Cartesian producten over hun expliciet gedeclareerde
assen. Een pairwise steekproef, een alleen-visuele desktopcheck of één generieke
“whitelabel werkt”-assertie telt daarvoor niet. De matrix legt per requirement
en gedeelde matrix het exacte tupleaantal, de SHA-256 van de canonical JSONL-
payloadstream, de SHA-256 van de tuple-ID-stream en het eerste/laatste tuple-ID
vast. De canonicalisatie-, selector-, pair-closure- en Cartesian algoritmen zijn
onderdeel van hetzelfde root-bindbare bestand; de JSON-structuur staat in
[`verification-matrix.schema.json`](./reference/verification-matrix.schema.json).
De zeven bronmanifests zijn daarbij met de SHA-256 van hun whitespace-onafhankelijke
`JSON.stringify(parsedJson)`-semantiek gebonden, zodat formattering geen vals
contractverschil veroorzaakt maar iedere inhoudelijke wijziging wel faalt.

Runtime- en stagingreports verwijzen naar de exacte matrixhash én
`verificationPlanRootSha256`. Zij leveren voor iedere requirementstream en
iedere gekoppelde gedeelde matrix aaneengesloten, niet-overlappende
ordinal-shards. Iedere shard bindt zijn eigen ID-/payloadstreamhash aan een
gehashte assertionreportage; iedere assertion bevat het opnieuw berekenbare
tuple-ID, de volledige canonical tuple, machine-assertion-ID's, attachment-ID's
en `status: passed`. Ontbrekende, dubbele, onbekende, gesamplede, handmatige,
`skipped` of `NOT_RUN` tuples falen gesloten. Daardoor kan een algemene testnaam
of routebrede screenshot nooit bewijs voor een specifieke capability, actie,
rol, input, state of whitelabelvariant vervangen.

## 7. Routebewijs

Iedere entry uit routes.json levert:

- page opens;
- correct h1/breadcrumb/nav;
- juiste permission/module;
- iedere gekoppelde `capabilityId` uit routes.json is zichtbaar of aantoonbaar bereikbaar volgens zijn productiebron;
- iedere gekoppelde `primaryActionId`, `secondaryActionId` en `destructiveActionId` uit routes.json;
- een primaire actie uitsluitend waar production-inventory voor die route minimaal één `kind: primary` declareert; nooit een actie verzinnen om de layout te vullen;
- desktop en mobile representation;
- formvalidation;
- overlayfocus/Escape/return;
- pending/success/error;
- direct URL denied;
- loading/empty/not-found waar van toepassing;
- geen console/network/hydrationerror.

Een verborgen tab, geïmporteerde maar onbereikbare component of toast-only prototypeactie telt niet.

## 8. Visueel bewijs

### Canonical reference

- Chromium-versie gepind;
- CI-OS/container gepind;
- font lokaal/deterministisch;
- fixturedata gepind;
- tijd/locale/timezone gepind;
- animation uit voor capture;
- screenshot op exact 1440×1000;
- key component bounding boxes maximaal 1px afwijking;
- pixeldiffdrempel expliciet in gate en reviewed;
- geen brede maskers.

### Responsive

Op ieder verplicht formaat:

- geen pageoverflow;
- geen overlap/clipping;
- 44px;
- linewrap;
- route/action parity;
- relevante overlay open;
- relevante error/empty state;
- screenshot en DOM/geometryresultaat.

### Baselinebeheer

- huidige prototypebeelden zijn intentie-anchors;
- eerste productiebaseline vereist designreview;
- update is afzonderlijke reviewactie;
- diff vóór/na zichtbaar;
- commit en reviewer vastgelegd;
- “update snapshots” maakt een fout nooit automatisch groen.

## 9. Accessibility

Releasecriteria:

- nul serious/critical Axe;
- alle kernacties keyboard;
- mobiele kernacties touch zonder drag;
- screenreader smoke shell/DataView/form/overlay/planbord;
- contrast alle tokenpairs;
- focus zichtbaar/volgorde/return;
- no color-only status;
- 200% zoom/textresize/text spacing;
- reduced motion;
- forced colors;
- namen/labels en live announcements.

## 10. Security/tenantbewijs

Minimaal:

- forged direct actions;
- direct forbidden URLs;
- tenant-ID in clientinput genegeerd als autorisatiebron;
- tenant A record/asset/theme/event/domain niet door B;
- storage path ownership;
- server-side theme/permission;
- supportmodus grant/TTL/audit;
- role change beïnvloedt canonical tenant permission;
- PDF logo fetch geen private/unsafe origin;
- trusted proxy/host voor custom domain;
- dynamic metadata blijft tenantgescopeerd.

Bevestigde beleidsfout in een bestaande migratie wordt met een forward hardening migration opgelost, niet met alleen UI.

## 11. Staging

```bash
pnpm fieldgrid:migration-order-check:check
pnpm fieldgrid:test-layers:check
pnpm fieldgrid:staging-promotion-gate:check
pnpm fieldgrid:sprint15-staging-smoke:run-read-only
pnpm fieldgrid:staging-promotion-gate:strict
```

De UI-versieselectie bevat geen schemawaarde. W01 bevat wel de gecontracteerde
forward migration voor assetmodes, `theme_revision` en immutable
document-appearance-snapshots en levert daarom verplicht lege-DB-, upgrade-,
deterministische legacybackfill-, rollback/herstel- en tenantisolatietests. Een
apart security-/RBAC-migratiepakket voert dezelfde bewijscategorieën voor zijn
eigen scope uit.

## 12. Pilot

1. Merge complete implementatie met global default legacy.
2. Deploy staging met flag uit.
3. Legacy smoke.
4. Activeer één vaste Fieldflow-testtenant.
5. Test `field-demo` of equivalent.
6. Activeer tweede Enterprise-whitelabeltenant.
7. Volledige route/action/role/theme/state/viewportmatrix.
8. Allowlistpilot met expliciete tenants.
9. Observeer errors, latency, Core Web Vitals, support, failed mutations en realtime.
10. Product/design/security sign-off.
11. Global default naar Fieldflow Calm.
12. Legacy pas in een latere cleanup-PR verwijderen.

## 13. Observability

Meet zonder PII:

- page/error/hydration rates per experience;
- Server Action success/error/stale/rollback;
- planbord mutation latency/conflict/realtime reconnect;
- failed theme/asset resolve;
- navigation/route not found;
- overlay/browsererror;
- LCP/INP/CLS;
- supportvolume;
- featureflag cohort.

Alarmering en dashboards onderscheiden legacy en Fieldflow.

## 14. Rollback

Primair:

1. `FIELDGRID_TENANT_BACKOFFICE_EXPERIENCE=legacy`;
2. allowlist leeg;
3. backoffice herstart;
4. legacy smoke;
5. tenant-/permission-/planningintegriteit verifiëren.

Bij codeprobleem:

- deploy vastgelegde vorige goede `main` SHA als forward deployment;
- niet rechtstreeks op staging repareren;
- issue op mainlijn oplossen en exact promoten.

Database:

- de experienceflag zelf vraagt geen schema rollback;
- de W01 appearance-migration heeft een eigen forward herstel-/rollbackplan;
  verwijder nooit een mode/revision/snapshotkolom zolang nieuwe code haar kan
  schrijven of lezen, en herstel legacywaarden uitsluitend uit de vooraf
  geverifieerde backup/backfillmapping;
- aparte security/datareconciliatiemigratie heeft eigen forward herstelplan;
- actual/planned/staffinggegevens nooit via UI-rollback herstellen.

## 15. Releasebewijs

Final report bevat:

- exact main/staging SHA;
- flag/allowlist;
- requirements per status;
- alle commands + exitcode;
- evidence index/hashes;
- browser/OS/font/fixture;
- route/role/theme/state coverage;
- open issues = geen P0/P1;
- onafhankelijke reviews;
- pilot sign-off;
- vorige goede SHA;
- uitgevoerde rollback drill.
