# Platform support team authorization review — 2026-10-09

Bounded source/resource review for the support-team release and its work-order
UI additions. This is not a claim that every unchanged authorization function
was individually exercised. Existing inventory entries retain their evidence;
only changed fingerprints receive this review.

## Platform governance and identity

`20261009190000_platform_support_team.sql` adds four private registry, receipt,
invitation and audit tables. All force RLS; public, anon, authenticated and
service_role have no direct table privileges. Authenticated governance RPCs
require an existing platform_admin and a live Auth account/session. Mutations
also require an actual OTP AMR record and an Auth-maintained session age of at
most fifteen minutes. JWT refresh and a new password session do not qualify.

Team commands reject self/platform-admin targets, bind actor/request UUID to
the exact payload, enforce member revisions and validate selected active
ticket tenants. Four fixed support grants are materialized without tenant
membership or platform_admin promotion. Existing independently granted
support accounts cannot be silently converted into this fixed role.

`platform_workspace_access` permits the base-host platform login for current
explicit support/notification grants, including existing valid category and
assigned-only scopes. It returns only a boolean, never ticket content. Tenant
hosts retain their existing hostname identity and fail closed. The platform
landing page and default base-host app redirect lead support operators to the
supportdesk; `/platform/team` remains platform-admin-only.
The platform layout checks this live boolean before content RPCs, so revoked
support sessions receive a closed 404 boundary rather than a content-query
error. Database failures are not converted into authorized access.

The server action checks governance before the service-role Auth account
preparation and again when binding the exact account. Existing Auth accounts
are not reset. Rendering precedes a single atomic provider claim bound to the
recipient, member revision and initiating administrator. A revoked profile,
old receipt or second claim cannot send the invitation. Uncertain provider
outcomes remain visible without automatic resend.

Evidence: `scripts/test-platform-support-team.mjs`,
`lib/auth/login-access.test.ts`, `lib/platform/team-actions.test.ts`,
`lib/platform/team-invitation.test.ts`, `tests/e2e/platform-team.spec.ts`.
The layout boundary is also covered by `app/platform/layout.test.ts`.

## Ticket audiences and scoped operators

The changed `private.ticket_has_cap` keeps all pre-existing tenant management,
HR, category, assignment and record restrictions and adds a deny tombstone for
revoked support profiles. The changed `private.ticket_dto` adds active operator
display names only in the platform assignment/handler projection; tenant/staff
views retain their prior generic operator labels and audience projection.

Staff and customer chains explicitly share reviewed content into a separate
support conversation. Original source IDs, reporter identity, tenant notes
and private platform notes remain excluded from the other audience. Sending a
platform reply back to the original reporter remains an explicit tenant action.
An assignment is not a grant and cannot expand an operator's tenant scope.
Tests exercise revoked profiles with manually re-enabled leftover grants,
stale receipts, stale revisions and retained sessions.

Evidence: `scripts/test-platform-support-team.mjs`,
`scripts/test-customer-tickets.mjs`, `scripts/test-tickets.mjs`,
`tests/e2e/tickets.spec.ts`. The complete database suite passes 483 checks;
real Auth/Data API/Storage privacy checks pass ten checks with actual ClamAV.

## Work-order entry points and release artifacts

New release entry points call the existing authenticated, versioned
`mutate_work_order` publication command. No service-role write, new work-order
RPC, scheduling bypass or financial projection is introduced. UI eligibility
checks the existing role and managed work-order/function capabilities;
publication still validates real tasks, stored date, active crew, current
session, module, membership and version in the database. The same immutable
request key is retained after an uncertain response. Popover events cannot
start a board drag while selecting a menu action. Joined travel changes only
geometry/styles and preserves calculated minutes and shortage.

Evidence: `tests/e2e/work-order-release.spec.ts`, `tests/e2e/travel.spec.ts`,
`scripts/test-work-orders.mjs`, `scripts/test-work-order-rpc-guards.mjs`,
`scripts/test-live-planning.mjs`, `scripts/test-management-roles.mjs`.

The package test command includes the new rollback-only database fixture.
The manifest records one newly clean-replayed migration and preserves all
134 prior statement hashes. Deployment/provider configuration and workflows
are unchanged. CI remains the complete release gate; hosted acceptance must
verify the exact promoted SHA separately.
