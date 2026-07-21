# Fieldgrid website module — phased implementation plan

Date: 21 July 2026
Status: Phase 1A foundation implemented locally; later phases remain proposed

## Current implementation status

Phase 1A now includes the disabled-by-default `website` module entitlement, RBAC
resources, strict website-core contracts, Template 1 configuration, the
tenant-scoped foundation schema and an audited atomic delivery-mode transition.
It does not add public routing, a tenant authoring UI, a renderer, a deployment
or a live domain activation. Those remain gated by the later phases below.

## Goal and delivery contract

Fieldgrid will support two explicit website delivery modes per site:

- `managed_cms`: Fieldgrid stores, publishes and renders a controlled section-based website;
- `custom_nextjs`: Fieldgrid routes the site's verified public domains to an approved, independently deployed Next.js application.

Custom Next.js is an enterprise delivery mode, not a sixth template. A site can retain a ready managed publication and an approved custom deployment at the same time, but only one mode is active. Changing the active mode is a privileged, atomic and audited operation. There is no automatic fallback between modes.

## Non-negotiable implementation rules

- Reconcile the current `marketing/website` branch with exact current `origin/main` before product implementation.
- Use one writer and the repository's pull-request/exact-head CI process.
- Keep tenant scope on every website-owned row and enforce it in application code, constraints, RLS and tests.
- Do not expose authoring tables directly to anonymous traffic.
- Publish immutable, validated snapshots and render only the active snapshot.
- Treat a custom deployment target as platform-managed infrastructure; never proxy to an arbitrary tenant-entered URL.
- Keep custom website secrets out of tenant-editable records and client bundles.
- Fail closed on unknown hosts, stale revisions, unhealthy targets and tenant/site/domain mismatches.
- Make every migration additive and compatible with the previous application release.
- Activate no live domain and perform no deployment before the staging gates are satisfied.

## Phase 0 — discovery and architecture

Deliverables:

- the six `docs/website-module-*.md` documents;
- a repository, security, routing and deployment gap analysis;
- a reviewed decision on the public managed-site namespace and delivery-router ownership;
- explicit product decisions for form retention, lead conversion and custom-site operations.

Acceptance:

- stakeholders agree that `managed_cms` and `custom_nextjs` are separate delivery modes;
- infrastructure confirms the intended host namespace, TLS ownership and health contract;
- no code, schema, service or live route changes are included.

## Phase 1 — secure foundations

### Phase 1A — module, contracts and core schema

Deliverables:

- add the `website` tenant module entitlement;
- add website RBAC resources and default role grants;
- create a pure website-core workspace package with Zod contracts, section identifiers, template identifiers and publication schema versions;
- add tenant-scoped schema for sites, domain bindings, custom deployments, pages, sections, navigation and immutable publications;
- add Template 1 as configuration only;
- add timestamps, optimistic revisions, audit actors and lifecycle states;
- add an atomic delivery-mode transition service, but do not connect it to public routing or tenant UI.

Acceptance:

- migration-order, Drizzle schema and previous-release compatibility checks pass;
- PostgreSQL 17 migration rehearsal passes;
- tenant A cannot read or mutate tenant B website data;
- direct anonymous/authenticated PostgREST access is denied;
- invalid delivery combinations cannot be activated;
- `custom_nextjs` requires an approved, healthy deployment owned by the same tenant and site;
- no public request path changes.

Rollback:

- leave additive tables and permissions unused; disable the module entitlement;
- do not down-migrate production data.

### Phase 1B — domain and publication invariants

Deliverables:

- bind websites only to verified `tenant_domains` records through a website-specific domain table;
- enforce one primary public domain per site and one active target per delivery mode;
- implement publication creation, validation, activation and supersession transactions;
- add cache-key and delivery-revision contracts.

Acceptance:

- wrong-tenant and wrong-site foreign-key combinations fail;
- stale publication and delivery revisions fail closed;
- a draft edit cannot alter an active publication;
- domain reuse and operational-host ambiguity are rejected.

## Phase 2 — public managed runtime and routing spike

Deliverables:

- add a separate Next.js App Router runtime for managed websites;
- resolve the trusted host to tenant, site, domain and active publication server-side;
- render an MVP registry containing Hero, Trust Bar, Services Grid, Feature Grid, Process Steps, Testimonials, FAQ, CTA Banner and Contact Form;
- implement safe metadata, canonical URL, robots, sitemap, 404 and maintenance behavior;
- prove in staging how the same verified host resolver selects an allowlisted custom Next.js deployment;
- register the existing Veele marketing app as a non-live custom deployment candidate without changing its 44-route contract.

Acceptance:

- unknown, disabled and mismatched hosts return a safe 404/503;
- draft content never appears on public routes;
- malformed or unsupported section data cannot execute code or break the entire page;
- custom routing cannot target private, loopback, link-local or tenant-supplied origins;
- host, TLS, health endpoint and immutable release marker are verified for a custom candidate;
- no automatic cross-mode fallback occurs;
- managed and custom routes pass cache, cookie and header-isolation tests.

Stop rule:

- do not continue to live-domain activation if the router cannot atomically and observably fail closed.

## Phase 3 — backoffice CMS and publishing

Deliverables:

- add the Website sidebar entry behind module and permission checks;
- add overview, site settings, page list and page editor routes;
- add schema-driven section forms and accessible move-up/move-down ordering;
- add signed, user-bound, noindex/no-store preview;
- add publish review, validation diagnostics and explicit activation;
- show the current delivery mode and preserved inactive target.

Acceptance:

