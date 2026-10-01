# Releasebevindingen — 1 oktober 2026

**NO-GO.** Lokale reparatie is geen staging- of volledige vrijgaveverificatie.
De query-first SQL-reparaties zijn vastgelegd in zestien forward-migraties van
`20261001013206_release_security_privacy.sql` tot en met
`20261001091500_release_public_commercial_entitlements.sql`, gevolgd door de
security-gate en objectdocument-descriptorfix. Alle 55 migraties zijn lokaal
schoon afgespeeld; bestaande werkbon-/notificatie-/uitnodigingshistorie is in drie aparte
upgradeproeven tot en met migratie 54 behouden; migratie 55 is daarna in de
schone replay en volledige DB-suite getoetst. Dit is geen bewijs van het
werkelijk uitgerolde stagingschema.

| ID | Grens / bewijs vóór herstel | Huidige stand |
| --- | --- | --- |
| BASELINE-01 | Platformprincipal zonder membership leest tenantklant | Impliciete platformbypass verwijderd; negatieve en positieve lokale test slaagt |
| BASELINE-02 | Ingetrokken membership/verwijderde sessie behoudt toegang | Actuele sessie, account, membership en tenant vereist; oude JWT na intrekking via Data API/RPC/Storage getest |
| BASELINE-03 | Medewerker leest factuurmail en alle klantcontacten | Raw CRM afgeschermd; minimale klantprojectie, backoffice blijft werken |
| BASELINE-04/05 | Privérapport en Storagemetadata van collega bereikbaar | Eigen auteur/uploader/rapportnamespace afgedwongen; vervalste metadata en echte Storage HTTP-acties getest |
| BASELINE-06 | Betaalconsumer negeert tokenintrekking | Gedeelde purpose/hash/expiry/consumed/revoked-controle; gerichte tests geslaagd |
| BASELINE-07 | Slash/backslash redirect wordt externe URL | Gedeelde normalisatie/allowlist; login/callback-regressies geslaagd |
| VAULT-01/02 | Assignment zonder staffrol; metadata buiten itemscope | Expliciete rol en itemscope; Object 360-negatieve en positieve controles geslaagd |
| FILES-PATH | Eigen metadata wijst naar andere tenant/persoon/factuur | Exacte namespace bij schrijven én lezen; onveilige historie faalt gesloten zonder gegevens te verwijderen |
| FILES-REVOKE | Signing omzeilt intrekking; alleen controle vóór I/O | Private signing geblokkeerd; actuele broncontrole vóór/na bytes of PDF-render; 46 handler/downloadtests geslaagd |
| WORKORDER-TASK | Collega-ID/notitie in taakprojectie; wijzigen van andermans toegewezen taak | Gedeelde uitvoeringscontrole en whitelistprojectie; replay en eigen uitvoering getest |
| WORKORDER-REPORT | Rapport/checklist omzeilt eigen-bijdragegrens; klant ziet medewerkershandtekening | Eigen-bijdrage/klantprojectie plus assetcontrole; oorspronkelijke snapshot/hash/ondertekening bewaard en getest |
| WORKORDER-CHECKLIST | Privacyfilter verbergt noodzakelijke conditionele vervolgvraag | Onafhankelijke reviewbevinding hersteld: server levert booleaanse vraagstatus. Eigen vervolgvraag werkt, andermans antwoord/foto niet overneembaar |
| WORKORDER-RESULT | Uitvoerings-RPC geeft created_by/lead/planner terug | Expliciete operationele whitelist; eerste antwoord én idempotente replay getest |
| REALTIME-DELETE | Ongefilterd kanaal ontvangt ID van verwijderd privérapport collega | Via echte Realtime gereproduceerd; publication beperkt tot INSERT/UPDATE. Negatieve test plus positief WAL-controle-event slagen |
| MAIL-FILE | Uitgestelde verzending vertrouwt tenantprefix bestandspad | Bron, tenant, ouder, vast pad, digest en actuele ontvanger gecontroleerd; RPC-grants en hash-/I/O-grenzen getest |
| FILES-SCAN | Dossier-/rapport-/logo-/factuuruploads publiceren buiten ticketquarantaine zonder scan | Eén servergateway scant alle niet-ticketbestanden; raw Storage writes geweigerd, leesbewijs gebonden aan objectversie/hash; echte ClamAV/Storage-tests slagen |
| FILES-SCAN-REVIEW | Nieuwe uploadcontrole miste plannerrol/modulecontrole; bestaande offerte-PDF werd na vertraagde scan zonder hercontrole gebruikt | Canonieke `commercial_member` en actuele toegang vóór mailclaim/verzending; planner/module- en intrekkingstests slagen |
| DEPLOY-TARGET | Standalone scripts konden op workflowpreflight vertrouwen; bootstrap las lokale env; omgevingsopties konden DB-routering beïnvloeden | Zelfstandige guards, vast project/poort/rol, CA/TLS-verificatie, geen `.env`-fallback of ambient PG-routing; gerichte tests slagen |
| DEPLOY-BACKUP | Backupcredential in procesargumenten / retry kon herstelpunt overschrijven | PG-childenvironment, privaat tijdelijk dumpbestand, `pg_restore --list`, atomische nieuwe naam bij retry; adaptertests slagen |
| TRAVEL-SCOPE | Rol-/assignmentintrekking tijdens provider-I/O; historische eerdere assignment onthult oude privéroute | Actuele actor/sessie/velden en predecessor opnieuw geautoriseerd; snapshot ongewijzigd bewaard; gerichte unit-, DB- en browsertests slagen |
| PAYMENT-INTEGRITY | Finance kan providerbewijs/saldi rechtstreeks wijzigen; uitgegeven bundel kan van klant/inhoud wisselen | Providerwrites service-only, onveranderlijke uitgegeven koppelingen, exact bedrag/valuta/modus/identiteit en geauditeerde handmatige uitzondering; directe actorproeven slagen |
| PAYMENT-RETRY | Onafhankelijke review: definitief mislukte poging blokkeert nieuwe checkout; losse inserts kunnen gedeeltelijke allocatie achterlaten | Atomische `prepare_provider_payment`, vaste lockvolgorde, veilige retry/repair van lege ongebonden poging; rollback en historie getest |
| BROWSER-STATE | Privézoekterm/URL blijft in browseropslag; Back maakt uitlogscherm vrij; vertraagde hydration bindt oude pagina aan nieuw account | Minimale cosmeticavoorkeuren, sessiegebonden SSR-scherm, blijvende uitlogstatus en huidige identiteitscontrole; gedeelde browsercontext daadwerkelijk getest |
| HR-LEGACY | Oude interne HR-notities/contractgegevens via eigen personeels-RLS leesbaar; noodcontacten voor planner; document-JSON via staffprojectie | Raw HR via `dossier_access`, column grant ingetrokken, minimale eigen documentlijst/downloaddescriptor; positieve selfservice- en negatieve privacyproeven slagen |
| HR-ABSENCE | Planner leest ziek/verlof, vrije toelichting en interne dossierverwijzing via `availability` en workspacepayload | Raw inzage alleen HR/eigen persoon; expliciete operationele projectie redigeert reden/bron-ID voor planner. Sessieverval, module, membership, HR en eigen updates getest; onafhankelijke hercontrole vond geen bypass/regressie |
| PLATFORM-LIFECYCLE | Gewijzigde/reeds voltooide onboardingretry kon tenantownership opnieuw verlenen; afgeleide platformgrants bleven na intrekking bestaan | Gecontroleerde oorspronkelijke ontvanger, fingerprint en eenmalige binding; bootstrapgrants apart ingetrokken. Echte concurrentie, Auth/HTTP en historische upgrade getest |
| MODULE-LIFECYCLE | Tenant kon platformmodules wijzigen door settings te vervangen/verplaatsen; definers retourneerden secundaire moduledata en oude replayresultaten | Gedeelde lifecycleguard, huidige entitlements vóór reads/replays; personeels-only werkt. Elf gerichte module-DB-tests plus bestaande flows |
| EXCEPTION-PRIVACY | Medewerker zag andermans werkbonmeldingen en kon collega-bijlage koppelen | Auteur-/uploader-/namespacecontrole; verborgen behandelaar-ID; null-safe resolveversie. Drie negatieve/positieve scenario's in release-DB-suite |
| OBJECT-CUSTOMER | Klantverplaatsing van een object met portaalbinding verschoof de documentbevoegdheid mee | Bestaande toegang/historie blokkeert reassignment; ongebruikt object blijft corrigeerbaar. Gedeeld slot voor RPC en directe binding, concurrentie getest |
| TRAVEL-DAY-OWNER | Operationele write kon andermans dagadres herplaatsen, wijzigen of wissen | Persoon/datum/tenant onveranderlijk; privéwrites vereisen bestaande privébevoegdheid; gewone reisinstellingen behouden |
| CUSTOMER-LIFECYCLE | Generieke statusupdate en DELETE/heraanmaak omzeilden beheer-only archiveren/herstellen | Gedeelde status-/DELETE-guard; normale profielwijziging en bevoegd verwijderen behouden |
| FINANCE-HISTORY | Definitieve regels verwijderbaar/verplaatsbaar; live hoeveelheden en klantobjectscope konden afwijken van bevroren factuur | OLD-parentguard en bronidentiteit; definitieve header/regels blijven bewaard, concept verwijderen blijft mogelijk |
| MODULE-CUSTOMER-FINANCE | Klantcommercial-definers en finance-replays bleven leesbaar na moduleblokkade | Huidige Planning/Finance vóór scope en resultaat; geen onbewezen nieuwe financiële writebypass geclaimd |
| PUBLIC-COMMERCIAL-MODULE | Publieke intake, offertebeslissing/-bestand en boeking bleven via service-rolepaden bruikbaar nadat Planning was uitgezet; bestaande commandreplays konden resultaten blijven geven | Eén private entitlementpredicate vóór fresh write én replay; pagina/actions en offertebestand weigeren gesloten. DB-, helper- en echte browserproef voor offerte/boeking slagen; publieke intake vereist nog staging-wildcardacceptatie |
| WORKFLOW-SECRET-SCOPE | Stagingsecrets stonden op jobniveau en werden daardoor ook aan checkout/setup/install aangeboden; externe actions gebruikten beweeglijke major-tags | Officiële actions op volledige commit-SHA vastgezet; ieder secret staat alleen op de noodzakelijke stap. Generieke workflowtest weigert toekomstige externe niet-SHA-referenties en jobniveau-secrets |
| WORKER-ARGV | De worker gaf `ADMIN_API_SECRET` als geïnterpoleerde curl-header in de procesargumenten mee | Kleine Node-client leest het secret uitsluitend uit de runtimeomgeving, verstuurt alleen loopback en logt geen header/responsebody; systemd verbergt vreemde processen aanvullend |
| DEPLOY-ROLLBACK | Na toegepaste forward-only securitymigraties kon een healthfout automatisch de vorige, niet aantoonbaar compatibele applicatiecode terugzetten | Automatische coderollback verwijderd; de exacte kandidaat blijft voor diagnose en forward-fix. Test bewaakt dat geen oude symlink na de healthcheck wordt hersteld |
| LIFECYCLE-REVIEW | Eerste kandidaat had race bij gelijktijdige objectbinding, archive-DELETE-bypass en slotcyclus bij betaling/finalisatiereplay | Onafhankelijke review, gerichte reproductie en correctie; oorspronkelijke DELETE-bypass en slotcyclus rood, daarna groen; RPC/directe objectbinding en legitieme betaling getest |
| NOTIFY-GRANT | Begrensde gedelegeerde kon bestaand breder/anders begrensd recht vervangen; scopecontrole vóór rowlock liet gelijktijdige wijziging toe | Bestaande én gevraagde scope vóór verificatie en na slot gecontroleerd; save/revoke-races met echte verbindingen getest; legitieme begrensde aanpassing behouden |
| NOTIFY-DRAFT | Tenantbeheer kreeg ongepubliceerd platformconcept te zien en kon dit als eerste tenantoverride overnemen | DTO, revisiecontrole en eerste kopie gebruiken alleen gepubliceerde platformversie; eigen platform-/tenantconcepten blijven bewerkbaar |
| NEWS-RECEIPT | Eigen leesbevestiging kon van tenant/bericht wisselen en bleef bereikbaar na intrekking | Huidige sessie/membership/module en berichtaudience vereist; identiteit onveranderlijk; directe RLS én staffprojectie getest. Geen nieuwsinhoudlek geclaimd |
| REMINDER-REVOCATION | Toegewezen herinnering bleef leesbaar na verlies van rol, membership of sessie | Actuele bevoegdheid en eigen persoon vereist; eigen en bevoegd HR-gebruik behouden, vreemde persoonsherinnering geweigerd |
| CUSTOMER-AUDIT | Nieuwe klantaudit kopieerde volledige klant-/contact-/document-/afspraakrijen | Alleen gebeurtenis-, status-, versie- en gewijzigde veldnamen opgeslagen; vier bronnen en bestaande historieprojectie getest. Historische payloads niet verwijderd |

