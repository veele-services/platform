# Fieldgrid website module — proposed data model

Date: 23 July 2026
Status: Phase 4A navigation invariants implemented

The additive Phase 1A migration implements sites, domain bindings, custom
deployment records, pages, page sections, navigation, immutable publications and
append-only delivery activations. Blog, form-submission and media tables described
later in this document are intentionally deferred.

Phase 1B adds database-managed authoring revisions, exact target delivery
revisions, deterministic cache identities, verified primary-domain transitions
and atomic managed-publication activation/supersession. No public runtime or
browser mutation path exists yet.

Phase 3C adds `website_preview_sessions`. It stores only a SHA-256 digest of an
opaque signed token plus the exact tenant, site, actor, source revision,
immutable preview snapshot and a maximum fifteen-minute database expiry (the
application issues ten-minute sessions). RLS is enabled and direct anon or
authenticated table access is revoked. The live preview loader additionally
requires an active tenant/module and exact current authoring revision.

Phase 4A hardens `website_navigation_items` with a tenant/site/location-bound
deferrable ordering constraint and a database trigger that rejects cross-menu
parents and trees deeper than two levels. The application replaces a validated
full navigation draft in one transaction while suppressing per-row revision
touches, then advances the site authoring revision exactly once.

## Design principles

- Every website-owned record carries `tenant_id`, even when tenant ownership is derivable through another row.
- Cross-table ownership is protected by composite tenant-aware foreign keys or equivalent database triggers and constraints.
- Public traffic never receives direct table access. Database roles used by PostgREST/clients have website tables revoked and protected by RLS.
- Authoring records are mutable drafts; public delivery reads an immutable active publication snapshot.
- `managed_cms` and `custom_nextjs` are explicit delivery modes. Custom Next.js is not a template.
- A tenant/site may retain candidates for both modes, but exactly one validated target can be active.
- Platform operators own custom deployment endpoints and mode activation. Tenants cannot provide arbitrary proxy URLs.
- JSON fields are versioned, Zod-validated and bounded. They are not escape hatches for HTML, scripts, CSS or secrets.
- Schema should support multiple sites per tenant, while the first admin UI exposes one primary site.

## Proposed enums

| Enum                         | Values                                                      | Purpose                                          |
| ---------------------------- | ----------------------------------------------------------- | ------------------------------------------------ |
| `website_delivery_mode`      | `managed_cms`, `custom_nextjs`                              | Selects the live delivery engine.                |
| `website_site_status`        | `draft`, `active`, `disabled`                               | Site lifecycle independent of publication state. |
| `website_content_status`     | `draft`, `published`, `archived`                            | Authoring state for pages/posts.                 |
| `website_publication_status` | `building`, `ready`, `active`, `superseded`, `failed`       | Immutable managed publication lifecycle.         |
| `website_deployment_status`  | `draft`, `checking`, `ready`, `active`, `failed`, `retired` | Approved custom deployment lifecycle.            |
| `website_submission_status`  | `new`, `in_progress`, `converted`, `closed`, `spam`         | Form-inbox workflow.                             |
| `website_media_status`       | `draft`, `ready`, `published`, `archived`                   | Media source/public lifecycle.                   |

Use text plus check constraints if that matches current migration conventions better than PostgreSQL enum types. Values remain centrally defined in TypeScript.

## Core tables

### `website_sites`

One logical website and its authoring settings.

| Column                              | Notes                                                                                       |
| ----------------------------------- | ------------------------------------------------------------------------------------------- |
| `id`                                | UUID primary key.                                                                           |
| `tenant_id`                         | Required tenant owner; indexed.                                                             |
| `name`                              | Internal display name.                                                                      |
| `status`                            | `draft`, `active` or `disabled`.                                                            |
| `is_primary`                        | Primary site within tenant; partial unique when true.                                       |
| `delivery_mode`                     | `managed_cms` or `custom_nextjs`.                                                           |
| `delivery_revision`                 | Monotonic optimistic-lock revision for switches.                                            |
| `active_publication_id`             | Nullable managed target, same tenant/site.                                                  |
| `active_custom_deployment_id`       | Nullable custom target, same tenant/site.                                                   |
| `template_key` / `template_version` | Managed preset provenance, not runtime dispatch.                                            |
| `default_locale`                    | Initially `nl-NL`; designed for later locale support.                                       |
| `theme_json`                        | Bounded versioned design tokens only.                                                       |
| `contact_json` / `social_json`      | Validated public contact/social data.                                                       |
| `seo_defaults_json`                 | Validated default title/description/social settings.                                        |
| `analytics_json`                    | Optional consent-aware provider enum plus validated public identifier; no script or secret. |
| `created_at`, `updated_at`          | Standard timestamps.                                                                        |
| `created_by`, `updated_by`          | Auth user/audit actors.                                                                     |

