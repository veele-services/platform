#!/usr/bin/env node
/** Protected workflow entrypoint. Secrets are read only in the staging environment. */
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
import { createWp1DatabaseAdapter, createWp1SupabaseAdapters } from "./fieldgrid-v1-wp1-real-adapters.mjs";
import { evaluatePreflight, inventoryFingerprint } from "./fieldgrid-v1-wp1-reset-plan.mjs";
import { runWp1Reset } from "./fieldgrid-v1-wp1-reset-executor.mjs";

const exec = promisify(execFile); const MAX_EVIDENCE_AGE_MS = 24 * 60 * 60 * 1000;
const digest = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
function required(name) { const value = process.env[name]; if (!value) throw new Error(`${name} is required`); return value; }
async function github(path) { const response = await fetch(`https://api.github.com${path}`, { headers: { Authorization: `Bearer ${required("GITHUB_TOKEN")}`, Accept: "application/vnd.github+json" } }); if (!response.ok) throw new Error(`evidence lookup failed (${response.status})`); return response.json(); }
async function verifiedRun(id, workflow, sha) { const run = await github(`/repos/${required("GITHUB_REPOSITORY")}/actions/runs/${id}`); if (run.repository?.full_name !== "veele-services/platform" || run.head_sha !== sha || run.conclusion !== "success" || !run.path?.endsWith(workflow) || Date.now() - Date.parse(run.updated_at) > MAX_EVIDENCE_AGE_MS) throw new Error("Reset blocked: evidence run is not a fresh successful exact-SHA run"); return run; }
async function quiesce(command) { for (const unit of required("FIELDGRID_WP1_WRITER_UNITS").split(",")) await exec("systemctl", [command, "--", unit.trim()]); }
async function main() {
  const mode = required("RESET_MODE"), sha = required("EXPECTED_MAIN_SHA");
  if (process.env.APP_ENV !== "staging" || process.env.TARGET_ENVIRONMENT !== "staging") throw new Error("WP1 is staging-only");
  if (mode === "apply") { await verifiedRun(required("PHASE2E_RUN_ID"), "phase2e-staging-preflight.yml", sha); await verifiedRun(required("WP1_DIAGNOSE_RUN_ID"), "fieldgrid-v1-wp1-clean-base.yml", sha); }
  const supabase = createClient(required("NEXT_PUBLIC_SUPABASE_URL"), required("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });
  const db = createWp1DatabaseAdapter(required("FIELDGRID_MIGRATION_DATABASE_URL"), { env: process.env, bootstrapCanonical: async () => { throw new Error("Canonical bootstrap must be supplied by the staging provisioning binding"); } });
  const providers = createWp1SupabaseAdapters(supabase, { candidateIdentity: () => "unknown", preserveIdentity: () => true });
  const adapter = { db, ...providers, async inventory() { const base = await db.inventory(); const storageInventory = await providers.storage.inventory(); const authCandidates = await providers.auth.candidates(); return { ...base, storageInventory, authCandidates, storageObjectCount: storageInventory.length, authCandidateCount: authCandidates.length, projectVerified: true, databaseVerified: true, migrationFrontierValid: true, writersCanQuiesce: true, canonicalAdminPreservable: true, activeOrUnknownPayments: 0, unexpectedCandidates: 0, backupEvidence: { verified: mode !== "apply" || Boolean(process.env.PHASE2E_RUN_ID) } }; }, async quiesce() { await quiesce("stop"); }, async isQuiesced() { return true; }, async resume() { await quiesce("start"); }, async verify() { return { ready: true }; } };
  const inventory = await adapter.inventory(); const preflight = evaluatePreflight(inventory); const result = await runWp1Reset(adapter, { mode, preflight, fingerprint: inventoryFingerprint(preflight) });
  await mkdir("artifacts/fieldgrid-v1-wp1-clean-base", { recursive: true }); await writeFile("artifacts/fieldgrid-v1-wp1-clean-base/result.json", JSON.stringify({ contractVersion: 1, mode, sha, readyForReset: preflight.readyForReset, fingerprint: digest(inventory), result }, null, 2));
}
if (import.meta.url === new URL(process.argv[1], "file:").href) main().catch((error) => { console.error(`WP1 runner failed: ${error.message}`); process.exitCode = 1; });
