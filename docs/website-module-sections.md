# Fieldgrid website module — section registry and content contracts

Date: 21 July 2026
Status: MVP schemas and managed public renderers implemented; editors remain proposed

The pure website-core package now implements strict schemas and defaults for the
nine Template 1 sections. Phase 2B adds their server-rendered public components
in the isolated website runtime. Backoffice editor components remain a Phase 3
deliverable.

## Scope

The section registry belongs only to the `managed_cms` delivery mode. A `custom_nextjs` enterprise website is separately implemented and deployed and does not render through this registry. It may reuse public Fieldgrid APIs such as form submission, but its component system remains code-owned by that custom application.

The managed engine is deliberately constrained: editors choose approved section types and variants and edit schema-defined fields. They cannot enter component names, HTML, JavaScript, CSS, Tailwind classes or arbitrary JSON.

## Registry contract

Each section definition should provide a typed, code-owned contract similar to:

```ts
type WebsiteSectionDefinition<T> = {
  key: WebsiteSectionKey;
  schemaVersion: number;
  contentSchema: z.ZodType<T>;
  variants: readonly string[];
  defaultContent: () => T;
  editor: SectionEditorDefinition<T>;
  render: (content: T, context: PublicSectionContext) => React.ReactNode;
  migrate?: (fromVersion: number, input: unknown) => T;
};
```

The core package should own serializable keys, schemas and template contracts. The backoffice owns editor components; the public runtime owns render components. Do not import backoffice UI into the public runtime.

Validation occurs at four boundaries:

1. server mutation before authoring data is saved;
2. preview creation;
3. publication build against the exact registry/schema version;
4. public snapshot load before render.

Publication fails on invalid required content or an unsupported schema version. At runtime, one malformed optional section is omitted with a safe operational diagnostic; it must not execute, expose its payload or take down unrelated pages. Diagnostics shown to public users remain generic.

## Shared field rules

- Plain text is length-bounded and rendered as text.
- Links accept same-site page references, safe relative paths, `https:` URLs and explicitly supported `mailto:`/`tel:` fields only.
- Media uses a same-tenant/site `website_media` reference, required alt text for meaningful images and explicit decorative state.
- Headings use a section-owned semantic level policy; editors do not choose arbitrary heading tags.
- Color and layout use controlled variant/theme tokens.
- Lists have explicit maximum item counts.
- Contact data can inherit from site settings or be explicitly overridden through validated fields.
- Motion is optional, respects reduced-motion preferences and cannot be content-configured as arbitrary animation code.
- Unknown keys are stripped or rejected according to the strict Zod schema; payload byte limits apply before parsing.

## MVP section catalogue

| Section         | Initial variants                                    | Core fields and limits                                                                                                     | Accessibility/behavior requirements                                                                                                        |
| --------------- | --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `hero`          | `centered`, `split`, `visual`, `service`, `minimal` | eyebrow, heading, subtitle, up to 2 CTAs, optional image, badges and trust text                                            | One page H1 policy; visual backgrounds require contrast protection; CTA labels are descriptive.                                            |
| `trust_bar`     | `logos`, `reviews`, `short_points`                  | accessible heading, optional sourced review score/count, 2–8 badges/certifications/logos/short claims                      | Logo alt text or decorative flag; claims require source/freshness; no auto-scrolling carousel.                                             |
| `services_grid` | `cards`, `icons`, `editorial`, `compact`            | heading, subtitle, 2–12 services with title, description, approved icon/media, safe link and CTA label                     | Cards remain operable and readable without hover; equal semantics on mobile.                                                               |
| `feature_grid`  | `two_column`, `three_column`                        | heading, intro, 2–9 features with allowlisted icon key                                                                     | Icons are decorative unless they add information; logical DOM order.                                                                       |
| `process_steps` | `numbered`, `timeline`                              | heading, intro, 2–8 ordered steps                                                                                          | Native ordered-list semantics; timeline styling cannot imply a different order.                                                            |
| `testimonials`  | `cards`, `featured`                                 | heading, subtitle, 1–6 quotes, name, company/location, optional sourced rating and approved portrait                       | Quote attribution is visible; ratings/claims require provenance; no autoplay carousel.                                                     |
| `faq`           | `accordion`, `list`                                 | heading, subtitle, 1–20 question/allowlisted-rich-text answer pairs, schema-eligibility flag derived at publication        | Keyboard-operable disclosure, correct `aria-expanded`, answers in server HTML; structured data only for eligible visible content.          |
| `cta_banner`    | `solid`, `split`                                    | heading, summary, 1–2 CTAs, optional safe contact action                                                                   | Contrast and focus state pass; phone/email use typed fields.                                                                               |
| `contact_form`  | `card`, `split_contact`                             | heading, subtitle, active same-site form reference, optional contact details/opening hours and policy-approved map setting | Labels and errors are programmatic; consent is not preselected; success/failure preserves context; no map until provider/privacy approval. |

### MVP content examples

Representative `hero` content:

```json
{
  "eyebrow": "Onderhoud zonder verrassingen",
  "heading": "Vakkundige service op het moment dat het telt",
  "summary": "Plan direct een afspraak met ons lokale team.",
  "primaryAction": { "label": "Vraag een offerte aan", "pageId": "<uuid>" },
  "secondaryAction": { "label": "Bel ons", "phone": "+31100000000" },
  "imageId": "<uuid>"
}
```

