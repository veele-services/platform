# Personeelsapp — Capacitor en Android

De bestaande Next.js-personeelsapp wordt als twee afzonderlijke Android-apps
gebouwd. Beide apps gebruiken dezelfde geteste productcode, maar hebben een
eigen onveranderlijke Play-identiteit, naam, icoon, productiedomein en
uploadkey.

| Variant             | Pakketnaam                   | Productieroute                                 |
| ------------------- | ---------------------------- | ---------------------------------------------- |
| Veele Personeel     | `nl.veeleservices.personeel` | `https://veeleservices.fieldgrid.nl/personeel` |
| Fieldgrid Personeel | `nl.fieldgrid.personeel`     | `https://fieldgrid.nl/personeel`               |

De pakketnamen moeten vóór de eerste Play-upload definitief worden bevestigd.
Google laat een pakketnaam na de eerste upload niet meer wijzigen.

## Architectuur

De native apps zijn beveiligde Capacitor-wrappers rond de server-rendered
personeelsapp. Dat is nodig omdat de app Next.js server actions, Supabase SSR,
tenant-RBAC en server-side sessies gebruikt. De wrapper:

- staat alleen HTTPS toe;
- sluit alle appdata uit van Android-cloudback-ups en apparaatoverdracht;
- opent uitsluitend de eigen `/personeel` App Link;
- gebruikt aparte Android product flavors voor Veele en Fieldgrid;
- deelt geen signingmateriaal via Git;
- blijft functioneel zonder Firebase-configuratie, maar heeft dan nog geen
  native FCM-push.

Offline mutaties en lokale continuïteit blijven door de bestaande
personeelsapp verzorgd. Dit is geen volledig statische APK: voor aanmelden,
servermutaties en verse data blijft de Fieldgrid-runtime nodig.

## Lokale vereisten

- Node `>=24 <25`;
- pnpm `11.5.2`;
- JDK 21;
- Android SDK met platform en build tools 36.

Voor deze lokale sprint staan de geïsoleerde toolchains onder:

```text
/home/codex/.local/share/fieldgrid-android/jdk-21
/home/codex/.local/share/fieldgrid-android/sdk
```

Deze paden zijn lokale hulpmiddelen en worden niet gecommit.

## Uploadkeys

Eenmalig genereren:

```bash
cd artifacts/personeel-pwa
JAVA_HOME=/pad/naar/jdk-21 pnpm android:signing:init
```

Het script maakt twee afzonderlijke PKCS#12-uploadkeys en één lokaal
propertiesbestand. Standaardlocatie:

```text
~/.local/share/fieldgrid-android/signing/
```

Het script:

- overschrijft nooit bestaande keys;
- drukt wachtwoorden niet af;
- zet de map op mode `0700`;
- zet keys en properties op mode `0600`;
- houdt alle secrets buiten de repository.

Maak vóór de eerste Play-upload minimaal twee versleutelde back-ups van de
volledige signingmap. Verlies van een uploadkey is herstelbaar via Play, maar
zorgt voor vertraging en extra identiteitscontrole. Deel keys of wachtwoorden
nooit via chat, e-mail, tickets of Git.

## Signed Play-build

```bash
export JAVA_HOME=/pad/naar/jdk-21
export ANDROID_HOME=/pad/naar/android-sdk
export ANDROID_SDK_ROOT="$ANDROID_HOME"
export FIELDGRID_VERSION_CODE=1
export FIELDGRID_VERSION_NAME=1.0.0

cd artifacts/personeel-pwa
pnpm android:build:play
pnpm android:collect:play
```

Dit bouwt per merk:

- een signed APK voor directe installatie en interne hardwaretests;
- een signed Android App Bundle (`.aab`) voor Google Play.

De collector kopieert de vier bestanden standaard naar:

```text
/home/codex/output/fieldgrid-play/
```

De releasebuild stopt wanneer één signingprofiel ontbreekt. De collector stopt
wanneer de Git-worktree niet schoon is, wanneer broncommit en `HEAD` verschillen
of wanneer pakketnaam, label, versie, target SDK, Capacitor-runtimeconfig of
handtekening niet exact kloppen. Hij schrijft daarna een controleerbaar
`manifest.json` met SHA-256-bestandshashes en certificaatvingerafdrukken.

