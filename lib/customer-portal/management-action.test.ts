import { beforeEach,describe,expect,it,vi } from "vitest";
const m=vi.hoisted(()=>({actor:vi.fn(),rpc:vi.fn(),contact:vi.fn(),list:vi.fn(),create:vi.fn()}));
vi.mock("@/lib/objects/auth",()=>({getObjectActor:m.actor}));vi.mock("next/cache",()=>({revalidatePath:vi.fn()}));
import { saveCustomerAccount } from "./management-action";
const tenant="10000000-0000-4000-8000-000000000001",customer="20000000-0000-4000-8000-000000000001",contact="30000000-0000-4000-8000-000000000001",user="40000000-0000-4000-8000-000000000001";
const input={customerId:customer,contactId:contact,email:"person@fixture.invalid",version:0,active:true,canCreateObjects:true,canEditObjects:false,canEditProfile:true};
beforeEach(()=>{
 vi.resetAllMocks();const q={select:()=>q,eq:()=>q,maybeSingle:m.contact};
 m.actor.mockResolvedValue({tenant:{id:tenant},db:{rpc:m.rpc,from:()=>q},admin:{auth:{admin:{listUsers:m.list,createUser:m.create}}}});
 m.rpc.mockResolvedValue({data:[],error:null});m.contact.mockResolvedValue({data:{id:contact},error:null});m.list.mockResolvedValue({data:{users:[]},error:null});m.create.mockResolvedValue({data:{user:{id:user}},error:null});
});
describe("explicit customer account provisioning",()=>{
 it("checks scoped management before touching global Auth",async()=>{m.rpc.mockResolvedValue({error:{code:"42501"}});expect((await saveCustomerAccount(input)).ok).toBe(false);expect(m.list).not.toHaveBeenCalled();expect(m.create).not.toHaveBeenCalled();});
 it("rejects a foreign contact before touching global Auth",async()=>{m.contact.mockResolvedValue({data:null,error:null});expect((await saveCustomerAccount(input)).ok).toBe(false);expect(m.list).not.toHaveBeenCalled();});
 it("creates without password or session and grants only the explicit selected capabilities",async()=>{
  expect(await saveCustomerAccount(input)).toEqual({ok:true});expect(m.create).toHaveBeenCalledWith({email:input.email,email_confirm:true});
  expect(m.rpc).toHaveBeenLastCalledWith("customer_portal_bind",{target_tenant:tenant,target_customer:customer,target_contact:contact,target_user:user,expected_version:0,can_create:true,can_edit_objects:false,can_edit_profile:true,enabled:true});
 });
 it("existing Auth users are never changed when granting or revoking an account",async()=>{m.list.mockResolvedValue({data:{users:[{id:user,email:input.email}]},error:null});expect((await saveCustomerAccount({...input,version:3,active:false})).ok).toBe(true);expect(m.create).not.toHaveBeenCalled();expect(m.rpc).toHaveBeenLastCalledWith("customer_portal_bind",expect.objectContaining({expected_version:3,enabled:false}));});
 it("checks management again before a new Auth identity and reports stale binding without guessing a newer version",async()=>{
  m.rpc.mockResolvedValueOnce({data:[],error:null}).mockResolvedValueOnce({data:[],error:null}).mockResolvedValueOnce({error:{code:"40001"}});
  const result=await saveCustomerAccount(input);expect(result.ok).toBe(false);expect(result).toMatchObject({error:expect.stringContaining("gewijzigd")});expect(m.create).toHaveBeenCalledTimes(1);
 });
 it("rejects body tenant overrides and never creates users during revoke",async()=>{expect((await saveCustomerAccount({...input,tenantId:tenant})).ok).toBe(false);expect(m.actor).not.toHaveBeenCalled();expect((await saveCustomerAccount({...input,active:false})).ok).toBe(false);expect(m.create).not.toHaveBeenCalled();});
});
