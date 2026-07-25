# Google Play-publicatiepakket — Veele en Fieldgrid Personeel

Versie van dit voorbereidingsdocument: 25 juli 2026.

Dit pakket vertaalt het bestaande VeyoCast-publicatieproces naar twee mobiele
personeelsapps. De Android-artefacten zijn lokaal gebouwd, ondertekend en
technisch gecontroleerd, maar er is vanuit deze sprint niets geüpload, gepusht
of gepubliceerd. **Veele doorstaat de live runtimecheck. Fieldgrid is nog niet
uploadgereed:** `https://fieldgrid.nl/personeel` stuurt door naar
`https://www.fieldgrid.nl/personeel` en die bestemming gaf tijdens de preflight
HTTP 502. Los dit eerst op en laat de preflight daarna volledig groen worden.

## 1. Gereed resultaat

| App                 | Pakketnaam                   | Versie        | Play-bestand                      | Testbestand                       |
| ------------------- | ---------------------------- | ------------- | --------------------------------- | --------------------------------- |
| Veele Personeel     | `nl.veeleservices.personeel` | `1.0.0` (`1`) | `veele-personeel-1.0.0-1.aab`     | `veele-personeel-1.0.0-1.apk`     |
| Fieldgrid Personeel | `nl.fieldgrid.personeel`     | `1.0.0` (`1`) | `fieldgrid-personeel-1.0.0-1.aab` | `fieldgrid-personeel-1.0.0-1.apk` |

Lokale output:

```text
/home/codex/output/fieldgrid-play/
```

De map bevat ook `manifest.json` met bestandsgrootte en SHA-256 per artefact.
De `.aab` is het bestand voor Play Console. De `.apk` is alleen voor lokale
installatie en apparaattests. Gebruik alleen artefacten waarvan het manifest
`sourceDirty: false` vermeldt en waarvan `sourceCommit` gelijk is aan de
definitief beoordeelde lokale commit.

## 2. Vastgelegde appstrategie

De producteigenaar heeft op 25 juli 2026 bevestigd dat er twee afzonderlijke
apps komen:

- `Veele Personeel` is de eigen enterprise-app voor Veele en gebruikt
  `nl.veeleservices.personeel`;
- `Fieldgrid Personeel` is de algemene app voor overige klanten en gebruikt
  `nl.fieldgrid.personeel`.

De algemene app vraagt vóór e-mail en wachtwoord om een unieke
organisatiecode van zes tekens. De code selecteert alleen de tenant; het is
geen wachtwoord en geeft zelfstandig nooit toegang. Na selectie controleert de
server nogmaals dat het ingelogde personeelsaccount bij die tenant hoort.

Enterprise-apps herkennen hun tenant aan hun eigen geverifieerde host en slaan
de codepagina over. Activatie- en wachtwoordlinks nemen dezelfde tenantcontext
mee.

Een eerste AAB-upload maakt de pakketidentiteit praktisch onomkeerbaar. Maak
daarom geen derde app of afwijkend pakketrecord zonder een nieuwe expliciete
productbeslissing.

De twee listings moeten hun verschillende doel duidelijk maken om risico onder
Googles repetitieve-contentbeleid te beperken: Veele is een eigen
enterprise-ervaring; Fieldgrid is de algemene multi-tenant app met
organisatiecodeselectie.

## 3. Ontwikkelaarsaccount

Gebruik een organisatieaccount dat juridisch bij de eigenaar van Fieldgrid
hoort. Zorg dat gegevens bij Google Payments, D&B en KvK exact overeenkomen.

Nog extern in te vullen of te bevestigen:

- juridische organisatienaam;
- handelsnaam;
- KvK-nummer;
- btw-identificatienummer;
- D-U-N-S-nummer;
- zakelijk openbaar adres;
- openbare supportmail;
- openbaar supporttelefoonnummer;
- privé contactmail en telefoon voor Google;
- eigenaar van het blijvende Google-account;
- actieve publieke website.

Google kan identiteitsbewijs, recent KvK-uittreksel, domeinverificatie en
telefoonverificatie vragen. Bij een organisatieaccount kunnen juridische naam,
adres, ontwikkelaarse-mail en telefoon publiek zichtbaar worden.

## 4. Twee Play-apprecords aanmaken

Voer de stappen tweemaal uit:

1. Open Play Console.
2. Kies **Create app**.
3. Vul de appnaam uit de tabel in.
4. Kies standaardtaal **Nederlands (Nederland)**.
5. Kies **App**, geen game.
6. Kies **Gratis**.
7. Accepteer de verklaringen.
8. Open **App integrity** en activeer/controleer Play App Signing.
9. Maak eerst alleen een **Internal testing** release.
10. Upload de bijbehorende `.aab`.

