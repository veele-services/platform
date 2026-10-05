import { beforeEach,describe,expect,it,vi } from "vitest";
const mocks=vi.hoisted(()=>({rpc:vi.fn(),actor:vi.fn()}));
vi.mock("server-only",()=>({}));vi.mock("@/lib/objects/auth",()=>({getObjectActor:mocks.actor}));
import { getCustomerPortal,getCustomerPortalBaseSnapshot,getCustomerPortalCoreSnapshot,getCustomerPortalVisit } from "./data";
const tenant="10000000-0000-4000-8000-000000000001",account="10000000-0000-4000-8000-000000000002",foreign="10000000-0000-4000-8000-000000000003",user="10000000-0000-4000-8000-000000000004",session="10000000-0000-4000-8000-000000000005";
const preferences={version:0,groups:{appointments:true,reports:true,invoices:true,tickets:true,news:false}};
const draft={version:1,step:0,contact:{firstName:"Fictieve",lastName:"Klant",company:"Fictieve klant",phone:"0301234567"},object:null,preferences:preferences.groups};
const workspace={account:{id:account,version:1,canCreateObjects:true,canEditObjects:true,canEditProfile:true,onboardingStep:0,onboardingCompletedAt:null},tenant:{name:"Fictieve leverancier",slug:"fixture",timezone:"Europe/Amsterdam",primaryColor:null,accentColor:null,hasLogo:false,whiteLabel:false,phone:"",planning:true,finance:true,paymentConfigured:false,reports:true,tickets:true},profile:{fullName:"Fictieve Klant",email:"login@customer.test",company:"Fictieve klant",phone:"0301234567",invoiceEmail:"billing@customer.test",street:"Teststraat 1",postalCode:"1234 AB",city:"Teststad",companyNumber:"",customerVersion:1,contactVersion:1},objects:[],visits:[]};
beforeEach(()=>{
 vi.clearAllMocks();mocks.actor.mockResolvedValue({tenant:{id:tenant},user:{id:user},sessionId:session,db:{rpc:mocks.rpc}});
 mocks.rpc.mockImplementation(async(name:string)=>({data:({customer_portal_accounts:[{id:account,name:"Fictieve klant"}],customer_portal_workspace:workspace,customer_portal_preferences:preferences,customer_portal_draft:draft,customer_portal_invoices:[],customer_portal_reports:[],customer_portal_requests:[],customer_portal_services:[],customer_portal_news:[],ticket_query:[],customer_portal_activity:{items:[],unread:0},customer_portal_shared_documents:[]} as Record<string,unknown>)[name],error:null}));
});