Bij iedere nieuwe release moet `FIELDGRID_VERSION_CODE` worden verhoogd en kan
`FIELDGRID_VERSION_NAME` worden aangepast. Play accepteert nooit tweemaal
dezelfde versionCode. Zet beide waarden expliciet in de releaseomgeving; de
standaard `1` en `1.0.0` zijn alleen geschikt voor de eerste interne build.

## Flavorconfiguratie

De normale Capacitor-config heeft Veele als veilige lokale default. De
releaseflavors bevatten elk een eigen vaste configuratie:

```text
android/app/src/veele/assets/capacitor.config.json
android/app/src/fieldgrid/assets/capacitor.config.json
```

Gebruik `CAPACITOR_SERVER_URL`, `CAPACITOR_APP_ID` en `CAPACITOR_APP_NAME`
alleen voor lokale ontwikkelvarianten. Een Play-build mag niet stilzwijgend
naar staging of localhost wijzen.

## App Links

Android valideert:

- `https://veeleservices.fieldgrid.nl/personeel/...` voor Veele;
- `https://fieldgrid.nl/personeel/...` voor Fieldgrid.

De runtime mag niet naar een andere host doorsturen: een geïnstalleerde app
vertrouwt alleen de host die in de betreffende flavor is vastgelegd. Controleer
dit vóór iedere release:

```bash
cd artifacts/personeel-pwa
pnpm android:preflight:runtime
```

Voor echte verified App Links moet op elk domein een publiek
`/.well-known/assetlinks.json` staan. Na inschrijving voor Play App Signing
moet daarin het SHA-256-certificaat van de **Play app-signing key** staan, niet
alleen dat van de lokale uploadkey. Dit is een server-/DNS-acceptatiestap en
wordt niet door een lokale APK-build uitgerold.

Controleer runtime en App Links samen nadat Google de twee app-signing
SHA-256-vingerafdrukken toont:

```bash
export VEELE_PLAY_APP_SIGNING_SHA256='AA:BB:...'
export FIELDGRID_PLAY_APP_SIGNING_SHA256='CC:DD:...'
pnpm android:preflight:play
```

## Native push

Browser/PWA Web Push blijft werken. Native FCM-push vereist twee afzonderlijke
Firebase Android-apps:

1. `nl.veeleservices.personeel`;
2. `nl.fieldgrid.personeel`.

Download per Firebase-app de eigen `google-services.json`. Combineer deze niet:
Android-flavorbestanden moeten onder de bijbehorende flavor worden geplaatst.
Signingcertificaten, pakketnaam en Firebase-app moeten exact bij elkaar horen.

Server-side FCM gebruikt bij voorkeur
`FCM_VEELE_SERVICE_ACCOUNT_JSON_BASE64` en
`FCM_FIELDGRID_SERVICE_ACCOUNT_JSON_BASE64`. Alternatief zijn de
app-specifieke `PROJECT_ID`, `CLIENT_EMAIL` en `PRIVATE_KEY`-varianten. De
algemene `FCM_SERVICE_ACCOUNT_JSON_BASE64` blijft een bewuste fallback wanneer
beide Android-apps aantoonbaar in hetzelfde Firebase-project staan. Zet
`FCM_ENABLED=true` pas wanneer de productieconfiguratie compleet en fysiek
getest is. Zonder Firebase blijft de app bruikbaar; native push blijft dan
bewust uit.

De native app registreert pakketnaam en appversie bij ieder token. Uitloggen
trekt het lokale token in en markeert het server-token inactief. Server-side
verzending selecteert de FCM-configuratie op de gevalideerde pakketnaam, zodat
Veele- en Fieldgrid-apparaten niet stilzwijgend dezelfde appidentiteit krijgen.

## Broncontrole

```bash
pnpm fieldgrid:android-play:check
pnpm --filter @workspace/personeel-pwa typecheck
```

Controleer daarnaast vóór upload:

```bash
apksigner verify --verbose --print-certs app.apk
aapt2 dump badging app.apk
jarsigner -verify app.aab
```

De collector voert deze controles zelfstandig uit; de losse commando's zijn
bedoeld als handmatige tweede controle.

De volledige Play Console-procedure en open externe acties staan in
`docs/deployment/google-play-personnel-apps.md`.
