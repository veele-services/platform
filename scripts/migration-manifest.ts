import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

export type MigrationHistoryRow = { version: string; name: string; statements: string[] };
export type MigrationManifestEntry = { version: string; name: string; sha256: string };

export const hashMigrationStatements = (statements: string[]) =>
  createHash("sha256").update(JSON.stringify(statements)).digest("hex");

export async function readMigrationManifest(root = process.cwd()): Promise<MigrationManifestEntry[]> {
  const raw = JSON.parse(await readFile(resolve(root, "scripts/migration-manifest.json"), "utf8")) as {
    format?: unknown;
    algorithm?: unknown;
    migrations?: unknown;
  };
  if (raw.format !== 1 || raw.algorithm !== "sha256-json-statements" || !Array.isArray(raw.migrations)) {
    throw new Error("Migratiemanifest heeft een onbekend formaat");
  }
  const entries = raw.migrations.map((value) => {
    const entry = value as Partial<MigrationManifestEntry>;
    if (!/^\d{14}$/.test(entry.version ?? "") || !/^[a-z0-9_]+$/.test(entry.name ?? "") || !/^[a-f0-9]{64}$/.test(entry.sha256 ?? "")) {
      throw new Error("Migratiemanifest bevat een ongeldige regel");
    }
    return entry as MigrationManifestEntry;
  });
  if (new Set(entries.map((entry) => entry.version)).size !== entries.length ||
      entries.some((entry, index) => index > 0 && entry.version <= entries[index - 1].version)) {
    throw new Error("Migratiemanifest is niet uniek en oplopend");
  }
  return entries;
}

export function assertMigrationHistory(
  expected: MigrationManifestEntry[],
  actual: MigrationHistoryRow[],
  requireComplete = false,
) {
  if (actual.length > expected.length || (requireComplete && actual.length !== expected.length)) {
    throw new Error("Migratiegeschiedenis heeft een onverwachte lengte");
  }
  actual.forEach((migration, index) => {
    const wanted = expected[index];
    if (!wanted || migration.version !== wanted.version || migration.name !== wanted.name ||
        hashMigrationStatements(migration.statements) !== wanted.sha256) {
      throw new Error(`Migratiegeschiedenis wijkt inhoudelijk af bij positie ${index + 1}`);
    }
  });
}
