import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const digest = "sha256:3783cc01769c7b2b1b83a5c5ad96c815348e28ed7da68e2e3687004faa906251";
const primary = `public.ecr.aws/docker/library/debian:bookworm-slim@${digest}`;
const fallback = `docker.io/library/debian:bookworm-slim@${digest}`;

function run(scenario: string, args: string[] = []) {
  const directory = mkdtempSync(join(tmpdir(), "fieldgrid-contract-image-"));
  try {
    writeFileSync(join(directory, "docker"), `#!/usr/bin/env bash
set -euo pipefail
printf '%s\\n' "$*" >> "$CONTRACT_LOG"
image="\${!#}"
if [[ "$1 $2" = 'image inspect' ]]; then
  [[ "$CONTRACT_SCENARIO" = cached ]] ||
    { [[ "$CONTRACT_SCENARIO" != unverified ]] && [[ -f "$CONTRACT_STATE" ]] && [[ "$(cat "$CONTRACT_STATE")" = "$image" ]]; }
elif [[ "$1" = pull ]]; then
  [[ "$CONTRACT_SCENARIO" != unavailable ]] || exit 1
  if [[ "$CONTRACT_SCENARIO" = fallback && "$image" = public.ecr.aws/* ]]; then exit 1; fi
  printf '%s' "$image" > "$CONTRACT_STATE"
else
  exit 99
fi
`, { mode: 0o755 });
    const result = spawnSync("bash", ["scripts/contract-test-image.sh", ...args], {
      encoding: "utf8",
      env: { NODE_ENV: "test", PATH: `${directory}:${process.env.PATH}`, CONTRACT_SCENARIO: scenario, CONTRACT_LOG: join(directory, "calls"), CONTRACT_STATE: join(directory, "state") },
    });
    let calls = "";
    try { calls = readFileSync(join(directory, "calls"), "utf8"); } catch { /* Argument rejection must not invoke Docker. */ }
    return { ...result, calls };
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

describe("immutable Linux contract image transport", () => {
  it("uses an already present pinned image without network access", () => {
    const result = run("cached");
    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe(primary);
    expect(result.calls).not.toContain("pull");
  });

  it("downloads the approved primary digest and verifies its presence", () => {
    const result = run("primary");
    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe(primary);
    expect(result.calls).toContain(`pull --quiet ${primary}`);
    expect(result.calls).not.toContain(fallback);
  });

  it("recovers a primary registry failure with the identical Docker Hub digest", () => {
    const result = run("fallback");
    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe(fallback);
    expect(result.calls.match(/pull --quiet/g)).toHaveLength(2);
    expect(result.calls).toContain(`pull --quiet ${primary}`);
    expect(result.calls).toContain(`pull --quiet ${fallback}`);
  });

  it("fails closed after both transports fail", () => {
    const result = run("unavailable");
    expect(result.status).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.calls.match(/pull --quiet/g)).toHaveLength(2);
  });

  it("rejects a successful pull that leaves no verifiable pinned image", () => {
    const result = run("unverified");
    expect(result.status).toBe(1);
    expect(result.stdout).toBe("");
  });

  it("refuses caller-supplied mutable tags or registry overrides", () => {
    const result = run("cached", ["debian:latest"]);
    expect(result.status).toBe(1);
    expect(result.calls).toBe("");
    expect(result.stdout).toBe("");
  });
});
