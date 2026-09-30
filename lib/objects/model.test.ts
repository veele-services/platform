import {describe,it,expect} from "vitest";
import {objectSchema,objectTabs,canManageObjects,addressLine} from "./model";
import {localToInstant} from "../planning/time";
import {renderTenantEmailHtml} from "../communications/email";

describe("Object 360 contracts",()=>{
 const input={id:"00000000-0000-4000-8000-000000000001",version:0,customerId:"00000000-0000-4000-8000-000000000002",name:"Testlocatie",type:"office",street:"Teststraat 1",postalCode:"1234 AB",city:"Utrecht",latitude:"",longitude:"",locationDescription:"",instructions:"Melden bij receptie",status:"draft"};
 it("requires a real customer reference and permits a small draft without hierarchy",()=>{
  expect(objectSchema.safeParse(input).success).toBe(true);
  expect(objectSchema.safeParse({...input,customerId:""}).success).toBe(false);
  expect(objectSchema.safeParse({...input,latitude:"91"}).success).toBe(false);
  expect(objectSchema.parse(input).structure).toBe("");
 });
 it("uses twelve stable URL tabs and existing authority",()=>{
  expect(objectTabs).toHaveLength(12);expect(new Set(objectTabs.map(([k])=>k)).size).toBe(12);
  expect(canManageObjects(["planner"])).toBe(true);expect(canManageObjects(["staff"])).toBe(false);expect(canManageObjects([])).toBe(false);
  expect(addressLine({street:"Teststraat 1",postal_code:"1234 AB",city:"Utrecht"})).toBe("Teststraat 1, 1234 AB, Utrecht");
 });
 it("reuses the strict tenant timezone conversion including DST and overnight dates",()=>{
  expect(()=>localToInstant("2027-03-28T02:30","Europe/Amsterdam")).toThrow();
  expect(()=>localToInstant("2027-10-31T02:30","Europe/Amsterdam")).toThrow();
  expect(Date.parse(localToInstant("2027-02-02T01:00","Europe/Amsterdam"))-Date.parse(localToInstant("2027-02-01T23:00","Europe/Amsterdam"))).toBe(7200000);
 });
 it("renders a branded verification email without action credential links or secret values",()=>{
  const html=renderTenantEmailHtml({kind:"object_otp",brand:{company:"Testorganisatie",domain:"example.invalid",primary:"#222c35",accent:"#41ac42",emailLogoUrl:"https://example.invalid/logo.png"},message:{subject:"Verificatie",body:"Je fictieve verificatiecode is 482731."},targetUrl:"https://example.invalid/staff"});
  expect(html).toContain("TIJDELIJKE VERIFICATIECODE");expect(html).toContain("logo.png");expect(html).toContain("482731");expect(html).not.toContain("https://example.invalid/staff");expect(html).not.toContain("Factuur veilig betalen");
 });
});
