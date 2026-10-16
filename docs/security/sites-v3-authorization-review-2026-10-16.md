# Sites v3: autorisatie- en releasecontrole

Beoordeelde basis: `71df59ab0390ffeae482c7edbaf27efe3fa6546d`. Runtimecontrole: het verpakte lokale artifact `6505f47e5b61566af57e197b862f6ee47d6798d4` (1.2.0-rc.1), op de schone replay van 178 migraties. Deze review vervangt de eerdere baselinebeoordeling alleen voor daadwerkelijk veranderde fingerprints. Het is geen hosted deploymentacceptatie.

Het register bevat 1.418 oppervlakken: 989 ongewijzigd, 128 identiek verplaatst en 301 inhoudelijk nieuw/gewijzigd. Alle 156 verdwenen oude route-ID's hebben een bestaande vervanger onder `(workspace)`; er zijn geen verdwenen databasefuncties of tabellen. De classificatie per oppervlak en oude/nieuwe route staat in [review-classification.json](../integration/sites-v3/evidence/final/review-classification.json). Iedere nieuwe fingerprint heeft afzonderlijk bewijs in `authorization-review.json`; de detector is geen vervanging voor deze bron-/diffbeoordeling.

<a id="routeverplaatsingen"></a>
## Routeverplaatsingen

Dezelfde routebestanden staan onder een Next-rootgroep voor CSS/providerisolatie. De 128 overdrachten behouden byte-identieke code, exports, controles en afhankelijkheden; alleen hun inventaris-ID wijzigt. De overige verplaatste bestanden zijn inhoudelijk opnieuw beoordeeld. Publieke URL's, sessiecontrole, object-/tenantbinding en native serveropdrachten veranderen daardoor niet. Importwijzigingen verwijzen naar de nieuwe interne bestandspaden.

<a id="marketing"></a>
## marketing

`proxy.ts` valideert de echte host en overschrijft inkomende presentatieheaders. De www-dispatch staat vóór Auth en de private platformguard. Het unieke interne pad is op alle buitenste hosts onbereikbaar; alleen de toegestane publieke CRM-endpoints en statische assets passeren. `www` wordt niet als tenant ingericht. Beide marketinglayouts weigeren een ontbrekende marketingcontext. Metadata/JSON-LD escapen hun inhoud; sitemap bevat uitsluitend de 23 vaste routes. Productiecanonical is www; lokale/stagingpagina's blijven noindex. Native intake vereist dezelfde origin, JSON, begrensde invoer, een UUID-herhaalsleutel en een HMAC-ratekey; persoonsgegevens verlaten geen publieke slotresponse. Bewijs: fase 1, host-/proxytests, de herhaalde 115-paren-crawl en de echte formulierketen.

<a id="crm"></a>
## crm

Pagina, Route Handlers én RPC's eisen actuele platformregistratie en sessie. Support, tenantbeheer, metadata en een browserheader verlenen geen CRM-recht. Alle private CRM-tabellen en de primaire-beheerderregistratie hebben RLS+FORCE en geen anon/authenticated tabelgrants. Mutaties gebruiken begrensde opdrachten, transacties, actor-/idempotentielocks, revisies en een hercontrole na blokkerende locks. Slotbezetting, reserveren en verplaatsen zijn atomair; een conflict behoudt de oude afspraak. Aanvraagsnapshots en audit worden niet als huidige leadvelden overschreven.

De ontvanger is de expliciet geregistreerde primaire platformbeheerder, nooit een willekeurige Auth-gebruiker. Wijzigen van die registratie vereist recente echte OTP, revisie en actuele platformrechten. Migratie 178 kwalificeert alleen de ambigue retryparameter en projecteert de reeds vereiste expliciete retrybevoegdheid. De server blijft frozen ontvanger/inhoud, huidige policy, leveringsstaat en onzekerheid controleren. Gewone 503's behouden de laatste overzichtsdata; 401/403 wissen de private kaarten. De echte browserproef trekt de registrytoegang in terwijl de eerder geladen shell nog aanwezig is. Bewijs: fase 25, native CRM-/concurrentie-/primaire-admintests en het gebundelde browserbewijs.

<a id="platform"></a>
## platform

