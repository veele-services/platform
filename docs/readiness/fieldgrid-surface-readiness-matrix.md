# Fieldgrid surface readiness matrix

Date: 2026-07-12
Scope: source-level functional readiness map for the four Fieldgrid surfaces and the cross-surface handoffs between them.

## Status counts

| Surface | Proven | Partially connected | Disconnected | Unsafe | Unproven | Main release risk |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| Platform administration | 3 | 7 | 0 | 3 | 2 | Ticket relationship integrity, lifecycle/domain/sector edge cases, notification delivery proof |
| Tenant backoffice | 8 | 8 | 0 | 4 | 0 | Cross-tenant planning actions, non-transactional report/invoice handoffs |
| Personnel PWA | 2 | 8 | 1 | 3 | 2 | Host drift, report submission event gap, offline durability |
| Customer PWA | 5 | 5 | 0 | 4 | 0 | Expired quote decisions, draft invoice exposure, payment atomicity, synthetic notifications |
| Cross-surface | 2 | 5 | 1 | 4 | 0 | Event/outbox parity and financial state consistency |

## Platform administration

| ID | Flow | Readiness | Current tests | Missing tests | Severity | Owner/dependency |
| --- | --- | --- | --- | --- | --- | --- |
| FG-SURFACE-PLATFORM-001 | Platform owner login and password recovery | partially connected | Platform route/auth and password tests | Platform-role-scoped recovery test | medium | Auth/platform |
| FG-SURFACE-PLATFORM-002 | Create/provision tenant and first owner invite | proven | Provisioning/onboarding tests | Runtime rollback and auth side-effect compensation | medium | Provisioning/auth |
| FG-SURFACE-PLATFORM-003 | Tenant domain and slug | partially connected | Custom domain tests | Primary/last-domain remove guards; runtime DNS-independent tests | medium | Tenant domains |
| FG-SURFACE-PLATFORM-004 | Sector configuration | unsafe | Sector policy tests | Platform disable blocks task-code usage | medium | Sectors/task codes |
| FG-SURFACE-PLATFORM-005 | Module entitlements and subscriptions | partially connected | Module/plan/subscription tests | Runtime entitlement effect and stale past_due sibling tests | low-medium | Billing/platform |
| FG-SURFACE-PLATFORM-006 | Suspend/reactivate/archive tenant | unsafe | Lifecycle tests | Direct-action archived reactivation denial | medium | Tenant lifecycle |
| FG-SURFACE-PLATFORM-007 | Support grants | proven | Platform security/support tests | Runtime expiry smoke | low | Support/security |
| FG-SURFACE-PLATFORM-008 | Email provider and tenant transport | partially connected | Email service/template tests | Invite/reset tenant attribution and provider selection | medium | Email/auth |
| FG-SURFACE-PLATFORM-009 | Tickets | unsafe | Platform ticketing source tests | Child-entity tenant ownership tests | high | Support/ticketing |
| FG-SURFACE-PLATFORM-010 | Notifications | unproven delivery | Platform notification source tests | Dispatcher/worker consumption proof | medium | Notifications |
| FG-SURFACE-PLATFORM-011 | Knowledge base, roadmap, releases | partially connected | KB/roadmap/release acceptance tests | Worker delivery and recipient runtime proof | low-medium | Content/notifications |

## Tenant backoffice

