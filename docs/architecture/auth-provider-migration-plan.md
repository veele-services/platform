# Fieldgrid auth provider migration plan

Date: 2026-07-12
Scope: Architecture and operations plan only. No migrations, product behavior changes, workflow changes or deployments are included.

## Recommendation

Use Option A as the long-term boundary for now: keep Supabase Auth as the identity, credential-verifier and session/JWT backend, while Fieldgrid owns tenant authorization, invite activation, recovery challenges, email, host/tenant binding, audit and security policy.

Option B is a future program that should start only after an explicit product and security decision funds a first-party identity service. It is not a safe incremental login refactor because the current database, RLS, Storage and audit model depend on Supabase user UUIDs and `auth.uid()`.

## Migration Implications

### Option A - Retain Supabase Auth

No data migration is required for the boundary decision.

Phased rollout:

1. Publish the ADR and inventory.
2. Freeze the current boundary in architecture docs: Supabase proves identity; Fieldgrid proves tenant and authorization.
3. Add runtime evidence without changing provider:
   - Browser cookie and PKCE tests.
   - API JWT positive and negative tests.
   - DB/RLS tenant isolation tests.
   - Supabase Storage policy tests.
4. Harden policy in separate future PRs:
   - Trusted proxy/header requirements.
   - JWT issuer/audience/project expectations.
   - Admin secret consolidation and rotation docs.
   - Recovery-code rate limits, replay controls, audit and email-delivery rollback.
   - Optional adapter boundary around Supabase Auth imports.

Rollback:

- This documentation change can be reverted.
- Runtime rollback is unchanged because no behavior changes are made.
- No sessions need invalidation.
- No database rollback is needed.
- No Storage rollback is needed.

Compatibility:

- Existing Supabase UUIDs remain canonical for `platform_users`, `tenant_users`, `customer_users`, `personnel.user_id`, `tenant_owner_invites`, audit actor fields and RLS/Storage policies.
- Existing login, reset, invite, MFA, API JWT and Storage behavior remains unchanged.

Open evidence:

- Runtime DB/RLS and Storage proof is still required before claims of runtime isolation.
- Current static source tests remain useful guardrails but are not runtime validation.

### Option B - Replace Supabase Auth

Option B requires a staged expand/dual-run/contract migration. Do not start by replacing login screens.

#### Phase 0 - Architecture Gate

Required decisions:

- Canonical principal model: for example `fieldgrid_users` plus `auth_identities(provider, provider_subject, fieldgrid_user_id, legacy_supabase_user_id)`.
- Whether existing Supabase UUIDs remain stable external references or become legacy provider subjects.
- Whether customer accounts may span tenants and how tenant login context is selected.
- Which surfaces require mandatory MFA first: platform, tenant admins, customer, personnel.
- Whether WebAuthn/passkeys are launch scope or follow TOTP.
- Retention requirements for session, device, audit and recovery records.
- How Supabase Storage access is authorized after Supabase Auth is removed.

Exit criteria:

- Threat model reviewed.
- Data model approved.
- Rollback model approved.
- Runtime test infrastructure available for DB/RLS, Storage, API and browser sessions.

#### Phase 1 - Additive Identity Mapping

Create only forward-compatible, additive migrations if explicitly approved in a future implementation task.

Candidate tables:

- `fieldgrid_users`
- `auth_identities`
- `password_credentials`
- `auth_sessions`
- `auth_refresh_token_families`
- `auth_mfa_factors`
- `auth_recovery_tokens`
- `auth_email_verifications`
- `auth_devices`
- `auth_service_accounts`
- `auth_security_events`

Backfill:

- Map every existing Supabase user UUID from `platform_users.user_id`.
- Map `tenant_users.user_id`.
- Map `customer_users.user_id`.
- Map `personnel.user_id`.
- Map `tenant_owner_invites.user_id` and provisioning owner fields.
- Map content and audit actor fields such as `documents.uploaded_by`, `reports.submitted_by`, `audit_log.user_id`, release/read receipt user IDs and push device token user IDs.

Rollback:

- Keep all legacy Supabase UUID columns and current policies usable.
- Do not delete or rewrite legacy user IDs during this phase.
- Backfill can be ignored by old code if runtime remains on Supabase Auth.

#### Phase 2 - Dual-Run Read Path

Add server resolvers that can read:

- Supabase `auth.uid()` subject.
- Fieldgrid principal ID.
- Provider identity mapping.

Rules:

- Tenant, customer, personnel and platform authorization must continue to fail closed.
- No client-supplied tenant ID becomes trusted.
- Existing tenant-bound parent relations must remain in the final query path.
- Zero-row updates must still fail closed.

Rollback:

- Switch resolvers back to Supabase-only reads.
- Keep mapping data intact for diagnostics.

#### Phase 3 - Dual-Write Invites and Recovery

Future Option B must replace temporary-password reset codes with first-party recovery records.

Required behavior:

- Invite acceptance tokens are hashed at rest, single-use, tenant/portal bound and audited.
- Password reset tokens or codes are hashed at rest, single-use, rate-limited and have attempt counters.
- Email verification is a separate state transition.
- Password reset invalidates active sessions or marks them for step-up.
- Recovery responses remain generic and do not reveal foreign-tenant identifiers.
- Email delivery failure after credential mutation must be rollback-safe.

Rollback:

- Existing Supabase invite/reset path remains available until the new path has runtime evidence.
- Do not retire Supabase admin password mutation before recovery runtime proof exists.

#### Phase 4 - Session and API Token Migration

First-party sessions require:

