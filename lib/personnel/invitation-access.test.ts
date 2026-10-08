import { beforeEach, expect, it, vi } from "vitest";
import type { AuthContext, TenantContext } from "@/lib/auth/context";
const mocks=vi.hoisted(()=>({auth:vi.fn(),record:vi.fn(),membership:vi.fn(),account:vi.fn(),admin:vi.fn()}));
vi.mock("server-only",()=>({}));
vi.mock("@/lib/auth/context",()=>({getAuthContext:mocks.auth,hasAnyRole:()=>true}));
vi.mock("@/lib/supabase/admin",()=>({createAdminClient:mocks.admin}));
import { confirmPersonnelInvitationAccess, personnelInvitationActor } from "./invitation-access";
const actor={user:{id:"actor"},tenant:{id:"tenant",enabledServices:["personeel"],permissions:["backoffice.access","backoffice.personnel.write","backoffice.functions.repeat_personnel_invitation"]} as TenantContext} as AuthContext & {tenant:TenantContext};
const person={id:"person",userId:"worker",email:"worker@example.test"};
beforeEach(()=>{
 vi.clearAllMocks();mocks.auth.mockResolvedValue(actor);
 mocks.record.mockResolvedValue({data:{id:person.id,user_id:person.userId,email:person.email,status:"active"},error:null});
 mocks.membership.mockResolvedValue({data:{status:"active",roles:["staff"]},error:null});
 mocks.account.mockResolvedValue({data:{user:{id:person.userId,email:person.email}},error:null});
 mocks.admin.mockImplementation(()=>({from:(table:string)=>{const query={select:vi.fn().mockReturnThis(),eq:vi.fn().mockReturnThis(),maybeSingle:table==="personnel"?mocks.record:mocks.membership};return query;},auth:{admin:{getUserById:mocks.account}}}));
});
it("allows only the exact configured invitation action",async()=>{
 await expect(personnelInvitationActor("backoffice.functions.invite_personnel")).rejects.toThrow();
 expect(mocks.admin).not.toHaveBeenCalled();
});
it("rechecks live actor and exact staff recipient without modifying management roles",async()=>{
 await expect(confirmPersonnelInvitationAccess(actor,"backoffice.functions.repeat_personnel_invitation",person)).resolves.toBeUndefined();
 expect(mocks.auth).toHaveBeenCalledTimes(2);expect(mocks.account).toHaveBeenCalledWith(person.userId);
});
it.each(["revoked","suspended"])("denies %s recipient membership",async status=>{
 mocks.membership.mockResolvedValue({data:{status,roles:["staff"]},error:null});
 await expect(confirmPersonnelInvitationAccess(actor,"backoffice.functions.repeat_personnel_invitation",person)).rejects.toThrow();
});
it("denies changed recipient Auth email after account preparation",async()=>{
 mocks.account.mockResolvedValue({data:{user:{id:person.userId,email:"changed@example.test"}},error:null});
 await expect(confirmPersonnelInvitationAccess(actor,"backoffice.functions.repeat_personnel_invitation",person)).rejects.toThrow();
});
it("denies actor permission revocation during recipient IO",async()=>{
 mocks.record.mockImplementation(async()=>{mocks.auth.mockResolvedValue({...actor,tenant:{...actor.tenant,permissions:[]}});return{data:{id:person.id,user_id:person.userId,email:person.email,status:"active"},error:null};});
 await expect(confirmPersonnelInvitationAccess(actor,"backoffice.functions.repeat_personnel_invitation",person)).rejects.toThrow();
});
it("rejects a changed initiating tenant even when both roles allow invitations",async()=>{
 mocks.auth.mockResolvedValue({...actor,tenant:{...actor.tenant,id:"other-tenant"}});
 await expect(confirmPersonnelInvitationAccess(actor,"backoffice.functions.repeat_personnel_invitation",person)).rejects.toThrow();
 expect(mocks.admin).not.toHaveBeenCalled();
});
