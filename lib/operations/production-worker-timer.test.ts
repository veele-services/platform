import { afterAll, describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const fixtures = mkdtempSync(join(tmpdir(), "fieldgrid-timer-test-"));
writeFileSync(join(fixtures, "systemctl"), `#!/usr/bin/env bash
if test "$1" = is-active; then
  if test "$SCENARIO" = resume; then
    if ! test -f "$TIMER_MARKER"; then touch "$TIMER_MARKER"; exit 1; fi
  fi
  test "$SCENARIO" != inactive; exit $?
fi
case "$*" in
  *LoadState*) if test "$SCENARIO" = missing; then echo not-found; else echo loaded; fi;;
  *Triggers*) if test "$SCENARIO" = wrong-target; then echo unrelated.service; else echo fieldgrid-worker@production.service; fi;;
  *ActiveEnterTimestampMonotonic*) echo 100;;
  *ExecMainStartTimestampMonotonic*) if test "$SCENARIO" = old; then echo 50; else echo 200; fi;;
  *ExecMainExitTimestampMonotonic*) echo 300;;
  *ActiveState*) echo inactive;;
  *Result*) if test "$SCENARIO" = failed; then echo exit-code; else echo success; fi;;
  *) exit 99;;
esac
`, { mode: 0o700 });
writeFileSync(join(fixtures, "sleep"), "#!/bin/sh\nexit 0\n", { mode: 0o700 });
afterAll(() => rmSync(fixtures, { recursive: true }));
function check(scenario: string, target = "production", mode?: string) {
  return spawnSync("bash", ["scripts/check-production-worker-timer.sh", ...(mode ? [mode] : [])], { encoding: "utf8", env: { NODE_ENV: "test", PATH: `${fixtures}:${process.env.PATH}`, DEPLOY_TARGET: target, SERVICE_NAME: "fieldgrid@production.service", SCENARIO: scenario, TIMER_MARKER: join(fixtures, "resumed") } });
}
describe("read-only release worker gate", () => {
  it("keeps the worker bearer value out of process arguments", () => {
    const unit = readFileSync("deploy/fieldgrid-worker@.service", "utf8");
    expect(unit).toContain("ExecStart=/usr/bin/env node worker-client.mjs");
    expect(unit).toContain("ProtectProc=invisible");
    expect(unit).not.toContain("${ADMIN_API_SECRET}");
    expect(readFileSync("scripts/run-worker.mjs", "utf8")).toContain("authorization: `Bearer ${secret}`");
  });
  it("accepts a successfully finished invocation started after the web release", () => { const r = check("healthy"); expect(r.status).toBe(0); expect(r.stdout).toContain("fresh"); });
  it("does not accept an old worker invocation that finished after activation", () => { const r = check("old"); expect(r.status).toBe(1); expect(r.stderr).toContain("No fresh"); });
  it("does not accept an installed timer that remains inactive", () => { const r = check("inactive"); expect(r.status).toBe(1); expect(r.stderr).toContain("inactive"); expect(r.stderr).toContain("No fresh"); });
  it("allows an operator-paused installed timer before migration without claiming runtime success", () => { const r = check("inactive", "production", "--installed"); expect(r.status).toBe(0); expect(r.stdout).toContain("final acceptance still requires"); });
  it("waits for operator resumption and then proves a fresh successful invocation", () => { const r = check("resume"); expect(r.status).toBe(0); expect(r.stderr).toContain("operator must resume"); expect(r.stdout).toContain("completed successfully"); });
  it.each(["missing", "wrong-target"])("rejects %s timer configuration even during preflight", scenario => { expect(check(scenario, "production", "--installed").status).toBe(1); expect(check(scenario).status).toBe(1); });
  it("rejects unknown modes", () => expect(check("healthy", "production", "--skip").status).toBe(1));
  it("blocks a freshly failed invocation", () => { const r = check("failed"); expect(r.status).toBe(1); expect(r.stderr).toContain("failed"); });
  it("will not inspect staging", () => expect(check("healthy", "staging").status).toBe(1));
});