Tenantprovisioning en templates gebruiken het bestaande servicepad met de geverifieerde actor én sessie-ID. De database controleert beide opnieuw na locks en vóór writes; een servicekey zonder echte actor/session volstaat niet. Provisioning, statuswijziging en templates gebruiken CAS/idempotentie en bewaren eerdere inrichting/audit. `www` is gereserveerd. Centrale templates volgen bestaande notificatierechten. Brede platformregisterlezingen zijn uitsluitend na `requirePlatformAdmin`, gepagineerd en begrensd; Auth-lookupconcurrentie is acht. Supportinzage blijft afzonderlijk expliciet toegewezen. Bewijs: fasen 20–22 en de provisioning-, templates-, lifecycle- en supportteamtests.

<a id="cockpit"></a>
## cockpit

De gedeelde actor controleert vertrouwde tenanthost, actuele gebruiker, tenant en pagina-/functiecapability. De RPC's controleren opnieuw exacte bron, rol, module en actuele sessie. De beperkte invokerprojecties houden native RLS aan; alleen noodzakelijke private helpers krijgen authenticated EXECUTE om die invokerketen te laten werken. Deze helpers controleren zelf hun toegang en gebruiken een lege search_path. Er komen geen private HR-collecties of opslagpaden in de algemene dossier-DTO. Personeelsinzage wordt geaudit. Overzicht en opvolging gebruiken brongebonden feiten en huidige bronrechten; verantwoordelijkheid, uitstel en afhandeling bewaren native historie. Bewijs: fasen 1 en 7–10, entiteiten-/overzichts-/opvolgings- en concurrentietests.

<a id="governance"></a>
## governance

Besluiten, verplichtingen en bewijs blijven tenant-/brongebonden, met huidige zichtbaarheid, writecapability, CAS en onveranderlijke versies. De uploadadapter roept de bestaande gecontroleerde dossieruploads aan, valideert bronrechten vóór én na I/O en rapporteert een reeds gecommitteerde upload afzonderlijk. Herhaling vereist dezelfde maker, metadata en werkelijk gescande bytes. HR-classificatie en privacybevestiging blijven verplicht. Bewijs: fase 2, native governance- en concurrentietests en echte dossieruploadketens.

<a id="sla"></a>
## sla

Versies van serviceafspraken zijn niet retroactief aan historische tickets gekoppeld. Bronrechten, concrete contract-/ticketbinding, werkminuten en oorspronkelijke termijnen blijven leidend. De bounded onderhoudsfuncties zijn uitsluitend service-callable en maken geen tenantsessie. Alle private SLA-/service-/ticketbindingtabellen blijven gesloten voor anon/authenticated. Bewijs: fase 3 en de service-level-/concurrentietests.

<a id="finance"></a>
## finance

Review/factuurprojecties vereisen finance-module, pagina-/functiecapability en de bestaande financiële rol. Broncontrole en rapportgoedkeuring worden opnieuw gecontroleerd binnen dezelfde transactie. Een review schrijft geen fictieve factuur of betaalstatus. Selecties gebruiken geautoriseerde RPC/RLS, expliciete IDs, begrensde collecties en een actuele hercontrole voor terugzenden. Private finance-tabellen blijven gesloten; de bestaande invoice_lines-policy bewaart de afgebakende klant- en tenanttoegang. Bewijs: fasen 4 en 19, native factuurlijst-/finance-/concurrentiechecks en echte gescande PDF-ketens.

<a id="indexation"></a>
## indexation

Voorstel, huidig klantakkoord, gescand dossierbewijs en concrete contractversie blijven afzonderlijk. De guard kiest de versie voor de concrete Amsterdam-bezoekdatum en controleert gezamenlijk plafond/hoeveelheid. Bestaande commerciële snapshots wijzigen niet. Huidige eigenaar-/bron-/financecapabilities en revisies worden binnen de mutatie herhaald. Bewijs: fase 5, native indexatie- en concurrentietests.

<a id="reports"></a>
## reports

Een rapportversie bewaart zijn snapshot, autoriteitsprofiel en bronreferenties. Huidige leesrechten, rollen, services en iedere oorspronkelijke bron moeten ook bij later lezen blijven voldoen. PDF-rendering controleert de onveranderlijke registratie opnieuw na I/O. De serviceworker gebruikt expliciete ontvangerprofielen en huidige toegang, zonder JWT van een gebruiker te fabriceren. Interne `report_*` helpers accepteren die actor alleen via de gecontroleerde bovenliggende functies; zij zijn niet rechtstreeks anon/authenticated-callable. De beperkte native reviewlijsten zijn invokerprojecties met gecontroleerde helpers. Bewijs: fasen 6 en 18, rapportage-/review-/RLS-helper-/concurrentietests.

