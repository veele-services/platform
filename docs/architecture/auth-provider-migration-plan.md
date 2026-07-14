# Auth Provider Migration Plan

## Current decision

Supabase Auth remains the credential and session backend for now. Fieldgrid keeps tenant identity, recovery, reset grants, rate limits, audit, e-mail delivery, portal cookie isolation, support/admin policy, and post-login profile resolution outside the provider.

## Provider abstraction contract

The replaceable provider adapter must support credential verification, provider session refresh, password update, user lookup by provider subject, token/session revocation, and audit-safe provider identifiers. It must not own tenant binding, portal selection, recovery challenge state, reset grant state, or administrator step-up policy.

## Migration phases

1. **Inventory and freeze.** Keep `auth-provider-dependency-inventory.json` current and reject new direct provider dependencies that bypass the adapter.
2. **Dual-read readiness.** Store Fieldgrid account/profile mappings by stable internal IDs plus external provider subject references.
3. **Provider candidate spike.** Validate credential verification, password update, refresh, revocation, and account recovery APIs behind the adapter using provider mocks.
4. **Session compatibility.** Define how old provider sessions are revoked and how new host-only Fieldgrid cookies are issued after reauthentication.
5. **Identity migration.** Migrate provider subjects without changing database-derived tenant memberships or profile uniqueness constraints.
6. **Cutover rehearsal.** Run static, unit, DB integration, RLS, API runtime, browser E2E, provider mock, and staging evidence from the acceptance matrix.
7. **Production cutover.** Disable legacy provider session refresh, require reauthentication where risk requires it, monitor denial/audit rates, and retain rollback only while password/session integrity is provable.

## Non-negotiable invariants

- No dependency on `tenant_id` JWT claims for personnel tenant binding.
- No magic links as the canonical flow.
- No temporary passwords by e-mail.
- Reset requires challenge verification followed by a short-lived one-time reset grant.
- Admin/support reset requires recent step-up or MFA evidence.
- Session revocation must clear Fieldgrid cookies and revoke provider refresh sessions.
