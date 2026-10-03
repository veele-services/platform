import { readFileSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("staging deployment broker boundary", () => {
  it("attests one packaged release and delegates activation to the fixed broker", () => {
    const workflow = read(".github/workflows/deploy-staging.yml");
    const deploy = read("scripts/deploy-local.sh");
    expect(workflow).toContain("id-token: write");
    expect(workflow).toContain("attestations: write");
    expect(workflow).toContain("actions/attest@1e69f48acb82d1966a394da916b4c1698aa569d6");
    expect(workflow).toContain("scripts/package-release.sh");
    expect(deploy).toContain("/usr/local/sbin/fieldgrid-install-staging-release");
    expect(deploy).not.toContain("systemctl restart");
  });

  it("materializes the pnpm runtime graph and boots the packaged artifact before release", () => {
    const packaging = read("scripts/package-release.sh");
    const verification = read(".github/workflows/_verify.yml");
    const staging = read(".github/workflows/deploy-staging.yml");
    expect(packaging).toContain('pnpm_hoist_root="$standalone_root/node_modules/.pnpm/node_modules"');
    expect(packaging).toContain('rsync -aL "$pnpm_hoist_root/" "$work/release/node_modules/"');
    expect(packaging).toContain("require('@swc/helpers/_/_interop_require_default')");
    expect(verification).toContain("node scripts/test-release-artifact.mjs");
    expect(staging).toContain("node scripts/test-release-artifact.mjs");
  });

  it("prepares runtime secrets and backups only for encrypted hosted-runner handoff", () => {
    const runtime = read("scripts/write-runtime-env.sh");
    const backup = read("scripts/backup-database.ts");
    expect(runtime).toContain("RUNTIME_ENV_OUTPUT_PATH");
    expect(runtime).not.toContain("sudo");
    expect(backup).toContain("BACKUP_OUTPUT_PATH");
    expect(backup).toContain("docker.io/library/postgres:17.8-bookworm@sha256:");
    expect(backup).toContain('"--security-opt=no-new-privileges"');
    expect(backup).not.toContain("sudo");
  });

  it("keeps staging migrations prefix-only, dry-runs first and suppresses raw diagnostics", () => {
    const command = read("lib/env/staging-migration-command.ts");
    const migrate = read("scripts/migrate-staging.ts");
    const target = read("scripts/verify-migration-target.ts");
    expect(command).toContain('args.push("--dry-run")');
    expect(command).not.toContain('args.push("--include-all")');
    expect(migrate.indexOf('"dry-run"')).toBeLessThan(migrate.indexOf('"apply"'));
    expect(migrate).toContain("stagingMigrationDiagnostic(phase, failure, migrationNames)");
    expect(migrate).not.toMatch(/console\.(?:log|error)\([^\n]*\b(?:stderr|stdout)\b/);
    expect(migrate).not.toContain("console.error(failure");
    expect(target).toContain("to_regclass('public.permission_catalog')");
    expect(target).toContain("to_regclass('public.tickets')");
    expect(target).toContain("to_regclass('private.ticket_config')");
  });

  it("passes the canonical deployment contract into the hosted preflight", () => {
    const workflow = read(".github/workflows/deploy-staging.yml");
    const prepare = workflow.slice(workflow.indexOf("  prepare:"), workflow.indexOf("  deploy:"));
    expect(prepare).toContain("DEPLOY_ROOT: ${{ vars.DEPLOY_ROOT }}");
    expect(prepare).toContain("SERVICE_NAME: ${{ vars.SERVICE_NAME }}");
    expect(prepare).toContain("HEALTHCHECK_URL: ${{ vars.HEALTHCHECK_URL }}");
    expect(workflow).toContain("needs: [verify, host-preflight]");
    expect(workflow).toContain("Verify host contract before backup or migrations");
  });

  it("keeps fresh handoffs distinct across full reruns and downloads the prepared artifact by ID", () => {
    const workflow = read(".github/workflows/deploy-staging.yml");
    const prepare = workflow.slice(workflow.indexOf("  prepare:"), workflow.indexOf("  deploy:"));
    const deploy = workflow.slice(workflow.indexOf("  deploy:"), workflow.indexOf("  worker-acceptance:"));
    expect(prepare).toContain("handoff-artifact-id: ${{ steps.handoff.outputs.artifact-id }}");
    expect(prepare).toContain("id: handoff");
    expect(prepare).toContain("name: fieldgrid-staging-${{ github.sha }}-${{ github.run_attempt }}");
    expect(prepare).not.toContain("overwrite: true");
    expect(deploy).toContain("artifact-ids: ${{ needs.prepare.outputs.handoff-artifact-id }}");
    expect(deploy).not.toContain("name: fieldgrid-staging-");
    expect(deploy).not.toContain("github.run_attempt");
  });

  it("fails before artifact download when prepare has no exact artifact ID", () => {
    const workflow = read(".github/workflows/deploy-staging.yml");
    const deploy = workflow.slice(workflow.indexOf("  deploy:"), workflow.indexOf("  worker-acceptance:"));
    const guard = deploy.match(/      - name: Require the exact prepared handoff ID\n[\s\S]*?        run: \|\n((?:          .*\n)+)/);
    expect(guard).not.toBeNull();
    const script = guard![1].split("\n").map((line) => line.slice(10)).join("\n");
    expect(deploy.indexOf(guard![0])).toBeLessThan(deploy.indexOf("uses: actions/download-artifact@"));
    for (const value of ["", "0", "123,456", "*", "123suffix", "-1"]) {
      const result = spawnSync("bash", ["-euo", "pipefail", "-c", script], {
        encoding: "utf8", env: { NODE_ENV: "test", HANDOFF_ARTIFACT_ID: value },
      });
      expect(result.status, `Invalid artifact ID ${JSON.stringify(value)}`).toBe(1);
      expect(result.stderr).toContain("refusing artifact download");
    }
    const valid = spawnSync("bash", ["-euo", "pipefail", "-c", script], {
      encoding: "utf8", env: { NODE_ENV: "test", HANDOFF_ARTIFACT_ID: "11259889177" },
    });
    expect(valid.status).toBe(0);
  });

  it("retries worker acceptance independently of irreversible release activation", () => {
    const workflow = read(".github/workflows/deploy-staging.yml");
    const deploy = workflow.slice(workflow.indexOf("  deploy:"), workflow.indexOf("  worker-acceptance:"));
    const worker = workflow.slice(workflow.indexOf("  worker-acceptance:"), workflow.indexOf("  acceptance:"));
    const acceptance = workflow.slice(workflow.indexOf("  acceptance:"));
    expect(deploy).toContain("run: scripts/deploy-local.sh");
    expect(deploy).not.toMatch(/run: bash scripts\/check-worker-timer\.sh\s*$/m);
    expect(worker).toContain("needs: deploy");
    expect(worker).toContain("runs-on: [self-hosted, Linux, X64, fieldgrid-staging]");
    expect(worker).toContain("RELEASE_SHA: ${{ github.sha }}");
    expect(worker).toContain("ref: ${{ github.sha }}");
    const healthcheck = worker.indexOf("run: node scripts/verify-healthcheck.mjs");
    const workerGate = worker.indexOf("run: bash scripts/check-worker-timer.sh");
    expect(healthcheck).toBeGreaterThan(0);
    expect(workerGate).toBeGreaterThan(healthcheck);
    expect(worker).not.toMatch(/deploy-local|download-artifact|actions\/attest@|sudo|systemctl\s+(?:start|restart|enable)|\$\{\{ secrets\./);
    expect(acceptance).toContain("needs: worker-acceptance");
  });

  it("ships root-owned broker templates with strict artifact and identity checks", () => {
    expect(statSync("deploy/fieldgrid-install-staging-release").mode & 0o111).not.toBe(0);
    const broker = read("deploy/fieldgrid-install-staging-release");
    expect(broker).toContain("gh attestation verify");
    expect(broker).toContain("--deny-self-hosted-runners");
    expect(broker).toContain("--source-ref refs/heads/staging");
    expect(broker).toContain('--source-digest "$sha"');
    expect(broker).toContain("verifiedTimestamps");
    expect(broker).toContain("datetime.timedelta(hours=6)");
    expect(broker).toContain('[release.attestation.json]="$inbox/release.attestation.json"');
    expect(broker).toContain('[runtime.attestation.json]="$inbox/runtime.attestation.json"');
    expect(broker).toContain('[backup.attestation.json]="$inbox/backup.attestation.json"');
    const attestationCalls = [...broker.matchAll(/^verify_attestation\s+(\S+)\s+(\S+)$/gm)]
      .map((match) => [match[1], match[2]]);
    expect(attestationCalls).toEqual([
      ["release", "release.attestation.json"],
      ["runtime", "runtime.attestation.json"],
      ["backup", "backup.attestation.json"],
    ]);
    expect(attestationCalls.every(([, bundle]) => /\.jsonl?$/.test(bundle ?? ""))).toBe(true);
    expect(broker).toContain("openssl cms -decrypt");
    expect(broker).toContain("root:root:600:1");
    expect(broker).toContain("root:root:644:1");
    expect(broker).toContain("member.isfile() or member.isdir()");
    expect(broker).toContain('&& -f "$candidate/clamav-preflight.mjs"');
    expect(broker.match(/verify_attestation (release|runtime|backup) /g)).toHaveLength(3);
    expect(broker).toContain("chown -R root:fieldgrid");
    expect(broker).toContain("Een eerder geinstalleerde release mag niet opnieuw worden geactiveerd");
    expect(broker).toContain("systemctl restart fieldgrid@staging.service");
  });

  it("keeps all environment secrets off the persistent VPS runner", () => {
    const workflow = read(".github/workflows/deploy-staging.yml");
    const deployJob = workflow.slice(workflow.indexOf("  deploy:"), workflow.indexOf("  acceptance:"));
    expect(deployJob).not.toContain("${{ secrets.");
    expect(deployJob).not.toContain("actions/attest@");
    expect(deployJob).not.toContain("pnpm build");
    expect(workflow.slice(workflow.indexOf("  prepare:"), workflow.indexOf("  deploy:"))).toContain("runs-on: ubuntu-24.04");
  });
});
