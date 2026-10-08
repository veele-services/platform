# Management and workspace authorization verification — 2026-10-09

This records the source/resource review and executed local regressions for the
management/workspace release. It is a bounded review of changed authorization
boundaries, not a claim that every function was individually exercised or that
local tests establish production acceptance. CI and exact-SHA deployments remain
separate release gates.

The final clean-replay capture differs from the preceding inventory at 294 IDs:
122 database tables, 142 functions, 25 code entrypoints and five operational
entrypoints. The 816 unchanged review entries retain their previous evidence
and matching fingerprints. Changed entries reference the specific source and
module tests documented below; shared gate tests apply to their generated policy
and RPC families.

## Management governance

The authoritative implementation is
`supabase/migrations/20261008173000_tenant_management_roles.sql`, with semantics
documented in `docs/architecture/tenant-management.md`. Five stable tenant
profiles store explicit capabilities; future catalogue additions do not
automatically grant existing profiles new powers. Existing owners are seeded;
other legacy actors change only through explicit profile assignment.

Private profile, member, receipt and transfer tables have tenant-bound foreign
keys, forced RLS and no direct authenticated/service-role table access.
Authenticated management RPCs verify an active tenant, active membership,
current Auth account and actual session. Governance requires an owner profile
and an Auth-maintained session no older than fifteen minutes with an `otp`
AMR record. A refreshed JWT or fresh password session does not satisfy this.
Expected revisions reject absent/null values. Command receipts bind tenant,
actor, request UUID and payload; replays cannot revive revoked authority.

Only the selected previously active target can accept ownership from a recent
OTP session. Acceptance changes both profiles atomically, preserves the
source's compatible management roles and independent staff relation, and
expires pending transfers after 48 hours. The last active owner cannot be
removed through ordinary membership mutation. A parent tenant deletion remains
possible for the platform. Historical revoked profile records remain deny
records rather than reactivating the legacy enum/direct-grant path.

Evidence: `scripts/test-management-roles.mjs`,
`lib/management/model.test.ts`, `lib/management/invitation-actions.test.ts`,
`tests/e2e/management-roles.spec.ts`.

## Restrictive tables and sensitive projections

`private.management_table_allowed` adds module read/write restrictions to
existing tenant RLS rather than replacing the original record, service or
tenant scopes. Own-membership SELECT remains available for authentication
context. Direct managed membership mutations cannot mint an unmanaged manager
or owner. The authenticated personnel binder accepts only a tenant, recipient
Auth identity and exact current email; it appends only `staff` and preserves
existing management profiles and tombstones.

Compatibility enums must not expose HR, financial or security data. Sensitive
personnel access uses a distinct capability; Planning's ordinary personnel
read does not include home/private departure addresses or HR documents. Raw
work-order/task/revision/report financial rows remain restricted; operational
RPCs and dossier inputs use price-free projections. Mutation replies use the
same financial restriction as reads, including dispatch, reschedule, transition
and report review. Report snapshots redact task/material prices and expenses
for backoffice actors without finance access. A concrete delivery owner sees
the exact signed report evidence through the bounded staff path.

Object security documents/vault operations require explicit secret rights.
Customer/object/personnel dossier registry rows inherit source RLS; the registry
does not impose an unrelated HR capability on a customer document. Existing
staff access to an own employee-visible document remains bounded to that file.
Storage helpers enforce the same sensitive capabilities, scanned-file contract
and concrete own upload/read scopes. Service-only object-vault and travel RPCs
verify the supplied live actor/session and capabilities rather than treating
service-role execution or an additional OTP as authorization.

Evidence: `scripts/test-management-roles.mjs`,
`scripts/test-management-mutation-replies.mjs`,
`scripts/test-personnel-privacy.mjs`, `scripts/test-object360.mjs`,
`scripts/test-travel.mjs`, `scripts/test-work-order-reports.mjs`,
`scripts/test-release-storage-http.mjs`,
`supabase/tests/database/customer_dossier.sql`,
`supabase/tests/database/personnel_dossier.sql`.

## Module functions and record operations

`docs/architecture/management-rpc-permissions.json` records the module/action
requirements for mapped public functions; the migration is the executable
authority. A function requires both its module permission and concrete function
key, in addition to the original session, record, version and service checks.
Mixed read/write functions use write checks for mutation paths. In particular,
bookings, cancellation, communication, next visits, document metadata, checklist
answers and task execution cannot mutate through a read permission.

Direct record CRUD shares the module write boundary with equivalent Data API
operations. This does not imply a separately gated business action can be
performed through a read-only or merely service-role path. Safe operational
work-order rows and tasks keep Planning/followup usable without finance access.

