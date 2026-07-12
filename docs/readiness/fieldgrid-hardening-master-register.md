# Fieldgrid Hardening Master Register

Status: documentation/evidence only. Every canonical item is `open`.

## Evidence Rule

No item is considered fixed by static source evidence alone. Closure requires the acceptance tests listed in the JSON register at the appropriate evidence layer: database integration, authenticated RLS, service-role/database invariant, API/server-action runtime, browser/Playwright E2E, provider mock, or live staging evidence when explicitly approved.

## Source Consolidation

| Source PR | Source findings | Canonical items touched | Main dependency |
| --- | ---: | ---: | --- |
| #279 | 29 | 18 | cross-surface tenant and workflow boundaries |
| #281 | 16 | 4 | auth provider boundary decision |
| #282 | 22 | 9 | platform auth, lifecycle, support and notification controls |
| #283 | 11 | 8 | customer portal identity, module and payment contracts |
| #285 | 27 | 18 | backoffice tenant, workflow and reliability gaps |
| #287 | 15 | 10 | personnel identity, execution, offline and availability gaps |
| #288 | 26 | 4 | assignment P0 runtime reproduction follow-up |
| #290 | 23 | 2 | payment ledger and async worker architecture |
| #292 | 2 | 1 | team execution architecture dependency |

## Canonical Items

| Canonical ID | Severity | Title | Source PRs | Required runtime evidence |
| --- | --- | --- | --- | --- |
| FG-HARD-P0-SEC-001 | P0 security | Fieldgrid-owned auth challenge and recovery boundary | #279, #281, #282, #283 | API/server-action, browser E2E, provider mock |
| FG-HARD-P0-SEC-002 | P0 security | Host-bound identity, platform AAL and tenant profile resolution | #281, #282, #283, #287 | browser E2E, authenticated RLS, Storage, API runtime |
| FG-HARD-P0-SEC-003 | P0 security | Assignment and planning cross-tenant IDOR closure | #279, #285, #288 | API runtime, DB integration, authenticated RLS |
| FG-HARD-P0-SEC-004 | P0 security | Assignment status transition bypass removal | #279, #285, #288 | API runtime, browser E2E, DB integration |
| FG-HARD-P0-SEC-005 | P0 security | Tenant-bound document and media signed URL enforcement | #279, #283, #285, #287 | Storage, API runtime, authenticated RLS |
| FG-HARD-P0-SEC-006 | P0 security | Support, sensitive access and audit isolation | #279, #282, #285 | DB integration, authenticated RLS, API runtime |
| FG-HARD-P0-DATA-001 | P0 data/finance | Payment intent, webhook inbox and ledger integrity | #279, #283, #290 | DB concurrency, API runtime, provider mock |
| FG-HARD-P0-DATA-002 | P0 data/finance | Report approval, proposal and invoice atomicity | #279, #285, #287 | DB integration, API runtime, browser E2E |
| FG-HARD-P1-PROD-001 | P1 product contract | Tenant entitlement, RBAC, module and sector enforcement | #279, #282, #283, #285 | API runtime, DB integration, browser E2E |
| FG-HARD-P1-PROD-002 | P1 product contract | Team assignment execution participant model | #285, #287, #292 | DB migration, authenticated RLS, browser/offline E2E |
| FG-HARD-P1-PROD-003 | P1 product contract | Interest selection, scheduling and capacity candidate contract | #285, #287, #288 | API runtime, DB integration, browser E2E |
| FG-HARD-P1-PROD-004 | P1 product contract | Tenant lifecycle, provisioning, domain and offboarding contract | #279, #282 | DB integration, API runtime, browser E2E |
| FG-HARD-P1-PROD-005 | P1 product contract | Customer visible workflow and quote/invoice contracts | #279, #283 | API runtime, browser E2E, DB integration |
| FG-HARD-P1-PROD-006 | P1 product contract | Tenant-scoped reference integrity for customer, object, personnel and qualification links | #279, #283, #285 | DB integration, API runtime |
| FG-HARD-P1-REL-001 | P1 reliability | Domain events, recipients, preferences and transactional outbox | #279, #282, #283, #285, #287 | DB integration, worker runtime, provider mock |
| FG-HARD-P1-REL-002 | P1 reliability | Async worker tenant lifecycle, retry, DLQ and provider idempotency | #279, #290 | DB integration, provider mock, worker runtime |
| FG-HARD-P1-REL-003 | P1 reliability | Zero-row, stale-row and tenant settings mutation integrity | #279, #282, #285, #287 | DB integration, API runtime, provider mock |
| FG-HARD-P1-REL-004 | P1 reliability | Availability, leave and schedule replacement atomicity | #285, #287 | DB integration, API runtime |
| FG-HARD-P1-REL-005 | P1 reliability | Personnel offline queue scope and idempotent replay | #279, #287, #292 | browser E2E, DB integration, API runtime |
| FG-HARD-P1-REL-006 | P1 reliability | Upload-first media and document orphan cleanup | #285, #287 | Storage runtime, DB integration, API runtime |
| FG-HARD-P2-001 | P2 hardening | Route, map and realtime side-effect observability | #285 | browser E2E, DB integration |
| FG-HARD-P2-002 | P2 hardening | Personnel invite feedback and retry semantics | #285 | API runtime, browser E2E, provider mock |
| FG-HARD-P2-003 | P2 hardening | Runtime evidence program and release-gate classification | #279, #282, #283, #285, #287, #288, #290, #292 | all required non-static layers |

## Auth Decision

Fieldgrid owns invite, recovery, challenge, e-mail, tenant, host, audit and rate-limit policy. There are no magic links and no mailed or temporary password before proof. Supabase may temporarily remain only the credential/session backend. Full auth replacement is a separate program, not an incremental hardening item.

## Candidate Implementations

PRs #278, #284, #286, #289 and #291 are candidate implementations only. They are not counted as solutions in this register until the canonical acceptance tests pass at the required runtime layer.
