import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const __filename = fileURLToPath(import.meta.url);
const repoRoot = resolve(dirname(__filename), "..");
const activateScript = join(repoRoot, "scripts", "fieldgrid-atomic-release-activate.sh");
const healthScript = join(repoRoot, "scripts", "fieldgrid-deploy-health-gate.sh");
const backfillScript = join(repoRoot, "scripts", "fieldgrid-backfill-release-sha-marker.sh");
const deployWorkflow = join(repoRoot, ".github", "workflows", "deploy.yml");
const expectedSha = "f36e84dad5d1c595e4dd349ff5ce6bd439722576";

const bashCandidates = [
  process.env.BASH,
  "bash",
  "C:/Program Files/Git/bin/bash.exe",
  "C:/Program Files/Git/usr/bin/bash.exe",
].filter(Boolean);

function run(command, args, options = {}) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, {
      cwd: repoRoot,
      env: { ...process.env, ...(options.env ?? {}) },
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr?.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", (error) => {
      if (options.allowFailure) {
        resolvePromise({ status: 127, stdout, stderr: String(error) });
      } else {
        reject(error);
      }
    });
    child.on("close", (status) => {
      const result = { status, stdout, stderr };
      if (!options.allowFailure && status !== 0) {
        reject(
          new Error(
            `Command failed (${status}): ${command} ${args.join(" ")}\n${stdout}\n${stderr}`,
          ),
        );
      } else {
        resolvePromise(result);
      }
    });
  });
}

function countOccurrences(value, pattern) {
  return value.split("\n").filter((line) => pattern.test(line)).length;
}

function normalizeLineEndings(value) {
  return value.replace(/\r\n/gu, "\n");
}

async function findBash() {
  for (const candidate of bashCandidates) {
    const result = await run(candidate, ["--version"], { allowFailure: true });
    if (result.status === 0) return candidate;
  }
  return null;
}

async function makeExecutable(path, body) {
  await writeFile(path, body, { mode: 0o755 });
}

function shellQuote(value) {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

async function toBashPath(bash, path) {
  if (process.platform !== "win32") return path;
  const result = await run(bash, ["-lc", `cygpath -u ${shellQuote(path)}`]);
  return result.stdout.trim();
}

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), "fieldgrid-health-gate-"));
  t.after(async () => {
    await rm(root, { recursive: true, force: true });
  });

  const bash = await findBash();
  assert.ok(bash, "POSIX shell unavailable; shell-level deploy tests require bash.");

  const base = join(root, "deploy");
  const releases = join(base, "releases");
  const oldRelease = join(releases, "old");
  const newRelease = join(releases, "new");
  const mockbin = join(root, "mockbin");
  await mkdir(oldRelease, { recursive: true });
  await mkdir(newRelease, { recursive: true });
  await mkdir(mockbin, { recursive: true });
  await writeFile(join(oldRelease, ".fieldgrid-release-sha"), "old-sha\n");
  await writeFile(join(newRelease, ".fieldgrid-release-sha"), `${expectedSha}\n`);

  const baseBash = await toBashPath(bash, base);
  const oldReleaseBash = await toBashPath(bash, oldRelease);
  const newReleaseBash = await toBashPath(bash, newRelease);
  const activateScriptBash = await toBashPath(bash, activateScript);
  const healthScriptBash = await toBashPath(bash, healthScript);
  const activateEvidenceBash = await toBashPath(bash, join(root, "activate.json"));
  const healthEvidenceBash = await toBashPath(bash, join(root, "health.json"));
  const mockLogBash = await toBashPath(bash, join(root, "systemctl.log"));
  const symlinkResult = await run(
    bash,
    [
      "-lc",
      `rm -rf ${shellQuote(`${baseBash}/current`)} && ln -s ${shellQuote(oldReleaseBash)} ${shellQuote(`${baseBash}/current`)} && test -L ${shellQuote(`${baseBash}/current`)}`,
    ],
    { allowFailure: true },
  );
  assert.equal(symlinkResult.status, 0, "POSIX symlink semantics are required for deploy rollback shell tests.");

  await makeExecutable(
    join(mockbin, "systemctl"),
    `#!/usr/bin/env sh
echo "systemctl $@" >> "$MOCK_LOG"
if [ "$1" = "is-active" ]; then
  service="$3"
  state_file="$MOCK_BASE/service-$service-state"
  if [ -f "$state_file" ]; then
    state="$(cat "$state_file")"
    if [ "$state" = "activating" ]; then
      echo active > "$state_file"
      exit 3
    fi
    [ "$state" = "active" ] && exit 0
    printf '%s' "$state" >&2
    exit 3
  fi
  if [ "$service" = "$MOCK_DEAD_SERVICE" ]; then printf inactive >&2; exit 3; fi
  exit 0
fi
if [ "$1" = "restart" ] && [ "$2" = "$MOCK_RESTART_FAIL" ]; then exit 1; fi
if [ "$1" = "reload" ] && [ "$2" = "caddy" ] && [ "$MOCK_RELOAD_FAIL" = "1" ]; then exit 1; fi
exit 0
`,
  );
  await makeExecutable(join(mockbin, "sudo"), `#!/usr/bin/env sh
echo "sudo $@" >> "$MOCK_LOG"
exec "$@"
`);
  await makeExecutable(
    join(mockbin, "ss"),
    `#!/usr/bin/env sh
for port in $MOCK_LISTEN_PORTS; do
  printf 'LISTEN 0 128 127.0.0.1:%s 0.0.0.0:*\\n' "$port"
done
`,
  );
  await makeExecutable(
    join(mockbin, "curl"),
    `#!/usr/bin/env sh
url=""
for arg in "$@"; do url="$arg"; done
current="$(readlink "$MOCK_BASE/current" 2>/dev/null || true)"
case "$url" in
  *curl-dead*) exit 7 ;;
  *public-bad*) if printf '%s' "$current" | grep -q '/new$'; then printf '502'; else printf '200'; fi; exit 0 ;;
  *rollback-bad*) printf '502'; exit 0 ;;
  *status-301*) printf '301'; exit 0 ;;
  *status-302*) printf '302'; exit 0 ;;
  *status-200*) printf '200'; exit 0 ;;
  *api-root-200*) printf '200'; exit 0 ;;
  *api-root*) printf '404'; exit 0 ;;
  *) printf '200'; exit 0 ;;
esac
`,
  );
  await makeExecutable(join(mockbin, "sleep"), "#!/usr/bin/env sh\nexit 0\n");

  const systemctlBin = await toBashPath(bash, join(mockbin, "systemctl"));
  const ssBin = await toBashPath(bash, join(mockbin, "ss"));
  const curlBin = await toBashPath(bash, join(mockbin, "curl"));
  const sleepBin = await toBashPath(bash, join(mockbin, "sleep"));
  const sudoBin = await toBashPath(bash, join(mockbin, "sudo"));
  const commonEnv = {
    MOCK_BASE: baseBash,
    MOCK_LOG: mockLogBash,
    MOCK_DEAD_SERVICE: "",
    MOCK_RESTART_FAIL: "",
    MOCK_RELOAD_FAIL: "",
    SYSTEMCTL_BIN: systemctlBin,
    SS_BIN: ssBin,
    CURL_BIN: curlBin,
    SLEEP_BIN: sleepBin,
    SYSTEMCTL_SUDO: sudoBin,
    MOCK_LISTEN_PORTS: "3100 3200 3300 3400",
    FIELDGRID_DEPLOY_HEALTH_ATTEMPTS: "1",
    FIELDGRID_DEPLOY_HEALTH_RETRY_SECONDS: "0",
    FIELDGRID_DEPLOY_CURL_MAX_TIME_SECONDS: "1",
    FIELDGRID_DEPLOY_SERVICES: "backoffice personeel klant api",
    FIELDGRID_DEPLOY_PORTS: "3100 3200 3300 3400",
    FIELDGRID_DEPLOY_LOCAL_ENDPOINTS: [
      "local-backoffice|http://127.0.0.1:3100/login|login",
      "local-personnel|http://127.0.0.1:3200/personeel/healthz|exact-200",
      "local-customer|http://127.0.0.1:3300/klant/healthz|exact-200",
      "local-api-health|http://127.0.0.1:3400/api/healthz|exact-200",
    ].join("\n"),
    FIELDGRID_DEPLOY_API_ROOT_ENDPOINTS: "local-api-root|http://127.0.0.1:3400/api-root|api-root-404",
    FIELDGRID_DEPLOY_PUBLIC_ENDPOINTS: [
      "public-backoffice|https://platform-staging.example.test/login|login",
      "public-personnel|https://personnel-staging.example.test/personeel/healthz|exact-200",
      "public-customer|https://customer-staging.example.test/klant/healthz|exact-200",
      "public-api-health|https://api-staging.example.test/api/healthz|exact-200",
    ].join("\n"),
  };

  const activateArgs = [
    activateScriptBash,
    "--environment",
    "staging",
    "--base-dir",
    baseBash,
    "--release-path",
    newReleaseBash,
    "--expected-sha",
    expectedSha,
    "--evidence-file",
    activateEvidenceBash,
  ];
  const healthArgs = [
    healthScriptBash,
    "--environment",
    "staging",
    "--base-dir",
    baseBash,
    "--release-path",
    newReleaseBash,
    "--expected-sha",
    expectedSha,
    "--evidence-file",
    healthEvidenceBash,
  ];
  const healthArgsWithRestart = [...healthArgs, "--restart-before-check"];

  return {
    bash,
    root,
    base,
    baseBash,
    oldRelease,
    oldReleaseBash,
    newRelease,
    newReleaseBash,
    commonEnv,
    activateArgs,
    healthArgs,
    healthArgsWithRestart,
  };
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function readCurrentTarget(bash, base) {
  const baseBash = await toBashPath(bash, base);
  const result = await run(bash, ["-lc", `readlink ${shellQuote(`${baseBash}/current`)}`]);
  return result.stdout.trim();
}

