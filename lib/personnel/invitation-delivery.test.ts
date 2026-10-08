import { beforeEach, expect, it, vi } from "vitest";
import type { TenantContext } from "@/lib/auth/context";
const mocks=vi.hoisted(()=>({provider:vi.fn(),logo:vi.fn(),snapshot:vi.fn(),access:vi.fn(),update:vi.fn(),events:[] as string[]}));
vi.mock("server-only",()=>({}));
vi.mock("@/lib/env/server",()=>({getServerEnv:()=>({SENDGRID_API_KEY:"fake",SENDGRID_FROM_EMAIL:"sender@example.test",DEPLOY_TARGET:"local",APP_URL:"https://fieldgrid.example.test"})}));
vi.mock("@/lib/tenancy/hostname",()=>({tenantAppUrl:(_slug:string,path:string="")=>`https://tenant.example.test${path}`}));
vi.mock("@/lib/supabase/admin",()=>({createAdminClient:()=>({from:(table:string)=>({select:vi.fn().mockReturnThis(),eq:vi.fn().mockReturnThis(),insert:vi.fn().mockReturnThis(),single:async()=>({data:table==="tenant_branding"?{primary_color:"#112233",accent_color:"#445566",logo_path:null,sender_name:"Tenant"}:{id:"delivery"},error:null}),update:mocks.update})})}));
vi.mock("@/lib/communications/tenant-email-brand",()=>({withTenantEmailBrand:async()=>({})}));
vi.mock("@/lib/communications/personnel-invitation",()=>({renderPersonnelInvitation:()=>({subject:"Uitnodiging",html:"Mail",text:"Mail"})}));
vi.mock("@/lib/communications/email",()=>({renderTenantEmailHtml:()=>"Mail"}));
vi.mock("@/lib/notifications/mail-template",()=>({resolveMailTemplate:async()=>({title:"Uitnodiging",body:"Personeel",variables:[],revision:1}),renderNotificationMailText:(text:string)=>text}));
vi.mock("@/lib/notifications/mail-snapshot",()=>({freezeMailSnapshot:mocks.snapshot,mailFailureOutcome:()=>"uncertain",mailFailureMessage:()=>"Onzeker"}));
vi.mock("@/lib/notifications/brand-asset",()=>({freezeEmailLogo:mocks.logo}));
vi.mock("@/lib/notifications/deferred-mail",()=>({deferNotificationMail:async()=>false}));
vi.mock("@/lib/providers/sendgrid",()=>({sendEmail:mocks.provider}));
import { deliverPersonnelInvitation } from "./invitations";
const tenant={id:"tenant",slug:"tenant",name:"Tenant"} as TenantContext;
const person={id:"person",userId:"worker",email:"worker@example.test",full_name:"Fictieve medewerker",employee_number:"P-1"};
beforeEach(()=>{
 vi.clearAllMocks();mocks.events.length=0;
 mocks.logo.mockImplementation(async()=>{mocks.events.push("logo");return null;});
 mocks.snapshot.mockImplementation(async()=>{mocks.events.push("snapshot");return{subject:"Uitnodiging",html:"Mail",text:"Mail"};});
 mocks.access.mockImplementation(async()=>{mocks.events.push("authorize");});
 mocks.provider.mockImplementation(async()=>{mocks.events.push("provider");return{id:"sent"};});
 const query={eq:vi.fn().mockReturnThis(),then:(resolve:(value:{error:null})=>void)=>resolve({error:null})};mocks.update.mockReturnValue(query);
});
it("checks live action and recipient rights after branding IO, immediately before provider",async()=>{
 await expect(deliverPersonnelInvitation({tenant,person,tokenHash:null,confirmAccess:mocks.access})).resolves.toEqual({});
 expect(mocks.events).toEqual(["logo","snapshot","authorize","provider"]);
});
it.each([null,"activation-hash"])("does not send after membership or actor access revocation (activation=%s)",async tokenHash=>{
 mocks.access.mockRejectedValue(new Error("Access revoked"));
 await expect(deliverPersonnelInvitation({tenant,person,tokenHash,confirmAccess:mocks.access})).rejects.toThrow();
 expect(mocks.provider).not.toHaveBeenCalled();expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({status:"failed"}));
});
