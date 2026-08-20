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
exact queue IDs with a bounded review reason. `outcome_pending` additionally requires an explicit
confirmation that no provider delivery occurred. Mixed transient push results retain only the
failed internal target IDs for a targeted retry; already successful endpoints are not called again.
An SMTP, SendGrid or other provider error after delivery has started is classified in the same
fail-closed way unless the transport proves that no provider effect occurred. Provider message
headers and Message-IDs are correlation evidence, not assumed provider idempotency.

Customer e-mail and push preferences are rechecked immediately before delivery, with push failing
closed when no preference row exists. Management delivery binds both the active tenant membership
and the exact auth-user e-mail. Authenticated management access is tenant-bound read-only; all
queue and attempt writes are reserved for trusted server roles. Manual e-mail notifications enter
the pending queue before any provider call. After every terminal e-mail queue transition, the
worker recalculates the dispatch success and failure counters from the tenant-bound durable queue;
later retries and batches therefore cannot leave dispatch history permanently stale.

The disposable PostgreSQL proof is `pnpm fieldgrid:test:notification-worker-runtime`.
