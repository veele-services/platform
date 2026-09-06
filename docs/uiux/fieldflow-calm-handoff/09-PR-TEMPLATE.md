# [WNN] Fieldflow Calm — korte scope

## Branch en basis

- PR-soort: implementatie **C** / bewijspromotie **D** / contract-rootrotatie
- Base branch:
- Exact base SHA:
- Huidige PR-head SHA:
- Historische implementation/capture HEAD **C**, indien promotie:
- Implementatie-/capture-PR-nummer, indien promotie:
- Promotion HEAD **D**, indien promotie:
- Bewijs dat **C** ancestor van **D** is:
- UIUX-master bevat actuele main:
- Prototypecommit: `098d3ce41da66851675fe467eb9747ebff5bd4ae`

## Lifecyclewijziging

- Subject-ID:
- Base state:
- Kandidaatstate:
- Exact één toegestane stap: ja / geen statewijziging
- Lifecyclepayload bij gelijkblijvende state exact identiek:
- Keten: acceptance `CONTRACTED → IMPLEMENTED → VERIFIED_LOCAL → VERIFIED_STAGING → RELEASED` / risico `OPEN → MITIGATED → VERIFIED_LOCAL → VERIFIED_STAGING → CLOSED` / baseline `CONTRACTED → REFERENCE_READY → BASELINE_READY`
- Geen downgrade, skip, onbekende state, vooruitgevuld veld of bewijsvervanging:
- Promotion-PR wijzigt uitsluitend evidence-index + lifecycleclaim:
- Capturepromotie: W00 uitsluitend `CONTRACTED → REFERENCE_READY` / W12 uitsluitend `REFERENCE_READY → BASELINE_READY`:
- Bij `REFERENCE_READY → BASELINE_READY`: runtime/fontpayload en negen desktoprecords inclusief volgorde byte-identiek; exact negen mobiele records als suffix:

## Contractscope

- Workpackage:
- Acceptance-ID’s:
- Route-ID’s/routes:
- Acties:
- Rollen/permissions:
- Modules:
- Query/deeplink/localStorage/events:

## Implementatie

- Gewijzigde bestanden:
- Gedeelde components/tokens:
- Hergebruikte loaders:
- Hergebruikte Server Actions:
- Domeinhelpers/invarianten:
- Loading/empty/error/stale/offline:
- TODO/FIXME: geen

## Tenantthema en whitelabel

- Default:
- Platform override:
- Starter/Professional:
- Enterprise override uit:
- Enterprise override aan:
- Tenant A→B→A:
- Fonts/radius/density:
- Logo missing/broken/wide:
- Portals/overlays:
- Metadata/favicon/manifest:
- E-mail/PDF:
- Contrastdiagnostics:
- Ongewenste Fieldgridhits: geen

## Permission en security

- UI capability per action:
- Serverguard:
- Modulecheck:
- Direct URL/action negative:
- Tenantisolatie:
- Supportmodus/audit:
- Upload/asset:
- Securityreview:

## Responsive en interactie

- 320:
- 390:
- 430:
- 768:
- 1024:
- 1280:
- 1440:
- 1920:
- 200% zoom:
- Pointer:
- Keyboard:
- Touch:
- Reduced motion:
- Forced colors:
- Overflow:
- Touch targets:

## Planbord, indien geraakt

- Board/day/week/month/map:
- Queue→board:
- Board→board:
- Board→queue:
- Mobile non-drag:
- Keyboard:
- Snap/pointeroffset:
- Conflict/statuslock:
- Concurrency/idempotency:
- Optimistic/rollback:
- Undo:
- Realtime:
- Planned/actual/Amsterdam:
- Team/required slots:

## Database en migratie

- UI-versieselectiekolom: geen
- W01 appearance-migration: n.v.t. / assetmodes + `theme_revision` +
  documentsnapshots exact beschreven
- Datareconciliatie:
- Securitypolicy:
- Lege DB:
- Upgrade:
- Deterministische legacybackfill:
- Tenantisolatie:
- Rollback:

## Protected trust boundary

- Workflowevent uitsluitend `pull_request_target` zonder pathfilter/dispatch:
- `pull_request_review` ontbreekt; rootretrigger uitsluitend echte body-`edited` na reviews:
- `github.ref=refs/heads/main`, `workflow_ref=<workflow>@refs/heads/main` en exacte `workflow_sha`:
- Main-executor-, protected-base- en kandidaatworkflow byte-identiek:
- Environment `fieldflow-calm-contract` laat alleen `main` toe:
- Eventrepository/base repository exact `veele-services/platform`:
- Baseref exact `codex/fieldgrid-uiux-master`:
- Base- en kandidaat-SHA exact lowercase 40-hex en verschillend:
- Kandidaatrepository syntactisch geldig en expliciet gecheckt:
- Exacte checkouts + base→kandidaat ancestry:
- Base- en kandidaattree schoon; uitsluitend `100644`/`100755` Git-blobs:
- Symlinks/submodules/niet-reguliere entries: geen
- Forkcheckout uitsluitend inert data; kandidaat-JavaScript/Actions/config/lifecycle/build/test nooit uitgevoerd:
- Kandidaatinhoud uit exacte Git-blobs gelezen; geen filesystemescape:
- Install uitsluitend uit trusted base, frozen lockfile, `--ignore-scripts`:
- Dependencyclosure bindt alle package-/lock-/workspace-/`.npmrc`-/pnpmhook-/patchinputs:
- Checkout/setup-node/pnpm Actions op goedgekeurde immutable commit-SHA's:
- `GH_TOKEN` alleen noodzakelijke API-stappen; scopes alleen actions/attestations/checks/contents/pull-requests read:
- Stabiele `Fieldflow Calm contract root`-eindjob via `always()` en alleen groen op verificatieresultaat `success`:
- Contract-rootrotatie, indien van toepassing: aparte PR + drie disciplines + daarna body-edit van nul naar exact één `FIELDFLOW-ROOT-RECHECK` door auteur of live write/maintain/admin + externe Environmentwaarde pas na merge door beheerder:

