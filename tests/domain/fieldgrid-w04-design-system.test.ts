import assert from "node:assert/strict";
import { test } from "node:test";

import {
  accessibleBrandTextColor,
  brandContrastRatio,
  ensureAccessibleBrandTextColor,
} from "../../lib/db/src/brand-color-contrast";

test("dynamic brand foregrounds retain WCAG AA contrast", () => {
  for (const background of [
    "#081D3A",
    "#00B7B3",
    "#7A7A7A",
    "#FFFFFF",
    "#F59E0B",
  ]) {
    const foreground = accessibleBrandTextColor(background);
    assert.ok(
      brandContrastRatio(foreground, background) >= 4.5,
      `${foreground} should be readable on ${background}`,
    );
  }
});

test("configured brand text is retained only when sufficiently readable", () => {
  assert.equal(
    ensureAccessibleBrandTextColor("#081D3A", "#FFFFFF"),
    "#FFFFFF",
  );
  assert.notEqual(
    ensureAccessibleBrandTextColor("#FFFFFF", "#F8FAFC"),
    "#F8FAFC",
  );
});

test("invalid color input fails closed to a deterministic fallback", () => {
  assert.equal(brandContrastRatio("not-a-color", "#FFFFFF"), 1);
  assert.equal(accessibleBrandTextColor("not-a-color"), "#081D3A");
});
