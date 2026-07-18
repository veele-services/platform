# Phase 2B credential-recovery threat model

Date: 2026-07-18
Scope: customer portal, personnel portal, tenant backoffice, platform admin, invitations and administrator-initiated recovery.

## Assets and trust boundaries

The protected assets are Supabase Auth credentials and sessions, tenant membership, account existence, recovery challenges, audit records, and service-role credentials. Public browser requests cross into server actions or route handlers. Only server code may resolve accounts, use the service role, create challenges, send email, consume grants, or update the canonical auth provider.

A tenant or surface selected by the caller is not trusted. Customer and personnel tenant context comes from the server-resolved portal host. Backoffice tenant and platform authority comes from authenticated membership and permissions. Redirect origins come from an exact server allowlist.

## Threats found before implementation

| Threat | Previous exposure | Phase 2B control |
| --- | --- | --- |
| Reset code accepted as the provider password | Customer, personnel and backoffice legacy completion paths | Codes only verify an HMAC-backed challenge; a separate random one-time grant authorizes the server-side provider update. |
| Generated password returned or emailed | Backoffice provisioning and invitations | Provisioning uses an unreturned internal random provider credential and emails an activation challenge only. |
| Account and tenant enumeration | Different lookup and delivery outcomes | Public request actions always return the same Dutch confirmation; existence and delivery detail remain server-side. |
| Plaintext recovery material | Legacy behavior and insufficient durable lifecycle | Database stores only HMAC-SHA256 lookup, code, grant and request-fingerprint digests. |
| Replay, reuse and concurrent consumption | Missing atomic consume boundary | Verification issues one short-lived grant; row locks and conditional update permit one consume; superseded, used and invalidated timestamps are durable. |
| Cross-tenant or cross-role token use | Caller-provided tenant/surface context | HMAC lookup, challenge query, grant consume and cookie are bound to tenant, surface, purpose, subject, exact origin and request fingerprint. |
| Redirect injection and host-header abuse | Caller-derived callback targets | Only normalized origins in `FIELDGRID_RECOVERY_ALLOWED_ORIGINS` are accepted; links use the server-selected surface origin. |
| Brute force and resend abuse | Process-local or absent limits | Durable event windows limit account plus tenant/surface/purpose and HMAC-redacted client/network fingerprint; attempts and cooldown are stored. |
| Service-role exposure | Provider operations too close to browser flows | Admin clients remain in server-only modules; browser receives neither service credentials nor raw grant (the grant is HttpOnly, SameSite=Strict). |
| Recovery of inactive accounts or archived tenants | Eligibility not rechecked at completion | Completion rechecks active local subject, tenant and surface status inside the consume flow; failure invalidates the challenge. |
| Sensitive acceptance artifacts | Email/code capture could persist secrets | CI outbox is test-only and ephemeral; runtime reports contain only booleans/counts and explicitly assert no code or grant in DB audit data. |
| Missing security audit trail | Request and provider outcomes not linked | Append-only redacted events cover request, delivery, verification, grant, revoke/supersede and provider/session outcome. |

## Security invariants

- A recovery code is not a password and is never passed to a provider password field.
- A code can create at most one grant; a grant can complete at most one recovery.
- The database contains no raw email, code, grant, password, IP address or user agent in recovery tables.
- Generic public responses are independent of account existence, tenant membership, delivery outcome and rate-limit outcome.
- Customer, personnel, tenant-backoffice and platform-admin purposes are non-interchangeable.
- An administrator can see delivery status and expiry, but never a code, grant or password.
- Anonymous and authenticated database roles have no direct recovery-table privileges; service-role access is server-only and RLS remains forced.
- Provider password mutation occurs only after eligibility and one-time grant consumption, and its success/failure plus expected session invalidation is audited.

## Residual risks and operational assumptions

- Exact portal origins must be configured in `FIELDGRID_RECOVERY_ALLOWED_ORIGINS` before deploying custom domains.
- The service-role key and `FIELDGRID_CREDENTIAL_RECOVERY_SECRET` require normal secret rotation and must never enter browser bundles.
- Supabase session invalidation semantics are provider behavior. Phase 2B records the provider outcome and signs the current browser out; post-deployment observability should continue to verify global session behavior after password changes.
- Email delivery confidentiality depends on the configured central provider. CI uses no external provider.
- Platform bootstrap remains a separate operational flow and is not a public invitation/recovery path.

## Evidence routes

Runtime: `lib/db/src/credential-recovery-service.ts`, the three surface auth actions, and `artifacts/backoffice/src/lib/auth/portal-invites.ts`.

Database: `lib/db/migrations/20260718180000_complete_credential_recovery.sql`.

Tests: `scripts/fieldgrid-credential-recovery-runtime.mts`, `tests/security/credential-recovery-source.test.mjs`, existing auth contract tests, and the Fieldgrid Playwright recovery journeys.
