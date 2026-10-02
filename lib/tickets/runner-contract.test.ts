import { afterAll, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const fixtures = mkdtempSync(join(tmpdir(), "fieldgrid-runner-contract-"));
const probe = join(fixtures, "incoming-probe");
const protectedProbe = join(fixtures, "protected-probe");
writeFileSync(join(fixtures, "id"), `#!/bin/sh
case "$*" in
 '-u fieldgrid') echo 1001;;
 '-u') if test "$SCENARIO" = same; then echo 1001; elif test "$SCENARIO" = root; then echo 0; else echo 1002; fi;;
 '-un') if test "$SCENARIO" = wrong_user; then echo other-runner; else echo fieldgrid-runner; fi;;
 '-gn') if test "$SCENARIO" = wrong_primary; then echo fieldgrid; else echo fieldgrid-runner; fi;;
 '-nG') if test "$SCENARIO" = runner_group; then echo 'fieldgrid-runner fieldgrid clamav'; elif test "$SCENARIO" = other_group; then echo 'fieldgrid-runner docker'; else echo 'fieldgrid-runner'; fi;;
 '-nG fieldgrid') if test "$SCENARIO" = runtime_group; then echo fieldgrid; else echo 'fieldgrid clamav'; fi;;
 *) exit 99;;
esac
`, { mode: 0o700 });
writeFileSync(join(fixtures, "stat"), `#!/bin/sh
case "$*" in
 *'/opt/fieldgrid/staging') if test "$SCENARIO" = root_mode; then echo 'root:root:755'; else echo 'root:root:711'; fi;;
 *'/opt/fieldgrid/staging/incoming') if test "$SCENARIO" = incoming_mode; then echo 'fieldgrid-runner:fieldgrid:770'; else echo 'fieldgrid-runner:fieldgrid-runner:700'; fi;;
 *'/usr/local/sbin/fieldgrid-install-staging-release') echo 'root:root:755:1';;
 *) exit 99;;
esac
`, { mode: 0o700 });
writeFileSync(join(fixtures, "mktemp"), `#!/bin/sh
case "$*" in
 *'/opt/fieldgrid/staging/incoming/'*)
   test "$SCENARIO" != incoming_denied || exit 1
   /usr/bin/mkdir "$RUNNER_PROBE" && echo "$RUNNER_PROBE";;
 *)
   test "$SCENARIO" = protected_write || exit 1
   /usr/bin/mkdir "$PROTECTED_PROBE" && echo "$PROTECTED_PROBE";;
esac
`, { mode: 0o700 });
writeFileSync(join(fixtures, "sudo"), `#!/bin/sh
test "$*" = '--non-interactive --list' || exit 99
case "$SCENARIO" in
 broad_sudo) echo '(root) NOPASSWD: ALL';;
 extra_sudo) printf '%s\n' '(root) NOPASSWD: /usr/local/sbin/fieldgrid-install-staging-release ""' '(root) NOPASSWD: /usr/bin/systemctl restart *';;
 password_sudo) printf '%s\n' '(root) NOPASSWD: /usr/local/sbin/fieldgrid-install-staging-release ""' '(root) PASSWD: /bin/sh';;
 *) echo '(root) NOPASSWD: /usr/local/sbin/fieldgrid-install-staging-release ""';;
esac
`, { mode: 0o700 });
writeFileSync(join(fixtures, "systemctl"), `#!/bin/sh
case "$*" in
 is-active*) test "$SCENARIO" != daemon_off;;
 *--property=User*) echo fieldgrid;;
 *--property=Group*) if test "$SCENARIO" = wrong_unit_group; then echo other; else echo fieldgrid; fi;;
 *--property=EnvironmentFiles*) if test "$SCENARIO" = old_env; then echo '/opt/fieldgrid/staging/shared/fieldgrid.env (ignore_errors=no)'; else echo '/opt/fieldgrid/staging/shared/runtime.env (ignore_errors=no)'; fi;;
 *--property=SupplementaryGroups*) if test "$SCENARIO" = no_supplement; then echo fieldgrid; else echo clamav; fi;;
 *--property=Requires*) if test "$SCENARIO" = no_requirement; then echo basic.target; else echo 'basic.target clamav-daemon.service'; fi;;
 *) exit 99;;
esac
`, { mode: 0o700 });
for (const dependency of ["gh", "openssl", "python3", "node"]) {
  writeFileSync(join(fixtures, dependency), "#!/bin/sh\nexit 0\n", { mode: 0o700 });
}
writeFileSync(join(fixtures, "pg_restore"), `#!/bin/sh
test "$1" = --version || exit 0
if test "$SCENARIO" = old_pg_restore; then echo 'pg_restore (PostgreSQL) 16.15'; else echo 'pg_restore (PostgreSQL) 17.8'; fi
`, { mode: 0o700 });

afterAll(() => rmSync(fixtures, { recursive: true, force: true }));

function check(scenario: string) {
  rmSync(probe, { recursive: true, force: true });
  rmSync(protectedProbe, { recursive: true, force: true });
  return spawnSync("bash", ["scripts/check-staging-runner-contract.sh"], {
    encoding: "utf8",
    env: {
      NODE_ENV: "test",
      PATH: `${fixtures}:${process.env.PATH}`,
      DEPLOY_TARGET: "staging",
      DEPLOY_ROOT: "/opt/fieldgrid/staging",
      SERVICE_NAME: "fieldgrid@staging.service",
      CLAMAV_ENABLED: "true",
      CLAMAV_SOCKET: "/run/clamav/clamd.ctl",
      SCENARIO: scenario,
      RUNNER_PROBE: probe,
      PROTECTED_PROBE: protectedProbe,
    },
  });
}

it("permits only the separated transfer runner with one fixed broker", () => {
  const result = check("healthy");
  expect(result.status).toBe(0);
  expect(result.stdout).toContain("denial and public unit contract verified");
});

it.each([
  "same", "root", "wrong_user", "wrong_primary", "runner_group", "other_group", "runtime_group",
  "root_mode", "incoming_mode", "incoming_denied", "protected_write", "broad_sudo",
  "extra_sudo", "password_sudo", "daemon_off", "old_env", "wrong_unit_group", "no_supplement", "no_requirement",
  "old_pg_restore",
])("refuses the unsafe or incomplete runner contract: %s", scenario => {
  expect(check(scenario).status).toBe(1);
});
