# Fieldgrid website module — managed template definitions

Date: 21 July 2026
Status: Template 1 configuration implemented; Templates 2–5 remain proposed

Template 1 is implemented as validated initialization data in website-core. No
public renderer or tenant-facing template picker is included in Phase 1A.

## Template boundary

Templates are versioned initialization presets for the `managed_cms` engine. They create editable site settings, pages, navigation and section records using the shared registry. They are not renderer forks and do not select infrastructure.

`custom_nextjs` is deliberately absent from the template catalogue. It is an enterprise delivery mode for a separately built and approved Next.js application. The existing Veele marketing application is a candidate for that mode and must retain its own route, design, claims, performance and deployment contracts.

## Proposed template contract

```ts
type WebsiteTemplateDefinition = {
  key: WebsiteTemplateKey;
  version: number;
  label: string;
  description: string;
  audience: readonly string[];
  goal: string;
  previewMediaKey: string;
  defaultTheme: WebsiteThemeTokens;
  allowedSectionKeys: readonly WebsiteSectionKey[];
  pages: readonly WebsiteTemplatePage[];
  navigation: readonly WebsiteTemplateNavigationItem[];
};
```

Every definition is code-owned, Zod-validated and covered by deterministic fixtures. Applying a template copies resolved records into a tenant/site draft and records `template_key` and `template_version` as provenance. Normal editing thereafter changes those records, not the template definition.

## Template 1 — Trust & Conversion

For plumbers, electricians, drainage services, installers, locksmiths and general home services.

Goal: a reliable, professional and conversion-focused local service website. This is the one complete MVP template.

Default homepage sections:

1. Hero — `split`;
2. Trust Bar;
3. Services Grid;
4. Feature Grid;
5. Process Steps;
6. Testimonials;
7. FAQ;
8. CTA Banner;
9. Contact Form.

Default pages:

- Home;
- Services;
- About;
- Reviews;
- Blog;
- Contact.

Visual direction:

- premium but practical;
- blue/white/slate defaults unless Fieldgrid or tenant theme policy selects another valid palette;
- strong CTA hierarchy and mobile-first conversion;
- clean spacing and restrained trust indicators;
- professional home-service character.

Required MVP admin behavior:

- initialize these pages and sections from the preset;
- edit schema-owned fields;
- add, remove, reorder and hide/show allowed sections;
- edit page SEO;
- preview and explicitly publish.

## Template 2 — Premium Local Authority

For premium renovation, luxury gardening, high-end maintenance, specialist installers and property improvement.

Goal: a premium, editorial and trust-heavy craftsmanship website.

Default homepage sections:

1. Hero — `visual` or `editorial`;
2. Trust Bar;
3. Services Grid — `editorial`;
4. Project Showcase;
5. Rich Text company story;
6. Logo Wall / Certifications;
7. Testimonials;
8. CTA Banner — consultation variant;
9. Contact Form.

Default pages:

- Home;
- Services;
- Projects;
- About;
- Blog;
- Contact.

Release dependency: public media rights/derivatives, Project Showcase and safe Rich Text must be production-ready before this preset is selectable.

## Template 3 — Fast Service & Emergency

For emergency plumbers, locksmiths, leak services, electrical fault services, drain unblocking and emergency repair.

Goal: a mobile-first, urgent, phone-focused website with a direct conversion route.

Default homepage sections:

1. Emergency Hero;
2. Trust Bar;
3. Services Grid — emergency-services composition;
4. Service Area;
5. Process Steps;
6. Testimonials;
7. FAQ;
8. CTA Banner — sticky/strong presentation where accessibility permits;
9. Contact Form.

Default pages:

- Home;
- Emergency Service;
- Services;
- Service Area;
- Reviews;
- Contact.

Release dependency: emergency availability and response-time claims need a source/freshness policy. Phone and sticky CTA behavior must not obscure content or misrepresent availability.

## Template 4 — Multi-Service Company

For facility services, all-round maintenance, cleaning plus maintenance, broad service companies and property-service companies.

Goal: a corporate, scalable website supporting multiple service categories.

Default homepage sections:

1. Hero — `split`;
2. Services Grid — category composition;
3. Feature Grid;
4. Process Steps;
5. Project Showcase / cases;
6. Team or company section;
7. Testimonials;
8. Blog Preview;
9. CTA Banner and/or Contact Form.

