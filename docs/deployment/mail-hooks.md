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

## Operator sequence (only after a release-ready staging deployment)

1. Confirm required migrations ran, the deployed health SHA matches the reviewed
   promoted SHA, and local/integration checks for this release passed. The
   ticket scanner and other release blockers must also be resolved first.
2. Enable the **signed staging SendGrid Event Webhook** at
   `https://staging.fieldgrid.nl/api/email/events`. Use Processed, Delivered,
   Deferred, Bounced, Dropped, Spam Reports and unsubscribe/group events.
   Tracking opens/clicks is unnecessary. Confirm an actual test transmission is
   registered as accepted and subsequently delivered; a 202 is not delivery.
3. In the **new staging Supabase project**, replace the temporary
   `https://www.fieldgrid.nl` hook URL with
   `https://staging.fieldgrid.nl/api/email/auth`. Keep the configured signing
   secret consistent with GitHub. Enable the Send Email Hook only now. Keep the
   Email provider enabled. Never edit the production project.
4. Test a new tenant-administrator invitation and password recovery with an
   operator-owned test account. Also test existing personnel invitations
   (these intentionally use the existing custom invitation flow), secure email
   change on both mailboxes, replay/expiry and tenant branding. Auth links use
   `/auth/verify` on the platform/tenant origin; ensure the established staging
   redirect allowlist covers that route as well as `/auth/confirm`.
5. With a separate administrator session available, test the central global
   mail stop against both application sends and a direct Auth recovery request.
   Test tenant-specific stops from the corresponding tenant origin. Do not
   claim this protection while SMTP still bypasses the hook. Restore the
   intended policy after the test; keep marketing disabled.

Supabase's hook replaces SMTP, not supplements it. If activation causes Auth
mail failures, disable the hook and retain/restore the previously working
SMTP configuration. This restores delivery but also removes the central
application mail-stop coverage for Auth; report that limitation explicitly.

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
- Personal verification credentials travel in a fragment, removed immediately
  from browser history. GET never verifies; a deliberate server action does.
  Tracking is disabled on these mails.
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

The counts above describe the earlier targeted mail implementation checks.
Current release evidence is maintained in `docs/security/release-security-verification.md`:
fresh migration replay, preserved notification/mail history and the complete
local production-mode browser suite now pass. The mail-centre UI, configurable
roles cutover, actual provider callbacks and staging activation are **not**
claimed complete. The hook is confirmed disabled by the owner; replace the
temporary URL only during the controlled activation sequence above. No push,
external provider mutation or deployment took place.
