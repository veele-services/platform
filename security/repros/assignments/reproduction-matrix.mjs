import { buildAssignmentP0Evidence, summarizeAssignmentP0Evidence } from "./source-evidence.mjs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export function assignmentP0ReproductionMatrix() {
  return buildAssignmentP0Evidence();
}

export function assignmentP0ReproductionSummary() {
  return summarizeAssignmentP0Evidence();
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const rows = assignmentP0ReproductionMatrix();
  console.log(JSON.stringify({
    summary: assignmentP0ReproductionSummary(),
    rows,
  }, null, 2));
}
