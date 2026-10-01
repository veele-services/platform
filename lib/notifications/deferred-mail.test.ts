import {beforeEach,expect,it,vi} from "vitest";
vi.mock("server-only",()=>({}));
const mocks=vi.hoisted(()=>({rpc:vi.fn(),send:vi.fn(),download:vi.fn()}));
vi.mock("@/lib/supabase/admin",()=>({createAdminClient:()=>({rpc:mocks.rpc,storage:{from:()=>({download:mocks.download})}})}));
vi.mock("@/lib/providers/sendgrid",()=>({sendEmail:mocks.send,SendGridDeliveryError:class extends Error{httpStatus=429;}}));
vi.mock("./provider-policy",()=>({NotificationDeferredError:class extends Error{constructor(public retryAt:string){super("Quiet hours");}}}));
import {NotificationDeferredError} from "./provider-policy";
import {processDeferredMail} from "./deferred-mail";

const id="11000000-0000-4000-8000-000000000001",lease="11000000-0000-4000-8000-000000000002";
const snapshot={fromEmail:"sender@example.test",fromName:"FICTITIOUS",to:"recipient@example.test",subject:"FICTITIOUS original",text:"FICTITIOUS body",html:"<p>FICTITIOUS body</p>",targetUrl:"https://example.test/klant",templateRevision:2,attachmentPath:null,attachmentFilename:null};
const job={id,tenant_id:id,type:"invoice.available",context:"customer",lease_id:lease,key:"fictitious-mail",template:"invoice",snapshot};
beforeEach(()=>{vi.clearAllMocks();mocks.rpc.mockImplementation(async(_name:string,args:{operation:string})=>({data:args.operation==="claim"?[job]:{ok:true},error:null}));mocks.send.mockResolvedValue({id:"fictitious-provider"});});
it("sends the frozen message with the original identity and current policy gate",async()=>{
 expect(await processDeferredMail()).toMatchObject({sent:1,failed:0});
 expect(mocks.send).toHaveBeenCalledWith(expect.objectContaining({...snapshot,policy:{kind:"notification",tenantId:id,type:"invoice.available",context:"customer",sourceId:id},deliveryKey:job.key}));
 expect(mocks.rpc).toHaveBeenLastCalledWith("notification_deferred_mail",expect.objectContaining({operation:"finish",input:{lease_id:lease,outcome:"sent",provider_id:"fictitious-provider"}}));
});
it("persists uncertainty instead of retrying a possibly accepted message",async()=>{
 mocks.send.mockRejectedValue(new Error("Fictitious timeout"));
 expect(await processDeferredMail()).toMatchObject({sent:0,failed:1});
 expect(mocks.rpc).toHaveBeenLastCalledWith("notification_deferred_mail",expect.objectContaining({operation:"finish",input:{lease_id:lease,outcome:"uncertain"}}));
});
it("new quiet hours defer the same message without reporting delivery",async()=>{
 mocks.send.mockRejectedValue(new NotificationDeferredError("2026-10-01T07:00:00Z"));
 expect(await processDeferredMail()).toMatchObject({sent:0,deferred:1,failed:0});
 expect(mocks.rpc).toHaveBeenLastCalledWith("notification_deferred_mail",expect.objectContaining({operation:"defer",target_mail_id:id}));
});
it("a document path outside the source tenant never reaches storage or provider",async()=>{
 mocks.rpc.mockResolvedValueOnce({data:[{...job,snapshot:{...snapshot,attachmentPath:"another-tenant/document.pdf"}}],error:null});
 expect(await processDeferredMail()).toMatchObject({sent:0,failed:1});expect(mocks.download).not.toHaveBeenCalled();expect(mocks.send).not.toHaveBeenCalled();
 expect(mocks.rpc).toHaveBeenLastCalledWith("notification_deferred_mail",expect.objectContaining({input:{lease_id:lease,outcome:"failed"}}));
});
it("a failed acceptance write is not presented as successful delivery",async()=>{
 mocks.rpc.mockImplementation(async(_name:string,args:{operation:string;input?:{outcome:string}})=>({data:args.operation==="claim"?[job]:{ok:args.input?.outcome!=="sent"},error:null}));
 expect(await processDeferredMail()).toMatchObject({sent:0,failed:1});expect(mocks.send).toHaveBeenCalledOnce();
 expect(mocks.rpc).toHaveBeenLastCalledWith("notification_deferred_mail",expect.objectContaining({input:{lease_id:lease,outcome:"uncertain"}}));
});