- all reads and mutations authorize tenant, module and resource server-side;
- normal tenant users cannot select or modify custom deployment origins;
- custom mode makes CMS content editable but clearly not live, unless product chooses read-only editing;
- preview tokens expire, are user/site-bound and cannot cross tenants;
- publication is atomic and leaves the last active version usable on failure;
- keyboard and screen-reader workflows pass.

## Phase 4 — navigation and redirects

Deliverables:

- hierarchical header/footer navigation with internal and validated external links;
- route-change redirects with loop and collision checks;
- canonical path normalization and locale-ready keys;
- publication-time broken-link diagnostics.

Acceptance:

- navigation remains tenant/site scoped;
- javascript/data URL schemes are rejected;
- redirect loops, path collisions and links to unpublished pages block publication;
- custom Next.js sites own their navigation and redirects in code; Fieldgrid does not inject managed navigation.

## Phase 5 — blog

Deliverables:

- posts, categories, tags, archive, post detail, metadata and feed/sitemap integration;
- canonical TipTap JSON with an allowlisted public renderer;
- scheduled-publish fields only if an existing reliable scheduler is approved; otherwise explicit publish only.

Acceptance:

- drafts and future content remain private;
- slugs are unique per site and locale;
- rich text cannot inject HTML, script, arbitrary classes or unsafe URLs;
- previous publications remain immutable.

## Phase 6 — forms, submissions and lead conversion

Deliverables:

- configurable forms and durable tenant-scoped submissions;
- payload limits, schema validation, honeypot, durable throttling/deduplication and safe logging;
- notification through the existing tenant email service after persistence;
- submission inbox, lifecycle and explicit conversion to `customers.status = 'lead'`;
- a shared public submission endpoint usable by managed and approved custom sites.

Acceptance:

- the trusted host and public form identifier resolve to the same active tenant/site;
- custom sites receive no database or service-role credential;
- replay, cross-tenant, oversized and schema-invalid requests fail safely;
- notification failure does not lose a stored submission;
- conversion is idempotent, authorized and linked to the source submission;
- retention/deletion rules are documented and tested.

## Phase 7 — SEO and controlled integrations

Deliverables:

- global and per-page title, description, canonical, social image and indexing controls;
- organization, local business, breadcrumb and article structured data from validated fields;
- consent-aware analytics contract using a provider enum and validated public identifier;
- webmaster verification through controlled fields, not arbitrary markup.

Acceptance:

- arbitrary script, HTML and JSON-LD injection are impossible;
- canonical, robots, sitemap and structured-data tests pass on managed sites;
- custom Next.js sites remain responsible for their own rendered SEO, with platform health checks verifying the contract.

## Phase 8 — templates and controlled visual expansion

Deliverables:

- ship Templates 2–5 as versioned managed-CMS presets;
- add approved section variants and bounded theme tokens;
- add optional drag-and-drop only if its accessibility, bundle and maintenance costs are accepted;
- add media focal point/crop support if required by the approved template set.

Acceptance:

- choosing a template initializes editable records and does not hard-code a renderer fork;
- updating a preset never silently mutates an existing live site;
- all themes meet contrast, responsive and performance budgets;
- custom Next.js remains a delivery mode and never appears in the template picker.

## Phase 9 — enterprise operations and activation

Deliverables:

- platform-operator custom-deployment registration, approval and switch workflow;
- staging-only route activation, health monitoring, audit trail and explicit rollback;
- backup/restore and migration rehearsal evidence;
- service, port, Caddy/TLS, deployment-health and previous-release rollback coverage;
- operational runbooks for both delivery modes;
- final tenant A/B, security, accessibility, performance and failure-mode evidence.

Custom switch preflight:

1. verify expected current delivery revision and active target;
2. verify tenant, entitlement, site and website-domain binding are active;
3. verify the candidate deployment is approved and belongs to that tenant/site;
4. verify its immutable release identifier, expected host, TLS and health endpoint;
5. verify required form integration and platform-owned secrets;
6. atomically update mode and delivery revision and append an audit event;
7. invalidate route/publication caches;
8. run HTTP, SEO, asset and form smokes;
9. on failure, perform an explicit audited rollback to the recorded prior revision.

Acceptance:

- zero critical/high security, tenant-isolation, migration or data-integrity findings;
- exact-head CI is fully green with no failed, cancelled or pending authoritative checks;
- staging proves both a managed site and a custom Next.js site without changing production;
- rollback restores the exact previous mode and target;
- no secrets, private origins or draft content appear in responses or logs;
- production activation remains a separate human go/no decision.

## Validation matrix

| Boundary               | Minimum evidence                                                                                      |
| ---------------------- | ----------------------------------------------------------------------------------------------------- |
| Pure contracts         | Zod unit tests, schema-version fixtures, unknown-section behavior                                     |
| Database               | migration order, PostgreSQL 17 apply, constraints, tenant A/B, RLS, prior-release compatibility       |
| Permissions            | module-disabled, read/write/publish splits, platform-only deployment control                          |
| Managed public runtime | host resolution, draft leakage, metadata, sitemap, robots, cache isolation, malformed content         |
| Custom routing         | allowlist, SSRF targets, immutable release marker, host/TLS health, stale revision, explicit rollback |
| Forms                  | rate limits, replay, payload/schema limits, cross-tenant, notification failure, lead conversion       |
| Admin                  | server authorization, optimistic concurrency, preview token, keyboard, axe, mobile                    |
| Deployment             | service health, no side effects in validation, staging backup/restore, rollback target                |

## Recommended next coding increment

After review and exact-main reconciliation, implement only Phase 1A in one focused draft pull request. Do not add public routing, a live domain, a deployment or a broad visual page builder in that increment.
