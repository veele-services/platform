# Fieldgrid website module — backoffice administration design

Date: 21 July 2026
Status: proposed information architecture and interaction contract

## Admin boundary

Website administration belongs in the existing authenticated backoffice and follows its server-component, server-action, tenant-context, module-entitlement and RBAC conventions. Middleware authentication alone is never treated as authorization. The route table below names internal App Router paths; after the shared-host isolation gate their public URLs are prefixed with `/admin` (for example, internal `/website` is public `/admin/website`).

The tenant-facing CMS manages `managed_cms` content. A `custom_nextjs` enterprise site is separate code: tenant users may view its active mode, release and health state, but they cannot edit deployment origins, secrets or routing. Only an authorized platform operator may register/approve a custom deployment or switch delivery mode.

## Navigation and routes

Show a Website sidebar item only when:

- the current tenant is active;
- the `website` module entitlement is active;
- the user has at least `website:read`.

Proposed routes:

| Route                  | Purpose                                                    | Minimum permission             |
| ---------------------- | ---------------------------------------------------------- | ------------------------------ |
| `/website`             | Overview, mode, publication/domain health and next actions | `website:read`                 |
| `/website/settings`    | Identity, contact, theme, domain and SEO defaults          | settings read/write split      |
| `/website/pages`       | Page list, draft/published state and validation            | pages read                     |
| `/website/pages/[id]`  | Page metadata and section editor                           | pages write for mutation       |
| `/website/navigation`  | Header/footer navigation                                   | navigation read/write          |
| `/website/blog`        | Posts, categories and tags                                 | blog read                      |
| `/website/blog/[id]`   | Post editor and preview                                    | blog write/publish             |
| `/website/forms`       | Form definitions and notification policy                   | forms read/write               |
| `/website/submissions` | Submission inbox and lead conversion                       | submissions read/write         |
| `/website/templates`   | Initial managed preset and provenance                      | settings write for application |

Platform-only delivery management should live under the existing platform-admin route group, for example:

- internal `/platform/website-deployments` (public `/admin/platform/website-deployments`);
- internal `/platform/website-deployments/[id]`;
- internal `/platform/website-sites/[siteId]/delivery`.

Do not place platform switching controls in an ordinary tenant settings form.

## Website overview

The overview leads with operational truth:

- active delivery mode: Managed website or Custom Next.js;
- canonical public domain and verification/TLS status;
- active managed publication number/hash, if present;
- active custom release identifier and health status, if present;
- last published/switched time and actor;
- draft-change count and blocking diagnostics;
- last form-submission health/notification warning without exposing PII;
- mode-specific primary action.

Managed mode primary actions:

- Edit homepage;
- Preview draft;
- Review and publish.

Custom mode primary actions:

- View website;
- View deployment status;
- Request a change/support, according to the operating model.

When custom mode is active, clearly state that managed CMS edits are not currently live. Preserve the managed content. Depending on the final product decision, tenants may continue preparing a future CMS draft or the editor can be read-only; either behavior must be explicit and tested.

## Site settings

Use focused tabs or subsections instead of one unbounded form:

1. General — public name, locale and public contact details;
2. Branding — controlled theme tokens, logo and favicon;
3. Domains — website bindings, canonical domain and verification state;
4. SEO — default title, description, social image and indexing policy;
5. Social — validated profile URLs;
6. Delivery — read-only tenant view of active mode/target, history and support path.

Domain ownership and verification reuse the existing tenant-domain flow, but binding to the website is a separate authorized action. Tenant users cannot bind platform-reserved operational hosts. Changing the primary domain requires canonical/redirect validation and does not silently change delivery mode.

## Page list

The list shows:

- internal title and public path;
- draft/published/archived status;
- whether unpublished changes exist;
- last editor/time;
- publication diagnostics;
- indexability and navigation presence;
- actions allowed by current permission.

Provide explicit empty, module-disabled, permission-denied, loading and error states. Search/filtering can be added using existing table patterns, but is not required to make the first site manageable.

Creating a page starts from an approved page type/layout and validates reserved/duplicate paths server-side. Deletion is archive-first and cannot break active navigation without a resolved redirect or removal.

## Page and section editor

Recommended desktop layout:

```text
Page header: title, status, Preview, Review changes
--------------------------------------------------
Section outline/list             Selected section form
- Hero                           schema-owned fields
- Services                      media/link pickers
- Process                        validation errors
- Contact form                   variant controls
--------------------------------------------------
Page settings: path, SEO, indexability
```

On narrow screens, use a list plus full-screen sheet/drawer for the selected section. Reuse existing backoffice form, dialog, sheet, select, tabs, table and feedback primitives.

Editor rules:

- server-load the tenant/site/page and effective permission;
- include an authoring revision in every mutation;
- reject stale edits with a useful reload/review message;
- validate through the shared section schema server-side;
- expose typed fields, not raw JSON;
- use accessible Move up/Move down controls initially;
- preserve focus after add, reorder, duplicate and delete;
- autosave only if conflict and failure semantics are proven; explicit Save is the safer MVP;
- show unresolved links/media/forms near the affected section;
- never mark a save as published.

