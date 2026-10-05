import { beforeEach,describe,expect,it,vi } from "vitest";

const mocks=vi.hoisted(()=>({actor:vi.fn(),rpc:vi.fn(),revalidate:vi.fn()}));
vi.mock("@/lib/objects/auth",()=>({getObjectActor:mocks.actor}));
vi.mock("next/cache",()=>({revalidatePath:mocks.revalidate}));
import { markCustomerPortalNews } from "./news-action";

const tenant="10000000-0000-4000-8000-000000000001",accountId="10000000-0000-4000-8000-000000000002",notificationId="10000000-0000-4000-8000-000000000003",commandId="10000000-0000-4000-8000-000000000004";
const input={accountId,notificationId,commandId,version:3,operation:"read"};

beforeEach(()=>{
 vi.clearAllMocks();mocks.actor.mockResolvedValue({tenant:{id:tenant},db:{rpc:mocks.rpc}});
 mocks.rpc.mockResolvedValue({data:{notificationId,version:4},error:null});
});

describe("customer news read/ack server action",()=>{
 it.each(["read","ack"])("uses the hostname tenant and selected-account wrapper for %s",async operation=>{
  expect(await markCustomerPortalNews({...input,operation})).toEqual({ok:true,notificationId,version:4});
  expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("customer_portal_news_mark",{
   target_tenant:tenant,target_account:accountId,target_notification:notificationId,
   expected_version:3,operation,request_id:commandId,
  });
  expect(mocks.revalidate.mock.calls).toEqual([["/klant","layout"]]);
 });
 it.each(["tenantId","customerId","userId","context","readAt","acknowledgedAt","all"])("rejects forged %s before actor access",async field=>{
  expect((await markCustomerPortalNews({...input,[field]:"FORGED"})).ok).toBe(false);
  expect(mocks.actor).not.toHaveBeenCalled();expect(mocks.rpc).not.toHaveBeenCalled();
 });
 it.each([{version:0},{version:1.5},{version:Number.MAX_SAFE_INTEGER+1},{operation:"read_all"},{notificationId:"invalid"},{accountId:"invalid"},{commandId:"invalid"}])("validates source, operation and receipt before identity access",async change=>{
  expect((await markCustomerPortalNews({...input,...change})).ok).toBe(false);expect(mocks.actor).not.toHaveBeenCalled();
 });
 it("retains the same exact receipt and version for an ambiguous retry",async()=>{
  mocks.rpc.mockRejectedValueOnce(new Error("PRIVATE CANARY"));
  expect((await markCustomerPortalNews(input)).ok).toBe(false);expect((await markCustomerPortalNews(input)).ok).toBe(true);
  expect(mocks.rpc.mock.calls[0]).toEqual(mocks.rpc.mock.calls[1]);
 });
 it.each([{notificationId:accountId,version:4},{notificationId,version:2},{notificationId,version:4,source_context:"PRIVATE CANARY"}])("does not confirm malformed or unrelated server state",async data=>{
  mocks.rpc.mockResolvedValueOnce({data,error:null});expect((await markCustomerPortalNews(input)).ok).toBe(false);expect(mocks.revalidate).not.toHaveBeenCalled();
 });
 it.each(["40001","42501","23514","23505","54000"])("returns a bounded %s explanation without database details",async code=>{
  mocks.rpc.mockResolvedValueOnce({data:null,error:{code,message:"PRIVATE CANARY",details:"PRIVATE CANARY"}});
  const result=await markCustomerPortalNews(input);expect(result).toMatchObject({ok:false,code});
  expect(JSON.stringify(result)).not.toContain("PRIVATE");expect(mocks.revalidate).not.toHaveBeenCalled();
 });
 it("does not serialize unknown error codes or provider details",async()=>{
  mocks.rpc.mockResolvedValueOnce({data:null,error:{code:"PRIVATE CANARY",message:"PRIVATE CANARY"}});
  const result=await markCustomerPortalNews(input);expect(result.ok).toBe(false);expect(JSON.stringify(result)).not.toContain("PRIVATE");
 });
 it("fails closed without sending a command when actor access is denied",async()=>{
  mocks.actor.mockRejectedValueOnce(new Error("PRIVATE CANARY"));
  expect((await markCustomerPortalNews(input)).ok).toBe(false);expect(mocks.rpc).not.toHaveBeenCalled();
 });
});