Controleer de pakketnaam in Play direct na upload. Upload nooit het Veele-bestand
in het Fieldgrid-record of andersom.

## 5. Signing en sleutelbeheer

De twee lokale uploadkeys zijn bewust gescheiden. Bewaar vóór upload de hele
map:

```text
/home/codex/.local/share/fieldgrid-android/signing/
```

Praktische back-up:

1. sluit alle terminals die het propertiesbestand kunnen tonen;
2. kopieer de map naar een versleutelde USB-stick;
3. maak een tweede versleutelde back-up op een onafhankelijke veilige locatie;
4. bewaar wachtwoorden in een wachtwoordmanager;
5. test dat beide back-ups leesbaar zijn;
6. noteer wie formeel sleutelbeheerder is.

Na eerste upload toont Play Console twee certificaten:

- upload key certificate;
- app signing key certificate.

Bewaar SHA-1 en SHA-256 van beide per app. De app-signing SHA-256 is nodig voor
`assetlinks.json`; Firebase kan zowel SHA-1 als SHA-256 nodig hebben.

## 6. Listingtekst

Kant-en-klare Nederlandse teksten staan in:

- `docs/deployment/google-play/veele-personeel-listing-nl.md`;
- `docs/deployment/google-play/fieldgrid-personeel-listing-nl.md`.

Aanbevolen categorie: **Zakelijk**. Gebruik geen claims als “volledig offline”:
de app bewaart en synchroniseert bepaalde werkmutaties, maar aanmelden en verse
serverdata hebben een verbinding nodig.

Nog te maken:

- appicoon 512 × 512 per merk;
- feature graphic 1024 × 500 per merk;
- minimaal 2 en bij voorkeur 4–8 telefoonscreenshots per app;
- optioneel tablet-screenshots;
- alt-/beschrijvingstekst bij visuele assets;
- supportwebsite en supportmail.

Gebruik alleen fictieve of geanonimiseerde klant-, adres-, planning- en
personeelsgegevens in screenshots.

## 7. App content

Vul per app minimaal in:

- **Ads:** nee, zolang er geen advertenties of sponsorcontent in de
  personeelsapp wordt getoond;
- **App access:** ja, alle kernfuncties vereisen login;
- **Target audience:** zakelijke volwassen gebruikers, aanbevolen 18+;
- **Content rating:** vragenlijst invullen op basis van werkplanning,
  rapportage, documenten, tickets en meldingen;
- **News app:** nee;
- **Health app:** nee, tenzij productscope later aantoonbaar verandert;
- **Financial features:** de personeelsapp verwerkt geen consumentenbetalingen;
- **Data safety:** invullen volgens hoofdstuk 8;
- **Privacy policy:** publieke HTML-URL invullen;
- **Account creation:** gebruikers worden door een organisatie uitgenodigd en
  kunnen niet vrij in de app registreren.

### Reviewtoegang

Maak een stabiele demo-tenant met een volwassen testmedewerker. Lever Google:

1. exacte login-URL;
2. gebruikersnaam;
3. stabiel wachtwoord;
4. eventuele MFA-bypass of duidelijke MFA-instructie;
5. stappen om planning, een werkbon, rapportage, berichten, profiel en
   meldingsinstellingen te bereiken;
6. minstens één veilige demo-opdracht;
7. contactpersoon wanneer reviewtoegang faalt.

Gebruik nooit een echt personeelsaccount. Laat credentials niet verlopen
tijdens review.

## 8. Data safety — werkdocument

De uiteindelijke verklaring moet overeenkomen met productie, Supabase, server-
en e-maillogs, FCM, crash/monitoring-SDK’s en bewaartermijnen. Voor de huidige
app is dit de veilige conceptinventaris:

