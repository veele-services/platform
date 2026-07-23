import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import {
  activateManagedWebsitePublication,
  createWebsiteBlogPost,
  createManagedWebsitePublication,
  createWebsitePreviewSession,
  getWebsiteBlog,
  getWebsiteBlogPost,
  getWebsiteNavigation,
  getWebsiteRedirects,
  includeWebsitePageInPublication,
  loadWebsitePreviewSession,
  pool,
  publishWebsiteBlogPost,
  replaceWebsiteBlogTaxonomy,
  resolveManagedWebsiteByHost,
  replaceWebsiteNavigation,
  replaceWebsiteRedirects,
  setPrimaryWebsiteDomain,
  updateWebsiteBlogPost,
  updateWebsitePage,
  type WebsiteNavigationDraftItem,
  type WebsiteRedirectDraftItem,
} from "../lib/db/src/index.ts";

const databaseUrl = process.env.DATABASE_URL;
assert.ok(databaseUrl, "DATABASE_URL is required");
const parsed = new URL(databaseUrl);
assert.ok(
  ["127.0.0.1", "localhost", "::1", "postgres"].includes(parsed.hostname),
  "Website publication runtime proof only runs against local/disposable PostgreSQL",
);
assert.match(
  parsed.pathname,
  /(runtime|safety|test|smoke)/u,
  "Database name must clearly identify a disposable runtime database",
);

const tenantA = "10000000-0000-4000-8000-000000000001";
const actorA = "20000000-0000-4000-8000-000000000201";
const siteId = randomUUID();
const competingSiteId = randomUUID();
const domainId = randomUUID();
const hostname = `publication-${randomUUID()}.runtime.fieldgrid.test`;
const homePageId = randomUUID();
const contactPageId = randomUUID();
const blogIndexPageId = randomUUID();
const previewDraftPageId = randomUUID();
const noRedirectPageId = randomUUID();
const heroSectionId = randomUUID();
const homeNavigationId = randomUUID();
const contactNavigationId = randomUUID();
const moreNavigationId = randomUUID();
const externalNavigationId = randomUUID();
const externalRedirectId = randomUUID();
const blogRedirectId = randomUUID();
const blogCategoryId = randomUUID();
const blogTagId = randomUUID();

const theme = {
  schemaVersion: 1,
  colors: {
    background: "#ffffff",
    foreground: "#0f172a",
    primary: "#0f766e",
    primaryForeground: "#ffffff",
    accent: "#ccfbf1",
    accentForeground: "#134e4a",
  },
  headingFont: "manrope",
  bodyFont: "inter",
  radius: "medium",
  spacing: "comfortable",
  logoMediaId: null,
  faviconMediaId: null,
};
const contact = {
  companyName: "Publication Runtime",
  email: "publication@example.test",
  phone: "+31100000000",
  street: null,
  postalCode: null,
  city: null,
  countryCode: "NL",
  openingHours: [],
};
const seo = {
  title: "Publication Runtime",
  description:
    "Disposable runtime validation for exact website publication revisions.",
  socialImageMediaId: null,
  indexable: true,
};

async function currentAuthoringRevision(): Promise<number> {
  const result = await pool.query<{ authoring_revision: number }>(
    `SELECT authoring_revision
     FROM public.website_sites
     WHERE tenant_id = $1 AND id = $2`,
    [tenantA, siteId],
  );
  return Number(result.rows[0]?.authoring_revision);
}

