import { beforeEach,describe,expect,it,vi } from "vitest";

const mocks=vi.hoisted(()=>({rpc:vi.fn(),actor:vi.fn(),revalidate:vi.fn()}));
vi.mock("@/lib/objects/auth",()=>({getObjectActor:mocks.actor}));
vi.mock("next/cache",()=>({revalidatePath:mocks.revalidate}));
import { saveCustomerPortalProfile } from "./profile-action";

const tenant="10000000-0000-4000-8000-000000000001",account="10000000-0000-4000-8000-000000000002",command="10000000-0000-4000-8000-000000000003";
const input={accountId:account,accountVersion:1,customerVersion:2,contactVersion:3,profile:{firstName:"Fictieve",lastName:"Klant",company:"Fictieve organisatie",phone:"0301234567",invoiceEmail:"invoices@fixture.test",street:"Teststraat 1",postalCode:"1234 AB",city:"Teststad",companyNumber:""},commandId:command};
beforeEach(()=>{vi.clearAllMocks();mocks.actor.mockResolvedValue({tenant:{id:tenant},db:{rpc:mocks.rpc}});mocks.rpc.mockResolvedValue({data:{accountVersion:2,customerVersion:3,contactVersion:4},error:null});});
describe("customer profile server action",()=>{
 it("uses only hostname identity and the caller's exact source versions",async()=>{
  expect(await saveCustomerPortalProfile(input)).toEqual({ok:true,accountVersion:2,profileVersions:{customer:3,contact:4}});
  expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("customer_portal_profile_save",{target_tenant:tenant,target_account:account,expected_account_version:1,expected_customer_version:2,expected_contact_version:3,input:input.profile,request_id:command});
 });
 it.each(["tenantId","customerId","ownerUserId","email"])("rejects forged envelope field %s before any database write",async field=>{
  expect(await saveCustomerPortalProfile({...input,[field]:"FORGED"})).toMatchObject({ok:false});expect(mocks.rpc).not.toHaveBeenCalled();
 });
 it("rejects login-email editing inside a forged profile",async()=>{
  expect(await saveCustomerPortalProfile({...input,profile:{...input.profile,email:"forged@fixture.test"}})).toMatchObject({ok:false});expect(mocks.rpc).not.toHaveBeenCalled();
 });
 it("preserves source conflicts and does not revalidate after a denied write",async()=>{
  mocks.rpc.mockResolvedValueOnce({data:null,error:{code:"40001",message:"PRIVATE DETAILS"}});
  expect(await saveCustomerPortalProfile(input)).toEqual({ok:false,code:"40001",error:expect.stringContaining("intussen gewijzigd")});expect(mocks.revalidate).not.toHaveBeenCalled();
 });
 it("never reflects database internals or private return fields",async()=>{
  mocks.rpc.mockResolvedValueOnce({data:null,error:{code:"42501",message:"PRIVATE TENANT/CONTACT"}});
  expect(JSON.stringify(await saveCustomerPortalProfile(input))).not.toContain("PRIVATE");
  mocks.rpc.mockResolvedValueOnce({data:{accountVersion:2,customerVersion:3,contactVersion:4,staffEmail:"PRIVATE"},error:null});
  expect(await saveCustomerPortalProfile(input)).toMatchObject({ok:false});expect(mocks.revalidate).not.toHaveBeenCalled();
 });
 it("does not write after a revoked/failed identity check",async()=>{
  mocks.actor.mockRejectedValueOnce(new Error("SESSION REVOKED"));expect(await saveCustomerPortalProfile(input)).toMatchObject({ok:false});expect(mocks.rpc).not.toHaveBeenCalled();
 });
});
