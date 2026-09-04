# Fieldflow Calm — uitvoerbaar Codex-overdrachtspakket

- Status: **goedgekeurd implementatiecontract; runtime-UI nog niet geïmplementeerd**
- Primair UI-oppervlak: tenant-backoffice en bijbehorende authenticatie
- Whitelabeloppervlakken: backoffice/auth, klant- en personeelswebportaal, web-PWA, e-mail en PDF/export
- Implementatiebasis: `codex/fieldgrid-uiux-master` op `ba81cc18aaf8aa2d93d292c0def49d5c997307dc`
- Visuele bron: Fieldflow Calm, prototypecommit `098d3ce41da66851675fe467eb9747ebff5bd4ae`

Canonieke pakketlocatie in git: `docs/uiux/fieldflow-calm-handoff/` binnen deze repository. Alleen de inhoud op de PR-commit is overdrachtsautoriteit; tijdelijke scratchkopieën buiten de repository horen niet bij de oplevering.

Dit pakket is de definitieve, uitvoerbare overdracht voor implementerende Codex-agents: het bepaalt wat gebouwd, behouden en bewezen moet worden. Het is nadrukkelijk geen reeds geïmplementeerde runtime-UI. Een groene handoffgate bewijst de integriteit van het contract, niet dat Fieldflow Calm al in de backoffice draait.

De pakketvalidator borgt zowel de semantische inhoud van de machinecontracten als één geaggregeerde byte-digest van deze twaalf normatieve Markdown-bestanden. [contract-root.json](./manifests/contract-root.json) bindt daarnaast alle normatieve manifesten, productiebronnen, visuele/prototype-evidence, validator, hoofdtests, packagecommand en de trusted root-workflow in één SHA-256. Na de eerste onafhankelijke goedkeuring registreert een repositorybeheerder die waarde buiten de PR in de beschermde GitHub Environment `fieldflow-calm-contract`; de base-versie van de `pull_request_target`-workflow controleert kandidaatbranches zonder kandidaatcode uit te voeren. Een contractwijziging vereist daardoor een afzonderlijke root-rotatie en product/design-, functioneel/security- én visual/a11ygoedkeuring; automatisch “de hashes bijwerken” is geen geldige acceptatie.

| Contractonderdeel        | Vastgezet                                                                                        |
| ------------------------ | ------------------------------------------------------------------------------------------------ |
| Routes                   | 79 totaal: 75 tenant-dashboard + 4 auth                                                          |
| Productiecapabilities    | 282 totaal: 277 routegebonden + 5 globaal; exact via machine-ID gekoppeld                        |
| Productieacties          | 428 totaal: 409 routegebonden + 19 globaal; exact via machine-ID gekoppeld                       |
| Productiebronnen         | 231 unieke bronblobs op de vastgezette basis; bron- én inhoudsdigest gevalideerd                 |
| Acceptatie-eisen         | 145 totaal: 122 P0 en 23 P1                                                                      |
| Risico's                 | 50 P0/P1-items met blokkerende lifecycle en bewijscontract                                       |
| Verificatietuples        | 802.213 deterministisch geplande tuples; uitvoering en groen runtimebewijs zijn nog vereist      |
| Componentbronexports     | 299 totaal: 132 state-owner, 122 composite en 45 aantoonbaar non-visual                          |
| Componentinteracties     | 30 componenten, 60 basiscases, 300 viewport-/zoombaselines en 39.312 verplichte component-asruns |
| Uitvoeringspakketten     | W00–W14                                                                                          |
| Responsive bewijsbreedte | 320, 390, 430, 768, 1024, 1280, 1440 en 1920 px, plus 200% zoom                                  |
| Visuele auditankers      | 9 PNG's met afmeting en SHA-256; W00 maakt 9 desktop-pixel- en 9 mobiele productie-evidencesets  |
| Whitelabeloppervlakken   | 9 inbegrepen, 1 afzonderlijk websitecontract en 1 expliciete native uitsluiting                  |

## Besluit

Fieldflow Calm wordt de enige nieuwe tenant-backoffice-ervaring. “Exact zoals het prototype” betekent:

