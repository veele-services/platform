import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (path) =>
  readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

const migration = read(
  "lib/db/migrations/20260721250000_website_blog_publication.sql",
);
const service = read("lib/db/src/website-blog-service.ts");
const actions = read("artifacts/backoffice/src/app/actions/website.ts");
const preview = read(
  "artifacts/backoffice/src/app/website-preview/[token]/[[...slug]]/page.tsx",
);
const blogContract = read("lib/website-core/src/blog.ts");
const publicationBuilder = read("lib/website-core/src/publication-builder.ts");
const publicResponses = read(
  "artifacts/website-runtime/src/lib/public-responses.ts",
);
const publicResolver = read(
  "artifacts/website-runtime/src/lib/runtime-context.ts",
);

const blogTables = [
  "website_blog_categories",
  "website_blog_tags",
  "website_blog_posts",
  "website_blog_post_tags",
];

test("blog authoring tables are tenant-owned and unavailable to browser roles", () => {
  for (const table of blogTables) {
    const block = migration.match(
      new RegExp(
        `CREATE TABLE IF NOT EXISTS public\\.${table} \\([\\s\\S]*?\\n\\);`,
        "u",
      ),
    )?.[0];
    assert.ok(block, `${table} is missing`);
    assert.match(block, /tenant_id uuid NOT NULL/u);
    assert.match(
      migration,
      new RegExp(
        `ALTER TABLE public\\.${table} ENABLE ROW LEVEL SECURITY`,
        "u",
      ),
    );
    assert.match(
      migration,
      new RegExp(
        `REVOKE ALL ON TABLE public\\.${table} FROM anon, authenticated`,
        "u",
      ),
    );
  }
  assert.doesNotMatch(
    migration,
    /GRANT (?:SELECT|INSERT|UPDATE|DELETE|ALL)[\s\S]*TO (?:anon|authenticated)/iu,
  );
  assert.doesNotMatch(migration, /CREATE POLICY website_blog_/u);
});

test("database constraints close cross-site taxonomy and route identities", () => {
  for (const constraint of [
    "website_blog_categories_tenant_site_fk",
    "website_blog_tags_tenant_site_fk",
    "website_blog_posts_tenant_site_fk",
    "website_blog_posts_category_fk",
    "website_blog_post_tags_post_fk",
    "website_blog_post_tags_tag_fk",
  ]) {
    assert.match(migration, new RegExp(`CONSTRAINT ${constraint}`, "u"));
  }
  assert.match(migration, /website_guard_blog_post_tag_locale/u);
  assert.match(migration, /blog tag must be active in the post locale/u);
  assert.match(
    migration,
    /website page, redirect and blog routes must not collide/u,
  );
  assert.match(
    migration,
    /internal redirect destination must resolve to active website content/u,
  );
  assert.match(migration, /DEFERRABLE INITIALLY IMMEDIATE/u);
});

test("blog publishing is explicit, revision-bound and cannot be scheduled", () => {
  assert.match(migration, /status = 'published' AND published_at IS NOT NULL/u);
  assert.match(migration, /published_at > clock_timestamp\(\)/u);
  assert.match(migration, /scheduled blog publication is not supported/u);
  assert.match(service, /SET status = 'published'/u);
  assert.match(service, /published_at = transaction_timestamp\(\)/u);
  assert.match(service, /status = 'draft',[\s\S]*published_at = NULL/u);
  assert.match(service, /expectedPostRevision/u);
  assert.match(service, /expectedAuthoringRevision/u);
  assert.match(
    service,
    /fieldgrid\.website_child_authoring_touch', 'suppressed'/u,
  );
  assert.match(service, /website_blog_post_published/u);
  assert.doesNotMatch(
    `${migration}\n${service}`,
    /cron|scheduleWebsite|publish_at_queue|setTimeout/iu,
  );
});

test("canonical blog content is strict TipTap JSON without an HTML escape hatch", () => {
  assert.match(blogContract, /websiteRichTextDocumentSchema/u);
  assert.match(blogContract, /websiteBlogPostDraftSchema/u);
  assert.match(blogContract, /websitePublicationBlogSchema/u);
  assert.doesNotMatch(
    `${blogContract}\n${publicationBuilder}`,
    /dangerouslySetInnerHTML|rawHtml|htmlBody|className:\s*z\.string/iu,
  );
  assert.match(publicationBuilder, /status === "published"/u);
  assert.match(publicationBuilder, /future_blog_post/u);
});

test("preview and whole-site publication require both page and blog ACLs", () => {
  for (const fragment of [
    'requirePermission("website_pages", "read")',
    'requirePermission("website_blog", "read")',
    'requirePermission("website_pages", "publish")',
    'requirePermission("website_blog", "publish")',
  ]) {
    assert.ok(actions.includes(fragment), `${fragment} is required`);
  }
  assert.match(preview, /hasPermission\("website_pages", "read"\)/u);
  assert.match(preview, /hasPermission\("website_blog", "read"\)/u);
  assert.match(preview, /verifyWebsitePreviewToken/u);
  assert.match(preview, /loadWebsitePreviewSession/u);
  assert.match(
    actions,
    /activateWebsitePublicationAction[\s\S]*?Promise\.all\(\[[\s\S]*?requirePermission\("website_pages", "publish"\),[\s\S]*?requirePermission\("website_blog", "publish"\),[\s\S]*?\]\)/u,
  );
});

test("blog index readiness requires a published page in the site locale", () => {
  assert.match(
    service,
    /page\.locale = site\.default_locale[\s\S]*page\.page_type = 'blog_index'[\s\S]*page\.path = '\/blog'[\s\S]*page\.status = 'published'/u,
  );
  assert.doesNotMatch(
    service,
    /page\.page_type = 'blog_index'[\s\S]*page\.status <> 'archived'/u,
  );
});

test("public runtime reads immutable snapshots and filters preview posts", () => {
  assert.match(publicResolver, /resolution\.snapshot\.blog\.posts/u);
  assert.match(publicResolver, /post\.visibility === "published"/u);
  assert.doesNotMatch(
    publicResolver,
    /website_blog_posts|website_blog_categories|website_blog_tags/u,
  );
  assert.match(publicResponses, /managedWebsiteFeedResponse/u);
  assert.match(publicResponses, /managedWebsiteSitemapResponse/u);
  assert.match(publicResponses, /post\.visibility === "published"/u);
  assert.match(publicResponses, /xmlEscape/u);
});
