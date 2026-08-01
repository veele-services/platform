import assert from "node:assert/strict";
import { copyFile, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import {
  compareVisualSnapshot,
  hasHorizontalOverflowFromMetrics,
  visualCaptureStatus,
} from "../scripts/fieldgrid-visual-regression-snapshots.mjs";

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

test("baseline updates fail closed until the capture passed every quality check", async () => {
  const directory = await mkdtemp(join(tmpdir(), "fieldgrid-visual-update-"));
  const actualPath = join(directory, "actual.png");
  const baselinePath = join(directory, "baseline.png");

  try {
    await writeFile(actualPath, RED_PNG);
    await writeFile(baselinePath, TEAL_PNG);

    for (const captureIsValid of [false, undefined]) {
      const rejected = await compareVisualSnapshot({
        screenshotPath: actualPath,
        baselinePath,
        updateBaselines: true,
        maxDiffPixelRatio: 0.001,
        captureIsValid,
      });
      assert.equal(rejected.status, "rejected");
      assert.deepEqual(await readFile(baselinePath), TEAL_PNG);
    }

    const updated = await compareVisualSnapshot({
      screenshotPath: actualPath,
      baselinePath,
      updateBaselines: true,
      maxDiffPixelRatio: 0.001,
      captureIsValid: true,
    });
    assert.equal(updated.status, "updated");
    assert.deepEqual(await readFile(baselinePath), RED_PNG);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("overflow detection cannot be disabled by clipping the page root", () => {
  assert.equal(
    hasHorizontalOverflowFromMetrics({
      scrollWidth: 390,
      clientWidth: 390,
      overflowingElementCount: 1,
      maxOverflowPx: 48,
    }),
    true,
  );
  assert.equal(
    hasHorizontalOverflowFromMetrics({
      scrollWidth: 390,
      clientWidth: 390,
      overflowingElementCount: 0,
      maxOverflowPx: 0,
    }),
    false,
  );
});

test("a capture that failed server-error validation can never be ok", () => {
  assert.equal(
    visualCaptureStatus({
      captureIsValid: false,
      hasVisualRegression: false,
    }),
    "warning",
  );
  assert.equal(
    visualCaptureStatus({
      captureIsValid: true,
      hasVisualRegression: false,
    }),
    "ok",
  );
});
