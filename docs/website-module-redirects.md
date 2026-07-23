# Fieldgrid website module — managed redirects

Date: 23 July 2026
Status: Phase 4B implemented

## Scope

Phase 4B adds tenant- and site-scoped redirect authoring for managed-CMS
websites. It also guards public page-path changes and delivers active redirects
from the same immutable publication snapshot as pages and navigation.

It does not activate a publication, switch delivery mode, deploy software,
modify domains or inject redirects into a Custom Next.js website.

## Canonical route contract

Every managed page and redirect path is a normalized absolute path:

- lowercase letters, numbers, `_`, `-` and bounded `/` segments only;
- no query, fragment, trailing slash, empty segment or protocol;
- `/api`, `/_next`, `/health`, `/preview` and `/assets` remain reserved;
- route identity is the locale-ready key `locale:path`.

Redirect sources cannot be `/`. A destination is either another canonical path
in the same locale or an HTTPS URL without credentials. Supported response
codes are exactly `301`, `302` and `308`.

## Database invariants

`website_redirects` stores authoring state only. PostgreSQL independently
enforces:

- immutable tenant/site ownership;
- a unique `(tenant, site, locale, source_path)`;
- no source collision with a non-archived page;
- an internal destination resolves to a non-archived page in the same locale;
- no self redirect, active redirect chain or loop;
- server-only access through RLS with no browser policy;
- one site-authoring revision touch per ordinary child mutation.

The redirect replacement service additionally locks the exact site revision,
validates the complete requested set, performs one atomic full-set write and
records one audit event. A canonical no-op does not advance the revision.

## Page-path changes

Editing a non-homepage path requires an explicit decision:

1. `create_redirect` atomically changes the page and creates a `308` from the
   previous path;
2. `no_redirect` records that the operator intentionally accepted the broken
   old route.

An automatic redirect is limited to the same locale. A locale change therefore
requires the explicit no-redirect decision until localized destination routing
is introduced. Existing redirects that pointed at the old page path are
retargeted directly to the new path, preventing a chain.

The page mutation suppresses child-trigger increments during its transaction,
advances the site revision exactly once and audits the old/new route, decision
and number of retargeted redirects.

## Publication and runtime

Only active redirects enter a managed publication. Publication fails closed
when:

- a source collides with a published page;
- an internal destination is not published in the same locale;
- the source set forms a loop or chain;
- a destination is unsafe or non-canonical.

Existing schema-v1 snapshots without a `redirects` member remain readable and
normalize to an empty list. New snapshots include redirects in deterministic
locale/source order and therefore in their immutable content hash.

Next.js 15.5 Node middleware resolves only the active immutable publication.
It returns the exact stored `301`, `302` or `308` status before page rendering.
Internal redirects use the canonical hostname and preserve the public query
string; external redirects do not copy request query parameters.

## Validation

Phase 4B is covered by:

- website-core path, protocol, duplicate, chain and publication tests;
- exact-status public runtime tests;
- security-source RBAC, RLS, tenant and no-delivery-side-effect contracts;
- PostgreSQL 17 full migration apply;
- exact-revision, no-op, stale-write and atomic path-change runtime proof;
- database-level chain rejection and immutable snapshot delivery proof.
