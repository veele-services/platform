import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("hosted rollback-only staging acceptance", () => {
  const workflow = readFileSync(".github/workflows/deploy-staging.yml", "utf8");
  const acceptance = workflow.slice(workflow.indexOf("\n  acceptance:"));

  it("serializes fixture files that hold the shared notification-policy transaction lock", () => {
    const fixtureSteps = acceptance.split("      - name:").filter((step) => step.includes("FIELDGRID_STAGING_SMOKE:"));
    expect(fixtureSteps).toHaveLength(2);
    for (const step of fixtureSteps) {
      expect(step).toMatch(/run: node --test --test-concurrency=1 scripts\//);
      expect(step).not.toMatch(/continue-on-error|if:.*false|--test-skip-pattern|--test-name-pattern/);
    }
  });

  it("retains all work-order, ticket and delivery probes after exact-SHA and worker checks", () => {
    expect(acceptance).toContain("needs: worker-acceptance");
    expect(acceptance).toContain("run: node scripts/verify-healthcheck.mjs");
    for (const script of ["test-work-orders", "test-work-order-reports", "test-work-order-lineage", "test-tickets", "test-ticket-delivery"]) {
      expect(acceptance).toContain(`scripts/${script}.mjs`);
    }
    expect(acceptance.match(/FIELDGRID_STAGING_SMOKE: "1"/g)).toHaveLength(2);
    expect(acceptance).toContain("SUPABASE_URL: ${{ secrets.NEXT_PUBLIC_SUPABASE_URL }}");
    expect(acceptance).toContain("MIGRATION_DATABASE_URL: ${{ secrets.MIGRATION_DATABASE_URL }}");
  });
});
