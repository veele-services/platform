import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  findingKey,
  scanReleasedSources,
  validateTraceability,
} from "../scripts/fieldgrid-uiux-master-gate.mjs";
import { parseTraceabilityRows } from "../scripts/fieldgrid-uiux-traceability.mjs";

const SAMPLE_PLAN = `
| ID | Verplichting | Werkpakket |
|---|---|---|
| PB-001 | Planbord gebruikt werkelijke starttijd | W01 |
| RADIX-001 | Architectuurdocument | W00/W04 |
| UX-001 | KPI-databronnen corrigeren | W02 |
`;

test("traceability parser reads every canon ID once", () => {
  assert.deepEqual(
    parseTraceabilityRows(SAMPLE_PLAN).map((item) => item.id),
    ["PB-001", "RADIX-001", "UX-001"],
  );
});

test("traceability validation fails closed for missing and open strict items", () => {
  const payload = {
    items: [
      {
        id: "PB-001",
        requirement: "Planbord gebruikt werkelijke starttijd",
        workPackage: "W01",
        status: "OPEN",
        pr: "LOCAL_ONLY",
        tests: [],
        evidence: [],
        stagingResult: "NOT_RUN",
      },
    ],
  };

  const checkErrors = validateTraceability(SAMPLE_PLAN, payload);
  assert.ok(checkErrors.some((error) => error.includes("RADIX-001")));
  assert.ok(checkErrors.some((error) => error.includes("UX-001")));

  const strictErrors = validateTraceability(SAMPLE_PLAN, payload, {
    strict: true,
  });
  assert.ok(strictErrors.some((error) => error.includes("strict mode")));
  assert.ok(strictErrors.some((error) => error.includes("no test evidence")));
});

test("source scan catches released direct Radix imports and raw controls", () => {
  const root = mkdtempSync(join(tmpdir(), "fieldgrid-uiux-gate-"));
  const sourceDir = join(root, "artifacts/backoffice/src/features");
  mkdirSync(sourceDir, { recursive: true });
  writeFileSync(
    join(sourceDir, "Example.tsx"),
    [
      'import * as Dialog from "@radix-ui/react-dialog";',
      "export function Example() {",
      '  return <select aria-label="Keuze"><option>Een</option></select>;',
      "}",
    ].join("\n"),
  );

  const findings = scanReleasedSources(root);
  assert.deepEqual(
    findings.map((finding) => finding.rule),
    ["DIRECT_RADIX_IMPORT", "RAW_SELECT"],
  );
  assert.equal(
    findingKey(findings[0]),
    findingKey({ ...findings[0], line: 999 }),
  );
});
