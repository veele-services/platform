import { afterEach, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { createServer, type Server } from "node:net";
import { mkdtemp, readFile, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

type Preflight = {
  pingClamd: (socketPath: string, timeoutMs: number) => Promise<void>;
  stagingClamavPreflightOptions: (env: Record<string, string | undefined>) => {
    socketPath: string;
    timeoutMs: number;
  };
  productionClamavPreflightOptions: (env: Record<string, string | undefined>) => { socketPath: string; timeoutMs: number };
};

const moduleUrl = pathToFileURL(join(process.cwd(), "scripts/check-clamav-socket.mjs")).href;
const preflight = await import(moduleUrl) as Preflight;
const fixtures: Array<{ directory: string; server: Server }> = [];

afterEach(async () => {
  for (const fixture of fixtures.splice(0)) {
    await new Promise<void>((resolve) => fixture.server.close(() => resolve()));
    await rm(fixture.directory, { recursive: true, force: true });
  }
});

async function scanner(
  respond: (socket: import("node:net").Socket) => void,
) {
  const directory = await mkdtemp(join(tmpdir(), "fieldgrid-clamd-preflight-"));
  const socketPath = join(directory, "clamd.sock");
  let request = Buffer.alloc(0);
  const server = createServer((socket) => {
    socket.on("data", (chunk) => {
      request = Buffer.concat([request, chunk]);
      if (request.length >= 6) respond(socket);
    });
  });
  fixtures.push({ directory, server });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(socketPath, resolve);
  });
  return { request: () => request, socketPath };
}

describe("standalone ClamAV startup preflight", () => {
  it("permits production only with its own loopback port and the canonical scanner", () => {
    const env = { DEPLOY_TARGET: "production", HOSTNAME: "127.0.0.1", PORT: "3302", CLAMAV_ENABLED: "true", CLAMAV_SOCKET: "/run/clamav/clamd.ctl" };
    expect(preflight.productionClamavPreflightOptions(env)).toEqual({ socketPath: "/run/clamav/clamd.ctl", timeoutMs: 3000 });
    for (const patch of [{ PORT: "3301" }, { HOSTNAME: "0.0.0.0" }, { DEPLOY_TARGET: "staging" }, { CLAMAV_ENABLED: "false" }, { CLAMAV_SOCKET: "/tmp/clamd.sock" }]) expect(() => preflight.productionClamavPreflightOptions({ ...env, ...patch })).toThrow("preflight failed");
  });
  it("uses clamd zPING framing and accepts only a complete PONG", async () => {
    const fixture = await scanner((socket) => {
      socket.write("PO");
      socket.end("NG\0");
    });

    await expect(preflight.pingClamd(fixture.socketPath, 1_000)).resolves.toBeUndefined();
    expect(fixture.request()).toEqual(Buffer.from("zPING\0", "ascii"));
  });

  it("fails closed with a generic diagnostic for malformed and unavailable scanners", async () => {
    const fixture = await scanner((socket) => socket.end("PONG\0unexpected"));
    await expect(preflight.pingClamd(fixture.socketPath, 1_000)).rejects.toThrow(
      "Fieldgrid scanner preflight failed",
    );
    await expect(preflight.pingClamd(`${fixture.socketPath}.missing`, 1_000)).rejects.toThrow(
      "Fieldgrid scanner preflight failed",
    );
  });

  it("bounds an unresponsive Unix socket", async () => {
    const fixture = await scanner(() => undefined);
    const startedAt = Date.now();
    await expect(preflight.pingClamd(fixture.socketPath, 40)).rejects.toThrow(
      "Fieldgrid scanner preflight failed",
    );
    expect(Date.now() - startedAt).toBeLessThan(1_000);
  });

  it("requires the exact staging configuration and caps the runtime timeout", () => {
    const valid = {
      DEPLOY_TARGET: "staging",
      CLAMAV_ENABLED: "true",
      CLAMAV_SOCKET: "/run/clamav/clamd.ctl",
      CLAMAV_TIMEOUT_MS: "30000",
    };
    expect(preflight.stagingClamavPreflightOptions(valid)).toEqual({
      socketPath: "/run/clamav/clamd.ctl",
      timeoutMs: 5_000,
    });
    for (const env of [
      { ...valid, DEPLOY_TARGET: "production" },
      { ...valid, CLAMAV_ENABLED: "false" },
      { ...valid, CLAMAV_SOCKET: "/tmp/clamd.sock" },
      { ...valid, CLAMAV_TIMEOUT_MS: "unbounded" },
    ]) {
      expect(() => preflight.stagingClamavPreflightOptions(env)).toThrow(
        "Fieldgrid scanner preflight failed",
      );
    }
  });

  it("does not expose configuration or operating-system diagnostics", () => {
    const sensitivePath = "/tmp/FICTITIOUS-sensitive-scanner-path.sock";
    const result = spawnSync(process.execPath, [join(process.cwd(), "scripts/check-clamav-socket.mjs")], {
      encoding: "utf8",
      env: {
        NODE_ENV: "test",
        DEPLOY_TARGET: "staging",
        CLAMAV_ENABLED: "true",
        CLAMAV_SOCKET: sensitivePath,
        CLAMAV_TIMEOUT_MS: "30000",
      },
    });
    expect(result.status).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe("Fieldgrid scanner preflight failed.\n");
    expect(result.stderr).not.toContain(sensitivePath);
  });

  it("still executes fail-closed when the release is reached through the current symlink", async () => {
    const directory = await mkdtemp(join(tmpdir(), "fieldgrid-clamd-main-link-"));
    const linkedPath = join(directory, "clamav-preflight.mjs");
    try {
      await symlink(join(process.cwd(), "scripts/check-clamav-socket.mjs"), linkedPath);
      const result = spawnSync(process.execPath, [linkedPath], {
        encoding: "utf8",
        env: {
          NODE_ENV: "test",
          DEPLOY_TARGET: "wrong-target",
          CLAMAV_ENABLED: "true",
          CLAMAV_SOCKET: "/run/clamav/clamd.ctl",
        },
      });
      expect(result.status).toBe(1);
      expect(result.stdout).toBe("");
      expect(result.stderr).toBe("Fieldgrid scanner preflight failed.\n");
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("ships the exact dependency-free preflight in the standalone release", async () => {
    const packaging = await readFile(join(process.cwd(), "scripts/package-release.sh"), "utf8");
    expect(packaging).toContain(
      'install -m 0440 scripts/check-clamav-socket.mjs "$work/release/clamav-preflight.mjs"',
    );
  });
});
