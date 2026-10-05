# Staging mail hooks: activation contract

Status: implementation verified locally, **not a deployment confirmation**.
Operational release acceptance remains unfinished. The mail SQL is now captured
in `20261001013206_release_security_privacy.sql` and passes fresh/upgrade replay.
The separate configurable-roles prototype is not included or activated. Do not
activate these integrations against the old staging release.

## Configuration

| GitHub Environment `staging` key | Kind | Status / use |
|---|---|---|
| `SENDGRID_EVENT_WEBHOOK_PUBLIC_KEY` | Variable | Configured by owner; verifies ECDSA event signatures, not a Mail Send API key |
| `SUPABASE_SEND_EMAIL_HOOK_SECRET` | Secret | Configured by owner; complete `v1,whsec_…` signing secret |
| `MAIL_MARKETING_ENABLED` | Variable | Owner confirmed `false`; no marketing activation in this rollout |
| `SENDGRID_API_KEY` | Secret | Existing staging Mail Send credential |
| `SENDGRID_FROM_EMAIL`, `SENDGRID_FROM_NAME` | Variables | Existing verified staging sender |

`deploy-staging.yml` and `write-runtime-env.sh` forward these exact names into
the runtime. Preflight checks names, key formats and marketing-off state without
printing values. Do not retrieve secrets or copy them into repository files.

### Universele OTP-login: exacte staging Auth-instelling

Alle werkruimtes gebruiken een e-mail-OTP: platformbeheer, tenantbeheer,
personeel en klanten. Er is geen wachtwoord- of magic-link-login. Configureer
dit uitsluitend in het **nieuwe staging-Supabaseproject** onder Authentication:

- Email provider: ingeschakeld;
- Email OTP length: `6`;
- Email OTP expiry: `3600` seconden;
- minimale resend-interval voor magic-link/OTP-mail: `60` seconden;
- Email Templates → **Magic Link**, onderwerp `Je inlogcode voor Fieldgrid`,
  met ten minste deze inhoud:

```html
<h2>Je inlogcode voor Fieldgrid</h2>
<p>Gebruik deze eenmalige code om in te loggen:</p>
<p><strong>{{ .Token }}</strong></p>
<p>De code verloopt en kan maar één keer worden gebruikt.</p>
```

Neem in dit Magic Link-sjabloon geen `{{ .ConfirmationURL }}`, zelfgebouwde
`TokenHash`-URL of andere credentialdragende link op. De repositoryvariant in
`supabase/templates/magic_link.html` is uitsluitend de lokale CLI-bron; een
hosted Supabaseproject neemt die niet automatisch over bij een deploy. De
operator kopieert de inhoud daarom bewust via de hosted projectinstellingen.

Wanneer de Send Email Hook actief is, vervangt die het hosted mailsjabloon en
maakt `/api/email/auth` iedere loginmail als gebrande zescijferige codemail.
De tenant komt uitsluitend uit de gecontroleerde hostname en de bestaande
server-side lidmaatschappen/klantbindingen. De platformhost gebruikt Fieldgrid.
De hosted Magic Link-template blijft verplicht, zodat een bewuste terugval
naar directe Auth-SMTP geen onbruikbare magic link oplevert. Die terugval mist
tenantbranding en is dus geen volledige acceptatie van deze release.

Zet voor nieuwe beheerdersuitnodigingen ook de hosted **Invite user**-template
overeenkomstig `supabase/templates/invite.html`: de accountactie gebruikt
`{{ .RedirectTo }}#token_hash={{ .TokenHash }}&type=invite`. De applicatie levert
hiervoor `/auth/verify` op de tenantorigin als `RedirectTo`. De link activeert
het account pas na bevestigen, zet geen browsersessie en stuurt daarna naar
OTP-login. Bewaar geen `ConfirmationURL`-link die direct een sessie opent.
Personeelsuitnodigingen gebruiken de bestaande afzonderlijke fragmentflow.
Bevestiging van een e-mailadres blijft eveneens een accountactie, geen login.
Neem voor **Reset password** ook `supabase/templates/recovery.html` over:
deze mail verwijst in tekst naar OTP-login en bevat geen herstelcredential.

De redirectallowlist bevat de platform- en tenantorigins met `/login`,
`/auth/verify` en de bestaande uitnodigingsroutes. Controleer dit expliciet:
een geweigerde `emailRedirectTo` kan bij Auth terugvallen op de platform-Site URL
en daarmee de tenantbranding verliezen.

### Controleerbare activatiegrens — 5 oktober 2026

De repository bevat geen workflow of script dat hosted Auth-instellingen
wijzigt. Een inventarisatie van **namen** in GitHub Environment `staging`
bevestigt `SUPABASE_SEND_EMAIL_HOOK_SECRET`, `SUPABASE_SERVICE_ROLE_KEY` en de
SendGrid-configuratie. Er is geen `SUPABASE_ACCESS_TOKEN` voor de Auth Management
API geïnventariseerd. De project-servicekey en de hook-handtekeningsleutel zijn
geen beheertoken voor hosted providerinstellingen. De eigenaar bevestigde op 5 oktober 2026 tijdens de voorbereiding van de
klantportaalrelease opnieuw dat de Send Email Hook **uitgeschakeld** staat.
Dit is actuele operatorbevestiging, geen inspectie via een provider-API. Zonder geautoriseerde provider-UI
of beheertoegang kan een applicatiedeploy activatie niet vaststellen of uitvoeren.

De volgende acceptatiestappen blijven daarom expliciete operatorhandelingen
na exacte-SHA healthvalidatie. Alleen het bestaan van de endpoint of een
succesvolle lokale ondertekende test is geen bewijs van echte Auth-levering.

