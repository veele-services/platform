# Fieldgrid e-mail template system

## Doel

Alle transactionele e-mails gebruiken een centrale template renderer bovenop de bestaande providerlaag. De providerlaag blijft verantwoordelijk voor tenant/providerselectie, aflevering en `email_delivery_log`; de template renderer is verantwoordelijk voor subject, HTML, tekstfallback, variabelen en white-label theme.

## Hoofdcomponenten

| Component | Bestand | Rol |
| --- | --- | --- |
| Template registry | `lib/db/src/email-templates.ts` | Definieert templatekeys, verplichte/optionele variabelen, copy, details en CTA's. |
| Renderer | `lib/db/src/email-templates.ts` | Rendert HTML en tekst, escaped variabelen, valideert CTA-URL's en mistende variabelen. |
| Theme resolver | `lib/db/src/email-templates.ts` + `tenant-branding.ts` | Gebruikt tenanttheme wanneer beschikbaar en valt terug op Fieldgrid Clean Ops Mail. |
| Override table | `tenant_email_template_overrides` | Tenant-scoped subject/preheader/headline/body/CTA/footer overrides. |
| Provider service | `lib/db/src/email-service.ts` | Selecteert tenantprovider, platformprovider of fallback, verzendt en logt aflevering. |
| App helpers | `artifacts/*/src/lib/email.ts` | Backwards-compatible wrappers voor bestaande callsites. |

## Renderflow

1. Een app helper roept `renderEmailTemplatePreview()` aan met een `templateKey` en variabelen.
2. De caller stuurt de HTML zoals voorheen naar `sendEmailWithResult()` of `sendEmail()`.
3. `sendTransactionalEmail()` herkent de preview via metadata in memory.
4. De service rendert opnieuw met `tenantId`, effectieve tenanttheme en eventuele override.
5. De service vult `subject`, `html`, `text` en `templateKey` aan.
6. De bestaande providerresolver verzendt en schrijft `email_delivery_log`.

Nieuwe code kan ook direct `sendTemplatedEmail()` gebruiken.

## White-label fallback

De fallback is Fieldgrid Clean Ops Mail:

- primaire CTA: `#16A34A`
- tekst: `#18212B`
- achtergrond: `#F5F7F8`
- card: `#FFFFFF`
- border: `#E4E8EC`
- muted: `#6B7280`

Wanneer `tenantId` wordt meegegeven, gebruikt de renderer `getEffectiveBrandTheme(tenantId)`. Daardoor kunnen tenantlogo, merknaam, kleuren, footer en signature meebewegen met platform- en tenantinstellingen.

## Security regels

- Alle variabelen worden standaard HTML-geescaped.
- Line breaks in tekstvariabelen worden veilig naar `<br>` omgezet.
- CTA-URL's moeten `http`, `https` of een relatieve path-URL zijn.
- Verplichte variabelen worden gevalideerd voor verzending.
- Onbekende tokens in registry of override veroorzaken een validatiefout.
- Override-tabellen hebben RLS aan en directe `anon`/`authenticated` toegang is gerevoked.

## Template overrides

Tabel: `tenant_email_template_overrides`.

Ondersteunde velden:

- `subject_template`
- `preheader_template`
- `headline_template`
- `intro_template`
- `cta_label_template`
- `cta_url_template`
- `footer_note_template`

`intro_template` gebruikt lege regels als paragraafscheiding. Overrides mogen alleen bestaande variabelen van de template gebruiken, plus `brandName` en `platformName`.

## Nieuwe templates toevoegen

1. Voeg een key toe aan `EmailTemplateKey`.
2. Voeg de definitie toe aan `EMAIL_TEMPLATES`.
3. Zet alle tokens in `requiredVariables` of `optionalVariables`.
4. Gebruik app helpers of `sendTemplatedEmail()` met dezelfde key.
5. Voeg een test toe die de key, variabelen en callsite dekt.
