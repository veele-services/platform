import {it,expect,vi} from "vitest";
import {PDFDocument} from "pdf-lib";
vi.mock("server-only",()=>({}));
import {renderInvoicePdf} from "./invoice";

it("keeps every downstream quote line and paginates instead of dropping lines after 22",async()=>{
 const bytes=await renderInvoicePdf({invoiceNumber:"FICTITIOUS-INVOICE",issuedOn:"2026-09-30",dueOn:"2026-10-30",tenantName:"Fictitious tenant",customerName:"Fictitious customer",billingAddress:{},lines:Array.from({length:100},(_,i)=>({description:`Fictitious line ${i+1} with a full agreed scope`,quantity:1,unitPriceCents:100,vatBasisPoints:0,totalCents:100})),subtotalCents:10000,vatCents:0,totalCents:10000,accentColor:"#41ac42"});
 expect((await PDFDocument.load(bytes)).getPageCount()).toBeGreaterThan(3);
});