- Argon2id password hashes with versioned parameters and rehash-on-login.
- Pepper support and rotation plan.
- Server-side sessions with hashed rotating refresh tokens.
- Short-lived access tokens or opaque API tokens.
- Token family reuse detection.
- Logout current device and all devices.
- Admin revocation.
- Idle and absolute expiry.
- Device, IP and user-agent metadata.
- CSRF tokens or double-submit binding for cookie-authenticated mutations.

API authentication requires:

- Fieldgrid issuer/JWKS or opaque introspection.
- Audience, tenant, scope and actor claims.
- Revocation behavior and expiry rules.
- Compatibility plan for `lib/api-client-react`.
- Replacement plan for shared `ADMIN_API_SECRET` with scoped service accounts or signed job tokens.

Rollback:

- Force all new sessions to expire or revoke.
- Keep Supabase sessions valid until cutover criteria pass.
- Do not run both cookie formats without explicit precedence and logout semantics.

#### Phase 5 - RLS and Storage Transition

This is the highest-risk phase.

Database options:

- Keep Supabase-compatible JWTs and `auth.uid()` claims even with Fieldgrid-owned credentials.
- Or rewrite RLS helpers to resolve through `auth_identities`.
- Or move sensitive reads/writes behind server-side authorization with service-role database access.

Storage options:

- Keep Supabase Auth-compatible Storage policies.
- Rewrite Storage policies to use mapped claims.
- Move upload, download and delete behind server-side service-role routes with tenant-bound signed URL checks.

Required runtime tests:

- `current_user_tenant_ids` under old and new identities.
- Customer access helpers under old and new identities.
- Personnel assignment access under old and new identities.
- Platform/support access under old and new identities.
- Storage `SELECT`, `INSERT`, `UPDATE` and `DELETE` for documents and assignment media.
- Cross-tenant denial for guessed IDs and guessed Storage paths.

Rollback:

- Retain old Supabase RLS/Storage policies until after cutover verification.
- Keep old path acceptance windows documented.
- Do not remove legacy `auth.uid()` policy support in the same phase as token cutover.

#### Phase 6 - Cutover

Prerequisites:

- Runtime tests pass for browser, API, DB/RLS and Storage.
- Audit dashboard includes first-party auth events.
- Incident response can revoke user, tenant, platform and service sessions.
- Support runbook covers account recovery, MFA reset and session revocation.
- Rollback plan is rehearsed.

Cutover actions:

- Freeze new Supabase-only invites.
- Force re-authentication across backoffice, customer and personnel hosts.
- Start issuing Fieldgrid sessions and API tokens.
- Monitor login failure rate, recovery requests, RLS denials, Storage denials and audit volume.

Rollback:

- Re-enable Supabase session issuance and admin invite/reset flows.
- Revoke Fieldgrid sessions.
- Keep mapping data for forensic comparison.
- Do not delete first-party auth records until incident review completes.

#### Phase 7 - Supabase Auth Retirement

Only after a sustained verification window:

- Remove Supabase Auth direct imports from app authentication flows.
- Retire `auth.users` triggers and FKs through new forward-only migrations.
- Retire Supabase Auth metadata reliance.
- Retire Supabase JWT verification from the API server.
- Retire or rewrite Supabase Storage policies.
- Remove legacy columns only after data retention and rollback windows expire.

Rollback limitation:

- Once Supabase Auth users, passwords, refresh tokens or `auth.users` dependencies are deleted, rollback becomes restore/migration work, not a simple deploy rollback.

## Operational Risks

| Risk | Option A | Option B |
| --- | --- | --- |
| Tenant lockout | Low if Supabase remains available | High during identity/RLS cutover |
| Cross-tenant data exposure | Existing risk depends on Fieldgrid guards and RLS | High unless dual-run RLS and Storage tests pass |
| Recovery abuse | Current reset-code flow needs hardening | Must be redesigned and rate-limited |
| Session revocation | Supabase-owned | Fieldgrid-owned and must be built |
| MFA support | Supabase-dependent and partial | Fieldgrid-owned and must be built |
| Storage authorization | Existing Supabase policy semantics | Must be bridged or server-mediated |
| Operational burden | Moderate | High, identity-provider operator burden |
| Rollback | Simple for docs/policy | Complex after session/password cutover |

## Test Matrix

Existing tests are mostly static source guards. Future evidence should be classified accurately:

| Test area | Required layer |
| --- | --- |
| Password hashing, token hashing, recovery token generation | Unit |
| Session rotation and reuse detection | Integration |
| Login, reset, MFA and logout flows | API/server-action runtime plus browser/E2E |
| Supabase or Fieldgrid JWT verification | Unit plus API runtime |
| Tenant membership and permission helpers | Integration |
| RLS tenant isolation | Database integration / RLS runtime |
| Storage policies and signed URLs | Storage runtime |
| Cookie isolation and CSRF | Browser/E2E plus API/server-action runtime |
| Migration backfill and rollback | Database integration plus migration dry run |
| Incident response and audit export | Integration plus manual runbook rehearsal |

## Rollback Notes

For this documentation-only task:

- Rollback is reverting the three architecture files.
- No migration exists.
- No runtime behavior changes.
- No sessions are invalidated.
- No workflow or deployment changes.

For future Option B:

- Rollback is safe only while Supabase UUIDs, policies, sessions and invite/reset flows remain operational.
- Do not delete Supabase identity data during dual-run.
- Do not rewrite all user IDs without a legacy mapping table.
- Do not remove RLS/Storage compatibility in the same phase as session cutover.
- Document every irreversible step before execution.
