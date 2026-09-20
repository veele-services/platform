import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, readdir, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import {
  CONFIRMATION, DEPLOY_EXCLUSIONS, LEGACY_PRODUCTION_SHA, PRODUCTION_BASE_DIR,
  readSourceManifest, verifyAndMarkRelease, verifyOperatorContext,
} from "../scripts/fieldgrid-production-rollback-marker.mjs";

async function fixture(t) {
  const root = await mkdtemp(path.join(tmpdir(), "fieldgrid-production-marker-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const sourceRoot = path.join(root, "source");
  await mkdir(sourceRoot);
  const files = {
    ".github/workflows/deploy.yml": `run: rsync -a --delete ${DEPLOY_EXCLUSIONS.map((name) => `--exclude='${name}'`).join(" ")} ./ release/\n`,
    "package.json": '{"private":true}\n',
    "artifacts/app/source.ts": "export const release = 42;\n",
    "assets/binary.dat": Buffer.from([0, 1, 255, 13, 10]),
    ".env.example": "PUBLIC_CONFIG=example\n",
    "artifacts/app/dist/ignored.js": "generated source placeholder\n",
    "artifacts/app/.next/ignored.js": "generated build\n",
    "node_modules/ignored.js": "dependency\n",
    ".env": "excluded source environment\n",
  };
  for (const [name, bytes] of Object.entries(files)) {
    await mkdir(path.dirname(path.join(sourceRoot, name)), { recursive: true });
    await writeFile(path.join(sourceRoot, name), bytes);
  }
  const git = (args) => execFileSync("git", args, { cwd: sourceRoot, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  git(["init", "--quiet", "--template="]);
  git(["add", "."]);
  git(["-c", "user.name=Fixture", "-c", "user.email=fixture@example.test", "-c", "commit.gpgsign=false", "commit", "--quiet", "-m", "source"]);
  const expectedSha = git(["rev-parse", "HEAD"]);
  const baseDir = path.join(root, "production");
  const release = path.join(baseDir, "releases", `20260619011139-${expectedSha.slice(0, 7)}`);
  await mkdir(release, { recursive: true });
  const manifest = readSourceManifest(sourceRoot, expectedSha);
  for (const { filename } of manifest.files) {
    await mkdir(path.dirname(path.join(release, filename)), { recursive: true });
    await writeFile(path.join(release, filename), files[filename]);
  }
  await symlink(release, path.join(baseDir, "current"));
  return { root, sourceRoot, baseDir, expectedSha, release,
    marker: path.join(release, ".fieldgrid-release-sha"),
    options: { sourceRoot, baseDir, expectedSha }, git };
}

test("diagnosis hashes all copied tracked blobs and leaves the release unchanged", async (t) => {
  const f = await fixture(t);
  const before = await readdir(f.release);
  const result = await verifyAndMarkRelease(f.options);
  assert.equal(result.status, "verified");
  assert.equal(result.markerState, "missing");
  assert.equal(result.verifiedBlobs, 4);
  assert.equal(result.excludedBlobs, 5);
  assert.deepEqual(await readdir(f.release), before);
  assert.equal(existsSync(f.marker), false);
});

test("apply atomically creates the exact SHA marker and matching retries remain idempotent", async (t) => {
  const f = await fixture(t);
  const first = await verifyAndMarkRelease({ ...f.options, apply: true });
  assert.equal(first.status, "marked");
  assert.equal(await readFile(f.marker, "utf8"), `${f.expectedSha}\n`);
  assert.equal((await stat(f.marker)).mode & 0o777, 0o640);
  const inode = (await stat(f.marker)).ino;
  const second = await verifyAndMarkRelease({ ...f.options, apply: true });
  assert.equal(second.status, "already-matching");
  assert.equal((await stat(f.marker)).ino, inode);
  assert.deepEqual((await readdir(f.release)).filter((name) => name.endsWith(".tmp")), []);
});

test("mismatched and missing tracked files block marker creation and report only filenames", async (t) => {
  const f = await fixture(t);
  await writeFile(path.join(f.release, "artifacts/app/source.ts"), "PRIVATE_PAYLOAD_MUST_NOT_BE_LOGGED");
  await rm(path.join(f.release, "assets/binary.dat"));
  await assert.rejects(verifyAndMarkRelease({ ...f.options, apply: true }), (error) => {
    assert.equal(error.code, "source_files_differ");
    assert.deepEqual(error.files, ["artifacts/app/source.ts", "assets/binary.dat"]);
    assert.doesNotMatch(JSON.stringify(error), /PRIVATE_PAYLOAD/u);
    return true;
  });
  assert.equal(existsSync(f.marker), false);
});

test("an existing matching marker does not bypass source verification", async (t) => {
  const f = await fixture(t);
  await writeFile(f.marker, `${f.expectedSha}\n`);
  await writeFile(path.join(f.release, "package.json"), "{}");
  await assert.rejects(verifyAndMarkRelease({ ...f.options, apply: true }), { code: "source_files_differ" });
  assert.equal(await readFile(f.marker, "utf8"), `${f.expectedSha}\n`);
});

test("only the original deployment exclusions are ignored, including nested names", async (t) => {
  const f = await fixture(t);
  const outside = path.join(f.root, "sensitive-env");
  await writeFile(outside, "DO_NOT_READ\n");
  await symlink(outside, path.join(f.release, ".env"));
  await mkdir(path.join(f.release, "artifacts/app/dist"));
  await symlink(outside, path.join(f.release, "artifacts/app/dist/ignored.js"));
  assert.equal((await verifyAndMarkRelease(f.options)).verifiedBlobs, 4);
  await writeFile(path.join(f.release, ".env.example"), "changed\n");
  await assert.rejects(verifyAndMarkRelease(f.options), (error) => {
    assert.deepEqual(error.files, [".env.example"]);
    return true;
  });
});

test("symlink leaves and symlink ancestors are rejected even when bytes match", async (t) => {
  for (const kind of ["leaf", "ancestor", "release", "base"]) {
    await t.test(kind, async (t) => {
      const f = await fixture(t);
      if (kind === "leaf") {
        await rm(path.join(f.release, "package.json"));
        await symlink(path.join(f.sourceRoot, "package.json"), path.join(f.release, "package.json"));
      } else if (kind === "ancestor") {
        await rm(path.join(f.release, "artifacts/app"), { recursive: true });
        await symlink(path.join(f.sourceRoot, "artifacts/app"), path.join(f.release, "artifacts/app"));
      } else if (kind === "release") {
        await rm(f.release, { recursive: true });
        await symlink(f.sourceRoot, f.release);
      } else {
        const alias = path.join(f.root, "alias");
        await symlink(f.baseDir, alias);
        f.options.baseDir = alias;
      }
      await assert.rejects(verifyAndMarkRelease({ ...f.options, apply: true }));
      assert.equal(existsSync(f.marker), false);
    });
  }
});

test("mismatching or symlinked existing markers are never overwritten", async (t) => {
  for (const kind of ["wrong-sha", "symlink", "extra-lines"]) {
    await t.test(kind, async (t) => {
      const f = await fixture(t);
      if (kind === "wrong-sha") await writeFile(f.marker, `${"a".repeat(40)}\n`);
      if (kind === "extra-lines") await writeFile(f.marker, `${f.expectedSha}\nextra\n`);
      if (kind === "symlink") {
        const target = path.join(f.root, "outside-marker");
        await writeFile(target, `${f.expectedSha}\n`);
        await symlink(target, f.marker);
      }
      const before = await readFile(f.marker, "utf8");
      await assert.rejects(verifyAndMarkRelease({ ...f.options, apply: true }));
      assert.equal(await readFile(f.marker, "utf8"), before);
    });
  }
});

test("the original workflow exclusion contract is pinned, not extended to accommodate drift", async (t) => {
  const f = await fixture(t);
  await writeFile(path.join(f.sourceRoot, ".github/workflows/deploy.yml"), "rsync -a --delete --exclude='*'\n");
  f.git(["add", "."]);
  f.git(["-c", "user.name=Fixture", "-c", "user.email=fixture@example.test", "-c", "commit.gpgsign=false", "commit", "--quiet", "-m", "bad exclusions"]);
  assert.throws(() => readSourceManifest(f.sourceRoot, f.git(["rev-parse", "HEAD"])), { code: "deployment_exclusions_differ" });
});

test("operator guard requires exact protected main, production, the full pinned legacy SHA and apply confirmation", async (t) => {
  const f = await fixture(t);
  const env = { GITHUB_ACTIONS: "true", GITHUB_REPOSITORY: "veele-services/platform", GITHUB_REF: "refs/heads/main",
    GITHUB_EVENT_NAME: "workflow_dispatch", GITHUB_SHA: f.expectedSha, APP_ENV: "production", TARGET_ENVIRONMENT: "production",
    GITHUB_TOKEN: "unit-test-token" };
  const options = { expectedMainSha: f.expectedSha, expectedRollbackSha: LEGACY_PRODUCTION_SHA, apply: true,
    confirmation: CONFIRMATION, env, sourceRoot: f.sourceRoot,
    request: async () => ({ ok: true, json: async () => ({ object: { sha: f.expectedSha } }) }) };
  await verifyOperatorContext(options);
  for (const override of [
    { expectedRollbackSha: LEGACY_PRODUCTION_SHA.slice(0, 7) }, { confirmation: "" },
    { env: { ...env, APP_ENV: "staging" } }, { env: { ...env, TARGET_ENVIRONMENT: "staging" } },
    { env: { ...env, GITHUB_REF: "refs/heads/codex/feature" } },
    { request: async () => ({ ok: true, json: async () => ({ object: { sha: "a".repeat(40) } }) }) },
  ]) await assert.rejects(verifyOperatorContext({ ...options, ...override }));
  assert.equal(PRODUCTION_BASE_DIR, "/var/www/veele/production");
  assert.equal(LEGACY_PRODUCTION_SHA, "eedbf033ec08a12411760acf8ea7f5d5acf8cc20");
});