async function readSystemctlLog(root) {
  return await readFile(join(root, "systemctl.log"), "utf8");
}

test("healthy activation switches current and passes the health gate", async (t) => {
  const f = await fixture(t);

  await run(f.bash, f.activateArgs, { env: f.commonEnv });
  assert.equal(await readCurrentTarget(f.bash, f.base), f.newReleaseBash);

  const healthResult = await run(f.bash, f.healthArgsWithRestart, { env: f.commonEnv, allowFailure: true });
  const evidence = await readJson(join(f.root, "health.json"));
  assert.equal(
    healthResult.status,
    0,
    JSON.stringify(
      evidence.checks.filter((check) => check.status !== "pass"),
      null,
      2,
    ),
  );
  assert.equal(evidence.status, "pass");
  assert.equal(evidence.checks.find((check) => check.name === "activation:restart")?.status, "pass");
});

test("one dead service fails health evidence", async (t) => {
  const f = await fixture(t);
  await run(f.bash, f.activateArgs, { env: f.commonEnv });

  const result = await run(f.bash, f.healthArgs, {
    env: { ...f.commonEnv, MOCK_DEAD_SERVICE: "klant" },
    allowFailure: true,
  });
  assert.notEqual(result.status, 0);
  const evidence = await readJson(join(f.root, "health.json"));
  assert.equal(evidence.checks.find((check) => check.name === "service:klant")?.status, "fail");
});

test("one absent port fails health evidence", async (t) => {
  const f = await fixture(t);
  await run(f.bash, f.activateArgs, { env: f.commonEnv });

  const result = await run(f.bash, f.healthArgs, {
    env: { ...f.commonEnv, MOCK_LISTEN_PORTS: "3100 3200 3400" },
    allowFailure: true,
  });
  assert.notEqual(result.status, 0);
  const evidence = await readJson(join(f.root, "health.json"));
  assert.equal(evidence.checks.find((check) => check.name === "port:3300")?.status, "fail");
});

test("public 502 fails health evidence", async (t) => {
  const f = await fixture(t);
  await run(f.bash, f.activateArgs, { env: f.commonEnv });

  const result = await run(f.bash, f.healthArgs, {
    env: {
      ...f.commonEnv,
      FIELDGRID_DEPLOY_PUBLIC_ENDPOINTS: [
        "public-backoffice|https://platform-staging.example.test/login|login",
        "public-personnel|https://public-bad.example.test/personeel/healthz|exact-200",
        "public-customer|https://customer-staging.example.test/klant/healthz|exact-200",
        "public-api-health|https://api-staging.example.test/api/healthz|exact-200",
      ].join("\n"),
    },
    allowFailure: true,
  });
  assert.notEqual(result.status, 0);
  const evidence = await readJson(join(f.root, "health.json"));
  assert.equal(evidence.checks.find((check) => check.name === "endpoint:public-personnel")?.status, "fail");
});

test("local 5xx fails health evidence", async (t) => {
  const f = await fixture(t);
  await run(f.bash, f.activateArgs, { env: f.commonEnv });

  const result = await run(f.bash, f.healthArgs, {
    env: {
      ...f.commonEnv,
      FIELDGRID_DEPLOY_LOCAL_ENDPOINTS: [
        "local-backoffice|http://127.0.0.1:3100/login|login",
        "local-personnel|http://127.0.0.1:3200/personeel/healthz|exact-200",
        "local-customer|http://public-bad.example.test/klant/healthz|exact-200",
        "local-api-health|http://127.0.0.1:3400/api/healthz|exact-200",
      ].join("\n"),
    },
    allowFailure: true,
  });
  assert.notEqual(result.status, 0);
  const evidence = await readJson(join(f.root, "health.json"));
  assert.equal(evidence.checks.find((check) => check.name === "endpoint:local-customer")?.status, "fail");
});

