vi.mock("server-only",()=>({}));
vi.mock("@/lib/addresses/form",()=>({verifiedAddress:async(value:unknown)=>value}));
import { beforeEach,describe,expect,it,vi } from "vitest";
const mocks=vi.hoisted(()=>({rpc:vi.fn(),actor:vi.fn(),revalidate:vi.fn()}));
vi.mock("@/lib/objects/auth",()=>({getObjectActor:mocks.actor}));vi.mock("next/cache",()=>({revalidatePath:mocks.revalidate}));
import { saveCustomerPortalOnboarding } from "./onboarding-action";
import { saveCustomerPortalPreferences } from "./preferences-action";
const tenant="10000000-0000-4000-8000-000000000001",account="10000000-0000-4000-8000-000000000002",command="10000000-0000-4000-8000-000000000003",object="10000000-0000-4000-8000-000000000004";
const preferences={appointments:true,reports:false,invoices:true,tickets:true,news:false};
const onboarding={mode:"save",expectedVersion:1,customerVersion:1,contactVersion:1,preferenceVersion:0,step:0,contact:{firstName:"Fictieve",lastName:"Klant",company:"Fictieve organisatie",phone:"0301234567"},object:null,preferences,confirmed:false};
const input={accountId:account,onboarding,commandId:command};
beforeEach(()=>{vi.clearAllMocks();mocks.actor.mockResolvedValue({tenant:{id:tenant},db:{rpc:mocks.rpc}});mocks.rpc.mockResolvedValue({data:{accountVersion:2,step:1,completed:false},error:null});});
describe("customer onboarding and central preferences actions",()=>{
 it("derives tenant only from the actor and keeps source versions and receipt key",async()=>{
  expect(await saveCustomerPortalOnboarding(input)).toEqual({ok:true,accountVersion:2,step:1,completed:false});
  expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("customer_portal_onboarding_save",{target_tenant:tenant,target_account:account,input:onboarding,request_id:command});
  expect(mocks.revalidate).toHaveBeenCalledExactlyOnceWith("/klant","layout");
 });
 it.each(["email","customerId","userId","tenantId","paymentTerms"])("does not accept contact field %s",async field=>{
  expect(await saveCustomerPortalOnboarding({...input,onboarding:{...onboarding,contact:{...onboarding.contact,[field]:"FORGED"}}})).toMatchObject({ok:false});expect(mocks.actor).not.toHaveBeenCalled();
 });
 it("rejects forged tenant envelope and unconfirmed review",async()=>{
  expect(await saveCustomerPortalOnboarding({...input,tenantId:tenant})).toMatchObject({ok:false});
  expect(await saveCustomerPortalOnboarding({...input,onboarding:{...onboarding,mode:"review"}})).toMatchObject({ok:false});expect(mocks.rpc).not.toHaveBeenCalled();
 });
 it("requires a new object, not an existing object or its versions",async()=>{
  const first={version:0,name:"Fictieve locatie",type:"office",size:null,street:"Teststraat 1",postalCode:"1234 AB",city:"Teststad",contact:"Fictieve Klant",phone:"0301234567",contactVersion:0,contactRecordVersion:0,instruction:""};
  for(const forged of [{...first,id:object},{...first,version:1},{...first,contactVersion:1}])expect(await saveCustomerPortalOnboarding({...input,onboarding:{...onboarding,step:1,object:forged}})).toMatchObject({ok:false});
  expect(mocks.rpc).not.toHaveBeenCalled();
 });
 it("keeps internal database errors and extra result fields private",async()=>{
  mocks.rpc.mockResolvedValueOnce({data:null,error:{code:"40001",message:"PRIVATE BASELINE"}});const result=await saveCustomerPortalOnboarding(input);expect(result).toMatchObject({ok:false,code:"40001"});expect(JSON.stringify(result)).not.toContain("PRIVATE");
  mocks.rpc.mockResolvedValueOnce({data:{accountVersion:2,step:1,completed:false,_sources:{}},error:null});expect(await saveCustomerPortalOnboarding(input)).toMatchObject({ok:false});expect(mocks.revalidate).not.toHaveBeenCalled();
 });
 it("rejects a completed receipt without an object",async()=>{
  mocks.rpc.mockResolvedValueOnce({data:{accountVersion:3,step:3,completed:true},error:null});expect(await saveCustomerPortalOnboarding(input)).toMatchObject({ok:false});
 });
 it("writes exactly five groups through the existing central adapter",async()=>{
  mocks.rpc.mockResolvedValueOnce({data:{preferenceVersion:1},error:null});
  expect(await saveCustomerPortalPreferences({accountId:account,version:0,preferences,commandId:command})).toEqual({ok:true,preferenceVersion:1});
  expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("customer_portal_preferences_save",{target_tenant:tenant,target_account:account,expected_version:0,input:preferences,request_id:command});
 });
 it("does not accept recipients, channels or policy controls as preferences",async()=>{
  for(const field of ["userId","email","push","quietHours","typeCode"])expect(await saveCustomerPortalPreferences({accountId:account,version:0,preferences:{...preferences,[field]:true},commandId:command})).toMatchObject({ok:false});
  expect(mocks.rpc).not.toHaveBeenCalled();
 });
});
