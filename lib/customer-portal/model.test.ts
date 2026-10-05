import { describe,expect,it } from "vitest";
import { customerObjectInputSchema,customerProfileInputSchema,customerWorkspaceSchema,profileInput,customerOnboardingDraftSchema } from "./model";

const uuid="10000000-0000-4000-8000-000000000001";
const profile={fullName:"Fictieve Klant",email:"login@customer.test",company:"Fictieve organisatie",phone:"0301234567",invoiceEmail:"billing@customer.test",street:"Teststraat 1",postalCode:"1234 AB",city:"Teststad",companyNumber:"",customerVersion:1,contactVersion:1};
const object={id:uuid,number:"OBJ-TEST",name:"Fictieve locatie",type:"office",status:"active",size:100,version:1,street:"Teststraat 1",postalCode:"1234 AB",city:"Teststad",contact:"Fictieve Klant",phone:"0301234567",contactVersion:1,contactRecordVersion:1,services:[],instructions:[]};
const workspace={account:{id:uuid,version:1,canCreateObjects:true,canEditObjects:true,canEditProfile:true,onboardingStep:0,onboardingCompletedAt:null},tenant:{name:"Fictieve leverancier",slug:"fixture",timezone:"Europe/Amsterdam",primaryColor:null,accentColor:null,hasLogo:false,whiteLabel:false,phone:"",planning:true,finance:true,paymentConfigured:false,reports:true,tickets:true},profile,objects:[object],visits:[]};

describe("customer portal strict DTO and self-service inputs",()=>{
 it("accepts only the exact read-only workspace contract",()=>expect(customerWorkspaceSchema.parse(workspace)).toEqual(workspace));
 it.each(["personnel","memberships","audit","ownerUserId","signature","storagePath"])("rejects privileged top-level field %s",field=>expect(()=>customerWorkspaceSchema.parse({...workspace,[field]:"PRIVATE"})).toThrow());
 it.each(["created_by","manageSecrets","manage_secrets","owner_user_id","access_instructions","review_note"])("rejects privileged object field %s",field=>expect(()=>customerWorkspaceSchema.parse({...workspace,objects:[{...object,[field]:"PRIVATE"}]})).toThrow());
 it.each(["response","needsReview","needs_review","staffId","assignedPersonnelId"])("rejects internal visit field %s",field=>expect(()=>customerWorkspaceSchema.parse({...workspace,visits:[{id:uuid,objectId:uuid,number:"BON-TEST",service:"Onderhoud",status:"released",start:null,end:null,actualStart:null,actualEnd:null,version:1,[field]:"PRIVATE"}]})).toThrow());
 it("preserves separate server-owned planned and actual timestamps",()=>{
  const visit={id:uuid,objectId:uuid,number:"BON-TEST",service:"Onderhoud",status:"in_progress",start:"2026-10-05T08:00:00+02:00",end:"2026-10-05T10:00:00+02:00",actualStart:"2026-10-05T08:07:00+02:00",actualEnd:null,version:1};
  expect(customerWorkspaceSchema.parse({...workspace,visits:[visit]}).visits[0]).toEqual(visit);
 });
 it("never allows changing login email, tenant identity or financial terms through profile input",()=>{
  expect(customerProfileInputSchema.parse(profileInput(profile)).company).toBe(profile.company);
  for(const field of ["email","tenantId","customerId","ownerId","paymentTerms","branding"])expect(()=>customerProfileInputSchema.parse({...profileInput(profile),[field]:"FORGED"})).toThrow();
 });
 it("object input cannot grant a binding, vault right, coordinates or an internal instruction",()=>{
  const input={version:0,name:"Fictieve locatie",type:"office",size:null,street:"Teststraat 1",postalCode:"1234 AB",city:"Teststad",contact:"Fictieve Klant",phone:"0301234567",contactVersion:0,contactRecordVersion:0,instruction:"Gewone fictieve instructie"};
  expect(customerObjectInputSchema.parse(input)).toEqual(input);
  for(const field of ["tenantId","customerId","userId","manageSecrets","latitude","longitude","accessInstructions","status"])expect(()=>customerObjectInputSchema.parse({...input,[field]:"FORGED"})).toThrow();
 });
 it("validates integer versions and bounded floor area",()=>{
  expect(()=>customerWorkspaceSchema.parse({...workspace,account:{...workspace.account,version:0}})).toThrow();
  expect(()=>customerWorkspaceSchema.parse({...workspace,objects:[{...object,size:1_000_001}]})).toThrow();
 });
 it("permits an unfinished editable wizard draft, not login email, server baselines or raw metadata",()=>{
  const draft={step:0,version:1,contact:{firstName:"",lastName:"",company:"Fictief",phone:""},object:null,preferences:{appointments:true,reports:true,invoices:true,tickets:true,news:false}};
  expect(customerOnboardingDraftSchema.parse(draft)).toEqual(draft);
  for(const field of ["customerVersion","contactVersion","rawDraft","ownerId"])expect(()=>customerOnboardingDraftSchema.parse({...draft,[field]:"PRIVATE"})).toThrow();
  expect(()=>customerOnboardingDraftSchema.parse({...draft,contact:{...draft.contact,email:"FORGED"}})).toThrow();
 });
});