Evidence by module: `scripts/test-work-orders.mjs`,
`scripts/test-work-order-rpc-guards.mjs`, `scripts/test-work-order-lineage.mjs`,
`scripts/test-planboard.mjs`, `scripts/test-live-planning.mjs`,
`scripts/test-commercial.mjs`, `scripts/test-customer360.mjs`,
`scripts/test-task-catalogue.mjs`, `scripts/test-personnel-numbering.mjs`,
`scripts/test-management-followup.mjs`, `scripts/test-dossier-alignment.mjs`,
`scripts/test-payment-security.mjs`.

## Independent staff and customer relationships

A managed or revoked-management actor may still be a genuine staff member or
bound customer. There is no blanket exemption from management restrictions for
an account carrying `staff`. Each mixed function instead tests the actual own
personnel identity, current assignment, dispatch, report entry, signature
intent, visit request or customer-account binding. This retains scoped report,
task, travel, document and upload access without restoring broad backoffice
powers. Other-person travel, forged report paths and denied planboard operations
remain rejected.

An own staff notification inbox additionally requires an existing enabled grant
with matching tenant/personnel scope. Revoking the independent management
profile does not suppress this own inbox, while backoffice inbox access remains
denied. Explicit grant disabling still closes the staff inbox; staff identity
does not override a grant tombstone or unrelated scope.

Evidence: the populated hybrid child in `scripts/test-management-roles.mjs`,
`scripts/test-customer-portal.mjs`, `scripts/test-customer-tickets.mjs`,
`scripts/test-work-order-reports.mjs`, `scripts/test-travel.mjs`,
`supabase/tests/database/staff_direct_rpc_guards.sql`,
`supabase/tests/database/staff_report_upload_finalize.sql`.

## Tickets, notifications and platform scope

Managed ticket/notification capabilities come from the live profile and remain
bounded by existing scoped grants and disabled grants. A broad owner profile
does not replace an exact delegated HR-ticket record scope. Demotion cannot
retain governance through an old direct delegation grant. Platform support
operator defaults remain separate from tenant administration and tenant
management profiles.

Ticket indexes now retain a safe scoped landing for configuration-only actors;
they do not redirect every support actor to settings. Shared platform layout
keeps tickets and notifications inside the platform shell, rejects tenant hosts
and does not turn shell visibility into platform administrative authority.
The cockpit reports stored configuration counts rather than provider/runtime
health it has not measured.

Evidence: `scripts/test-tickets.mjs`, `scripts/test-notification-permissions.mjs`,
`scripts/test-notification-boundaries.mjs`, `scripts/test-notifications.mjs`,
`scripts/test-platform-security.mjs`, `app/platform/layout.test.ts`,
`lib/platform/cockpit.test.ts`, `tests/e2e/tickets.spec.ts`,
`tests/e2e/notifications.spec.ts`, `tests/e2e/fieldgrid.spec.ts`.

## Live route, search and provider boundaries

`getAuthContext` reads the current profile. Page loaders enforce their own
module access because a reused Next layout does not rerun on every client
navigation. The proxy overwrites internal tenant/path headers; a client-supplied
header cannot select another tenant or route authority. Workspace loading skips
unavailable module/function RPCs rather than obtaining their data through a
service client. Search uses fixed categories, current module/function rights,
authenticated RLS and another actor/tenant/permission check after reads.

Management account preparation follows the fresh authenticated owner check.
After branding/logo/snapshot I/O, `management_invitation_access` proves the same
owner, command receipt, exact recipient identity/email and nonrevoked target
profile immediately before the provider. An active staff-only membership cannot
substitute for the management invitation. Existing Auth accounts are not reset.

Invoice sending, payment bundles, personnel invitations/repeat invitations and
commercial send/upload/retry actions have explicit service function keys. They
recheck live initiating actor, tenant and action rights after preparatory I/O
before issuing an external token, enqueuing an authorized retry or invoking the
provider. Personnel invitations also recheck the exact active staff recipient
and current email. Unknown provider outcomes retain uncertainty and do not
automatically cause a duplicate invitation.

Evidence: `lib/management/invitation-actions.test.ts`,
`lib/management/invitation-delivery.test.ts`,
`lib/personnel/invitation-action.test.ts`,
`lib/personnel/invitation-access.test.ts`,
`lib/personnel/invitation-delivery.test.ts`,
`lib/finance/service-permissions.test.ts`,
`lib/commercial/delivery-authorization.test.ts`, `lib/commercial/mail.test.ts`,
`app/api/search/route.test.ts`, `lib/search/model.test.ts`,
`lib/tenancy/proxy-boundary.test.ts`, `tests/e2e/management-roles.spec.ts`.