describe("concrete customer appointment DTO",()=>{
 const visit="10000000-0000-4000-8000-000000000006",site="10000000-0000-4000-8000-000000000007";
 const detail={visit:{id:visit,objectId:site,number:"WO-FIXTURE",service:"Onderhoud",status:"released",start:"2026-10-05T10:00:00Z",end:"2026-10-05T11:00:00Z",actualStart:null,actualEnd:null,version:1},canAddRequest:true,tasks:["Fictieve publieke taak"],nodes:[],requests:[]};
 it("loads only an explicit account and concrete visit on the hostname tenant",async()=>{
  mocks.rpc.mockResolvedValueOnce({data:detail,error:null});expect(await getCustomerPortalVisit(account,visit)).toEqual(detail);expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("customer_portal_visit",{target_tenant:tenant,target_account:account,target_visit:visit});
 });
 it("rejects an accidentally mismatched visit response",async()=>{
  mocks.rpc.mockResolvedValueOnce({data:{...detail,visit:{...detail.visit,id:foreign}},error:null});await expect(getCustomerPortalVisit(account,visit)).rejects.toMatchObject({status:403});
 });
 it.each([{...detail,userId:user},{...detail,visit:{...detail.visit,created_by:user}}])("does not cast richer legacy data to a customer payload",async rich=>{
  mocks.rpc.mockResolvedValueOnce({data:rich,error:null});await expect(getCustomerPortalVisit(account,visit)).rejects.toMatchObject({status:503});
 });
 it("fails closed on revoked account or unpublished visit",async()=>{
  mocks.rpc.mockResolvedValueOnce({data:null,error:{code:"42501"}});await expect(getCustomerPortalVisit(account,visit)).rejects.toMatchObject({status:403});
 });
 it("validates both selectors before actor access",async()=>{
  await expect(getCustomerPortalVisit(account,"invalid")).rejects.toThrow();await expect(getCustomerPortalVisit("invalid",visit)).rejects.toThrow();expect(mocks.actor).not.toHaveBeenCalled();
 });
});
describe("hostname/customer data boundary",()=>{
 it("requires an explicit choice for multiple own accounts",async()=>{
  mocks.rpc.mockResolvedValueOnce({data:[{id:account,name:"Fictieve A"},{id:foreign,name:"Fictieve B"}],error:null});expect((await getCustomerPortal()).workspace).toBeNull();expect(mocks.rpc).toHaveBeenCalledTimes(1);
 });
 it("does not use a requested foreign account as a tenant or fallback",async()=>{
  await expect(getCustomerPortal(foreign)).rejects.toThrow("Geen toegang");expect(mocks.rpc).toHaveBeenCalledTimes(1);
 });
 it("uses only hostname tenant and hashes the presentation actor key",async()=>{
  const data=await getCustomerPortal(account);expect(data.workspace).toEqual(workspace);expect(data.actorKey).toMatch(/^[a-f0-9]{64}$/);expect(data.actorKey).not.toContain(user);expect(mocks.rpc).toHaveBeenLastCalledWith("customer_portal_workspace",{target_tenant:tenant,target_account:account});
 });
 it("rejects a workspace accidentally belonging to a different selected account",async()=>{
  mocks.rpc.mockResolvedValueOnce({data:[{id:account,name:"Fictieve klant"}],error:null}).mockResolvedValueOnce({data:{...workspace,account:{...workspace.account,id:foreign}},error:null});await expect(getCustomerPortal(account)).rejects.toThrow("Geen toegang");
 });
 it("refetches current account access after asynchronous draft/preference reads",async()=>{
  expect(await getCustomerPortalBaseSnapshot(account)).toEqual({workspace,draft,preferences});expect(mocks.rpc).toHaveBeenLastCalledWith("customer_portal_workspace",{target_tenant:tenant,target_account:account});
 });
 it("cannot return the already-loaded draft after current access is revoked",async()=>{
  mocks.rpc.mockImplementation(async(name:string)=>name==="customer_portal_workspace"?{data:null,error:{code:"42501"}}:{data:name==="customer_portal_draft"?draft:preferences,error:null});await expect(getCustomerPortalBaseSnapshot(account)).rejects.toThrow("klanttoegang");
 });
 it("rejects a concept version changed during reads",async()=>{
  mocks.rpc.mockImplementation(async(name:string)=>({data:name==="customer_portal_workspace"?{...workspace,account:{...workspace.account,version:2}}:name==="customer_portal_draft"?draft:preferences,error:null}));await expect(getCustomerPortalBaseSnapshot(account)).rejects.toThrow("tijdens het laden");
 });
 it("does not export raw draft baselines or unknown metadata",async()=>{
  mocks.rpc.mockImplementation(async(name:string)=>({data:name==="customer_portal_workspace"?workspace:name==="customer_portal_draft"?{...draft,_sources:{customerVersion:1}}:preferences,error:null}));await expect(getCustomerPortalBaseSnapshot(account)).rejects.toThrow();
 });
 it("rejects malformed account ID before identity access",async()=>{
  await expect(getCustomerPortalBaseSnapshot("FORGED")).rejects.toThrow();expect(mocks.actor).not.toHaveBeenCalled();
 });
});

