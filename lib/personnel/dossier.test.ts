import { describe, expect, it } from "vitest";
import { businessToday, calendarMonths, certificateValidity, contractDeadlines, currentContract, dossierSignals, employmentStatus, noticeDeadline, privacyText, validateDossierInput, type DossierRecord } from "./dossier";

describe("Personeelsdossier business rules",()=>{
 it("respects the existing archive action without changing an account or losing history",()=>{
  expect(employmentStatus("inactive","active")).toBe("archived");
  expect(employmentStatus("former","active")).toBe("former");
  expect(employmentStatus("former","archived")).toBe("archived");
  expect(employmentStatus("active","leaving")).toBe("leaving");
 });
 it("tracks distinct contract deadlines and stops warning about an evidenced notice",()=>{
  const contract={employmentType:"fixed",noticePolicy:"applicable",startsOn:"2027-01-01",endsOn:"2027-12-31",probationUntil:"2027-02-28",reviewOn:"2027-10-01"};
  expect(contractDeadlines(contract).map(d=>d.date)).toEqual(["2027-02-28","2027-10-01","2027-11-30","2027-12-31"]);
  expect(contractDeadlines({...contract,writtenNoticeOn:"2027-11-01"}).some(d=>d.label==="Aanzegging")).toBe(false);
 });
 it("uses Dutch business dates across midnight and DST",()=>{
  expect(businessToday(new Date("2026-03-28T23:30:00Z"))).toBe("2026-03-29");
  expect(businessToday(new Date("2026-10-24T22:30:00Z"))).toBe("2026-10-25");
 });
 it("subtracts calendar months and clamps month ends",()=>{
  expect(calendarMonths("2027-03-31",-1)).toBe("2027-02-28");
  expect(calendarMonths("2028-03-31",-1)).toBe("2028-02-29");
  expect(calendarMonths("2026-01-31",1)).toBe("2026-02-28");
 });
 it("only gives a notice deadline with confirmed applicability and at least six calendar months",()=>{
  const contract={employmentType:"fixed",noticePolicy:"applicable",startsOn:"2026-10-01",endsOn:"2027-03-31"};
  expect(noticeDeadline(contract)).toBe("2027-02-28");
  expect(noticeDeadline({...contract,endsOn:"2027-03-30"})).toBeNull();
  expect(noticeDeadline({...contract,noticePolicy:"review"})).toBeNull();
  expect(noticeDeadline({...contract,noticePolicy:"exempt"})).toBeNull();
  expect(noticeDeadline({...contract,employmentType:"permanent"})).toBeNull();
  expect(noticeDeadline({...contract,employmentType:"hire"})).toBeNull();
 });
 it("keeps verification separate from inclusive validity and future starts",()=>{
  expect(certificateValidity({startsOn:"2027-01-01"},"2026-12-31")).toBe("Nog niet geldig");
  expect(certificateValidity({},"2027-01-01")).toBe("Geen einddatum");
  expect(certificateValidity({endsOn:"2027-01-01"},"2027-01-01")).toBe("Verloopt binnenkort");
  expect(certificateValidity({endsOn:"2027-01-01"},"2027-01-02")).toBe("Verlopen");
  expect(certificateValidity({endsOn:"2027-12-31"},"2027-01-01")).toBe("Geldig");
 });
 it("drafts tolerate missing mandatory fields but not invalid dates",()=>{
  expect(validateDossierInput("contract",{},"draft").startsOn).toBe("");
  expect(()=>validateDossierInput("contract",{startsOn:"2027-02-30"},"draft")).toThrow();
  expect(()=>validateDossierInput("contract",{employmentType:"fixed",title:"Contract",startsOn:"2027-01-01"},"active")).toThrow("einddatum");
 });
 it("permanent agreements do not retain obsolete end dates",()=>{
  const data=validateDossierInput("contract",{title:"Vast",startsOn:"2027-01-01",endsOn:"2027-12-31",employmentType:"permanent",noticePolicy:"applicable"},"active");
  expect(data.endsOn).toBe("");expect(data.noticePolicy).toBe("exempt");
 });
 it("a written notice, signature and completed task require actual evidence",()=>{
  expect(()=>validateDossierInput("contract",{signatureStatus:"signed"},"draft")).toThrow("ondertekende bewijs");
  expect(()=>validateDossierInput("contract",{writtenNoticeOn:"2027-01-01",noticeEvidence:"E-mail"},"draft")).toThrow("bewijs");
  expect(()=>validateDossierInput("task",{title:"Return"},"completed")).toThrow("opvolging");
  expect(()=>validateDossierInput("certificate",{code:"TEST",title:"Test"},"approved")).toThrow("gecontroleerd");
 });
 it("VOG uses a seen-on control record without upload fields or fixed expiry",()=>{
  expect(()=>validateDossierInput("certificate",{code:"VOG",title:"VOG"},"unverified")).toThrow("VOG-controle");
  expect(()=>validateDossierInput("vog",{},"seen")).toThrow("wanneer");
  const record=validateDossierInput("vog",{startsOn:"2027-01-01",document_ids:["random"],endsOn:"2028-01-01"},"seen");
  expect(record.document_ids).toBeUndefined();expect(record.endsOn).toBeUndefined();
 });
 it("rejects obvious prohibited content and invalid explicit reminder recipients",()=>{
  for(const text of ["BSN 123","diagnose","medicatie","alarmcode 123","wachtwoord geheim"])expect(()=>privacyText(text)).toThrow();
  expect(()=>validateDossierInput("task",{title:"Taak",reminderEmails:"invalid"},"open")).toThrow("adressen");
  expect(()=>validateDossierInput("task",{title:"Taak",reminderDays:"-1,999"},"open")).toThrow("herinneringsmomenten");
  const record=validateDossierInput("task",{title:"Taak",reminderEmails:"A@example.test,a@example.test",reminderDays:"30,30,0"},"open");
  expect(record.reminderEmails).toBe("a@example.test");expect(record.reminderDays).toBe("30,0");
 });
 it("handles generated null metadata without treating null as a UUID",()=>{
  expect(validateDossierInput("task",{title:"Taak",ownerId:null,dueOn:null},"open").ownerId).toBe("");
 });
 it("does not treat a future issue date as already valid when start is omitted",()=>{
  const values=validateDossierInput("certificate",{code:"TEST",title:"Bewijs",issuedOn:"2090-01-01"},"unverified");
  expect(values.startsOn).toBe("2090-01-01");
  expect(certificateValidity(values,"2027-01-01")).toBe("Nog niet geldig");
 });
 it("selects current effective contract and excludes completed tasks from signals",()=>{
  const make=(id:string,status:string,kind:DossierRecord["kind"],data:DossierRecord["data"]):DossierRecord=>({id,status,kind,data,title:id,previousId:null,revision:1,updatedAt:"2027-01-01",dueOn:null});
  const records=[make("current","active","contract",{startsOn:"2027-01-01",endsOn:"2027-06-30"}),make("future","active","contract",{startsOn:"2027-07-01"}),make("done","completed","task",{dueOn:"2027-01-15"}),make("todo","open","task",{dueOn:"2027-01-15"}),make("draft","draft","contract",{startsOn:"2027-01-01",endsOn:"2027-01-15"})];
  expect(currentContract(records,"2027-03-01")?.id).toBe("current");
  expect(dossierSignals(records,"2027-03-01").map(r=>r.id)).toContain("todo");
  expect(dossierSignals(records,"2027-03-01").map(r=>r.id)).not.toContain("done");
  expect(dossierSignals(records,"2027-03-01").map(r=>r.id)).not.toContain("draft");
 });
});
