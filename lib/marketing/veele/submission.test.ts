import { describe, expect, it } from "vitest";
// @ts-expect-error The retained website contract is a vanilla browser module.
import { buildInquiry, validateState, summaryGroups } from "@/websites/veele-services/assets/request-contract.js";
import { mapWebsiteSubmission, websiteSubmissionSchema, type WebsiteSubmission } from "./submission";

export function fixtureSubmission(services = ["schoonmaak", "beveiliging", "facilitair"]) {
  const state = { services, tasks: {}, location_type: "Evenement", city: "Den Haag", address: "Voorbeeldstraat", house_number: "12 A", postal_code: "2583 HW", area_m2: "123.5", visitors: "250", details: "Geen code verliezen.\nTweede regel met ✓.", frequency: "In overleg", flexible: false, start_date: "2027-02-06", end_date: "2027-02-07", start_time: "23:00", end_time: "02:00", contact_name: "Fictieve Aanvrager", organization: "Fictieve Organisatie", email: "request@example.test", phone: "", notes: "Algemene vraag\nGeen prijsakkoord." };
  return { envelopeVersion: "1.0.0", inquiry: buildInquiry(state, { mode: "submission", inquiryId: "12345678-1234-4123-8123-123456789abc", createdAt: "2026-10-07T00:00:00.000Z" }), wizardAnswers: { planningFlexible: false, frequencyLabel: "In overleg" } } as WebsiteSubmission;
}
describe("lossless public inquiry mapping", () => {
  it("accepts unknown location in browser and server while preserving all other answers", () => {
    expect(validateState({},1)).toEqual([]);
    expect(summaryGroups({}).find((group: {title:string})=>group.title==="Locatie").lines).toEqual(["Locatie later vaststellen"]);
    const q=fixtureSubmission();q.inquiry.location={country:"NL"};
    const mapped=mapWebsiteSubmission(websiteSubmissionSchema.parse(q),"t","s");
    expect(mapped.input.location).toBe("");expect(mapped.input.subject).toContain("Locatie later vaststellen");
    expect(mapped.input.contact_name).toBe(q.inquiry.contact.name);expect(mapped.extraNotes).toContain(q.inquiry.message);
    expect(validateState({postal_code:"wrong"},1)).not.toEqual([]);
  });
  it.each([1,2,3,4,5,6,7])("preserves every selected service, branch and explicit false (combination %i)", mask => {
    const services = ["schoonmaak", "beveiliging", "facilitair"].filter((_,i) => mask & (1<<i));
    const envelope = websiteSubmissionSchema.parse(fixtureSubmission(services));
    const mapped = mapWebsiteSubmission(envelope, "tenant-a", "fictitious-secret");
    expect(mapped.coverage.total).toBe(mapped.coverage.native + mapped.coverage.extra);
    expect(mapped.input.contact_name).toBe("Fictieve Aanvrager");
    expect(mapped.input.name).toBe("Fictieve Organisatie");
    expect(mapped.extraNotes).toContain("Nee (niet aangevinkt)");
    expect(mapped.extraNotes).toContain("23:00");
    expect(mapped.extraNotes).toContain("2027-02-07");
    expect(mapped.extraNotes).toContain("Algemene vraag\nGeen prijsakkoord.");
    expect(mapped.extraNotes).toContain("In overleg (discuss)");
    for (const service of envelope.inquiry.services) expect(mapped.extraNotes).toContain(envelope.inquiry.tasks[service]!.notes);
  });
  it("content- and tenant-bound retry identity is stable without storing a caller-selected ID", () => {
    const q = websiteSubmissionSchema.parse(fixtureSubmission());
    const first = mapWebsiteSubmission(q,"tenant-a","secret");
    expect(mapWebsiteSubmission(JSON.parse(JSON.stringify(q)),"tenant-a","secret").id).toBe(first.id);
    expect(first.id).not.toBe(q.inquiry.inquiryId);
    expect(mapWebsiteSubmission({...q,inquiry:{...q.inquiry,message:"Changed"}},"tenant-a","secret").id).not.toBe(first.id);
    expect(mapWebsiteSubmission(q,"tenant-b","secret").id).not.toBe(first.id);
  });
  it("unsupported arrays and complete Unicode comments survive overflow", () => {
    const q = fixtureSubmission();
    q.inquiry.tasks.cleaning = { requestedTasks:["glass","periodic_floor"], spaces:["workspaces","other"], glassAccess:"mixed", notes:"長".repeat(1500) };
    q.inquiry.tasks.security!.notes = "✓".repeat(1500); q.inquiry.tasks.facilities!.notes = "é".repeat(1500);
    q.inquiry.message="é".repeat(2000);
    q.inquiry.planning.notes="N".repeat(1000);
    for(const service of q.inquiry.services){q.inquiry.tasks[service]!.requestedTasks=["other"];q.inquiry.tasks[service]!.otherTask="O".repeat(500);}
    delete q.inquiry.tasks.cleaning.glassAccess;
    q.inquiry.planning.windows=Array.from({length:12},()=>({date:"2027-02-06",startTime:"23:00",endTime:"02:00",endDate:"2027-02-07"}));
    const mapped=mapWebsiteSubmission(websiteSubmissionSchema.parse(q),"tenant-a","secret");
    expect(mapped.extraNotes).toContain("Werkplekken (workspaces), Anders (other)");
    expect([...mapped.extraNotes].length).toBeGreaterThan(10000);
    expect(mapped.input.description).toContain("Volledige aanvullende wensen staan bij Extra opmerkingen");
    expect(mapped.extraNotes).toContain(q.inquiry.message);
    expect(mapped.coverage.extra).toBeGreaterThan(10);
  });
  it("phone-only inquiries preserve phone and leave email empty",()=>{
    const q=fixtureSubmission();delete q.inquiry.contact.email;q.inquiry.contact.phone="+31 6 12345678";q.inquiry.contact.preferredChannel="phone";
    expect(mapWebsiteSubmission(websiteSubmissionSchema.parse(q),"t","s").input.email).toBe("");
  });
  it.each(["unselected branch","invalid dates","missing contact","false changed","unknown field","discuss mixed"])("rejects %s",kind=>{
    const q=fixtureSubmission(["schoonmaak"]);
    if(kind==="unselected branch")q.inquiry.tasks.security={requestedTasks:["discuss"]};
    if(kind==="invalid dates")q.inquiry.planning.endDate="2027-01-01";
    if(kind==="missing contact"){delete q.inquiry.contact.email;delete q.inquiry.contact.phone;}
    if(kind==="false changed")q.wizardAnswers.planningFlexible=true;
    if(kind==="unknown field")Object.assign(q.inquiry,{tenantId:"another tenant"});
    if(kind==="discuss mixed")q.inquiry.tasks.cleaning!.requestedTasks=["discuss","glass"];
    expect(websiteSubmissionSchema.safeParse(q).success).toBe(false);
  });
});