Fixtures zijn herkenbaar fictief. SQL-tests gebruiken echte sessies en beperkte
principals met rollback; HTTP-tests ruimen hun eigen Auth/Storage-fixtures op.
Geen echte e-mail, stagingdatabase of productie gebruikt.

De laatste resourcegrenzen gebruiken `scripts/test-resource-lifecycle-security.mjs`:
acht tests inclusief echte gelijktijdige verbindingen. De gecombineerde resource-,
payment-, commerciële en dossierproeven leveren 44 geslaagde tests. Na een
correctie aan de eigenaar-only ticketfixture (geen nagebootste JWT bij een
tenantcascade) slagen alle 320 Node-databasetests. Gewone autorisatieproeven
blijven onder `authenticated`; geen productiepolicy is voor tests verzwakt.

Restricties: ongeautoriseerde historische toegang vervalt; geen historische
rijen worden verwijderd of naar een nieuwe klant/persoon herschreven. Een
gelijktijdige directe conceptregelwijziging/-verwijdering tijdens definitief maken
kan nog een veilige transactie-abort/retry vereisen. Dat is een beschikbaarheids-
en bedieningspunt, geen geaccepteerde integriteits- of toegangsuitzondering.

## Open releasevoorwaarden

- De verse Codex Security Standard-scan (`0b3d3db8-e01f-44cc-b996-d06f22fef2a4`)
  vond nul rapporteerbare bevindingen in de gewijzigde/ongetrackte implementatie
  en de beveiligingskritieke grenzen. De codedekking is partieel omdat niet ieder
  ongewijzigd presentatie-, documentatie- en fixturebestand opnieuw regel voor
  regel is onderzocht. Alle 826 ontdekte autorisatie-/data-/releaseoppervlakken hebben
  afzonderlijk een afgeronde reviewstatus en bewijsset; een inventaris of
  nulbevindingenscan is desondanks geen formele risicoacceptatie.
