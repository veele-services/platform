# ADR: Fieldgrid authentication provider boundary

Status: Proposed
Date: 2026-07-12
Scope: Architecture decision record only. This ADR does not implement a new authentication provider and does not change current login or reset behavior.

## Context

Fieldgrid currently uses Supabase Auth as the runtime account identity, credential verifier and session/JWT issuer. Fieldgrid application code then resolves tenant, platform, customer and personnel authorization through Fieldgrid-owned tables and server-side checks.

The current boundary is not just a login UI dependency:

- The three Next applications use Supabase SSR/browser clients, host-keyed cookies and `auth.getUser()` in middleware, layouts, server actions and routes.
- The API server accepts Supabase Bearer JWTs and sets `req.userId` from the verified `sub` claim.
- Database RLS and Storage policies depend on Supabase `auth.uid()` and `authenticated` semantics.
- `auth.users` is referenced by early migrations, personnel invite triggers and nullable actor FKs.
- User-facing Fieldgrid identities are stored as Supabase user UUIDs in `platform_users`, `tenant_users`, `customer_users`, `personnel.user_id`, `tenant_owner_invites`, audit rows and content ownership columns.
- Invite activation and recovery are Fieldgrid-managed flows that mutate Supabase Auth users through server-only admin clients.

The current evidence level is source inspection and static contract tests. It is not runtime proof of Supabase Auth, RLS or Storage behavior.

## Current Boundary

| Surface | Current provider responsibility | Fieldgrid responsibility | Representative evidence |
| --- | --- | --- | --- |
| Browser sessions | Supabase SSR cookies and refresh | Host-specific cookie naming and route gating | `artifacts/backoffice/src/lib/supabase/session-cookies.ts`, `artifacts/klant-pwa/src/middleware.ts`, `artifacts/personeel-pwa/src/middleware.ts` |
| Login | Supabase password verification and session issuance | Audit, forced reset routing, tenant/profile authorization after login | `artifacts/backoffice/src/app/actions/auth.ts`, `artifacts/klant-pwa/src/app/(auth)/login/LoginForm.tsx`, `artifacts/personeel-pwa/src/actions/auth.ts` |
| PKCE confirm | Supabase code exchange | Host-aware redirect target and host-only cookie writes | `artifacts/*/src/app/auth/confirm/route.ts` |
| Managed invites and reset codes | Supabase Auth user/password/app metadata storage | Temporary password generation, email, audit, tenant binding | `artifacts/backoffice/src/lib/auth/portal-invites.ts`, `artifacts/*/src/actions/auth.ts` |
| API user auth | Supabase access JWT signature verification | Tenant resolution, permissions and route handlers | `artifacts/api-server/src/middleware/auth.ts` |
| Background/admin API | Shared `ADMIN_API_SECRET` bearer secret | Scheduled/admin route authorization | `artifacts/api-server/src/lib/admin-api.ts`, `artifacts/api-server/src/routes/payment-reminders.ts` |
| Database isolation | Supabase `auth.uid()` and authenticated role | Fieldgrid RLS functions, tenant joins and app guards | `lib/db/migrations/037_tenant_customer_users_events_hardening.sql`, `lib/db/migrations/051_final_security_boundaries.sql` |
| Storage | Supabase Storage policies and service-role clients | Tenant-bound signed URLs, app-mediated portal access | `lib/db/migrations/050_storage_upload_hardening.sql`, `lib/db/migrations/064_assignment_storage_policy_guards.sql` |
| MFA | Supabase MFA for the feature-flagged personnel UI only | Product policy, feature flag and UX | `artifacts/personeel-pwa/src/app/(app)/beveiliging/MfaSettings.tsx` |

## Options Considered

### Option A: Keep Supabase Auth as identity, credential verifier and session backend

Fieldgrid keeps Supabase Auth for account credentials, session cookies, access JWTs, `auth.users`, `auth.uid()` and Supabase MFA/session primitives. Fieldgrid explicitly owns invite activation, recovery challenges, email delivery, trusted host/tenant binding, module and permission enforcement, audit, policy, operational evidence and incident response.