<a id="portals"></a>
## portals

De Source-context bepaalt presentatie, geen toestemming. Personeel behoudt concrete vrijgave/toewijzing; klanten behouden actuele account-/object-/bezoekbinding. Een accountparameter wordt als UUID gevalideerd en door `getCustomerPortal(account)` geautoriseerd, ook op kennisbank/updates en teruglinks. Inline voorbeelden gebruiken oorspronkelijke private gescande PDF/rasterbytes, gesloten MIME/CSP en dubbele bronautorisatie; vreemde of ingetrokken documenten geven 404. Profiel-CAS/idempotentie en onveranderlijk inlogadres blijven intact. Migratie 176 corrigeert uitsluitend het lege optionele KvK-veld; 177 voegt vier vaste uitlegkeys toe. OTP-navigeervlag verandert alleen transport ná echte verificatie en werkruimterecht. Bewijs: fasen 23/24 en echte portaal-/SMTP-/intrekkingsketens. De extra bezoekcode gebruikt lokaal een synthetische challenge; dat is geen externe bezorgingsclaim.

<a id="native"></a>
## native

Bestaande serveracties, rapportgoedkeuring, prijstoekenning, meerwerk, ondertekenen, planning en dossieruploads blijven de mutatiegrenzen. Source-adapters voegen uitsluitend gerichte leesprojecties en presentatie toe. Het planbord wist snapshots en open details bij capability-intrekking; gewone netwerkfouten houden het bestaande herstelpad. Lijsten vragen aanvullende gegevens alleen met de bijbehorende functiecapability. De personeelsdirectory selecteert expliciet beperkte kolommen en vult private velden leeg in plaats van ze op te halen. Browserconcepten worden tijdens echte mutaties beschermd; een verloren response gebruikt dezelfde herhaalsleutel. Bewijs: fasen 10–19, native guards en de bestaande 723 checks inclusief planning, uitvoering, dossiers, betalingen en lifecycle.

<a id="mail"></a>
## mail

Er blijft één SendGrid-service, centrale policy/outbox en worker. Alleen platformmeldingen mogen een null tenant hebben. CRM-/rapportberichten worden opnieuw aan hun actuele bron en ontvanger getoetst. Inhoud en transport worden vóór aanbieden vastgelegd; een onzekere uitkomst wordt niet automatisch opnieuw verzonden. Bounded servicejobs gebruiken bestaande workercredentials en leases. Het lokale providerbewijs simuleert uitsluitend de externe transportresponse voor een gecontroleerd .invalid-adres, terwijl prepare/claim/begin/freeze/policy/finish de echte implementatie volgen. Dit bewijst geen live bezorging bij SendGrid. Bewijs: fasen 1/6/25 en de native notificatie-/policy-/deliverytests.

<a id="operations"></a>
## operations

De releaseverpakker volgt alleen links binnen het getraceerde standalonepad, materialiseert de aanwezige unieke moduleversies en weigert ontsnappende links of conflicterende resoluties. Hij consulteert geen werkspacemodules als fallback. De modulematerialiseerder staat nu zelf in de beveiligingsinventaris. CI behoudt provider-/secrets-/artifactgates; de drie extra brandinguitzonderingen zijn uitsluitend lokale Source-logo-browserfixtures. Versie en manifest zijn 1.2.0-rc.1/178; alle 138 baseline-migratiehashes zijn behouden. De read-retryadapter herhaalt uitsluitend GET/HEAD bij bekende verbroken verbindingen, maximaal twee keer; geen RPC-write of mailherhaling. Marketing-/workspace-rootisolatie verandert APP_URL, deploymentbranch, Caddy of VPS-rechten niet. Bewijs: schone replay, bronintegriteit, unitchecks, standaard koude build, materialisatietests en linkvrije artifact-smoke.

## Vrijgavegrens

Security-advisor: geen meldingen. Native database: 723 geslaagd; pgTAP: 398 geslaagd. Unitset: 1.998 geslaagd. Lint: geen fouten, 38 bestaande waarschuwingen. Bronintegriteit: 279 referentiebestanden exact. Geen hosted reset, secretwaarde-opvraging, DNS-mutatie of live providerbezorging is in dit bewijs opgenomen. CI op de te promoveren commit, exact-SHA staginghealth en een verse workeruitvoering blijven releasegates. Productiepublicatie en feitelijke juridische websitegegevens blijven afzonderlijke acceptatiepunten.

