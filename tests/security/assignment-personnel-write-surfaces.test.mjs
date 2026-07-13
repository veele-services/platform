import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const repoRoot = process.cwd();

function read(path) {
  return readFileSync(join(repoRoot, path), "utf8");
}

function filesUnder(path) {
  const root = join(repoRoot, path);
  const files = [];
  for (const entry of readdirSync(root)) {
    const full = join(root, entry);
    const relative = join(path, entry);
    if (entry === "node_modules" || entry === ".next") continue;
    if (statSync(full).isDirectory()) {
      files.push(...filesUnder(relative));
    } else if (/\.(ts|tsx|js|jsx|mjs)$/u.test(entry)) {
      files.push(relative);
    }
  }
  return files;
}

test("no browser/client Supabase DML or RPC write surface remains for assignment_personnel", () => {
  const offenders = [];
  for (const file of filesUnder("artifacts")) {
    const source = read(file);
    if (/\.from\(["']assignment_personnel["']\)\s*\.\s*(insert|update|delete|upsert)\b/u.test(source)) {
      offenders.push(`${file}: direct table DML`);
    }
    if (/\.rpc\(["']pwa_apply_for_assignment["']/u.test(source)) {
      offenders.push(`${file}: legacy assignment_personnel RPC`);
    }
  }

  assert.deepEqual(offenders, []);
});

test("legacy pwa_apply_for_assignment RPC execute is revoked by the guard migration", () => {
  const migration = read("lib/db/migrations/20260712130000_assignment_personnel_tenant_guard.sql");

  assert.match(migration, /to_regprocedure\('public\.pwa_apply_for_assignment\(uuid\)'\)/u);
  assert.match(
    migration,
    /REVOKE ALL ON FUNCTION public\.pwa_apply_for_assignment\(uuid\) FROM PUBLIC, anon, authenticated/u,
  );
});

test("server assignment_personnel delete paths are tenant-aware", () => {
  const actions = read("artifacts/backoffice/src/app/actions/assignments.ts");
  const removePersonnel = actions.slice(
    actions.indexOf("export async function removePersonnel"),
    actions.indexOf("export async function addAssignmentTask"),
  );
  const deleteAssignment = actions.slice(
    actions.indexOf("export async function deleteAssignment"),
    actions.indexOf("export type AssignmentHistoryRow"),
  );

  assert.match(removePersonnel, /const tenantId = await requireCurrentTenantId\(\)/u);
  assert.match(removePersonnel, /innerJoin\(assignmentsTable,\s*eq\(assignmentPersonnelTable\.assignmentId,\s*assignmentsTable\.id\)\)/u);
  assert.match(removePersonnel, /eq\(assignmentsTable\.tenantId,\s*tenantId\)/u);
  assert.match(removePersonnel, /\.where\(eq\(assignmentPersonnelTable\.id,\s*link\.id\)\)/u);

  assert.match(deleteAssignment, /const tenantId = await requireCurrentTenantId\(\)/u);
  assert.match(deleteAssignment, /and\(eq\(assignmentsTable\.id,\s*id\),\s*eq\(assignmentsTable\.tenantId,\s*tenantId\)\)/u);
});
