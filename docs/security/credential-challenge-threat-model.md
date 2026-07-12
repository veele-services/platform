# Credential Challenge Protocol Threat Model

## Scope

Fieldgrid owns invite activation, password reset, admin-initiated reset request handling, identity lookup, tenant and host binding, challenge generation, challenge verification, restricted reset grants, e-mail dispatch, rate-limit metadata, audit events, and UI state. Supabase Auth remains the credential/session backend, but no request path may set a mailed code as the real password before a Fieldgrid challenge is verified.

## Assets

- Supabase Auth credentials and sessions.
- Fieldgrid tenant/personnel/customer identity bindings.
- Credential challenge codes and reset grants.
- E-mail outbox/template payloads.
- Audit log entries for reset and invite events.

## Secret Configuration

Required startup configuration names, without values:

- FIELDGRID_CREDENTIAL_CHALLENGE_HMAC_KEY: high-entropy HMAC/pepper key for e-mail, code, grant, IP, and user-agent hashes.
- FIELDGRID_CREDENTIAL_CHALLENGE_KEY_VERSION: current key version stored on new challenges and grants.
- FIELDGRID_CREDENTIAL_CHALLENGE_EXPIRES_MINUTES: operator-configurable challenge lifetime; current code default is 30 minutes.
- FIELDGRID_CREDENTIAL_CHALLENGE_MAX_ATTEMPTS: operator-configurable failed-attempt ceiling; current code default is 5.
- FIELDGRID_CREDENTIAL_CHALLENGE_RATE_LIMITS: operator-configurable global, tenant, account-HMAC, and IP-HMAC limits; current code includes conservative defaults and the database model stores the needed hashed dimensions.

## Main Threats And Controls

- Account enumeration: public request actions return generic success for unknown accounts and store lookup keys as HMACs rather than plaintext e-mail.
- Pre-proof account takeover or lockout: request paths now create Fieldgrid challenges and send codes without changing the Supabase credential or locking the account.
- Admin-visible passwords: invite/reset helpers no longer return a real auth password to administrators; new auth identities are created with an internal random password that is never displayed or mailed.
- Cross-tenant reset: customer and personnel public flows bind account lookup to the current portal tenant; admin personnel reset now requires the current tenant and filters the selected personnel row by tenant.
- Wrong host challenge use: challenges store a normalized trusted host class; verification and grant consumption require the same host class.
- Replay: reset grants are short-lived, stored only as hashes, and consumed once together with the parent challenge state.
- Brute force: the schema tracks attempts, max attempts, resend count, IP hash, user-agent hash, tenant, account HMAC, and timestamps. The current service enforces global volume and resend cooldown; per-IP, per-account-HMAC, and per-tenant enforcement should be tightened before staging runtime enablement.
- Notification disclosure: e-mail templates may include only the challenge code and reset URL, never a password or grant secret.

## Migration Notes

The additive migration is lib/db/migrations/20260712120000_credential_challenge_protocol.sql and must run after 20260711181500_sprint0_schema_recovery_parity.sql. It creates credential_challenges and credential_reset_grants, partial active-row indexes, lookup/cleanup indexes, and revokes anon/authenticated table access. It does not edit existing migrations and must not be run against a remote database from Codex.

## Rollback Notes

Rollback is operationally limited because challenges and grants are security state. A code rollback can stop creating new challenges, but already issued challenge rows should expire or be invalidated rather than migrated back into temporary passwords. A database rollback would drop only the new additive tables after all pending credential e-mails have expired and no reset UI depends on outstanding grants.

## Current Runtime Evidence Gaps

- No live Supabase, RLS, Storage, provider, browser, or staging evidence was collected because live-service access is prohibited.
- Supabase all-session revocation for a target user is not yet represented by a repository-local seam; current code can sign out the current session, but target-user global revocation still requires a supported backend capability or documented admin API wrapper.
- MFA/step-up for admin-initiated reset is not present in the current permission stack; admin reset is permission-gated and audited, but true step-up remains a future architecture decision.
- Verification and new-password UI should be completed against the restricted reset grant before staging enablement; source guards in this PR prove the dangerous pre-verification password mutation has been removed, not that the full browser flow has runtime evidence.
