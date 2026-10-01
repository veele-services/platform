import { readFileSync, statSync } from "node:fs";
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

  it("prepares runtime secrets and backups only for encrypted hosted-runner handoff", () => {
    const runtime = read("scripts/write-runtime-env.sh");
    const backup = read("scripts/backup-database.ts");
    expect(runtime).toContain("RUNTIME_ENV_OUTPUT_PATH");
    expect(runtime).not.toContain("sudo");
    expect(backup).toContain("BACKUP_OUTPUT_PATH");
    expect(backup).not.toContain("sudo");
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
    expect(broker).toContain("openssl cms -decrypt");
    expect(broker).toContain("root:root:600:1");
    expect(broker).toContain("root:root:644:1");
    expect(broker).toContain("member.isfile() or member.isdir()");
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
