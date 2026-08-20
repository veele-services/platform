# Google Maps distributed rate limiting

Every server-side Google Maps call consumes an atomic PostgreSQL bucket keyed by tenant, actor,
action and fixed time window. The shared service covers Places autocomplete, place details, route
requests and usage events. Customer, personnel and backoffice packages contain only thin wrappers;
there is no process-memory limiter or unlimited fallback.

The database increments with `INSERT ... ON CONFLICT ... DO UPDATE`, caps the stored counter at
`limit + 1`, and cleans at most 100 expired buckets per request. This keeps limits consistent across
restarts, Node workers and replicas without an unbounded cleanup query. Browser roles have no
table privileges.

If the rate-limit database operation is uncertain, the provider call fails closed with
`service_unavailable` and the routes return a temporary-unavailable response. Usage logging remains
best effort and cannot turn a denied request into an allowed provider call.

Autocomplete session dedupe is durable because it affects cost analytics. Only a SHA-256 session
hash is stored. It is explicitly not the security boundary; on dedupe-store failure the analytics
event is suppressed while the independently successful rate-limit decision remains authoritative.

The disposable PostgreSQL proof is `pnpm fieldgrid:test:google-maps-rate-limit-runtime`.
That proof launches two independent Node processes, each with its own database pool, against the
same bucket to verify that a second application replica does not receive a free allowance.