- Configureerbaar rollenbeheer is geen onderdeel van deze release: het
  niet-geactiveerde prototype blijft buiten de migraties. De audit toetst de
  bestaande rollen, zoals de releaseopdracht expliciet toestaat.
- Eerder uitgegeven private signed URLs kunnen geldig blijven. Verloop of
  intrekking vereist operationeel bewijs; geen sleutelrotatie uitgevoerd.
- ClamAV is nu aangesloten op alle aangetroffen upload-/publicatiepaden.
  Bestaande bestanden krijgen pas na een geslaagde scan bij bevoegd lezen een
  bewijs; geen bulkverklaring dat historische bestanden schoon zijn. Een oud
  personeelsbestand groter dan 10 MB blijft bewaard maar is niet vrijgegeven:
  de huidige scannergrens moet via een gecontroleerde vervolgactie worden
  afgehandeld. Antivirus detecteert bekende patronen, niet alle mogelijke schade.
- De operator heeft VPS-identiteiten, actuele procesgroepen en socketrechten
  bevestigd; dit is niet onafhankelijk vanuit de VPS gecontroleerd. Nieuwe
  unitverwijzingen, socketrechten na daemonherstart, scannerdefinities, echte
  providerhooks en deployed policies blijven open; zie operationele runbooks.