test("curl transport failure records HTTP 000 failure", async (t) => {
  const f = await fixture(t);
  await run(f.bash, f.activateArgs, { env: f.commonEnv });

  const result = await run(f.bash, f.healthArgs, {
    env: {
      ...f.commonEnv,
      FIELDGRID_DEPLOY_PUBLIC_ENDPOINTS: [
        "public-backoffice|https://platform-staging.example.test/login|login",
        "public-personnel|https://curl-dead.example.test/personeel/healthz|exact-200",
        "public-customer|https://customer-staging.example.test/klant/healthz|exact-200",
        "public-api-health|https://api-staging.example.test/api/healthz|exact-200",
      ].join("\n"),
    },
    allowFailure: true,
  });
  assert.notEqual(result.status, 0);
  const evidence = await readJson(join(f.root, "health.json"));
  const failed = evidence.checks.find((check) => check.name === "endpoint:public-personnel");
  assert.equal(failed?.status, "fail");
  assert.match(failed.detail, /HTTP 000/);
});

test("API root HTTP 404 is allowed while API health requires exact 200", async (t) => {
  const f = await fixture(t);
  await run(f.bash, f.activateArgs, { env: f.commonEnv });

  await run(f.bash, f.healthArgs, { env: f.commonEnv });
  const evidence = await readJson(join(f.root, "health.json"));
  const apiRoot = evidence.checks.find((check) => check.name === "endpoint:local-api-root");
  assert.equal(apiRoot?.status, "pass");
  assert.match(apiRoot.detail, /HTTP 404 accepted/);
});

test("health gate requires exactly four services, ports, and local endpoints", async (t) => {
  const f = await fixture(t);
  await run(f.bash, f.activateArgs, { env: f.commonEnv });

  const result = await run(f.bash, f.healthArgs, {
    env: {
      ...f.commonEnv,
      FIELDGRID_DEPLOY_SERVICES: "backoffice personeel klant api extra",
      FIELDGRID_DEPLOY_PORTS: "3100 3200 3300 3400 3500",
      FIELDGRID_DEPLOY_LOCAL_ENDPOINTS: [
        "local-backoffice|http://127.0.0.1:3100/login|login",
        "local-personnel|http://127.0.0.1:3200/personeel/healthz|exact-200",
        "local-customer|http://127.0.0.1:3300/klant/healthz|exact-200",
        "local-api-health|http://127.0.0.1:3400/api/healthz|exact-200",
        "local-extra|http://127.0.0.1:3500/healthz|exact-200",
      ].join("\n"),
    },
    allowFailure: true,
  });

  assert.notEqual(result.status, 0);
  const evidence = await readJson(join(f.root, "health.json"));
  assert.equal(evidence.checks.find((check) => check.name === "services:configured-count")?.status, "fail");
  assert.equal(evidence.checks.find((check) => check.name === "ports:configured-count")?.status, "fail");
  assert.equal(evidence.checks.find((check) => check.name === "endpoints:local-count")?.status, "fail");
});

test("health gate accepts an explicitly configured fifth website runtime", async (t) => {
  const f = await fixture(t);
  await run(f.bash, f.activateArgs, { env: f.commonEnv });

  await run(f.bash, f.healthArgs, {
    env: {
      ...f.commonEnv,
      MOCK_LISTEN_PORTS: "3100 3200 3300 3400 3500",
      WEBSITE_SERVICE_NAME: "website",
      WEBSITE_PORT: "3500",
      FIELDGRID_DEPLOY_SERVICES: "backoffice personeel klant api website",
      FIELDGRID_DEPLOY_PORTS: "3100 3200 3300 3400 3500",
      FIELDGRID_DEPLOY_LOCAL_ENDPOINTS: ["local-backoffice|http://127.0.0.1:3100/login|login", "local-personnel|http://127.0.0.1:3200/personeel/healthz|exact-200", "local-customer|http://127.0.0.1:3300/klant/healthz|exact-200", "local-api-health|http://127.0.0.1:3400/api/healthz|exact-200", "local-website-health|http://127.0.0.1:3500/healthz|exact-200"].join("\n"),
      FIELDGRID_DEPLOY_PUBLIC_ENDPOINTS: ["public-backoffice|https://platform-staging.example.test/login|login", "public-personnel|https://personnel-staging.example.test/personeel/healthz|exact-200", "public-customer|https://customer-staging.example.test/klant/healthz|exact-200", "public-api-health|https://api-staging.example.test/api/healthz|exact-200", "public-website-health|https://website.staging.fieldgrid.nl/healthz|exact-200"].join("\n"),
    },
  });

  const evidence = await readJson(join(f.root, "health.json"));
  assert.equal(evidence.checks.find((check) => check.name === "services:configured-count")?.status, "pass");
  assert.equal(evidence.checks.find((check) => check.name === "ports:configured-count")?.status, "pass");
  assert.equal(evidence.checks.find((check) => check.name === "endpoints:local-count")?.status, "pass");
  assert.equal(evidence.checks.find((check) => check.name === "endpoints:public-count")?.status, "pass");
  assert.equal(evidence.checks.find((check) => check.name === "endpoint:local-website-health")?.status, "pass");
});

test("health gate rejects a partial website runtime configuration", async (t) => {
  const f = await fixture(t);
  await run(f.bash, f.activateArgs, { env: f.commonEnv });

  const result = await run(f.bash, f.healthArgs, {
    env: {
      ...f.commonEnv,
      WEBSITE_SERVICE_NAME: "website",
      WEBSITE_PORT: "",
    },
    allowFailure: true,
  });

  assert.notEqual(result.status, 0);
  const evidence = await readJson(join(f.root, "health.json"));
  assert.equal(evidence.checks.find((check) => check.name === "services:configured-count")?.status, "fail");
  assert.equal(evidence.checks.find((check) => check.name === "ports:configured-count")?.status, "fail");
  assert.equal(evidence.checks.find((check) => check.name === "endpoints:local-count")?.status, "fail");
});

