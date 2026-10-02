import { createConnection } from "node:net";
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

const STAGING_SOCKET = "/run/clamav/clamd.ctl";
const DEFAULT_TIMEOUT_MS = 3_000;
const MAX_TIMEOUT_MS = 5_000;
const PING = Buffer.from("zPING\0", "ascii");
const PONG = Buffer.from("PONG\0", "ascii");
const FAILURE = "Fieldgrid scanner preflight failed";

function unavailable() {
  return new Error(FAILURE);
}

export function stagingClamavPreflightOptions(env = process.env) {
  if (
    env.DEPLOY_TARGET !== "staging" ||
    env.CLAMAV_ENABLED !== "true" ||
    env.CLAMAV_SOCKET !== STAGING_SOCKET
  ) {
    throw unavailable();
  }

  const configuredTimeout = Number(env.CLAMAV_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS);
  if (!Number.isInteger(configuredTimeout) || configuredTimeout < 1_000 || configuredTimeout > 60_000) {
    throw unavailable();
  }

  return {
    socketPath: STAGING_SOCKET,
    timeoutMs: Math.min(configuredTimeout, MAX_TIMEOUT_MS),
  };
}

export function pingClamd(socketPath, timeoutMs) {
  if (
    typeof socketPath !== "string" ||
    !socketPath.startsWith("/") ||
    socketPath.includes("\0") ||
    !Number.isInteger(timeoutMs) ||
    timeoutMs < 1 ||
    timeoutMs > MAX_TIMEOUT_MS
  ) {
    return Promise.reject(unavailable());
  }

  return new Promise((resolve, reject) => {
    let settled = false;
    let reply = Buffer.alloc(0);
    let socket;

    const finish = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket?.destroy();
      if (error) reject(unavailable());
      else resolve();
    };

    const timer = setTimeout(() => finish(true), timeoutMs);

    try {
      socket = createConnection({ path: socketPath });
    } catch {
      finish(true);
      return;
    }

    socket.on("error", () => finish(true));
    socket.on("end", () => finish(true));
    socket.on("data", (chunk) => {
      reply = Buffer.concat([reply, chunk]);
      if (reply.length > PONG.length) {
        finish(true);
        return;
      }
      if (reply.length === PONG.length) finish(!reply.equals(PONG));
    });
    socket.once("connect", () => {
      socket.write(PING, (error) => {
        if (error) finish(true);
      });
    });
  });
}

export async function runStagingClamavPreflight(env = process.env) {
  const options = stagingClamavPreflightOptions(env);
  await pingClamd(options.socketPath, options.timeoutMs);
}

let invokedAsMain = false;
try {
  invokedAsMain = Boolean(process.argv[1]) &&
    realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
} catch {
  invokedAsMain = false;
}
if (invokedAsMain) {
  try {
    await runStagingClamavPreflight();
    process.stdout.write("Fieldgrid scanner preflight succeeded.\n");
  } catch {
    process.stderr.write(`${FAILURE}.\n`);
    process.exitCode = 1;
  }
}
