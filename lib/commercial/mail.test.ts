import {beforeEach,expect,it,vi} from "vitest";
vi.mock("server-only",()=>({}));
const mocks=vi.hoisted(()=>({from:vi.fn(),rpc:vi.fn(),send:vi.fn()}));
vi.mock("@/lib/supabase/admin",()=>({createAdminClient:()=>mocks}));
vi.mock("@/lib/env/server",()=>({getServerEnv:()=>({SENDGRID_API_KEY:"fictional-test-only",SENDGRID_FROM_EMAIL:"test@fieldgrid.test",DEPLOY_TARGET:"local"})}));
vi.mock("@/lib/tenancy/hostname",()=>({tenantAppUrl:(_slug:string,path="")=>`http://127.0.0.1:3000${path}`}));
vi.mock("@/lib/communications/email",()=>({renderTenantEmailHtml:()=>"Fictitious message"}));
vi.mock("@/lib/providers/sendgrid",()=>({sendEmail:mocks.send,SendGridDeliveryError:class extends Error{httpStatus=429;}}));
vi.mock("@/lib/notifications/mail-snapshot",()=>({freezeMailSnapshot:async(_db:unknown,_tenant:string,_id:string,draft:unknown)=>draft,mailSnapshotSchema:{safeParse:()=>({success:false})},mailFailureOutcome:()=>"uncertain",mailFailureMessage:()=>"Provideruitkomst onzeker; niet opnieuw verzenden."}));
vi.mock("@/lib/notifications/mail-template",()=>({resolveMailTemplate:async()=>({title:"Fictitious",body:"Test",variables:[],revision:1,version_id:"00000000-0000-4000-8000-000000000001"}),renderNotificationMailText:(value:string)=>value}));
vi.mock("@/lib/notifications/brand-asset",()=>({freezeEmailLogo:async()=>null}));
vi.mock("@/lib/notifications/deferred-mail",()=>({deferNotificationMail:async()=>false}));
import {flushCommercialMail} from "./mail";

const events=Array.from({length:105},(_,i)=>({id:`event-${i}`,kind:"request.received",mail_snapshot:{subject:`Fictitious message ${i}`,body:"Test",brand:{company:"Fictitious tenant",slug:"test",primary:"#222c35",accent:"#41ac42",logo_path:null},recipients:[{email:"test@fieldgrid.test",audience:"customer",path:"/klant/aanvragen"}]}}));
let updates:Array<Record<string,unknown>>;
let ranges:number[][];
let readError=false;
beforeEach(()=>{
 vi.clearAllMocks();updates=[];ranges=[];readError=false;
 mocks.send.mockResolvedValue({id:"fictional-message"});
 mocks.rpc.mockImplementation(async(_name:string,input:{event_id:string})=>({data:{id:input.event_id,send:true,key:input.event_id},error:null}));
 mocks.from.mockImplementation((table:string)=>{
  let ids:string[]=[];const chain={select:vi.fn(),eq:vi.fn(),or:vi.fn(),not:vi.fn(),order:vi.fn(),in:vi.fn(),range:vi.fn(),update:vi.fn(),then:vi.fn(),single:vi.fn().mockResolvedValue({data:{render_snapshot:{}},error:null})};
  for(const method of ["select","eq","or","not","order"]as const)chain[method].mockReturnValue(chain);
  chain.in.mockImplementation((column:string,values:string[])=>{if(column==="render_snapshot->>event_id")ids=values;return chain;});
  chain.range.mockImplementation(async(start:number,end:number)=>{ranges.push([start,end]);return{data:events.slice(start,end+1),error:readError?{message:"Read unavailable"}:null};});
  chain.update.mockImplementation((value:Record<string,unknown>)=>{updates.push(value);return chain;});
  chain.then.mockImplementation((resolve:(value:unknown)=>unknown)=>resolve({data:table==="mail_deliveries"?ids.filter(id=>id!=="event-104").map(id=>({recipient:"test@fieldgrid.test",render_snapshot:{event_id:id}})):[],error:null}));
  return chain;
 });
});

it("manual retry reaches an older failed event beyond the first page without replaying settled messages",async()=>{
 await flushCommercialMail("tenant","entity",true);
 expect(ranges).toEqual([[0,99],[100,199]]);
 expect(mocks.rpc).toHaveBeenCalledTimes(1);
 expect(mocks.rpc.mock.calls[0][1].event_id).toBe("event-104");
 expect(mocks.send).toHaveBeenCalledTimes(1);expect(updates[0].status).toBe("sent");
 expect(mocks.send.mock.calls[0][0].policy).toEqual({kind:"notification",tenantId:"tenant",type:"request.received",context:"customer",sourceId:"event-104"});
});
it("inline delivery stays bounded and does not scan settled history",async()=>{
 await flushCommercialMail("tenant","entity");expect(ranges).toEqual([[0,11]]);expect(mocks.rpc).not.toHaveBeenCalled();
});
it("a competing delivery claim cannot be sent again",async()=>{
 mocks.rpc.mockResolvedValue({data:{id:"event-104",send:false},error:null});
 await flushCommercialMail("tenant","entity",true);expect(mocks.send).not.toHaveBeenCalled();
});
it("provider uncertainty is retained rather than made retryable",async()=>{
 mocks.send.mockRejectedValue(new Error("Fictitious network interruption"));
 await expect(flushCommercialMail("tenant","entity",true)).rejects.toThrow("Provideruitkomst onzeker");expect(updates[0].status).toBe("uncertain");
});
it("database failures are not reported as a successful retry",async()=>{
 readError=true;await expect(flushCommercialMail("tenant","entity",true)).rejects.toThrow("opgehaald");expect(mocks.send).not.toHaveBeenCalled();
});
