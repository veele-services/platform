import { describe, expect, it } from "vitest";
import { STAGING_MIGRATION_CONFIG } from "./staging-migration-config";

describe("isolated staging migration configuration", () => {
  it("enables only migrations and cannot resolve vault or seed values", () => {
    expect(STAGING_MIGRATION_CONFIG).toContain("[db.migrations]\nenabled = true");
    expect(STAGING_MIGRATION_CONFIG).toContain("[db.seed]\nenabled = false");
    expect(STAGING_MIGRATION_CONFIG).not.toMatch(/\[db\.vault\]|env\(|secret|seed\.sql/i);
  });
});
