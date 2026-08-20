# Notification worker lifecycle and evidence

The notification worker claims queue rows with `FOR UPDATE SKIP LOCKED` and creates the
`processing` attempt record in the same database transaction. Immediately before any external
provider call it rechecks the tenant lifecycle, the `notifications` entitlement, event/channel
settings and the tenant-bound recipient. A denied delivery is finalized as `skipped` with a
machine-readable reason.

Every delivery queue item has one stable `delivery_key`. Resend receives it as a provider
idempotency key; SendGrid receives it as a custom argument/header; SMTP derives a stable
Message-ID; Web Push uses a stable Topic and FCM a stable collapse key. Retries never invent a new
provider key.

Attempt outcome and queue outcome finalize in one transaction. `sent`, `failed`, `skipped` and
`partial` queue rows are constrained to reference matching attempt evidence. Push evidence is
stored per subscription/device ID and outcome without persisting endpoints, tokens or key
material in the attempt response.

`delivery_started_at` separates a safe stale pre-provider claim from an uncertain provider side
effect. A stale pre-provider claim may be reclaimed. A stale post-provider claim becomes
`outcome_pending` and is never automatically redelivered. An administrator can explicitly requeue
`outcome_pending`, `failed` or `partial` rows after reconciliation.

Authenticated queue and attempt access is protected by `is_management_for_tenant(tenant_id)`.
The disposable PostgreSQL proof is `pnpm fieldgrid:test:notification-worker-runtime`.
