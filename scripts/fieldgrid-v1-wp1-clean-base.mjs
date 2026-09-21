#!/usr/bin/env node
/**
 * WP1 clean-base contract. This intentionally never connects to a database.
 * The protected staging workflow supplies environment identity and its artifact
 * is the approval boundary before an operator can run provider-specific steps.
 */
const confirmation = "fieldgrid-v1-wp1-clean-reset-v1";
export const cleanBaseManifest = Object.freeze({
  version: "fieldgrid-v1-wp1-clean-base-v1",
  target: { environment: "staging", projectRef: "olyfmekyqozxrbrwwszu" },
  confirmation,
  prohibited: ["TRUNCATE CASCADE", "auth.users SQL wipe", "storage.objects SQL wipe", "realtime schema wipe", "production"],
  preserved: ["schema", "migration journal", "RLS policies", "keys", "provider configuration", "domain bindings"],
  phases: [
    "preflight-manifest", "verified-backup", "quiesce-writers-and-workers",
    "bounded-application-cleanup", "managed-storage-and-auth", "canonical-bootstrap",
    "verification", "resume-workers",
  ],
  stopConditions: ["unknown project identity", "active or unknown payment", "unverified backup", "missing preserved administrator"],
  canonical: ["veele tenant", "planner", "administration", "personnel", "customer", "location", "work order", "isolation tenant"],
  verification: ["administrator login", "tenant isolation denial", "fresh upload and object access", "new PDF", "realtime configuration", "mail queue neutralized"],
});

export function validateCleanBaseManifest(manifest = cleanBaseManifest) {
  const errors = [];
  if (manifest.target.environment !== "staging") errors.push("target must be staging");
  if (!/^[a-z0-9]{8,64}$/u.test(manifest.target.projectRef)) errors.push("invalid project reference");
  if (!manifest.phases.includes("managed-storage-and-auth")) errors.push("managed provider phase missing");
  if (!manifest.stopConditions.includes("active or unknown payment")) errors.push("payment stop condition missing");
  if (!manifest.canonical.includes("isolation tenant")) errors.push("isolation fixture missing");
  return errors;
}

if (import.meta.url === new URL(process.argv[1], "file:").href) {
  const args = new Set(process.argv.slice(2));
  const errors = validateCleanBaseManifest();
  if (errors.length) throw new Error(errors.join("; "));
  if (args.has("--check")) {
    console.log("Fieldgrid V1 WP1 clean-base contract is valid.");
  } else if (args.has("--manifest")) {
    console.log(JSON.stringify(cleanBaseManifest, null, 2));
  } else {
    console.log("This contract is manifest-only. Use --check or --manifest.");
    console.log("A protected staging workflow must establish the backup, project identity and approvals before any external reset action.");
  }
}