test("health gate accepts independent website and marketing runtimes", async (t) => {
  const f = await fixture(t);
  await run(f.bash, f.activateArgs, { env: f.commonEnv });

  await run(f.bash, f.healthArgs, {
    env: {
      ...f.commonEnv,
      MOCK_LISTEN_PORTS: "3100 3200 3300 3400 3500 3600",
      WEBSITE_SERVICE_NAME: "website",
      WEBSITE_PORT: "3500",
      MARKETING_SERVICE_NAME: "marketing",
      MARKETING_PORT: "3600",
      FIELDGRID_DEPLOY_SERVICES: "backoffice personeel klant api website marketing",
      FIELDGRID_DEPLOY_PORTS: "3100 3200 3300 3400 3500 3600",
      FIELDGRID_DEPLOY_LOCAL_ENDPOINTS: [
        "local-backoffice|http://127.0.0.1:3100/login|login",
        "local-personnel|http://127.0.0.1:3200/personeel/healthz|exact-200",
        "local-customer|http://127.0.0.1:3300/klant/healthz|exact-200",
        "local-api-health|http://127.0.0.1:3400/api/healthz|exact-200",
        "local-website-health|http://127.0.0.1:3500/healthz|exact-200",
        "local-marketing-health|http://127.0.0.1:3600/healthz|exact-200",
      ].join("\n"),
      FIELDGRID_DEPLOY_PUBLIC_ENDPOINTS: [
        "public-backoffice|https://platform-staging.example.test/login|login",
        "public-personnel|https://personnel-staging.example.test/personeel/healthz|exact-200",
        "public-customer|https://customer-staging.example.test/klant/healthz|exact-200",
        "public-api-health|https://api-staging.example.test/api/healthz|exact-200",
        "public-website-health|https://website-runtime.staging.fieldgrid.nl/healthz|exact-200",
        "public-marketing-health|https://veele-origin.staging.fieldgrid.nl/healthz|exact-200",
      ].join("\n"),
    },
  });

  const evidence = await readJson(join(f.root, "health.json"));
  assert.equal(evidence.checks.find((check) => check.name === "services:configured-count")?.status, "pass");
  assert.equal(evidence.checks.find((check) => check.name === "ports:configured-count")?.status, "pass");
  assert.equal(evidence.checks.find((check) => check.name === "endpoint:local-marketing-health")?.status, "pass");
  assert.equal(evidence.checks.find((check) => check.name === "endpoint:public-marketing-health")?.status, "pass");
});

test("staging restart uses the exact approved website and marketing service pair", async (t) => {
  const f = await fixture(t);
  await run(f.bash, f.activateArgs, { env: f.commonEnv });

  await run(f.bash, f.healthArgsWithRestart, {
    env: {
      ...f.commonEnv,
      MOCK_LISTEN_PORTS: "3100 3200 3300 3400 3500 3600",
      WEBSITE_SERVICE_NAME: "website",
      WEBSITE_PORT: "3500",
      MARKETING_SERVICE_NAME: "marketing",
      MARKETING_PORT: "3600",
      FIELDGRID_DEPLOY_SERVICES: "backoffice personeel klant api website marketing",
      FIELDGRID_DEPLOY_PORTS: "3100 3200 3300 3400 3500 3600",
      FIELDGRID_DEPLOY_LOCAL_ENDPOINTS: [
        "local-backoffice|http://127.0.0.1:3100/login|login",
        "local-personnel|http://127.0.0.1:3200/personeel/healthz|exact-200",
        "local-customer|http://127.0.0.1:3300/klant/healthz|exact-200",
        "local-api-health|http://127.0.0.1:3400/api/healthz|exact-200",
        "local-website-health|http://127.0.0.1:3500/healthz|exact-200",
        "local-marketing-health|http://127.0.0.1:3600/healthz|exact-200",
      ].join("\n"),
      FIELDGRID_DEPLOY_PUBLIC_ENDPOINTS: [
        "public-backoffice|https://platform-staging.example.test/login|login",
        "public-personnel|https://personnel-staging.example.test/personeel/healthz|exact-200",
        "public-customer|https://customer-staging.example.test/klant/healthz|exact-200",
        "public-api-health|https://api-staging.example.test/api/healthz|exact-200",
        "public-website-health|https://website-runtime.staging.fieldgrid.nl/healthz|exact-200",
        "public-marketing-health|https://veele-origin.staging.fieldgrid.nl/healthz|exact-200",
      ].join("\n"),
    },
  });

  const log = await readSystemctlLog(f.root);
  assert.match(log, /^sudo .*systemctl restart website marketing$/m);
  assert.match(log, /^systemctl restart website marketing$/m);
  assert.doesNotMatch(log, /^sudo .*systemctl restart website$/m);
  assert.doesNotMatch(log, /^sudo .*systemctl restart marketing$/m);
  for (const service of ["backoffice", "personeel", "klant", "api"]) {
    assert.match(log, new RegExp(`^sudo .*systemctl restart ${service}$`, "m"));
  }
});

test("health gate rejects a partial marketing runtime configuration", async (t) => {
  const f = await fixture(t);
  await run(f.bash, f.activateArgs, { env: f.commonEnv });

  const result = await run(f.bash, f.healthArgs, {
    env: {
      ...f.commonEnv,
      MARKETING_SERVICE_NAME: "marketing",
      MARKETING_PORT: "",
    },
    allowFailure: true,
  });

  assert.notEqual(result.status, 0);
  const evidence = await readJson(join(f.root, "health.json"));
  assert.equal(evidence.checks.find((check) => check.name === "services:configured-count")?.status, "fail");
  assert.equal(evidence.checks.find((check) => check.name === "ports:configured-count")?.status, "fail");
  assert.equal(evidence.checks.find((check) => check.name === "endpoints:local-count")?.status, "fail");
});

test("HTTP 404 is rejected for exact-200 endpoints", async (t) => {
  const f = await fixture(t);
  await run(f.bash, f.activateArgs, { env: f.commonEnv });

  const result = await run(f.bash, f.healthArgs, {
    env: {
      ...f.commonEnv,
      FIELDGRID_DEPLOY_PUBLIC_ENDPOINTS: [
        "public-backoffice|https://platform-staging.example.test/login|login",
        "public-personnel|https://personnel-staging.example.test/personeel/healthz|exact-200",
        "public-customer|https://customer-staging.example.test/api-root|exact-200",
        "public-api-health|https://api-staging.example.test/api/healthz|exact-200",
      ].join("\n"),
    },
    allowFailure: true,
  });
  assert.notEqual(result.status, 0);
  const evidence = await readJson(join(f.root, "health.json"));
  assert.equal(evidence.checks.find((check) => check.name === "endpoint:public-customer")?.status, "fail");
});

test("HTTP 301 on healthz is failure", async (t) => {
  const f = await fixture(t);
  await run(f.bash, f.activateArgs, { env: f.commonEnv });

  const result = await run(f.bash, f.healthArgs, {
    env: {
      ...f.commonEnv,
      FIELDGRID_DEPLOY_PUBLIC_ENDPOINTS: [
        "public-backoffice|https://platform-staging.example.test/login|login",
        "public-personnel|https://personnel-staging.example.test/status-301|exact-200",
        "public-customer|https://customer-staging.example.test/klant/healthz|exact-200",
        "public-api-health|https://api-staging.example.test/api/healthz|exact-200",
      ].join("\n"),
    },
    allowFailure: true,
  });
  assert.notEqual(result.status, 0);
  const evidence = await readJson(join(f.root, "health.json"));
  const failed = evidence.checks.find((check) => check.name === "endpoint:public-personnel");
  assert.equal(failed?.status, "fail");
  assert.match(failed.detail, /HTTP 301/);
});

