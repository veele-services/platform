import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";

const surfaceUrl = new URL("../docs/security/authorization-surfaces.json", import.meta.url);
const reviewUrl = new URL("../docs/security/authorization-review.json", import.meta.url);
const finalStatuses = new Set(["controlled", "corrected-and-rechecked", "not-applicable"]);
const knownStatuses = new Set([...finalStatuses, "pending", "blocked"]);
const fingerprint = (surface) => createHash("sha256").update(JSON.stringify(surface)).digest("hex");

export function validateAuthorizationReview(surfaces, review) {
  if (review.version !== 1 || !Array.isArray(review.entries))
    throw new Error("Authorization review ledger has an unsupported format");
  const expected = new Map(surfaces.surfaces.map((entry) => [entry.id, fingerprint(entry)]));
  const seen = new Set();
  const errors = [];
  for (const entry of review.entries) {
    if (!entry || typeof entry.id !== "string" || seen.has(entry.id)) {
      errors.push(`duplicate or invalid review entry: ${String(entry?.id)}`);
      continue;
    }
    seen.add(entry.id);
    if (!expected.has(entry.id)) errors.push(`review entry no longer exists: ${entry.id}`);
    else if (entry.surfaceFingerprint !== expected.get(entry.id)) errors.push(`authorization surface changed since review: ${entry.id}`);
    if (!knownStatuses.has(entry.status)) errors.push(`invalid review status for ${entry.id}: ${String(entry.status)}`);
    else if (!finalStatuses.has(entry.status)) errors.push(`unfinished authorization review: ${entry.id} (${entry.status})`);
    if (!Array.isArray(entry.evidence) || entry.evidence.length === 0 || entry.evidence.some((value) => typeof value !== "string" || !value.trim()))
      errors.push(`missing review evidence: ${entry.id}`);
  }
  for (const id of expected.keys()) if (!seen.has(id)) errors.push(`authorization surface has no review status: ${id}`);
  if (errors.length) throw new Error(errors.join("\n"));
  return { reviewed: seen.size };
}

function capture(surfaces, previous) {
  const prior = new Map((previous?.entries ?? []).map((entry) => [entry.id, entry]));
  return {
    version: 1,
    meaning: "One explicit review status per discovered authorization surface. New entries remain pending until source/resource review and evidence are added.",
    entries: surfaces.surfaces.map((surface) => {
      const currentFingerprint = fingerprint(surface);
      const reviewed = prior.get(surface.id);
      return reviewed?.surfaceFingerprint === currentFingerprint
        ? reviewed
        : { id: surface.id, surfaceFingerprint: currentFingerprint, status: "pending", evidence: [] };
    }),
  };
}

function main() {
  const surfaces = JSON.parse(readFileSync(surfaceUrl, "utf8"));
  let review;
  try { review = JSON.parse(readFileSync(reviewUrl, "utf8")); }
  catch { review = { version: 1, entries: [] }; }
  if (process.argv.includes("--capture")) {
    process.stdout.write(`${JSON.stringify(capture(surfaces, review), null, 2)}\n`);
    return;
  }
  const result = validateAuthorizationReview(surfaces, review);
  console.log(`${result.reviewed} authorization surfaces have an explicit completed review status and evidence reference.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { main(); }
  catch (error) { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; }
}
