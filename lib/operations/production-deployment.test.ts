import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { productionRuntimeFixture, productionPromotionFixture } from "../../tests/fixtures/production-env";

const read = (path: string) => readFileSync(path, "utf8");
const promotion = await import(pathToFileURL(join(process.cwd(), "scripts/verify-production-promotion.mjs")).href) as { verifyProductionPromotion: (env: Record<string, string>, fetcher: typeof fetch) => Promise<void> };

describe("explicit production promotion", () => {
  const env = productionPromotionFixture;
  const fetcher = (patch: Record<string, unknown> = {}) => vi.fn(async (target: URL | RequestInfo) => {
    const workflow = String(target).includes("deploy-staging.yml") ? "deploy-staging.yml" : "ci.yml";
    const branch = workflow === "ci.yml" ? "main" : "staging";
    return Response.json({ workflow_runs: [{ head_sha: env.RELEASE_SHA, head_branch: branch, event: "push", status: "completed", conclusion: "success", path: `.github/workflows/${workflow}`, repository: { full_name: env.GITHUB_REPOSITORY }, ...patch }] });
  });
  it("requires both exact green main CI and staging deployment, using only an ephemeral GitHub credential", async () => {
    const api = fetcher();
    await promotion.verifyProductionPromotion(env, api);
    expect(api).toHaveBeenCalledTimes(2);
    for (const [target] of api.mock.calls) expect(new URL(String(target)).searchParams.get("head_sha")).toBe(env.RELEASE_SHA);
  });
  it.each([{ ACCEPTED_RELEASE_SHA: "b".repeat(40) }, { GITHUB_REF: "refs/heads/main" }, { GITHUB_REF: "refs/tags/production" }, { GITHUB_REPOSITORY: "untrusted/repository" }, { GH_TOKEN: "" }])("rejects unaccepted SHA or wrong source before API access: %o", async patch => {
    const api = fetcher();
    await expect(promotion.verifyProductionPromotion({ ...env, ...patch }, api)).rejects.toThrow("acceptatie");
    expect(api).not.toHaveBeenCalled();
  });
  it.each([{ head_sha: "b".repeat(40) }, { conclusion: "failure" }, { status: "in_progress" }, { head_branch: "other" }, { event: "pull_request" }, { path: ".github/workflows/untrusted.yml" }, { repository: { full_name: "untrusted/repository" } }])("rejects partial or unrelated green evidence: %o", async patch => {
    await expect(promotion.verifyProductionPromotion(env, fetcher(patch))).rejects.toThrow("mist");
  });
  it("redacts API failures and does not follow redirects with a credential", async () => {
    const api = vi.fn(async (_target: URL | RequestInfo, options?: RequestInit) => {
      expect(options?.redirect).toBe("error");
      throw new Error(env.GH_TOKEN);
    });
    await expect(promotion.verifyProductionPromotion(env, api)).rejects.toThrow("veilig");
  });
});

