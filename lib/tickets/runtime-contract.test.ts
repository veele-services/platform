import { readFileSync, mkdtempSync, statSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { expect, it } from "vitest";
const source = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
it("web/worker reference one runtime file and only the web runtime probes the scanner", () => {
  const web = source("deploy/fieldgrid@.service"), worker = source("deploy/fieldgrid-worker@.service");
  for (const unit of [web, worker]) expect(unit).toContain("EnvironmentFile=/opt/fieldgrid/%i/shared/runtime.env");
  expect(web).toContain("Requires=clamav-daemon.service"); expect(web).toContain("SupplementaryGroups=clamav"); expect(web).toContain("ExecStartPre=/usr/bin/test -S /run/clamav/clamd.ctl");
  expect(web).toContain("ExecStartPre=/usr/bin/env node clamav-preflight.mjs");
  expect(web).not.toContain("ExecStartPre=/usr/bin/test -w /run/clamav/clamd.ctl");
  const workflow = source(".github/workflows/deploy-staging.yml");
  expect(workflow).toContain("bash scripts/check-staging-runner-contract.sh");
  expect(workflow).not.toContain("check-staging-root-contract.sh");
  expect(workflow).not.toContain("check-staging-runtime-contract.sh");
  expect(workflow).not.toContain("tickets:scanner-check");
  const healthcheck = source("scripts/verify-healthcheck.mjs");
  expect(healthcheck).toContain('body.scanner !== "ready"');
  expect(healthcheck.indexOf("if (!response.ok)")).toBeLessThan(healthcheck.indexOf("await response.json()"));
  expect(healthcheck).not.toContain("await response.text()");
});
it("keeps protected metadata in the root check and outside the runner check", () => {
  const root = source("scripts/check-staging-root-contract.sh");
  const runner = source("scripts/check-staging-runner-contract.sh");
  expect(root).toContain("/etc/fieldgrid");
  expect(root).toContain("staging-handoff.key");
  expect(root).toContain("github-attestation-trusted-root.jsonl");
  expect(root).toContain("shared/runtime.env");
  expect(runner).not.toContain("staging-handoff.key");
  expect(runner).not.toContain("staging-handoff.crt");
  expect(runner).not.toContain("github-attestation-trusted-root.jsonl");
  expect(runner).toContain("Runner must have exactly one passwordless sudo command");
  expect(source("scripts/test-staging-contract-linux.sh")).toContain("runuser -u fieldgrid-runner");
});
it("writes a private hosted-runner payload atomically without logging values", () => {
  const root = mkdtempSync(join(tmpdir(), "fieldgrid-runtime-contract-"));
  try {
    const path = join(root, "fieldgrid-staging-runtime.env");
    const output = execFileSync("bash", ["scripts/write-runtime-env.sh"], { cwd: process.cwd(), encoding: "utf8", env: { NODE_ENV: "test", PATH: process.env.PATH, RUNNER_TEMP: root, RUNTIME_ENV_OUTPUT_PATH: path, DEPLOY_TARGET: "staging", CLAMAV_ENABLED: "true", CLAMAV_SOCKET: "/run/clamav/clamd.ctl", SUPABASE_SEND_EMAIL_HOOK_SECRET: "FICTITIOUS-TEST-ONLY-NOT-A-SECRET" } });
    const text = readFileSync(path, "utf8");
    expect(text).toContain('CLAMAV_ENABLED="true"'); expect(text).toContain('CLAMAV_SOCKET="/run/clamav/clamd.ctl"');
    expect(statSync(path).mode & 0o777).toBe(0o600); expect(output).not.toContain("FICTITIOUS");
    expect(text).not.toContain("TICKET_CLAMAV_");
  } finally { rmSync(root, { recursive: true, force: true }); }
});
