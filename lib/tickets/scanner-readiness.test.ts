import { expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { createScannerReadiness } from "./scanner-readiness";
const env = { DEPLOY_TARGET: "staging", CLAMAV_ENABLED: "true", CLAMAV_SOCKET: "/run/clamav/clamd.ctl", CLAMAV_TIMEOUT_MS: 30000, CLAMAV_MAX_DATABASE_AGE_HOURS: 72 };
it("shares concurrent health probes and refreshes evidence within one minute", async () => {
  let time = 0; const probe = vi.fn(async () => {}), ready = createScannerReadiness(probe, () => time);
  expect(await Promise.all([ready(env), ready(env)])).toEqual(["ready", "ready"]); expect(probe).toHaveBeenCalledOnce();
  time = 60001; await ready(env); expect(probe).toHaveBeenCalledTimes(2);
});
it("does not hide failures or reuse evidence for changed configuration", async () => {
  let time = 0; const probe = vi.fn().mockRejectedValueOnce(new Error("unavailable")).mockResolvedValue(undefined), ready = createScannerReadiness(probe, () => time);
  expect(await ready(env)).toBe("unavailable"); expect(await ready(env)).toBe("unavailable"); expect(probe).toHaveBeenCalledOnce();
  time = 5001; expect(await ready(env)).toBe("ready");
  expect(await ready({ ...env, CLAMAV_MAX_DATABASE_AGE_HOURS: 24 })).toBe("ready"); expect(probe).toHaveBeenCalledTimes(3);
});
it("never reports disabled staging as ready", async () => {
  const probe = vi.fn(), ready = createScannerReadiness(probe);
  expect(await ready({ ...env, CLAMAV_ENABLED: "false" })).toBe("unavailable");
  expect(await ready({ ...env, DEPLOY_TARGET: "local", CLAMAV_ENABLED: "false" })).toBe("disabled"); expect(probe).not.toHaveBeenCalled();
});