test("HTTP 302 on healthz is failure", async (t) => {
  const f = await fixture(t);
  await run(f.bash, f.activateArgs, { env: f.commonEnv });

  const result = await run(f.bash, f.healthArgs, {
    env: {
      ...f.commonEnv,
      FIELDGRID_DEPLOY_PUBLIC_ENDPOINTS: [
        "public-backoffice|https://platform-staging.example.test/login|login",
        "public-personnel|https://personnel-staging.example.test/status-302|exact-200",
        "public-customer|https://customer-staging.example.test/klant/healthz|exact-200",
        "public-api-health|https://api-staging.example.test/api/healthz|exact-200",
      ].join("\n"),
    },
    allowFailure: true,
  });
  assert.notEqual(result.status, 0);
  const evidence = await readJson(join(f.root, "health.json"));
  const failed = evidence.checks.find((check) => check.name === "endpoint:public-personnel");
  assert.equal(failed?.status, "fail");
  assert.match(failed.detail, /HTTP 302/);
});

test("HTTP 200 on healthz is pass", async (t) => {
  const f = await fixture(t);
  await run(f.bash, f.activateArgs, { env: f.commonEnv });

  await run(f.bash, f.healthArgs, {
    env: {
      ...f.commonEnv,
      FIELDGRID_DEPLOY_PUBLIC_ENDPOINTS: [
        "public-backoffice|https://platform-staging.example.test/login|login",
        "public-personnel|https://personnel-staging.example.test/status-200|exact-200",
        "public-customer|https://customer-staging.example.test/klant/healthz|exact-200",
        "public-api-health|https://api-staging.example.test/api/healthz|exact-200",
      ].join("\n"),
    },
  });
  const evidence = await readJson(join(f.root, "health.json"));
  const passed = evidence.checks.find((check) => check.name === "endpoint:public-personnel");
  assert.equal(passed?.status, "pass");
  assert.match(passed.detail, /HTTP 200/);
});

test("API-root HTTP 200 is failure when the contract requires exact 404", async (t) => {
  const f = await fixture(t);
  await run(f.bash, f.activateArgs, { env: f.commonEnv });

  const result = await run(f.bash, f.healthArgs, {
    env: {
      ...f.commonEnv,
      FIELDGRID_DEPLOY_API_ROOT_ENDPOINTS: "local-api-root|http://127.0.0.1:3400/api-root-200|api-root-404",
    },
    allowFailure: true,
  });
  assert.notEqual(result.status, 0);
  const evidence = await readJson(join(f.root, "health.json"));
  const failed = evidence.checks.find((check) => check.name === "endpoint:local-api-root");
  assert.equal(failed?.status, "fail");
  assert.match(failed.detail, /HTTP 200/);
});

test("rollback succeeds after a failed new release health check", async (t) => {
  const f = await fixture(t);
  await run(f.bash, f.activateArgs, { env: f.commonEnv });

  const result = await run(
    f.bash,
    [...f.healthArgs, "--previous-release", f.oldReleaseBash, "--rollback-on-failure"],
    {
      env: {
        ...f.commonEnv,
        FIELDGRID_DEPLOY_PUBLIC_ENDPOINTS: [
          "public-backoffice|https://public-bad.example.test/login|login",
          "public-personnel|https://personnel-staging.example.test/personeel/healthz|exact-200",
          "public-customer|https://customer-staging.example.test/klant/healthz|exact-200",
        "public-api-health|https://api-staging.example.test/api/healthz|exact-200",
        ].join("\n"),
      },
      allowFailure: true,
    },
  );

  assert.notEqual(result.status, 0);
  assert.equal(await readCurrentTarget(f.bash, f.base), f.oldReleaseBash);
  const evidence = await readJson(join(f.root, "health.json"));
  assert.equal(evidence.rollbackStatus, "pass");
  assert.equal(evidence.checks.find((check) => check.name === "rollback:symlink")?.status, "pass");
  assert.equal(evidence.checks.find((check) => check.name === "rollback:health")?.status, "pass");
});

test("rollback itself fails when restored release health remains bad", async (t) => {
  const f = await fixture(t);
  await run(f.bash, f.activateArgs, { env: f.commonEnv });

  const result = await run(
    f.bash,
    [...f.healthArgs, "--previous-release", f.oldReleaseBash, "--rollback-on-failure"],
    {
      env: {
        ...f.commonEnv,
        FIELDGRID_DEPLOY_PUBLIC_ENDPOINTS: [
          "public-backoffice|https://rollback-bad.example.test/login|login",
          "public-personnel|https://personnel-staging.example.test/personeel/healthz|exact-200",
          "public-customer|https://customer-staging.example.test/klant/healthz|exact-200",
        "public-api-health|https://api-staging.example.test/api/healthz|exact-200",
        ].join("\n"),
      },
      allowFailure: true,
    },
  );

  assert.notEqual(result.status, 0);
  assert.equal(await readCurrentTarget(f.bash, f.base), f.oldReleaseBash);
  const evidence = await readJson(join(f.root, "health.json"));
  assert.equal(evidence.rollbackStatus, "failed");
});

test("rollback fails closed when previous release path is missing", async (t) => {
  const f = await fixture(t);
  await run(f.bash, f.activateArgs, { env: f.commonEnv });

  const result = await run(
    f.bash,
    [...f.healthArgs, "--previous-release", `${f.baseBash}/releases/missing`, "--rollback-on-failure"],
    {
      env: {
        ...f.commonEnv,
        FIELDGRID_DEPLOY_PUBLIC_ENDPOINTS: [
          "public-backoffice|https://public-bad.example.test/login|login",
          "public-personnel|https://personnel-staging.example.test/personeel/healthz|exact-200",
          "public-customer|https://customer-staging.example.test/klant/healthz|exact-200",
        "public-api-health|https://api-staging.example.test/api/healthz|exact-200",
        ].join("\n"),
      },
      allowFailure: true,
    },
  );

  assert.notEqual(result.status, 0);
  const evidence = await readJson(join(f.root, "health.json"));
  assert.equal(evidence.rollbackStatus, "unavailable");
  assert.equal(evidence.checks.find((check) => check.name === "rollback:previous-release")?.status, "fail");
});

test("no previous release reports rollback unavailable", async (t) => {
  const f = await fixture(t);
  await run(f.bash, f.activateArgs, { env: f.commonEnv });

  const result = await run(f.bash, [...f.healthArgs, "--rollback-on-failure"], {
    env: {
      ...f.commonEnv,
      FIELDGRID_DEPLOY_PUBLIC_ENDPOINTS: [
        "public-backoffice|https://public-bad.example.test/login|login",
        "public-personnel|https://personnel-staging.example.test/personeel/healthz|exact-200",
        "public-customer|https://customer-staging.example.test/klant/healthz|exact-200",
        "public-api-health|https://api-staging.example.test/api/healthz|exact-200",
      ].join("\n"),
    },
    allowFailure: true,
  });

  assert.notEqual(result.status, 0);
  const evidence = await readJson(join(f.root, "health.json"));
  assert.equal(evidence.rollbackStatus, "unavailable");
});

