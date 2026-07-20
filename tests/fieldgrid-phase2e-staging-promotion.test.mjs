import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  CONFIRMATION,
  assertPromotionContract,
  buildPushArgs,
  parseArgs,
  promoteExactMainToStaging,
} from "../scripts/fieldgrid-phase2e-staging-promote.mjs";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));

function git(cwd, args) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  assert.equal(
    result.status,
    0,
    `git ${args.join(" ")} failed: ${result.stderr || result.stdout}`,
  );
  return result.stdout.trim();
}

function makeFixture({ unrelatedMain = false } = {}) {
  const root = mkdtempSync(join(tmpdir(), "fieldgrid-phase2e-promotion-"));
  const remote = join(root, "remote.git");
  const seed = join(root, "seed");
  const operator = join(root, "operator");

  git(root, ["init", "--bare", remote]);
  git(root, ["init", seed]);
  git(seed, ["config", "user.name", "Fieldgrid Test"]);
  git(seed, ["config", "user.email", "fieldgrid-test@example.invalid"]);
  writeFileSync(join(seed, "release.txt"), "staging\n");
  git(seed, ["add", "release.txt"]);
  git(seed, ["commit", "-m", "staging baseline"]);
  git(seed, ["branch", "-M", "staging"]);
  git(seed, ["remote", "add", "origin", remote]);
  git(seed, ["push", "origin", "staging"]);
  const stagingSha = git(seed, ["rev-parse", "HEAD"]);

  if (unrelatedMain) {
    git(seed, ["switch", "--orphan", "main"]);
    writeFileSync(join(seed, "release.txt"), "unrelated main\n");
  } else {
    git(seed, ["switch", "-c", "main"]);
    writeFileSync(join(seed, "release.txt"), "approved main\n");
  }
  git(seed, ["add", "release.txt"]);
  git(seed, ["commit", "-m", "approved main"]);
  git(seed, ["push", "origin", "main"]);
  const mainSha = git(seed, ["rev-parse", "HEAD"]);

  git(remote, ["symbolic-ref", "HEAD", "refs/heads/main"]);
  git(root, ["clone", remote, operator]);

  return { root, remote, operator, mainSha, stagingSha };
}

function remoteRef(remote, branch) {
  return git(remote, ["rev-parse", `refs/heads/${branch}`]);
}

function validOptions(fixture) {
  return {
    run: true,
    check: false,
    source: "main",
    target: "staging",
    approvedMain: fixture.mainSha,
    expectedStaging: fixture.stagingSha,
    confirmation: CONFIRMATION,
  };
}

test("valid exact-ref promotion performs one normal fast-forward push", () => {
  const fixture = makeFixture();
  try {
    const pushArgs = buildPushArgs(fixture.mainSha);
    assert.deepEqual(pushArgs, [
      "push",
      "origin",
      `${fixture.mainSha}:refs/heads/staging`,
    ]);
    assert.equal(
      pushArgs.some((argument) => argument.startsWith("--force")),
      false,
    );

    const result = promoteExactMainToStaging(validOptions(fixture), {
      repoDir: fixture.operator,
    });
    assert.equal(result.previousStaging, fixture.stagingSha);
    assert.equal(result.promotedStaging, fixture.mainSha);
    assert.equal(remoteRef(fixture.remote, "staging"), fixture.mainSha);
    assert.equal(remoteRef(fixture.remote, "main"), fixture.mainSha);
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

test("stale staging SHA is rejected without moving a ref", () => {
  const fixture = makeFixture();
  try {
    const before = remoteRef(fixture.remote, "staging");
    assert.throws(
      () =>
        promoteExactMainToStaging(
          { ...validOptions(fixture), expectedStaging: "c".repeat(40) },
          { repoDir: fixture.operator },
        ),
      /origin\/staging changed/u,
    );
    assert.equal(remoteRef(fixture.remote, "staging"), before);
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

test("stale main SHA is rejected without moving a ref", () => {
  const fixture = makeFixture();
  try {
    const before = remoteRef(fixture.remote, "staging");
    assert.throws(
      () =>
        promoteExactMainToStaging(
          { ...validOptions(fixture), approvedMain: "d".repeat(40) },
          { repoDir: fixture.operator },
        ),
      /origin\/main changed/u,
    );
    assert.equal(remoteRef(fixture.remote, "staging"), before);
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

test("non-ancestor staging is rejected without moving a ref", () => {
  const fixture = makeFixture({ unrelatedMain: true });
  try {
    const before = remoteRef(fixture.remote, "staging");
    assert.throws(
      () =>
        promoteExactMainToStaging(validOptions(fixture), {
          repoDir: fixture.operator,
        }),
      /not an ancestor/u,
    );
    assert.equal(remoteRef(fixture.remote, "staging"), before);
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

test("forced-update arguments are rejected", () => {
  assert.throws(() => parseArgs(["--force"]), /forbidden/u);
  assert.throws(
    () => parseArgs(["--force-with-lease", "origin"]),
    /forbidden/u,
  );
  assert.throws(
    () => parseArgs(["--force-with-lease=refs\/heads\/staging:abc"]),
    /forbidden/u,
  );
});

test("release sources and production targets are rejected", () => {
  const base = {
    source: "main",
    target: "staging",
    approvedMain: "a".repeat(40),
    expectedStaging: "b".repeat(40),
    confirmation: CONFIRMATION,
  };
  assert.throws(
    () => assertPromotionContract({ ...base, source: "release/phase2" }),
    /release branches are forbidden/u,
  );
  assert.throws(
    () => assertPromotionContract({ ...base, target: "production" }),
    /production is forbidden/u,
  );
});

test("Phase 2E preflight check does not move main or staging", () => {
  const fixture = makeFixture();
  try {
    const beforeMain = remoteRef(fixture.remote, "main");
    const beforeStaging = remoteRef(fixture.remote, "staging");
    const result = spawnSync(
      process.execPath,
      [
        join(repoRoot, "scripts/fieldgrid-phase2e-staging-preflight.mjs"),
        "--check",
      ],
      { cwd: fixture.operator, encoding: "utf8" },
    );
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.equal(remoteRef(fixture.remote, "main"), beforeMain);
    assert.equal(remoteRef(fixture.remote, "staging"), beforeStaging);
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});
