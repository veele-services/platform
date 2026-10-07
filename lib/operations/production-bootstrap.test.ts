import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("platformbeheerbootstrap", () => {
  it("start onder de CommonJS packageconfiguratie en bereikt de projectref-guard", () => {
    const result = spawnSync(
      process.execPath,
      [resolve("node_modules/tsx/dist/cli.mjs"), resolve("scripts/bootstrap-production-admin.ts")],
      {
        encoding: "utf8",
        env: {
          ...process.env,
          DEPLOY_TARGET: "production",
          APP_ENV: "production",
          SUPABASE_URL: "https://abcdefghijklmnopqrst.supabase.co",
          SUPABASE_SERVICE_ROLE_KEY: "local-test-key",
          FIELDGRID_ADMIN_EMAIL: "admin@example.invalid",
          FIELDGRID_ADMIN_PASSWORD: "",
          STAGING_SUPABASE_PROJECT_REF: "cccccccccccccccccccc",
          EXPECTED_SUPABASE_PROJECT_REF: "bbbbbbbbbbbbbbbbbbbb",
          FORBIDDEN_SUPABASE_PROJECT_REF: "ckdtiuemeygrnujjibnw",
        },
      },
    );
    const output = `${result.stdout}${result.stderr}`;

    expect(result.status).not.toBe(0);
    expect(output).toContain("Supabase-URL is niet aantoonbaar het productieproject; verbinding geweigerd.");
    expect(output).not.toContain("Top-level await");
    expect(output).not.toContain("test-password-only");
    expect(output).not.toContain("local-test-key");
  });
});
