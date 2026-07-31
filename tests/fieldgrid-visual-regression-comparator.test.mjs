import assert from "node:assert/strict";
import { copyFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { chromium } from "playwright";

import { compareVisualSnapshot } from "../scripts/fieldgrid-visual-regression-snapshots.mjs";

test("visual comparator tolerates identical PNGs and emits a diff for a real color regression", async () => {
  const directory = await mkdtemp(join(tmpdir(), "fieldgrid-visual-compare-"));
  const actualPath = join(directory, "actual.png");
  const baselinePath = join(directory, "baseline.png");
  const browser = await chromium.launch({ headless: true });

  try {
    const page = await browser.newPage({ viewport: { width: 32, height: 32 } });
    await page.setContent(
      "<style>html,body{margin:0;width:32px;height:32px;background:#00897b}</style>",
    );
    await page.screenshot({ path: actualPath });
    await copyFile(actualPath, baselinePath);

    const matching = await compareVisualSnapshot({
      screenshotPath: actualPath,
      baselinePath,
      updateBaselines: false,
      maxDiffPixelRatio: 0.001,
    });
    assert.equal(matching.status, "matched");
    assert.equal(matching.diffPath, null);

    await page.setContent(
      "<style>html,body{margin:0;width:32px;height:32px;background:#ef4444}</style>",
    );
    await page.screenshot({ path: actualPath });
    const changed = await compareVisualSnapshot({
      screenshotPath: actualPath,
      baselinePath,
      updateBaselines: false,
      maxDiffPixelRatio: 0.001,
    });
    assert.equal(changed.status, "changed");
    assert.match(changed.errorMessage, /pixels .* are different/u);
    assert.match(changed.diffPath, /\.diff\.png$/u);
  } finally {
    await browser.close();
    await rm(directory, { recursive: true, force: true });
  }
});
