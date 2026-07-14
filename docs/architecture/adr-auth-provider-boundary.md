# ADR: Current Authentication Provider Boundary

- Status: Proposed, pending owner acceptance
- Date: 2026-07-14
- Base: `42edb5664ed507ed914b8bebf8847ab1f6e39f74`
- Source: PR #281, rebuilt against the current Fieldgrid architecture

## Context

Fieldgrid currently uses Supabase Auth as the credential and provider-session backend. That dependency is intentionally narrow: Supabase verifies credentials, stores password hashes, issues provider tokens, refreshes provider sessions, updates passwords, and exposes provider revocation primitives. Fieldgrid remains the security boundary for portal routing, tenant identity, profile eligibility, recovery, audit, mail delivery, and policy enforcement.

## Decision

Supabase Auth remains the credential and session backend for now. Fieldgrid owns the application authentication boundary and must keep provider-specific behavior behind a replaceable adapter.

### Mandatory boundary decisions

1. **Host-only Fieldgrid auth cookies.** Current verified behavior in `artifacts/*/src/lib/supabase/session-cookies.ts`: Fieldgrid/Supabase session cookies use a host-derived cookie name, omit the `Domain` attribute so they are host-only, use `path=/`, set `SameSite=Lax`, set `Secure` only in production, and are not scoped to a shared parent domain across backoffice, personnel, and customer portals. Current `@supabase/ssr` browser/session behavior is compatible with browser-readable session cookies; `HttpOnly` is not currently proven or configured. Target requirement: move toward a server-only/`HttpOnly` session boundary where compatible, but first prove refresh/login/logout behavior in browser E2E and never claim `HttpOnly` until implemented and browser-tested.
2. **No magic links as canonical flow.** Magic links are not the canonical invite, login, or recovery flow. Any future passwordless experiment must be additive, threat-modeled, and non-canonical until a new ADR supersedes this one.
3. **No temporary password by e-mail.** Fieldgrid never sends temporary passwords by e-mail. E-mail may carry an invite or recovery challenge, but not a reusable credential.
4. **Challenge-code flow.** Invites and recovery use Fieldgrid-issued challenge codes with expiry, attempt limits, resend cooldowns, audit records, and tenant/profile eligibility checks.
5. **Reset grant flow.** A successful challenge creates a short-lived reset grant. The grant, not the e-mail link alone, authorizes the password update. Grants are one-time use and are bound to portal, host, tenant resolution context, account, challenge, and audit trail.
6. **Session revocation requirements.** Target requirement: password reset, admin reset, suspected compromise, tenant suspension, inactive profile state, wrong-host session detection, and support security action must revoke Fieldgrid cookies and provider refresh sessions. Current repository capability may not yet expose a complete all-session provider revocation seam, so this ADR records a mandatory capability and acceptance requirement, not a claim that full revocation is already implemented.
7. **Administrator reset step-up/MFA.** Support/admin reset initiation, reset grant issuance, and forced session revocation require recent step-up or MFA evidence for the acting administrator.
8. **Wrong-host session denial.** A valid provider session is denied when presented on a host whose Fieldgrid-resolved tenant or portal does not match the database-derived profile context. Denial clears host cookies and audits the event.
9. **Suspended tenant denial.** Suspended tenants cannot complete login, profile resolution, challenge verification, password reset, or session refresh. Existing sessions are revoked.
10. **Personnel/customer profile uniqueness.** Personnel and customer profiles are unique per tenant/account/profile type. A provider user may map to multiple tenant profiles only through explicit Fieldgrid database memberships, never inferred from provider claims.
11. **Platform assurance level.** The platform assurance level requires provider-independent evidence for tenant identity, profile state, challenge state, reset state, rate-limit state, and administrator step-up state before privileged auth outcomes.
12. **CSRF/session-cookie model.** Current browser-readable cookies carry an XSS tradeoff because injected client code may be able to interact with session material exposed through the current browser/session model; `SameSite=Lax` reduces common cross-site form/navigation risk but is not the sole CSRF control. Unsafe methods require a Fieldgrid-verifiable CSRF signal or same-origin server action contract. The target model is server-only/`HttpOnly` where compatible after refresh/login/logout proof.
13. **JWT custom claims.** Fieldgrid does not depend on `tenant_id` JWT custom claims for personnel tenant binding. JWT claims may be optimization hints only and must not authorize tenant access.
14. **Database-derived tenant identity.** Canonical tenant identity comes from Fieldgrid host resolution and database membership/profile records. RLS and API guards must derive effective tenant from database-backed context.
15. **Migration path.** If Supabase Auth is replaced, Fieldgrid preserves the same boundary: replace the provider adapter, migrate identities/session revocation semantics, keep challenge/reset/audit/mail/tenant policies in Fieldgrid, and run the acceptance matrix before cutover.

## Runtime model

1. Resolve portal and tenant from the request host.
2. Validate host-only Fieldgrid cookies and CSRF requirements.
3. Ask the provider adapter to validate or refresh the credential/session only when required.
4. Resolve Fieldgrid account, tenant membership, and portal profile from the database.
5. Deny wrong-host, suspended tenant, inactive profile, stale cookie, and missing-profile states before application access.
6. Audit allow and deny outcomes with provider identifiers treated as external references.

## Consequences

- Provider sessions alone are never sufficient for Fieldgrid access.
- Current cookie behavior is host-only, `SameSite=Lax`, production-`Secure`, and no shared parent-domain cookie; current `HttpOnly` behavior is not proven or configured.
- The target cookie boundary is server-only/`HttpOnly` where compatible, after refresh/login/logout behavior is implemented and browser-tested.
- Complete provider refresh-session revocation is a mandatory target capability and acceptance requirement; the current repository may not yet expose a complete all-session revocation seam.
- Tenant authorization remains portable if Supabase Auth is replaced.
- Reset and invite delivery are Fieldgrid workflows, so product support can enforce rate limits, audit, and step-up consistently.
- Browser E2E coverage is required for backoffice login, personnel login, customer login, wrong-host denial, stale cookie denial, suspended tenant denial, reset challenge verification, password update, and session revocation.
