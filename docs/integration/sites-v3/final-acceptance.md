# Sites v3: integratie- en acceptatierapport

## Resultaat en herkomst

De 105 regels uit de meegeleverde schermen-/actiematrix zijn geïmplementeerd en lokaal getest. De [matrix per regel](acceptance-matrix.md), het [machineleesbare register](screen-register.json) en de 26 faseverslagen koppelen iedere regel aan concrete implementatie en bewijs. Dit is geen verklaring dat alle onderdelen al gedeployed of live geaccepteerd zijn. Die statussen staan afzonderlijk in [release-status.json](release-status.json).

Uitgangspunt is main `71df59ab0390ffeae482c7edbaf27efe3fa6546d`. Later lokaal werk is behouden op `codex/sites-v3-integration`; er is geen baseline-reset, migratievervanging of force-push gebruikt. Alle 344 pakketchecksums zijn geverifieerd. De 279 geregistreerde bronbestanden, inclusief afbeeldingen, fonts, componenten en teksten, zijn ongewijzigd als ontwerpreferentie opgenomen. Sites-hosting, D1, hashrouter en ownerheader-fallback zijn geen productiearchitectuur geworden.

De [hergebruik/uitbreiden/nieuw-matrix](integration-matrix.md) legt de keuzes vast. Bestaande Next-/Supabase-/workerprocessen blijven de mutatie- en autorisatiegrens. Op de broncomponenten zijn data-, route- en serveradapters aangesloten; oorspronkelijke DOM/klassen en declaraties zijn geïsoleerd met scope-/fontaliassen. Er is geen vervangend standaarddashboard ingevoerd.

## Echte ketens en regressies

| Controle | Uitkomst en bewijs |
| --- | --- |
| Schone migratieopbouw | Alle 178 migraties; 40 additieve migraties, geen wijziging aan de 138 baseline-migraties. [Replay](evidence/final/clean-replay-178.log), [manifest](evidence/final/migration-manifest.log). |
| Databaseprocessen | [723 native checks](evidence/final/native-db-723.log), inclusief autorisatie, transacties, CAS, idempotentie en concurrentie; daarnaast [398 pgTAP-checks](evidence/final/pgtap-398.log). |
| Unit- en bronchecks | [1.998 tests in 208 bestanden](evidence/phase-26/unit-1998.log); [bronintegriteit](evidence/final/source-integrity.log); lint nul fouten, 38 waarschuwingen in de volledige run. |
| Security | [35 catalogus-/releasechecks](evidence/final/security-catalog-35.log), [tien echte HTTP/Auth/Data API/Storage/Realtime-checks](evidence/final/security-http-10.log), [advisor](evidence/final/security-advisors.log) zonder meldingen. [1.418 oppervlakken](../../security/sites-v3-authorization-review-2026-10-16.md) hebben een expliciete beoordeling. |
| Marketing | [23 routes × vijf breedtes](evidence/final/marketing/comparison.json): 115 bron-/doelparen, nul browserfouten/overflows, canonical/sitemap/robots, links, redirects en hostgrenzen. De werkelijke [formulierketen](evidence/final/public-forms.json) omvat trialwizard, telefonische afspraak/demo, één lead met drie snapshots/taken, dossierhistorie en ICS. |
| Platform/CRM | [18 volledige browserketens](evidence/phase-25/result.json): echte SMTP/OTP, primaire registry, pipeline/drag/filters/dossier, telefonische reservering en concurrent conflict, taakmutaties, publieke beschikbaarheid, centrale mailclaim/freeze/veilige retry, verloren response, filterrace, 503-herstel, 403-intrekking en werkende overzichtsacties/-regels. |
| Personeel | [16 browserketens](evidence/phase-23/result.json): eigen toegewezen uitvoering, pauze/hervatten, taken, versiegebonden rapport, uren/correctie, verlof/beschikbaarheid, gescande privé-PDF, profiel, nieuws/content/tickets en echte OTP-/PWA-herinneringscyclus. |
| Klant | [18 browserketens](evidence/phase-24/result.json): expliciete klant-/object-/bezoekbinding, contact/instructiehistorie, vrijgegeven rapporten, gefinaliseerde factuur/private PDF, dienstenaanvraag, profiel/voorkeuren, meerdere accounts, intrekking, centraal nieuws en beoordeelde klant→tenant→Fieldgrid→publieke terugkoppeling. |
| Gebundelde release | [Standaard koude build](evidence/final/build.log), 108 pagina’s; [vier materialisatietests](evidence/final/materialization.log); [standalone-opstart](evidence/final/artifact-smoke.log); [exacte lokale SHA en database/scanner ready](evidence/final/artifact-health.json). [Volledige worker](evidence/final/worker-http-final.json) 200/ok, geen failed/uncertain. |
| Credentials | [Bronscan](evidence/final/source-secret-scan.log) en [browserartifactscan](evidence/final/browser-secret-scan.log) zonder herkende credentialpatronen. Dit bewijst niets over onbekende formaten en vervangt geen review. |

De actuele lokale runtime is het verpakte artifact `6505f47e5b61566af57e197b862f6ee47d6798d4` (1.2.0-rc.1). Personeel/klant zijn volledig herhaald op `60561a0d2a7dafbf9b57912b1a42ce9ebd0fd103`; latere integratiecorrecties en de native hercontrole staan afzonderlijk in fase 26. Formulierketens zijn daadwerkelijk via de browser uitgevoerd op `35a447848e0604d61293591513e6304d123f71b1`; de latere publieke wijzigingen betreffen de oorspronkelijke footer, feitelijke FAQ-copy en leesbare lange mobiele koppen. Alle gebruikte accounts, ontvangers, documenten en tenantfixtures zijn fictief en lokaal. Testaccounts zijn na afloop buiten gebruik gesteld; audit is behouden.