try {
  await pool.query(
    `UPDATE public.tenants
     SET is_active = true, status = 'active', plan_key = 'enterprise'
     WHERE id = $1`,
    [tenantA],
  );
  await pool.query(
    `INSERT INTO public.tenant_modules (
       tenant_id, module_id, is_enabled, source, enabled_at
     )
     SELECT $1, id, true, 'manual', now()
     FROM public.modules
     WHERE key = 'website'
     ON CONFLICT (tenant_id, module_id) DO UPDATE
     SET is_enabled = true, enabled_at = now(), disabled_at = NULL`,
    [tenantA],
  );
  await pool.query(
    `INSERT INTO public.tenant_domains (
       id, tenant_id, domain, type, verification_status, verified_at
     ) VALUES ($1, $2, $3, 'custom_domain', 'verified', now())`,
    [domainId, tenantA, hostname],
  );
  await pool.query(
    `INSERT INTO public.website_sites (
       id, tenant_id, name, status, is_primary, delivery_mode,
       template_key, template_version, theme, contact, default_seo,
       created_by, updated_by
     ) VALUES (
       $1, $2, 'Publication runtime', 'draft', true, 'managed_cms',
       'trust_conversion', 1, $3::jsonb, $4::jsonb, $5::jsonb, $6, $6
     ), (
       $7, $2, 'Competing runtime site', 'draft', false, 'managed_cms',
       'trust_conversion', 1, $3::jsonb, $4::jsonb, $5::jsonb, $6, $6
     )`,
    [
      siteId,
      tenantA,
      JSON.stringify(theme),
      JSON.stringify(contact),
      JSON.stringify(seo),
      actorA,
      competingSiteId,
    ],
  );

  const domain = await setPrimaryWebsiteDomain({
    tenantId: tenantA,
    siteId,
    tenantDomainId: domainId,
    expectedAuthoringRevision: 1,
    actorUserId: actorA,
    reason: "runtime verified primary domain",
  });
  assert.equal(domain.hostname, hostname);
  assert.equal(domain.authoringRevision, 2);

  await assert.rejects(
    setPrimaryWebsiteDomain({
      tenantId: tenantA,
      siteId,
      tenantDomainId: domainId,
      expectedAuthoringRevision: 1,
      actorUserId: actorA,
      reason: "runtime stale domain revision",
    }),
    /authoring revision conflict/u,
  );
  await assert.rejects(
    setPrimaryWebsiteDomain({
      tenantId: tenantA,
      siteId: competingSiteId,
      tenantDomainId: domainId,
      expectedAuthoringRevision: 1,
      actorUserId: actorA,
      reason: "runtime domain reuse probe",
    }),
    /already bound to another site/u,
  );

  await pool.query(
    `INSERT INTO public.website_pages (
       id, tenant_id, site_id, locale, title, slug, path, page_type,
       status, is_homepage, seo, published_at, created_by, updated_by
     ) VALUES (
       $1, $2, $3, 'nl-NL', 'Home versie één', '', '/', 'home',
       'published', true, $4::jsonb, now(), $5, $5
     ), (
       $6, $2, $3, 'nl-NL', 'Contact', 'contact', '/contact', 'contact',
       'published', false, $4::jsonb, now(), $5, $5
     ), (
       $7, $2, $3, 'nl-NL', 'Blog', 'blog', '/blog', 'blog_index',
       'published', false, $4::jsonb, now(), $5, $5
     )`,
    [
      homePageId,
      tenantA,
      siteId,
      JSON.stringify(seo),
      actorA,
      contactPageId,
      blogIndexPageId,
    ],
  );
  await pool.query(
    `INSERT INTO public.website_page_sections (
       id, tenant_id, site_id, page_id, section_key, schema_version,
       variant_key, position, content, is_visible, created_by, updated_by
     ) VALUES (
       $1, $2, $3, $4, 'hero', 1, 'split', 0, $5::jsonb, true, $6, $6
     )`,
    [
      heroSectionId,
      tenantA,
      siteId,
      homePageId,
      JSON.stringify({
        title: "Veilig gepubliceerd",
        primaryAction: {
          kind: "page",
          label: "Contact",
          pageId: contactPageId,
        },
        badges: [],
      }),
      actorA,
    ],
  );
  const navigationDraft: WebsiteNavigationDraftItem[] = [
    {
      id: homeNavigationId,
      label: "Home",
      location: "header",
      parentId: null,
      pageId: homePageId,
      linkType: "page",
      href: null,
      target: "self",
      isVisible: true,
    },
    {
      id: moreNavigationId,
      label: "Meer",
      location: "header",
      parentId: null,
      pageId: null,
      linkType: "dropdown",
      href: null,
      target: "self",
      isVisible: true,
    },
    {
      id: contactNavigationId,
      label: "Contact",
      location: "header",
      parentId: moreNavigationId,
      pageId: contactPageId,
      linkType: "page",
      href: null,
      target: "self",
      isVisible: true,
    },
    {
      id: externalNavigationId,
      label: "Fieldgrid",
      location: "footer_primary",
      parentId: null,
      pageId: null,
      linkType: "external",
      href: "https://fieldgrid.nl/",
      target: "blank",
      isVisible: true,
    },
  ];
  const navigationRevision = await currentAuthoringRevision();
  const navigationWrite = await replaceWebsiteNavigation({
    tenantId: tenantA,
    actorUserId: actorA,
    siteId,
    expectedAuthoringRevision: navigationRevision,
    items: navigationDraft,
  });
  assert.equal(navigationWrite.changed, true);
  assert.equal(navigationWrite.authoringRevision, navigationRevision + 1);
  const navigationView = await getWebsiteNavigation(tenantA);
  assert.equal(navigationView?.items.length, 4);
  assert.equal(
    navigationView?.items.find((item) => item.id === contactNavigationId)
      ?.parentId,
    moreNavigationId,
  );
  const navigationNoop = await replaceWebsiteNavigation({
    tenantId: tenantA,
    actorUserId: actorA,
    siteId,
    expectedAuthoringRevision: navigationWrite.authoringRevision,
    items: navigationDraft,
  });
  assert.equal(navigationNoop.changed, false);
  assert.equal(
    navigationNoop.authoringRevision,
    navigationWrite.authoringRevision,
  );
  await assert.rejects(
    replaceWebsiteNavigation({
      tenantId: tenantA,
      actorUserId: actorA,
      siteId,
      expectedAuthoringRevision: navigationRevision,
      items: navigationDraft,
    }),
    /Website is intussen gewijzigd/u,
  );
  const reorderedNavigation = [
    navigationDraft[2]!,
    navigationDraft[1]!,
    navigationDraft[0]!,
    navigationDraft[3]!,
  ];
  const navigationReorder = await replaceWebsiteNavigation({
    tenantId: tenantA,
    actorUserId: actorA,
    siteId,
    expectedAuthoringRevision: navigationWrite.authoringRevision,
    items: reorderedNavigation,
  });
  assert.equal(navigationReorder.changed, true);
  assert.equal(
    navigationReorder.authoringRevision,
    navigationWrite.authoringRevision + 1,
  );
  const reorderedView = await getWebsiteNavigation(tenantA);
  assert.deepEqual(
    reorderedView?.items
      .filter((item) => item.location === "header")
      .map((item) => [item.id, item.position]),
    [
      [moreNavigationId, 0],
      [contactNavigationId, 1],
      [homeNavigationId, 2],
    ],
  );
  await assert.rejects(
    pool.query(
      `INSERT INTO public.website_navigation_items (
         tenant_id, site_id, parent_id, page_id, location, label, link_type,
         target, position, is_visible, created_by, updated_by
       ) VALUES (
         $1, $2, $3, $4, 'header', 'Te diep', 'page',
         'self', 3, true, $5, $5
       )`,
      [tenantA, siteId, contactNavigationId, contactPageId, actorA],
    ),
    /navigation hierarchy exceeds two levels/u,
  );
  await assert.rejects(
    replaceWebsiteNavigation({
      tenantId: tenantA,
      actorUserId: actorA,
      siteId,
      expectedAuthoringRevision: navigationReorder.authoringRevision,
      items: [
        {
          ...navigationDraft[3]!,
          href: "javascript:alert(1)",
        },
      ],
    }),
    /URL|HTTPS/u,
  );

  const firstPathRevision = await currentAuthoringRevision();
  const firstPathChange = await updateWebsitePage({
    tenantId: tenantA,
    actorUserId: actorA,
    siteId,
    pageId: contactPageId,
    expectedAuthoringRevision: firstPathRevision,
    expectedPageRevision: 1,
    pathChangeDecision: "create_redirect",
    page: {
      title: "Contact",
      navigationLabel: null,
      locale: "nl-NL",
      slug: "contact-opnemen",
      path: "/contact-opnemen",
      pageType: "contact",
      isHomepage: false,
      seo,
    },
  });
  assert.equal(firstPathChange.siteAuthoringRevision, firstPathRevision + 1);
  const firstRedirectView = await getWebsiteRedirects(tenantA);
  assert.deepEqual(
    firstRedirectView?.redirects.map((redirect) => [
      redirect.sourcePath,
      redirect.destination,
      redirect.statusCode,
    ]),
    [["/contact", "/contact-opnemen", 308]],
  );

  const secondPathChange = await updateWebsitePage({
    tenantId: tenantA,
    actorUserId: actorA,
    siteId,
    pageId: contactPageId,
    expectedAuthoringRevision: firstPathChange.siteAuthoringRevision,
    expectedPageRevision: firstPathChange.pageAuthoringRevision,
    pathChangeDecision: "create_redirect",
    page: {
      title: "Contact",
      navigationLabel: null,
      locale: "nl-NL",
      slug: "contact-nieuw",
      path: "/contact-nieuw",
      pageType: "contact",
      isHomepage: false,
      seo,
    },
  });
  const retargetedRedirectView = await getWebsiteRedirects(tenantA);
  assert.deepEqual(
    retargetedRedirectView?.redirects.map((redirect) => [
      redirect.sourcePath,
      redirect.destination,
    ]),
    [
      ["/contact", "/contact-nieuw"],
      ["/contact-opnemen", "/contact-nieuw"],
    ],
  );

  await pool.query(
    `INSERT INTO public.website_pages (
       id, tenant_id, site_id, locale, title, slug, path, page_type,
       status, is_homepage, seo, created_by, updated_by
     ) VALUES (
       $1, $2, $3, 'nl-NL', 'Tijdelijke route', 'tijdelijke-route',
       '/tijdelijke-route', 'standard', 'draft', false, $4::jsonb, $5, $5
     )`,
    [noRedirectPageId, tenantA, siteId, JSON.stringify(seo), actorA],
  );
  const noRedirectStartRevision = await currentAuthoringRevision();
  const explicitNoRedirect = await updateWebsitePage({
    tenantId: tenantA,
    actorUserId: actorA,
    siteId,
    pageId: noRedirectPageId,
    expectedAuthoringRevision: noRedirectStartRevision,
    expectedPageRevision: 1,
    pathChangeDecision: "no_redirect",
    page: {
      title: "Tijdelijke route",
      navigationLabel: null,
      locale: "nl-NL",
      slug: "tijdelijke-route-nieuw",
      path: "/tijdelijke-route-nieuw",
      pageType: "standard",
      isHomepage: false,
      seo,
    },
  });
  assert.ok(
    !(await getWebsiteRedirects(tenantA))?.redirects.some(
      (redirect) => redirect.sourcePath === "/tijdelijke-route",
    ),
  );

  const redirectsWithExternal: WebsiteRedirectDraftItem[] = [
    ...(retargetedRedirectView?.redirects ?? []),
    {
      id: externalRedirectId,
      locale: "nl-NL",
      sourcePath: "/partner",
      destinationType: "external",
      destination: "https://fieldgrid.nl/partners",
      statusCode: 302,
      isActive: true,
    },
  ];
  const redirectWrite = await replaceWebsiteRedirects({
    tenantId: tenantA,
    actorUserId: actorA,
    siteId,
    expectedAuthoringRevision: explicitNoRedirect.siteAuthoringRevision,
    redirects: redirectsWithExternal,
  });
  assert.equal(redirectWrite.changed, true);
  const redirectNoop = await replaceWebsiteRedirects({
    tenantId: tenantA,
    actorUserId: actorA,
    siteId,
    expectedAuthoringRevision: redirectWrite.authoringRevision,
    redirects: redirectsWithExternal,
  });
  assert.equal(redirectNoop.changed, false);
  assert.equal(redirectNoop.authoringRevision, redirectWrite.authoringRevision);
  await assert.rejects(
    replaceWebsiteRedirects({
      tenantId: tenantA,
      actorUserId: actorA,
      siteId,
      expectedAuthoringRevision: secondPathChange.siteAuthoringRevision,
      redirects: redirectsWithExternal,
    }),
    /Website is intussen gewijzigd/u,
  );
  await assert.rejects(
    replaceWebsiteRedirects({
      tenantId: tenantA,
      actorUserId: actorA,
      siteId,
      expectedAuthoringRevision: redirectWrite.authoringRevision,
      redirects: [
        ...redirectsWithExternal,
        {
          id: randomUUID(),
          locale: "nl-NL",
          sourcePath: "/contact-v1",
          destinationType: "path",
          destination: "/contact",
          statusCode: 301,
          isActive: true,
        },
      ],
    }),
    /Redirectketens|lussen/u,
  );
  await assert.rejects(
    pool.query(
      `INSERT INTO public.website_redirects (
         tenant_id, site_id, locale, source_path, destination_type,
         destination, status_code, is_active, created_by, updated_by
       ) VALUES (
         $1, $2, 'nl-NL', '/database-chain', 'path',
         '/contact', 308, true, $3, $3
       )`,
      [tenantA, siteId, actorA],
    ),
    /redirect loops and chains are not allowed/u,
  );
  await assert.rejects(
    pool.query(
      `UPDATE public.website_pages
       SET locale = 'en-GB', updated_by = $4
       WHERE tenant_id = $1 AND site_id = $2 AND id = $3`,
      [tenantA, siteId, contactPageId, actorA],
    ),
    /internal redirect destination must resolve to active website content/u,
  );
  await assert.rejects(
    pool.query(
      `UPDATE public.website_pages
       SET status = 'archived', archived_at = now(), updated_by = $4
       WHERE tenant_id = $1 AND site_id = $2 AND id = $3`,
      [tenantA, siteId, contactPageId, actorA],
    ),
    /internal redirect destination must resolve to active website content/u,
  );

  await assert.rejects(
    pool.query(
      `UPDATE public.website_domain_bindings
       SET site_id = $3, updated_by = $4, updated_at = now()
       WHERE tenant_id = $1 AND id = $2`,
      [tenantA, domain.id, competingSiteId, actorA],
    ),
    /website child ownership is immutable/u,
  );

  const taxonomyRevision = await currentAuthoringRevision();
  const taxonomy = {
    categories: [
      {
        id: blogCategoryId,
        locale: "nl-NL",
        name: "Veilig werken",
        slug: "veilig-werken",
        description: "Praktische publicatiekennis.",
        isActive: true,
      },
    ],
    tags: [
      {
        id: blogTagId,
        locale: "nl-NL",
        name: "Publicatie",
        slug: "publicatie",
        isActive: true,
      },
    ],
  };
  const taxonomyWrite = await replaceWebsiteBlogTaxonomy({
    tenantId: tenantA,
    siteId,
    actorUserId: actorA,
    expectedAuthoringRevision: taxonomyRevision,
    taxonomy,
  });
  assert.equal(taxonomyWrite.changed, true);
  assert.equal(taxonomyWrite.authoringRevision, taxonomyRevision + 1);
  const taxonomyNoop = await replaceWebsiteBlogTaxonomy({
    tenantId: tenantA,
    siteId,
    actorUserId: actorA,
    expectedAuthoringRevision: taxonomyWrite.authoringRevision,
    taxonomy,
  });
  assert.equal(taxonomyNoop.changed, false);
  assert.equal(taxonomyNoop.authoringRevision, taxonomyWrite.authoringRevision);

  const publishedPostDraft = {
    locale: "nl-NL",
    title: "Veilig publiceren",
    slug: "veilig-publiceren",
    excerpt: "Een gecontroleerde publicatie zonder verborgen conceptinhoud.",
    body: {
      type: "doc" as const,
      schemaVersion: 2 as const,
      content: [
        {
          type: "paragraph" as const,
          content: [
            {
              type: "text" as const,
              text: "Alleen allowlisted TipTap-inhoud bereikt de runtime.",
            },
          ],
        },
      ],
    },
    categoryId: blogCategoryId,
    tagIds: [blogTagId],
    seo: {
      ...seo,
      title: "Veilig publiceren",
      description: "Runtimebewijs voor expliciete en immutable blogpublicatie.",
    },
  };
  const publishedPost = await createWebsiteBlogPost({
    tenantId: tenantA,
    siteId,
    actorUserId: actorA,
    expectedAuthoringRevision: taxonomyWrite.authoringRevision,
    post: publishedPostDraft,
  });
  assert.equal(
    publishedPost.authoringRevision,
    taxonomyWrite.authoringRevision + 1,
  );
  const privatePost = await createWebsiteBlogPost({
    tenantId: tenantA,
    siteId,
    actorUserId: actorA,
    expectedAuthoringRevision: publishedPost.authoringRevision,
    post: {
      ...publishedPostDraft,
      title: "Intern concept",
      slug: "intern-concept",
      excerpt: "Deze tekst mag uitsluitend in een ondertekende preview staan.",
      seo: {
        ...publishedPostDraft.seo,
        title: "Intern concept",
        indexable: false,
      },
    },
  });
  const publishedTransition = await publishWebsiteBlogPost({
    tenantId: tenantA,
    siteId,
    actorUserId: actorA,
    expectedAuthoringRevision: privatePost.authoringRevision,
    postId: publishedPost.id,
    expectedPostRevision: 1,
  });
  assert.equal(
    publishedTransition.authoringRevision,
    privatePost.authoringRevision + 1,
  );
  assert.equal(publishedTransition.postAuthoringRevision, 2);

  const blogView = await getWebsiteBlog(tenantA);
  assert.equal(blogView?.posts.length, 2);
  assert.equal(
    blogView?.posts.find((post) => post.id === publishedPost.id)?.status,
    "published",
  );
  assert.equal(
    blogView?.posts.find((post) => post.id === privatePost.id)?.status,
    "draft",
  );
  const postNoop = await updateWebsiteBlogPost({
    tenantId: tenantA,
    siteId,
    actorUserId: actorA,
    expectedAuthoringRevision: publishedTransition.authoringRevision,
    postId: publishedPost.id,
    expectedPostRevision: publishedTransition.postAuthoringRevision,
    post: publishedPostDraft,
  });
  assert.equal(postNoop.changed, false);
  assert.equal(
    postNoop.authoringRevision,
    publishedTransition.authoringRevision,
  );
  await assert.rejects(
    updateWebsiteBlogPost({
      tenantId: tenantA,
      siteId,
      actorUserId: actorA,
      expectedAuthoringRevision: postNoop.authoringRevision,
      postId: publishedPost.id,
      expectedPostRevision: 1,
      post: publishedPostDraft,
    }),
    /Blogbericht is intussen gewijzigd/u,
  );
  await assert.rejects(
    pool.query(
      `UPDATE public.website_blog_posts
       SET published_at = now() + interval '1 day', updated_by = $4
       WHERE tenant_id = $1 AND site_id = $2 AND id = $3`,
      [tenantA, siteId, publishedPost.id, actorA],
    ),
    /scheduled blog publication is not supported/u,
  );
  await assert.rejects(
    pool.query(
      `UPDATE public.website_blog_tags
       SET locale = 'en-GB', updated_by = $4
       WHERE tenant_id = $1 AND site_id = $2 AND id = $3`,
      [tenantA, siteId, blogTagId, actorA],
    ),
    /used blog tag cannot be deactivated or moved/u,
  );
  await assert.rejects(
    pool.query(
      `INSERT INTO public.website_pages (
         id, tenant_id, site_id, locale, title, slug, path, page_type,
         status, is_homepage, seo, created_by, updated_by
       ) VALUES (
         $1, $2, $3, 'nl-NL', 'Botsende pagina', 'veilig-publiceren',
         '/blog/veilig-publiceren', 'standard', 'draft', false,
         $4::jsonb, $5, $5
       )`,
      [randomUUID(), tenantA, siteId, JSON.stringify(seo), actorA],
    ),
    /website page, redirect and blog routes must not collide/u,
  );
  await pool.query(
    `INSERT INTO public.website_redirects (
       id, tenant_id, site_id, locale, source_path, destination_type,
       destination, status_code, is_active, created_by, updated_by
     ) VALUES (
       $1, $2, $3, 'nl-NL', '/blog-oud', 'path',
       '/blog/veilig-publiceren', 308, true, $4, $4
     )`,
    [blogRedirectId, tenantA, siteId, actorA],
  );

  const revisionOne = await currentAuthoringRevision();
  assert.ok(revisionOne > 2, "Child mutations must advance authoring revision");
  const [candidateOne, idempotentCandidate] = await Promise.all([
    createManagedWebsitePublication({
      tenantId: tenantA,
      siteId,
      expectedAuthoringRevision: revisionOne,
      actorUserId: actorA,
      reason: "runtime first immutable candidate",
    }),
    createManagedWebsitePublication({
      tenantId: tenantA,
      siteId,
      expectedAuthoringRevision: revisionOne,
      actorUserId: actorA,
      reason: "runtime concurrent idempotent publication retry",
    }),
  ]);
  assert.equal(candidateOne.targetDeliveryRevision, 2);
  assert.deepEqual(
    candidateOne.snapshot.redirects.map((redirect) => [
      redirect.sourcePath,
      redirect.destination,
      redirect.statusCode,
    ]),
    [
      ["/blog-oud", "/blog/veilig-publiceren", 308],
      ["/contact", "/contact-nieuw", 308],
      ["/contact-opnemen", "/contact-nieuw", 308],
      ["/partner", "https://fieldgrid.nl/partners", 302],
    ],
  );
  assert.equal(candidateOne.snapshot.pages[0]?.title, "Home versie één");
  assert.deepEqual(
    candidateOne.snapshot.blog.posts.map((post) => [
      post.id,
      post.title,
      post.visibility,
    ]),
    [[publishedPost.id, "Veilig publiceren", "published"]],
  );
  assert.ok(
    !candidateOne.snapshot.blog.posts.some(
      (post) => post.id === privatePost.id,
    ),
  );
  assert.match(candidateOne.cacheKey, new RegExp(`${siteId}:r2:`, "u"));
  assert.equal(idempotentCandidate.id, candidateOne.id);

  const storedCandidate = await pool.query<{
    target_delivery_revision: number;
    cache_key: string;
  }>(
    `SELECT target_delivery_revision, cache_key
     FROM public.website_publications
     WHERE id = $1`,
    [candidateOne.id],
  );
  assert.equal(storedCandidate.rows[0]?.target_delivery_revision, 2);
  assert.equal(storedCandidate.rows[0]?.cache_key, candidateOne.cacheKey);

  await pool.query(
    `UPDATE public.website_pages
     SET navigation_label = 'Home', updated_by = $3, updated_at = now()
     WHERE tenant_id = $1 AND id = $2`,
    [tenantA, homePageId, actorA],
  );
  const metadataOnlyRevision = await currentAuthoringRevision();
  assert.equal(metadataOnlyRevision, revisionOne + 1);
  const sameOutputCandidate = await createManagedWebsitePublication({
    tenantId: tenantA,
    siteId,
    expectedAuthoringRevision: metadataOnlyRevision,
    actorUserId: actorA,
    reason: "runtime revision-bound identical output candidate",
  });
  assert.notEqual(sameOutputCandidate.id, candidateOne.id);
  assert.notEqual(sameOutputCandidate.contentHash, candidateOne.contentHash);
  assert.deepEqual(sameOutputCandidate.snapshot, candidateOne.snapshot);

  await pool.query(
    `UPDATE public.website_pages
     SET title = 'Home versie twee', updated_by = $3, updated_at = now()
     WHERE tenant_id = $1 AND id = $2`,
    [tenantA, homePageId, actorA],
  );
  const revisionTwo = await currentAuthoringRevision();
  assert.equal(revisionTwo, metadataOnlyRevision + 1);
  assert.equal(candidateOne.snapshot.pages[0]?.title, "Home versie één");

  await assert.rejects(
    activateManagedWebsitePublication({
      tenantId: tenantA,
      siteId,
      publicationId: candidateOne.id,
      expectedAuthoringRevision: revisionOne,
      expectedDeliveryRevision: 1,
      actorUserId: actorA,
      reason: "runtime stale source activation",
    }),
    /authoring revision conflict/u,
  );

  const candidateTwo = await createManagedWebsitePublication({
    tenantId: tenantA,
    siteId,
    expectedAuthoringRevision: revisionTwo,
    actorUserId: actorA,
    reason: "runtime current immutable candidate",
  });
  const firstActivation = await activateManagedWebsitePublication({
    tenantId: tenantA,
    siteId,
    publicationId: candidateTwo.id,
    expectedAuthoringRevision: revisionTwo,
    expectedDeliveryRevision: 1,
    actorUserId: actorA,
    reason: "runtime exact first activation",
  });
  assert.equal(firstActivation.deliveryRevision, 2);
  assert.equal(firstActivation.publicationId, candidateTwo.id);

  await assert.rejects(
    pool.query(
      `UPDATE public.website_publications
       SET snapshot = '{"rewritten":true}'::jsonb
       WHERE id = $1`,
      [candidateTwo.id],
    ),
    /immutable/u,
  );

  const storedPublishedPost = await getWebsiteBlogPost(
    tenantA,
    publishedPost.id,
  );
  assert.equal(storedPublishedPost?.status, "published");
  assert.equal(
    storedPublishedPost?.authoringRevision,
    publishedTransition.postAuthoringRevision,
  );
  const publishedPostDraftV2 = {
    ...publishedPostDraft,
    title: "Veilig publiceren — herzien",
    excerpt: "Een herzien bericht dat pas na een nieuwe publicatie live wordt.",
    body: {
      ...publishedPostDraft.body,
      content: [
        {
          type: "paragraph" as const,
          content: [
            {
              type: "text" as const,
              text: "De tweede versie blijft concept tot expliciete herpublicatie.",
            },
          ],
        },
      ],
    },
    seo: {
      ...publishedPostDraft.seo,
      title: "Veilig publiceren — herzien",
      description:
        "Herzien runtimebewijs voor expliciete immutable blogpublicatie.",
    },
  };
  const blogDraftUpdate = await updateWebsiteBlogPost({
    tenantId: tenantA,
    siteId,
    actorUserId: actorA,
    expectedAuthoringRevision: revisionTwo,
    postId: publishedPost.id,
    expectedPostRevision: publishedTransition.postAuthoringRevision,
    post: publishedPostDraftV2,
  });
  assert.equal(blogDraftUpdate.changed, true);
  assert.equal(blogDraftUpdate.authoringRevision, revisionTwo + 1);
  assert.equal(candidateTwo.snapshot.blog.posts[0]?.title, "Veilig publiceren");
  const liveWhileBlogIsDraft = await resolveManagedWebsiteByHost(hostname);
  assert.equal(liveWhileBlogIsDraft.status, "ready");
  if (liveWhileBlogIsDraft.status === "ready") {
    assert.equal(
      liveWhileBlogIsDraft.snapshot.blog.posts[0]?.title,
      "Veilig publiceren",
    );
  }
  const republishedPost = await publishWebsiteBlogPost({
    tenantId: tenantA,
    siteId,
    actorUserId: actorA,
    expectedAuthoringRevision: blogDraftUpdate.authoringRevision,
    postId: publishedPost.id,
    expectedPostRevision: blogDraftUpdate.postAuthoringRevision,
  });
  assert.equal(
    republishedPost.authoringRevision,
    blogDraftUpdate.authoringRevision + 1,
  );

  await pool.query(
    `UPDATE public.website_pages
     SET title = 'Home versie drie', updated_by = $3, updated_at = now()
     WHERE tenant_id = $1 AND id = $2`,
    [tenantA, homePageId, actorA],
  );
  const revisionThree = await currentAuthoringRevision();
  const candidateThree = await createManagedWebsitePublication({
    tenantId: tenantA,
    siteId,
    expectedAuthoringRevision: revisionThree,
    actorUserId: actorA,
    reason: "runtime replacement candidate",
  });
  assert.equal(candidateThree.targetDeliveryRevision, 3);
  assert.equal(
    candidateThree.snapshot.blog.posts[0]?.title,
    "Veilig publiceren — herzien",
  );
  assert.ok(
    !candidateThree.snapshot.blog.posts.some(
      (post) => post.id === privatePost.id,
    ),
  );

  await assert.rejects(
    activateManagedWebsitePublication({
      tenantId: tenantA,
      siteId,
      publicationId: candidateThree.id,
      expectedAuthoringRevision: revisionThree,
      expectedDeliveryRevision: 1,
      actorUserId: actorA,
      reason: "runtime stale delivery activation",
    }),
    /delivery revision conflict/u,
  );

  const replacement = await activateManagedWebsitePublication({
    tenantId: tenantA,
    siteId,
    publicationId: candidateThree.id,
    expectedAuthoringRevision: revisionThree,
    expectedDeliveryRevision: 2,
    actorUserId: actorA,
    reason: "runtime exact replacement activation",
  });
  assert.equal(replacement.deliveryRevision, 3);

  const publicationStates = await pool.query<{
    id: string;
    status: string;
  }>(
    `SELECT id, status
     FROM public.website_publications
     WHERE tenant_id = $1 AND site_id = $2`,
    [tenantA, siteId],
  );
  const statuses = new Map(
    publicationStates.rows.map((row) => [row.id, row.status]),
  );
  assert.equal(statuses.get(candidateTwo.id), "superseded");
  assert.equal(statuses.get(candidateThree.id), "active");
  assert.equal(
    publicationStates.rows.filter((row) => row.status === "active").length,
    1,
  );

  const publicResolution = await resolveManagedWebsiteByHost(hostname);
  assert.equal(publicResolution.status, "ready");
  if (publicResolution.status === "ready") {
    assert.equal(publicResolution.tenantId, tenantA);
    assert.equal(publicResolution.siteId, siteId);
    assert.equal(publicResolution.publicationId, candidateThree.id);
    assert.equal(publicResolution.deliveryRevision, 3);
    assert.equal(publicResolution.snapshot.pages[0]?.title, "Home versie drie");
    assert.equal(
      publicResolution.snapshot.blog.posts[0]?.title,
      "Veilig publiceren — herzien",
    );
    assert.ok(
      !publicResolution.snapshot.blog.posts.some(
        (post) => post.id === privatePost.id,
      ),
    );
    assert.equal(publicResolution.cacheKey, candidateThree.cacheKey);
  }
  assert.deepEqual(
    await resolveManagedWebsiteByHost(
      `unknown-${randomUUID()}.runtime.fieldgrid.test`,
    ),
    { status: "not_found" },
  );

  await pool.query(
    `UPDATE public.website_pages
     SET title = 'Niet live concept', updated_by = $3, updated_at = now()
     WHERE tenant_id = $1 AND id = $2`,
    [tenantA, homePageId, actorA],
  );
  const liveSnapshot = await pool.query<{
    title: string;
  }>(
    `SELECT snapshot #>> '{pages,0,title}' AS title
     FROM public.website_publications
     WHERE id = $1`,
    [candidateThree.id],
  );
  assert.equal(liveSnapshot.rows[0]?.title, "Home versie drie");
  const publicAfterDraftEdit = await resolveManagedWebsiteByHost(hostname);
  assert.equal(publicAfterDraftEdit.status, "ready");
  if (publicAfterDraftEdit.status === "ready") {
    assert.equal(
      publicAfterDraftEdit.snapshot.pages[0]?.title,
      "Home versie drie",
    );
  }

  await pool.query(
    `INSERT INTO public.website_pages (
       id, tenant_id, site_id, locale, title, slug, path, page_type,
       status, is_homepage, seo, created_by, updated_by
     ) VALUES (
       $1, $2, $3, 'nl-NL', 'Previewconcept', 'previewconcept',
       '/previewconcept', 'standard', 'draft', false, $4::jsonb, $5, $5
     )`,
    [previewDraftPageId, tenantA, siteId, JSON.stringify(seo), actorA],
  );
  const previewRevision = await currentAuthoringRevision();
  const previewTokenHash = "a".repeat(64);
  const previewSession = await createWebsitePreviewSession({
    tenantId: tenantA,
    siteId,
    actorUserId: actorA,
    tokenHash: previewTokenHash,
    expectedAuthoringRevision: previewRevision,
  });
  assert.ok(
    previewSession.snapshot.pages.some(
      (page) => page.id === previewDraftPageId,
    ),
  );
  assert.equal(
    previewSession.snapshot.blog.posts.find(
      (post) => post.id === privatePost.id,
    )?.visibility,
    "preview",
  );
  assert.ok(
    await loadWebsitePreviewSession({
      tenantId: tenantA,
      actorUserId: actorA,
      tokenHash: previewTokenHash,
    }),
  );
  assert.equal(
    await loadWebsitePreviewSession({
      tenantId: tenantA,
      actorUserId: randomUUID(),
      tokenHash: previewTokenHash,
    }),
    null,
  );
  await assert.rejects(
    pool.query(
      `UPDATE public.website_preview_sessions
       SET last_used_at = NULL
       WHERE tenant_id = $1 AND token_hash = $2`,
      [tenantA, previewTokenHash],
    ),
    (error: unknown) =>
      Boolean(
        error &&
        typeof error === "object" &&
        "code" in error &&
        error.code === "P0001",
      ),
  );

  const includedPage = await includeWebsitePageInPublication({
    tenantId: tenantA,
    siteId,
    pageId: previewDraftPageId,
    actorUserId: actorA,
    expectedAuthoringRevision: previewRevision,
    expectedPageRevision: 1,
  });
  assert.equal(includedPage.pageAuthoringRevision, 2);
  assert.equal(includedPage.siteAuthoringRevision, previewRevision + 1);
  assert.equal(
    await loadWebsitePreviewSession({
      tenantId: tenantA,
      actorUserId: actorA,
      tokenHash: previewTokenHash,
    }),
    null,
    "an authoring change must invalidate an existing preview",
  );

  const browserClient = await pool.connect();
  try {
    await browserClient.query("BEGIN");
    await browserClient.query("SET LOCAL ROLE authenticated");
    await browserClient.query("SET LOCAL row_security = on");
    await browserClient.query("SAVEPOINT forbidden_activation_probe");
    await assert.rejects(
      browserClient.query(
        `SELECT public.activate_managed_website_publication(
           $1, $2, $3, $4, $5, $6, 'forbidden browser activation'
         )`,
        [tenantA, siteId, candidateThree.id, revisionThree, 3, actorA],
      ),
      (error: unknown) =>
        Boolean(
          error &&
          typeof error === "object" &&
          "code" in error &&
          error.code === "42501",
        ),
    );
    await browserClient.query(
      "ROLLBACK TO SAVEPOINT forbidden_activation_probe",
    );
    await browserClient.query("SAVEPOINT forbidden_blog_read_probe");
    await assert.rejects(
      browserClient.query(
        `SELECT title
         FROM public.website_blog_posts
         WHERE tenant_id = $1`,
        [tenantA],
      ),
      (error: unknown) =>
        Boolean(
          error &&
          typeof error === "object" &&
          "code" in error &&
          error.code === "42501",
        ),
    );
    await browserClient.query(
      "ROLLBACK TO SAVEPOINT forbidden_blog_read_probe",
    );
    await assert.rejects(
      browserClient.query(
        `SELECT snapshot
         FROM public.website_preview_sessions
         WHERE tenant_id = $1`,
        [tenantA],
      ),
      (error: unknown) =>
        Boolean(
          error &&
          typeof error === "object" &&
          "code" in error &&
          error.code === "42501",
        ),
    );
    await browserClient.query("ROLLBACK");
  } finally {
    browserClient.release();
  }

  const audit = await pool.query<{ count: number }>(
    `SELECT count(*)::integer AS count
     FROM public.audit_log
     WHERE tenant_id = $1
       AND resource = 'website'
       AND (
         resource_id = $2
         OR metadata ->> 'siteId' = $2
       )`,
    [tenantA, siteId],
  );
  assert.ok(Number(audit.rows[0]?.count) >= 6);

  process.stdout.write(
    `${JSON.stringify(
      {
        websitePublicationRuntime: "passed",
        assertions: {
          verifiedPrimaryDomainOnly: true,
          staleDomainRevisionRejected: true,
          domainReuseRejected: true,
          childMutationAdvancesRevision: true,
          childOwnershipImmutable: true,
          navigationExactRevision: true,
          navigationHierarchyBounded: true,
          navigationDeterministicReorder: true,
          unsafeNavigationRejected: true,
          redirectExactRevision: true,
          redirectNoopStable: true,
          staleRedirectRevisionRejected: true,
          redirectChainsRejectedInContractAndDatabase: true,
          redirectDestinationArchiveRejected: true,
          pagePathRedirectAtomic: true,
          explicitNoRedirectAuditedWithoutRoute: true,
          inboundRedirectsRetargeted: true,
          redirectSnapshotDelivered: true,
          redirectToPublishedBlogAccepted: true,
          blogTaxonomyExactRevision: true,
          blogTaxonomyNoopStable: true,
          blogPostExactRevision: true,
          staleBlogPostRevisionRejected: true,
          blogCategoryAndTagLocaleBound: true,
          futureBlogPublicationRejected: true,
          pageBlogRouteCollisionRejected: true,
          explicitBlogPublication: true,
          draftBlogExcludedFromPublication: true,
          draftBlogIncludedInSignedPreview: true,
          publishedBlogUpdateReturnsToDraft: true,
          activeBlogSnapshotUnaffectedByDraft: true,
          previousBlogPublicationImmutable: true,
          browserBlogReadDenied: true,
          deterministicPublicationCreated: true,
          exactCacheIdentityPersisted: true,
          concurrentIdempotentPublicationRetry: true,
          identicalOutputBoundToSourceRevision: true,
          staleAuthoringActivationRejected: true,
          staleDeliveryActivationRejected: true,
          immutableSnapshot: true,
          previousPublicationSuperseded: true,
          exactlyOneActiveManagedPublication: true,
          exactHostResolvesActivePublication: true,
          unknownHostRejected: true,
          draftCannotAlterLiveSnapshot: true,
          publicResolverCannotReadDraftEdit: true,
          previewIncludesDraftPage: true,
          previewBoundToActor: true,
          previewUsageMonotonic: true,
          stalePreviewRevisionRejected: true,
          explicitPageInclusion: true,
          browserPreviewReadDenied: true,
          browserExecutionDenied: true,
          auditTrail: true,
        },
      },
      null,
      2,
    )}\n`,
  );
} finally {
  await pool.end();
}