## Tests

| Command                                       | Exit | Resultaat/evidence |
| --------------------------------------------- | ---: | ------------------ |
| `pnpm fieldgrid:fieldflow-calm-handoff:check` |      |                    |
| Backoffice typecheck                          |      |                    |
| Backoffice build                              |      |                    |
| UIUX design system                            |      |                    |
| Responsive forms                              |      |                    |
| Browser dialogs                               |      |                    |
| Relevant domain gate                          |      |                    |
| Fieldflow runtime gate                        |      |                    |
| Fieldflow visual strict                       |      |                    |

## Runtimebewijs

- Protected contract root: manifest-SHA + beschermde Environment-match + stabiele base-eigen eindjob groen op promotion HEAD **D**:
- Requirement/risk-ID + exacte historische implementation HEAD **C**:
- Implementatie-PR voor **C** + auteur:
- Promotion-PR en kandidaat-HEAD **D**:
- Ancestry **C→D** live bewezen; **D** is niet als implementation HEAD gebruikt:
- `verification` exact gelijk aan acceptance requirement / `risk-mitigation`:
- Evidence-indexpad + SHA-256:
- Evidence `commit` en index `headCommit` exact **C**:
- Git-codepaden + blob-SHA-256 op **C**; ieder pad staat in de implementatie-PR-diff:
- Typed command-ID’s + exacte cataloguscommandregels + rapportpad/hash:
- Runtime/staging JSON-rapport: subject/**C**/verification/provenance exact gebonden:
- Coverage: wildcardroutes uitgebreid; routes/themes/viewports/densities/commandIds/testIds compleet:
- Assertions/summary: minimaal één per test-ID; alle passed; failed/skipped/notRun/manual allemaal 0:
- Errorchannels console/page/request/server/hydration: allemaal leeg:
- Attachments: JUnit/log/trace/screenshot/geometry volgens scope + SHA-256:
- GitHub Artifact Attestation: ingecheckte gehashte HEAD-unieke bundle, offline `gh attestation verify --bundle`, exacte main-cert-identity/issuer, signer/source-SHA, SLSA-v1 envelope, hosted runner, run-attempt en exact één veilig reportsubject:
- Provenance per rapportkind: implementatiebase/**C** ancestry + implementatie-PR + workflowblob op main-executor/base/**C** + run/check-suite/exacte attempt-job succesvol; geen `run.pull_requests`-afhankelijkheid:
- Transportgrens A/B/C: alleen disposable non-OIDC A draait kandidaatcommands; raw artifact/receipt/nonce zijn onbetrouwbaar en niet-authenticerend; schone non-OIDC B leidt run/attempt/HEAD/job/artifact zelf af, valideert exacte veilige closure zonder symlinks/hardlinks met alleen base-owned code/dependencies en maakt een eigen attempt-uniek validated artifact; alleen C heeft OIDC en attesteert B:
- Runner-containment: read-only kandidaatbron, dedicated writable output, geen nonce/GitHub-credential/secret/file-commandpad voor kandidaatprocessen, alle procesgroepen/cgroups beëindigd vóór raw transfer; ontbrekende root-gebonden runner faalt gesloten:
- Historisch transport: `artifactId`/digest en alleen de finale gesigneerde naam zijn indexmetadata; raw-, validated- en finalenaam binden exact `runAttempt`, raw/validated namen staan nooit in de index en remote availability/expiry/retention is geen latere trustbron:
- Promotion-ready closure: canoniek rapport + directe attachments + alle verification-matrixshards/-attachments + `<subject>.<mode>.<head>.bundle.json`, zonder symlinkcomponenten:
- Fixture/tenant:
- Browser/OS/font:
- Screenshots:
- Traces/video:
- Axe:
- Console/page/request/server/hydration:
- Pixel/geometrydiff:
- Manual/NOT_RUN-status: geen

## Reviews

- Self-review:
- Onafhankelijke functioneel/securityreview: GitHub login + review-ID + timestamp + exact **C** APPROVED op implementatie-PR + `FIELDFLOW-EVIDENCE` marker:
- Onafhankelijke visual/a11yreview: andere GitHub login + review-ID + timestamp + exact **C** APPROVED op implementatie-PR + `FIELDFLOW-EVIDENCE` marker:
- Product/design parity:
- Reviewer-ID's/rollen uniek, onafhankelijk en geen self-review:
- Open P0/P1 met dit werkpakket als eigenaar: geen
- Open dependency-P0/P1 die het volgende werkpakket blokkeert: geen
- Nog open risico's van latere eigenaarspakketten: <!-- IDs + eigenaar; alleen bij W14/promotie moet dit geen zijn -->

## Release

- Featureflag/default:
- Pilotcohort:
- Observability:
- Vorige goede SHA:
- Configrollback:
- Coderollback:
- Traceability bijgewerkt:
- `releasedCommit` exact gelijk aan `evidence.commit` en implementation HEAD **C**:
- GitHub production deployment-ID + success status-ID op **C** live geverifieerd:
