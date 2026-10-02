#!/usr/bin/env node

import { mkdtemp, lstat, readdir, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";

const artifactPath = process.env.RELEASE_ARTIFACT_PATH;
const releaseSha = process.env.RELEASE_SHA;
if (!artifactPath) throw new Error("RELEASE_ARTIFACT_PATH ontbreekt");
if (!releaseSha || !/^[0-9a-f]{40}$/.test(releaseSha)) throw new Error("RELEASE_SHA is ongeldig");

const resolvedArtifact = resolve(artifactPath);
const artifactMetadata = await lstat(resolvedArtifact);
if (!artifactMetadata.isFile()) throw new Error("Release-artifact is geen regulier bestand");

const work = await mkdtemp(join(tmpdir(), "fieldgrid-release-smoke-"));
let serverProcess;
let serverExit;
let serverOutput = "";

function appendServerOutput(chunk) {
  if (serverOutput.length >= 32_768) return;
  serverOutput += chunk.toString("utf8").slice(0, 32_768 - serverOutput.length);
}

async function run(command, args, options = {}) {
  const child = spawn(command, args, { ...options, shell: false, stdio: ["ignore", "pipe", "pipe"] });
  let output = "";
  const appendOutput = chunk => {
    if (output.length >= 16_384) return;
    output += chunk.toString("utf8").slice(0, 16_384 - output.length);
  };
  child.stdout.on("data", appendOutput);
  child.stderr.on("data", appendOutput);
  const status = await new Promise((accept, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => accept({ code, signal }));
  });
  if (status.code !== 0) {
    throw new Error(`Releasecontrole faalde (${status.code ?? status.signal ?? "onbekend"}): ${output.trim()}`);
  }
}

async function assertRegularTree(root) {
  const pending = [root];
  while (pending.length > 0) {
    const directory = pending.pop();
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      const metadata = await lstat(path);
      if (metadata.isSymbolicLink()) throw new Error("Uitgepakt release-artifact bevat een link");
      if (metadata.isDirectory()) pending.push(path);
      else if (!metadata.isFile()) throw new Error("Uitgepakt release-artifact bevat een niet-ondersteund bestandstype");
    }
  }
}

async function availablePort() {
  const listener = createServer();
  await new Promise((accept, reject) => {
    listener.once("error", reject);
    listener.listen(0, "127.0.0.1", accept);
  });
  const address = listener.address();
  if (!address || typeof address === "string") throw new Error("Geen lokale testpoort beschikbaar");
  await new Promise((accept, reject) => listener.close(error => error ? reject(error) : accept()));
  return address.port;
}

async function stopServer() {
  if (!serverProcess || serverProcess.exitCode !== null || serverProcess.signalCode !== null) return;
  serverProcess.kill("SIGTERM");
  await Promise.race([serverExit, delay(3_000)]);
  if (serverProcess.exitCode === null && serverProcess.signalCode === null) {
    serverProcess.kill("SIGKILL");
    await serverExit;
  }
}

try {
  await run("tar", ["-xzf", resolvedArtifact, "--no-same-owner", "--no-same-permissions", "-C", work]);
  await assertRegularTree(work);

  const baseEnv = {
    PATH: process.env.PATH ?? "/usr/local/bin:/usr/bin:/bin",
    LANG: "C.UTF-8",
    HOME: work,
    NODE_ENV: "production",
    NEXT_TELEMETRY_DISABLED: "1",
  };
  await run(process.execPath, ["-e", "require('@swc/helpers/_/_interop_require_default')"], { cwd: work, env: baseEnv });

  const port = await availablePort();
  const appUrl = `http://127.0.0.1:${port}`;
  const runtimeEnv = {
    ...baseEnv,
    APP_ENV: "development",
    DEPLOY_TARGET: "local",
    APP_URL: appUrl,
    HOSTNAME: "127.0.0.1",
    PORT: String(port),
    RELEASE_SHA: releaseSha,
    DEPLOYMENT_VERSION: releaseSha,
    SUPABASE_URL: "http://127.0.0.1:9",
    NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:9",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "release-smoke-anon-key-not-a-secret",
    SUPABASE_SERVICE_ROLE_KEY: "release-smoke-service-key-not-a-secret",
    GOOGLE_ROUTES_ENABLED: "false",
    ROUTING_PROVIDER: "disabled",
    MAIL_MARKETING_ENABLED: "false",
    CLAMAV_ENABLED: "false",
  };

  serverProcess = spawn(process.execPath, ["server.js"], {
    cwd: work,
    env: runtimeEnv,
    shell: false,
    stdio: ["ignore", "pipe", "pipe"],
  });
  serverProcess.stdout.on("data", appendServerOutput);
  serverProcess.stderr.on("data", appendServerOutput);
  serverExit = new Promise((accept, reject) => {
    serverProcess.once("error", reject);
    serverProcess.once("exit", (code, signal) => accept({ code, signal }));
  });

  const deadline = Date.now() + 15_000;
  let response;
  while (Date.now() < deadline) {
    if (serverProcess.exitCode !== null || serverProcess.signalCode !== null) {
      const status = await serverExit;
      throw new Error(`Verpakte server stopte voortijdig (${status.code ?? status.signal ?? "onbekend"}): ${serverOutput.trim()}`);
    }
    try {
      response = await fetch(`${appUrl}/favicon.svg`, { signal: AbortSignal.timeout(1_000) });
      if (response.status === 200 && (await response.arrayBuffer()).byteLength > 0) break;
    } catch {
      // The bounded loop also covers the short interval before the listener is ready.
    }
    response = undefined;
    await delay(200);
  }
  if (!response) throw new Error(`Verpakte server werd niet bereikbaar: ${serverOutput.trim()}`);
  console.log("Verpakte standalone-release start en serveert statische inhoud.");
} finally {
  await stopServer();
  await rm(work, { recursive: true, force: true });
}