Default pages:

- Home;
- Services;
- Industries / Sectors;
- Cases;
- About;
- Blog;
- Contact.

Release dependency: Project Showcase, Team consent/removal, blog and scalable nested navigation must be complete.

## Template 5 — Content & SEO Growth

For SEO-heavy home-service companies, local service businesses, franchises and companies targeting multiple regions/services.

Goal: organic growth through service pages, area pages, blog content and FAQs without allowing uncontrolled SEO page generation.

Default homepage sections:

1. Hero — SEO-focused composition;
2. Services Grid;
3. Service Area;
4. Rich Text introduction;
5. FAQ;
6. Blog Preview;
7. Trust Bar;
8. CTA Banner / Contact Form.

Default pages:

- Home;
- Services;
- Service detail pages;
- Areas;
- Blog;
- Knowledge base;
- Contact.

Release dependency: page hierarchy, canonical/redirect rules, blog, safe rich text, Service Area and duplicate/thin-content quality checks must be complete. Templates never create unreviewed location doorway pages automatically.

## Preset rules

### Initialization

- A tenant selects an allowed template when creating a managed site.
- The server verifies module entitlement and permissions.
- The preset expands into draft site/page/section/navigation records in one transaction.
- Placeholders are clearly marked; publication fails while required public/legal/contact content is unresolved.
- Applying a template never activates a domain or publishes automatically.

### Changing templates

For the MVP, changing a template after content exists must not destructively rewrite the site. Offer one of these explicit operations only:

1. create a new draft site from another preset; or
2. apply a narrowly scoped, reviewed section addition to the existing draft.

Do not implement a broad Switch template action that overwrites pages, navigation or content. Any future migration must show a diff, preserve a backup/publication and require confirmation.

### Template versions

- Increment the version when preset defaults or composition change.
- Existing sites keep their copied content and recorded version.
- A new version affects only future initialization unless an explicit migration is offered.
- The public renderer dispatches on section and snapshot schema versions, not template version.
- Keep old versions as fixtures while an active/rollback publication depends on their generated contracts.

### Allowed sections

A template can limit initial and allowed section types to protect visual coherence. The global registry remains authoritative. A template cannot introduce a component, field, variant, script or style absent from code.

## Theme model

Each preset supplies bounded defaults for:

- foreground/background and brand/accent pairs;
- approved heading and body font keys;
- spacing density and corner-radius key;
- button treatment and content width;
- logo/favicon slots;
- section variant defaults.

Publication validates contrast and required asset metadata. Font selection resolves to code-owned, self-hosted or otherwise approved assets; editors cannot paste a remote font URL. Theme values do not contain CSS or arbitrary token names.

## Custom Next.js enterprise sites

The custom path has a separate lifecycle:

1. a customer-specific application is designed and implemented under its own reviewed requirements;
2. it receives an immutable build/release identifier;
3. platform operations register an allowlisted deployment binding for the correct tenant/site;
4. host, TLS, health, assets, metadata, forms and release marker are verified in staging;
5. an authorized platform operator can atomically switch the site to `custom_nextjs`;
6. the previous managed publication is preserved for explicit rollback.

The tenant template screen must never suggest that custom mode can be generated automatically or edited with the section builder. In custom mode, show deployment health and release information without infrastructure secrets and link to the appropriate support/change process.

The current `artifacts/marketing-website` should be assessed as the first candidate only after its form delivery is connected to durable Fieldgrid submissions and the deployment stack treats it as a health-checked, rollback-capable service. Its existing 44 routes must not be collapsed into managed template records.

## Required template tests

- every template definition parses against its exact schema;
- all referenced section keys and variants exist in the registry;
- all generated paths/navigation references are unique and valid;
- default pages have valid heading and metadata structure;
- required contact/legal placeholders block accidental publication;
- generated records are tenant/site scoped and transactionally rolled back on error;
- Template 1 remains compatible with the first public runtime;
- Templates 2–5 are feature-gated until dependent sections/blog/media exist;
- applying a newer version does not mutate an existing site;
- the template picker contains no `custom_nextjs` option;
- custom-mode activation cannot be triggered by a template mutation.