| ID | Flow | Readiness | Current tests | Missing tests | Severity | Owner/dependency |
| --- | --- | --- | --- | --- | --- | --- |
| FG-SURFACE-BACKOFFICE-001 | Activation/login and tenant dashboard context | proven | Auth, tenant permission tests | Runtime role matrix browser proof | medium | Auth/RBAC |
| FG-SURFACE-BACKOFFICE-002 | Onboarding and organization settings | proven | First-run/settings tests | Runtime first-run smoke | low | Tenant settings |
| FG-SURFACE-BACKOFFICE-003 | Roles, permissions, users | proven | Tenant permission/cross-tenant tests | Invite activation browser proof | medium | RBAC/users |
| FG-SURFACE-BACKOFFICE-004 | Customers, contacts, customer types | proven | Tenant isolation tests | Full customer lifecycle integration | low | Customer data |
| FG-SURFACE-BACKOFFICE-005 | Objects, addresses, contacts, requirements | proven | Object/customer tests | Requirement downstream tests | low | Object data |
| FG-SURFACE-BACKOFFICE-006 | Personnel, qualifications, availability | partially connected | Personnel access tests | End-to-end availability to planning proof | medium | Personnel/planning |
| FG-SURFACE-BACKOFFICE-007 | Task codes, prices, invoiceability | partially connected | Task-code pricing tests | Tenant-scoped use in extra work/invoice proposal | high | Pricing/finance |
| FG-SURFACE-BACKOFFICE-008 | Request intake to review | proven | Customer request source tests | Transactional audit/event test | medium | Assignments |
| FG-SURFACE-BACKOFFICE-009 | Quote approval/plannable workflow | unsafe | Quote scope/visibility tests | Expired quote denial server-side | high | Quotes/workflow |
| FG-SURFACE-BACKOFFICE-010 | Interest polling/planning | unsafe | No focused unsafe-action tests | Cross-tenant server action regression tests | high | Planning |
| FG-SURFACE-BACKOFFICE-011 | Selection and confirmed staffing | partially connected | Candidate integrity tests | Selected/reserve to assigned work-order test | medium | Planning/personnel |
| FG-SURFACE-BACKOFFICE-012 | Plan board visibility | partially connected | Planning/live-day tests | Cross-app revalidation proof | medium | Planning |
| FG-SURFACE-BACKOFFICE-013 | Execution monitoring | partially connected | Personnel workbench tests | Runtime backoffice observation test | medium | Operations |
| FG-SURFACE-BACKOFFICE-014 | Report review/approval | unsafe | Report tenant tests | Proposal failure must not notify customer | high | Reports/finance |
| FG-SURFACE-BACKOFFICE-015 | Invoice finalization/payment/closure | partially connected | Invoice/payment tenant tests | Webhook/manual parity and transaction tests | high | Finance/payments |
| FG-SURFACE-BACKOFFICE-016 | Documents/materials/inventory/tickets/notifications | partially connected | Storage/material/notification tests | Feature-module direct action tests | medium | Operations/support |

## Personnel PWA

| ID | Flow | Readiness | Current tests | Missing tests | Severity | Owner/dependency |
| --- | --- | --- | --- | --- | --- | --- |
| FG-SURFACE-PERSONNEL-001 | Invite activation and login | partially connected | Auth/password tests | Actual personnel invite activation route proof | medium | Auth/personnel |
| FG-SURFACE-PERSONNEL-002 | Password recovery | partially connected | Auth/password tests | Rate-limit/audit runtime proof | medium | Auth |
| FG-SURFACE-PERSONNEL-003 | Tenant/host identity | unsafe | Host/cookie tests | Wrong-host denial for every mutation family | high | PWA auth |
| FG-SURFACE-PERSONNEL-004 | Profile and qualifications | unproven | Personnel shell tests | Route-to-DB-to-backoffice proof | medium | Personnel profile |
| FG-SURFACE-PERSONNEL-005 | Availability and leave | unproven | Personnel shell tests | Availability/leave lifecycle proof | medium | Personnel planning |
| FG-SURFACE-PERSONNEL-006 | Interest invitation and responses | partially connected | Open assignment tests | Viewed-on-detail policy test | medium | Planning/PWA |
| FG-SURFACE-PERSONNEL-007 | Planner selection | partially connected | Candidate integrity tests | Selected/reserve to assigned conversion proof | medium | Planning |
| FG-SURFACE-PERSONNEL-008 | Assignment visibility/work order | proven | Assignment visibility tests | Browser runtime proof | medium | Field execution |
| FG-SURFACE-PERSONNEL-009 | Seen/en-route/start/task completion | partially connected | Workbench tests | Auto-seen policy and signature size tests | medium | Field execution |
| FG-SURFACE-PERSONNEL-010 | Photos/materials/extra work | unsafe | Material/offline tests | Tenant-scoped task-code and host-drift tests | high | Field execution/pricing |
| FG-SURFACE-PERSONNEL-011 | Report submission | disconnected/unsafe | No focused event test | Transactional report submit and outbox test | high | Reporting/notifications |
| FG-SURFACE-PERSONNEL-012 | Offline queue and replay | partially connected | Offline source tests | Browser close/reopen and idempotency tests | medium | PWA offline |
| FG-SURFACE-PERSONNEL-013 | Notifications and tickets | partially connected | Notification content tests | Management recipient delivery tests | medium | Notifications/support |

## Customer PWA