Representative `faq` content:

```json
{
  "heading": "Veelgestelde vragen",
  "items": [
    {
      "question": "In welke regio werken jullie?",
      "answer": [
        {
          "type": "paragraph",
          "children": [{ "type": "text", "text": "Wij werken in ..." }]
        }
      ]
    }
  ]
}
```

Actual schemas should use stable referenced IDs and validated rich-text nodes rather than accepting the placeholders above literally.

## Defined later sections

The architecture defines these contracts now, but they are feature-gated and are not Phase 1/MVP implementation commitments:

| Section            | Variants                                               | Fields and bounds                                                                                            | Gate before implementation                                                                                                |
| ------------------ | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| `emergency_hero`   | `mobile_first`, `phone_focused`, `area_focused`        | eyebrow, heading, subtitle, validated phone, primary CTA, emergency notice, 0–5 trust badges, optional image | Availability, response-time and after-hours claims need source/freshness policy; sticky phone UI must pass accessibility. |
| `service_area`     | `list`, `grouped`, `map_split`                         | heading, subtitle, 1–100 normalized areas, primary area, nearby areas, optional map flag                     | Duplicate/thin-page controls plus privacy-safe map/provider and performance review.                                       |
| `project_showcase` | `grid`, `featured`, `editorial`                        | heading, subtitle, 1–12 projects with title, description, media, location and safe link                      | Customer consent, image rights, location privacy and responsive media pipeline.                                           |
| `blog_preview`     | `cards`, `featured`, `compact`                         | heading, subtitle, optional same-site category filter, limit 1–12, CTA                                       | Blog publication exists; deterministic publication-time query and empty state are defined.                                |
| `rich_text`        | `narrow`, `standard`, `wide` with controlled alignment | allowlisted versioned TipTap document, semantic heading policy and optional section label                    | Dedicated public node renderer completed and security-reviewed; no raw HTML/max-width/class input.                        |
| `stats`            | `inline`, `cards`                                      | 2–8 items with value, label and description                                                                  | Quantified claims require source, owner and freshness workflow.                                                           |
| `team`             | `cards`, `compact`                                     | heading, subtitle, 1–12 members with name, role, approved image and bounded bio                              | Employee consent, withdrawal/removal and media-retention workflow.                                                        |
| `logo_wall`        | `logos`, `certifications`                              | heading, 2–16 items with name, approved media and description                                                | Brand-use/certification permission, expiry and accessible alternatives.                                                   |

## Rich-text contract

Canonical rich text is a versioned JSON document, not stored HTML. The first public allowlist should remain small:

- document, paragraph and text;
- heading levels permitted by the containing section;
- bullet and ordered lists with list items;
- bold, italic and safe link marks;
- hard break where semantically justified.

Later nodes such as blockquote, table, code, image or embed require separate schema, renderer, accessibility and security review.

Link rendering rules:

- resolve internal page IDs during publication;
- normalize relative paths;
- permit `https:` externally;
- add appropriate `rel` values to external targets;
- reject `javascript:`, `data:`, protocol-relative and malformed URLs;
- do not let content control arbitrary `target`, `rel`, event handlers or classes.

The existing authenticated knowledgebase HTML renderer must not be reused for public website content because it inserts stored HTML. A dedicated node-by-node renderer is required.

## Variants and visual tokens

Variants are explicit keys shipped with code. A section can only use a variant listed by its definition and allowed by the selected template. Templates may choose defaults, but publication stores the resolved variant so rendering is deterministic.

Theme input is restricted to approved tokens such as:

- brand/accent colors within contrast-aware constraints;
- heading/body font family from an approved set;
- bounded corner radius and spacing density;
- logo and favicon media references;
- light/dark foreground/background pairs verified at publication.

No section accepts raw CSS, CSS variables, Tailwind classes, remote font code, script tags or arbitrary animation definitions.

## Editor behavior

- Render schema-specific controls rather than a raw JSON editor.
- Show field limits and inline server-validation errors.
- Start ordering with accessible Move up/Move down actions and server-side optimistic revisions.
- Duplicate by creating a new ID after revalidation; never clone audit/revision metadata.
- Deleting a section requires confirmation and remains a draft change until publication.
- Unsupported legacy sections display a blocking diagnostic with export/recovery context.
- Preview always identifies draft state and cannot be indexed or cached publicly.

## Publication behavior

The publication builder:

1. loads page sections in deterministic order;
2. resolves the exact registry key and schema version;
3. applies an explicit content migration only when one is shipped and tested;
4. validates links, media, forms, heading rules and template allowances;
5. strips all authoring/audit metadata;
6. writes parsed public data into the immutable snapshot;
7. records diagnostics and blocks activation on errors.

Code deployments must continue to render the previous supported publication schema during rolling deployment/rollback. Removing a section version requires evidence that no active or rollback publication uses it.

## Required tests

- valid and invalid fixtures for every section/variant/schema version;
- unknown key, oversized payload and unsupported-version rejection;
- XSS/unsafe URL/HTML/class injection fixtures;
- cross-tenant media, page and form reference rejection;
- publication determinism and content-hash stability;
- old publication compatibility with the next application release;
- safe handling of an unknown optional section at runtime;
- semantic headings, keyboard controls, focus behavior and axe checks;
- responsive snapshots or assertions for supported breakpoints;
- reduced-motion behavior;
- proof that custom Next.js routing never interprets its content through the registry.
