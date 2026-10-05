import { beforeEach,describe,expect,it,vi } from "vitest";
const m=vi.hoisted(()=>({actor:vi.fn(),rpc:vi.fn(),read:vi.fn()}));
vi.mock("server-only",()=>({}));
vi.mock("@/lib/objects/auth",()=>({getObjectActor:m.actor}));
vi.mock("@/lib/files/scanned-storage",()=>({readScannedFile:m.read}));
import { GET } from "./route";
const tenant="10000000-0000-4000-8000-000000000001",account="20000000-0000-4000-8000-000000000001",visit="30000000-0000-4000-8000-000000000001",object="40000000-0000-4000-8000-000000000001",request="50000000-0000-4000-8000-000000000001",document="60000000-0000-4000-8000-000000000001";
const detail={visit:{id:visit,objectId:object,number:"WB-TEST",service:"Onderhoud",status:"released",start:null,end:null,actualStart:null,actualEnd:null,version:3},canAddRequest:true,tasks:[],nodes:[],requests:[{id:request,nodeId:null,title:"Fictief",body:"Eigen verzoek",kind:"attention",priority:"normal",feedback:"",status:"received",version:1,createdAt:"2026-10-05T09:00:00Z",updatedAt:"2026-10-05T09:00:00Z",author:"Fictieve klant",response:"",canEdit:true,canWithdraw:true,read:false,documents:[{id:document,title:"Bijlage",version:1,mime:"application/pdf"}],proposals:[]}]};
const file={path:`${tenant}/${object}/${request}-${document}.pdf`,scope:[tenant,object],name:"fixture.pdf",mime:"application/pdf"};
const call=(query=`account=${account}&order=${visit}`)=>GET(new Request(`https://fixture.staging.fieldgrid.nl/api/customer-portal/visit-files/${document}?${query}`),{params:Promise.resolve({id:document})});
beforeEach(()=>{
 vi.resetAllMocks();m.actor.mockResolvedValue({tenant:{id:tenant},db:{rpc:m.rpc}});
 m.rpc.mockImplementation(async(name:string)=>({error:null,data:name==="customer_portal_visit"?structuredClone(detail):{...file}}));
 m.read.mockResolvedValue({bytes:new Uint8Array([37,80,68,70]),mime:"application/pdf"});
});
describe("selected-account visit attachments",()=>{
 it("rechecks the exact account, visit and file after reading scanned bytes",async()=>{
  const response=await call();expect(response.status).toBe(200);expect(response.headers.get("cache-control")).toContain("no-store");
  expect(m.rpc.mock.calls.map(([name])=>name)).toEqual(["customer_portal_visit","get_object_document","customer_portal_visit","get_object_document"]);
  expect(m.rpc).toHaveBeenCalledWith("customer_portal_visit",{target_tenant:tenant,target_account:account,target_visit:visit});
 });
 it("denies an attachment missing from the selected customer's safe DTO before reading bytes",async()=>{
  m.rpc.mockResolvedValueOnce({error:null,data:{...detail,requests:[]}});expect((await call()).status).toBe(404);expect(m.read).not.toHaveBeenCalled();
 });
 it("discards bytes when access was revoked during the read",async()=>{
  m.rpc.mockResolvedValueOnce({error:null,data:detail}).mockResolvedValueOnce({error:null,data:file}).mockResolvedValueOnce({error:{code:"42501"},data:null});
  const response=await call();expect(response.status).toBe(404);expect(response.headers.get("cache-control")).toContain("no-store");expect(m.read).toHaveBeenCalledOnce();
 });
 it("does not expose files resolved to another object namespace",async()=>{
  m.rpc.mockResolvedValueOnce({error:null,data:detail}).mockResolvedValueOnce({error:null,data:{...file,scope:[tenant,visit]}});
  expect((await call()).status).toBe(404);expect(m.read).not.toHaveBeenCalled();
 });
 it.each([`account=${account}`,`account=${account}&account=${account}&order=${visit}`,`account=${account}&order=${visit}&order=${visit}`])("rejects missing or ambiguous explicit scope %s",async query=>{
  expect((await call(query)).status).toBe(404);expect(m.actor).not.toHaveBeenCalled();
 });
});