- dezelfde rustige informatiehiërarchie, spacing, geometrie, componenttaal en premium afwerking;
- desktop-first als canonieke informatiearchitectuur én volledig responsive mobiel op alle routes, containers, formulieren, overlays en acties;
- hetzelfde planbordconcept met uren horizontaal, medewerkers verticaal en pastelblokken, met deterministische place/move/unassign/release/optimize/undo-contracten, versioning en waarschuwingbevestiging;
- alle huidige productiefunctionaliteit, rechten, tenantisolatie en domeinregels blijven aanwezig;
- tenantkleuren, fonts, radius, density en whitelabelassets lopen deterministisch via het bestaande effectieve thememodel zonder semantische statuskleuren of tenantisolatie te doorbreken;
- mockdata, hardcoded tijden, statische kaartdata en lokale-only logica uit het prototype worden niet overgenomen.

De vier niet-gekozen designrichtingen en de design-lab-schakelaar horen niet in productie.

De tenant-backoffice, auth, klant-/personeelswebportalen, web-PWA, e-mail en exports vallen binnen de whitelabelcontrole. Juridisch gefinaliseerde documenten behouden hun immutable documentsnapshot. Gepubliceerde websites houden hun eigen versioned theme. In de Capacitor-app blijven de server-rendered webinhoud en de runtime, contrastveilige StatusBar-kleur in scope; native Android launchernaam, package, appicoon, OS-splash en build-time notification/channel-assets vallen buiten de runtime-whitelabelclaim en gebruiken een goedgekeurde neutrale/flavor-identiteit. [surfaces.json](./manifests/surfaces.json) is hiervoor de uitputtende autoriteit.

## Definition of done

Fieldflow Calm is pas klaar wanneer tegelijk aan alle onderstaande voorwaarden is voldaan:

1. Alle 79 routes — 75 tenant-dashboardroutes en 4 authenticatieroutes — in [routes.json](./manifests/routes.json) zijn geïmplementeerd en aantoonbaar bereikbaar.
2. Alle 282 capabilities en 428 acties zijn behouden of volgens hun expliciete nieuwe contract geïmplementeerd; geen verborgen tab of dode component telt als dekking.
   Alle exports uit de gedeelde UI- en tenant-UI-laag blijven daarnaast volledig en AST-exact geclassificeerd in [component-source-coverage.json](./manifests/component-source-coverage.json); een interactieve export mag niet als non-visual worden weggeschreven.
3. Alle 145 eisen in [acceptance.json](./manifests/acceptance.json) hebben minimaal status `VERIFIED_STAGING` (`VERIFIED_STAGING` of `RELEASED`), met de per status vereiste geneste evidence; alle 802.213 geplande tuples uit [verification-matrix.json](./manifests/verification-matrix.json) zijn deterministisch geregenereerd en zonder skip/manual/not-run uitgevoerd.
4. De gehashte Fieldflow CI-themefixture heeft pixelpariteit met de toegankelijk genormaliseerde baselines. De raw anchors zijn nooit een pixelgate. Kleur/font/radiusvarianten behouden de compositie; density wijzigt uitsluitend de vier benoemde geometry-assen en heeft per preset een eigen snapshot.
5. De desktop-first compositie en iedere mobiele transformatie werken volledig op 320, 390, 430, 768, 1024, 1280, 1440 en 1920 px en bij 200% browserzoom, zonder functie-, actie- of statusverlies.
6. Iedere mutation heeft server-side tenant-, permission- en entitlementcontrole en zichtbare pending/success/error/rollbackfeedback.
7. Het planbord volgt [planboard-actions.json](./manifests/planboard-actions.json), is deterministisch bruikbaar met muis, touch én toetsenbord en maakt drag-and-drop mobiel nooit de enige route.
8. Alle 50 items in [risks.json](./manifests/risks.json) zijn `CLOSED`; er is geen ernstige/kritieke Axe-fout, browser-/server-/hydrationerror of handmatige/niet-uitgevoerde teststatus.
9. De pilot is op staging uitgevoerd met minimaal twee tenants, waaronder één volledig whitelabel Enterprise-tenant.
10. Een onafhankelijke functioneel/securityreview en visual/a11yreview zijn beide akkoord.
11. Voor iedere status boven `CONTRACTED`/`OPEN` is de contract-root extern geregistreerd en de verplichte statuscheck `Fieldflow Calm contract root` groen op exact HEAD.

## Pakket

Dit is de definitieve overdrachtsindex. De genummerde documenten leggen bedoeling en uitvoering uit; de gekoppelde machinecontracten zijn autoriteit voor hun benoemde IDs, vormen, relaties, algoritmen en tellingen.