## Operator sequence (only after a release-ready staging deployment)

1. Confirm required migrations ran, the deployed health SHA matches the reviewed
   promoted SHA, and local/integration checks for this release passed. The
   ticket scanner and other release blockers must also be resolved first.
2. Enable the **signed staging SendGrid Event Webhook** at
   `https://staging.fieldgrid.nl/api/email/events`. Use Processed, Delivered,
   Deferred, Bounced, Dropped, Spam Reports and unsubscribe/group events.
   Tracking opens/clicks is unnecessary. Confirm an actual test transmission is
   registered as accepted and subsequently delivered; a 202 is not delivery.
3. Apply the exact universal OTP Auth settings and templates above
   in the **new staging Supabase project**. Then replace the temporary
   `https://www.fieldgrid.nl` hook URL with
   `https://staging.fieldgrid.nl/api/email/auth`. Keep the configured signing
   secret consistent with GitHub. Enable the Send Email Hook only now. Keep the
   Email provider enabled. Never edit the production project.
4. Request a code with operator-owned accounts for `/platform`, tenant `/app`,
   `/staff` and `/klant`. Confirm each mail uses the correct Fieldgrid/tenant
   brand and exactly a six-digit code without a credential-bearing URL. Enter
   it once, confirm only the authorized workspace opens, and confirm replay
   fails. All four screens must have no password field. An unknown address
   receives the same browser response without account-status disclosure.
   Verify wrong-tenant and revoked customer binding attempts fail closed.
5. Test a new tenant-administrator invitation with an operator-owned test
   account: acceptance sets no login session and requires a fresh OTP. Test a
   direct Auth password-recovery request: the hook sends only instructions to
   request a login code, with no recovery token or password form. Also test existing personnel invitations
   (these intentionally use the existing custom invitation flow), secure email
   change on both mailboxes, replay/expiry and tenant branding. Auth links use
   `/auth/verify` on the platform/tenant origin. Obsolete `/auth/confirm`,
   `/auth/forgot` and `/auth/reset` routes must return to OTP-login.
6. With a separate administrator session available, test the central global
   mail stop against both application sends and a direct Auth recovery request.
   Test tenant-specific stops from the corresponding tenant origin. Do not
   claim this protection while SMTP still bypasses the hook. Restore the
   intended policy after the test; keep marketing disabled.

Supabase's hook replaces SMTP, not supplements it. If activation causes Auth
mail failures, disable the hook and retain/restore the previously working
SMTP configuration **and first confirm the hosted Magic Link-template still
contains `{{ .Token }}`**. This restores delivery but also removes the central
application mail-stop coverage and tenant-specific hook branding for Auth;
report those limitations explicitly.

## Implementation guarantees and limits

- Raw-body signature and timestamp are checked before parsing or DB access.
- Tenant branding is authorized using active memberships/customer bindings or
  a pre-existing server-created tenant-admin invitation. User-editable metadata
  never chooses a tenant. No tenant context explicitly means platform scope;
  it never means the first tenant in a user's memberships.
- The hook passes through the central durable mail transport, including
  security mails. Recipient identity is hashed in technical delivery records.
- Hook receipts contain a payload digest, not OTPs, token hashes, rendered
  security mail or provider error bodies. Logs must not record request bodies.
- Delivery retries do not replay a completed/in-progress/uncertain hook. A
  partial two-address email change or uncertain provider result requires a new
  Auth request, not a blind replay; this prioritizes avoiding duplicate sends.
- Account-activation and email-change credentials travel in a fragment, removed
  immediately from browser history. GET never verifies; a deliberate server
  action does, using an isolated session that never logs the browser in. Every
  login mail contains only the one-use six-digit code and no credential-bearing
  link. Tracking is disabled on all of these mails.
- Endpoint unit tests and local DB checks do not establish actual provider
  delivery, real-world hook timing, or staging configuration correctness.
  Those operator acceptance checks remain mandatory.

References: [Supabase Send Email Hook](https://supabase.com/docs/guides/auth/auth-hooks/send-email-hook)
and [SendGrid signed Event Webhook](https://www.twilio.com/docs/sendgrid/for-developers/tracking-events/getting-started-event-webhook-security-features).

## Locally executed checks — 2026-10-01

- `pnpm test`: 385 unit/route tests passed, including raw signatures, redirect
  validation, secure email-change recipient/hash mapping, duplicate/uncertain
  hook handling, transport admission and marketing-off enforcement.
- Mail database tests together with roles, tickets and notification regression:
  85 tests passed (including six parent tests). Fixtures are rolled back and
  include actual `anon`/`authenticated` denial checks. No staging DB was used.
- Production-mode build plus four Playwright flows passed: the new signed hook
  → local test mailbox → deliberate recovery confirmation → password update →
  replay rejection, and all three existing personnel invitation flows. The
  hook browser check signs a real request against the application with a
  clearly fictitious local key and uses a real local Auth token; it does not
  activate the Supabase provider hook. Existing invitation checks include
  desktop/mobile email snapshots.
- Typecheck, targeted ESLint, shell syntax and `git diff --check` passed.

The counts above describe the earlier targeted mail implementation checks only;
the password-recovery behavior has since been replaced by universal OTP.
Current integration evidence is maintained in
[`portal-release-verification-2026-10-05.md`](../security/portal-release-verification-2026-10-05.md).
The baseline staging release `1f47c7b8621c18cd2a70b570a2ea0cda275154ad`
passed its full deployment workflow and exact-SHA public health check on
5 October 2026. That application health does not establish provider delivery.
The owner confirmed that the Send Email Hook remains disabled; replace the
temporary URL only during the controlled activation sequence above.