describe("current customer domain snapshot",()=>{
 const site="10000000-0000-4000-8000-000000000006",visit="10000000-0000-4000-8000-000000000007",resource="10000000-0000-4000-8000-000000000008";
 const object={id:site,number:"OBJ-FIXTURE",name:"Fictieve locatie",type:"office",status:"active",size:null,version:1,street:"Teststraat 1",postalCode:"1234 AB",city:"Teststad",contact:"Fictieve Klant",phone:"0301234567",contactVersion:1,contactRecordVersion:1,services:[],instructions:[]};
 const report={id:resource,visitId:visit,objectId:site,number:"RPT-FIXTURE",title:"Fictief rapport",approvedAt:"2026-10-05T06:00:00Z",version:1,summary:"Uitgevoerde werkzaamheden",tasks:[]};
 const invoice={id:resource,number:"INV-FIXTURE",description:"Fictieve uitvoering",objectIds:[site],issuedOn:"2026-10-01",dueOn:"2026-10-14",total:1000,paid:200,credited:0,balance:800,status:"partially_paid",hasPdf:true,paymentPending:false};
 const request={id:resource,number:"REQ-FIXTURE",subject:"Fictieve aanvraag",description:"Klantwensen",objectIds:[site],createdAt:"2026-10-05T06:00:00Z",status:"new",frequency:"Eenmalig",preferredOn:null,parts:[{id:resource,number:"REQ-FIXTURE",objectId:site,status:"new"}]};
 const source=(overrides:Record<string,unknown>={})=>mocks.rpc.mockImplementation(async(name:string)=>({data:({customer_portal_workspace:{...workspace,objects:[object]},customer_portal_preferences:preferences,customer_portal_draft:draft,customer_portal_invoices:[invoice],customer_portal_reports:[report],customer_portal_requests:[request],customer_portal_services:[{name:"Onderhoud",description:"Diensten voor je objecten"}],customer_portal_news:[],ticket_query:[],customer_portal_activity:{items:[],unread:0},customer_portal_shared_documents:[],...overrides} as Record<string,unknown>)[name],error:null}));
 it("loads only the exact account using hostname tenant and reauthorizes after parallel reads",async()=>{
  source();const result=await getCustomerPortalCoreSnapshot(account);expect(result.invoices).toEqual([invoice]);expect(result.reports).toEqual([report]);expect(result.requests).toEqual([request]);expect(result.news).toEqual([]);expect(result.now).toMatch(/^\d{4}-/);expect(result.tickets).toEqual([]);expect(result.activity).toEqual({items:[],unread:0});expect(mocks.rpc).toHaveBeenCalledTimes(11);for(const call of mocks.rpc.mock.calls)expect(call[1]).toEqual(call[0]==="ticket_query"?{target_tenant:tenant,actor_context:"customer",operation:"list",payload:{account}}:{target_tenant:tenant,target_account:account});expect(mocks.rpc).toHaveBeenLastCalledWith("customer_portal_workspace",{target_tenant:tenant,target_account:account});
 });
 it("does not disclose already loaded summaries when current account access closes",async()=>{
  source();mocks.rpc.mockImplementation(async(name:string)=>name==="customer_portal_workspace"?{data:null,error:{code:"42501",message:"PRIVATE CANARY"}}:{data:[],error:null});await expect(getCustomerPortalCoreSnapshot(account)).rejects.toMatchObject({status:403});
 });
 it.each(["customer_portal_reports","customer_portal_invoices","customer_portal_requests","customer_portal_news","ticket_query","customer_portal_activity","customer_portal_shared_documents"])("an access denial from %s closes the entire snapshot",async denied=>{
  source();const implementation=mocks.rpc.getMockImplementation()!;mocks.rpc.mockImplementation(async(name:string,...args:unknown[])=>name===denied?{data:null,error:{code:"42501"}}:implementation(name,...args));await expect(getCustomerPortalCoreSnapshot(account)).rejects.toMatchObject({status:403});
 });
 it("distinguishes transient data errors from revoked access",async()=>{
  source();const implementation=mocks.rpc.getMockImplementation()!;mocks.rpc.mockImplementation(async(name:string,...args:unknown[])=>name==="customer_portal_reports"?{data:null,error:{code:"57014",message:"PRIVATE CANARY"}}:implementation(name,...args));await expect(getCustomerPortalCoreSnapshot(account)).rejects.toMatchObject({status:503});
 });
 it.each([
  {customer_portal_reports:[{...report,objectId:foreign}]},
  {customer_portal_invoices:[{...invoice,objectIds:[site,foreign]}]},
  {customer_portal_invoices:[{...invoice,objectIds:[]}]},
  {customer_portal_requests:[{...request,parts:[{...request.parts[0],objectId:foreign}]}]},
  {customer_portal_reports:[{...report,created_by:foreign}]},
  {customer_portal_workspace:{...workspace,objects:[object],tenant:{...workspace.tenant,reports:false}}},
 ])("rejects a raced resource scope or non-allowlisted payload",async overrides=>{source(overrides);await expect(getCustomerPortalCoreSnapshot(account)).rejects.toMatchObject({status:503});});
 it("treats a changed draft version as retryable instead of revoked",async()=>{
  source({customer_portal_draft:{...draft,version:2}});await expect(getCustomerPortalCoreSnapshot(account)).rejects.toMatchObject({status:409});
 });
 it("never accepts a final workspace for another account",async()=>{
  source({customer_portal_workspace:{...workspace,objects:[object],account:{...workspace.account,id:foreign}}});await expect(getCustomerPortalCoreSnapshot(account)).rejects.toMatchObject({status:403});
 });
 it("rejects malformed account input before hostname/auth access",async()=>{
  await expect(getCustomerPortalCoreSnapshot("FORGED")).rejects.toThrow();expect(mocks.actor).not.toHaveBeenCalled();
 });
});