## Uiteindelijke lokale gates

De [finale bewijsmap](../integration/sites-v3/evidence/final) bevat de schone replay van alle 178 migraties, 398 pgTAP-checks, 723 native databasechecks, 1.998 unitchecks en de extra 35 securitycatalogus-/releasechecks en tien echte HTTP/Auth/Data API/Storage/Realtime-controles. De 138 baseline-migraties hebben dezelfde statementhashes; geen toegepaste migratie is gewijzigd. Security-advisor meldt geen waarschuwingen/fouten. De snapshot en review sluiten op 1.418 actuele oppervlakken aan. De standaard koude webpackbuild compileert 108 pagina’s; het linkvrije standaloneartifact start en geeft lokaal dezelfde SHA met database/scanner ready. Bron- en browserartifactscans melden geen herkende credentials; dit blijft een afgebakende detectie.

De laatste review omvat ook de werkelijk geweigerde branding van buiten gebruik gestelde lokale fixtures. De publieke logoroute blijft 404; de presentatie toont voortaan initialen als een eerder bekende logo-URL niet meer beschikbaar is. Geen privébytes, tenantactivatie of autorisatiefallback is toegevoegd. Het oorspronkelijke tweekoloms cockpitgrid en de bronafstand voor dossiertabs blijven door de native pendingveldset heen behouden.

Het verpakte worker-endpoint is zonder autorisatie 401 en met expliciete lokale testautorisatie 200/ok, met nul failed/uncertain. Deze runtime gebruikt uitsluitend de geïsoleerde lokale database en de begrensde `.invalid`-providertransportlaag; dit bewijst geen externe bezorging. De volledige personeels-/klantbrowserproeven gebruiken werkelijke lokale SMTP/OTP en bewaren de expliciete native dossier-/supportgrenzen. Hosted CI, releaseattestatie, stagingactivatie, verse workeracceptatie en live functionele acceptatie blijven afzonderlijke, onverkorte gates.

## Eerste hosted CI-feedback

Run 38840751404 stopte vóór de tests op de merknaamgate: de derde lokale Source-logofixture `scripts/test-sites-v3-shell-chain.mjs` ontbrak in de expliciete bestandsuitzonderingen. Ook deze fixture gebruikt de bewaakte lokale browserhelper en uitsluitend de oorspronkelijke referentieafbeelding. Alleen dit testbestand is toegevoegd; applicatiepaden, productbranding, provider- en secretscans blijven gecontroleerd. De workflowfingerprint is opnieuw beoordeeld.

GitGuardian-check 116780017609 meldt Generic High Entropy Secret op historische commit `0bf81bab90601845ab09df15945ffea88da5ae12`, `scripts/test-sites-v3-planning-chain.mjs:48` (incident 38269956). Die volledige regel bevat uitsluitend bestandsnamen, JSON-serialisatie, twaalf statische testuitkomstnamen en de browserfoutenarray. De enige cijferhoudende uitkomstnaam is `responsive-320-390-768-1440`, direct na de auth-testnaam. Er is daar geen credential, geheim of geauthenticeerde waarde; de GitHub-native secret-alertlijst is leeg. De uitkomstnamen staan voortaan leesbaar op afzonderlijke regels, met ongewijzigde waarden/semantiek. Geen credentialscan, detectortype of commitgeschiedenis is uitgezet/gewist. De externe historische incidentstatus moet afzonderlijk worden beoordeeld; hij wordt niet als groen voorgesteld.

## Hercontrole na de volledige native browserronde

De host voor inlogredirects komt nu uit de al gevalideerde platform-/tenant-/custom-hostcontext. Alleen schema en poort komen uit de verplichte APP_URL; onbetrouwbare forwarded headers bepalen geen redirect. Daarmee blijft ook bij een interne loopbacklistener de oorspronkelijke tenant en diens branding behouden. De relevante 81 hostname-/proxy-/configuratietests en de daadwerkelijke login-/PWA-brandingbrowserketen slagen.

