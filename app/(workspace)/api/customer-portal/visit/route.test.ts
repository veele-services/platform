import { beforeEach,describe,expect,it,vi } from "vitest";
const mocks=vi.hoisted(()=>({visit:vi.fn()}));
vi.mock("@/lib/customer-portal/data",()=>({getCustomerPortalVisit:mocks.visit}));
import { CustomerSnapshotError } from "@/lib/customer-portal/snapshot-model";
import { GET } from "./route";
const account="10000000-0000-4000-8000-000000000001",visit="10000000-0000-4000-8000-000000000002",base="https://fixture.staging.fieldgrid.nl/api/customer-portal/visit";
beforeEach(()=>vi.clearAllMocks());
describe("private customer visit refresh",()=>{
 it("passes only explicit customer and visit selectors, with private no-store headers",async()=>{
  mocks.visit.mockResolvedValueOnce({fixture:"validated by data layer"});const response=await GET(new Request(`${base}?account=${account}&visit=${visit}`));expect(response.status).toBe(200);expect(mocks.visit).toHaveBeenCalledExactlyOnceWith(account,visit);expect(response.headers.get("cache-control")).toContain("no-store");expect(response.headers.get("vary")).toBe("Cookie");
 });
 it.each([`?account=${account}`,`?account=${account}&visit=${visit}&tenant=${account}`,`?account=${account}&visit=${visit}&visit=${visit}`,`?account=${account}&account=${account}&visit=${visit}`,`?account=${account}&visit=invalid`])("rejects query %s without data access",async query=>{
  expect((await GET(new Request(base+query))).status).toBe(400);expect(mocks.visit).not.toHaveBeenCalled();
 });
 it.each([403,503] as const)("does not disclose private errors on status %i",async status=>{
  mocks.visit.mockRejectedValueOnce(new CustomerSnapshotError(status,"PRIVATE CANARY"));const response=await GET(new Request(`${base}?account=${account}&visit=${visit}`));expect(response.status).toBe(status);expect(JSON.stringify(await response.json())).not.toContain("PRIVATE");expect(response.headers.get("cache-control")).toContain("no-store");
 });
});
