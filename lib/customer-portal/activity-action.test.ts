import { beforeEach,describe,expect,it,vi } from "vitest";
const mocks=vi.hoisted(()=>({actor:vi.fn(),rpc:vi.fn(),revalidate:vi.fn()}));
vi.mock("@/lib/objects/auth",()=>({getObjectActor:mocks.actor}));
vi.mock("next/cache",()=>({revalidatePath:mocks.revalidate}));
import { readCustomerPortalActivity } from "./activity-action";
const tenant="10000000-0000-4000-8000-000000000001",accountId="10000000-0000-4000-8000-000000000002",commandId="10000000-0000-4000-8000-000000000003",notificationId="10000000-0000-4000-8000-000000000004";
beforeEach(()=>{vi.clearAllMocks();mocks.actor.mockResolvedValue({tenant:{id:tenant},db:{rpc:mocks.rpc}});mocks.rpc.mockResolvedValue({data:{updated:1},error:null});});
describe("selected-customer activity commands",()=>{
 it("binds a single read to the hostname tenant, selected account and version",async()=>{
  expect(await readCustomerPortalActivity({accountId,commandId,operation:"read",notificationId,version:4})).toEqual({ok:true,updated:1});
  expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("customer_portal_activity_mark",{target_tenant:tenant,target_account:accountId,operation:"read",request_id:commandId,target_notification:notificationId,expected_version:4});
 });
 it("uses the account-scoped read-all wrapper rather than the global inbox command",async()=>{
  expect(await readCustomerPortalActivity({accountId,commandId,operation:"read_all"})).toEqual({ok:true,updated:1});
  expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("customer_portal_activity_mark",{target_tenant:tenant,target_account:accountId,operation:"read_all",request_id:commandId});
 });
 it.each([{operation:"read_all",tenant},{operation:"read_all",notificationId},{operation:"read",notificationId,version:0},{operation:"read",notificationId,version:1.1},{operation:"archive"}])("rejects untrusted command fields before resolving identity",async input=>{
  expect((await readCustomerPortalActivity({accountId,commandId,...input})).ok).toBe(false);expect(mocks.actor).not.toHaveBeenCalled();
 });
 it.each(["42501","40001","23505","54000"])("preserves actionable %s without exposing private DB messages",async code=>{
  mocks.rpc.mockResolvedValue({data:null,error:{code,message:"PRIVATE"}});const result=await readCustomerPortalActivity({accountId,commandId,operation:"read_all"});expect(result).toMatchObject({ok:false,code});expect(JSON.stringify(result)).not.toContain("PRIVATE");expect(mocks.revalidate).not.toHaveBeenCalled();
 });
 it("rejects richer server state and transport errors",async()=>{
  mocks.rpc.mockResolvedValueOnce({data:{updated:1,secret:"PRIVATE"},error:null});expect((await readCustomerPortalActivity({accountId,commandId,operation:"read_all"})).ok).toBe(false);
  mocks.rpc.mockRejectedValueOnce(new Error("PRIVATE"));expect(JSON.stringify(await readCustomerPortalActivity({accountId,commandId,operation:"read_all"}))).not.toContain("PRIVATE");
 });
});