describe("production runtime transfer and activation boundary", () => {
  function brokerRuntime(overrides: Record<string, string | undefined> = {}, suffix = "") {
    const directory = mkdtempSync(join(tmpdir(), "fieldgrid-production-broker-test-"));
    try {
      const env = { NODE_ENV: "production", RELEASE_SHA: "a".repeat(40), DEPLOYMENT_VERSION: "a".repeat(40), ...productionRuntimeFixture(), ...overrides };
      const path = join(directory, "runtime.env");
      writeFileSync(path, Object.entries(env).filter(([, value]) => value !== undefined).map(([key, value]) => `${key}="${value!.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`).join("\n") + "\n" + suffix, { mode: 0o600 });
      const broker = read("deploy/fieldgrid-install-production-release");
      const validator = broker.match(/\/usr\/bin\/python3 - "\$runtime_candidate" "\$sha" <<'PY'\n([\s\S]*?)\nPY/);
      expect(validator).not.toBeNull();
      return spawnSync("python3", ["-", path, "a".repeat(40)], { input: validator![1], encoding: "utf8" });
    } finally { rmSync(directory, { recursive: true, force: true }); }
  }
  it("validates decrypted production configuration independently of the transfer runner", () => expect(brokerRuntime().status).toBe(0));
  it.each([
    { PORT: "3301" }, { APP_ENV: "development" }, { APP_URL: "https://staging.fieldgrid.nl" },
    { EXPECTED_SUPABASE_PROJECT_REF: "bbbbbbbbbbbbbbbbbbbb", SUPABASE_URL: "https://bbbbbbbbbbbbbbbbbbbb.supabase.co", NEXT_PUBLIC_SUPABASE_URL: "https://bbbbbbbbbbbbbbbbbbbb.supabase.co" },
    { EXPECTED_SUPABASE_PROJECT_REF: "ckdtiuemeygrnujjibnw" }, { STAGING_SUPABASE_PROJECT_REF: "" }, { MOLLIE_API_KEY: "test_FICTITIOUS" }, { SUPABASE_SEND_EMAIL_HOOK_SECRET: "" }, { CLAMAV_ENABLED: "false" },
  ])("rejects stage/legacy targets or missing provider configuration: %o", patch => {
    const result = brokerRuntime(patch);
    expect(result.status).not.toBe(0); expect(result.stderr).not.toContain("FICTITIOUS");
  });
  it("rejects injected systemd settings, duplicates and shell syntax", () => {
    for (const suffix of ['LD_PRELOAD="/tmp/unsafe.so"\n', 'PORT="3302"\n', 'ADMIN_API_SECRET=$(unsafe)\n']) expect(brokerRuntime({}, suffix).status).not.toBe(0);
  });
  it("pins production-only attestations, host identities, root decryption and no-argument sudo", () => {
    const broker = read("deploy/fieldgrid-install-production-release");
    expect(broker).toContain("--source-ref refs/heads/production"); expect(broker).toContain("/deploy-production.yml");
    expect(broker).toContain("--deny-self-hosted-runners"); expect(broker).toContain('--source-digest "$sha"');
    expect(broker).toContain("datetime.timedelta(hours=6)"); expect(broker).toContain("production-handoff.key");
    expect(broker).toContain("openssl cms -decrypt"); expect(broker).toContain("root:fieldgrid-production");
    expect(broker).toContain("systemctl restart fieldgrid@production.service"); expect(broker).not.toContain("systemctl restart fieldgrid@staging");
    expect(read("deploy/fieldgrid-production-runner.sudoers")).toContain('fieldgrid-install-production-release ""');
    expect(read("deploy/fieldgrid@production.service.d/identity.conf")).toContain("User=fieldgrid-production");
    expect(read("deploy/fieldgrid-worker@production.service.d/identity.conf")).toContain("Group=fieldgrid-production");
  });
  it("keeps credentials and live-database fixtures off the production VPS runner and public acceptance", () => {
    const workflow = read(".github/workflows/deploy-production.yml");
    const host = workflow.slice(workflow.indexOf("  host-preflight:"), workflow.indexOf("  prepare:"));
    const deploy = workflow.slice(workflow.indexOf("  deploy:"), workflow.indexOf("  acceptance:"));
    const acceptance = workflow.slice(workflow.indexOf("  acceptance:"));
    for (const part of [host, deploy, acceptance]) expect(part).not.toContain("${{ secrets.");
    expect(acceptance).not.toMatch(/FIELDGRID_STAGING_SMOKE|test-work-orders|test-tickets|db:|migrate/);
    const prepare = workflow.slice(workflow.indexOf("  prepare:"), workflow.indexOf("  deploy:"));
    expect(prepare).toContain("runs-on: ubuntu-24.04"); expect(prepare).toContain("STAGING_SUPABASE_PROJECT_REF");
    expect(prepare.indexOf("run: pnpm build")).toBeLessThan(prepare.indexOf("scripts/migrate-production.ts"));
    expect(prepare.indexOf("scripts/backup-production-database.ts")).toBeLessThan(prepare.indexOf("scripts/migrate-production.ts"));
    expect(prepare).toContain("PRODUCTION_HANDOFF_ENCRYPTION_CERT_B64");
    expect(deploy).toContain("artifact-ids: ${{ needs.prepare.outputs.handoff-artifact-id }}");
    expect(workflow).toContain("needs: promotion"); expect(workflow).toContain("ACCEPTED_RELEASE_SHA");
  });
});