- De staging-runner met eigen label is nu online. De operator bevestigt
  UID-/groepsscheiding, socketrechten, `r-x` op `/home/fieldgrid`, een echte
  schrijf-/verwijderproef en de GitHub-verbinding. Unit-/runtime.env-overgang, backup/restore,
  migratiegeschiedenis, geïnstalleerde units en SHA-health moeten bij de
  gecontroleerde staginguitrol worden bewezen; lokale adaptertests vervangen
  geen restoreproef van een stagingbackup.
- Geen definitieve diff/SHA of stagingacceptatie. De lokale productiebuild en
  alle 49 browsertests zijn geslaagd; details staan in
  `release-security-verification.md`.

## Aanvullende bevindingen: ernst en bewijs

- **NOTIFY-GRANT — P1/medium:** een bestaande, bredere grant kon buiten de
  delegatiegrens worden vernauwd/vervangen; geen privilege-uitbreiding geclaimd.
  **NOTIFY-DRAFT — P1/medium:** ongepubliceerde platforminhoud was bereikbaar
  voor tenant-templatebeheerders; geen bewijs dat echte concepten geheimen
  bevatten. Migratie `20261001082702` sluit beide paden, inclusief grant-races.
- **NEWS-RECEIPT — P0/medium:** grensoverschrijdende write van eigen
  leesmetadata naar een bekende vreemde tenant/berichtidentiteit; de
  berichtinhoud zelf was afgeschermd. **REMINDER-REVOCATION — P0/medium:**
  toegewezen reminder kon na intrekking beschikbaar blijven. Negen nieuwe
  DB-tests bewijzen negatieve én positieve paden onder beperkte principals.