## Navigation editor

- Separate Header, Footer and Legal menus.
- Add internal pages through a page picker and external destinations through a validated URL field.
- Use accessible hierarchy/order controls with a bounded depth.
- Surface unpublished targets, cycles, redirect chains and duplicates before save/publication.
- Preview navigation as part of the whole draft site rather than an untrusted standalone HTML fragment.

## Blog administration

Follow the existing knowledge/news editor conventions where useful, but use canonical TipTap JSON and the public allowlist renderer.

The list and editor cover:

- draft/published/archived state;
- slug, title, excerpt, hero media and categories/tags;
- rich-text body;
- SEO/social preview;
- explicit preview and publish actions;
- publication diagnostics.

Do not promise scheduled publishing until the repository has an approved reliable scheduler and monitoring path.

## Forms and submission inbox

Form builder:

- choose only code-supported field types;
- require labels, bounds and consent configuration;
- configure notification behavior through the existing tenant email system;
- preview generated validation and success/error states;
- show the public form ID without exposing credentials.

Submission inbox:

- default to minimal columns and avoid rendering free-text PII in the list;
- open details only for authorized users;
- support New, In progress, Converted, Closed and Spam workflow;
- allow explicit idempotent conversion to a customer with status `lead`;
- show notification state and retry through a safe server operation;
- support retention/deletion policy and audited actions.

CSV export, bulk actions and automation are out of the MVP unless separately privacy- and security-reviewed.

## Preview and publication

### Preview

- Generate a short-lived signed token server-side for the exact tenant/site/user/draft revision.
- Render through the managed public renderer on a dedicated preview boundary.
- Set `Cache-Control: no-store`, `X-Robots-Tag: noindex, nofollow` and visible Preview chrome.
- Do not put sensitive content, tenant identity or raw draft payload in the URL token.
- Reject expired, reused where policy disallows reuse, wrong-user, wrong-site and stale-revision tokens.

### Publish review

Before activation, show a server-derived checklist:

- changed pages/sections/navigation/settings;
- broken or unpublished links;
- missing alt text and required fields;
- invalid heading/SEO/canonical state;
- missing forms/media;
- template/registry compatibility;
- current live publication and expected authoring revision.

The publish action creates and validates an immutable snapshot. It does not change delivery mode. If custom mode is active, a managed publication may become ready for future switching but must not be represented as live.

## Custom Next.js delivery management

### Tenant view

Show safe fields only:

- mode label;
- public domain;
- custom website name/release label;
- health state and last checked time;
- last switch event;
- preserved managed publication readiness;
- support/change contact.

Hide provider route keys, internal origins, ports, headers, tokens and health response bodies.

### Platform registration

A platform operator selects a code-approved provider and enters/selects an infrastructure route key and immutable release ID. The server resolves these through an allowlist and verifies tenant/site/domain ownership. The UI cannot accept a free-form upstream URL.

### Switch wizard

The final confirmation presents:

- exact tenant/site and canonical host;
- current mode, target and delivery revision;
- candidate mode, immutable target and release/publication ID;
- entitlement and ownership state;
- TLS, host, health, asset, SEO and form-preflight results;
- preserved rollback target;
- required reason/change reference.

Activation requires all checks green and the exact expected revision. It updates state atomically, appends audit evidence, invalidates caches and runs post-switch smokes. Failure does not cause a silent fallback. The operator receives a blocked/failed state and can execute a new explicit rollback transition.

## Error and state design

- Permission errors reveal no cross-tenant resource existence.
- Validation errors are field-specific and retain safe user input.
- Stale revision errors distinguish conflict from server failure.
- Publication failures leave the active website unchanged and link to structured diagnostics.
- Mode/preflight failures identify the failed contract without leaking infrastructure or secrets.
- Empty states explain the next permitted action.
- Long operations use durable status and polling/revalidation rather than an optimistic success toast alone.

## Accessibility and responsive requirements

- WCAG 2.2 AA target across all CMS flows.
- Full keyboard creation, editing, ordering, preview and publish flow.
- Visible focus, programmatic labels/errors and logical heading hierarchy.
- Dialogs/sheets trap and restore focus correctly.
- Color is never the only status signal.
- Tables have a usable mobile card or horizontal strategy.
- Touch targets and sticky actions do not obscure content.
- Reduced-motion preferences are respected.

## Required admin tests

- module-disabled and every read/write/publish permission boundary;
- direct server-action invocation without UI access;
- cross-tenant IDs for site/page/section/media/form/submission;
- stale authoring and delivery revisions;
- invalid/unsafe links and malformed section payloads;
- preview expiry, user binding, noindex and no-store headers;
- publication failure leaves live content unchanged;
- custom-mode tenant view contains no infrastructure values;
- tenant user cannot create/approve/switch a deployment;
- platform switch requires exact revision and all preflights;
- keyboard flow and axe checks at desktop/mobile widths;
- managed edits remain non-live while custom mode is active;
- switching mode preserves both rollback candidates.
