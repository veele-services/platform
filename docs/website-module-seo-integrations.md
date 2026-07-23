# Fieldgrid website module — SEO and controlled integrations

Date: 23 July 2026
Status: Phase 7 implemented; not deployed

## Trust boundary

Managed websites render SEO only from the active immutable publication
snapshot. Authoring tables, drafts, arbitrary HTML, arbitrary scripts and raw
JSON-LD are never read by the public runtime. The exact verified canonical
hostname is supplied by the active website-domain binding.

The following values are typed and bounded:

- global and page/blog title, description and indexing state;
- an optional same-site canonical path;
- an optional HTTPS social-image URL without URL credentials;
- one allowlisted organization type;
- Google and Bing verification token values;
- analytics provider `none` or `plausible` with one normalized public hostname.

Canonical values cannot provide another scheme or host. Publication rejects a
canonical path unless it resolves to published content in the same locale.
Duplicate routes pointing canonically elsewhere are omitted from sitemap and
feed output.

## Managed runtime output

Every managed route emits:

- an exact-host canonical URL;
- index/follow state combining global and route controls;
- Open Graph and Twitter metadata with route image fallback to the global
  social image;
- controlled webmaster verification metadata;
- a fixed schema.org graph when structured data is enabled.

The schema.org graph contains only code-owned object shapes:

- `Organization`, `LocalBusiness`, `HomeAndConstructionBusiness` or
  `ProfessionalService` from the selected enum and validated contact fields;
- `BreadcrumbList` for the current route;
- `Article` for a published blog post;
- `FAQPage` only for visible FAQ sections explicitly marked schema-eligible;
- `Service` only for validated service cards on a service page.

JSON is serialized server-side and escapes `<`, `>`, `&` and JavaScript line
separators before entering an `application/ld+json` script element. Content
text can therefore never terminate the script element.

## Analytics consent

Plausible is the only enabled analytics provider in this phase. The script URL
is a code-owned constant (`https://plausible.io/js/script.js`); tenant input can
only select the provider and one validated public site hostname.

No analytics request or script is loaded before explicit visitor consent. The
visitor can accept, reject or reopen privacy settings. The choice is stored in
the host-only `fg_website_analytics_consent` cookie with `Secure`,
`SameSite=Lax`, a root path and a one-year maximum age. The CSP permits only
the fixed Plausible endpoint in addition to the same origin.

## Custom Next.js contract

Custom sites own their rendered metadata, canonical, robots, sitemap and
structured data. They do not receive tenant secrets or an injection API.
Custom health evidence schema version 2 must affirm all four SEO capabilities
alongside the immutable release, exact host, TLS and public-address evidence.
Missing, stale, mismatched or schema-invalid evidence fails closed.

## Verification

The focused contract suite proves:

- legacy snapshots/settings receive safe additive defaults;
- unsafe canonical, image, analytics and verification input is rejected;
- missing canonical targets block publication;
- canonical duplicates are excluded from sitemap output;
- Organization/LocalBusiness, breadcrumb, FAQ, Service and Article graphs are
  derived from validated fields;
- hostile text cannot terminate the JSON-LD script;
- custom health evidence without the SEO contract is rejected.

No DNS, route, deployment, staging or production state is changed by Phase 7.
