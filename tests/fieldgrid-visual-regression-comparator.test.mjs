import assert from "node:assert/strict";
import { copyFile, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { compareVisualSnapshot } from "../scripts/fieldgrid-visual-regression-snapshots.mjs";

const TEAL_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAAXNSR0IArs4c6QAAABZJREFUGJVjZOisZmBgYGJgYGBgYAAAC98BCC1wyFQAAAAASUVORK5CYII=",
  "base64",
);
const RED_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAAXNSR0IArs4c6QAAABZJREFUGJVjfO/iwsDAwMTAwMDAwAAAEmkBey0POXAAAAAASUVORK5CYII=",
  "base64",
);

test("visual comparator tolerates identical PNGs and emits a diff for a real color regression", async () => {
  const directory = await mkdtemp(join(tmpdir(), "fieldgrid-visual-compare-"));
  const actualPath = join(directory, "actual.png");
  const baselinePath = join(directory, "baseline.png");

  try {
    await writeFile(actualPath, TEAL_PNG);
    await copyFile(actualPath, baselinePath);

    const matching = await compareVisualSnapshot({
      screenshotPath: actualPath,
      baselinePath,
      updateBaselines: false,
      maxDiffPixelRatio: 0.001,
    });
    assert.equal(matching.status, "matched");
    assert.equal(matching.diffPath, null);

    await writeFile(actualPath, RED_PNG);
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
    await rm(directory, { recursive: true, force: true });
  }
});
