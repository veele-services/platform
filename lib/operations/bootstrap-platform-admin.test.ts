import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("platformbeheerbootstrap", () => {
  it("start onder de CommonJS packageconfiguratie en bereikt de projectref-guard", () => {
    const result = spawnSync(
      process.execPath,
      [resolve("node_modules/tsx/dist/cli.mjs"), resolve("scripts/bootstrap-platform-admin.ts")],
      {
        encoding: "utf8",
        env: {
          ...process.env,
          SUPABASE_URL: "https://abcdefghijklmnopqrst.supabase.co",
          SUPABASE_SERVICE_ROLE_KEY: "local-test-key",
          FIELDGRID_ADMIN_EMAIL: "admin@example.invalid",
          FIELDGRID_ADMIN_PASSWORD: "test-password-only",
          EXPECTED_SUPABASE_PROJECT_REF: "bbbbbbbbbbbbbbbbbbbb",
          FORBIDDEN_SUPABASE_PROJECT_REF: "ckdtiuemeygrnujjibnw",
        },
      },
    );
    const output = `${result.stdout}${result.stderr}`;

    expect(result.status).not.toBe(0);
    expect(output).toContain("Platformbeheerbootstrap weigert het geconfigureerde Supabaseproject");
    expect(output).not.toContain("Top-level await");
  });
});
