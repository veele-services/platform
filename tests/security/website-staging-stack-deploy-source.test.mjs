import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { hasExactRootNopasswdCommand } from "../../scripts/fieldgrid-sudo-nopasswd-policy.mjs";

const read = (path) => readFileSync(path, "utf8");

test("website stack workflow is manual, exact-ref and staging-only", () => {
  const workflow = read(".github/workflows/website-staging-stack-deploy.yml");

  assert.match(workflow, /workflow_dispatch:/u);
  assert.match(workflow, /github\.ref_name == 'staging'/u);
  assert.match(workflow, /website-staging-stack-only/u);
  assert.match(workflow, /persist-credentials: false/u);
  assert.match(
    workflow,
    /node --input-type=module[\s\S]*api\.github\.com[\s\S]*git\/ref\/heads\/staging/u,
  );
  assert.match(
    workflow,
    /Authorization: `Bearer \$\{process\.env\.GITHUB_TOKEN\}`/u,
  );
  assert.doesNotMatch(workflow, /\bgh\s+api\b/u);
  assert.match(workflow, /test "\$remote" = "\$expected"/u);
  assert.doesNotMatch(workflow, /\bpush:|git push|heads\/production/u);
});

test("website stack services are separate, local-only and hardened", () => {
  const website = read("ops/systemd/veele-staging-website.service");
  const marketing = read("ops/systemd/veele-staging-marketing.service");

  assert.match(website, /Environment=PORT=3305/u);
  assert.match(website, /@workspace\/website-runtime/u);
  assert.match(website, /shared\/website\.env/u);
  assert.match(marketing, /Environment=PORT=3306/u);
  assert.match(marketing, /@workspace\/marketing-website/u);
  assert.match(marketing, /shared\/marketing\.env/u);
  for (const unit of [website, marketing]) {
    assert.match(unit, /User=github-runner/u);
    assert.match(unit, /NoNewPrivileges=true/u);
    assert.match(unit, /ProtectSystem=strict/u);
    assert.match(unit, /ProtectHome=true/u);
  }
});

test("website stack sudoers grants only exact staging controls", () => {
  const sudoers = read("ops/sudoers/veele-staging-website-stack");

  assert.match(
    sudoers,
    /\/usr\/bin\/systemctl restart veele-staging-website veele-staging-marketing/u,
  );
  assert.match(
    sudoers,
    /\/usr\/bin\/systemctl stop veele-staging-website veele-staging-marketing/u,
  );
  assert.match(sudoers, /\/usr\/bin\/systemctl reload caddy/u);
  assert.match(
    sudoers,
    /github-runner ALL=\(root\) NOPASSWD: FIELDGRID_WEBSITE_STACK_CONTROL/u,
  );
  assert.doesNotMatch(sudoers, /\*/u);
  assert.doesNotMatch(sudoers, /\b(?:start|enable|disable|daemon-reload)\b/u);
  assert.doesNotMatch(
    sudoers,
    /\/(?:bin|usr\/bin)\/(?:cp|install|mv|rm|tee)\b/u,
  );
  assert.doesNotMatch(sudoers, /production/u);
});

test("Caddy keeps application prefixes ahead of the website fallback", () => {
  const caddy = read("ops/caddy/fieldgrid-website-staging.caddy");
  const fallback = caddy.lastIndexOf("reverse_proxy 127.0.0.1:3305");

  for (const [path, port] of [
    ["/admin /admin/*", "3301"],
    ["/personeel /personeel/*", "3302"],
    ["/klant /klant/*", "3303"],
    ["/api /api/*", "3304"],
  ]) {
    const route = caddy.indexOf(path);
    assert.ok(route >= 0, `${path} route must exist`);
    assert.ok(
      caddy.indexOf(`reverse_proxy 127.0.0.1:${port}`, route) < fallback,
    );
  }
  assert.match(caddy, /website-runtime\.staging\.fieldgrid\.nl/u);
  assert.match(caddy, /managed\.staging\.fieldgrid\.nl/u);
  assert.match(caddy, /veele\.staging\.fieldgrid\.nl/u);
  assert.match(caddy, /veele-origin\.staging\.fieldgrid\.nl/u);
  assert.doesNotMatch(caddy, /handle_path/u);
});