| ID | Flow | Readiness | Current tests | Missing tests | Severity | Owner/dependency |
| --- | --- | --- | --- | --- | --- | --- |
| FG-SURFACE-CUSTOMER-001 | Invite activation and login | proven | Host binding/invite tests | Browser activation proof | medium | Auth/customer |
| FG-SURFACE-CUSTOMER-002 | Password recovery | partially connected | Password policy tests | Customer DB/event audit proof | low | Auth |
| FG-SURFACE-CUSTOMER-003 | Tenant/host identity | proven | Host binding tests | Runtime wrong-host proof | medium | Portal auth |
| FG-SURFACE-CUSTOMER-004 | Objects and contacts | partially connected/unsafe | Object tests | Server-side review-policy tests | medium | Customer objects |
| FG-SURFACE-CUSTOMER-005 | Request assignment/status timeline | proven/partially connected | Customer request tests | Transactional audit/event and timeline proof | medium | Assignments |
| FG-SURFACE-CUSTOMER-006 | Quote view/approve/reject | unsafe | Quote visibility tests | Expired quote server/UI denial | high | Quotes |
| FG-SURFACE-CUSTOMER-007 | Scheduled assignment visibility | proven | Assignment tests | Browser proof | low | Assignments |
| FG-SURFACE-CUSTOMER-008 | Approved photos/reports | proven | Photo/report tests | End-to-end report approval proof | medium | Reports |
| FG-SURFACE-CUSTOMER-009 | Invoices/PDFs | unsafe | Invoice PDF audit tests | Assignment detail draft invoice denial | high | Finance/customer PWA |
| FG-SURFACE-CUSTOMER-010 | Payment initiation/result | unsafe | Payment tenant-scope tests | Mollie-created/local-persist failure and webhook result proof | high | Payments |
| FG-SURFACE-CUSTOMER-011 | Tickets/notifications/profile settings | partially connected | Notification content tests | Synthetic notification read/delete reconciliation | medium | Notifications/support |

## Cross-surface handoff matrix

| ID | Handoff | Producer | Canonical entity | Consumers | Readiness | Gap |
| --- | --- | --- | --- | --- | --- | --- |
| FG-SURFACE-CROSS-001 | Customer request to backoffice review | Customer PWA | `assignments.status=requested` | Backoffice assignments, customer timeline | proven | Transactional audit/event still missing |
| FG-SURFACE-CROSS-002 | Quote sent/approved to planning | Backoffice/customer | `quotes`, `assignments.status` | Customer quotes, backoffice planning | unsafe | Expired sent quotes can still be decided |
| FG-SURFACE-CROSS-003 | Interest poll to personnel response | Backoffice/personnel | `assignment_interest_rounds/responses`, optional `assignment_personnel.suggested` | Personnel open assignments, planning | unsafe | Cross-tenant mutation in poll/reminder/reschedule/reshift |
| FG-SURFACE-CROSS-004 | Confirmed staffing to work order | Backoffice/personnel | `assignment_personnel.status=assigned` | Personnel work order | partially connected | Selected/reserve conversion unproven |
| FG-SURFACE-CROSS-005 | Field execution to backoffice/customer monitoring | Personnel PWA | `assignments.status` and work-order rows | Backoffice execution, customer status | partially connected | Notification/revalidation parity incomplete |
| FG-SURFACE-CROSS-006 | Report submission to report review | Personnel PWA | `reports.status=submitted`, assignment `report_submitted` | Backoffice reports/notifications | disconnected | No workflow event/outbox and non-transactional |
| FG-SURFACE-CROSS-007 | Report approval to customer report and finance proposal | Backoffice | `reports.status=approved`, draft invoice/proposal | Customer reports, finance | unsafe | Customer can be notified while proposal creation failed |
| FG-SURFACE-CROSS-008 | Invoice sent/paid to customer finance and closure | Backoffice/API | `invoices`, `payments`, assignment statuses | Customer invoices/payments, backoffice finance | unsafe | Mollie webhook bypasses manual `invoice_paid` event parity |
| FG-SURFACE-CROSS-009 | Payment reminder to customer notification | API job | invoice reminder timestamp | Customer email/notifications | unsafe | Suspended tenant not rechecked; no durable event |
| FG-SURFACE-CROSS-010 | Platform content notification to portals | Platform admin | content rows, domain events | Customer/personnel/backoffice notification centers | partially connected | Sender/worker delivery proof missing |

## Required evidence before release claims

- Static: source-contract tests for every unsafe action listed in the gap register.
- Unit: pure status-transition and eligibility helpers for quote expiry, tenant lifecycle, domain removal, sector usage, task-code tenant scope, notification source keys, and payment settlement parity.
- Integration: local database-backed tests for tenant-scoped server actions and transaction boundaries. Not collected in this audit.
- Database integration: migration/schema constraints for ticket ownership, invoice/payment consistency, and task-code sector references. Not collected in this audit.
- RLS/storage runtime: portal document/photo storage guards with real policies. Not collected in this audit.
- API/action runtime: Next server action/API route invocation with attacker-controlled ids. Not collected in this audit.
- E2E/browser: full golden path from request to closed paid assignment across backoffice/personnel/customer. Not collected in this audit.
- Manual/live: DNS, SMTP/API mail provider, Mollie checkout/webhook, Supabase auth, and staging evidence. Explicitly out of scope for this task.
