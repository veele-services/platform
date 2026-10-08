# Dashboard consistency authorization review — 2026-10-08

This change consolidates presentation across the tenant, platform, staff and
customer workspaces. It does not introduce roles, database grants, schema
changes, provider credentials or deployment exemptions.

## New search endpoint

`app/api/search/route.ts` accepts JSON POST requests from the same origin. Its
strict input contains only a 3–100 character search string. Tenant, user, tables,
columns, module requirements and destination prefixes are never client-selected.
The tenant comes from `getAuthContext` and the validated hostname in deployed
environments. Staff-only accounts are rejected. Each category requires its
existing role and enabled module; all reads use the authenticated RLS client.

The fixed category definitions in `lib/search/model.ts` select only ID and
name/number/subject from `customers`, `objects`, `requests`, `quotes`, `personnel`
and `invoices`, with an explicit tenant filter and five results per category.
The structural inventory cannot infer these dynamic `.from(category.table)`
references; this review explicitly covers all six fixed table definitions.
Search values are quoted as PostgREST literals and SQL wildcard characters are
escaped. Work orders use the existing `work_order_list` operational projection,
so planners never require direct access to financial base rows. Its richer
projection remains a possible optimization for large matching datasets.

Both session validity and authenticated user/tenant/module access are checked
again after reads. Responses are private and no-store. AbortSignal cancels
superseded database requests; the browser additionally binds a response to its
actor and exact query. Result paths are fixed application prefixes with encoded
record IDs. Opening them still invokes the existing destination authorization.

Evidence: `app/api/search/route.test.ts`, `lib/search/model.test.ts`,
`tests/e2e/dashboard-consistency.spec.ts`.

## Dossier and planning loading

`lib/dossiers/data.ts` extracts the existing validated UUID scope and authenticated
`dossier_chain` RPC. It is server-only and does not cache across users or requests.
Both callers derive the tenant from authenticated context. The followup page keeps
its existing role gate; the database still enforces row and dossier access.

Planning uses a shared initial-query definition to avoid a duplicate hydration
request. Changed dates/preferences and realtime reconciliation remain active.
The branded loading provider receives the existing public branding result; it
does not alter the account boundary or expose extra session data.

Evidence: `lib/dossiers/data.test.ts`, `app/app/opvolging/page.test.ts`,
`lib/planning/query.test.ts`, `tests/e2e/planboard.spec.ts`,
`scripts/test-dossier-alignment.mjs`.

## Branding, account and presentation

Browser logos now use the existing same-origin scanned-logo endpoint. File type,
size and scanned-storage checks remain intact. Exportable platform email previews
explicitly request the configured absolute APP_URL; no untrusted Host is used as
an email origin. CSP is not widened.

The optional current user's display name is read from the already authenticated
user metadata, truncated and rendered as React text. It is presentation only and
never determines authority. Platform data retains `requirePlatformAdmin` before
its administrative queries; the projection adds only the current user's name.

Notification route access, tab checks and object-detail checks remain in force.
The standalone header verifies that its authenticated identity matches the
notification access result. Inbox table links retain modified-click behavior,
request-fence handling and modal focus restoration. Account menus submit to the
existing signout route. Staff/customer tab and icon changes retain their existing
command callbacks, account scopes, confirmation flows and native download links.

Evidence: `lib/branding/logo-browser.test.ts`, `lib/branding/brand-component.test.ts`,
`tests/e2e/notifications.spec.ts`, `tests/e2e/staff-settings.spec.ts`,
`tests/e2e/staff-popups.spec.ts`, `tests/e2e/dashboard-consistency.spec.ts`.

The evidence references identify the regression checks for each reviewed path.
Deployment acceptance additionally requires the normal complete CI and the
staging-to-production promotion checks on the final exact Git revision.
