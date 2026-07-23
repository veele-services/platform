# Fieldgrid website module — managed blog publication

Phase 5 adds a tenant-scoped managed blog to the existing website authoring,
preview and immutable-publication boundary. It deliberately does not introduce
a scheduler, raw HTML, a second rich-text format or a public database read
path.

## Public routes

Managed sites use one fixed, locale-ready route family:

- `/blog` — the published `blog_index` page plus published post cards;
- `/blog/:slug` — post detail;
- `/blog/categorie/:slug` — category archive;
- `/blog/tag/:slug` — tag archive;
- `/feed.xml` — RSS 2.0 feed containing published posts only;
- `/sitemap.xml` — indexable pages, posts and used taxonomy archives.

`categorie` and `tag` are reserved post slugs. Page, redirect, post, category
and tag routes share one database- and compiler-enforced collision boundary per
site and locale. Internal redirects may target active blog routes but may not
form chains or loops.

## Authoring model

Backoffice users with `website_blog:read` can inspect posts and taxonomy.
`website_blog:write` controls category/tag replacement, draft creation,
editing and archiving. `website_blog:publish` controls the explicit
draft-to-published transition.

Post bodies use the same canonical TipTap v2 JSON contract as managed rich-text
sections. The strict allowlist supports paragraphs, H2/H3 headings, lists,
quotes, horizontal rules, hard breaks, bold, italic and validated links. Raw
HTML, scripts, arbitrary classes and unsafe URL schemes are not accepted.

Saving a changed published post moves it back to `draft` and clears its
publication timestamp. The editor will not publish while local changes remain
unsaved.

## Publication lifecycle

There are two distinct explicit transitions:

1. a blog editor changes a valid draft post to `published`; PostgreSQL assigns
   `published_at = transaction_timestamp()`;
2. a website publisher prepares and activates a new immutable whole-site
   publication snapshot.

The first transition makes the post eligible for the next snapshot; it does not
change the live website. Updating authoring records after activation cannot
rewrite the active or any previous snapshot.

Scheduled publication is intentionally absent. A future `published_at` is
rejected by both the publication compiler and PostgreSQL. Introducing scheduling
later requires a separately approved durable scheduler and delivery contract.

## Preview and privacy

Public host resolution reads only the active immutable publication. It never
queries blog authoring tables. Public route resolution, RSS and sitemap
generation additionally require `visibility = published`.

Short-lived signed preview snapshots may include drafts with
`visibility = preview`. Preview creation, loading and full website review
require both page-read and blog-read permissions, are tenant/actor bound and
remain `noindex`.

Whole-site preparation and activation require both `website_pages:publish` and
`website_blog:publish`, because those operations publish one combined snapshot.

## Database invariants

The migration `20260721250000_website_blog_publication.sql` creates:

- `website_blog_categories`;
- `website_blog_tags`;
- `website_blog_posts`;
- `website_blog_post_tags`.

Every relation owns `tenant_id` and `site_id`, uses composite foreign keys for
cross-site references, has RLS enabled and revokes direct access from `anon`
and `authenticated`. Server mutations lock the primary site, require exact site
and post revisions, suppress per-row revision touches during an atomic change,
advance the site revision exactly once and append a `website_blog` audit event.

Active taxonomy referenced by a non-archived post cannot be deactivated or
moved to another locale. A post can only reference active taxonomy in its own
locale.

## Validation evidence

Phase 5 is covered by:

- website-core schema/compiler/runtime-boundary unit tests;
- shared renderer, host resolver, metadata, RSS and sitemap tests;
- source security tests for RLS, ACL, TipTap and snapshot-only delivery;
- migration order and PostgreSQL 17 migration application;
- the disposable PostgreSQL publication runtime proof, including stale
  revisions, route collisions, future timestamps, draft privacy, browser-role
  denial and immutable previous publications;
- full exact-head CI before review and merge.