test("build or migration failure before activation leaves current symlink untouched", async (t) => {
  const f = await fixture(t);

  const result = await run(f.bash, [...f.activateArgs, "--migration-status", "failed"], {
    env: f.commonEnv,
    allowFailure: true,
  });

  assert.notEqual(result.status, 0);
  assert.equal(await readCurrentTarget(f.bash, f.base), f.oldReleaseBash);
  assert.ok(existsSync(join(f.root, "activate.json")));
  const evidence = await readJson(join(f.root, "activate.json"));
  assert.equal(evidence.status, "fail");
});

test("SHA marker mismatch before activation leaves current symlink untouched", async (t) => {
  const f = await fixture(t);

  const result = await run(f.bash, [...f.activateArgs, "--expected-sha", "wrong-sha"], {
    env: f.commonEnv,
    allowFailure: true,
  });

  assert.notEqual(result.status, 0);
  assert.equal(await readCurrentTarget(f.bash, f.base), f.oldReleaseBash);
  const evidence = await readJson(join(f.root, "activate.json"));
  assert.equal(evidence.status, "fail");
  assert.match(evidence.detail, /mismatch/);
});

test("missing SHA marker before activation leaves current symlink untouched", async (t) => {
  const f = await fixture(t);
  await rm(join(f.newRelease, ".fieldgrid-release-sha"));

  const result = await run(f.bash, f.activateArgs, {
    env: f.commonEnv,
    allowFailure: true,
  });

  assert.notEqual(result.status, 0);
  assert.equal(await readCurrentTarget(f.bash, f.base), f.oldReleaseBash);
  const evidence = await readJson(join(f.root, "activate.json"));
  assert.equal(evidence.status, "fail");
  assert.match(evidence.detail, /missing/);
});

test("production is rejected by staging-only shell scripts before symlink changes", async (t) => {
  const f = await fixture(t);

  const activateResult = await run(
    f.bash,
    f.activateArgs.map((arg) => (arg === "staging" ? "production" : arg)),
    { env: f.commonEnv, allowFailure: true },
  );
  assert.notEqual(activateResult.status, 0);
  assert.equal(await readCurrentTarget(f.bash, f.base), f.oldReleaseBash);

  const healthResult = await run(
    f.bash,
    f.healthArgs.map((arg) => (arg === "staging" ? "production" : arg)),
    { env: f.commonEnv, allowFailure: true },
  );
  assert.notEqual(healthResult.status, 0);
});

test("rollback restarts all four services, reloads Caddy, and rechecks rollback health", async (t) => {
  const f = await fixture(t);
  await run(f.bash, f.activateArgs, { env: f.commonEnv });

  const result = await run(
    f.bash,
    [...f.healthArgsWithRestart, "--previous-release", f.oldReleaseBash, "--rollback-on-failure"],
    {
      env: {
        ...f.commonEnv,
        FIELDGRID_DEPLOY_PUBLIC_ENDPOINTS: [
          "public-backoffice|https://public-bad.example.test/login|login",
          "public-personnel|https://personnel-staging.example.test/personeel/healthz|exact-200",
          "public-customer|https://customer-staging.example.test/klant/healthz|exact-200",
        "public-api-health|https://api-staging.example.test/api/healthz|exact-200",
        ].join("\n"),
      },
      allowFailure: true,
    },
  );

  assert.notEqual(result.status, 0);
  const log = await readSystemctlLog(f.root);
  for (const service of ["backoffice", "personeel", "klant", "api"]) {
    assert.equal(countOccurrences(log, new RegExp(`^(sudo )?systemctl restart ${service}$`)), 2);
  }
  assert.equal(countOccurrences(log, /^(sudo )?systemctl reload caddy$/), 2);
  const evidence = await readJson(join(f.root, "health.json"));
  assert.equal(evidence.checks.find((check) => check.name === "rollback:health")?.status, "pass");
});

test("Caddy reload failure before health gate triggers rollback", async (t) => {
  const f = await fixture(t);
  await run(f.bash, f.activateArgs, { env: f.commonEnv });

  const result = await run(
    f.bash,
    [...f.healthArgsWithRestart, "--previous-release", f.oldReleaseBash, "--rollback-on-failure"],
    {
      env: { ...f.commonEnv, MOCK_RELOAD_FAIL: "1" },
      allowFailure: true,
    },
  );

  assert.notEqual(result.status, 0);
  assert.equal(await readCurrentTarget(f.bash, f.base), f.oldReleaseBash);
  const evidence = await readJson(join(f.root, "health.json"));
  assert.equal(evidence.checks.find((check) => check.name === "activation:restart")?.status, "fail");
});

test("rollback service restart failure marks rollback failed", async (t) => {
  const f = await fixture(t);
  await run(f.bash, f.activateArgs, { env: f.commonEnv });

  const result = await run(
    f.bash,
    [...f.healthArgs, "--previous-release", f.oldReleaseBash, "--rollback-on-failure"],
    {
      env: {
        ...f.commonEnv,
        MOCK_RESTART_FAIL: "klant",
        FIELDGRID_DEPLOY_PUBLIC_ENDPOINTS: [
          "public-backoffice|https://public-bad.example.test/login|login",
          "public-personnel|https://personnel-staging.example.test/personeel/healthz|exact-200",
          "public-customer|https://customer-staging.example.test/klant/healthz|exact-200",
        "public-api-health|https://api-staging.example.test/api/healthz|exact-200",
        ].join("\n"),
      },
      allowFailure: true,
    },
  );

  assert.notEqual(result.status, 0);
  assert.equal(await readCurrentTarget(f.bash, f.base), f.oldReleaseBash);
  const evidence = await readJson(join(f.root, "health.json"));
  assert.equal(evidence.rollbackStatus, "failed");
  assert.equal(evidence.checks.find((check) => check.name === "rollback:restart")?.status, "fail");
});

test("Caddy reload failure during rollback marks rollback failed", async (t) => {
  const f = await fixture(t);
  await run(f.bash, f.activateArgs, { env: f.commonEnv });

  const result = await run(
    f.bash,
    [...f.healthArgs, "--previous-release", f.oldReleaseBash, "--rollback-on-failure"],
    {
      env: {
        ...f.commonEnv,
        MOCK_RELOAD_FAIL: "1",
        FIELDGRID_DEPLOY_PUBLIC_ENDPOINTS: [
          "public-backoffice|https://public-bad.example.test/login|login",
          "public-personnel|https://personnel-staging.example.test/personeel/healthz|exact-200",
          "public-customer|https://customer-staging.example.test/klant/healthz|exact-200",
        "public-api-health|https://api-staging.example.test/api/healthz|exact-200",
        ].join("\n"),
      },
      allowFailure: true,
    },
  );

  assert.notEqual(result.status, 0);
  assert.equal(await readCurrentTarget(f.bash, f.base), f.oldReleaseBash);
  const evidence = await readJson(join(f.root, "health.json"));
  assert.equal(evidence.rollbackStatus, "failed");
  assert.equal(evidence.checks.find((check) => check.name === "rollback:restart")?.status, "fail");
});