| Gegevenstype                                | Waarom                            | Mogelijke overdracht                  | Opmerking                                 |
| ------------------------------------------- | --------------------------------- | ------------------------------------- | ----------------------------------------- |
| Naam, e-mail, telefoon en profielgegevens   | account, identificatie en contact | tenant en geautoriseerde verwerkers   | verkoop en delen apart juridisch toetsen  |
| Werkadres en locatiegegevens van opdrachten | uitvoering en planning            | tenant en hostingverwerkers           | geen continue GPS-tracking vastgesteld    |
| Foto’s/bestanden/rapportages/handtekening   | bewijs en werkbonproces           | tenant en opslagverwerkers            | kan klant- of objectinformatie bevatten   |
| Berichten en supportinhoud                  | samenwerking en support           | tenant en support-/hostingverwerkers  | tenant-scoped                             |
| Apparaat- en push-tokengegevens             | native meldingen                  | Google/Firebase als ingeschakeld      | FCM nog extern te configureren            |
| Diagnostiek, IP- en beveiligingslogs        | beveiliging en betrouwbaarheid    | hosting-/beveiligingsverwerkers       | exacte retentie bevestigen                |
| Offline wachtrij en lokale appdata          | continuïteit                      | normaliter alleen apparaat en runtime | Android-back-up en apparaatoverdracht uit |

“Niet verkopen” betekent in de Google-vragenlijst niet automatisch “niet
delen”. Beoordeel per gegevenstype volgens Googles actuele definities of een
overdracht aan een dienstverlener als verzameld of gedeeld moet worden
aangegeven. Laat de definitieve antwoorden juridisch én technisch controleren;
kopieer de concepttabel niet blind naar Play Console.

Te bevestigen vóór bredere publicatie:

- definitieve subprocessors en regio’s;
- exacte log-, back-up-, document- en supportretentie;
- of een crash-/analytics-SDK wordt toegevoegd;
- of native FCM in de gepubliceerde build actief is;
- juridische rollen van Fieldgrid en de werkgever/tenant;
- verwijder-, inzage- en correctieproces.

## 9. Privacy en gegevens verwijderen

Google vereist een publieke, actieve privacy-URL; alleen een PDF of inlogpagina
is onvoldoende. De app moet vanuit Instellingen naar die pagina kunnen linken.

Nog nodig:

- definitieve privacytekst met juridische entiteit en contactgegevens;
- publieke Fieldgrid-privacy-URL;
- publieke Veele-privacy-URL of één aantoonbaar toepasselijke centrale URL;
- support-/verwijderpagina met uitleg voor personeel;
- technisch en organisatorisch verwijderproces;
- formele goedkeuring van bewaartermijnen en subprocessors.

De app biedt geen vrije accountregistratie: backoffice nodigt personeel uit.
Leg toch helder uit dat een medewerker verwijdering of deactivering kan vragen
bij de werkgever en via de privacycontactroute. Bevestig in Play Console
waarheidsgetrouw of Google voor deze inrichting een account deletion URL
verlangt. Voeg geen zelfserviceknop toe die wettelijke arbeids- of
bewaarverplichtingen omzeilt.

## 10. Firebase en native push

Maak in het gekozen Firebase-project twee Android-apps met de exacte
pakketnamen. Voeg na Play App Signing de juiste signingcertificaten toe.

Benodigd:

- Veele `google-services.json`;
- Fieldgrid `google-services.json`;
- productie-FCM serviceaccount/config;
- server environment-secret;
- fysieke test dat elk merk alleen de juiste tenantmelding ontvangt;
- test van intrekken, tokenrotatie, logout en opnieuw installeren.

De backend ondersteunt afzonderlijke `FCM_VEELE_*`- en
`FCM_FIELDGRID_*`-credentials. Een algemene `FCM_*`-fallback is alleen passend
wanneer beide appidentiteiten bewust in hetzelfde Firebase-project staan.
Bij zo'n gedeeld project blijft het Android-kanaal per pakketnaam gescheiden:
`veele_operations` voor Veele en `fieldgrid_operations` voor Fieldgrid. Een
expliciete `FCM_VEELE_ENABLED=false` of `FCM_FIELDGRID_ENABLED=false` schakelt
alleen die app uit en valt nooit terug op de algemene credentials.

Zonder deze bestanden kan de eerste appversie wel worden getest en gebruikt,
maar native push is dan niet publicatiegereed. Bestaande in-app- en
browsermeldingen zijn geen bewijs dat native FCM werkt.

## 11. Verified App Links

Publiceer per host `/.well-known/assetlinks.json` met:

- relation `delegate_permission/common.handle_all_urls`;
- juiste pakketnaam;
- SHA-256 van de Play app-signing key.

Test daarna op een fysiek Android-apparaat dat een `/personeel`-link direct in
de juiste app opent. Houd Veele en Fieldgrid volledig gescheiden. Een
uploadcertificaat alleen is na Play-distributie onvoldoende.

Voer vóór upload vanuit `artifacts/personeel-pwa` uit:

```bash
pnpm android:preflight:runtime
```