Critical invariants:

- an `active` managed site requires a same-site `active_publication_id` in `ready` or `active` state;
- an `active` custom site requires a same-site `active_custom_deployment_id` in `ready` or `active` state;
- the inactive target may remain populated for an explicit later switch;
- target references cannot cross tenant or site;
- transitions update `delivery_revision` and the audit log in one transaction.

Because cyclic site/target foreign keys can complicate migration ordering, target ownership can be enforced through deferrable constraints plus a transition function/service, or through an activation table as described below. The implementation PR must prove the chosen invariant in PostgreSQL tests rather than relying on TypeScript alone.

### `website_domain_bindings`

Associates a verified tenant-owned domain with a public website surface.

| Column                                   | Notes                                                                              |
| ---------------------------------------- | ---------------------------------------------------------------------------------- |
| `id`, `tenant_id`, `site_id`             | Tenant-scoped identity.                                                            |
| `tenant_domain_id`                       | References an existing verified `tenant_domains` record from the same tenant.      |
| `hostname`                               | Normalized denormalized host for indexed lookup; must match the referenced domain. |
| `is_primary`                             | Canonical public host for the site.                                                |
| `status`                                 | `pending`, `active` or `disabled`.                                                 |
| `verified_at`                            | Copied/confirmed verification point.                                               |
| `created_at`, `updated_at`, actor fields | Audit metadata.                                                                    |

Constraints:

- one website binding per `tenant_domain_id`;
- hostname globally unique after lowercase/IDNA normalization;
- one active primary binding per site;
- binding tenant equals both site tenant and tenant-domain tenant;
- an operational/platform-reserved host cannot be bound unless explicitly allowed by policy;
- public resolution requires active tenant, site, binding and verified domain.

This table owns the website-surface decision; the existing `tenant_domains.is_primary` remains the operational tenant-domain concept.

### `website_custom_deployments`

Platform-controlled immutable releases for enterprise custom Next.js sites.

| Column                                   | Notes                                                                         |
| ---------------------------------------- | ----------------------------------------------------------------------------- |
| `id`, `tenant_id`, `site_id`             | Tenant/site ownership.                                                        |
| `provider_key`                           | Code-owned deployment provider or routing adapter identifier.                 |
| `route_key`                              | Opaque lookup key into platform-managed infrastructure; not an arbitrary URL. |
| `release_id`                             | Immutable commit/image/deployment identifier.                                 |
| `expected_host`                          | Host the application is approved to serve.                                    |
| `health_path`                            | Code-approved relative path, not an absolute URL.                             |
| `status`                                 | Deployment lifecycle.                                                         |
| `approved_at`, `approved_by`             | Required before readiness/activation.                                         |
| `last_checked_at`, `last_health_json`    | Bounded operational result without secrets.                                   |
| `created_at`, `updated_at`, actor fields | Audit metadata.                                                               |

Constraints and policy:

- unique `(site_id, provider_key, release_id)`;
- no tenant-editable origin, protocol, port or credentials;
- provider adapter resolves `route_key` only against an infrastructure allowlist;
- only platform roles can create, approve, activate or retire records;
- a deployment is immutable after approval except for lifecycle/health metadata;
- one active custom deployment per site.

The current Veele marketing application can later become the first record after it has a real deployment service, immutable release marker, health endpoint and verified host.

### `website_publications`

Immutable managed-CMS releases.

| Column                                                     | Notes                                                |
| ---------------------------------------------------------- | ---------------------------------------------------- |
| `id`, `tenant_id`, `site_id`                               | Tenant/site identity.                                |
| `sequence`                                                 | Monotonic site publication number.                   |
| `schema_version`                                           | Snapshot contract version.                           |
| `source_revision`                                          | Exact authoring revision used to build the snapshot. |
| `target_delivery_revision`                                 | Required next delivery revision for activation.      |
| `snapshot`                                                 | Fully validated, bounded public site snapshot.       |
| `content_hash`                                             | SHA-256 of deterministic canonical snapshot JSON.    |
| `cache_key`                                                | Tenant/site/revision/hash-bound cache identity.      |
| `status`                                                   | Building/ready/active/superseded/failed.             |
| `validation`                                               | Bounded structured diagnostics.                      |
| `created_at`, `created_by`, `activated_at`, `activated_by` | Audit metadata.                                      |

Rules:

- publication content is never updated after reaching `ready`;
- unique `(site_id, sequence)`, `(site_id, content_hash)` and `cache_key` for idempotency;
- one active publication per site;
- activation and superseding the prior publication are atomic;
- cache keys include tenant, site, content hash and the exact target delivery revision;
- authoring child mutations advance the database-managed site authoring revision;
- child ownership (`tenant_id`, `site_id`) is immutable after creation;
- the content hash is domain-separated and bound to the exact source revision, so identical output from a newer authoring revision remains publishable as a distinct candidate;
- activation requires both the exact source revision and exact next delivery revision;
- failed builds never replace the active publication.

