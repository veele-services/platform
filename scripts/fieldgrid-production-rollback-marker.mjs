#!/usr/bin/env node
import { createHash, randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
import { constants } from "node:fs";
import { link, lstat, open, readlink, unlink } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const LEGACY_PRODUCTION_SHA = "eedbf033ec08a12411760acf8ea7f5d5acf8cc20";
export const PRODUCTION_BASE_DIR = "/var/www/veele/production";
export const CONFIRMATION = "fieldgrid-production-rollback-marker-v1";
export const DEPLOY_EXCLUSIONS = Object.freeze([".git", ".github", "node_modules", ".next", "dist", ".env"]);
const repositoryRoot = fileURLToPath(new URL("..", import.meta.url));
const markerName = ".fieldgrid-release-sha";
const shaPattern = /^[a-f0-9]{40}$/u;

class MarkerError extends Error {
  constructor(code, files = []) {
    super(code);
    this.code = code;
    this.files = files;
  }
}
const fail = (code, files) => { throw new MarkerError(code, files); };

function git(root, args) {
  try {
    return execFileSync("git", args, { cwd: root, encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"], maxBuffer: 16 * 1024 * 1024 });
  } catch { fail("git_source_unavailable"); }
}

export function readSourceManifest(sourceRoot, expectedSha) {
  if (!shaPattern.test(expectedSha)) fail("invalid_source_sha");
  if (git(sourceRoot, ["cat-file", "-t", expectedSha]).trim() !== "commit" ||
      git(sourceRoot, ["rev-parse", "--show-object-format"]).trim() !== "sha1") fail("invalid_source_commit");
  const workflow = git(sourceRoot, ["show", `${expectedSha}:.github/workflows/deploy.yml`]);
  const exclusions = [...workflow.matchAll(/--exclude='([^']+)'/gu)].map((match) => match[1]);
  if (JSON.stringify(exclusions) !== JSON.stringify(DEPLOY_EXCLUSIONS) ||
      !workflow.includes("rsync -a --delete")) fail("deployment_exclusions_differ", [".github/workflows/deploy.yml"]);
  const files = [];
  let excludedBlobs = 0;
  for (const entry of git(sourceRoot, ["ls-tree", "-r", "-z", "--full-tree", expectedSha]).split("\0")) {
    if (!entry) continue;
    const match = /^(\d{6}) (\w+) ([a-f0-9]{40})\t([\s\S]+)$/u.exec(entry);
    if (!match) fail("invalid_source_tree");
    const [, mode, type, oid, filename] = match;
    const parts = filename.split("/");
    if (filename.startsWith("/") || parts.some((part) => !part || part === "." || part === "..")) fail("invalid_source_path", [filename]);
    if (parts.some((part) => DEPLOY_EXCLUSIONS.includes(part))) { excludedBlobs += 1; continue; }
    if (type !== "blob" || !["100644", "100755"].includes(mode)) fail("nonregular_source_entry", [filename]);
    files.push({ filename, oid });
  }
  if (files.length === 0) fail("empty_source_tree");
  return { files, excludedBlobs, treeOid: git(sourceRoot, ["rev-parse", `${expectedSha}^{tree}`]).trim() };
}

// Open each component beneath an already-open directory. O_NOFOLLOW protects
// ancestors as well as leaf files; /proc/self/fd keeps access bound to those
// directory descriptors even if a path is concurrently renamed.
async function openDirectory(absolutePath) {
  if (!path.isAbsolute(absolutePath) || path.resolve(absolutePath) !== absolutePath) fail("noncanonical_release_path");
  let handle = await open("/", constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
  try {
    for (const component of absolutePath.split("/").filter(Boolean)) {
      const next = await open(`/proc/self/fd/${handle.fd}/${component}`,
        constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
      await handle.close();
      handle = next;
    }
    return handle;
  } catch (error) { await handle.close(); throw error; }
}

async function openSourceFile(directory, filename) {
  const components = filename.split("/");
  let parent = directory;
  try {
    for (const component of components.slice(0, -1)) {
      const next = await open(`/proc/self/fd/${parent.fd}/${component}`,
        constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
      if (parent !== directory) await parent.close();
      parent = next;
    }
    return await open(`/proc/self/fd/${parent.fd}/${components.at(-1)}`, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  } finally { if (parent !== directory) await parent.close(); }
}

function statIdentity(stat) {
  return [stat.dev, stat.ino, stat.size, stat.mtimeNs, stat.ctimeNs].map(String).join(":");
}

async function blobHash(handle, filename) {
  const before = await handle.stat({ bigint: true });
  if (!before.isFile()) fail("nonregular_release_file", [filename]);
  const digest = createHash("sha1").update(`blob ${before.size}\0`);
  for await (const chunk of handle.createReadStream({ autoClose: false })) digest.update(chunk);
  const after = await handle.stat({ bigint: true });
  if (statIdentity(before) !== statIdentity(after)) fail("source_changed_during_verification", [filename]);
  return { oid: digest.digest("hex"), identity: statIdentity(after) };
}

async function markerState(directory, expectedSha) {
  let handle;
  try {
    handle = await openSourceFile(directory, markerName);
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size < 40 || stat.size > 41) fail("invalid_existing_marker", [markerName]);
    const value = await handle.readFile("utf8");
    if (value !== expectedSha && value !== `${expectedSha}\n`) fail("existing_marker_mismatch", [markerName]);
    return "matching";
  } catch (error) {
    if (error?.code === "ENOENT") return "missing";
    if (error instanceof MarkerError) throw error;
    fail("invalid_existing_marker", [markerName]);
  } finally { if (handle) await handle.close(); }
}

// Low-level verifier accepts an explicit fixture root for isolated unit tests.
// The CLI below never accepts a target path and supplies the fixed production
// base, legacy commit and protected GitHub context itself.
export async function verifyAndMarkRelease({ sourceRoot, baseDir, expectedSha, apply = false }) {
  const manifest = readSourceManifest(sourceRoot, expectedSha);
  let directory;
  let temporaryPath;
  try {
    const current = path.join(baseDir, "current");
    const currentStat = await lstat(current, { bigint: true });
    if (!currentStat.isSymbolicLink()) fail("current_not_symlink", ["current"]);
    const release = await readlink(current);
    if (path.dirname(release) !== path.join(baseDir, "releases") ||
        !new RegExp(`^\\d{14}-${expectedSha.slice(0, 7)}$`, "u").test(path.basename(release))) fail("unexpected_current_release", ["current"]);
    directory = await openDirectory(release);
    const directoryStat = await directory.stat({ bigint: true });
    const failures = [];
    const identities = new Map();
    for (const entry of manifest.files) {
      let handle;
      try {
        handle = await openSourceFile(directory, entry.filename);
        const actual = await blobHash(handle, entry.filename);
        if (actual.oid !== entry.oid) failures.push(entry.filename);
        identities.set(entry.filename, actual.identity);
      } catch { failures.push(entry.filename); }
      finally { if (handle) await handle.close(); }
    }
    if (failures.length) fail("source_files_differ", failures);
    // Detect an in-place source change after an earlier file was hashed.
    for (const entry of manifest.files) {
      let handle;
      try {
        handle = await openSourceFile(directory, entry.filename);
        if (statIdentity(await handle.stat({ bigint: true })) !== identities.get(entry.filename)) {
          fail("source_changed_during_verification", [entry.filename]);
        }
      } catch (error) {
        if (error instanceof MarkerError) throw error;
        fail("source_changed_during_verification", [entry.filename]);
      } finally { if (handle) await handle.close(); }
    }
    const state = await markerState(directory, expectedSha);
    const currentAfter = await lstat(current, { bigint: true });
    if (!currentAfter.isSymbolicLink() || statIdentity(currentAfter) !== statIdentity(currentStat) ||
        await readlink(current) !== release) fail("current_changed_during_verification", ["current"]);
    const reopened = await openDirectory(release);
    try {
      const reopenedStat = await reopened.stat({ bigint: true });
      if (reopenedStat.dev !== directoryStat.dev || reopenedStat.ino !== directoryStat.ino) fail("release_changed_during_verification", ["current"]);
    } finally { await reopened.close(); }
    if (apply && state === "missing") {
      temporaryPath = `/proc/self/fd/${directory.fd}/.fieldgrid-release-sha-${randomBytes(12).toString("hex")}.tmp`;
      const temporary = await open(temporaryPath, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o640);
      try { await temporary.writeFile(`${expectedSha}\n`); await temporary.sync(); }
      finally { await temporary.close(); }
      try { await link(temporaryPath, `/proc/self/fd/${directory.fd}/${markerName}`); }
      catch (error) {
        if (error?.code !== "EEXIST") throw error;
        if (await markerState(directory, expectedSha) !== "matching") fail("concurrent_marker_change", [markerName]);
      }
      await unlink(temporaryPath);
      temporaryPath = undefined;
      await directory.sync();
      if (await markerState(directory, expectedSha) !== "matching") fail("marker_readback_failed", [markerName]);
    }
    return { schemaVersion: 1, status: apply ? state === "matching" ? "already-matching" : "marked" : "verified",
      operation: apply ? "apply" : "diagnose", sourceSha: expectedSha, sourceTreeOid: manifest.treeOid,
      verifiedBlobs: manifest.files.length, excludedBlobs: manifest.excludedBlobs, markerState: apply ? "matching" : state };
  } catch (error) {
    if (error instanceof MarkerError) throw error;
    fail("release_verification_failed");
  } finally {
    if (temporaryPath) await unlink(temporaryPath).catch(() => {});
    if (directory) await directory.close();
  }
}

export async function verifyOperatorContext({ expectedMainSha, expectedRollbackSha, apply, confirmation,
  env = process.env, sourceRoot = repositoryRoot, request = fetch }) {
  if (!shaPattern.test(expectedMainSha ?? "") || expectedRollbackSha !== LEGACY_PRODUCTION_SHA ||
      env.GITHUB_ACTIONS !== "true" || env.GITHUB_REPOSITORY !== "veele-services/platform" ||
      env.GITHUB_REF !== "refs/heads/main" || env.GITHUB_EVENT_NAME !== "workflow_dispatch" ||
      env.GITHUB_SHA !== expectedMainSha || env.APP_ENV !== "production" || env.TARGET_ENVIRONMENT !== "production" ||
      (apply && confirmation !== CONFIRMATION) || !env.GITHUB_TOKEN) fail("invalid_operator_context");
  const head = git(sourceRoot, ["rev-parse", "HEAD"]).trim();
  if (head !== expectedMainSha) fail("checkout_sha_mismatch");
  try {
    const response = await request("https://api.github.com/repos/veele-services/platform/git/ref/heads/main", {
      headers: { Accept: "application/vnd.github+json", Authorization: `Bearer ${env.GITHUB_TOKEN}`,
        "X-GitHub-Api-Version": "2022-11-28" }, signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok || (await response.json()).object?.sha !== expectedMainSha) fail("protected_main_mismatch");
  } catch (error) {
    if (error instanceof MarkerError) throw error;
    fail("protected_main_unavailable");
  }
}

export async function main(argv = process.argv.slice(2)) {
  const options = {};
  while (argv.length) {
    const argument = argv.shift();
    const key = { "--expected-main-sha": "expectedMainSha", "--expected-rollback-sha": "expectedRollbackSha", "--confirmation": "confirmation" }[argument];
    if (argument === "--diagnose" || argument === "--apply") {
      if (Object.hasOwn(options, "apply")) fail("invalid_arguments");
      options.apply = argument === "--apply";
    } else if (key && !Object.hasOwn(options, key) && argv.length) options[key] = argv.shift();
    else fail("invalid_arguments");
  }
  if (!Object.hasOwn(options, "apply")) fail("invalid_arguments");
  await verifyOperatorContext(options);
  const result = await verifyAndMarkRelease({ sourceRoot: repositoryRoot, baseDir: PRODUCTION_BASE_DIR,
    expectedSha: LEGACY_PRODUCTION_SHA, apply: options.apply });
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${JSON.stringify({ status: "failed", code: error instanceof MarkerError ? error.code : "verification_failed",
      files: error instanceof MarkerError ? error.files : [] })}\n`);
    process.exitCode = 1;
  });
}
