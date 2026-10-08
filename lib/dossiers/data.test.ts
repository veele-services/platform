import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ client: vi.fn(), rpc: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.client }));
import { loadDossierChain } from "./data";

const tenant = "10000000-0000-4000-8000-000000000001";
const object = "20000000-0000-4000-8000-000000000001";
const empty = { actions: [], documents: [], requests: [], agreements: [], invoices: [], timeline: [] };
beforeEach(() => {
  vi.clearAllMocks();
  mocks.client.mockResolvedValue({ rpc: mocks.rpc });
  mocks.rpc.mockResolvedValue({ data: empty, error: null });
});

describe("server-loaded dossier projection", () => {
  it("loads an empty workspace through one authorised projection without separate collection queries", async () => {
    expect(await loadDossierChain(tenant, {})).toEqual(empty);
    expect(mocks.client).toHaveBeenCalledTimes(1);
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("dossier_chain", {
      target_tenant: tenant,
      target_customer: undefined, target_object: undefined,
      target_personnel: undefined, target_order: undefined,
    });
  });

  it("retains the requested scope and never shares protected results between calls or tenants", async () => {
    await loadDossierChain(tenant, { objectId: object });
    await loadDossierChain("30000000-0000-4000-8000-000000000001", {});
    expect(mocks.client).toHaveBeenCalledTimes(2);
    expect(mocks.rpc.mock.calls[0][1]).toMatchObject({ target_tenant: tenant, target_object: object });
    expect(mocks.rpc.mock.calls[1][1]).toMatchObject({ target_tenant: "30000000-0000-4000-8000-000000000001", target_object: undefined });
  });

  it("rejects malformed scope before data access and propagates access failures without a fallback collection", async () => {
    await expect(loadDossierChain(tenant, { objectId: "invalid" })).rejects.toThrow();
    expect(mocks.client).not.toHaveBeenCalled();
    mocks.rpc.mockResolvedValue({ data: null, error: { code: "42501" } });
    await expect(loadDossierChain(tenant, {})).rejects.toThrow("niet beschikbaar");
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
  });
});