- **CUSTOMER-AUDIT — P2/medium:** onnodige kopieën van persoonsgegevens in
  nieuwe auditregels, niet een nieuw bewezen publiek leeslek. Bestaande
  auditpayloads blijven bewaard; bewaartermijnen/redactie vereisen een aparte
  eigenaarsbeslissing. Eén onafhankelijke hercontrole van deze vijf grenzen
  vond geen resterende concrete bypass of legitieme regressie binnen die scope.
- **PLATFORM-LIFECYCLE — P0/high:** onboardingretry kon reeds ingetrokken
  beheerrechten opnieuw binden. `scripts/sql/release-platform-lifecycle.sql`,
  `scripts/test-platform-security.mjs` en migratie `20261001045303` leggen
  oorspronkelijke ontvanger en eenmaligheid vast. Expliciete afzonderlijke
  delegaties worden niet ongemerkt ingetrokken.
- **OBJECT-CUSTOMER / TRAVEL-DAY-OWNER / EXCEPTION-PRIVACY — P0/high:**
  same-tenant toegang over klant-/persoonsgrenzen via herplaatsing of te brede
  projectie. Migrations `20261001073930` en `20261001080158`,
  `scripts/test-release-security.mjs` en
  `scripts/test-resource-lifecycle-security.mjs` beschermen de gedeelde
  lees-/writegrenzen; ook alternatieve directe tablewrites zijn getest.
- **FINANCE-HISTORY — P0/high:** verwijderen/verplaatsen van definitieve
  bronregels kon hoeveelheden opnieuw beschikbaar maken en de berekende
  objectscope losmaken van de bevroren klantfactuur. Migratie `20261001080158`
  bewaart het oorspronkelijke bewijs; de tweelocatietest bewijst dat de beperkte
  klant geen toegang krijgt na een geweigerde bronwijziging.
- **MODULE-LIFECYCLE / MODULE-CUSTOMER-FINANCE — P1/medium:** huidige
  entitlements werden in secundaire projecties of bestaande commandresultaten
  overgeslagen. Replays worden vóór resultaatuitgifte gecontroleerd. Bestaande
  writetriggers blokkeerden nieuwe financiële writes al; die zijn niet ten
  onrechte als een extra exploit gepresenteerd.
- **PUBLIC-COMMERCIAL-MODULE — P0/high:** uitschakelen van Planning sloot de
  publieke commerciële service-rolepaden niet. De nieuwe private predicate
  heeft geen executegrant voor `anon`, `authenticated` of `service_role` en
  wordt in de vier muterende/replay-RPC's vóór resultaat of wijziging toegepast.
  Een echte browserproef bewijst dat offerteweergave/-PDF en boeking dichtgaan
  en na herinschakelen terugkeren; HTTP-intake wordt op de echte wildcardhost
  in staging geaccepteerd omdat een geldige tenantsubdomain lokaal niet
  betrouwbaar nagebootst kan worden.
