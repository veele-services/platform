import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ context: vi.fn(), rpc: vi.fn(), order: vi.fn(), from: vi.fn(), filter: vi.fn(), projection: vi.fn(), limit: vi.fn(), results: new Map<string, unknown[]>() }));
vi.mock("@/lib/auth/context", () => ({ getAuthContext: mocks.context }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ rpc: mocks.rpc, from: mocks.from }) }));
import { POST } from "./route";
const tenantId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const actor = (roles = ["tenant_admin"], enabledServices = ["planning", "personeel", "finance"]) => ({ user: { id: "user-one" }, tenant: { id: tenantId, roles, enabledServices } });
const request = (query = "Kantine", origin = "http://fixture.local") => new Request("http://fixture.local/api/search", { method: "POST", headers: { origin, host: "fixture.local", "content-type": "application/json" }, body: JSON.stringify({ query }) });
beforeEach(() => {
  vi.resetAllMocks(); mocks.results.clear(); vi.stubEnv("DEPLOY_TARGET", "local");
  mocks.context.mockResolvedValue(actor());
  mocks.order.mockImplementation(async () => ({ data: { rows: mocks.results.get("work_orders") ?? [] }, error: null }));
  mocks.rpc.mockImplementation(name => name === "work_order_list" ? { abortSignal: mocks.order } : Promise.resolve({ data: true, error: null }));
  mocks.from.mockImplementation(table => {
    const chain = { select: (fields: string) => { mocks.projection(table, fields); return chain; }, eq: (field: string, value: string) => { mocks.filter(table, field, value); return chain; }, or: () => chain, order: () => chain, limit: (size: number) => { mocks.limit(size); return chain; }, abortSignal: async () => ({ data: mocks.results.get(table) ?? [], error: null }) };
    return chain;
  });
});
describe("bounded tenant global search", () => {
  it("groups minimal results, forces the host tenant and never accepts a tenant selector", async () => {
    mocks.results.set("customers", [{ id: "customer-one", name: "Kantine", customer_number: "KL-001", private_data: "excluded" }]);
    const incoming = request();
    const response = await POST(incoming);
    expect(mocks.order).toHaveBeenCalledWith(incoming.signal);
    expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.json()).toEqual({ groups: [{ id: "customers", title: "Klanten", results: [{ id: "customer-one", title: "Kantine", detail: "KL-001", href: "/app/klanten?record=customer-one" }] }] });
    for (const call of mocks.filter.mock.calls) expect(call.slice(1)).toEqual(["tenant_id", tenantId]);
    for (const call of mocks.projection.mock.calls) expect(call[1]).not.toContain("*");
    for (const call of mocks.limit.mock.calls) expect(call).toEqual([5]);
    const selector = new Request("http://fixture.local/api/search", { method: "POST", headers: { origin: "http://fixture.local", host: "fixture.local", "content-type": "application/json" }, body: JSON.stringify({ query: "Kantine", tenantId: "other" }) });
    expect((await POST(selector)).status).toBe(400);
  });
  it("never queries personnel or finance categories for a planner", async () => {
    mocks.context.mockResolvedValue(actor(["planner"]));
    expect((await POST(request())).status).toBe(200);
    expect(mocks.from.mock.calls.map(call => call[0])).not.toContain("personnel");
    expect(mocks.from.mock.calls.map(call => call[0])).not.toContain("invoices");
    expect(mocks.from.mock.calls.map(call => call[0])).not.toContain("work_orders");
    expect(mocks.rpc).toHaveBeenCalledWith("work_order_list", { target_tenant: tenantId, filters: { q: "Kantine", page: 1, pageSize: 10, sort: "number" } });
  });
  it("skips categories belonging to disabled modules", async () => {
    mocks.context.mockResolvedValue(actor(["tenant_admin"], ["finance"]));
    expect((await POST(request())).status).toBe(200); expect(mocks.from.mock.calls).toEqual([["invoices"]]);
  });
  it.each([null, { user: { id: "x" }, tenant: null }, actor(["staff"])])("rejects missing tenant membership and staff-only access", async context => {
    mocks.context.mockResolvedValue(context); expect((await POST(request())).status).toBe(403); expect(mocks.from).not.toHaveBeenCalled();
  });
  it("rejects cross-origin requests and a query below three characters before any data read", async () => {
    expect((await POST(request("abc", "http://other.local"))).status).toBe(403);
    expect((await POST(request("ab"))).status).toBe(400); expect(mocks.from).not.toHaveBeenCalled();
  });
  it("drops results when the session or host membership changes during lookup", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: true }).mockReturnValueOnce({ abortSignal: mocks.order }).mockResolvedValueOnce({ data: false });
    expect((await POST(request())).status).toBe(403);
    mocks.rpc.mockImplementation(name => name === "work_order_list" ? { abortSignal: mocks.order } : Promise.resolve({ data: true }));
    mocks.context.mockResolvedValueOnce(actor()).mockResolvedValueOnce({ ...actor(), tenant: { ...actor().tenant, id: "different" } });
    expect((await POST(request())).status).toBe(403);
  });
  it("removes categories revoked during the lookup", async () => {
    mocks.results.set("invoices", [{ id: "invoice-one", invoice_number: "FACT-001" }]);
    mocks.context.mockResolvedValueOnce(actor()).mockResolvedValueOnce(actor(["planner"]));
    expect(await (await POST(request())).json()).toEqual({ groups: [] });
  });
});
