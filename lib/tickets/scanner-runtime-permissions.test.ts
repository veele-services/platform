import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ lstat: vi.fn(), read: vi.fn(), scan: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("node:fs/promises", () => ({ lstat: mocks.lstat, readFile: mocks.read }));
vi.mock("./scan-preflight", () => ({ verifyTicketScanner: mocks.scan }));
const env = { DEPLOY_TARGET: "staging", CLAMAV_ENABLED: "true", CLAMAV_SOCKET: "/run/clamav/clamd.ctl", CLAMAV_TIMEOUT_MS: 30000, CLAMAV_MAX_DATABASE_AGE_HOURS: 72 };
const gid = process.getgroups!()[0], uid = process.getuid!();
beforeEach(() => {
  vi.resetModules(); vi.resetAllMocks();
  mocks.read.mockImplementation(async (path: string) => path === "/etc/passwd" ? `clamav:x:12345:12345:fixture\nfieldgrid:x:${uid}:12345:fixture` : `clamav:x:${gid}:fieldgrid`);
  mocks.lstat.mockResolvedValue({ isSocket: () => true, mode: 0o140660, uid: 12345, gid });
  mocks.scan.mockResolvedValue({ eicarRejected: true, pngAccepted: true, pdfAccepted: true });
});
it("checks ownership, mode and the actual process identity before a real probe", async () => {
  const { scannerReadiness } = await import("./scanner-readiness");
  expect(await scannerReadiness(env)).toBe("ready"); expect(mocks.scan).toHaveBeenCalledOnce();
  expect(mocks.scan).toHaveBeenCalledWith({ socketPath: env.CLAMAV_SOCKET, timeoutMs: 5000, maxDatabaseAgeHours: 72 });
});
it("production scans require the separate production UID and canonical socket permissions", async () => {
  const { scannerReadiness } = await import("./scanner-readiness");
  const production = { ...env, DEPLOY_TARGET: "production" };
  expect(await scannerReadiness(production)).toBe("unavailable"); expect(mocks.scan).not.toHaveBeenCalled();
  mocks.read.mockImplementation(async (path: string) => path === "/etc/passwd" ? `clamav:x:12345:12345:fixture\nfieldgrid:x:${uid + 100000}:12345:fixture\nfieldgrid-production:x:${uid}:12345:fixture` : `clamav:x:${gid}:fieldgrid-production`);
  vi.resetModules();
  const fresh = await import("./scanner-readiness");
  expect(await fresh.scannerReadiness(production)).toBe("ready"); expect(mocks.scan).toHaveBeenCalledOnce();
});
it.each([
  { isSocket: () => false, mode: 0o140660, uid: 12345, gid },
  { isSocket: () => true, mode: 0o140666, uid: 12345, gid },
  { isSocket: () => true, mode: 0o140660, uid: 54321, gid },
  { isSocket: () => true, mode: 0o140660, uid: 12345, gid: gid + 100000 },
])("rejects non-socket/world-accessible/wrong-owner/group before scanning", async metadata => {
  mocks.lstat.mockResolvedValue(metadata); const { scannerReadiness } = await import("./scanner-readiness");
  expect(await scannerReadiness(env)).toBe("unavailable"); expect(mocks.scan).not.toHaveBeenCalled();
});
it("cannot run a staging readiness scan as the runner or another UID", async () => {
  mocks.read.mockImplementation(async (path: string) => path === "/etc/passwd" ? `clamav:x:12345:12345:fixture\nfieldgrid:x:${uid + 100000}:12345:fixture` : `clamav:x:${gid}:fieldgrid`);
  const { scannerReadiness } = await import("./scanner-readiness"); expect(await scannerReadiness(env)).toBe("unavailable"); expect(mocks.scan).not.toHaveBeenCalled();
});