The implemented `website_delivery_activations` ledger stores `from_mode`,
`from_target_id`, `to_mode`, `to_target_id`, expected/new revision, reason, actor
and timestamp. Current active pointers remain on `website_sites` for efficient
future host resolution; the immutable ledger backs rollback and audit evidence.

## Managed content tables

### `website_pages`

- `id`, `tenant_id`, `site_id`;
- locale, normalized path, slug and optional parent page;
- internal title, navigation label and page kind (`home`, `standard`, `service`, `contact`, `blog_index`, `custom`, `legal`, `area` initially);
- status plus authoring revision;
- explicit homepage marker constrained to one per site/locale;
- SEO title, description, social image and indexing flags;
- timestamps, publish metadata and actor fields.

Constraints:

- unique `(site_id, locale, normalized_path)` for non-archived pages;
- parent belongs to the same tenant/site/locale;
- reserved paths (`api`, framework internals, health, preview and assets) are rejected;
- path changes require a validated redirect or explicit operator decision.

### `website_page_sections`

- `id`, `tenant_id`, `site_id`, `page_id`;
- `section_key`, `schema_version`, `variant_key`;
- `position` or sparse `sort_key`;
- `content_json` containing section-specific validated data;
- visibility/state fields and authoring revision;
- timestamps and actor fields.

Constraints:

- page and section tenant/site must match;
- unique ordering key per page;
- payload has a strict byte limit;
- `section_key`, variant and schema version must exist in the code registry at save and publication time;
- content contains no HTML, script, CSS class, secret or arbitrary component name.

### `website_navigation_items`

- `id`, `tenant_id`, `site_id`;
- menu location (`header`, `footer_primary`, `footer_legal` initially);
- parent item, position, label;
- either same-site `page_id`, safe relative path or validated external URL;
- visibility and timestamps.

Enforce same-site parents, bounded depth, cycle rejection, safe protocols and publication-time checks for unpublished internal targets.

Implemented Phase 4A constraints and service policy:

- ordering is unique per tenant/site/location and positions are bounded;
- a parent must belong to the same tenant/site/location;
- only a root may own submenu children and submenu groups cannot nest;
- internal links open in the same window and resolve to an active page in the
  site's default locale;
- external links use HTTPS without URL credentials;
- sibling labels and destinations are unique;
- visible children cannot sit below a hidden parent;
- every changed full-tree save is exact-revision, audited and advances the site
  revision once.

### `website_redirects`

- `id`, `tenant_id`, `site_id`, locale;
- canonical source path, destination type and canonical path/validated URL;
- status code (`301`, `302` or `308` under explicit policy);
- active state, timestamps and actor fields.

Implemented constraints enforce a unique source per tenant/site/locale, no
active page collision, no loops or chains, a same-locale active internal
destination, no reserved paths and no unsafe protocols. Page-path changes
require an audited `create_redirect` or `no_redirect` decision; automatic
same-locale redirects also retarget existing inbound redirects directly.

## Blog tables

Implemented in `20260721250000_website_blog_publication.sql`. Public delivery
does not read these authoring tables; compiled blog content is embedded in the
immutable `website_publications.snapshot`.

### `website_blog_posts`

- tenant/site ownership, locale, slug, title and excerpt;
- canonical TipTap JSON body plus schema version;
- hero media, optional same-tenant author identity/public display fields, SEO fields;
- draft/published/archived state and publish metadata.

The implemented Phase 5 contract does not yet include hero media or public
author profiles; those remain dependent on the media phase. Publication is
explicit, assigns the database transaction time and rejects future timestamps.

### `website_blog_categories`, `website_blog_tags`, `website_blog_post_tags`

- tenant/site-scoped names and slugs;
- composite keys prevent cross-tenant/site assignments;
- unique normalized slug per site/locale/type.

All four blog relations have RLS enabled and revoke `anon` and
`authenticated`. Category/tag/post routes also participate in the same
locale-ready collision and redirect-integrity function as managed pages.

No arbitrary HTML is stored as the canonical body. A derived HTML cache, if ever introduced, must be generated by the trusted renderer and keyed to the source hash and renderer version.

## Media

### `website_media`

Proposed fields:

- `id`, `tenant_id`, `site_id`;
- private source storage bucket/path and optional published derivative key;
- original filename, validated MIME type, byte size, width and height;
- alt text, caption, focal point and crop metadata;
- checksum, status, timestamps and actor fields.

Rules:

