# Phase 2C RLS access matrix

`allow` means a direct authenticated database operation is intentionally permitted. `projection` means the customer uses a server-selected projection rather than the raw table. Service-role behavior is not used as evidence for user-role authorization.

| Surface | Tenant management | Assigned personnel | Customer | platform admin | anon / tenantless / deactivated |
|---|---|---|---|---|---|
| assignments, tasks, extra work | own tenant: management CRUD | assigned: SELECT; constrained inserts where defined | barrier-protected assignment projection; raw rows denied | application boundary only | denied |
| reports, notes, attachments | own tenant: management CRUD | own/assigned operations only; report SELECT is submitter-bound | approved `customer_approved` projection; raw rows denied | application boundary only | denied |
| photos and assignment storage | own tenant: management CRUD | assigned SELECT; internal unapproved INSERT; own-object UPDATE/DELETE | approved `customer_approved` signed projection; raw rows denied | application boundary only | denied |
| material usage / inventory usage | own tenant: management CRUD | assigned SELECT; pending non-financial own mutations | projection only | application boundary only | denied |
| availability windows / date entries | own tenant management | active own personnel | denied | application boundary only | denied after personnel deactivation |
| candidates, capacity, interest rounds/responses | own tenant management | own response policy only | denied | application boundary only | denied |
| portal realtime events | own tenant management recipient only | exact active personnel recipient only | exact active linked customer recipient only | no implicit bypass | denied; customer/personnel/tenant deactivation is immediate |
| audit log | tenant-scoped server projection; RLS is defense in depth | denied direct | denied direct | separate server boundary required for tenantless platform events | denied direct by ACL |
| staffing / participant / recovery RPCs | server-mediated | server-mediated | server-mediated | server-mediated | direct execute denied |

## Runtime actor assertions

- Tenant A management sees Tenant A workflow rows and not Tenant B.
- Tenant B management sees Tenant B workflow rows and not Tenant A.
- Tenant A/B personnel see only their active assignment relationship; wrong or malformed JWT `tenant_id` does not widen access.
- Tenant A/B customers cannot read raw workflow tables; while active they can read only their own limited assignment projection and exact safe realtime invalidation key.
- A global legacy Management user with no `tenant_users` row sees zero workflow and audit rows.
- Invited/email-only, deactivated customer, inactive personnel, suspended tenant, unauthenticated and malformed/tenantless sessions do not gain access.
- Customer/personnel metadata claims are not privilege inputs.

Evidence: `scripts/fieldgrid-runtime-safety-rls-harness.mjs`, `tests/fieldgrid-phase2c-security-reconciliation.test.mjs`, and `tests/fieldgrid-realtime-projection-migration.test.mjs`.
