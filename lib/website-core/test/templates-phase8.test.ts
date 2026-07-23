import assert from "node:assert/strict";
import { test } from "node:test";

import {
  WEBSITE_EDITOR_SECTION_KEYS,
  WEBSITE_SECTION_REGISTRY,
  WEBSITE_TEMPLATE_KEYS,
  WEBSITE_TEMPLATE_REGISTRY,
  websiteTemplateSchema,
} from "../src/index";

function channel(value: string): number {
  const normalized = Number.parseInt(value, 16) / 255;
  return normalized <= 0.04045
    ? normalized / 12.92
    : ((normalized + 0.055) / 1.055) ** 2.4;
}

function luminance(color: string): number {
  return (
    channel(color.slice(1, 3)) * 0.2126 +
    channel(color.slice(3, 5)) * 0.7152 +
    channel(color.slice(5, 7)) * 0.0722
  );
}

function contrast(left: string, right: string): number {
  const [lighter, darker] = [luminance(left), luminance(right)].sort(
    (a, b) => b - a,
  );
  return (lighter! + 0.05) / (darker! + 0.05);
}

test("all five managed templates are exact, versioned and renderer-owned presets", () => {
  assert.deepEqual(Object.keys(WEBSITE_TEMPLATE_REGISTRY), [
    ...WEBSITE_TEMPLATE_KEYS,
  ]);
  for (const key of WEBSITE_TEMPLATE_KEYS) {
    const template = websiteTemplateSchema.parse(
      WEBSITE_TEMPLATE_REGISTRY[key],
    );
    assert.equal(template.key, key);
    assert.equal(template.version, 1);
    assert.equal(template.pages.filter((page) => page.path === "/").length, 1);
    assert.equal(
      new Set(template.pages.map((page) => page.path)).size,
      template.pages.length,
    );
    assert.ok(template.pages.every((page) => page.title.trim().length > 0));
    assert.ok(
      template.navigation.every((item) =>
        template.pages.some((page) => page.key === item.pageKey),
      ),
    );
    for (const section of template.pages.flatMap((page) => page.sections)) {
      assert.ok(
        WEBSITE_EDITOR_SECTION_KEYS.includes(section.type),
        `${key} uses a non-editor section ${section.type}`,
      );
      assert.ok(
        section.variant in
          Object.fromEntries(
            WEBSITE_SECTION_REGISTRY[section.type].variants.map((variant) => [
              variant,
              true,
            ]),
          ),
        `${key} uses an unknown ${section.type} variant ${section.variant}`,
      );
    }
  }
});

test("template themes use bounded tokens and WCAG AA text contrast", () => {
  for (const template of Object.values(WEBSITE_TEMPLATE_REGISTRY)) {
    const theme = template.defaultTheme;
    assert.ok(
      contrast(theme.colors.background, theme.colors.foreground) >= 4.5,
      `${template.key} foreground contrast`,
    );
    assert.ok(
      contrast(theme.colors.primary, theme.colors.primaryForeground) >= 4.5,
      `${template.key} primary contrast`,
    );
    assert.ok(
      contrast(theme.colors.accent, theme.colors.accentForeground) >= 4.5,
      `${template.key} accent contrast`,
    );
    assert.ok(["compact", "standard", "wide"].includes(theme.contentWidth));
    assert.ok(["solid", "soft", "outline"].includes(theme.buttonStyle));
    assert.ok(["flat", "bordered", "elevated"].includes(theme.surfaceStyle));
    assert.ok(!("css" in theme) && !("script" in theme));
  }
});

test("template catalogue never exposes custom delivery as an initialization choice", () => {
  assert.ok(!Object.keys(WEBSITE_TEMPLATE_REGISTRY).includes("custom_nextjs"));
  assert.ok(
    Object.values(WEBSITE_TEMPLATE_REGISTRY).every(
      (template) =>
        !JSON.stringify(template).toLowerCase().includes("custom_nextjs"),
    ),
  );
});
