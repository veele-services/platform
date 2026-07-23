# Fieldgrid website module — managed navigation

Date: 23 July 2026
Status: Phase 4A implemented; Phase 4B redirects implemented separately

## Scope

Phase 4A adds draft authoring for three managed-CMS navigation locations:

- `header`;
- `footer_primary`;
- `footer_legal`.

Redirect authoring and guarded page-path changes are defined in
`docs/website-module-redirects.md`. Neither increment activates a publication,
switches delivery mode, deploys software or modifies DNS/routing.

## Authoring contract

The editor sends the complete ordered tree to one Server Action. The shared
website-core contract:

- accepts at most 500 items;
- requires stable UUID identities and non-empty bounded labels;
- permits internal page links, credential-free HTTPS links and root menu groups;
- permits one submenu level;
- requires parent and child to use the same menu location;
- rejects duplicate sibling labels and destinations;
- rejects visible children below a hidden parent;
- derives deterministic zero-based positions per menu from the submitted order.

Internal targets are not trusted from the browser. The database service reloads
every page by exact tenant/site, rejects archived or non-default-locale pages
and allows a draft page only as a visible publication warning. Publication
continues to fail closed until every visible internal target is published.

## Atomic persistence

`replaceWebsiteNavigation`:

1. locks the primary site for the exact expected authoring revision;
2. rechecks tenant lifecycle and the website entitlement;
3. validates every page target;
4. locks the current navigation;
5. returns without a revision change when the canonical draft is identical;
6. defers the navigation ordering constraint inside the transaction;
7. detaches, removes and upserts the requested tree with child revision touches
   suppressed;
8. verifies the exact persisted row count;
9. advances the site authoring revision once;
10. records one tenant/actor-bound audit event.

The database independently rejects a parent from another menu, any third level,
child menu groups, internal blank targets and invalid positions. Browser roles
retain no direct table access.

## Preview and publication

Saving navigation changes only the authoring revision. It immediately
invalidates an older preview or ready publication candidate through the existing
revision contract.

A new authenticated Phase 3C preview compiles draft pages and the saved
navigation through the shared renderer. A managed publication compiles only
visible items whose internal pages are published. Cycles, missing/hidden
parents, duplicate positions, duplicate sibling labels/destinations, unsafe
external links and unpublished page targets are blocking diagnostics.

Custom Next.js sites own navigation in their application code. Managed
navigation may be prepared as a non-live future draft but is never injected into
custom delivery.

## Validation

Phase 4A is covered by:

- website-core schema and compiler tests;
- security-source RBAC, tenant-scope and no-delivery-side-effect contracts;
- PostgreSQL 17 migration and runtime rehearsal;
- stale-revision, no-op, deterministic reorder and hierarchy-trigger proofs;
- public/preview renderer unit tests and the existing exact-head CI matrix.
