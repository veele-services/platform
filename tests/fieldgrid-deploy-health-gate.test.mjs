import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const __filename = fileURLToPath(import.meta.url);
const repoRoot = resolve(dirname(__filename), "..");
const activateScript = join(repoRoot, "scripts", "fieldgrid-atomic-release-activate.sh");
const healthScript = join(repoRoot, "scripts", "fieldgrid-deploy-health-gate.sh");
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
  if (!bash) return { skip: "POSIX shell unavailable; shell-level deploy tests require bash." };

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
  const symlinkResult = await run(
    bash,
    [
      "-lc",
      `rm -rf ${shellQuote(`${baseBash}/current`)} && ln -s ${shellQuote(oldReleaseBash)} ${shellQuote(`${baseBash}/current`)} && test -L ${shellQuote(`${baseBash}/current`)}`,
    ],
    { allowFailure: true },
  );
  if (symlinkResult.status !== 0) {
    return { skip: "POSIX symlink semantics unavailable; deploy rollback shell tests run on Linux." };
  }

  await makeExecutable(
    join(mockbin, "systemctl"),
    `#!/usr/bin/env sh
echo "$@" >> "$MOCK_LOG"
if [ "$1" = "is-active" ]; then
  service="$3"
  if [ "$service" = "$MOCK_DEAD_SERVICE" ]; then exit 3; fi
  exit 0
fi
if [ "$1" = "restart" ] && [ "$2" = "$MOCK_RESTART_FAIL" ]; then exit 1; fi
exit 0
`,
  );
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
  *public-bad*) if printf '%s' "$current" | grep -q '/new$'; then printf '502'; else printf '200'; fi; exit 0 ;;
  *rollback-bad*) printf '502'; exit 0 ;;
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
  const commonEnv = {
    MOCK_BASE: baseBash,
    MOCK_LOG: join(root, "systemctl.log"),
    SYSTEMCTL_BIN: systemctlBin,
    SS_BIN: ssBin,
    CURL_BIN: curlBin,
    SLEEP_BIN: sleepBin,
    MOCK_LISTEN_PORTS: "3100 3200 3300 3400",
    FIELDGRID_DEPLOY_HEALTH_ATTEMPTS: "1",
    FIELDGRID_DEPLOY_HEALTH_RETRY_SECONDS: "0",
    FIELDGRID_DEPLOY_CURL_MAX_TIME_SECONDS: "1",
    FIELDGRID_DEPLOY_SERVICES: "backoffice personeel klant api",
    FIELDGRID_DEPLOY_PORTS: "3100 3200 3300 3400",
    FIELDGRID_DEPLOY_LOCAL_ENDPOINTS: [
      "local-backoffice|http://127.0.0.1:3100/login|strict",
      "local-personnel|http://127.0.0.1:3200/personeel/healthz|strict",
      "local-customer|http://127.0.0.1:3300/klant/healthz|strict",
      "local-api-health|http://127.0.0.1:3400/api/healthz|strict",
      "local-api-root|http://127.0.0.1:3400/api-root|api-root",
    ].join("\n"),
    FIELDGRID_DEPLOY_PUBLIC_ENDPOINTS: [
      "public-backoffice|https://platform-staging.example.test/login|strict",
      "public-personnel|https://personnel-staging.example.test/personeel/healthz|strict",
      "public-customer|https://customer-staging.example.test/klant/healthz|strict",
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

test("healthy activation switches current and passes the health gate", async (t) => {
  const f = await fixture(t);
  if (f.skip) return t.skip(f.skip);

  await run(f.bash, f.activateArgs, { env: f.commonEnv });
  assert.equal(await readCurrentTarget(f.bash, f.base), f.newReleaseBash);

  await run(f.bash, f.healthArgs, { env: f.commonEnv });
  const evidence = await readJson(join(f.root, "health.json"));
  assert.equal(evidence.status, "pass");
});

test("one dead service fails health evidence", async (t) => {
  const f = await fixture(t);
  if (f.skip) return t.skip(f.skip);
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
  if (f.skip) return t.skip(f.skip);
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
  if (f.skip) return t.skip(f.skip);
  await run(f.bash, f.activateArgs, { env: f.commonEnv });

  const result = await run(f.bash, f.healthArgs, {
    env: {
      ...f.commonEnv,
      FIELDGRID_DEPLOY_PUBLIC_ENDPOINTS: [
        "public-backoffice|https://platform-staging.example.test/login|strict",
        "public-personnel|https://public-bad.example.test/personeel/healthz|strict",
        "public-customer|https://customer-staging.example.test/klant/healthz|strict",
      ].join("\n"),
    },
    allowFailure: true,
  });
  assert.notEqual(result.status, 0);
  const evidence = await readJson(join(f.root, "health.json"));
  assert.equal(evidence.checks.find((check) => check.name === "endpoint:public-personnel")?.status, "fail");
});

test("API root 404 is allowed while API health remains strict", async (t) => {
  const f = await fixture(t);
  if (f.skip) return t.skip(f.skip);
  await run(f.bash, f.activateArgs, { env: f.commonEnv });

  await run(f.bash, f.healthArgs, { env: f.commonEnv });
  const evidence = await readJson(join(f.root, "health.json"));
  const apiRoot = evidence.checks.find((check) => check.name === "endpoint:local-api-root");
  assert.equal(apiRoot?.status, "pass");
  assert.match(apiRoot.detail, /HTTP 404 accepted/);
});

test("rollback succeeds after a failed new release health check", async (t) => {
  const f = await fixture(t);
  if (f.skip) return t.skip(f.skip);
  await run(f.bash, f.activateArgs, { env: f.commonEnv });

  const result = await run(
    f.bash,
    [...f.healthArgs, "--previous-release", f.oldReleaseBash, "--rollback-on-failure"],
    {
      env: {
        ...f.commonEnv,
        FIELDGRID_DEPLOY_PUBLIC_ENDPOINTS: [
          "public-backoffice|https://public-bad.example.test/login|strict",
          "public-personnel|https://personnel-staging.example.test/personeel/healthz|strict",
          "public-customer|https://customer-staging.example.test/klant/healthz|strict",
        ].join("\n"),
      },
      allowFailure: true,
    },
  );

  assert.notEqual(result.status, 0);
  assert.equal(await readCurrentTarget(f.bash, f.base), f.oldReleaseBash);
  const evidence = await readJson(join(f.root, "health.json"));
  assert.equal(evidence.rollbackStatus, "pass");
});

test("rollback itself fails when restored release health remains bad", async (t) => {
  const f = await fixture(t);
  if (f.skip) return t.skip(f.skip);
  await run(f.bash, f.activateArgs, { env: f.commonEnv });

  const result = await run(
    f.bash,
    [...f.healthArgs, "--previous-release", f.oldReleaseBash, "--rollback-on-failure"],
    {
      env: {
        ...f.commonEnv,
        FIELDGRID_DEPLOY_PUBLIC_ENDPOINTS: [
          "public-backoffice|https://rollback-bad.example.test/login|strict",
          "public-personnel|https://personnel-staging.example.test/personeel/healthz|strict",
          "public-customer|https://customer-staging.example.test/klant/healthz|strict",
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

test("no previous release reports rollback unavailable", async (t) => {
  const f = await fixture(t);
  if (f.skip) return t.skip(f.skip);
  await run(f.bash, f.activateArgs, { env: f.commonEnv });

  const result = await run(f.bash, [...f.healthArgs, "--rollback-on-failure"], {
    env: {
      ...f.commonEnv,
      FIELDGRID_DEPLOY_PUBLIC_ENDPOINTS: [
        "public-backoffice|https://public-bad.example.test/login|strict",
        "public-personnel|https://personnel-staging.example.test/personeel/healthz|strict",
        "public-customer|https://customer-staging.example.test/klant/healthz|strict",
      ].join("\n"),
    },
    allowFailure: true,
  });

  assert.notEqual(result.status, 0);
  const evidence = await readJson(join(f.root, "health.json"));
  assert.equal(evidence.rollbackStatus, "unavailable");
});

test("migration failure before activation leaves current symlink untouched", async (t) => {
  const f = await fixture(t);
  if (f.skip) return t.skip(f.skip);

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
