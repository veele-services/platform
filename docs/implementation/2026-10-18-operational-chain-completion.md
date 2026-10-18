# Operationele ketens: implementatiematrix

Baseline: `caf992acd9815eef2106042769387058d225e7fd` (`main`, 18 oktober
2026 gecontroleerd). Implementatiecommit: `9fef4f2d`. Deze matrix onderscheidt aanwezige bouwstenen, herstelwerk
en nieuwe functies. De status wordt tijdens de uitvoering bijgewerkt; een rij is
pas geaccepteerd als database, server, UI, rechten en de genoemde ketentests
samen slagen.

| Gebied | Hergebruiken | Herstellen | Nieuw | Belangrijkste bestanden | Acceptatie |
| --- | --- | --- | --- | --- | --- |
| Capaciteit en matching | `work_orders`, assignments, `availability`, planbordlocks, reisstatus | Vaste weekbeschikbaarheid aansluiten; één preview-/commituitkomst; inzetfunctie zonder dubbeltelling | Serverresolver, dekkingsmodel, capaciteit dag/week en uitlegbare kandidaten | `lib/planning/*`, planbordcomponenten, nieuwe voorwaartse migratie | CAP-01–06, SEC-01, UX-01 |
| Kwalificaties en kennis | `qualification_types`, requirements, certificates, `qualified_for_period`, evidence snapshots | Open diensten, interesse en planning dezelfde evaluator; functiecontext corrigeren | Versiegebonden taakrevisie-eisen en gerichte herbeoordeling | Personeelsdossier-/planningmigraties, taakcatalogus, planbord | KWA-01–06, SEC-01, MIG-01 |
| Materiaal | `work_order_material_usage`, rapportcontrole, factuurallocaties | Onbekend versus inbegrepen; commerciële beoordeling afsplitsen | Tenantcatalogus, onveranderlijke usagesnapshot en typed factuurbron | werkbon-/finance-migratie, `lib/finance`, rapport/PDF/UI | MAT-01–06, FAC-04, SEC-01, MIG-01 |
| Contractplanning | Agreements, series, occurrences, handmatige generatie en indexatiemapping | Datum-effectieve contractregel over indexatiegrens | Gestructureerde regels, preview/lifecycle/uitzonderingen, opt-in workerbatch | recurrence, commercieel, worker, contract-/reeks-UI | HER-01–08, SEC-01, MIG-01 |
| Verzamelfacturen | Eén factuur uit meerdere werkbonnen, bestaande prijs-/bronregels | Expliciete benaming, broncontext, sterke requestfingerprint en paginabrede filters | Gezamenlijke preview met taken/materialen/meerwerk en bronverdeling | finance-acties/-projecties, invoice snapshot/PDF/portaal | FAC-01–06, SEC-01, MIG-01 |
| Betaalbatches | Invoice groups, attempts, allocations, leases/webhooks | Externe link dezelfde merchantcontrole; status van reservering tonen | Atomaire groep/items/tokenopdracht en legacy-reconciliatieactie | payment route/merchant, finance actions, betaalmigratie/UI | BET-01–08, SEC-01, MIG-01 |

## Vastgelegde defaults

- Onbekende beschikbaarheid telt niet als zekere capaciteit. Een planner kan
  alleen een zachte afwijking voor één inzet bevestigen; harde afwezigheid,
  overlap en verplichte kwalificaties blijven blokkeren.
- Intervallen zijn halfopen. Zakelijke datum- en weekroosterberekeningen
  gebruiken de tenanttijdzone; een rooster wordt nooit uit contracturen afgeleid.
- Een inzetfunctie is een vakfunctie uit `function_catalog`, geen applicatierol.
- Uploaden is geen verificatie. Bewijs moet geldig zijn voor de volledige inzet;
  de einddatum is inclusief tot 00:00 van de volgende kalenderdag.
- Materiaal met een prijsvoorstel is niet factureerbaar zonder afzonderlijke
  financiële goedkeuring. Oude regels worden niet automatisch goedgekeurd.
- Contractautomatisering staat standaard uit en maakt uitsluitend conceptbonnen.
  Zes weken is de standaardhorizon en 26 weken de bovengrens.
- Een verzamelfactuur maakt één factuur uit meerdere bronbonnen. Een
  betaalbatch betaalt meerdere bestaande facturen en verandert hun nummers of
  documenten niet.

## Bewijsstatus