test("rollback is blocked if current no longer points at the failed release", async (t) => {
  const f = await fixture(t);
  await run(f.bash, f.activateArgs, { env: f.commonEnv });
  await run(f.bash, ["-lc", `ln -sfn ${shellQuote(f.oldReleaseBash)} ${shellQuote(`${f.baseBash}/current.other`)} && mv -Tf ${shellQuote(`${f.baseBash}/current.other`)} ${shellQuote(`${f.baseBash}/current`)}`]);

  const result = await run(
    f.bash,
    [...f.healthArgs, "--previous-release", f.oldReleaseBash, "--rollback-on-failure"],
    {
      env: {
        ...f.commonEnv,
        FIELDGRID_DEPLOY_PUBLIC_ENDPOINTS: [
          "public-backoffice|https://public-bad.example.test/login|login",
          "public-personnel|https://personnel-staging.example.test/personeel/healthz|exact-200",
          "public-customer|https://customer-staging.example.test/klant/healthz|exact-200",
        "public-api-health|https://api-staging.example.test/api/healthz|exact-200",
        ].join("\n"),
      },
      allowFailure: true,
    },
  );

  assert.notEqual(result.status, 0);
  const evidence = await readJson(join(f.root, "health.json"));
  assert.equal(evidence.rollbackStatus, "blocked");
  assert.equal(evidence.checks.find((check) => check.name === "rollback:current")?.status, "fail");
});

test("evidence files are machine-readable, mode 0640, and redact URL paths and credentials", async (t) => {
  const f = await fixture(t);
  await run(f.bash, f.activateArgs, { env: f.commonEnv });

  await run(f.bash, f.healthArgs, {
    env: {
      ...f.commonEnv,
      FIELDGRID_DEPLOY_PUBLIC_ENDPOINTS: [
        "public-backoffice|https://user:pass@platform-staging.example.test/login?token=secret#frag|login",
        "public-personnel|https://personnel-staging.example.test/personeel/healthz|exact-200",
        "public-customer|https://customer-staging.example.test/klant/healthz|exact-200",
        "public-api-health|https://api-staging.example.test/api/healthz|exact-200",
      ].join("\n"),
    },
  });

  const evidencePath = join(f.root, "health.json");
  const evidence = await readJson(evidencePath);
  const mode = (await stat(evidencePath)).mode & 0o777;
  assert.equal(mode, 0o640);
  const backoffice = evidence.checks.find((check) => check.name === "endpoint:public-backoffice");
  assert.equal(backoffice?.status, "pass");
  assert.match(backoffice.detail, /https:\/\/platform-staging\.example\.test$/);
  assert.doesNotMatch(backoffice.detail, /user|pass|login|token|frag/);
});

test("deploy workflow keeps production activation body free of staging health scripts", async () => {
  const workflow = normalizeLineEndings(await readFile(deployWorkflow, "utf8"));
  assert.match(workflow, /- name: Activate release\n\s+if: env\.TARGET == 'production'/);
  assert.match(workflow, /- name: Activate staging release\n\s+if: env\.TARGET == 'staging'/);
  assert.match(workflow, /- name: Run staging deploy health gate\n\s+if: env\.TARGET == 'staging'/);

  const productionBlock = workflow.slice(
    workflow.indexOf("- name: Activate release"),
    workflow.indexOf("- name: Activate staging release"),
  );
  assert.match(productionBlock, /ln -sfn "\$RELEASE" "\$BASE_DIR\/current\.new"/);
  assert.match(productionBlock, /mv -Tf "\$BASE_DIR\/current\.new" "\$BASE_DIR\/current"/);
  assert.doesNotMatch(productionBlock, /fieldgrid-atomic-release-activate|fieldgrid-deploy-health-gate|rollback-on-failure/);
});

test("deploy cleanup remains after staging health gate and is unreachable before green health", async () => {
  const workflow = normalizeLineEndings(await readFile(deployWorkflow, "utf8"));
  const healthIndex = workflow.indexOf("- name: Run staging deploy health gate");
  const cleanupIndex = workflow.indexOf("- name: Cleanup old releases");
  assert.ok(healthIndex > -1, "staging health gate step must exist");
  assert.ok(cleanupIndex > healthIndex, "cleanup must run after the staging health gate step");
  const cleanupBlock = workflow.slice(cleanupIndex);
  assert.doesNotMatch(cleanupBlock, /always\(\)/);
});

test("public API root is checked only in the API-root endpoint group", async () => {
  const script = await readFile(healthScript, "utf8");
  const apiRootBlock = script.slice(
    script.indexOf("default_api_root_endpoints()"),
    script.indexOf("default_public_endpoints()"),
  );
  const publicBlock = script.slice(
    script.indexOf("default_public_endpoints()"),
    script.indexOf("http_status()"),
  );

  assert.match(apiRootBlock, /append_endpoint "public-api-root" "\$API_PUBLIC_ROOT_URL" "api-root-404"/);
  assert.doesNotMatch(publicBlock, /public-api-root/);
});

test("default backoffice health probes follow the shared-host admin base path", async () => {
  const script = await readFile(healthScript, "utf8");
  const localBlock = script.slice(
    script.indexOf("default_local_endpoints()"),
    script.indexOf("default_api_root_endpoints()"),
  );
  const publicBlock = script.slice(
    script.indexOf("default_public_endpoints()"),
    script.indexOf("http_status()"),
  );

  assert.match(localBlock, /\$\{BACKOFFICE_PORT:-\$PORT\}\/admin\/login/u);
  assert.doesNotMatch(localBlock, /\$\{BACKOFFICE_PORT:-\$PORT\}\/login/u);
  assert.match(publicBlock, /"\/admin\/login"/u);
});

test("service reads do not use sudo while restart and reload do", async (t) => {
  const f = await fixture(t);
  await run(f.bash, f.activateArgs, { env: f.commonEnv });
  await run(f.bash, f.healthArgsWithRestart, { env: f.commonEnv });
  const log = await readSystemctlLog(f.root);
  assert.match(log, /^systemctl is-active --quiet backoffice$/m);
  assert.doesNotMatch(log, /^sudo .*is-active/m);
  assert.match(log, /^sudo .*systemctl restart backoffice$/m);
  assert.match(log, /^sudo .*systemctl reload caddy$/m);
});

test("activating service can become active within retries", async (t) => {
  const f = await fixture(t);
  await run(f.bash, f.activateArgs, { env: f.commonEnv });
  await writeFile(join(f.base, "service-klant-state"), "activating");
  await run(f.bash, f.healthArgs, { env: { ...f.commonEnv, FIELDGRID_DEPLOY_HEALTH_ATTEMPTS: "2" } });
  const evidence = await readJson(join(f.root, "health.json"));
  assert.equal(evidence.checks.find((check) => check.name === "service:klant")?.status, "pass");
});

