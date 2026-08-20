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

- `sendgrid_api` — aanbevolen voor standaard Fieldgrid-mail;
- `resend_api`
- `smtp`

SendGrid gebruikt rechtstreeks de officiële Mail Send API. Fieldgrid accepteert
geen vrij configureerbare API-URL: de gekozen regio bepaalt een van deze vaste
endpoints:

- Global: `https://api.sendgrid.com/v3/mail/send`
- EU regional: `https://api.eu.sendgrid.com/v3/mail/send`

De EU-optie is alleen bedoeld voor een SendGrid EU-regional subuser.

Secrets staan in `encrypted_config_json` en worden versleuteld met AES-256-GCM. De technische encryptiesleutel komt uit:

- `FIELDGRID_EMAIL_CONFIG_ENCRYPTION_KEY`
- fallback: `PLATFORM_EMAIL_CONFIG_ENCRYPTION_KEY`

SendGrid- en Resend-API-keys en SMTP-wachtwoorden horen niet als primaire
configuratie in `.env`. Alleen de encryptiesleutel is een technische secret.

## Platform Admin

Platform admin beheert e-mail via `/platform/settings`.

De pagina ondersteunt:

- providerkeuze voor SendGrid API, Resend API of SMTP;
- SendGrid API-regio en geauthenticeerd sending domain;
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

De frontend krijgt nooit decrypted secrets. Platform admin ziet alleen masked
status zoals `SG.************abcd`, `re_************abcd` of
`geconfigureerd`.

Voor SendGrid geldt aanvullend:

- maak een Custom Access API key met alleen `Mail Send`;
- authenticeer `fieldgrid.nl` in SendGrid voordat de provider actief gaat;
- gebruik standaard `Fieldgrid <noreply@fieldgrid.nl>`;
- kies alleen de EU-regio wanneer het account en de subuser EU-regional zijn;
- verstuur na configuratie een echte testmail vanuit Platform Admin.

De API key wordt nooit teruggestuurd naar de browser, gelogd of in auditmetadata
opgenomen. Foutmeldingen verwijderen SendGrid-keys en Bearer-tokens.

## Gemigreerde mailflows

De volgende surfaces gebruiken de centrale service:

- backoffice uitnodigingen, resetmails, rapporten, offertes, facturen en tenant-admin acties;
- klant-PWA wachtwoord-reset en klantportaalmails;
- personeels-PWA wachtwoord-reset, verlof en rapportage-notificaties;
- api-server payment reminders, verlopen offertes en notification worker.

Tenanttransporten worden uitsluitend opgehaald via de exacte `tenant_id` van het
bericht. De service controleert daarbij opnieuw dat de tenant actief is en de
runtime-status `trial` of `active` heeft. Er bestaat geen globale scan of
fallback over SMTP-instellingen van andere tenants.

## Afzenderbeleid

De actieve platformprovider heeft voorrang en geldt voor alle centrale
mailflows. Daarna komt uitsluitend een provider die aan de exacte tenant van het
bericht is gebonden. Als laatste mag de expliciete Fieldgrid-omgevingsprovider
worden gebruikt. Zonder een geldige kandidaat faalt verzending gesloten. Een
tenant krijgt niet automatisch een eigen SendGrid-key of eigen afzenderdomein.
Custom enterprise-afzenders zijn bewust een latere uitbreiding met afzonderlijke
domeinverificatie, autorisatie en beheer.

## Nieuwe provider toevoegen

1. Voeg provider type toe aan de DB check constraint.
2. Breid `EmailProviderConfig` uit in `lib/db/src/email-service.ts`.
3. Voeg een adapterfunctie toe naast `sendWithSendGrid`, `sendWithResend` en `sendWithSmtp`.
4. Valideer verplichte velden in `validateProviderInput`.
5. Voeg provider UI-velden toe aan `/platform/settings`.
6. Voeg tests toe in `tests/fieldgrid-platform-email-service.test.mjs`.
