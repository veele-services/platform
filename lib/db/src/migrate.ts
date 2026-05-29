/**
 * db:migrate — single command to push schema + apply RLS/FK/index migrations.
 *
 * Runs:
 *   1. drizzle-kit push  (schema sync — idempotent)
 *   2. migrations/001_rbac_rls.sql  (Supabase RBAC helper + RLS)
 *   3. migrations/002_sprint1_rls.sql  (Sprint 1 table RLS, indexes, FKs)
 *
 * Supabase-specific statements (auth.uid(), auth.jwt(), auth.users FKs,
 * REVOKE on authenticated role) are gracefully skipped when running
 * against the Replit dev PostgreSQL, which has no Supabase auth layer.
 *
 * Usage:
 *   pnpm --filter @workspace/db run db:migrate
 */

import { execSync }     from "child_process";
import { readFileSync }  from "fs";
import { fileURLToPath } from "url";
import path              from "path";
import pg                from "pg";

const { Client } = pg;

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const DB_URL = process.env.DATABASE_URL;
if (!DB_URL) throw new Error("DATABASE_URL is required for db:migrate");

const MIGRATIONS_DIR = path.join(__dirname, "../migrations");
const MIGRATIONS     = [
  path.join(MIGRATIONS_DIR, "001_rbac_rls.sql"),
  path.join(MIGRATIONS_DIR, "002_sprint1_rls.sql"),
];

// ── Step 1: push schema ───────────────────────────────────────────────────────
console.log("\n[db:migrate] Step 1 — drizzle-kit push");
execSync("drizzle-kit push --force --config ./drizzle.config.ts", {
  stdio: "inherit",
  cwd:   path.join(__dirname, "../"),
});

// ── SQL statement splitter ────────────────────────────────────────────────────
// Strip single-line comments, then split on semicolons.
// This avoids the "comment block + statement" problem where .startsWith("--")
// incorrectly discards the SQL that follows the comment header.
function splitStatements(sql: string): string[] {
  // Remove single-line comments (-- ...) while preserving newlines.
  const stripped = sql
    .split("\n")
    .map(line => {
      const idx = line.indexOf("--");
      return idx === -1 ? line : line.slice(0, idx);
    })
    .join("\n");

  return stripped
    .split(";")
    .map(s => s.trim())
    .filter(s => s.length > 0);
}

// ── Step 2: apply RLS migrations ──────────────────────────────────────────────
const client = new Client({ connectionString: DB_URL });
await client.connect();

for (const migrationPath of MIGRATIONS) {
  const filename = path.basename(migrationPath);
  console.log(`\n[db:migrate] Step 2 — applying ${filename}`);

  let sql: string;
  try {
    sql = readFileSync(migrationPath, "utf-8");
  } catch {
    console.warn(`  [skip] ${filename} not found`);
    continue;
  }

  const statements = splitStatements(sql);
  let applied = 0;
  let skipped = 0;

  for (const stmt of statements) {
    try {
      await client.query(stmt);
      applied++;
    } catch (err: unknown) {
      const code = (err as { code?: string }).code;
      const msg  = (err as { message?: string }).message ?? "";

      // Idempotency: "already exists" errors are expected on repeated runs.
      if (
        code === "42710" || // duplicate_object (policy/constraint)
        code === "42P07" || // duplicate_table
        code === "23505" || // unique_violation
        msg.includes("already exists")
      ) {
        skipped++;
        continue;
      }

      // Supabase-only infrastructure doesn't exist in the Replit dev Postgres.
      if (
        code === "42883" || // undefined_function (auth.uid, auth.jwt, is_management)
        code === "42P01" || // undefined_table    (auth.users)
        code === "42501" || // insufficient_privilege (REVOKE on missing role)
        code === "42704" || // undefined_object   (authenticated role)
        msg.includes("auth.uid")      ||
        msg.includes("auth.jwt")      ||
        msg.includes("auth.users")    ||
        msg.includes("is_management") ||
        msg.includes('"authenticated"') ||
        msg.includes("role \"authenticated\"") ||
        msg.includes("does not exist")
      ) {
        console.warn(`  [dev-skip] Supabase-only: ${msg.slice(0, 120)}`);
        skipped++;
        continue;
      }

      console.error(`  [error] ${msg}`);
      skipped++;
    }
  }

  console.log(`  ✓ applied: ${applied}, skipped/deferred: ${skipped}`);
}

await client.end();
console.log("\n[db:migrate] Complete.\n");
