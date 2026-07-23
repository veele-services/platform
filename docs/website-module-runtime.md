# Fieldgrid managed website runtime

Date: 23 July 2026
Status: Phase 4A managed navigation contract; not deployed or routed live

## Runtime boundary

`artifacts/website-runtime` is a separate Next.js App Router application. It has
no Supabase browser/server client and no authenticated application shell. The
pure React website renderer now lives under `@workspace/shared-ui/website-renderer`
so the authenticated backoffice preview and public runtime cannot drift. The
public runtime receives a Host header, normalizes one exact authority and asks
the server-only database resolver for one active immutable managed publication.

The resolver joins only:

- the exact `website_domain_bindings` hostname;
- its verified, non-disabled `tenant_domains` owner;
- an active runtime tenant with the website entitlement;
- an active `managed_cms` site;
- that site's exact active publication and active primary canonical domain.

It does not query authoring pages, sections or navigation. Site, publication,
target-delivery revision, snapshot revision, canonical hostname, content hash
and cache identity must all agree before rendering.

## Public behavior

- `/admin`, `/personeel`, `/klant` and `/api` never fall through to the website
  page renderer.
- Unknown, disabled, stale, mismatched and unsupported page requests fail with
  the same neutral 404 surface, so tenant lifecycle state is not disclosed.
- Robots and sitemap endpoints return 404 for unknown hosts and 503 with
  `Retry-After` for a known but unavailable site.
- The page route is dynamic and the middleware sets `private, no-store` plus
  `Vary: Host`; this prevents a shared cache from crossing host or publication
  boundaries before an activation-aware edge cache exists.
- Robots and sitemap ETags include the immutable publication delivery revision
  and content hash.
- Canonical, Open Graph, robots and sitemap values come only from the validated
  publication's verified canonical hostname.

## Content safety

The runtime validates the immutable snapshot again. An invalid publication
envelope fails closed. An individual malformed, hidden or unsupported section
is omitted and only a payload-free diagnostic is retained server-side. Public
rendering uses React text escaping and never `dangerouslySetInnerHTML`.

The nine Phase 2B renderers are Hero, Trust Bar, Services Grid, Feature Grid,
Process Steps, Testimonials, FAQ, CTA Banner and Contact Form. The contact form
is intentionally non-submitting until Phase 6 adds durable throttled form
processing; its controls are disabled and the CSP has `form-action 'none'`.

The middleware removes legacy backoffice, personnel and customer cookies before
server rendering. A per-request CSP nonce protects framework scripts; no tenant
content can add script, HTML, CSS classes or executable URLs.

## Authenticated draft preview

Phase 3C does not expose drafts through the public runtime. The backoffice
creates an opaque HMAC-signed token, stores only its digest with a compiled
snapshot and serves preview pages under `/admin/website-preview/*`. The route
repeats authentication, live tenant resolution and `website_pages:read`,
requires the exact issuing user and authoring revision, and returns no-store,
noindex and no-referrer headers. Internal links are rewritten inside the same
opaque preview boundary. Tokens are reusable by that user for ten minutes so a
whole-site preview can be navigated; expiry, revocation or any authoring change
fails closed.

Phase 4A uses that same preview/public renderer for navigation. Managed snapshots
contain only visible, validated and deterministically ordered Header, Footer and
Legal items. Internal preview links remain inside the opaque preview prefix;
public links resolve from the immutable snapshot. Custom Next.js delivery does
not receive or inject this managed navigation.

## Validation and activation boundary

Phase 2B adds the runtime to workspace build/typecheck, unit-domain tests,
security-source tests and the runtime-entrypoint inventory. The PostgreSQL
publication harness proves that the exact verified hostname resolves the active
snapshot, an unknown host is rejected and later draft edits do not change the
public result. Phase 3C extends that harness with actor-bound preview loading,
stale-preview rejection, explicit page inclusion and direct-browser ACL denial.
Phase 4A additionally proves exact-revision full-tree replacement, no-op
stability, deterministic reordering, bounded hierarchy and unsafe-link
rejection against PostgreSQL 17.

This phase intentionally does not add deployment service definitions, proxy
configuration, live health routing or domain activation. Those require the
staging and rollback gates in Phase 9.
