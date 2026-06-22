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
Capacitor native shell wordt Web Push bewust niet geactiveerd, omdat Android
native push via FCM moet lopen.

Voor native push is nog nodig:

1. Firebase Android app aanmaken met package `nl.veeleservices.personeel`.
2. `google-services.json` lokaal plaatsen in:

   ```text
   artifacts/personeel-pwa/android/app/google-services.json
   ```

3. `google-services.json` blijft uit git en wordt door `.gitignore` genegeerd.
4. Daarna in de app een Capacitor `PushNotifications` registratie koppelen aan
   een backend tabel met native device tokens.
5. De centrale notificatieservice moet dan naast Web Push ook FCM tokens kunnen
   afleveren.

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
