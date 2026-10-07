vi.mock("server-only",()=>({}));
vi.mock("@/lib/addresses/form",()=>({verifiedAddress:async(value:unknown)=>value}));
import { beforeEach,describe,expect,it,vi } from "vitest";
const mocks=vi.hoisted(()=>({rpc:vi.fn(),actor:vi.fn(),revalidate:vi.fn()}));
vi.mock("@/lib/objects/auth",()=>({getObjectActor:mocks.actor}));vi.mock("next/cache",()=>({revalidatePath:mocks.revalidate}));
import { saveCustomerPortalObject } from "./object-action";
const tenant="10000000-0000-4000-8000-000000000001",account="10000000-0000-4000-8000-000000000002",command="10000000-0000-4000-8000-000000000003",object="10000000-0000-4000-8000-000000000004";
const input={accountId:account,accountVersion:1,object:{version:0,name:"Fictieve locatie",type:"office",size:null,street:"Teststraat 1",postalCode:"1234 AB",city:"Teststad",contact:"Fictieve Klant",phone:"0301234567",contactVersion:0,contactRecordVersion:0,instruction:"Fictieve gewone werkinstructie"},commandId:command};
beforeEach(()=>{vi.clearAllMocks();mocks.actor.mockResolvedValue({tenant:{id:tenant},db:{rpc:mocks.rpc}});mocks.rpc.mockResolvedValue({data:{accountVersion:2,objectId:object},error:null});});
describe("customer object server action",()=>{
 it("derives tenant from the verified hostname actor, preserving exact source and retry key",async()=>{
  expect(await saveCustomerPortalObject(input)).toEqual({ok:true,accountVersion:2,objectId:object});
  expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("customer_portal_object_save",{target_tenant:tenant,target_account:account,expected_account_version:1,input:input.object,request_id:command});
 });
 it.each(["customerId","tenantId","userId","manageSecrets","latitude","accessInstructions","status"])("rejects forged object field %s before database access",async field=>{
  expect(await saveCustomerPortalObject({...input,object:{...input.object,[field]:"FORGED"}})).toMatchObject({ok:false});expect(mocks.rpc).not.toHaveBeenCalled();
 });
 it("rejects forged tenant identity in the envelope",async()=>{
  expect(await saveCustomerPortalObject({...input,tenantId:tenant})).toMatchObject({ok:false});expect(mocks.rpc).not.toHaveBeenCalled();
 });
 it("does not revalidate on a source conflict or denied write",async()=>{
  mocks.rpc.mockResolvedValueOnce({data:null,error:{code:"40001",message:"PRIVATE CRM"}});expect(await saveCustomerPortalObject(input)).toMatchObject({ok:false,code:"40001"});expect(mocks.revalidate).not.toHaveBeenCalled();
 });
 it("does not export unexpected internal result fields",async()=>{
  mocks.rpc.mockResolvedValueOnce({data:{accountVersion:2,objectId:object,manageSecrets:true},error:null});expect(await saveCustomerPortalObject(input)).toMatchObject({ok:false});expect(mocks.revalidate).not.toHaveBeenCalled();
 });
});
