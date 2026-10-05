import { beforeEach,describe,expect,it,vi } from "vitest";
const mocks=vi.hoisted(()=>({context:vi.fn(),client:vi.fn(),upload:vi.fn(),revalidate:vi.fn(),metadata:vi.fn(),stats:vi.fn(),update:vi.fn(),current:vi.fn(),saved:vi.fn(),filters:[] as Array<[string,unknown]>}));
vi.mock("@/lib/auth/context",()=>({getAuthContext:mocks.context}));
vi.mock("@/lib/supabase/server",()=>({createClient:mocks.client}));
vi.mock("@/lib/files/scanned-storage",()=>({uploadScannedFile:mocks.upload}));
vi.mock("next/cache",()=>({revalidatePath:mocks.revalidate}));
vi.mock("sharp",()=>({default:()=>({metadata:mocks.metadata,stats:mocks.stats})}));
import { saveTenantHouseStyle } from "./house-style-actions";

const tenant="10000000-0000-4000-8000-000000000001",stamp="2026-10-05T09:00:00.123456+00:00",nextStamp="2026-10-05T09:00:00.223456+00:00";
const values={primaryColor:"#214E72",accentColor:"#C65D21",senderName:"Fictieve leverancier",senderEmail:"",expectedUpdatedAt:stamp,logoAction:"keep"};
const form=(extra:Record<string,string|File>={})=>{const data=new FormData();Object.entries({...values,...extra}).forEach(([key,value])=>data.set(key,value));return data;};
const file=()=>new File(["FICTITIOUS scanned image bytes"],"fixture.png",{type:"image/png"});
beforeEach(()=>{
 vi.clearAllMocks();mocks.filters=[];
 mocks.context.mockResolvedValue({tenant:{id:tenant,roles:["management"]}});
 mocks.current.mockResolvedValue({data:{logo_path:`${tenant}/old-logo.png`,updated_at:stamp},error:null});
 mocks.saved.mockResolvedValue({data:{updated_at:nextStamp},error:null});
 mocks.metadata.mockResolvedValue({format:"png",width:100,height:100,pages:1});mocks.stats.mockResolvedValue({});mocks.upload.mockResolvedValue({});
 const query={select:()=>query,eq:(key:string,value:unknown)=>{mocks.filters.push([key,value]);return query;},single:mocks.current,update:(input:unknown)=>{mocks.update(input);return query;},maybeSingle:mocks.saved};
 mocks.client.mockResolvedValue({from:()=>query});
});
describe("tenant house style atomic server action",()=>{
 it("preserves existing logo and checks hostname tenant plus the exact saved timestamp",async()=>{
  const result=await saveTenantHouseStyle(form());expect(result).toMatchObject({ok:true,updatedAt:nextStamp});
  expect(mocks.update).toHaveBeenCalledExactlyOnceWith({primary_color:"#214e72",accent_color:"#c65d21",sender_name:values.senderName,sender_email:null,logo_path:`${tenant}/old-logo.png`});
  expect(mocks.filters).toEqual([["tenant_id",tenant],["tenant_id",tenant],["updated_at",stamp]]);
  expect(mocks.context).toHaveBeenCalledTimes(2);expect(mocks.revalidate.mock.calls).toEqual([["/app","layout"],["/staff","layout"],["/klant","layout"],["/login"]]);
 });
 it("logo removal only clears current metadata without deleting historical Storage bytes",async()=>{
  expect(await saveTenantHouseStyle(form({logoAction:"remove"}))).toEqual({ok:true,updatedAt:nextStamp,logoUrl:null});
  expect(mocks.update.mock.calls[0][0].logo_path).toBeNull();expect(mocks.upload).not.toHaveBeenCalled();
 });
 it("decodes and scans new bounded logo bytes before the atomic metadata mutation",async()=>{
  expect((await saveTenantHouseStyle(form({logo:file()}))).ok).toBe(true);
  expect(mocks.metadata).toHaveBeenCalledOnce();expect(mocks.stats).toHaveBeenCalledOnce();
  expect(mocks.upload).toHaveBeenCalledOnce();expect(mocks.upload.mock.calls[0][1]).toBe("branding");
  expect(mocks.upload.mock.calls[0][2]).toMatch(new RegExp(`^${tenant}/logo-[a-f0-9-]{36}\\.png$`));
  expect(mocks.update.mock.calls[0][0].logo_path).toBe(mocks.upload.mock.calls[0][2]);
  expect(mocks.update.mock.invocationCallOrder[0]).toBeGreaterThan(mocks.upload.mock.invocationCallOrder[0]);
 });
 it.each(["staff","planner","hr","finance"])("denies %s before Storage and metadata side effects",async role=>{
  mocks.context.mockResolvedValueOnce({tenant:{id:tenant,roles:[role]}});expect((await saveTenantHouseStyle(form())).ok).toBe(false);
  expect(mocks.client).not.toHaveBeenCalled();expect(mocks.update).not.toHaveBeenCalled();expect(mocks.upload).not.toHaveBeenCalled();
 });
 it("does not use platform-admin status to bypass explicit tenant-management membership",async()=>{
  mocks.context.mockResolvedValueOnce({isPlatformAdmin:true,tenant:null});expect((await saveTenantHouseStyle(form())).ok).toBe(false);expect(mocks.update).not.toHaveBeenCalled();
 });
 it.each(["tenantId","logo_path","logoUrl","iban","whiteLabelEnabled"])("rejects forged %s before identity resolution",async key=>{
  expect((await saveTenantHouseStyle(form({[key]:"FORGED"}))).ok).toBe(false);expect(mocks.context).not.toHaveBeenCalled();
 });
 it("rejects duplicate fields rather than choosing an attacker-controlled value",async()=>{
  const data=form();data.append("primaryColor","#000000");expect((await saveTenantHouseStyle(data)).ok).toBe(false);expect(mocks.context).not.toHaveBeenCalled();
 });
 it("conflicts before any upload when the initial saved source has changed",async()=>{
  mocks.current.mockResolvedValueOnce({data:{logo_path:null,updated_at:nextStamp},error:null});
  expect(await saveTenantHouseStyle(form({logo:file()}))).toMatchObject({ok:false,conflict:true});expect(mocks.upload).not.toHaveBeenCalled();expect(mocks.update).not.toHaveBeenCalled();
 });
 it("keeps caller drafts rather than confirming a CAS race during scan/upload",async()=>{
  mocks.saved.mockResolvedValueOnce({data:null,error:null});expect(await saveTenantHouseStyle(form({logo:file()}))).toMatchObject({ok:false,conflict:true});expect(mocks.revalidate).not.toHaveBeenCalled();
 });
 it("rechecks revoked membership after upload and before metadata mutation",async()=>{
  mocks.context.mockResolvedValueOnce({tenant:{id:tenant,roles:["management"]}}).mockResolvedValueOnce({tenant:{id:tenant,roles:["staff"]}});
  expect((await saveTenantHouseStyle(form({logo:file()}))).ok).toBe(false);expect(mocks.upload).toHaveBeenCalledOnce();expect(mocks.update).not.toHaveBeenCalled();
 });
 it("fails closed if tenant context changes during asynchronous work",async()=>{
  mocks.context.mockResolvedValueOnce({tenant:{id:tenant,roles:["management"]}}).mockResolvedValueOnce({tenant:{id:"10000000-0000-4000-8000-000000000002",roles:["management"]}});
  expect((await saveTenantHouseStyle(form({logo:file()}))).ok).toBe(false);expect(mocks.update).not.toHaveBeenCalled();
 });
 it.each(["image/svg+xml","text/html"])("rejects declared %s without any upload",async type=>{
  expect((await saveTenantHouseStyle(form({logo:new File(["bad"],"bad",{type})}))).ok).toBe(false);expect(mocks.upload).not.toHaveBeenCalled();
 });
 it("rejects oversize logos before decoding or scanning",async()=>{
  expect((await saveTenantHouseStyle(form({logo:new File([new Uint8Array(2*1024*1024+1)],"big.png",{type:"image/png"})}))).ok).toBe(false);expect(mocks.metadata).not.toHaveBeenCalled();expect(mocks.upload).not.toHaveBeenCalled();
 });
 it("rejects invalid full image decoding despite plausible header metadata",async()=>{
  mocks.stats.mockRejectedValueOnce(new Error("PRIVATE decoder CANARY"));expect((await saveTenantHouseStyle(form({logo:file()}))).ok).toBe(false);expect(mocks.upload).not.toHaveBeenCalled();
 });
 it("does not bypass scanner errors or disclose private scanner/provider details",async()=>{
  mocks.upload.mockRejectedValueOnce(new Error("PRIVATE CANARY"));const result=await saveTenantHouseStyle(form({logo:file()}));
  expect(result.ok).toBe(false);expect(JSON.stringify(result)).not.toContain("PRIVATE");expect(mocks.update).not.toHaveBeenCalled();
 });
});
