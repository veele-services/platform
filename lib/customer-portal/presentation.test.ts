import { describe, expect, it } from "vitest";
import { customerInvoiceLabel,customerInvoiceOverdue,customerInvoicePayable,customerInvoiceSchema,customerReportSchema,customerResourcesSchema,customerVisitFinished,customerVisitLabel,customerInitials } from "./presentation";

const id="10000000-0000-4000-8000-000000000001";
const invoice={id,number:"F-FIXTURE",description:"Fictieve uitvoering",objectIds:[id],issuedOn:"2026-09-01",dueOn:"2026-09-15",total:12100,paid:0,credited:0,balance:12100,status:"sent" as const,hasPdf:true,paymentPending:false};
describe("customer presentation uses verified dimensions, never demo outcomes",()=>{
 it("keeps partial, credited and pending separate from payment confirmation",()=>{
  expect(customerInvoiceLabel({...invoice,paid:1000,balance:11100})).toBe("Deels betaald");
  expect(customerInvoiceLabel({...invoice,paymentPending:true})).toBe("Wacht op bevestiging");
  expect(customerInvoiceLabel({...invoice,status:"credited",credited:12100,balance:0})).toBe("Gecrediteerd");
  expect(customerInvoiceLabel({...invoice,status:"paid",paid:12100,balance:0})).toBe("Betaald");
 });
 it("pays only the server remaining balance and never reserves a second pending checkout",()=>{
  expect(customerInvoicePayable(invoice)).toBe(true);
  expect(customerInvoicePayable({...invoice,paymentPending:true})).toBe(false);
  expect(customerInvoicePayable({...invoice,balance:0})).toBe(false);
  expect(customerInvoicePayable({...invoice,status:"credited"})).toBe(false);
  expect(customerInvoiceOverdue(invoice,"2026-10-05")).toBe(true);
  expect(customerInvoiceOverdue({...invoice,balance:0},"2026-10-05")).toBe(false);
 });
 it("treats execution/review/billing as finished work without making draft planning confirmed",()=>{
  const visit={id,objectId:id,number:"BON-FIXTURE",service:"Onderhoud",status:"approved",start:null,end:null,actualStart:null,actualEnd:null,version:1};
  expect(customerVisitFinished(visit)).toBe(true);expect(customerVisitLabel(visit)).toBe("Uitgevoerd");
  expect(customerVisitLabel({...visit,status:"in_progress"})).toBe("In uitvoering");
 });
 it.each(["staffId","ownerId","assignee","storage_path","providerToken"])("rejects private invoice fields %s",field=>expect(()=>customerInvoiceSchema.parse({...invoice,[field]:"INTERNAL"})).toThrow());
 it("rejects signed/raw staff evidence in a released report summary",()=>{
  const report={id,visitId:id,objectId:id,number:"R-FIXTURE",title:"Fictief rapport",approvedAt:"2026-10-05T08:00:00Z",version:1,summary:"Uitgevoerd",tasks:[]};
  expect(customerReportSchema.parse(report)).toEqual(report);
  for(const field of ["signatures","personnel","employeeEmail","review_note"])expect(()=>customerReportSchema.parse({...report,[field]:"PRIVATE"})).toThrow();
 });
 it("allows only customer-origin navigation, not internal or external notification targets",()=>{
  const base={invoices:[],reports:[],documents:[],requests:[],tickets:[],news:[],activity:[],services:[],unread:0,paymentEnabled:false,now:"2026-10-05T08:00:00Z"};
  expect(customerResourcesSchema.parse(base)).toEqual(base);
  for(const targetPath of ["/app/objecten/test","//foreign.test/klant","https://foreign.test/klant","/staff","/platform"])
   expect(()=>customerResourcesSchema.parse({...base,activity:[{id,title:"Fictieve update",summary:"",createdAt:base.now,readAt:null,version:1,targetPath}]})).toThrow();
 });
 it("derives only the current customer's public initials",()=>expect(customerInitials("Fictieve Klant")).toBe("FK"));
});