Estimated impact:

| Area | Estimate |
| --- | --- |
| Affected components | Three Next apps, API JWT middleware, DB RLS/Storage policy docs, email/recovery flows, audit docs. Mostly documentation and boundary hardening unless later code work is approved. |
| Data migration | None for this decision. Existing Supabase UUIDs remain canonical runtime subjects. |
| Dual-run | Not needed for provider retention. Future improvements can be staged per flow. |
| Rollback | Documentation-only rollback is reverting the ADR. Runtime rollback is unchanged because no product behavior changes. |
| Session invalidation | No immediate invalidation. Future policy changes may require targeted Supabase sign-out or password reset. |
| RLS/Storage consequences | Existing `auth.uid()` and Supabase Storage policy semantics stay intact. Runtime proof remains required. |
| Tenant identity consequences | Tenant, customer, personnel and platform rows continue to store Supabase user UUIDs. Fieldgrid must document that a Supabase session is necessary but not sufficient for tenant access. |
| Security ownership | Supabase owns credential/session primitives. Fieldgrid owns tenant authorization, recovery policy, host binding, audit, email delivery and operational controls. |
| Operational burden | Moderate. Continue managing Supabase project settings, service-role containment, provider monitoring, JWT configuration and runtime evidence. |
| Test matrix | Add runtime cookie, PKCE, JWT, RLS and Storage evidence without replacing provider. Keep static source guards as lower-layer tests. |
| Phased rollout | ADR first, then targeted hardening PRs for proxy trust, JWT claim policy, admin secret consolidation, recovery audit/rate limits and runtime proof. |

Strengths:

- Lowest blast radius and fastest path to a defensible boundary.
- Preserves all existing `auth.uid()`, `auth.users`, RLS and Storage semantics.
- Avoids forced credential migration and mass session invalidation.
- Keeps Fieldgrid focused on tenant authorization, audit and operational policy, where the current system already has ownership.

Weaknesses:

- Continued dependency on Supabase Auth availability, JWT behavior, MFA/session primitives and service-role controls.
- Existing direct Supabase imports remain broad unless future adapter work is approved.
- Runtime evidence gaps remain open until specific RLS, Storage, cookie and JWT tests are implemented.

### Option B: Replace Supabase Auth with a Fieldgrid-owned identity service

Fieldgrid builds and operates first-party credentials, sessions, MFA, recovery, API authentication, service-to-service authentication, audit and incident response using Argon2id password hashing, server-side session storage, rotating tokens, CSRF protection, email verification, WebAuthn/TOTP and device/session management.

Estimated impact:

| Area | Estimate |
| --- | --- |
| Affected components | Every auth-using surface: backoffice, klant PWA, personeel PWA, API server, DB RLS, Supabase Storage policies, invite/reset/email flows, platform user management, customer/personnel profile linking, tests and operations. |
| Data migration | High-risk identity migration from Supabase UUID subjects to stable Fieldgrid principals or provider subject mappings. Requires backfilling all current `user_id` surfaces before cutover. |
| Dual-run | Required. Supabase and Fieldgrid identities must run together while reads, writes, invites, reset codes, sessions, API tokens, RLS and Storage behavior are proven. |
| Rollback | Complex. Existing Supabase UUIDs and policies must remain usable until after cutover verification. Do not delete or rewrite legacy user IDs in the same phase as provider replacement. |
| Session invalidation | Required at cutover. Browser cookies, refresh tokens, API bearer tokens and support/admin sessions must be invalidated or bridged deliberately. |
| RLS/Storage consequences | Critical. Existing `auth.uid()` and Supabase Storage policies must be bridged, rewritten or moved behind server-side service-role routes before Supabase Auth can be removed. |
| Tenant identity consequences | Requires a stable Fieldgrid principal model and explicit membership model across platform, tenant, customer and personnel actors. |
| Security ownership | Fieldgrid owns all credential, session, MFA, recovery, token, CSRF, device, audit and incident-response controls. |
| Operational burden | Very high. Fieldgrid becomes an identity provider operator with password hashing, token rotation, key management, abuse defenses, breach response, recovery support and compliance retention. |
| Test matrix | Full runtime matrix: credential unit tests, API/server-action integration, DB/RLS integration, Storage runtime, browser/E2E, migration dry runs, rollback drills and incident simulations. |
| Phased rollout | Architecture and schema design, additive mapping, dual-write, shadow verification, browser/API session migration, RLS/Storage transition, forced reauth, provider retirement. |

