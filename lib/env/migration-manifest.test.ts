import { describe, expect, it } from "vitest";
import { assertMigrationHistory, hashMigrationStatements } from "../../scripts/migration-manifest";

const statements = ["create table public.example(id uuid)", "alter table public.example enable row level security"];
const manifest = [{ version: "20260101000000", name: "example", sha256: hashMigrationStatements(statements) }];

describe("migration content manifest", () => {
  it("accepts only the exact parsed statement history", () => {
    expect(() => assertMigrationHistory(manifest, [{ version: "20260101000000", name: "example", statements }], true)).not.toThrow();
  });
  it("rejects a changed historical body with the same version and name", () => {
    expect(() => assertMigrationHistory(manifest, [{ version: "20260101000000", name: "example", statements: [statements[0], "revoke all on public.example from authenticated"] }], true)).toThrow(/inhoudelijk/);
  });
  it("distinguishes a valid prefix from an incomplete post-migration history", () => {
    expect(() => assertMigrationHistory(manifest, [], false)).not.toThrow();
    expect(() => assertMigrationHistory(manifest, [], true)).toThrow(/lengte/);
  });
});
