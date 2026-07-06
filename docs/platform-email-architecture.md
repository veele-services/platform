# Platform E-mailarchitectuur

Fieldgrid gebruikt een centrale server-side mailservice voor alle uitgaande e-mail:

- `@workspace/db/email-service`
- `sendTransactionalEmail`
- `sendEmail`
- `sendPlatformEmailTest`

App-specifieke helpers in backoffice, klant-PWA, personeels-PWA en api-server mogen alleen templates, URL's en copy opbouwen. Providerkeuze, credentials, verzending en logging lopen via de centrale service.

## Configuratie

Platformbrede providerconfiguratie staat in `platform_email_providers`.

Ondersteunde providers:

- `resend_api`
- `smtp`

De tabel is voorbereid op extra API-providers zoals SendGrid, Postmark of Mailgun. Voeg daarvoor een nieuwe `provider_type` toe aan de database check constraint, implementeer een provider-adapter in `email-service.ts` en breid de platform-admin UI uit met provider-specifieke velden.

Secrets staan in `encrypted_config_json` en worden versleuteld met AES-256-GCM. De technische encryptiesleutel komt uit:

- `FIELDGRID_EMAIL_CONFIG_ENCRYPTION_KEY`
- fallback: `PLATFORM_EMAIL_CONFIG_ENCRYPTION_KEY`

De Resend API key en SMTP-wachtwoorden horen niet meer als primaire configuratie in `.env`. Alleen de encryptiesleutel is een technische secret.

## Platform Admin

Platform admin beheert e-mail via `/platform/settings`.

De pagina ondersteunt:

- providerkeuze voor Resend API of SMTP;
- masked secretstatus;
- overschrijven van secrets zonder bestaande waarde te tonen;
- from name, from email en reply-to;
- testmail naar een opgegeven ontvanger;
- auditlog bij opslaan en testmail.

Alle actions gebruiken `requirePlatformAdmin`.

## Logging

Elke verzendpoging schrijft naar `email_delivery_log`:

- provider;
- template key of purpose;
- tenant id indien bekend;
- ontvanger;
- onderwerp;
- status;
- provider message id indien beschikbaar;
- foutmelding zonder secrets;
- actor/system context;
- timestamp.

## Security

De migration `093_platform_email_providers.sql` schakelt RLS in en trekt directe grants voor `anon` en `authenticated` in op:

- `platform_email_providers`
- `email_delivery_log`

De frontend krijgt nooit decrypted secrets. Platform admin ziet alleen masked status zoals `re_************abcd` of `geconfigureerd`.

## Gemigreerde mailflows

De volgende surfaces gebruiken de centrale service:

- backoffice uitnodigingen, resetmails, rapporten, offertes, facturen en tenant-admin acties;
- klant-PWA wachtwoord-reset en klantportaalmails;
- personeels-PWA wachtwoord-reset, verlof en rapportage-notificaties;
- api-server payment reminders, verlopen offertes en notification worker.

Legacy `organization_settings` SMTP blijft alleen als tijdelijke fallback in de centrale service bestaan voor nul-downtime. Nieuwe platforminstellingen schrijven naar `platform_email_providers`.

## Nieuwe provider toevoegen

1. Voeg provider type toe aan de DB check constraint.
2. Breid `EmailProviderConfig` uit in `lib/db/src/email-service.ts`.
3. Voeg een adapterfunctie toe naast `sendWithResend` en `sendWithSmtp`.
4. Valideer verplichte velden in `validateProviderInput`.
5. Voeg provider UI-velden toe aan `/platform/settings`.
6. Voeg tests toe in `tests/fieldgrid-platform-email-service.test.mjs`.