test("deploy script isolates secrets and has explicit rollback", () => {
  const script = read("scripts/fieldgrid-website-staging-stack-deploy.sh");
  const websiteEnvironment = script.slice(
    script.indexOf("printf 'DATABASE_URL=%s"),
    script.indexOf('} > "$BASE_DIR/shared/website.env"'),
  );
  const marketingEnvironment = script.slice(
    script.indexOf('} > "$BASE_DIR/shared/website.env"'),
    script.indexOf('} > "$BASE_DIR/shared/marketing.env"'),
  );

  assert.match(websiteEnvironment, /DATABASE_URL/u);
  assert.doesNotMatch(marketingEnvironment, /DATABASE_URL/u);
  assert.match(
    script,
    /FIELDGRID_CUSTOM_RELEASE_ID.*git-commit:\$EXPECTED_SHA/u,
  );
  assert.match(script, /trap rollback ERR/u);
  assert.match(script, /release-restored/u);
  assert.match(script, /require_preprovisioned_asset/u);
  assert.doesNotMatch(script, /SUDOERS_TARGET/u);
  assert.doesNotMatch(
    script,
    /(?:\[ -[ef] |stat -c|cmp -s).*\/etc\/sudoers\.d/u,
  );
  assert.doesNotMatch(script, /stat -c '%u:%g:%a'/u);
  assert.match(
    script,
    /listing="\$\(LC_ALL=C sudo -n -ll "\$@" 2>\/dev\/null\)"/u,
  );
  assert.match(script, /node "\$SUDO_POLICY_CHECKER" "\$@"/u);
  assert.match(
    script,
    /require_nopasswd_control "exact website restart" \\\n  \/usr\/bin\/systemctl restart \\\n  veele-staging-website veele-staging-marketing/u,
  );
  assert.match(
    script,
    /require_nopasswd_control "exact website stop" \\\n  \/usr\/bin\/systemctl stop \\\n  veele-staging-website veele-staging-marketing/u,
  );
  assert.match(
    script,
    /require_nopasswd_control "exact Caddy reload" \\\n  \/usr\/bin\/systemctl reload caddy/u,
  );
  assert.match(script, /systemctl is-enabled --quiet/u);
  assert.match(script, /caddy adapt --config "\$CADDYFILE"/u);
  assert.match(script, /sudo systemctl reload caddy/u);
  assert.doesNotMatch(
    script,
    /sudo (?:install|cp|mkdir|rm|tee)|sudo systemctl enable/u,
  );
  assert.match(script, /productionChanged": false/u);
  assert.doesNotMatch(script, /\/var\/www\/veele\/production/u);
});

test("sudo capability parser requires exact root NOPASSWD controls", () => {
  const restart =
    "/usr/bin/systemctl restart veele-staging-website veele-staging-marketing";
  const exactNopasswd = `Matching Defaults entries for github-runner on Veele:

Sudoers entry:
    RunAsUsers: root
    Options: !authenticate
    Commands:
        ${restart}
`;
  const passwordedTargetWithUnrelatedNopasswd = `Sudoers entry:
    RunAsUsers: root
    Commands:
        ${restart}

Sudoers entry:
    RunAsUsers: root
    Options: !authenticate
    Commands:
        /usr/bin/true
`;
  const broaderRunAs = `Sudoers entry:
    RunAsUsers: ALL
    Options: !authenticate
    Commands:
        ${restart}
`;
  const wildcard = `Sudoers entry:
    RunAsUsers: root
    Options: !authenticate
    Commands:
        /usr/bin/systemctl *
`;

  assert.equal(hasExactRootNopasswdCommand(exactNopasswd, restart), true);
  assert.equal(
    hasExactRootNopasswdCommand(
      passwordedTargetWithUnrelatedNopasswd,
      restart,
    ),
    false,
  );
  assert.equal(hasExactRootNopasswdCommand(broaderRunAs, restart), false);
  assert.equal(hasExactRootNopasswdCommand(wildcard, restart), false);
});

test("Phase 9 close-out defers high-impact choices and excludes production", () => {
  const closeout = read("docs/website-module-phase9-closeout.md");
  const runbook = read("docs/website-module-enterprise-activation.md");

  assert.match(closeout, /initial four-service staging deploy/u);
  assert.match(closeout, /six-service gate/u);
  assert.match(closeout, /Deferred high-impact decisions/u);
  assert.match(closeout, /Production ready: false/u);
  assert.match(closeout, /Production changed: false/u);
  assert.match(runbook, /website-staging-stack-only/u);
  assert.match(runbook, /FIELDGRID_WEBSITE_FORM_ID/u);
});