Strengths:

- Full control over credentials, sessions, MFA, recovery, device management, audit and service authentication.
- Removes long-term dependency on Supabase Auth product behavior if DB/Storage dependencies are also addressed.
- Enables a first-party identity model with clear tenant membership semantics.

Weaknesses:

- Replaces a provider dependency with a large security-critical product.
- Requires new migrations, new runtime services, new secrets/key management and a broad test matrix.
- Cannot be treated as a login rewrite; the current DB and Storage policies are coupled to Supabase `auth.uid()`.
- Rollback is difficult after password/session cutover.

## Decision

Recommend Option A for the long-term boundary at this stage.

Supabase Auth should remain the identity, credential-verifier and session/JWT backend while Fieldgrid explicitly owns tenant authorization, invite activation, recovery challenges, email delivery, host and tenant binding, audit, security policy, runtime evidence and incident response.

This recommendation is conservative because the current platform is deeply coupled to Supabase Auth subjects in database RLS, Storage policies, API JWTs and user mapping tables. Option B should remain a future architecture program, not an incremental product change, until Fieldgrid has approved a stable first-party principal model, migration budget, runtime RLS/Storage test infrastructure and operational ownership for credentials, sessions, MFA and recovery.

## Consequences

- Fieldgrid must document that a valid Supabase session only proves account identity. It does not prove tenant, platform, customer or personnel authorization.
- Fieldgrid-owned server code must continue to derive tenant from trusted host/domain state, tenant-bound parent records, or server-side membership tables. Client-provided tenant IDs and hidden UI controls remain untrusted.
- Service-role Supabase admin clients remain server-only and must be used only behind Fieldgrid authorization and audit.
- Host-only cookies require separate trusted hosts or a deliberate same-host sharing decision. Shared-domain auth cookies remain out of policy.
- Reverse proxies must overwrite `X-Forwarded-Host` and `X-Forwarded-Proto`; application code must not trust client-supplied forwarded headers directly.
- API bearer auth must be documented as a separate boundary from browser cookie sessions. Current code verifies signature and `sub`; future hardening should define issuer, audience, project and revocation expectations.
- CSRF posture is currently implicit for cookie-authenticated browser mutations. Future hardening should document and test explicit CSRF/origin controls for mutable server actions and route handlers.
- RLS and Storage runtime proof remains required before claiming database or Storage isolation evidence.

## Required Follow-Up Work

No follow-up below is implemented by this ADR.

1. Add runtime tests for host-only Supabase cookies, PKCE redirects and cross-host session isolation.
2. Add API JWT tests for issuer/audience/project expectations, missing `sub`, expiry, JWKS behavior and fallback configuration.
3. Add runtime DB/RLS tests for tenant, platform/support, customer and personnel identity helpers.
4. Add runtime Supabase Storage tests for assignment media and document signed URL/path guessing.
5. Consolidate admin API bearer-secret handling and document rotation.
6. Add explicit recovery-code rate limit, replay, email-delivery rollback and audit requirements.
7. Decide whether to introduce an adapter layer around Supabase Auth calls while retaining Supabase Auth as backend.

## Rejected For This Task

- Implementing a Fieldgrid-owned authentication provider.
- Changing login, confirm, reset, invite, MFA, API auth, RLS or Storage behavior.
- Creating migrations or workflow changes.
- Accessing staging, live Supabase, provider consoles, live secrets or production systems.