- **WORKFLOW-SECRET-SCOPE / WORKER-ARGV — P1/high:** eerdere stagingruns
  maakten jobbrede secrets zichtbaar voor meer stappen dan nodig en de
  workersecret stond in de `curl`-argv. Er is geen bewijs aangetroffen dat een
  secret publiek is gemaakt of misbruikt; de nieuwe workflow beperkt de scope,
  pint elke externe action op een immutable SHA en de worker gebruikt een
  interne Node-request. Bestaande GitHub-secrets worden niet gelezen of gelogd.
- **DEPLOY-ROLLBACK — P1/high:** een oudere release kan na de nieuwe scan-,
  mail- en autorisatiemigraties niet als veilig compatibel worden aangenomen.
  Het deployscript herstelt daarom bij een rode healthcheck geen oude symlink
  meer. Staging blijft NO-GO en de operator gebruikt onderhoud/forward-fix of
  uitsluitend een afzonderlijk aantoonbaar compatibele herstelrelease.
- **CUSTOMER-LIFECYCLE — P2/medium:** operationele en financiële rollen
  omzeilden een beheer-only status-/verwijderactie via direct DML. Eén
  shared trigger maakt de UI-/RPC-/Data-API-grens gelijk. Deze reparatie
  introduceert geen nieuwe definitie van archivering of algemene accountintrekking.
- **TRAVEL-SCOPE — P0/high:** actor met ingetrokken planning-/privébevoegdheid
  kon een vertraagd antwoord of historische predecessor ontvangen. Bron:
  `lib/travel/service.ts`, migratie `20261001024345`. Vóór herstel falende
  synthetische scopeproeven, daarna 39 relevante unittests, 18 DB-tests en vijf
  reisbrowsertests geslaagd. Gevolg: geweigerde oude inzage wordt eerlijk onbekend,
  niet automatisch opnieuw gepubliceerd of uit de historie gewist.
- **PAYMENT-INTEGRITY — P0/high:** gewone finance-principal kon via directe
  tabellen providerallocaties en saldi veranderen. Bron:
  `scripts/sql/release-payment-boundaries.sql`, betaalroutes en shared access.
  Herstel plus reviewcorrectie: 60 gerichte unittests en acht DB-tests geslaagd,
  inclusief transactionele rollback en retry zonder dubbele betaling. Geen echte
  Mollie-settlement uitgevoerd; externe verificatie blijft verplicht.
- **BROWSER-STATE — P0/high voor accountvermenging; P1 voor lokale opslag:**
  echte browserreproductie van uitloggen/Back plus vertraagde hydration.
  Bron: `account-boundary.tsx`, `browser-state.ts`, `browser-session.ts` en
  `tests/e2e/browser-privacy.spec.ts`. Eén onafhankelijke hercontrole bracht
  remount-/hydratiegevallen aan het licht; parent herstelde en testte die.
  Gewone URL-geschiedenis en reeds gedownloade bestanden zijn niet gewist.
- **HR-LEGACY — P0/high voor ongeoorloofde HR-veldtoegang:** synthetische
  directe authenticated-query gaf interne notitie/contractdata en planner-
  noodcontacten terug. De document-JSON-test bewijst een toegestaan schema-pad,
  niet dat echte dossiers zulke inhoud bevatten. Migratie `20261001035345`,
  `scripts/test-personnel-privacy.mjs` en de downloadtests sluiten dit pad.
  De reviewer vond geen resterende bypass/regressie in deze afgebakende fix.
- **HR-ABSENCE — P0/high voor ongeoorloofde verzuiminzage:** vóór herstel gaf
  een echte plannerprincipal `sick` en `FICTITIOUS PRIVATE ABSENCE REASON`
  terug. Migratie `20261001042234` bewaart de originele rij maar scheidt
  operationele blokken van medische/interne details. Zeven HR-DB-tests en de
  planbordsuite slagen, inclusief een niet-lege interne bron-ID, eigen updates,
  gemengde rollen en intrekking. Geen woon-/ziektegegevens van echte personen
  gebruikt. De onafhankelijke reviewer vond geen bypass of regressie.

Alle bovenstaande reparaties zijn lokaal opnieuw getoetst; impact van
restrictie: oude onveilig brede toegang verdwijnt, de historische gegevens
blijven behouden. Geen vrijgave van staging of formele risicoacceptatie.

Geen formele risicoacceptatie namens de eigenaar, geen volledige veiligheidsclaim,
geen commit/push/deploy en geen productieactie.
