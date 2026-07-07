# Fieldgrid e-mail white-label audit

Datum: 2026-07-07

## Scope

Deze audit bekijkt transactionele e-mails in:

- `lib/db/src/email-service.ts`
- `lib/db/src/email-templates.ts`
- `artifacts/backoffice/src/lib/email.ts`
- `artifacts/klant-pwa/src/lib/email.ts`
- `artifacts/personeel-pwa/src/lib/email.ts`
- `artifacts/api-server/src/lib/email.ts`
- API routes, server actions en notification worker die e-mail verzenden

## Bevindingen voor deze wijziging

| Onderdeel | Bevinding | Risico |
| --- | --- | --- |
| Providerselectie | Centrale providerlaag bestond al in `lib/db/src/email-service.ts`. Tenantproviders worden gebruikt wanneer `tenantId` wordt meegegeven. | Callers zonder `tenantId` vielen terug op platformprovider en platformtheme. |
| Delivery logging | `email_delivery_log` registreerde provider, ontvanger, onderwerp, status en `templateKey`. | Losse builders gaven vaak geen echte templatekey door; logging was daardoor minder bruikbaar. |
| Templates | HTML stond verspreid in backoffice, klantportaal, personeelsportaal, API server en settings-testmails. | Hardcoded branding, inconsistente copy, geen centrale tekstfallback, meer kans op token- of HTML-fouten. |
| White-label | `tenant-branding.ts` levert platform- en tenantthema's, maar veel e-mailbuilders gebruikten vaste kleuren/merknaam. | Tenantlogo/kleur/footer werden niet consequent toegepast. |
| Template overrides | Er was nog geen tenant-scoped template override-model. | Copy aanpassen per tenant kon niet centraal en controleerbaar. |
| Input escaping | Builders interpoleerden waarden direct in HTML. | Onbedoelde HTML-injectie in e-mails bij vrije tekstvelden. |
| Testmails | Settings testmails hadden raw HTML met oude Veele-copy. | Niet white-label-proof en geen centrale tekstfallback. |

## Wijziging

- Nieuwe centrale template registry: `lib/db/src/email-templates.ts`.
- Nieuwe tenant override-tabel: `tenant_email_template_overrides`.
- `sendTransactionalEmail()` herkent centraal gerenderde previews en rendert vlak voor verzending opnieuw met effectieve tenanttheme en eventuele override.
- `sendTemplatedEmail()` is toegevoegd voor directe template-verzending vanuit de centrale service.
- Backoffice, klantportaal, personeelsportaal en API-server mailhelpers renderen via dezelfde registry.
- Settings testmails zijn vervangen door `notification_test` en `tenant_mail_settings_test`.
- Callers met bekende tenantcontext geven nu expliciet `tenantId` en `purpose` door.

## Resultaat

Alle bestaande HTML builders gebruiken nu de centrale renderer. Dynamic values worden HTML-geescaped, CTA-URL's worden gevalideerd, optionele rijen verdwijnen als waarden leeg zijn, en elke centraal gerenderde mail krijgt een plain-text fallback. Tenant-specific branding loopt via `getEffectiveBrandTheme()` met Fieldgrid Clean Ops Mail als fallback.

## Restpunten

- De notification worker kan nog raw HTML uit de queue versturen. Deze route is tenant-aware gemaakt, maar de queue producer moet op termijn ook templatesleutels en variabelen opslaan in plaats van HTML.
- Tenant override-beheer heeft nu database- en renderer-support; UI voor templatebeheer kan hierop worden gebouwd.
