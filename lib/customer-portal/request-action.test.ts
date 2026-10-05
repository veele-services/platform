import { beforeEach,describe,expect,it,vi } from "vitest";
const mocks=vi.hoisted(()=>({rpc:vi.fn(),actor:vi.fn(),revalidate:vi.fn()}));
vi.mock("@/lib/objects/auth",()=>({getObjectActor:mocks.actor}));vi.mock("next/cache",()=>({revalidatePath:mocks.revalidate}));
import { createCustomerPortalRequest } from "./request-action";
import { addCustomerPortalInstruction } from "./instruction-action";
const tenant="10000000-0000-4000-8000-000000000001",account="10000000-0000-4000-8000-000000000002",command="10000000-0000-4000-8000-000000000003",object="10000000-0000-4000-8000-000000000004",child="10000000-0000-4000-8000-000000000005";
const request={service:"Andere dienstverlening",objectIds:[object],frequency:"Eenmalig",preferredOn:null,description:"Fictieve klantwensen"},input={accountId:account,request,commandId:command};
beforeEach(()=>{vi.clearAllMocks();mocks.actor.mockResolvedValue({tenant:{id:tenant},db:{rpc:mocks.rpc}});mocks.rpc.mockResolvedValue({data:{groupId:command,requestIds:[child]},error:null});});
describe("customer service and ordinary instruction persistence actions",()=>{
 it("uses hostname tenant, explicit objects and one stable group receipt",async()=>{
  expect(await createCustomerPortalRequest(input)).toEqual({ok:true,groupId:command,requestIds:[child]});
  expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("customer_portal_request_create",{target_tenant:tenant,target_account:account,input:request,request_id:command});
 });
 it.each(["tenantId","customerId","userId","ownerId","status","priority","priceCents","confirmed"])("rejects forged request field %s",async field=>{
  expect(await createCustomerPortalRequest({...input,request:{...request,[field]:"FORGED"}})).toMatchObject({ok:false});expect(mocks.actor).not.toHaveBeenCalled();
 });
 it("never chooses a first object or accepts duplicates",async()=>{
  for(const objectIds of [[],[object,object]])expect(await createCustomerPortalRequest({...input,request:{...request,objectIds}})).toMatchObject({ok:false});expect(mocks.rpc).not.toHaveBeenCalled();
 });
 it("does not export unexpected receipt data",async()=>{
  mocks.rpc.mockResolvedValueOnce({data:{groupId:command,requestIds:[child],ownerId:tenant},error:null});expect(await createCustomerPortalRequest(input)).toMatchObject({ok:false});expect(mocks.revalidate).not.toHaveBeenCalled();
 });
 it("rejects a receipt for a different command or number of selected objects",async()=>{
  for(const data of [{groupId:object,requestIds:[child]},{groupId:command,requestIds:[child,child]}]){mocks.rpc.mockResolvedValueOnce({data,error:null});expect(await createCustomerPortalRequest(input)).toMatchObject({ok:false});}expect(mocks.revalidate).not.toHaveBeenCalled();
 });
 it("does not disclose internal errors or invalidate on denied intake",async()=>{
  mocks.rpc.mockResolvedValueOnce({data:null,error:{code:"42501",message:"PRIVATE OWNER"}});const result=await createCustomerPortalRequest(input);expect(result).toMatchObject({ok:false,code:"42501"});expect(JSON.stringify(result)).not.toContain("PRIVATE");expect(mocks.revalidate).not.toHaveBeenCalled();
 });
 it("instruction accepts only ordinary text and its exact object version",async()=>{
  const instruction={objectId:object,version:2,body:"Fictieve vaste instructie"};mocks.rpc.mockResolvedValueOnce({data:{objectVersion:3,accountVersion:4},error:null});expect(await addCustomerPortalInstruction({accountId:account,instruction,commandId:command})).toEqual({ok:true,objectVersion:3,accountVersion:4});
  expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("customer_portal_instruction_add",{target_tenant:tenant,target_account:account,target_object:object,expected_version:2,input_body:instruction.body,request_id:command});
 });
 it("instruction cannot grant a vault right or target another tenant through its envelope",async()=>{
  const input={accountId:account,instruction:{objectId:object,version:2,body:"Fictieve instructie"},commandId:command};
  expect(await addCustomerPortalInstruction({...input,tenantId:tenant})).toMatchObject({ok:false});expect(await addCustomerPortalInstruction({...input,instruction:{...input.instruction,manageSecrets:true}})).toMatchObject({ok:false});expect(mocks.rpc).not.toHaveBeenCalled();
 });
});
