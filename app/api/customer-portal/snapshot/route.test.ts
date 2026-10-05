import { beforeEach,describe,expect,it,vi } from "vitest";
const mocks=vi.hoisted(()=>({snapshot:vi.fn()}));
vi.mock("@/lib/customer-portal/data",()=>({getCustomerPortalBaseSnapshot:mocks.snapshot}));
import { GET } from "./route";
const account="10000000-0000-4000-8000-000000000001",base="https://fixture.staging.fieldgrid.nl/api/customer-portal/snapshot";
beforeEach(()=>vi.clearAllMocks());
describe("private customer wizard refresh endpoint",()=>{
 it("loads only an explicit account through the hostname-authorized data layer",async()=>{
  mocks.snapshot.mockResolvedValueOnce({fixture:"validated by the data layer"});const response=await GET(new Request(`${base}?account=${account}`));expect(response.status).toBe(200);expect(mocks.snapshot).toHaveBeenCalledExactlyOnceWith(account);expect(response.headers.get("cache-control")).toContain("no-store");expect(response.headers.get("vary")).toBe("Cookie");
 });
 it.each(["",`?account=${account}&tenantId=${account}`,`?account=${account}&account=${account}`,"?account=invalid"])("rejects an ambiguous/forged query %s before data access",async query=>{
  const response=await GET(new Request(base+query));expect(response.status).toBe(400);expect(mocks.snapshot).not.toHaveBeenCalled();expect(response.headers.get("cache-control")).toContain("no-store");
 });
 it("does not disclose an internal error or stale snapshot after revoked access",async()=>{
  mocks.snapshot.mockRejectedValueOnce(new Error("PRIVATE CONTACT CANARY"));const response=await GET(new Request(`${base}?account=${account}`));expect(response.status).toBe(403);expect(JSON.stringify(await response.json())).not.toContain("PRIVATE");expect(response.headers.get("cache-control")).toContain("no-store");
 });
});
