import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const report = JSON.parse(
  await readFile(new URL("../.lighthouse-report.json", import.meta.url), "utf8"),
);

const scoreBudgets = {
  performance: 0.9,
  accessibility: 1,
  "best-practices": 0.9,
  seo: 0.9,
};

for (const [category, minimum] of Object.entries(scoreBudgets)) {
  const actual = report.categories?.[category]?.score;
  assert.equal(typeof actual, "number", `Lighthouse category ${category} is missing.`);
  assert.ok(actual >= minimum, `${category} score ${actual} is below ${minimum}.`);
}

const timingBudgets = {
  "first-contentful-paint": 1_800,
  "largest-contentful-paint": 2_500,
  "cumulative-layout-shift": 0.1,
  "total-blocking-time": 200,
};

for (const [audit, maximum] of Object.entries(timingBudgets)) {
  const actual = report.audits?.[audit]?.numericValue;
  assert.equal(typeof actual, "number", `Lighthouse audit ${audit} is missing.`);
  assert.ok(actual <= maximum, `${audit} ${actual} exceeds ${maximum}.`);
}

const resourceBudgets = {
  script: 250 * 1_024,
  stylesheet: 80 * 1_024,
  image: 500 * 1_024,
  total: 1_000 * 1_024,
};
const resources = new Map(
  report.audits?.["resource-summary"]?.details?.items?.map((item) => [
    item.resourceType,
    item.transferSize,
  ]) ?? [],
);

for (const [resourceType, maximum] of Object.entries(resourceBudgets)) {
  const actual = resources.get(resourceType) ?? 0;
  assert.ok(actual <= maximum, `${resourceType} transfer ${actual} exceeds ${maximum} bytes.`);
}

console.log(
  `Lighthouse OK: performance ${Math.round(report.categories.performance.score * 100)}, accessibility ${Math.round(report.categories.accessibility.score * 100)}, best-practices ${Math.round(report.categories["best-practices"].score * 100)}, SEO ${Math.round(report.categories.seo.score * 100)}.`,
);