test("permanently inactive service fails with exit diagnostics", async (t) => {
  const f = await fixture(t);
  await run(f.bash, f.activateArgs, { env: f.commonEnv });
  await writeFile(join(f.base, "service-klant-state"), "inactive");
  const result = await run(f.bash, f.healthArgs, { env: f.commonEnv, allowFailure: true });
  assert.notEqual(result.status, 0);
  const evidence = await readJson(join(f.root, "health.json"));
  const failed = evidence.checks.find((check) => check.name === "service:klant");
  assert.equal(failed?.status, "fail");
  assert.match(failed.detail, /exit=3/);
});

test("exact public health URL variables have precedence and API root is optional", async (t) => {
  const f = await fixture(t);
  await run(f.bash, f.activateArgs, { env: f.commonEnv });
  await run(f.bash, f.healthArgs, {
    env: {
      ...f.commonEnv,
      FIELDGRID_DEPLOY_PUBLIC_ENDPOINTS: "",
      FIELDGRID_DEPLOY_API_ROOT_ENDPOINTS: "",
      BACKOFFICE_PUBLIC_LOGIN_URL: "https://staging.fieldgrid.nl/admin/login",
      PERSONEEL_PUBLIC_HEALTH_URL: "https://staging.fieldgrid.nl/personeel/healthz",
      KLANT_PUBLIC_HEALTH_URL: "https://staging.fieldgrid.nl/klant/healthz",
      API_PUBLIC_HEALTH_URL: "https://staging.fieldgrid.nl/api/healthz",
      API_PUBLIC_ROOT_URL: "",
    },
  });
  const evidence = await readJson(join(f.root, "health.json"));
  assert.equal(evidence.checks.find((check) => check.name === "endpoints:api-root-count")?.status, "pass");
  assert.equal(evidence.checks.find((check) => check.name === "endpoints:public-count")?.status, "pass");
});

test("missing required public personnel customer or API health URL fails clearly", async (t) => {
  for (const missing of ["PERSONEEL_PUBLIC_HEALTH_URL", "KLANT_PUBLIC_HEALTH_URL", "API_PUBLIC_HEALTH_URL"]) {
    const f = await fixture(t);
    await run(f.bash, f.activateArgs, { env: f.commonEnv });
    const env = {
      ...f.commonEnv,
      FIELDGRID_DEPLOY_PUBLIC_ENDPOINTS: "",
      FIELDGRID_DEPLOY_API_ROOT_ENDPOINTS: "",
      BACKOFFICE_PUBLIC_LOGIN_URL: "https://staging.fieldgrid.nl/admin/login",
      PERSONEEL_PUBLIC_HEALTH_URL: "https://staging.fieldgrid.nl/personeel/healthz",
      KLANT_PUBLIC_HEALTH_URL: "https://staging.fieldgrid.nl/klant/healthz",
      API_PUBLIC_HEALTH_URL: "https://staging.fieldgrid.nl/api/healthz",
    };
    delete env[missing];
    const result = await run(f.bash, f.healthArgs, { env, allowFailure: true });
    assert.notEqual(result.status, 0, missing);
    const evidence = await readJson(join(f.root, "health.json"));
    assert.equal(evidence.checks.find((check) => check.name === "endpoints:public-count")?.status, "fail", missing);
  }
});

test("API root 404 passes and 200 fails when explicitly configured", async (t) => {
  const f = await fixture(t);
  await run(f.bash, f.activateArgs, { env: f.commonEnv });
  await run(f.bash, f.healthArgs, { env: { ...f.commonEnv, FIELDGRID_DEPLOY_API_ROOT_ENDPOINTS: "public-api-root|https://staging.fieldgrid.nl/api-root|api-root-404" } });
  let evidence = await readJson(join(f.root, "health.json"));
  assert.equal(evidence.checks.find((check) => check.name === "endpoint:public-api-root")?.status, "pass");
  const result = await run(f.bash, f.healthArgs, { env: { ...f.commonEnv, FIELDGRID_DEPLOY_API_ROOT_ENDPOINTS: "public-api-root|https://staging.fieldgrid.nl/api-root-200|api-root-404" }, allowFailure: true });
  assert.notEqual(result.status, 0);
  evidence = await readJson(join(f.root, "health.json"));
  assert.equal(evidence.checks.find((check) => check.name === "endpoint:public-api-root")?.status, "fail");
});

test("endpoint group records multiple failures and invalid specs without blocking diagnostics", async (t) => {
  const f = await fixture(t);
  await run(f.bash, f.activateArgs, { env: f.commonEnv });
  const result = await run(f.bash, f.healthArgs, {
    env: { ...f.commonEnv, FIELDGRID_DEPLOY_PUBLIC_ENDPOINTS: [
      "public-backoffice|https://platform-staging.example.test/login|login",
      "public-personnel|https://personnel-staging.example.test/status-301|exact-200",
      "invalid|https://invalid.example.test",
      "public-customer|https://customer-staging.example.test/status-302|exact-200",
      "public-api-health|https://api-staging.example.test/api/healthz|exact-200",
    ].join("\n") },
    allowFailure: true,
  });
  assert.notEqual(result.status, 0);
  const evidence = await readJson(join(f.root, "health.json"));
  assert.equal(evidence.checks.filter((check) => check.status === "fail" && check.name.startsWith("endpoint:")).length >= 3, true);
});

test("markerbackfill writes marker and rejects unsafe paths or mismatches", async (t) => {
  const f = await fixture(t);
  const release = join(f.base, "releases", `20260713000000-${expectedSha.slice(0, 7)}`);
  await mkdir(release, { recursive: true });
  const releaseBash = await toBashPath(f.bash, release);
  const scriptBash = await toBashPath(f.bash, backfillScript);
  await run(f.bash, [scriptBash, "--environment", "staging", "--base-dir", f.baseBash, "--release-path", releaseBash, "--expected-sha", expectedSha]);
  assert.equal((await readFile(join(release, ".fieldgrid-release-sha"), "utf8")).trim(), expectedSha);

  const badPath = await run(f.bash, [scriptBash, "--environment", "staging", "--base-dir", f.baseBash, "--release-path", f.baseBash, "--expected-sha", expectedSha], { allowFailure: true });
  assert.notEqual(badPath.status, 0);
  const mismatch = join(f.base, "releases", "20260713000000-deadbee");
  await mkdir(mismatch, { recursive: true });
  const mismatchBash = await toBashPath(f.bash, mismatch);
  const badName = await run(f.bash, [scriptBash, "--environment", "staging", "--base-dir", f.baseBash, "--release-path", mismatchBash, "--expected-sha", expectedSha], { allowFailure: true });
  assert.notEqual(badName.status, 0);
  await writeFile(join(release, ".fieldgrid-release-sha"), "0000000000000000000000000000000000000000\n");
  const existing = await run(f.bash, [scriptBash, "--environment", "staging", "--base-dir", f.baseBash, "--release-path", releaseBash, "--expected-sha", expectedSha], { allowFailure: true });
  assert.notEqual(existing.status, 0);
});