- tenant-prefixed, unguessable storage keys;
- server-authorized uploads and reads;
- MIME sniffing, size/dimension limits and image decoding before readiness;
- draft source is not publicly addressable;
- publication references immutable derivatives or content-addressed asset URLs;
- deletion is blocked while an active publication references the asset;
- SVG is rejected initially unless a dedicated sanitizer is approved.

## Forms and submissions

### `website_forms`

- `id`, `tenant_id`, `site_id` and an unguessable public ID;
- name, type (`contact`, `quote`, `callback`, `emergency`, `custom`), active state and schema version;
- validated field definitions, consent text/version and notification settings;
- optional lead-mapping configuration with allowlisted Fieldgrid fields;
- timestamps and actor fields.

Field definitions are code-supported types only: text, email, phone, textarea, select, checkbox and consent in the first release. They cannot define executable expressions, arbitrary HTML or recipient addresses outside policy.

### `website_form_submissions`

- `id`, `tenant_id`, `site_id`, `form_id`;
- immutable submitted payload JSON validated against the form snapshot;
- form schema and consent version captured at submission time;
- trusted-host binding ID and request correlation ID;
- optional same-site source page, normalized source path and validated/bounded UTM metadata;
- user-agent metadata only when justified, bounded and covered by the retention policy;
- status, spam score/reason and notification state;
- optional `converted_customer_id`, conversion timestamp and actor;
- created/updated timestamps.

Security/privacy rules:

- persist before attempting notification;
- encrypt or otherwise protect sensitive fields according to platform policy;
- never log the raw payload, email, phone or free text;
- store no raw IP by default; if abuse control requires it, retain only a rotating salted hash for a short documented period;
- use durable rate-limit/deduplication records or an approved external service, not process memory;
- deletion/retention jobs are tenant-scoped and auditable;
- lead conversion is explicit, idempotent and links the created/existing customer.

Managed and custom Next.js sites call the same public submission boundary. Resolution requires that the request host's active site owns the public form ID. CORS is supplementary and never the authorization mechanism.

## RBAC and module integration

Add `website` to the existing module-key and resource-to-module maps. Proposed resources/actions:

- `website:read`;
- `website_settings:read`, `website_settings:write`;
- `website_pages:read`, `website_pages:write`, `website_pages:publish`;
- `website_navigation:read`, `website_navigation:write`;
- `website_blog:read`, `website_blog:write`, `website_blog:publish`;
- `website_forms:read`, `website_forms:write`;
- `website_submissions:read`, `website_submissions:write`;
- `website_media:read`, `website_media:write`.

Creating/approving custom deployments and switching delivery mode are platform-level operations, not tenant resource grants. Tenant administrators may view mode, health, release and audit status without seeing target infrastructure or secrets.

Default role changes must follow the existing seed/default-role mechanism and remain explicit. A module-disabled tenant receives no effective website access even if a role contains a website permission.

## Publication snapshot contract

The managed public snapshot should contain only public, render-ready values:

```text
site identity and delivery revision
canonical domain and locale
validated theme/contact/social/SEO defaults
published pages keyed by normalized path
parsed sections with registry and schema versions
validated navigation and redirects
published blog summaries/posts
public form rendering schemas, never notification secrets
content-addressed public media references
generated sitemap/robots metadata inputs
```

It must exclude tenant IDs where not operationally needed, auth identifiers, email provider configuration, storage source keys, draft rows, audit actors, private deployment routing and form submissions.

## Atomic activation sequence

For a managed publication:

1. lock the site at the expected authoring/delivery revision;
2. read and validate all referenced authoring rows;
3. create immutable snapshot and content hash;
4. mark it ready;
5. atomically replace the active publication and supersede the prior one;
6. increment revision and append an audit event;
7. invalidate caches after commit.

For a delivery-mode switch:

1. lock the site and compare expected `delivery_revision`;
2. validate entitlement, active domain and exact target ownership/state;
3. record the prior mode and target in an immutable activation event;
4. update mode, active target and revision atomically;
5. append the existing platform audit log in the same transaction where feasible;
6. invalidate caches and run post-switch smokes;
7. if smokes fail, execute a new explicit rollback transition—never rewrite history.

## Migration and compatibility plan

- Use a new timestamped SQL migration that sorts after exact current main at implementation time.
- Add tables and nullable references first; backfill/default only where deterministic.
- Do not make existing application startup depend on website seed data.
- Export schemas through the existing Drizzle entrypoints and update generated/contract fixtures as required.
- Add grants/revokes and RLS policies in the same migration.
- Prove migration on PostgreSQL 17, tenant A/B isolation and direct-role denial.
- Start the previous application release against the migrated database and verify it remains healthy.
- Introduce public/admin behavior only after schema compatibility is green.
