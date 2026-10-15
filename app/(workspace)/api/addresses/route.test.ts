import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ context: vi.fn(), actor: vi.fn(), rpc: vi.fn(), accounts: vi.fn(), search: vi.fn(), lookup: vi.fn() }));
vi.mock("@/lib/auth/context", () => ({ getAuthContext: mocks.context }));
vi.mock("@/lib/objects/auth", () => ({ getObjectActor: mocks.actor }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ rpc: mocks.rpc }) }));
vi.mock("@/lib/addresses/pdok", () => ({ searchAddresses: mocks.search, lookupAddress: mocks.lookup }));
import { POST } from "./route";
const tenant = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
function request(origin = "http://fixture.local", body = { query: "Teststraat" }) {
  return new Request("http://fixture.local/api/addresses", { method: "POST", headers: { host: "fixture.local", origin, "content-type": "application/json" }, body: JSON.stringify(body) });
}
beforeEach(() => {
  vi.resetAllMocks(); vi.stubEnv("DEPLOY_TARGET", "local");
  mocks.context.mockResolvedValue({ tenant: null });
  mocks.actor.mockResolvedValue({ tenant: { id: tenant }, db: { rpc: mocks.accounts } });
  mocks.accounts.mockResolvedValue({ data: [{ id: "active-account" }], error: null });
  mocks.rpc.mockResolvedValue({ data: true, error: null });
  mocks.search.mockResolvedValue([{ id: "fictitious-result", label: "Teststraat 1" }]);
});
describe("address lookup workspace access", () => {
  it("allows an active customer without a staff membership, within the host tenant", async () => {
    const response = await POST(request()); expect(response.status).toBe(200);
    expect(mocks.accounts).toHaveBeenCalledWith("customer_portal_accounts", { target_tenant: tenant });
    expect(await response.json()).toEqual({ suggestions: [{ id: "fictitious-result", label: "Teststraat 1" }] });
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });
  it("rejects a customer with no current account in the host tenant before provider access", async () => {
    mocks.accounts.mockResolvedValue({ data: [], error: null });
    expect((await POST(request())).status).toBe(403); expect(mocks.search).not.toHaveBeenCalled();
  });
  it("drops results when customer access is revoked while searching", async () => {
    mocks.accounts.mockResolvedValueOnce({ data: [{}], error: null }).mockResolvedValueOnce({ data: [], error: null });
    expect((await POST(request())).status).toBe(403); expect(mocks.search).toHaveBeenCalledOnce();
  });
  it("drops results when the authenticated session is revoked during provider I/O", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: true }).mockResolvedValueOnce({ data: false });
    expect((await POST(request())).status).toBe(403);
  });
  it("preserves personnel autocomplete without requiring a customer account", async () => {
    mocks.context.mockResolvedValue({ tenant: { roles: ["staff"] } });
    expect((await POST(request())).status).toBe(200); expect(mocks.actor).not.toHaveBeenCalled();
  });
  it("rejects unauthenticated and cross-origin requests", async () => {
    mocks.actor.mockRejectedValue(new Error("Geen toegang"));
    expect((await POST(request())).status).toBe(403);
    expect((await POST(request("http://other.local"))).status).toBe(403);
    expect(mocks.search).not.toHaveBeenCalled();
  });
});
