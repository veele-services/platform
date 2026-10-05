# Read-only staging Auth-mail diagnosis — 5 October 2026

The deployed release `dcd9fd70feb7a80cf72c732949a660060638c733` passed
all six staging workflow jobs and exact-SHA public health validation. The
owner then reported no OTP mail and the Auth log error
`500: Service currently unavailable due to hook`. Delivery remains unaccepted.
The GoTrue HTTP dispatcher uses this error for hook HTTP 429/503; the Fieldgrid
mail handler can return 503 but does not return 429. No provider error body,
address, code or secret is included in this evidence.

## Operational boundary

The manual diagnostic workflow requires the reviewed `main` tip, identifies
the already promoted `origin/staging` commit, checks its ancestry and exact
public health SHA, and shares deployment concurrency. It does not deploy,
alter Supabase hooks or change mail policy. Credentials come only from GitHub
Environment `staging` and stay on the ephemeral hosted runner in the relevant
step. There are no user-supplied URL, branch, SQL, recipient or payload inputs.

The shared staging project guard rejects absent or mismatched project identity,
the fixed forbidden production ref, URI routing overrides and an unexpected
database port. The database uses certificate verification and overrides
ambient startup options with `default_transaction_read_only=on`. The fixed
aggregations execute in a repeatable-read read-only transaction followed by
rollback. No fixture, schema, user or provider setting is changed.

## Privacy and diagnostic meaning

The unsigned and signed probes contain exactly `{}`. They must return 401 and
400 respectively. Schema rejection happens before context, receipt or mail
access. The signed probe checks the GitHub key against the runtime verifier;
it does not prove that Supabase uses the same signing key.

Database output is restricted to validated counts, fixed status/reason enums
and mail-policy counts. Unknown free-text reasons become `other`. There are no
recipient addresses/hashes, hook ids, provider ids, subjects, payloads or OTPs
in output. Network, database, validation and provider responses/errors are
never relayed. The runner also captures idle database error events without
printing Node error stacks.

The separate platform-context probe invokes only the read-only service RPC
`email_auth_context`, using a fixed fictitious actor and `example.invalid` address.
It verifies the expected platform-brand response without logging that response,
creating an account or attempting a send.

No receipts can also mean rejection before the receipt claim, including
context or OTP-length validation. `blocked` points to explicit policy or
recipient suppression. `accepted` means provider acceptance and does not prove
mailbox delivery. Missing events do not prove non-delivery if the provider
Event Webhook is not active. These signals must be compared with Auth Logs.

## Validation

Focused tests exercise project/ref/origin guards, exact-SHA health rejection,
empty-payload signature construction, no redirects or cookies, read-only
queries, rollback, safe output schemas and redaction on error paths.
All 48 focused tests pass, as do the full unit suite, scoped ESLint and
typecheck. All four aggregate queries were executed against the isolated local
Supabase database with `transaction_read_only=on` verified before every SELECT,
followed by rollback and connection closure. HTTP was mocked and no fixtures
or external requests were used for that SQL check. The workflow received an
independent review with no findings. The diagnostic has not yet established
the live failure cause or delivery.

Reference: [GoTrue HTTP hook dispatcher](https://github.com/supabase/auth/blob/v2.196.0/internal/hooks/hookshttp/hookshttp.go).
