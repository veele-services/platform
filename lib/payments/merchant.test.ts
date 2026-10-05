import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ env: vi.fn(), row: vi.fn(), profile: vi.fn(), filters: [] as unknown[][] }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/env/server", () => ({ getServerEnv: m.env }));
vi.mock("@/lib/providers/mollie", () => ({ getMollieProfile: m.profile }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => {
  const query = { select: () => query, eq: (...values: unknown[]) => { m.filters.push(values); return query; }, maybeSingle: m.row };
  return { from: () => query };
} }));
import { requireTenantMerchant } from "./merchant";

const tenant = "10000000-0000-4000-8000-000000000001";
const connection = { mode: "test", secret_reference: "MOLLIE_API_KEY", public_config: { profile_id: "pfl_Fictional" }, verified_at: "2026-10-05T09:00:00Z" };
beforeEach(() => {
  vi.resetAllMocks(); m.filters = [];
  m.env.mockReturnValue({ MOLLIE_API_KEY: "test_FICTITIOUS_FIXTURE", MOLLIE_WEBHOOK_URL: "https://staging.fieldgrid.nl/api/mollie/webhook" });
  m.row.mockResolvedValue({ error: null, data: { ...connection } });
  m.profile.mockResolvedValue({ id: "pfl_Fictional" });
});

describe("explicit tenant payment merchant", () => {
  it("requires active tenant-specific configuration and an authenticated matching provider profile", async () => {
    expect(await requireTenantMerchant(tenant)).toEqual({ mode: "test", profileId: "pfl_Fictional" });
    expect(m.filters).toEqual([["tenant_id", tenant], ["provider", "mollie"], ["active", true]]);
    expect(m.profile).toHaveBeenCalledOnce();
  });
  it.each([{}, { MOLLIE_API_KEY: "invalid_FICTITIOUS" }, { MOLLIE_API_KEY: "test_FICTITIOUS" }])("fails before database/provider access without a usable runtime binding %j", async value => {
    m.env.mockReturnValue(value);
    await expect(requireTenantMerchant(tenant)).rejects.toThrow();
    expect(m.row).not.toHaveBeenCalled(); expect(m.profile).not.toHaveBeenCalled();
  });
  it.each([
    null, { ...connection, verified_at: null }, { ...connection, mode: "live" },
    { ...connection, secret_reference: "OTHER_TENANT_KEY" }, { ...connection, public_config: null },
    { ...connection, public_config: { profile_id: "http://outside.invalid" } },
  ])("fails closed for missing or unverified tenant configuration %j", async value => {
    m.row.mockResolvedValueOnce({ error: null, data: value });
    await expect(requireTenantMerchant(tenant)).rejects.toThrow();
    expect(m.profile).not.toHaveBeenCalled();
  });
  it("fails closed when a duplicate or unavailable connection cannot be resolved", async () => {
    m.row.mockResolvedValueOnce({ error: { code: "PGRST116" }, data: null });
    await expect(requireTenantMerchant(tenant)).rejects.toThrow();
    expect(m.profile).not.toHaveBeenCalled();
  });
  it("refuses a different profile returned by the authenticated provider", async () => {
    m.profile.mockResolvedValueOnce({ id: "pfl_Other" });
    await expect(requireTenantMerchant(tenant)).rejects.toThrow("Betaalontvanger komt niet overeen");
  });
  it("requires a successful profile request, including after a prior successful lookup", async () => {
    await requireTenantMerchant(tenant);
    m.profile.mockRejectedValueOnce(new Error("provider unavailable"));
    await expect(requireTenantMerchant(tenant)).rejects.toThrow();
    expect(m.profile).toHaveBeenCalledTimes(2);
  });
  it("binds a live key only to a verified live connection", async () => {
    m.env.mockReturnValue({ MOLLIE_API_KEY: "live_FICTITIOUS_FIXTURE", MOLLIE_WEBHOOK_URL: "https://staging.fieldgrid.nl/api/mollie/webhook" });
    m.row.mockResolvedValueOnce({ error: null, data: { ...connection, mode: "live" } });
    expect(await requireTenantMerchant(tenant)).toEqual({ mode: "live", profileId: "pfl_Fictional" });
  });
});
