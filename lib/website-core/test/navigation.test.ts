import assert from "node:assert/strict";
import test from "node:test";
import {
  positionWebsiteNavigationItems,
  websiteNavigationDraftSchema,
} from "../src/navigation";

const rootId = "10000000-0000-4000-8000-000000000001";
const childId = "10000000-0000-4000-8000-000000000002";
const pageId = "20000000-0000-4000-8000-000000000001";

const root = {
  id: rootId,
  label: "Diensten",
  location: "header",
  parentId: null,
  pageId: null,
  linkType: "dropdown",
  href: null,
  target: "self",
  isVisible: true,
} as const;

const child = {
  id: childId,
  label: "Schoonmaak",
  location: "header",
  parentId: rootId,
  pageId,
  linkType: "page",
  href: null,
  target: "self",
  isVisible: true,
} as const;

test("valid navigation supports deterministic two-level ordering", () => {
  const positioned = positionWebsiteNavigationItems([
    child,
    {
      ...child,
      id: "10000000-0000-4000-8000-000000000003",
      label: "Privacy",
      location: "footer_legal",
      parentId: null,
    },
    root,
  ]);
  assert.deepEqual(
    positioned.map(({ id, position }) => ({ id, position })),
    [
      { id: rootId, position: 0 },
      { id: childId, position: 1 },
      { id: "10000000-0000-4000-8000-000000000003", position: 0 },
    ],
  );
});

test("external navigation accepts HTTPS without credentials only", () => {
  const external = {
    ...root,
    linkType: "external",
    pageId: null,
    href: "https://example.com/contact?from=menu",
    target: "blank",
  } as const;
  assert.equal(
    websiteNavigationDraftSchema.safeParse([external]).success,
    true,
  );
  for (const href of [
    "",
    "niet-een-url",
    "http://example.com",
    "javascript:alert(1)",
    "data:text/html,unsafe",
    "https://user:secret@example.com",
  ]) {
    assert.equal(
      websiteNavigationDraftSchema.safeParse([{ ...external, href }]).success,
      false,
      href,
    );
  }
});

test("hierarchy rejects missing, cross-menu and third-level parents", () => {
  const grandchild = {
    ...child,
    id: "10000000-0000-4000-8000-000000000004",
    label: "Dieper",
    parentId: childId,
  };
  assert.equal(
    websiteNavigationDraftSchema.safeParse([root, child, grandchild]).success,
    false,
  );
  assert.equal(
    websiteNavigationDraftSchema.safeParse([
      root,
      { ...child, location: "footer_primary" },
    ]).success,
    false,
  );
  assert.equal(
    websiteNavigationDraftSchema.safeParse([
      { ...child, parentId: "10000000-0000-4000-8000-000000000099" },
    ]).success,
    false,
  );
});

test("sibling labels and destinations are unique", () => {
  assert.equal(
    websiteNavigationDraftSchema.safeParse([
      root,
      child,
      {
        ...child,
        id: "10000000-0000-4000-8000-000000000005",
        label: "SCHOONMAAK",
      },
    ]).success,
    false,
  );
  assert.equal(
    websiteNavigationDraftSchema.safeParse([
      root,
      child,
      {
        ...child,
        id: "10000000-0000-4000-8000-000000000006",
        label: "Reiniging",
      },
    ]).success,
    false,
  );
});

test("visible children cannot hide behind an invisible parent", () => {
  assert.equal(
    websiteNavigationDraftSchema.safeParse([
      { ...root, isVisible: false },
      child,
    ]).success,
    false,
  );
});
