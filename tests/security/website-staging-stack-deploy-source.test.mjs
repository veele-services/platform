import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readlinkSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { validateServiceNodePreflight } from "../../scripts/fieldgrid-service-node-preflight.mjs";
import {
  hasEffectiveExactRootNopasswdCommand,
  hasExactRootNopasswdCommand,
} from "../../scripts/fieldgrid-sudo-nopasswd-policy.mjs";

const read = (path) => readFileSync(path, "utf8");
const envTransactionLibrary = join(
  process.cwd(),
  "scripts",
  "fieldgrid-website-env-transaction.sh",
);

function environmentTransactionFixture(t, withPreviousRelease) {
  const root = mkdtempSync(join(tmpdir(), "fieldgrid-website-env-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const base = join(root, "stack");
  const shared = join(base, "shared");
  const release = join(base, "releases", "candidate");
  const candidateDirectory = join(release, ".fieldgrid-candidate-env");
  const current = join(base, "current");
  mkdirSync(candidateDirectory, { recursive: true });
  mkdirSync(shared, { recursive: true });
  const websiteCandidate = join(candidateDirectory, "website.env");
  const marketingCandidate = join(candidateDirectory, "marketing.env");
  writeFileSync(
    websiteCandidate,
    "DATABASE_URL=postgresql://candidate-user:candidate-secret@localhost/candidate\n",
    { mode: 0o600 },
  );
  writeFileSync(marketingCandidate, "FORM_TOKEN=candidate-form-secret\n", {
    mode: 0o600,
  });

  let previousRelease = "";
  if (withPreviousRelease) {
    previousRelease = join(base, "releases", "previous");
    mkdirSync(previousRelease, { recursive: true });
    writeFileSync(join(shared, "website.env"), "DATABASE_URL=old-runtime\n", {
      mode: 0o640,
    });
    writeFileSync(join(shared, "marketing.env"), "FORM_TOKEN=old-form\n", {
      mode: 0o640,
    });
    symlinkSync(previousRelease, current);
  }

  return {
    base,
    candidateDirectory,
    current,
    previousRelease,
    release,
    shared,
  };
}

function runEnvironmentTransaction(fixture, script) {
  return execFileSync(
    "bash",
    [
      "-c",
      `set -euo pipefail
source "$FIELDGRID_TEST_TRANSACTION_LIB"
fieldgrid_env_transaction_init "$FIELDGRID_TEST_BASE" "$FIELDGRID_TEST_RELEASE" test-run ""
${script}`,
    ],
    {
      encoding: "utf8",
      env: {
        ...process.env,
        FIELDGRID_TEST_BASE: fixture.base,
        FIELDGRID_TEST_RELEASE: fixture.release,
        FIELDGRID_TEST_TRANSACTION_LIB: envTransactionLibrary,
      },
    },
  );
}

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

test("website stack installs and persists only the pinned database CA", () => {
  const workflow = read(".github/workflows/website-staging-stack-deploy.yml");

  assert.match(
    workflow,
    /FIELDGRID_DATABASE_SSL_ROOT_CERT_BASE64:\s*\$\{\{\s*secrets\.FIELDGRID_DATABASE_SSL_ROOT_CERT_BASE64\s*\}\}/u,
  );
  assert.match(
    workflow,
    /--install-from-env FIELDGRID_DATABASE_SSL_ROOT_CERT_BASE64/u,
  );
  assert.match(workflow, /DB_SSL:\s*"true"/u);
  assert.match(workflow, /DB_SSL_REJECT_UNAUTHORIZED:\s*"true"/u);
  assert.match(workflow, /PGSSLMODE:\s*verify-full/u);
  assert.match(
    workflow,
    /certificate_destination="\$certificate_directory\/supabase-root-2021-ca\.crt"/u,
  );
  assert.match(
    workflow,
    /mktemp "\$certificate_directory\/\.supabase-root-2021-ca\.XXXXXX"/u,
  );
  assert.match(
    workflow,
    /install -m 600 "\$FIELDGRID_DATABASE_SSL_ROOT_CERT" "\$certificate_temp"/u,
  );
  assert.match(
    workflow,
    /mv -f "\$certificate_temp" "\$certificate_destination"/u,
  );
  assert.match(
    workflow,
    /printf 'FIELDGRID_DATABASE_SSL_ROOT_CERT=%s\\n'[\s\S]*"\$certificate_destination" >> "\$GITHUB_ENV"/u,
  );
  assert.doesNotMatch(
    workflow,
    /(?:echo|printf)[^\n]*FIELDGRID_DATABASE_SSL_ROOT_CERT_BASE64[^\n]*\$/u,
  );
});

test("website stack bootstrap pins and validates the service Node", () => {
  const activation = read("docs/website-module-enterprise-activation.md");

  assert.match(activation, /service_node="\/usr\/bin\/node"/u);
  assert.match(
    activation,
    /readlink -f "\$\(command -v node\)"[\s\S]*readlink -f "\$service_node"/u,
  );
  assert.match(activation, /Fieldgrid requires Node >=24\.0\.0 <25/u);
  assert.match(activation, /root-managed Node 24 executable/u);
  assert.match(activation, /before any release is built or activated/u);
});

test("website stack services are separate, local-only and hardened", () => {
  const website = read("ops/systemd/veele-staging-website.service");
  const marketing = read("ops/systemd/veele-staging-marketing.service");

  assert.match(website, /Environment=PORT=3305/u);
  assert.match(
    website,
    /WorkingDirectory=\/var\/www\/veele\/website-stack-staging\/current\/artifacts\/website-runtime/u,
  );
  assert.match(
    website,
    /ExecStart=\/usr\/bin\/node \.\/node_modules\/next\/dist\/bin\/next start -H 127\.0\.0\.1 -p 3305/u,
  );
  assert.match(website, /shared\/website\.env/u);
  assert.match(marketing, /Environment=PORT=3306/u);
  assert.match(
    marketing,
    /WorkingDirectory=\/var\/www\/veele\/website-stack-staging\/current\/artifacts\/marketing-website/u,
  );
  assert.match(
    marketing,
    /ExecStart=\/usr\/bin\/node \.\/node_modules\/next\/dist\/bin\/next start -H 127\.0\.0\.1 -p 3306/u,
  );
  assert.match(marketing, /shared\/marketing\.env/u);
  for (const unit of [website, marketing]) {
    assert.match(unit, /User=github-runner/u);
    assert.match(unit, /Environment=NEXT_TELEMETRY_DISABLED=1/u);
    assert.doesNotMatch(
      unit,
      /^ExecStart=.*(?:pnpm|corepack|\/usr\/bin\/env)/mu,
    );
    assert.match(unit, /NoNewPrivileges=true/u);
    assert.match(unit, /ProtectSystem=strict/u);
    assert.match(unit, /ProtectHome=true/u);
    assert.match(
      unit,
      /ReadOnlyPaths=\/var\/www\/veele\/website-stack-staging\/shared\/corepack/u,
    );
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
  assert.match(
    sudoers,
    /\/usr\/bin\/systemctl start fieldgrid-caddy-validate\.service/u,
  );
  assert.match(sudoers, /\/usr\/bin\/systemctl reload caddy/u);
  assert.match(
    sudoers,
    /github-runner ALL=\(root\) NOPASSWD: FIELDGRID_WEBSITE_STACK_CONTROL/u,
  );
  assert.doesNotMatch(sudoers, /\*/u);
  assert.doesNotMatch(sudoers, /\b(?:enable|disable|daemon-reload)\b/u);
  assert.doesNotMatch(
    sudoers,
    /\/(?:bin|usr\/bin)\/(?:cp|install|mv|rm|tee)\b/u,
  );
  assert.doesNotMatch(sudoers, /production/u);
});

test("Caddy keeps application prefixes ahead of the website fallback", () => {
  const caddy = read("ops/caddy/fieldgrid-website-staging.caddy");
  const fallback = caddy.lastIndexOf("reverse_proxy 127.0.0.1:3305");
  const loginAlias = caddy.indexOf(
    "redir @backoffice_login_alias /admin/login?{query} 308",
  );

  assert.ok(loginAlias >= 0, "legacy /login must redirect to /admin/login");
  assert.ok(
    loginAlias < fallback,
    "login redirect must precede website fallback",
  );

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
  assert.match(caddy, /\*\.staging\.fieldgrid\.nl/u);
  assert.match(caddy, /dns cloudflare \{env\.CLOUDFLARE_API_TOKEN\}/u);
  assert.match(caddy, /veeleservices-origin\.staging\.fieldgrid\.nl/u);
  assert.doesNotMatch(caddy, /veele\.staging\.fieldgrid\.nl/u);
  assert.doesNotMatch(caddy, /handle_path/u);
});

test("Caddy validation uses the service environment and no repository token", () => {
  const dropin = read(
    "ops/systemd/caddy.service.d/fieldgrid-cloudflare-dns.conf",
  );
  const validation = read("ops/systemd/fieldgrid-caddy-validate.service");
  const bootstrap = read("scripts/fieldgrid-staging-wildcard-tls-bootstrap.sh");

  assert.match(
    dropin,
    /EnvironmentFile=\/etc\/caddy\/fieldgrid-cloudflare\.env/u,
  );
  assert.match(validation, /User=caddy/u);
  assert.match(
    validation,
    /ExecStart=\/usr\/bin\/caddy validate --config \/etc\/caddy\/Caddyfile --adapter caddyfile/u,
  );
  assert.match(bootstrap, /list-modules[\s\S]*dns\.providers\.cloudflare/u);
  assert.match(bootstrap, /root:root:600/u);
  assert.match(
    bootstrap,
    /CLOUDFLARE_API_TOKEN=%s\\n[\s\S]*CF_API_TOKEN=%s\\n/u,
  );
  assert.match(bootstrap, /CLOUDFLARE_ENV contains conflicting token aliases/u);
  assert.match(bootstrap, /CLOUDFLARE_ENV contains duplicate token aliases/u);
  assert.match(bootstrap, /running Caddy contains conflicting token aliases/u);
  assert.match(bootstrap, /backup_target "\$CLOUDFLARE_ENV" "cloudflare-env"/u);
  assert.match(
    bootstrap,
    /restore_target "\$CLOUDFLARE_ENV" "cloudflare-env"/u,
  );
  assert.match(
    bootstrap,
    /\[ -f "\$BACKUP_DIR\/\$key\.state" \] \|\| return 0/u,
  );
  assert.match(
    bootstrap,
    /mktemp \/etc\/caddy\/\.fieldgrid-cloudflare\.env\.XXXXXX/u,
  );
  assert.match(bootstrap, /mv -f "\$TOKEN_ENV_TEMP" "\$CLOUDFLARE_ENV"/u);
  assert.match(
    bootstrap,
    /unbound-\$\{EXPECTED_SHA:0:12\}\.staging\.fieldgrid\.nl/u,
  );
  assert.match(bootstrap, /\[ "\$PROBE_STATUS" = "404" \]/u);
  assert.match(bootstrap, /trap rollback ERR EXIT/u);
  assert.match(bootstrap, /trap - ERR EXIT/u);
  assert.doesNotMatch(
    `${dropin}\n${validation}`,
    /CLOUDFLARE_API_TOKEN=[A-Za-z0-9_-]{20,}/u,
  );
  assert.doesNotMatch(
    bootstrap,
    /(?:install|systemctl|mkdir|rm|cp|mv)[^\n]*\/var\/www\/veele\/production/u,
  );
});

test("deploy script isolates secrets and has explicit rollback", () => {
  const script = read("scripts/fieldgrid-website-staging-stack-deploy.sh");
  const transaction = read("scripts/fieldgrid-website-env-transaction.sh");
  const websiteEnvironment = script.slice(
    script.indexOf("printf 'APP_ENV=staging"),
    script.indexOf('} > "$FIELDGRID_ENV_WEBSITE_CANDIDATE"'),
  );
  const marketingEnvironment = script.slice(
    script.indexOf('} > "$FIELDGRID_ENV_WEBSITE_CANDIDATE"'),
    script.indexOf('} > "$FIELDGRID_ENV_MARKETING_CANDIDATE"'),
  );

  assert.match(websiteEnvironment, /DATABASE_URL/u);
  assert.match(websiteEnvironment, /DB_SSL=%s/u);
  assert.match(websiteEnvironment, /DB_SSL_REJECT_UNAUTHORIZED=%s/u);
  assert.match(websiteEnvironment, /PGSSLMODE=%s/u);
  assert.match(websiteEnvironment, /FIELDGRID_DATABASE_SSL_ROOT_CERT=%s/u);
  assert.match(websiteEnvironment, /NEXT_TELEMETRY_DISABLED/u);
  assert.doesNotMatch(websiteEnvironment, /COREPACK_HOME/u);
  assert.doesNotMatch(marketingEnvironment, /DATABASE_URL/u);
  assert.doesNotMatch(
    marketingEnvironment,
    /DB_SSL|PGSSLMODE|FIELDGRID_DATABASE_SSL_ROOT_CERT/u,
  );
  assert.match(marketingEnvironment, /NEXT_TELEMETRY_DISABLED/u);
  assert.doesNotMatch(marketingEnvironment, /COREPACK_HOME/u);
  assert.match(script, /COREPACK_HOME_PATH="\$BASE_DIR\/shared\/corepack"/u);
  assert.match(script, /export COREPACK_HOME="\$COREPACK_HOME_PATH"/u);
  assert.match(script, /corepack install --global pnpm@11\.5\.2/u);
  assert.match(script, /SERVICE_NODE_PATH="\/usr\/bin\/node"/u);
  assert.match(
    script,
    /FIELDGRID_DATABASE_SSL_ROOT_CERT" = "\$BASE_DIR\/shared\/supabase-root-2021-ca\.crt"/u,
  );
  assert.match(
    script,
    /stat -c '%a' "\$FIELDGRID_DATABASE_SSL_ROOT_CERT"\)" = "600"/u,
  );
  assert.match(
    script,
    /fieldgrid-database-root-cert\.mjs" \\\n+  --check \\\n+  --file "\$FIELDGRID_DATABASE_SSL_ROOT_CERT"/u,
  );
  assert.match(script, /BUILD_NODE_PATH="\$\(command -v node \|\| true\)"/u);
  assert.match(
    script,
    /"\$SERVICE_NODE_PATH" "\$SERVICE_NODE_PREFLIGHT" \\\n  --service-node "\$SERVICE_NODE_PATH" \\\n  --build-node "\$BUILD_NODE_PATH" \\\n  --package-json "\$REPO_ROOT\/package\.json"/u,
  );
  assert.ok(
    script.indexOf('"$SERVICE_NODE_PATH" "$SERVICE_NODE_PREFLIGHT"') <
      script.indexOf('RELEASE="$BASE_DIR/releases/'),
    "service Node preflight must finish before release creation or activation",
  );
  assert.match(
    script,
    /\$RELEASE\/artifacts\/website-runtime\/node_modules\/next\/dist\/bin\/next/u,
  );
  assert.match(
    script,
    /\$RELEASE\/artifacts\/marketing-website\/node_modules\/next\/dist\/bin\/next/u,
  );
  assert.match(
    script,
    /staging website services must not use a package-manager runtime/u,
  );
  assert.doesNotMatch(script, /\/home\/github-runner\/.*corepack/u);
  assert.match(
    script,
    /FIELDGRID_CUSTOM_RELEASE_ID.*git-commit:\$EXPECTED_SHA/u,
  );
  assert.match(script, /trap rollback ERR/u);
  assert.match(script, /trap rollback ERR EXIT/u);
  assert.match(script, /trap - ERR EXIT/u);
  assert.match(script, /release-restored/u);
  assert.match(script, /fieldgrid_env_transaction_begin/u);
  assert.match(script, /fieldgrid_env_transaction_restore/u);
  assert.match(script, /fieldgrid_env_transaction_finalize/u);
  assert.match(transaction, /chmod 600 "\$backup"/u);
  assert.match(transaction, /chmod 640 "\$path"/u);
  assert.match(
    transaction,
    /fieldgrid_env_backup_one "\$FIELDGRID_ENV_WEBSITE_TARGET" website/u,
  );
  assert.match(
    transaction,
    /fieldgrid_env_backup_one "\$FIELDGRID_ENV_MARKETING_TARGET" marketing/u,
  );
  assert.ok(
    script.indexOf("fieldgrid_env_transaction_restore") <
      script.indexOf(
        'sudo systemctl restart "$WEBSITE_SERVICE_NAME" "$MARKETING_SERVICE_NAME"',
      ),
    "both runtime environments must be restored before rollback restart",
  );
  assert.ok(
    script.indexOf("fieldgrid_env_transaction_finalize") >
      script.indexOf('retry_curl "$MARKETING_PUBLIC_HEALTH_URL"'),
    "environment backups must survive all public health checks",
  );
  assert.ok(
    script.indexOf("fieldgrid_env_transaction_finalize") >
      script.indexOf("sudo systemctl reload caddy"),
    "environment backups must survive Caddy validation and reload",
  );
  assert.match(script, /require_preprovisioned_asset/u);
  assert.doesNotMatch(script, /SUDOERS_TARGET/u);
  assert.doesNotMatch(
    script,
    /(?:\[ -[ef] |stat -c|cmp -s).*\/etc\/sudoers\.d/u,
  );
  assert.doesNotMatch(script, /stat -c '%u:%g:%a'/u);
  assert.match(script, /listing="\$\(LC_ALL=C sudo -n -ll 2>\/dev\/null\)"/u);
  assert.match(
    script,
    /effective_listing="\$\(LC_ALL=C sudo -n -ll "\$@" 2>\/dev\/null\)"/u,
  );
  assert.match(script, /printf '\\0'/u);
  assert.match(script, /"\$SERVICE_NODE_PATH" "\$SUDO_POLICY_CHECKER" "\$@"/u);
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
    /require_nopasswd_control "exact Caddy validation" \\\n  \/usr\/bin\/systemctl start fieldgrid-caddy-validate\.service/u,
  );
  assert.match(
    script,
    /require_nopasswd_control "exact Caddy reload" \\\n  \/usr\/bin\/systemctl reload caddy/u,
  );
  assert.match(script, /systemctl is-enabled --quiet/u);
  assert.match(
    script,
    /sudo systemctl start fieldgrid-caddy-validate\.service/u,
  );
  assert.doesNotMatch(script, /caddy adapt --config "\$CADDYFILE"/u);
  assert.match(script, /sudo systemctl reload caddy/u);
  assert.match(
    script,
    /assert_release_marker "\$CORE_RELEASE_SHA_FILE" "core"/u,
  );
  assert.match(
    script,
    /"\$BASE_DIR\/current\/\.fieldgrid-release-sha" \\\n  "website stack"/u,
  );
  assert.doesNotMatch(
    script,
    /sudo (?:install|cp|mkdir|rm|tee)|sudo systemctl enable/u,
  );
  assert.match(script, /productionChanged": false/u);
  assert.doesNotMatch(script, /\/var\/www\/veele\/production/u);
});

test("website environment transaction commits both candidates together", (t) => {
  const fixture = environmentTransactionFixture(t, true);
  const output = runEnvironmentTransaction(
    fixture,
    `fieldgrid_env_transaction_begin
test "$(stat -c '%a' "$FIELDGRID_ENV_TRANSACTION_DIR/website.backup")" = 600
test "$(stat -c '%a' "$FIELDGRID_ENV_TRANSACTION_DIR/marketing.backup")" = 600
ln -s "$FIELDGRID_TEST_RELEASE" "$FIELDGRID_TEST_BASE/.current.new"
mv -Tf "$FIELDGRID_TEST_BASE/.current.new" "$FIELDGRID_TEST_BASE/current"
fieldgrid_env_transaction_finalize`,
  );

  assert.equal(readlinkSync(fixture.current), fixture.release);
  assert.match(
    readFileSync(join(fixture.shared, "website.env"), "utf8"),
    /candidate-user/u,
  );
  assert.match(
    readFileSync(join(fixture.shared, "marketing.env"), "utf8"),
    /candidate-form-secret/u,
  );
  assert.equal(
    statSync(join(fixture.shared, "website.env")).mode & 0o777,
    0o640,
  );
  assert.equal(
    statSync(join(fixture.shared, "marketing.env")).mode & 0o777,
    0o640,
  );
  assert.equal(
    existsSync(join(fixture.shared, ".env-transaction-test-run")),
    false,
  );
  assert.equal(existsSync(fixture.candidateDirectory), false);
  assert.doesNotMatch(output, /candidate-secret|candidate-form-secret/u);
});

test("website environment transaction restores both old files before release rollback", (t) => {
  const fixture = environmentTransactionFixture(t, true);
  const output = runEnvironmentTransaction(
    fixture,
    `fieldgrid_env_transaction_begin
ln -s "$FIELDGRID_TEST_RELEASE" "$FIELDGRID_TEST_BASE/.current.new"
mv -Tf "$FIELDGRID_TEST_BASE/.current.new" "$FIELDGRID_TEST_BASE/current"
fieldgrid_env_transaction_restore
test "$(cat "$FIELDGRID_TEST_BASE/shared/website.env")" = DATABASE_URL=old-runtime
test "$(cat "$FIELDGRID_TEST_BASE/shared/marketing.env")" = FORM_TOKEN=old-form
ln -s "$FIELDGRID_TEST_BASE/releases/previous" "$FIELDGRID_TEST_BASE/.current.rollback"
mv -Tf "$FIELDGRID_TEST_BASE/.current.rollback" "$FIELDGRID_TEST_BASE/current"`,
  );

  assert.equal(readlinkSync(fixture.current), fixture.previousRelease);
  assert.equal(
    readFileSync(join(fixture.shared, "website.env"), "utf8"),
    "DATABASE_URL=old-runtime\n",
  );
  assert.equal(
    readFileSync(join(fixture.shared, "marketing.env"), "utf8"),
    "FORM_TOKEN=old-form\n",
  );
  assert.equal(
    statSync(join(fixture.shared, "website.env")).mode & 0o777,
    0o640,
  );
  assert.equal(
    statSync(join(fixture.shared, "marketing.env")).mode & 0o777,
    0o640,
  );
  assert.doesNotMatch(output, /candidate-secret|candidate-form-secret/u);
});

test("first website release failure removes both newly published environments", (t) => {
  const fixture = environmentTransactionFixture(t, false);
  const output = runEnvironmentTransaction(
    fixture,
    `fieldgrid_env_transaction_begin
test "$(stat -c '%a' "$FIELDGRID_ENV_TRANSACTION_DIR/website.absent")" = 600
test "$(stat -c '%a' "$FIELDGRID_ENV_TRANSACTION_DIR/marketing.absent")" = 600
ln -s "$FIELDGRID_TEST_RELEASE" "$FIELDGRID_TEST_BASE/current"
fieldgrid_env_transaction_restore
rm -f "$FIELDGRID_TEST_BASE/current"`,
  );

  assert.equal(existsSync(fixture.current), false);
  assert.equal(existsSync(join(fixture.shared, "website.env")), false);
  assert.equal(existsSync(join(fixture.shared, "marketing.env")), false);
  assert.equal(
    existsSync(join(fixture.shared, ".env-transaction-test-run")),
    false,
  );
  assert.doesNotMatch(output, /candidate-secret|candidate-form-secret/u);
});

test("service Node preflight accepts the exact executable and Node 24", (t) => {
  const fixture = mkdtempSync(join(tmpdir(), "fieldgrid-service-node-"));
  t.after(() => rmSync(fixture, { force: true, recursive: true }));
  const nodePath = join(fixture, "node");
  const packageJsonPath = join(fixture, "package.json");
  writeFileSync(nodePath, "#!/bin/sh\nexit 0\n");
  chmodSync(nodePath, 0o755);
  writeFileSync(
    packageJsonPath,
    JSON.stringify({ engines: { node: ">=24.0.0 <25" } }),
  );

  assert.deepEqual(
    validateServiceNodePreflight({
      buildNodePath: nodePath,
      packageJsonPath,
      runtimeExecPath: nodePath,
      runtimeVersion: "24.18.0",
      serviceNodePath: nodePath,
    }),
    {
      nodeEngine: ">=24.0.0 <25",
      nodePath,
      nodeVersion: "24.18.0",
    },
  );
});

test("service Node preflight fails closed for missing or different binaries", (t) => {
  const fixture = mkdtempSync(join(tmpdir(), "fieldgrid-service-node-"));
  t.after(() => rmSync(fixture, { force: true, recursive: true }));
  const serviceNodePath = join(fixture, "service-node");
  const differentBuildNodePath = join(fixture, "build-node");
  const packageJsonPath = join(fixture, "package.json");
  for (const path of [serviceNodePath, differentBuildNodePath]) {
    writeFileSync(path, "#!/bin/sh\nexit 0\n");
    chmodSync(path, 0o755);
  }
  writeFileSync(
    packageJsonPath,
    JSON.stringify({ engines: { node: ">=24.0.0 <25" } }),
  );

  assert.throws(
    () =>
      validateServiceNodePreflight({
        buildNodePath: serviceNodePath,
        packageJsonPath,
        runtimeExecPath: serviceNodePath,
        runtimeVersion: "24.18.0",
        serviceNodePath: join(fixture, "missing-node"),
      }),
    /service Node is missing or not executable/u,
  );
  assert.throws(
    () =>
      validateServiceNodePreflight({
        buildNodePath: differentBuildNodePath,
        packageJsonPath,
        runtimeExecPath: serviceNodePath,
        runtimeVersion: "24.18.0",
        serviceNodePath,
      }),
    /build Node .* differs from service Node/u,
  );
});

test("service Node preflight rejects unsupported versions and engine drift", (t) => {
  const fixture = mkdtempSync(join(tmpdir(), "fieldgrid-service-node-"));
  t.after(() => rmSync(fixture, { force: true, recursive: true }));
  const nodePath = join(fixture, "node");
  const packageJsonPath = join(fixture, "package.json");
  writeFileSync(nodePath, "#!/bin/sh\nexit 0\n");
  chmodSync(nodePath, 0o755);
  writeFileSync(
    packageJsonPath,
    JSON.stringify({ engines: { node: ">=24.0.0 <25" } }),
  );

  assert.throws(
    () =>
      validateServiceNodePreflight({
        buildNodePath: nodePath,
        packageJsonPath,
        runtimeExecPath: nodePath,
        runtimeVersion: "23.11.1",
        serviceNodePath: nodePath,
      }),
    /service Node must satisfy >=24\.0\.0 <25/u,
  );

  writeFileSync(
    packageJsonPath,
    JSON.stringify({ engines: { node: ">=23.0.0 <25" } }),
  );
  assert.throws(
    () =>
      validateServiceNodePreflight({
        buildNodePath: nodePath,
        packageJsonPath,
        runtimeExecPath: nodePath,
        runtimeVersion: "24.18.0",
        serviceNodePath: nodePath,
      }),
    /repository Node engine must remain >=24\.0\.0 <25/u,
  );
});

test("sudo capability parser requires exact root NOPASSWD controls", () => {
  const restart =
    "/usr/bin/systemctl restart veele-staging-website veele-staging-marketing";
  const stop =
    "/usr/bin/systemctl stop veele-staging-website veele-staging-marketing";
  const reload = "/usr/bin/systemctl reload caddy";
  const validate = "/usr/bin/systemctl start fieldgrid-caddy-validate.service";
  const exactNopasswd = `Matching Defaults entries for github-runner on Veele:

Sudoers entry: /etc/sudoers.d/veele-staging-website-stack
    RunAsUsers: root
    Options: !authenticate
    Commands:
        ${restart},
        ${stop}, ${validate}, ${reload}
`;
  const passwordedTargetWithUnrelatedNopasswd = `Sudoers entry: /etc/sudoers
    RunAsUsers: root
    Commands:
        ${restart}

Sudoers entry: /etc/sudoers.d/unrelated
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
  const escapedCommaInjection = `Sudoers entry: /etc/sudoers.d/drifted
    RunAsUsers: root
    Options: !authenticate
    Commands:
        /usr/bin/systemctl *,
        /usr/bin/echo foo\\, /usr/bin/systemctl reload caddy
`;
  const passwordOverride = `${exactNopasswd}
Sudoers entry: /etc/sudoers.d/99-password-override
    RunAsUsers: root
    Options: authenticate
    Commands:
        ${restart}
`;
  const denialOverride = `${exactNopasswd}
Sudoers entry: /etc/sudoers.d/99-denial-override
    RunAsUsers: root
    Options: !authenticate
    Commands:
        !${restart}
`;
  const wildcardOverride = `${exactNopasswd}
Sudoers entry: /etc/sudoers.d/99-wildcard-override
    RunAsUsers: root
    Options: authenticate
    Commands:
        /usr/bin/systemctl *
`;
  const sudoRsEffectiveRestart = restart;
  const verboseEffectiveRestart = `Sudoers entry: /etc/sudoers.d/fieldgrid
    RunAsUsers: root
    Options: !authenticate
    Commands:
        ${restart}
    Matched: ${restart}
`;

  assert.equal(hasExactRootNopasswdCommand(exactNopasswd, restart), true);
  assert.equal(hasExactRootNopasswdCommand(exactNopasswd, stop), true);
  assert.equal(hasExactRootNopasswdCommand(exactNopasswd, reload), true);
  assert.equal(hasExactRootNopasswdCommand(exactNopasswd, validate), true);
  assert.equal(
    hasExactRootNopasswdCommand(passwordedTargetWithUnrelatedNopasswd, restart),
    false,
  );
  assert.equal(hasExactRootNopasswdCommand(broaderRunAs, restart), false);
  assert.equal(hasExactRootNopasswdCommand(wildcard, restart), false);
  assert.equal(
    hasExactRootNopasswdCommand(escapedCommaInjection, reload),
    false,
  );
  assert.equal(hasExactRootNopasswdCommand(passwordOverride, restart), false);
  assert.equal(hasExactRootNopasswdCommand(denialOverride, restart), false);
  assert.equal(hasExactRootNopasswdCommand(wildcardOverride, restart), false);
  assert.equal(
    hasEffectiveExactRootNopasswdCommand(
      exactNopasswd,
      sudoRsEffectiveRestart,
      restart,
    ),
    true,
  );
  assert.equal(
    hasEffectiveExactRootNopasswdCommand(
      exactNopasswd,
      verboseEffectiveRestart,
      restart,
    ),
    true,
  );
  assert.equal(
    hasEffectiveExactRootNopasswdCommand(
      passwordOverride,
      sudoRsEffectiveRestart,
      restart,
    ),
    false,
  );
  assert.equal(
    hasEffectiveExactRootNopasswdCommand(
      exactNopasswd,
      "/usr/bin/systemctl *",
      restart,
    ),
    false,
  );
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
