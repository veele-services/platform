import { beforeEach,describe,expect,it,vi } from "vitest";
const mocks=vi.hoisted(()=>({snapshot:vi.fn()}));
vi.mock("@/lib/customer-portal/data",()=>({getCustomerPortalCoreSnapshot:mocks.snapshot}));
import { CustomerSnapshotError } from "@/lib/customer-portal/snapshot-model";
import { GET } from "./route";
const account="10000000-0000-4000-8000-000000000001",base="https://fixture.staging.fieldgrid.nl/api/customer-portal/state";
beforeEach(()=>vi.clearAllMocks());
describe("private current customer domain endpoint",()=>{
 it("delegates one explicit account, returning private no-store responses",async()=>{
  mocks.snapshot.mockResolvedValueOnce({fixture:"validated by data layer"});const response=await GET(new Request(`${base}?account=${account}`));expect(response.status).toBe(200);expect(mocks.snapshot).toHaveBeenCalledExactlyOnceWith(account);expect(response.headers.get("cache-control")).toContain("no-store");expect(response.headers.get("vary")).toBe("Cookie");expect(response.headers.get("x-content-type-options")).toBe("nosniff");
 });
 it.each(["",`?account=${account}&tenant=${account}`,`?account=${account}&account=${account}`,"?account=invalid"])("rejects query %s before actor resolution",async query=>{
  const response=await GET(new Request(base+query));expect(response.status).toBe(400);expect(mocks.snapshot).not.toHaveBeenCalled();
 });
 it.each([403,409,503] as const)("preserves status %i but never private error details",async status=>{
  mocks.snapshot.mockRejectedValueOnce(new CustomerSnapshotError(status,"PRIVATE CANARY"));const response=await GET(new Request(`${base}?account=${account}`));expect(response.status).toBe(status);expect(JSON.stringify(await response.json())).not.toContain("PRIVATE");expect(response.headers.get("cache-control")).toContain("no-store");
 });
 it("does not treat a generic temporary error as proof of revoked access",async()=>{
  mocks.snapshot.mockRejectedValueOnce(new Error("PRIVATE CANARY"));const response=await GET(new Request(`${base}?account=${account}`));expect(response.status).toBe(503);expect(JSON.stringify(await response.json())).not.toContain("PRIVATE");
 });
});
