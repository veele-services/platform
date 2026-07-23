import assert from "node:assert/strict";
import test from "node:test";
import {
  websiteBlogCategoryPath,
  websiteBlogPostDraftSchema,
  websiteBlogPostPath,
  websiteBlogTagPath,
  websiteBlogTaxonomyDraftSchema,
} from "../src/blog";

const categoryId = "70000000-0000-4000-8000-000000000001";
const tagId = "70000000-0000-4000-8000-000000000002";

function postDraft() {
  return {
    locale: "nl-NL",
    title: "Veilig werken",
    slug: "veilig-werken",
    excerpt: "Een korte en bruikbare introductie voor het blogoverzicht.",
    body: {
      type: "doc",
      schemaVersion: 2,
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Veilige TipTap-inhoud." }],
        },
      ],
    },
    categoryId,
    tagIds: [tagId],
    seo: {
      title: "Veilig werken | Voorbeeld",
      description: "Praktische uitleg over veilig werken.",
      socialImageMediaId: null,
      indexable: true,
    },
  } as const;
}

test("blog paths are canonical and reserve archive segments", () => {
  assert.equal(websiteBlogPostPath("veilig-werken"), "/blog/veilig-werken");
  assert.equal(websiteBlogCategoryPath("advies"), "/blog/categorie/advies");
  assert.equal(websiteBlogTagPath("veiligheid"), "/blog/tag/veiligheid");
  assert.throws(() => websiteBlogPostPath("categorie"));
  assert.throws(() => websiteBlogPostPath("../onveilig"));
});

test("blog post body accepts allowlisted TipTap JSON without HTML nodes", () => {
  assert.equal(
    websiteBlogPostDraftSchema.parse(postDraft()).slug,
    "veilig-werken",
  );
  assert.equal(
    websiteBlogPostDraftSchema.safeParse({
      ...postDraft(),
      body: {
        type: "doc",
        schemaVersion: 2,
        content: [
          {
            type: "html",
            attrs: { html: "<script>alert(1)</script>" },
          },
        ],
      },
    }).success,
    false,
  );
  assert.equal(
    websiteBlogPostDraftSchema.safeParse({
      ...postDraft(),
      body: {
        type: "doc",
        schemaVersion: 2,
        content: [
          {
            type: "paragraph",
            content: [
              {
                type: "text",
                text: "Klik",
                marks: [
                  {
                    type: "link",
                    attrs: { href: "javascript:alert(1)" },
                  },
                ],
              },
            ],
          },
        ],
      },
    }).success,
    false,
  );
});

test("taxonomy identities and locale slugs are unique", () => {
  const category = {
    id: categoryId,
    locale: "nl-NL",
    name: "Advies",
    slug: "advies",
    description: null,
    isActive: true,
  };
  assert.equal(
    websiteBlogTaxonomyDraftSchema.safeParse({
      categories: [category, { ...category, id: crypto.randomUUID() }],
      tags: [],
    }).success,
    false,
  );
  assert.equal(
    websiteBlogTaxonomyDraftSchema.safeParse({
      categories: [category],
      tags: [
        {
          id: tagId,
          locale: "nl-NL",
          name: "Veiligheid",
          slug: "veiligheid",
          isActive: true,
        },
      ],
    }).success,
    true,
  );
});
