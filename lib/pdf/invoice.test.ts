import {it,expect,vi} from "vitest";
import {PDFDocument} from "pdf-lib";
import sharp from "sharp";
vi.mock("server-only",()=>({}));
import {renderInvoicePdf} from "./invoice";

it("keeps every downstream quote line and paginates instead of dropping lines after 22",async()=>{
 const bytes=await renderInvoicePdf({invoiceNumber:"FICTITIOUS-INVOICE",issuedOn:"2026-09-30",dueOn:"2026-10-30",tenantName:"Fictitious tenant",customerName:"Fictitious customer",billingAddress:{},lines:Array.from({length:100},(_,i)=>({description:`Fictitious line ${i+1} with a full agreed scope`,quantity:1,unitPriceCents:100,vatBasisPoints:0,totalCents:100})),subtotalCents:10000,vatCents:0,totalCents:10000,accentColor:"#41ac42"});
 expect((await PDFDocument.load(bytes)).getPageCount()).toBeGreaterThan(3);
});

it("renders a real tenant logo and falls back to Fieldgrid for a damaged historical image",async()=>{
 const input={invoiceNumber:"FICTITIOUS-CONCEPT",concept:true,issuedOn:"2026-10-06",dueOn:"2026-10-20",tenantName:"Fictitious issuer",customerName:"Fictitious customer",billingAddress:{},lines:[{description:"Approved work",quantity:2,unitPriceCents:1200,vatBasisPoints:2100,totalCents:2904,subtotalCents:2400,vatCents:504}],subtotalCents:2400,vatCents:504,totalCents:2904};
 const logo=await sharp({create:{width:240,height:80,channels:3,background:"#214e72"}}).png().toBuffer();
 const branded=await PDFDocument.load(await renderInvoicePdf({...input,logo}));expect(branded.getTitle()).toBe("Conceptfactuur FICTITIOUS-CONCEPT");expect(branded.getPageCount()).toBe(1);
 const fallback=await PDFDocument.load(await renderInvoicePdf({...input,logo:Buffer.from("damaged historical image")}),{updateMetadata:false});expect(fallback.getPageCount()).toBe(1);expect(fallback.getProducer()).toBe("Fieldgrid");
});

it("keeps a typical three-line invoice with both company identities and purchase references on one page",async()=>{
 const bytes=await renderInvoicePdf({invoiceNumber:"FACT-2026-000042",issuedOn:"2026-10-07",dueOn:"2026-11-06",tenantName:"Fictieve dienstverlening B.V.",customerName:"Fictieve klant B.V.",billingAddress:{street:"Testplein 28",postal_code:"1234 AB",city:"Utrecht"},sender:{address:{street:"Teststraat 12",postal_code:"5678 CD",city:"Den Haag"},companyNumber:"12345678",vatNumber:"NL123456789B01",iban:"NL00 TEST 0000 0000 00",email:"admin@example.test",phone:"070 000 0000"},recipient:{companyNumber:"87654321",vatNumber:"NL987654321B01"},reference:"PO-2026-123",costCenter:"Locatie Utrecht",lines:Array.from({length:3},()=>({description:"Periodiek onderhoud volgens overeengekomen werkprogramma",quantity:1,unit:"uur",unitPriceCents:10000,vatBasisPoints:2100,subtotalCents:10000,vatCents:2100,totalCents:12100})),subtotalCents:30000,vatCents:6300,totalCents:36300});
 expect((await PDFDocument.load(bytes)).getPageCount()).toBe(1);
});
