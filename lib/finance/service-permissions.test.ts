import { beforeEach, expect, it, vi } from "vitest";
const mocks=vi.hoisted(()=>({auth:vi.fn(),from:vi.fn(),admin:vi.fn(),provider:vi.fn(),attachment:vi.fn(),update:vi.fn(),items:vi.fn(),token:vi.fn()}));
vi.mock("server-only",()=>({}));
vi.mock("next/cache",()=>({revalidatePath:vi.fn()}));
vi.mock("@/lib/auth/context",()=>({getAuthContext:mocks.auth,hasAnyRole:()=>true}));
vi.mock("@/lib/supabase/server",()=>({createClient:async()=>({from:mocks.from})}));
vi.mock("@/lib/supabase/admin",()=>({createAdminClient:mocks.admin}));
vi.mock("@/lib/providers/sendgrid",()=>({sendEmail:mocks.provider,SendGridDeliveryError:class extends Error{}}));
vi.mock("@/lib/env/server",()=>({getServerEnv:()=>({SENDGRID_API_KEY:"fake",SENDGRID_FROM_EMAIL:"sender@example.test"})}));
vi.mock("@/lib/pdf/invoice",()=>({renderInvoicePdf:vi.fn()}));
vi.mock("@/lib/notifications/mail-attachment",()=>({readMailAttachment:mocks.attachment}));
vi.mock("@/lib/notifications/deferred-mail",()=>({deferNotificationMail:async()=>false,retryDeferredDocumentMail:async()=>false}));
vi.mock("@/lib/tenancy/hostname",()=>({tenantAppUrl:(_slug:string,path:string="")=>`https://tenant.example.test${path}`}));
import { createPaymentBundle, sendInvoice } from "@/app/app/finance-actions";
const invoiceId="11111111-1111-4111-8111-111111111111";
const keys=["backoffice.access","backoffice.finance.write","backoffice.functions.send_invoice","backoffice.functions.create_payment_bundle"];
function context(permissions=keys){return{user:{id:"actor"},tenant:{id:"tenant",slug:"tenant",enabledServices:["finance"],permissions}};}
const frozen={fromEmail:"sender@example.test",fromName:"Tenant",to:"customer@example.test",subject:"Factuur",text:"Factuur",html:"Factuur",targetUrl:"https://tenant.example.test/pay/token",templateRevision:1,attachmentPath:"tenant/invoice.pdf",attachmentFilename:"invoice.pdf"};
function query(data:unknown){return{select:vi.fn().mockReturnThis(),eq:vi.fn().mockReturnThis(),in:vi.fn().mockReturnThis(),or:vi.fn().mockReturnThis(),order:vi.fn().mockReturnThis(),limit:vi.fn().mockReturnThis(),insert:vi.fn().mockReturnThis(),update:vi.fn().mockReturnThis(),maybeSingle:async()=>({data,error:null}),single:async()=>({data,error:null}),then:(resolve:(value:{data:unknown;error:null})=>void)=>resolve({data,error:null})};}
beforeEach(()=>{
 vi.clearAllMocks();mocks.auth.mockResolvedValue(context());
 mocks.from.mockImplementation((table:string)=>{
   if(table==="invoices")return query({id:invoiceId,pdf_storage_path:"tenant/invoice.pdf",invoice_number:"F-1",customer_id:"customer",customer_snapshot:{}});
   if(table==="customers")return query({id:"customer",billing_email:"customer@example.test"});
   if(table==="invoice_groups")return query({id:"group"});
   if(table==="invoice_group_items")return{insert:mocks.items};
   return query(null);
 });
 mocks.items.mockResolvedValue({error:null});mocks.token.mockResolvedValue({error:null});
 mocks.update.mockReturnValue(query(null));
 mocks.admin.mockImplementation(()=>({from:(table:string)=>table==="external_action_tokens"?{insert:mocks.token}:{...query({id:"delivery",status:"failed",idempotency_key:"invoice-stable",render_snapshot:{delivery:frozen}}),update:mocks.update},rpc:()=>query({should_send:true,delivery_id:"delivery"})}));
 mocks.attachment.mockResolvedValue({filename:"invoice.pdf",bytes:new Uint8Array()});mocks.provider.mockResolvedValue({id:"sent"});
});
it.each(["send_invoice","create_payment_bundle"])("requires the concrete %s right before document or service IO",async capability=>{
 mocks.auth.mockResolvedValue(context(["backoffice.access","backoffice.finance.write"]));
 expect((await(capability==="send_invoice"?sendInvoice(new FormData()):createPaymentBundle(new FormData()))).ok).toBe(false);
 expect(mocks.from).not.toHaveBeenCalled();expect(mocks.admin).not.toHaveBeenCalled();expect(mocks.provider).not.toHaveBeenCalled();
});
it("does not send when invoice rights change during attachment IO",async()=>{
 mocks.attachment.mockImplementation(async()=>{mocks.auth.mockResolvedValue(context(["backoffice.access","backoffice.finance.write"]));return{};});
 const form=new FormData();form.set("invoiceId",invoiceId);
 expect((await sendInvoice(form)).ok).toBe(false);
 expect(mocks.attachment).toHaveBeenCalled();expect(mocks.provider).not.toHaveBeenCalled();
 expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({status:"failed"}));
});
it("does not issue a payment token after rights are revoked during group IO",async()=>{
 const original=mocks.from.getMockImplementation()!;
 mocks.from.mockImplementation((table:string)=>table==="invoices"?query([{id:invoiceId,customer_id:"customer",total_cents:10000,paid_cents:0,status:"final"}]):original(table));
 mocks.items.mockImplementation(async()=>{mocks.auth.mockResolvedValue(context(["backoffice.access","backoffice.finance.write"]));return{error:null};});
 const form=new FormData();form.set("invoiceIds",invoiceId);
 expect((await createPaymentBundle(form)).ok).toBe(false);
 expect(mocks.items).toHaveBeenCalled();expect(mocks.admin).not.toHaveBeenCalled();expect(mocks.token).not.toHaveBeenCalled();
});
it("does not issue a payment token if the initiating user changes",async()=>{
 const original=mocks.from.getMockImplementation()!;
 mocks.from.mockImplementation((table:string)=>table==="invoices"?query([{id:invoiceId,customer_id:"customer",total_cents:10000,paid_cents:0,status:"final"}]):original(table));
 mocks.items.mockImplementation(async()=>{mocks.auth.mockResolvedValue({...context(),user:{id:"other-user"}});return{error:null};});
 const form=new FormData();form.set("invoiceIds",invoiceId);
 expect((await createPaymentBundle(form)).ok).toBe(false);
 expect(mocks.token).not.toHaveBeenCalled();
});
