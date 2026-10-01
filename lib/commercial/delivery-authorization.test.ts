import { expect, it, vi } from "vitest";
vi.mock("server-only",()=>({}));
vi.mock("next/cache",()=>({revalidatePath:vi.fn()}));
const state=vi.hoisted(()=>({revoked:false,rpc:vi.fn(),adminRpc:vi.fn(),read:vi.fn(),update:vi.fn(),send:vi.fn(),from:vi.fn()}));
vi.mock("@/lib/objects/auth",()=>({getObjectActor:async()=>({db:{rpc:state.rpc},admin:{rpc:state.adminRpc,from:state.from},tenant:{id:"a0000000-0000-4000-8000-000000000001",slug:"fixture"},user:{id:"a0000000-0000-4000-8000-000000000002"}})}));
vi.mock("@/lib/env/server",()=>({getServerEnv:()=>({SENDGRID_API_KEY:"FICTITIOUS",SENDGRID_FROM_EMAIL:"fixture@example.test",ADMIN_API_SECRET:"FICTITIOUS"})}));
vi.mock("@/lib/files/scanned-storage",()=>({readScannedFile:state.read,uploadScannedFile:vi.fn()}));
vi.mock("@/lib/providers/sendgrid",()=>({sendEmail:state.send}));
import { sendCommercialQuote } from "@/app/app/commercial-delivery-actions";

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