## Verified domains and customer module configuration

The platform controls customer-portal module activation and custom workspace
domain lifecycle. Workspace domains are environment-specific and inaccessible
to ordinary authenticated clients. Registration normalizes a supported public
host; verification/activation requires exact TXT ownership and canonical tenant
CNAME, an active tenant, a live platform actor and revision/token identity after
DNS I/O. Unknown, pending, removed, inactive or wrong-environment hosts fail
closed. The resolver provides no tenant fallback. Management invitation URLs
use only a verified active same-environment app domain, otherwise the canonical
tenant host. Registering a domain does not itself mutate DNS or Caddy.

Evidence: `scripts/test-workspace-domains.mjs`,
`scripts/test-module-security.mjs`,
`lib/platform/workspace-domain-actions.test.ts`,
`lib/tenancy/workspace-domain.test.ts`,
`lib/tenancy/proxy-boundary.test.ts`,
`supabase/migrations/20261008174000_workspace_domains_customer_portal.sql`.

## Issues found and corrected during review

- Own-membership RLS and branding reads initially required administrative
  permissions; self authentication/shell reads now retain their bounded path.
- Legacy compatibility enums initially reopened mixed RPC, service-mediated
  vault/travel, raw financial-row and HR-storage paths. Live capability checks,
  safe operational projections and separate sensitive permissions now bound
  those paths, including mutation replies and report material prices.
- Nullable revision/payload checks, inactive-tenant checks and direct membership
  mutation escapes were corrected. Ownership acceptance preserves former-owner
  compatibility roles; direct writes cannot mint another owner.
- Broad profile rights initially superseded exact ticket/notification grants.
  Scoped grants and disabled records now additionally constrain profile rights;
  independent own-staff inbox access retains its own scoped grant boundary.
- Hybrid staff/customer calls initially lost legitimate concrete access after
  profile revocation. Narrow assignment/intent/file/customer bindings replace
  broad enum or blanket-staff fallbacks.
- Service actions initially relied on a prior read, provider privilege or an
  entry-only check. Explicit action keys and live checks after asynchronous I/O
  now bound delivery, uploads, external tokens and invitation account binding.
- The workspace-domain table lacked FORCE RLS in the first draft; the domain
  migration now forces RLS and grants neither public read nor direct mutation.

These descriptions record implementation corrections, not a replacement for
the final source-bound ledger or regression results.

## Evidence state and final ledger procedure

On the final chronological replay, all 134 migration statement hashes match.
The 131 existing hashes remain unchanged and only the three new migrations were
added to the manifest. All 398 pgTAP assertions and all 467 functional database
checks passed. The unit suite passed all 1,768 tests; lint and TypeScript passed.
Ten real Auth/Data API/Storage/Realtime checks passed. Database lint has no
errors and the security advisor reports no warnings or errors. The independent
source review found no outstanding concrete P1/P2 finding.

The real browser management flow passed mail invitation, OTP login, live role
revocation/restoration, finance access, accepted ownership transfer, former-owner
access and platform denial. The focused layout, platform and address flows
passed. The complete 121-case browser regression is covered: the initial run
passed 117 cases, and four affected cases then passed in a serial rerun after
fixing two test readiness conditions, removing a fixture cleanup contention and
reviewing the palette baselines. Platform baselines were visually reviewed on
desktop and mobile. The clean GitHub browser run also passed all 121 cases. Its final provider
branding check produced a false positive on the management invitation command.
The corrected guard detects SDK imports, dependencies, configuration and
provider hosts while allowing the invitation verb; all 21 focused guard tests
pass, and an independent source review found no blocking issue. No database or
migration behavior changed. The separate product-branding guard also found two
unit fixtures using a real tenant name; those now use a fictitious tenant. Both
complete guards pass locally and run before the expensive CI integration steps.
Exact-head GitHub CI remains a promotion gate.

The evidence map groups each changed surface with its source and relevant tests.
The final ledger preserves unchanged entries only when their fingerprints match;
changed entries record controlled or corrected-and-rechecked status after source
review and the applicable regressions. Any later source, policy or grant change
invalidates the corresponding review. Capturing metadata alone is not approval.

`operation:package.json` adds these regression scripts to the normal database
test command. It does not introduce a staging isolation exemption, a new
production branch or provider credentials. Promotion and exact-SHA health
acceptance remain governed by the existing environment runbooks. This review
does not authorize skipping those checks.
