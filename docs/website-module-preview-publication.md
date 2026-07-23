# Fieldgrid website module — preview and immutable publication review

Date: 23 July 2026
Status: Phase 5 integrated, not deployed

## Boundary

Phase 3C adds three separate operations:

1. compile and inspect the current draft without writing a publication;
2. create a short-lived authenticated preview snapshot;
3. prepare and explicitly activate an immutable managed publication.

These operations never register custom infrastructure, change route keys,
modify DNS or deploy an application. A tenant activation is accepted only when
the current delivery mode is already `managed_cms`.

## Preview token lifecycle

- The server generates 32 random bytes and signs the opaque nonce with
  HMAC-SHA-256 using the existing server-only `SESSION_SECRET`.
- HMAC input is domain-separated from session signing.
- The token contains no tenant, site, actor, revision or draft content.
- PostgreSQL stores only a domain-separated SHA-256 digest.
- The row binds the digest to the exact tenant, site, actor and site authoring
  revision.
- The application expiry is ten minutes; the database constraint rejects any
  expiry longer than fifteen minutes.
- Reuse is allowed only for the issuing authenticated user until expiry, so
  internal whole-site navigation works.
- Expiry, revocation, a wrong actor, a wrong tenant, an inactive tenant/module
  or any authoring-revision change returns not found.

Preview responses set:

- `Cache-Control: private, no-store, max-age=0`;
- `Pragma: no-cache`;
- `X-Robots-Tag: noindex, nofollow, noarchive`;
- `Referrer-Policy: no-referrer`.

The visible preview banner states the exact source revision and expiry.

## Renderer equality

Public delivery and preview import
`@workspace/shared-ui/website-renderer`. Preview supplies an internal path
prefix so page actions, navigation and the brand/home link remain inside the
opaque preview boundary. Section rendering remains node-by-node React output;
there is no stored-HTML path or `dangerouslySetInnerHTML`.

## Review and activation

The review service loads tenant/site-scoped settings, pages, sections,
navigation, redirects and blog content. It uses the same compiler as immutable
publication creation and compares the result with the active snapshot. Because
a whole-site snapshot can contain private blog drafts in preview and published
blog content on activation, review/preview require both page-read and blog-read;
preparation/activation require both publish permissions. The UI exposes:

- blocking diagnostics and warnings;
- missing primary-domain state;
- concept pages excluded from publication;
- settings/navigation changes;
- added, changed and removed public pages;
- current active and ready publication identity;
- exact authoring and delivery revisions.

A concept page must be explicitly marked for inclusion. That changes only its
authoring state and invalidates every older preview/candidate through the
monotonic site revision.

Preparing a publication creates or reuses one deterministic immutable `ready`
snapshot for the exact authoring revision. Activation is a separate confirmed
operation. The server rechecks:

- `website_pages:publish` and `website_blog:publish`;
- exact tenant and site;
- current delivery mode is `managed_cms`;
- exact source revision;
- exact current delivery revision;
- exact ready candidate ID;
- candidate target revision equals current delivery revision plus one;
- explicit `PUBLICEREN` confirmation.

The existing database activation function then atomically activates the
candidate and supersedes the previous managed publication. Custom mode remains
untouched and can only be switched through the separate platform-controlled
delivery workflow.

## Evidence

- website-core token and draft-preview compiler tests;
- shared renderer internal-link and escaping tests;
- recursive security-source contracts;
- PostgreSQL 17 migration application;
- tenant/database runtime proof for actor binding, stale revision invalidation,
  explicit page inclusion and browser ACL denial;
- backoffice and website-runtime typecheck/build;
- exact-head CI before review or merge.
