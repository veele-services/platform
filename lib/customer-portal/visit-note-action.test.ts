import { beforeEach,describe,expect,it,vi } from "vitest";
const mocks=vi.hoisted(()=>({actor:vi.fn(),rpc:vi.fn(),revalidate:vi.fn()}));
vi.mock("@/lib/objects/auth",()=>({getObjectActor:mocks.actor}));vi.mock("next/cache",()=>({revalidatePath:mocks.revalidate}));
import { addCustomerPortalVisitNote } from "./visit-note-action";
const tenant="10000000-0000-4000-8000-000000000001",accountId="10000000-0000-4000-8000-000000000002",visitId="10000000-0000-4000-8000-000000000003",commandId="10000000-0000-4000-8000-000000000004";
const input={accountId,visitId,commandId,version:3,body:"Fictieve gewone afspraakinstructie"};
beforeEach(()=>{vi.clearAllMocks();mocks.actor.mockResolvedValue({tenant:{id:tenant},db:{rpc:mocks.rpc}});mocks.rpc.mockResolvedValue({data:{requestId:commandId,version:1},error:null});});
describe("customer appointment note server action",()=>{
 it("uses hostname tenant and the existing bounded concrete visit wrapper",async()=>{
  expect(await addCustomerPortalVisitNote(input)).toEqual({ok:true,requestId:commandId,version:1});expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("customer_portal_visit_note_add",{target_tenant:tenant,target_account:accountId,target_visit:visitId,expected_version:3,input_body:input.body,request_id:commandId});expect(mocks.revalidate.mock.calls).toEqual([["/klant","layout"],["/app","layout"],["/staff","layout"]]);
 });
 it.each(["tenantId","customerId","userId","objectId","title","status","priority","confirmed"])("rejects forged %s before actor access",async field=>{
  expect((await addCustomerPortalVisitNote({...input,[field]:"FORGED"})).ok).toBe(false);expect(mocks.actor).not.toHaveBeenCalled();expect(mocks.rpc).not.toHaveBeenCalled();
 });
 it.each([{version:0},{body:" "},{body:"x".repeat(10001)},{commandId:"invalid"}])("validates note and receipt before identity access",async change=>{
  expect((await addCustomerPortalVisitNote({...input,...change})).ok).toBe(false);expect(mocks.actor).not.toHaveBeenCalled();
 });
 it("keeps the caller receipt and source version unchanged for ambiguous retries",async()=>{
  mocks.rpc.mockRejectedValueOnce(new Error("PRIVATE CANARY"));expect((await addCustomerPortalVisitNote(input)).ok).toBe(false);expect((await addCustomerPortalVisitNote(input)).ok).toBe(true);expect(mocks.rpc.mock.calls[0]).toEqual(mocks.rpc.mock.calls[1]);
 });
 it("does not confirm a response for a different receipt",async()=>{
  mocks.rpc.mockResolvedValueOnce({data:{requestId:accountId,version:1},error:null});expect((await addCustomerPortalVisitNote(input)).ok).toBe(false);expect(mocks.revalidate).not.toHaveBeenCalled();
 });
 it("explains stale appointment versions without disclosing database details",async()=>{
  mocks.rpc.mockResolvedValueOnce({data:null,error:{code:"40001",message:"PRIVATE CANARY"}});const result=await addCustomerPortalVisitNote(input);expect(result).toMatchObject({ok:false,code:"40001"});expect("error" in result&&result.error).toContain("afspraak is gewijzigd");expect(JSON.stringify(result)).not.toContain("PRIVATE");expect(mocks.revalidate).not.toHaveBeenCalled();
 });
});