De private voorbeeldresponse is alleen voor een geautoriseerd, werkelijk gescand PDF- of rasterdocument same-origin in te sluiten. Namespace, hash en actuele bronrechten worden voor en na Storage-I/O gecontroleerd. De response is private/no-store, nosniff en default-src none met frame-ancestors self. Gewone pagina's en downloads blijven DENY; een geweigerde preview blokkeert framing expliciet met CSP frame-ancestors none; actieve HTML/SVG wordt geen voorbeeld. De Next-queryregel zet de transportheader SAMEORIGIN ook op een vaste 404-foutresponse. Daarom bevat iedere geweigerde preview expliciet CSP frame-ancestors none; de effectieve policy staat geen inbedding toe en de response bevat geen documentbytes. De 54 gerichte download-/previewchecks en tien echte HTTP-grenschecks slagen. De exact begrensde preview-query voorkomt dat Next de goedgekeurde response alsnog met een globale DENY overschrijft. Een volledige Chromium-PDF-viewer toonde de originele PDF werkelijk; intrekking gaf 404. De eerder lege iframe-opname is expliciet afgekeurd en vervangen door bekeken bewijs in fase 23.

Ticketuploads vereisen een exacte gelijkheid van Origin en Host, zonder gebruikersgegevens, pad, query of afwijkende poort. Staging en productie blijven HTTPS eisen. Alleen DEPLOY_TARGET=local accepteert HTTP op localhost, 127.0.0.1 of één geldige tenantlabel.localhost. FTP en andere protocollen vallen daar niet onder. De bestaande actor-, sessie-, bron-, scan-, hash- en databasecontroles zijn behouden. Vier gerichte origin-tests controleren ook kruisende tenants/poorten en ongeldige origins. De beveiligingsdetector volgt deze pure guard nu expliciet; een eigen unit bewijst dat een wijziging aan deze guard de reviewfingerprint verandert.

De rolleneditor gebruikt expliciete geregistreerde afhankelijkheden. Alleen oudere registraties zonder zulke afhankelijkheden mogen hun exacte geregistreerde module-/actiepagina toevoegen; een niet-bestaand toegang.read-recht wordt niet verzonnen. De database blijft de uiteindelijke autoriteit. De echte managementketen controleert uitnodiging, OTP, rechtenintrekking en eigenaarsoverdracht.

Formulierfooter-, tabstijl- en focusaanpassingen wijzigen uitsluitend de presentatie rond bestaande native opdrachten. Form-associatie houdt het echte submitformulier/handler intact; Tab/ShiftTab blijven in het actieve venster. Alleen directe fragments/footers worden uitgepakt, geen willekeurige onderliggende componenten. De aanvullende native dossiertabs behouden Radix-toetsenbordgedrag met de bronstijl. De algemene volledige browserregressie wordt nog afgerond; dit hoofdstuk claimt geen groene promotiegate of liveacceptatie.

De effectieve Next-response is ook via het werkelijk verpakte HTTP-endpoint gecontroleerd: een geweigerde preview bevat vaste 404-tekst, private/no-store en CSP frame-ancestors none. De statische queryheader SAMEORIGIN is daarom geen bewijs van toelating. Het concrete resultaat staat in fase 26. De volledige native browserdekking en nog vereiste exacte-commit-CI worden daar afzonderlijk verantwoord.


De Linux-rechtentests behouden hun volledige UID/GID-/socket-/directory-assertions.
Alleen het ophalen van hun Debian-testimage heeft nu een begrensde transportkeuze:
public ECR, daarna de officiële Docker Hub-repository, beide met dezelfde vaste
digest. Er zijn geen argument-/omgevingsoverrides, extra credentials, mutabele
tags of lokale hostmutaties. Een ontbrekend image na pull en uitval van beide
registries geven een foutstatus; beide oorspronkelijke runners blijven verplicht.
De helper is expliciet toegevoegd aan de operationele inventaris. Zes gerichte
herstel-/weigertests, beide werkelijke Linux-runners, de 1.998-unitset en de
1.418-surface-controle slagen; fase 26 bewaart het concrete bewijs.

De standaard-Turbopackcontrole in fase 26 vond een dubbele native CSS-verplaatsing bij personeelvensters. De adapter vervangt uitsluitend de positioneringsutilities door nul; focus, formulierassociatie, sessie-, scan-, dossier-, mail- en ticketgrenzen wijzigen niet. Alle zes betrokken echte browsergevallen slagen op standaardartifact `891185891f4872e51b54921cf67988d14b816502`, inclusief dossier-step-up en ticketescalatie. De eerdere CI-fout is bewaard en niet vervangen door gewijzigde referenties.
