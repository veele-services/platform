import { beforeEach,describe,expect,it,vi } from "vitest";
const m=vi.hoisted(()=>({actor:vi.fn(),rpc:vi.fn(),publish:vi.fn(),revalidate:vi.fn()}));
vi.mock("@/lib/objects/auth",()=>({getObjectActor:m.actor}));
vi.mock("@/lib/files/scanned-storage",()=>({publishScannedFile:m.publish}));
vi.mock("next/cache",()=>({revalidatePath:m.revalidate}));
import { saveCustomerVisitRequest,uploadCustomerVisitAttachment } from "./visit-command-action";
import { visitRequestCommand } from "./visit-command-model";
const tenant="10000000-0000-4000-8000-000000000001",account="20000000-0000-4000-8000-000000000001",visit="30000000-0000-4000-8000-000000000001",object="40000000-0000-4000-8000-000000000001",request="50000000-0000-4000-8000-000000000001",command="60000000-0000-4000-8000-000000000001";
const fields={title:"Fictieve instructie",body:"Alleen bij deze afspraak",kind:"attention",priority:"normal",nodeId:"",feedback:""};
const input={accountId:account,visitId:visit,commandId:command,action:{operation:"create",visitVersion:3,fields}};
const detail={visit:{id:visit,objectId:object,number:"WB-TEST",service:"Onderhoud",status:"released",start:null,end:null,actualStart:null,actualEnd:null,version:3},canAddRequest:true,tasks:[],nodes:[],requests:[{id:request,nodeId:null,title:fields.title,body:fields.body,kind:"attention",priority:"normal",feedback:"",status:"received",version:1,createdAt:"2026-10-05T09:00:00Z",updatedAt:"2026-10-05T09:00:00Z",author:"Fictieve klant",response:"",canEdit:true,canWithdraw:true,read:false,documents:[],proposals:[]}]};
const attachment=()=>{const form=new FormData();Object.entries({accountId:account,visitId:visit,requestId:request,commandId:command,version:"1",title:"Fictieve bijlage"}).forEach(([key,value])=>form.set(key,value));form.set("document",new File(["%PDF-1.4\nFICTITIOUS"],"fixture.pdf",{type:"application/pdf"}));return form;};
beforeEach(()=>{
 vi.resetAllMocks();m.actor.mockResolvedValue({tenant:{id:tenant},db:{rpc:m.rpc}});
 m.rpc.mockImplementation(async(name:string)=>({error:null,data:name==="customer_portal_visit"?structuredClone(detail):{requestId:request,version:1,documentId:null}}));
 m.publish.mockImplementation(async(value:{authorize:()=>Promise<void>})=>{await value.authorize();return {};});
});
describe("selected-account Object 360 commands",()=>{
 it("sends the full validated request to the scoped canonical command",async()=>{
  expect(await saveCustomerVisitRequest(input)).toEqual({ok:true});
  expect(m.rpc).toHaveBeenCalledExactlyOnceWith("customer_portal_visit_command",{target_tenant:tenant,target_account:account,target_visit:visit,request_id:command,operation:"create",input:input.action});
  expect(m.revalidate.mock.calls).toEqual([["/klant","layout"],["/app","layout"],["/staff","layout"]]);
 });
 it.each(["tenantId","objectId","userId","path"])("rejects forged %s before auth",async field=>{
  expect((await saveCustomerVisitRequest({...input,[field]:"FORGED"})).ok).toBe(false);expect(m.actor).not.toHaveBeenCalled();
 });
 it("requires exact request/proposal versions and affirmative consent",()=>{
  const action={operation:"accept",requestId:request,version:1,proposalId:command,proposalVersion:2,confirmed:true};
  expect(visitRequestCommand.safeParse({...input,action}).success).toBe(true);
  expect(visitRequestCommand.safeParse({...input,action:{...action,confirmed:false}}).success).toBe(false);
  expect(visitRequestCommand.safeParse({...input,action:{...action,proposalVersion:0}}).success).toBe(false);
 });
 it("preserves conflict feedback and does not invalidate on failed commands",async()=>{
  m.rpc.mockResolvedValueOnce({error:{code:"40001"},data:null});
  expect(await saveCustomerVisitRequest(input)).toMatchObject({ok:false,error:expect.stringContaining("gewijzigd")});expect(m.revalidate).not.toHaveBeenCalled();
 });
 it("scans into a stable own-request path and reauthorizes the same account",async()=>{
  expect(await uploadCustomerVisitAttachment(attachment())).toEqual({ok:true});
  expect(m.publish).toHaveBeenCalledWith(expect.objectContaining({bucket:"object-documents",path:`${tenant}/${object}/${request}-${command}.pdf`,mime:"application/pdf"}));
  expect(m.rpc.mock.calls.filter(([name])=>name==="customer_portal_visit")).toHaveLength(2);
  expect(m.rpc).toHaveBeenLastCalledWith("customer_portal_visit_command",expect.objectContaining({target_account:account,target_visit:visit,request_id:command,operation:"attachment",input:expect.objectContaining({requestId:request,version:1,path:`${tenant}/${object}/${request}-${command}.pdf`})}));
 });
 it("refuses an attachment after a source-version change before publishing",async()=>{
  m.rpc.mockResolvedValueOnce({error:null,data:{...detail,requests:[{...detail.requests[0],version:2}]}});
  expect((await uploadCustomerVisitAttachment(attachment())).ok).toBe(false);expect(m.publish).not.toHaveBeenCalled();
 });
 it("does not attach bytes after account access is revoked during scanning",async()=>{
  m.rpc.mockResolvedValueOnce({error:null,data:detail}).mockResolvedValueOnce({error:{code:"42501"},data:null});
  expect((await uploadCustomerVisitAttachment(attachment())).ok).toBe(false);
  expect(m.rpc.mock.calls.some(([name])=>name==="customer_portal_visit_command")).toBe(false);expect(m.revalidate).not.toHaveBeenCalled();
 });
 it("rejects an upload with a forged path instead of accepting client storage metadata",async()=>{
  const form=attachment();form.set("path","FORGED");expect((await uploadCustomerVisitAttachment(form)).ok).toBe(false);expect(m.actor).not.toHaveBeenCalled();
 });
});
