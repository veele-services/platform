# Personeel-PWA Capacitor Wrapper

De personeelsapp is Capacitor-ready als native Android shell rond de bestaande
Next.js applicatie. De app laadt standaard:

```text
https://staging.veele.dgwebservices.nl/personeel
```

Omdat de personeelsapp server actions, Supabase SSR en server-side sessies
gebruikt, is de eerste native variant bewust een remote WebView-wrapper. Een
volledig statische offline APK is pas logisch nadat de personeelsflows via een
client API-laag zijn losgetrokken van Next server actions.

## Buildprofielen

Staging:

```bash
cd artifacts/personeel-pwa
CAPACITOR_SERVER_URL=https://staging.veele.dgwebservices.nl/personeel pnpm cap:sync
pnpm cap:open:android
```

Production:

```bash
cd artifacts/personeel-pwa
CAPACITOR_SERVER_URL=https://app.veele.dgwebservices.nl/personeel pnpm cap:sync
pnpm cap:open:android
```

## Android project

Het Android project staat in:

```text
artifacts/personeel-pwa/android
```

Belangrijke instellingen:

- Package name: `nl.veeleservices.personeel`
- App name: `Veele Personeel`
- Min SDK: 24
- Target SDK: 36
- Remote server URL via `CAPACITOR_SERVER_URL`
- `POST_NOTIFICATIONS` permissie is toegevoegd voor Android 13+

## Native push

De huidige webapp blijft Web Push gebruiken in browser/PWA-modus. Binnen de
Capacitor native shell wordt Web Push bewust niet geactiveerd; de app gebruikt
daar de Capacitor `PushNotifications` plugin en registreert een FCM device
token bij het platform.

Native push is voorbereid, maar optioneel. Zonder Firebase-configuratie blijft
alle bestaande Web Push en in-app notificatie werken.

### Firebase Android app

1. Maak in Firebase een Android app aan met package `nl.veeleservices.personeel`.
2. Download `google-services.json` en plaats die lokaal in:

   ```text
   artifacts/personeel-pwa/android/app/google-services.json
   ```

3. `google-services.json` blijft uit git en wordt door `.gitignore` genegeerd.
4. Run daarna:

   ```bash
   cd artifacts/personeel-pwa
   pnpm cap:sync
   ```

### Server-side FCM

De API-server verstuurt native push via de FCM HTTP v1 API. Configureer bij
voorkeur een base64-gecodeerde service-account JSON als GitHub Environment
secret:

```bash
base64 -w0 firebase-service-account.json
```

Benodigde/optionele runtime vars:

- `FCM_ENABLED`: optioneel, zet op `true` om ontbrekende FCM-config expliciet
  als misconfiguratie te loggen.
- `FCM_SERVICE_ACCOUNT_JSON_BASE64`: aanbevolen secret met de volledige
  Firebase service-account JSON in base64.
- `FCM_PROJECT_ID`, `FCM_CLIENT_EMAIL`, `FCM_PRIVATE_KEY`: alternatief voor
  de JSON-route. Gebruik bij `FCM_PRIVATE_KEY` escaped `\n` voor line breaks.
- `FCM_ANDROID_CHANNEL_ID`: optioneel, standaard `veele_operations`.

De worker gebruikt dezelfde `notification_delivery_queue` als Web Push. Voor
`channel = push` probeert de worker eerst actieve browser push subscriptions en
daarnaast actieve native FCM tokens. Permanente FCM-tokenfouten worden
automatisch gedeactiveerd.

## Lokale vereisten

- Node volgens workspace engine: `>=24 <25`
- pnpm `11.5.2`
- Android Studio met Android SDK
- JDK 21 voor de gegenereerde Android Gradle config

## Sync workflow

Na wijzigingen aan `capacitor.config.ts`, native plugins of assets:

```bash
cd artifacts/personeel-pwa
pnpm cap:sync
```

Voor alleen web assets kopieren:

```bash
pnpm cap:copy
```
