import { beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only",()=>({}));
vi.mock("next/cache",()=>({revalidatePath:vi.fn()}));
const state=vi.hoisted(()=>({revoked:false,rpc:vi.fn(),adminRpc:vi.fn(),read:vi.fn(),update:vi.fn(),send:vi.fn(),from:vi.fn(),permission:vi.fn(),permissions:null as string[]|null}));
vi.mock("@/lib/objects/auth",()=>({getObjectActor:async()=>({db:{rpc:state.rpc},admin:{rpc:state.adminRpc,from:state.from},tenant:{id:"a0000000-0000-4000-8000-000000000001",slug:"fixture"},user:{id:"a0000000-0000-4000-8000-000000000002"}})}));
vi.mock("@/lib/env/server",()=>({getServerEnv:()=>({SENDGRID_API_KEY:"FICTITIOUS",SENDGRID_FROM_EMAIL:"fixture@example.test",ADMIN_API_SECRET:"FICTITIOUS"})}));
vi.mock("@/lib/files/scanned-storage",()=>({readScannedFile:state.read,uploadScannedFile:vi.fn()}));
vi.mock("@/lib/providers/sendgrid",()=>({sendEmail:state.send}));
vi.mock("@/lib/management/auth",()=>({requireBackofficePermission:state.permission}));
import { sendCommercialQuote, uploadCommercialAttachment } from "@/app/app/commercial-delivery-actions";

beforeEach(()=>{
 vi.clearAllMocks();state.revoked=false;state.permissions=null;
 state.permission.mockImplementation(async()=>({tenant:{id:"a0000000-0000-4000-8000-000000000001",roles:["tenant_admin"],permissions:state.permissions},user:{id:"a0000000-0000-4000-8000-000000000002"}}));
});

it("denies sending or uploading before any resource or provider work when the role is read only",async()=>{
 state.permission.mockRejectedValue(new Error("Je rol geeft geen toegang tot deze functie."));
 expect(await sendCommercialQuote("a0000000-0000-4000-8000-000000000003","a0000000-0000-4000-8000-000000000004",true)).toEqual({ok:false,error:"Je rol geeft geen toegang tot deze functie."});
 expect(await uploadCommercialAttachment(new FormData())).toEqual({ok:false,error:"Je rol geeft geen toegang tot deze functie."});
 expect(state.rpc).not.toHaveBeenCalled();expect(state.from).not.toHaveBeenCalled();expect(state.send).not.toHaveBeenCalled();
});

it("requires the individual delivery function even with commercial write permission",async()=>{
 state.permissions=["backoffice.access","backoffice.commercial.write"];
 expect((await sendCommercialQuote("a0000000-0000-4000-8000-000000000003","a0000000-0000-4000-8000-000000000004",true)).ok).toBe(false);
 expect(state.rpc).not.toHaveBeenCalled();expect(state.from).not.toHaveBeenCalled();
});

it("rechecks the initiating caller after a delayed read of an existing quote PDF before any mail claim or write",async()=>{
 state.revoked=false;
 const quote={id:"a0000000-0000-4000-8000-000000000003",quote_number:"FICTITIOUS",status:"awaiting_acceptance",version:1,archived_at:null,superseded_at:null,
 expires_at:new Date(Date.now()+86400000).toISOString(),published_at:new Date().toISOString(),snapshot:{contact:{email:"fixture@example.test"},brand:{logo_source:null}},pdf_path:null,logo_path:null};
 state.rpc.mockImplementation(async()=>state.revoked?{data:null,error:{code:"42501"}}:{data:{record:quote},error:null});
 state.from.mockImplementation(()=>{const q={select:()=>q,eq:()=>q,single:async()=>({data:quote,error:null}),maybeSingle:async()=>({data:null,error:null}),update:state.update};return q;});
 let release!:()=>void,entered!:()=>void;
 const gate=new Promise<void>(r=>{release=r;}),reading=new Promise<void>(r=>{entered=r;});
 state.read.mockImplementation(async()=>{entered();await gate;return{bytes:Buffer.from("%PDF-FICTITIOUS"),mime:"application/pdf"};});
 const attempt=sendCommercialQuote(quote.id,"a0000000-0000-4000-8000-000000000004");
 await reading;state.revoked=true;release();
 expect(await attempt).toEqual({ok:false,error:"Je toegang is gewijzigd. De offerte is niet verzonden."});
 expect(state.rpc).toHaveBeenCalledTimes(2);expect(state.update).not.toHaveBeenCalled();expect(state.adminRpc).not.toHaveBeenCalled();expect(state.send).not.toHaveBeenCalled();
});

it("rechecks the write permission after a delayed PDF read",async()=>{
 const quote={id:"a0000000-0000-4000-8000-000000000003",quote_number:"FICTITIOUS",status:"awaiting_acceptance",version:1,archived_at:null,superseded_at:null,
 expires_at:new Date(Date.now()+86400000).toISOString(),published_at:new Date().toISOString(),snapshot:{contact:{email:"fixture@example.test"},brand:{logo_source:null}},pdf_path:null,logo_path:null};
 state.rpc.mockResolvedValue({data:{record:quote},error:null});
 state.from.mockImplementation(()=>{const q={select:()=>q,eq:()=>q,single:async()=>({data:quote,error:null}),maybeSingle:async()=>({data:null,error:null}),update:state.update};return q;});
 state.read.mockImplementation(async()=>{state.permission.mockRejectedValue(new Error("Je rol geeft geen toegang tot deze functie."));return{bytes:Buffer.from("%PDF-FICTITIOUS"),mime:"application/pdf"};});
 expect((await sendCommercialQuote(quote.id,"a0000000-0000-4000-8000-000000000004")).ok).toBe(false);
 expect(state.permission).toHaveBeenCalledTimes(2);expect(state.update).not.toHaveBeenCalled();expect(state.adminRpc).not.toHaveBeenCalled();expect(state.send).not.toHaveBeenCalled();
});