| Stap | Status |
| --- | --- |
| Baseline/architectuur/laatste SQL-definities gecontroleerd | Gereed |
| Gerichte databaseketens voor planning, facturen, betalingen, rapporten en contracten | Groen op lokale Supabase |
| Verse database-installatie | Groen met volledige `db reset` |
| Upgrade vanaf `20261016001315` met representatieve legacydata | Groen; IDs/historie behouden en nieuwe defaults gesloten |
| Typecheck en lint | Groen; lint bevat uitsluitend 38 bestaande marketingwaarschuwingen |
| Brede unit-, build- en securitygates | Groen: 208 Vitest-bestanden / 2.002 tests, productiebuild, migratiemanifest en 1.418 autorisatieoppervlakken |
| Volledige databasegate | Groen: 398 pgTAP-tests en 729 Node-integratietests op een verse lokale Supabase-installatie |
| Volledige browserreleasegate | Groen: 135/135 Playwright-scenario's met fail-closed lokale ClamAV-scan; desktop-, tablet- en mobiele bewijzen bekeken |
| Stagingpromotie en exacte health/worker | Wacht op review en groene main-CI |
| Echte Mollie-testmodusacceptatie | Externe acceptatie; nog niet uitgevoerd |

## Schema en migratiekeuzes

De voorwaartse migratie `20261017232527_operational_chain_completion.sql`
voegt additief toe:

- betaalbatchreceipts en een atomaire, payloadgebonden batchopdracht;
- vereiste vakfunctie, inzetbewijs en één gedeelde personeelsfitresolver;
- taakrevisie-eisen, bewijssoorten en een kwalificatie-opvolgqueue;
- materiaalcatalogus, commerciële beoordeling, catalogussnapshot en typed
  materiaalbron op factuurregels;
- factuurreceipts met genormaliseerde bronfingerprint;
- contractlifecycle, horizons, voorkeursmedewerkers, failure register en
  service-only workeropdracht;
- expliciete tenantopt-in voor contractautomatisering.

Bestaande materiaalprijzen worden uitsluitend `proposed` of `unknown`.
Bestaande reeksen blijven `manual`; tenant- en reeksautomatisering blijven uit.
Historische factuurregels zonder typed bron blijven bestaan via een `NOT VALID`
constraint, maar nieuwe of gewijzigde regels moeten precies één geldige bron
hebben. Een oude betaalpoging zonder merchantprofiel wordt niet met het huidige
profiel ingevuld.

## Acceptatiekaart

| ID-groep | Geautomatiseerd bewijs | Actuele grens |
| --- | --- | --- |
| CAP-01–06 | `test-planboard.mjs`, gedeelde resolver, capaciteit, vrijgaveguard en volledige planbord-E2E | Stagingtijdzone en worker worden na promotie opnieuw gecontroleerd |
| KWA-01–06 | `test-operational-chain.mjs`, dossier-, release-security- en personeels-E2E | Toekomstige intrekkingen blijven als actie in de bestaande opvolging zichtbaar |
| MAT-01–06 | bronfactuur-, rapport- en staffprivacytests | Correctie gebruikt blokkade/opvolging; geen nieuwe creditmodule |
| HER-01–08 | `test-operational-chain.mjs`, upgradepad, recurrence-unittests en workerroute-build | Staging-workeracceptatie staat nog open |
| FAC-01–06 | `test-source-invoice-list.mjs`, rapport-/portaal-/PDF-tests en dossier-/factuur-E2E | Echte boekhoudexport valt buiten deze opdracht |
| BET-01–07 | payment-security, customer-payment en concurrencytests | Legacy zonder profiel blijft zichtbaar geblokkeerd; BET-08 extern open |
| SEC-01 | bestaande autorisatiegates, nieuwe directe RPC-negatieve tests en `security:review` over 1.418 oppervlakken | Staging blijft aan de bestaande omgevingsgrenzen gebonden |
| MIG-01 | `test-operational-chain-upgrade.mjs` | Staging forward migration volgt na review |
| UX-01 | 135/135 browsertests; capaciteit en beschikbaarheid visueel bekeken op desktop/tablet/mobiel | Nog niet als staging geaccepteerd |

De gebruiksinstructies staan onder `docs/help`; routes, rechten en
omgevingsstatus staan in
`docs/operations/operational-chain-availability-register.md`. De bekeken
screenshots en hun herkomst staan in
`docs/operations/evidence/2026-10-18-operational-chain/README.md`.