Lokale SMTP is echte Mailpit-bezorging en echte OTP-verificatie. De SendGrid-transportgrens is uitsluitend voor deze lokale runtime vervangen door een strikt `.invalid`-transport. Policy, outbox, worker, bevroren inhoud en retry blijven echt. Er is geen externe bezorgingsclaim, gesimuleerde betaalbevestiging of claim van installatie op een fysiek apparaat. De extra dossierstep-up gebruikt een synthetische lokale challenge-/delivery-/verify-cyclus; dit is afzonderlijk van de echte primaire SMTP-login vastgelegd.

## Bekeken bronvergelijkingen

De [bekekenlijst](evidence/final/viewed-checkpoint.json) en acceptatieregisters voor [personeel](evidence/phase-23/acceptance.json), [klant](evidence/phase-24/acceptance.json) en [CRM/platform](evidence/phase-25/acceptance.json) onderscheiden daadwerkelijk bekeken regio’s van alleen gemaakte captures. De eerdere fasen 1–22 bevatten hun eigen bekeken beelden en regressiebewijs. Geen gegenereerde screenshot wordt automatisch als bekeken aangemerkt en pixelmetingen worden niet als menselijke acceptatie voorgesteld.

Desktop, tablet en mobiel zijn bekeken op 1440, 768 en 390 px. De publieke crawl controleert daarnaast 1024 en 320 px. Alle 23 publieke routes zijn visueel vergeleken; de definitieve review omvat ook onderste paginaonderdelen/footer, mobiele bronafsnijding en de volledige platformonderkant met alle acht acties. Beide portalen hebben twaalf hoofdpagina’s op drie breedtes en concrete vensterbeelden. De definitieve review bekijkt per hoofdpagina een bron-/doelpaar, verdeeld over drie breedtes, met aanvullende werkbon-, ticket-, document-, profiel-, PWA-, object-, bezoek- en factuurvensters. Overgenomen oorspronkelijke lettertypen zijn ook via de werkelijk gerenderde fontmetadata gecontroleerd.

Noodzakelijke verschillen blijven beperkt en worden per fase gemotiveerd:

- Prototypewaarschuwingen worden feitelijke ontvangst-/fout-/privacyteksten; demo-import en demo-bedrijfsdata worden niet gepubliceerd. Privacy is feitelijk gemaakt, maar definitieve publieke bedrijfs-/contactgegevens wachten op inhoudelijke bevestiging.
- Huidige rechten, echte bedragen/statussen/registraties, geversioneerde instructies, beveiligde originele bestanden, native betaal-/rapport-/ondertekenprocessen en dossierbediening blijven behouden. Native aanvullende velden staan waar mogelijk onder een gerichte uitklapbare sectie.
- Geregistreerde beheerders en doorzoekbare, begrensde leadkeuzes vervangen vrije prototypewaarden. Serverpaginatie, actuele aantallen, feedback en pending-/sluitblokkades voorkomen gegevensverlies of een vals succes. Supportinformatie vereist eigen leesrechten, ook als de demo fictieve tellers toont.
- Een oorspronkelijke lange sectorkop sneed op smalle schermen tekst en bediening af. Alleen de tekstkolom kan daar krimpen en lange woorden mogen afbreken; fonts, afmetingen en kleuren zijn behouden. Dialogen behouden de bestaande toegankelijke focus-/toetsenbordgrenzen.
- Kleine native CSS-bruggen herstellen bronafstand/padding door een pendingveldset, mobiel tabelkrimpen en het broncockpitraster. Een werkelijk onbereikbaar logo krijgt initialen; de beveiligde bestandsroute blijft gesloten.

## Hosting en concrete externe voorwaarden

`www.fieldgrid.nl` is het gewenste productieadres. De expliciete www-dispatch gaat vóór platformlogin naar een uniek intern marketingpad. `www.fieldgrid.nl/platform` is productuitleg; `fieldgrid.nl/platform` blijft privébeheer. `APP_URL`, platform- en tenantdomeinen zijn behouden. Er wordt geen tenant `www` aangemaakt. Staging gebruikt `www.staging.fieldgrid.nl` en blijft noindex.

De bestaande procedure blijft verplicht: beoordeelde main-SHA → groene CI → bewuste stagingpromotie → backup/voorwaartse migratie/attestatie/atomische activatie → exacte publieke SHA met database/scanner ready → verse workeracceptatie. Dit rapport autoriseert geen ongevraagde DNS-, Caddy-, systeemrechten- of productieaanpassing.

Nog apart te bewijzen: hosted resultaten en live private ketens met echte toegestane accounts, de geconfigureerde geregistreerde primaire platformbeheerder en feitelijke externe providerbezorging, fysieke Android-/iOS-installatie, echte betaalprovideracceptatie waar van toepassing en definitieve publieke juridische contactgegevens. DNS/TLS voor het nieuwe www-adres en productieacceptatie worden als concrete operator-/releasefeiten bijgehouden, zonder ontbrekende waarden te verzinnen of gates te verlagen.


De [native browserhercontrole](phase-26.md) bewaart de brede 134-case run met 127 geslaagde, vijf mislukte en twee niet uitgevoerde gevallen. Alle betrokken gevallen slagen vervolgens in acht gerichte herhalingen. De concrete oorzaken, testserver-/schijfruimteproblemen en herstelde bediening zijn bewaard; dit wordt niet als een groene volledige run voorgesteld. Een volledige groene GitHub-CI op de exacte te promoveren commit blijft vereist.
