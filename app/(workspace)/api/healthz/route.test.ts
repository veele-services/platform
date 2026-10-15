import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ readiness: vi.fn(), marker: { uid: 0, mode: 0o100640 }, env: { DEPLOY_TARGET: "staging", CLAMAV_ENABLED: "true", CLAMAV_SOCKET: "/run/clamav/clamd.ctl", CLAMAV_TIMEOUT_MS: 30000, CLAMAV_MAX_DATABASE_AGE_HOURS: 72 } }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/env/server", () => ({ getServerEnv: () => mocks.env }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ from: () => ({ select: () => ({ limit: async () => ({ error: null }) }) }) }) }));
vi.mock("node:fs/promises", () => ({ readFile: async () => "a".repeat(40), stat: async () => mocks.marker }));
vi.mock("@/lib/tickets/scanner-readiness", () => ({ scannerReadiness: mocks.readiness }));
import { GET } from "./route";
beforeEach(() => { vi.clearAllMocks(); mocks.env.DEPLOY_TARGET = "staging"; mocks.marker.uid = 0; mocks.marker.mode = 0o100640; mocks.readiness.mockResolvedValue("ready"); });
it("requires runtime scanner readiness while preserving verified DB and release identity", async () => {
  mocks.readiness.mockResolvedValue("unavailable"); const response = await GET(new Request("https://staging.fieldgrid.nl/api/healthz"));
  expect(response.status).toBe(503); expect(await response.json()).toMatchObject({ database: "ready", scanner: "unavailable", status: "unavailable", release: "a".repeat(40) });
});
it("requires a root-owned immutable marker for production too", async () => {
  mocks.env.DEPLOY_TARGET = "production";
  let response = await GET(new Request("https://fieldgrid.nl/api/healthz"));
  expect(response.status).toBe(200); expect(await response.json()).toMatchObject({ environment: "production", release: "a".repeat(40) });
  mocks.marker.uid = 994;
  response = await GET(new Request("https://fieldgrid.nl/api/healthz"));
  expect(response.status).toBe(503); expect(await response.json()).toMatchObject({ release: "unavailable" });
});
it("reports ready without disclosing engine, paths, UID or credentials", async () => {
  const response = await GET(new Request("https://staging.fieldgrid.nl/api/healthz")), body = await response.text();
  expect(response.status).toBe(200); expect(JSON.parse(body).scanner).toBe("ready"); expect(body).not.toContain("/run"); expect(body).not.toContain("CLAMAV");
});
it("an incorrect SHA cannot trigger or pass a new scanner check", async () => {
  const response = await GET(new Request("https://staging.fieldgrid.nl/api/healthz?release=wrong")); expect(response.status).toBe(409); expect(mocks.readiness).not.toHaveBeenCalled();
});
it("fails closed when the staging release marker is runner-writable", async () => {
  mocks.marker.uid = 994; mocks.marker.mode = 0o100660;
  const response = await GET(new Request("https://staging.fieldgrid.nl/api/healthz"));
  expect(response.status).toBe(503); expect(await response.json()).toMatchObject({ status: "unavailable", release: "unavailable" });
  expect(mocks.readiness).not.toHaveBeenCalled();
});
