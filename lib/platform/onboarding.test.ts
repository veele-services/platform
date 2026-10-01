import {beforeEach,expect,it,vi} from "vitest";
vi.mock("server-only",()=>({}));
vi.mock("next/cache",()=>({revalidatePath:vi.fn()}));
vi.mock("@/lib/files/scanned-storage",()=>({uploadScannedFile:vi.fn()}));
vi.mock("@/lib/tenancy/hostname",()=>({tenantAppUrl:(slug:string,path:string)=>`https://${slug}.example.test${path}`}));
vi.mock("@/lib/supabase/server",()=>({createClient:vi.fn()}));
const state=vi.hoisted(()=>({guard:vi.fn(),rpc:vi.fn(),invite:vi.fn(),list:vi.fn(),from:vi.fn(),update:vi.fn(),eq:vi.fn(),is:vi.fn(),in:vi.fn(),
 invitation:{id:"a0000000-0000-4000-8000-000000000004",full_name:"Original owner",email:"owner@example.test",status:"pending",bound_at:null as string|null}}));
vi.mock("@/lib/platform/data",()=>({requirePlatformAdmin:state.guard}));
vi.mock("@/lib/supabase/admin",()=>({createAdminClient:()=>({rpc:state.rpc,from:state.from,auth:{admin:{inviteUserByEmail:state.invite,listUsers:state.list}}})}));
import {createPlatformTenant,retryTenantAdminInvitation} from "@/app/platform/actions";
const actor="a0000000-0000-4000-8000-000000000001",tenant="a0000000-0000-4000-8000-000000000002",owner="a0000000-0000-4000-8000-000000000003";
const input={requestKey:"a0000000-0000-4000-8000-000000000005",name:"FICTITIOUS tenant",slug:"fixture",domain:"",adminName:"Original owner",adminEmail:"owner@example.test",primaryColor:"#222C35",accentColor:"#41AC42",enabledServices:["planning"],senderEmail:""};
beforeEach(()=>{
 vi.clearAllMocks();state.invitation.status="pending";state.invitation.bound_at=null;state.invitation.email="owner@example.test";
 state.guard.mockResolvedValue({user:{id:actor,email:"platform@example.test"}});
 state.rpc.mockImplementation(async(name:string)=>({data:name==="provision_platform_tenant"?tenant:true,error:null}));
 state.invite.mockResolvedValue({data:{user:{id:owner}},error:null});state.list.mockResolvedValue({data:{users:[]},error:null});
 state.from.mockImplementation((table:string)=>{
   if(!["tenants","tenant_admin_invitations"].includes(table))throw Error("Memberships must only be changed by the atomic binding RPC");
   const q={select:()=>q,eq:state.eq.mockImplementation(()=>q),is:state.is.mockImplementation(()=>q),in:state.in.mockImplementation(async()=>({error:null})),update:state.update.mockImplementation(()=>q),single:async()=>({data:table==="tenants"?{slug:"canonical",status:"active"}:{...state.invitation},error:null})};return q;
 });
});
it("stops changed-request replays at the database before an Auth or membership side effect",async()=>{
 state.rpc.mockResolvedValue({data:null,error:{message:"Original request mismatch",code:"23505"}});
 expect((await createPlatformTenant({...input,adminEmail:"platform@example.test"})).ok).toBe(false);
 expect(state.invite).not.toHaveBeenCalled();expect(state.from).not.toHaveBeenCalled();
});
it("both create and explicit retry return without sending or binding a completed invitation",async()=>{
 state.invitation.bound_at="2026-01-01T00:00:00Z";state.invitation.status="invited";
 expect((await createPlatformTenant(input)).ok).toBe(true);expect((await retryTenantAdminInvitation(tenant)).ok).toBe(true);
 expect(state.invite).not.toHaveBeenCalled();expect(state.rpc).toHaveBeenCalledTimes(1);expect(state.update).not.toHaveBeenCalled();
});
it("uses the stored recipient and tenant hostname, then one atomic binding",async()=>{
 expect((await createPlatformTenant(input)).ok).toBe(true);
 expect(state.invite).toHaveBeenCalledWith("owner@example.test",{redirectTo:"https://canonical.example.test/auth/confirm",data:{full_name:"Original owner"}});
 expect(state.rpc).toHaveBeenCalledWith("complete_platform_admin_invitation",{target_tenant:tenant,actor_user_id:actor,target_user:owner});
});
it("self-recipient onboarding does not send an Auth invitation",async()=>{
 state.invitation.email="platform@example.test";
 expect((await createPlatformTenant({...input,adminEmail:"platform@example.test"})).ok).toBe(true);
 expect(state.invite).not.toHaveBeenCalled();expect(state.rpc).toHaveBeenCalledWith("complete_platform_admin_invitation",{target_tenant:tenant,actor_user_id:actor,target_user:actor});
});
it("existing Auth accounts retain credentials and use the original recipient",async()=>{
 state.invite.mockResolvedValue({data:{user:null},error:{message:"Existing account"}});
 state.list.mockResolvedValue({data:{users:[{id:owner,email:"OWNER@example.test"}]},error:null});
 expect((await retryTenantAdminInvitation(tenant)).ok).toBe(true);
 expect(state.rpc).toHaveBeenCalledWith("complete_platform_admin_invitation",{target_tenant:tenant,actor_user_id:actor,target_user:owner});
});
it("a late failed attempt may only mark an unfinished invitation, without replacing completed state",async()=>{
 state.invite.mockRejectedValue(Error("FICTITIOUS provider failure"));
 const result=await createPlatformTenant(input);expect(result.ok).toBe(true);if(result.ok)expect(result.warning).toBeTruthy();
 expect(state.is).toHaveBeenCalledWith("bound_at",null);expect(state.in).toHaveBeenCalledWith("status",["pending","failed"]);
 expect(state.rpc).toHaveBeenCalledTimes(1);
 expect((await retryTenantAdminInvitation(tenant)).ok).toBe(false);
});