Voer na ontvangst van beide Play app-signing SHA-256-certificaten uit:

```bash
export VEELE_PLAY_APP_SIGNING_SHA256='AA:BB:...'
export FIELDGRID_PLAY_APP_SIGNING_SHA256='CC:DD:...'
pnpm android:preflight:play
```

Beide opdrachten moeten volledig slagen. De huidige Fieldgrid-host faalt nog
door de cross-hostredirect en daaropvolgende 502.

## 12. Eerste internal release

Per app:

1. open **Testing → Internal testing**;
2. maak een eigen testerlist;
3. voeg alleen Google-accountadressen van testers toe;
4. maak release `1.0.0 (1)`;
5. upload de juiste `.aab`;
6. voeg de release notes uit het listingdocument toe;
7. los alle rode fouten op;
8. beoordeel gele waarschuwingen inhoudelijk;
9. start rollout naar internal;
10. open de opt-inlink met hetzelfde Google-account op de telefoon;
11. installeer via Google Play, niet via de losse APK;
12. controleer in Play Console de door Google ondertekende build.

Internal testing is nog geen productiepublicatie.

## 13. Fysieke acceptatiegate

Test beide apps minimaal op:

- recente Android-telefoon;
- Android 13, 14, 15 of 16 waar beschikbaar;
- koude start en terugkeer uit achtergrond;
- login, logout en sessieverval;
- openen vanuit een `/personeel` App Link;
- planning, werkbon starten/pauzeren/afronden;
- offline mutatie, app afsluiten en later reconnect;
- foto/document upload;
- klantondertekening en daarna vergrendeling;
- meldingstoestemming toegestaan en geweigerd;
- native push wanneer Firebase is geconfigureerd;
- apparaatrotatie en systeemlettergrootte;
- donkere modus waar ondersteund;
- update van versiecode 1 naar een interne versiecode 2;
- onvoldoende opslag, netwerkverlies en herstel.

Stop bij tenantlekkage, dataverlies, omzeilde rapportvergrendeling,
authenticatiefouten of niet-idempotente offline mutaties.

## 14. Closed/production gate

Pas doorgaan wanneer:

- privacy- en supportpagina’s publiek en definitief zijn;
- vanuit de app een werkende link naar de toepasselijke privacytekst staat;
- Data safety juridisch en technisch klopt;
- reviewaccount stabiel is;
- assets en screenshots gereed zijn;
- beide internal tracks fysiek zijn getest;
- Firebase/push is getest of bewust als niet-actief is beschreven;
- App Links met Play app-signingcertificaten werken;
- versiebeheer en rollback zijn vastgelegd;
- security- en tenant-isolatietests groen zijn;
- productie-uitrol expliciet door een mens is goedgekeurd.

Gebruik later aparte GitHub Environments voor internal en production, OIDC/
Workload Identity Federation zonder langlevende serviceaccount-JSON-key en
minimaal noodzakelijke app-specifieke Play-rechten. Automatiseer production
niet voordat de eerste handmatige internal upload en review aantoonbaar werken.

## 15. Open externe opdrachten

- de Fieldgrid-runtime op `https://fieldgrid.nl/personeel` zonder cross-host
  redirect en zonder HTTP 502 beschikbaar maken;
- organisatiecodes uit het backoffice veilig aan de juiste medewerkers
  communiceren;
- juridisch organisatieprofiel invullen;
- privacy-, support- en verwijder-URL’s publiceren;
- de definitieve privacylink in het Instellingen-/Meer-scherm opnemen;
- listingassets en geanonimiseerde screenshots maken;
- twee Play-apprecords aanmaken;
- AAB’s handmatig naar internal uploaden;
- Play App Signing-certificaten registreren;
- twee Firebase Android-apps configureren;
- `assetlinks.json` op beide hosts publiceren;
- demo/reviewaccount leveren;
- Data safety en App content formeel invullen;
- beide apps op echte apparaten testen;
- pas daarna besluiten over closed/production.

Officiële controlepunten:

- Android target API: <https://developer.android.com/google/play/requirements/target-sdk>
- Android publiceren: <https://developer.android.com/studio/publish/>
- App Bundles: <https://support.google.com/googleplay/android-developer/answer/9859152>
- Play App Signing: <https://support.google.com/googleplay/android-developer/answer/9842756>
- Data safety: <https://support.google.com/googleplay/android-developer/answer/10787469>
- Internal testing: <https://support.google.com/googleplay/android-developer/answer/9845334>
- Account deletion: <https://support.google.com/googleplay/android-developer/answer/13327111>