| Bestand                                                                             | Functie                                                                                                                                                  |
| ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [00-BRON-EN-BESLUITEN.md](./00-BRON-EN-BESLUITEN.md)                                | Herkomst, interpretatie van “exact”, vastgezette beelden en ontwerpbesluiten                                                                             |
| [01-DESIGNSYSTEEM-EN-COMPONENTEN.md](./01-DESIGNSYSTEEM-EN-COMPONENTEN.md)          | Tokens, spacing, typografie, componenten, lijsten, dossiers, forms en overlays                                                                           |
| [02-THEMING-EN-WHITELABEL.md](./02-THEMING-EN-WHITELABEL.md)                        | Resolver, CSS-tokencontract, tenantinstellingen, assets, metadata, e-mail/PDF en testprofielen                                                           |
| [03-PAGINAS-FEATURES-EN-ACTIES.md](./03-PAGINAS-FEATURES-EN-ACTIES.md)              | Informatiearchitectuur, paginapatronen, alle domeinen en actieplaatsing                                                                                  |
| [04-PLANBORD.md](./04-PLANBORD.md)                                                  | Functioneel, visueel en technisch planbordcontract                                                                                                       |
| [05-RESPONSIVE-EN-TOEGANKELIJKHEID.md](./05-RESPONSIVE-EN-TOEGANKELIJKHEID.md)      | Desktop-first responsive gedrag, mobiel, keyboard, touch, zoom en WCAG                                                                                   |
| [06-IMPLEMENTATIERUNBOOK.md](./06-IMPLEMENTATIERUNBOOK.md)                          | Werkpakketten, afhankelijkheden, branches, featureflag, integratie en stopvoorwaarden                                                                    |
| [07-ACCEPTATIE-RELEASE-EN-ROLLBACK.md](./07-ACCEPTATIE-RELEASE-EN-ROLLBACK.md)      | Gates, bewijs, testmatrix, pilot, release en rollback                                                                                                    |
| [08-CODEX-MASTERPROMPT.md](./08-CODEX-MASTERPROMPT.md)                              | Direct uitvoerbare opdracht voor implementerende Codex-agents                                                                                            |
| [09-PR-TEMPLATE.md](./09-PR-TEMPLATE.md)                                            | Verplicht PR-bewijs per werkpakket                                                                                                                       |
| [10-RISICOREGISTER.md](./10-RISICOREGISTER.md)                                      | Bekende P0/P1-blokkers, eigenaar en sluitbewijs                                                                                                          |
| [fieldflow-tokens.json](./manifests/fieldflow-tokens.json)                          | Machineleesbaar visueel en responsive contract                                                                                                           |
| [theme-derivation.json](./manifests/theme-derivation.json)                          | Deterministische raw-themevalidatie, semantische afleiding, fallback en native runtime-output                                                            |
| [component-states.json](./manifests/component-states.json)                          | Alle zichtbare primitive-, data-, overlay-, feedback- en responsive componentstates                                                                      |
| [component-api-contract.json](./manifests/component-api-contract.json)              | Autoriteit voor de exacte publieke API, state ownership, events, fout-/focuscontracten en vier compile-fixtures van `EntityWizard` en `FormErrorSummary` |
| [component-source-coverage.json](./manifests/component-source-coverage.json)        | AST-exacte classificatie van iedere named export als state-owner, composite of gemotiveerd non-visual                                                    |
| [routes.json](./manifests/routes.json)                                              | Machineleesbare Fieldflow-presentatie, exacte productiecapability-/actie-ID’s, archetypen, states en responsive contract                                 |
| [navigation-contract.json](./manifests/navigation-contract.json)                    | Autoriteit voor taakgroepen, routeparents, gedeelde sidebar/mobile/command-palettevolgorde, labels, iconen, matching, breadcrumbs en help-/zoekcontext   |
| [production-inventory.json](./manifests/production-inventory.json)                  | Brongetrouwe bestaande features, acties, permission/module/flag-gates en bronsymbolen                                                                    |
| [planboard-actions.json](./manifests/planboard-actions.json)                        | Autoriteit voor alle deterministische planboardcommands, payload-/response-unions, permissions, conflicts, confirmation, idempotency, receipts en undo   |
| [mismatch-traceability.json](./manifests/mismatch-traceability.json)                | Autoriteit voor iedere bekende UI/server-availabilitymismatch, gekoppelde eisen/risico’s en verplicht herstel- en bewijscontract                         |
| [acceptance.json](./manifests/acceptance.json)                                      | Machineleesbare acceptatie- en traceability-eisen                                                                                                        |
| [verification-matrix.json](./manifests/verification-matrix.json)                    | Autoriteit voor de deterministische requirement-/subject-/assenbinding en alle 802.213 geplande verificatietuples en hashes                              |
| [verification-matrix.schema.json](./reference/verification-matrix.schema.json)      | Fail-closed JSON Schema-autoriteit voor de vorm, verplichte velden en gesloten vocabularies van de verificatiematrix                                     |
| [surfaces.json](./manifests/surfaces.json)                                          | Uitputtende whitelabeldekking, themabron, bronpaden, bewijs en expliciete uitsluitingen                                                                  |
| [risks.json](./manifests/risks.json)                                                | Machineleesbare lifecycle en sluitbewijs voor alle 50 P0/P1-risico's                                                                                     |
| [contract-root.json](./manifests/contract-root.json)                                | Extern te registreren digestvector en trustpolicy tegen gecoördineerde contract-/hashdrift                                                               |
| [visual/manifest.json](./evidence/visual/manifest.json)                             | Afmetingen en SHA-256 van de referentiebeelden                                                                                                           |
| [visual/capture-contract.json](./evidence/visual/capture-contract.json)             | Negen desktop-pixelbaselines plus negen afzonderlijke mobiele productiecontracten voor layout, spacing, Axe, keyboard en touch                           |
| [visual/canonical-theme.css](./evidence/visual/canonical-theme.css)                 | Gehashte capture-only bridge van de canonieke themefixture naar de prototypevariabelen                                                                   |
| [visual/reference-normalization.css](./evidence/visual/reference-normalization.css) | Gehashte, uitsluitend voor prototypecapture toegestane WCAG/44px-normalisatie                                                                            |
| [prototype/source-manifest.json](./evidence/prototype/source-manifest.json)         | Gehashte, buildbare bronarchive van exact de gekozen prototypecommit                                                                                     |
| [reference/theme-derivation.mjs](./reference/theme-derivation.mjs)                  | Uitvoerbare referentie-implementatie van validatie, afleiding, integriteit en fail-closed fallback                                                       |
| [reference/theme-derivation.test.mjs](./reference/theme-derivation.test.mjs)        | Positieve, adversarial, cache-isolatie- en native runtimefixtures                                                                                        |

## Autoriteit bij conflict

1. Security-, tenantisolatie-, permission-, lifecycle- en datainvarianten uit productiecode en `AGENTS.md`.
2. Dit pakket en de machineleesbare manifesten.
3. Vastgezette Fieldflow-referentiebeelden en de prototypebron op de genoemde commit.
4. Bestaande UI/UX-documentatie.
5. De veranderlijke live prototype-URL.

Een visueel detail mag nooit een productie-invariant breken. Een productiecomponent mag evenmin als reden worden gebruikt om zonder vastgelegd besluit van Fieldflow Calm af te wijken.

## Verplichte startvolgorde

1. Lees `AGENTS.md`, dit README en alle genummerde documenten.
2. Voer `pnpm fieldgrid:fieldflow-calm-handoff:check` uit.
3. Synchroniseer de integratiebranch gecontroleerd met de actuele `main`-HEAD.
4. Leg een actuele legacybaseline vast voordat UI-code wordt gewijzigd. `BASELINE_READY` vereist negen scenario-/contract-/runtimegebonden desktop-PNG's met per desktoprecord vijf gevalideerde JSON-artefacten én negen mobiele productiescreenshots met per mobiel record acht gevalideerde JSON-artefacten (DOM, geometry, styles, setup, runtime-errors, Axe, keyboard en touch). Iedere set heeft een Artifact Attestation en onafhankelijke live `product-design`- en `visual-a11y`-reviews op exact HEAD.
5. Werk uitsluitend in de volgorde en branchstructuur uit het runbook.
6. Markeer een eis pas als geverifieerd wanneer code, test en runtimebewijs bestaan.

## Expliciete niet-doelen

- Geen nieuwe visuele varianten.
- Geen functionele versimpeling om het prototype na te bootsen.
- Geen nieuwe componentbibliotheek naast `components/ui`.
- Geen client-side, querystring- of localStorage-keuze voor de productie-ervaring.
- Geen schemawijziging voor de designselectie. De afzonderlijke W01 forward
  migration voor assetmodes, `theme_revision` en immutable
  document-appearance-snapshots is wél verplicht en krijgt eigen lege-DB-,
  upgrade-, rollback- en tenantisolatiebewijs.
- Geen globale `main`- of `staging`-commit.
- Geen automatische baseline-update zonder menselijke review.
