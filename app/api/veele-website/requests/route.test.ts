import {beforeEach,expect,it,vi} from "vitest";
const mocks=vi.hoisted(()=>({rpc:vi.fn(),tenant:vi.fn(),enabled:vi.fn(),mail:vi.fn(),env:{APP_URL:"https://staging.fieldgrid.nl",DEPLOY_TARGET:"staging",ADMIN_API_SECRET:"fictitious-secret-only"}}));
vi.mock("@/lib/env/server",()=>({getServerEnv:()=>mocks.env}));
vi.mock("@/lib/commercial/access",()=>({commercialModuleEnabled:mocks.enabled}));
vi.mock("@/lib/commercial/mail",()=>({flushCommercialMail:mocks.mail}));
vi.mock("@/lib/supabase/admin",()=>({createAdminClient:()=>({rpc:mocks.rpc,from:()=>({select:()=>({eq:()=>({eq:()=>({maybeSingle:mocks.tenant})})})})})}));
import {POST} from "./route";
const body={envelopeVersion:"1.0.0",inquiry:{schemaVersion:"1.0.0",mode:"submission",inquiryId:"12345678-1234-4123-8123-123456789abc",createdAt:"2026-10-07T00:00:00.000Z",locale:"nl-NL",source:"veele-website",services:["cleaning"],location:{type:"office",city:"Den Haag",country:"NL"},tasks:{cleaning:{requestedTasks:["discuss"]}},planning:{type:"once",timePreference:"flexible",timeZone:"Europe/Amsterdam"},contact:{name:"FICTITIOUS",email:"marketing@example.test",preferredChannel:"email"}},wizardAnswers:{planningFlexible:true,frequencyLabel:"Eenmalig"}};
const headers={host:"veele-services.staging.fieldgrid.nl",origin:"https://veele-services.staging.fieldgrid.nl","content-type":"application/json","x-fieldgrid-tenant-slug":"veele-services"};
const request=(payload:unknown=body,extra={})=>new Request("https://veele-services.staging.fieldgrid.nl/api/veele-website/requests",{method:"POST",headers:{...headers,...extra},body:JSON.stringify(payload)});
beforeEach(()=>{vi.clearAllMocks();mocks.tenant.mockResolvedValue({data:{id:"12345678-1234-4123-8123-123456789abd"}});mocks.enabled.mockResolvedValue(true);mocks.rpc.mockResolvedValue({data:{ok:true,reference:"AAN-2026-12345678"}});mocks.mail.mockResolvedValue(undefined);});
it("only confirms a durable existing intake receipt and derives tenant/request identity on the server",async()=>{
 const response=await POST(request());expect(response.status).toBe(200);expect(await response.json()).toEqual({ok:true,reference:"AAN-2026-12345678"});
 const [rpc,args]=mocks.rpc.mock.calls[0];expect(rpc).toBe("commercial_website_intake");expect(args.request_id).not.toBe(body.inquiry.inquiryId);expect(args.target_tenant).toBe("12345678-1234-4123-8123-123456789abd");expect(args.additional_notes).toContain("Kantoor");expect(args.client_hash).toMatch(/^[a-f0-9]{64}$/);
});
it.each([{host:"other.staging.fieldgrid.nl"},{"x-fieldgrid-tenant-slug":"other"},{origin:"https://evil.test"},{"content-type":"text/plain"}])("rejects untrusted host/origin/header combinations",async extra=>{
 const response=await POST(request(body,extra));expect([403,404]).toContain(response.status);expect(mocks.rpc).not.toHaveBeenCalled();expect(mocks.tenant).not.toHaveBeenCalled();
});
it("returns field/step errors without storage or leaking values",async()=>{
 const invalid={...body,inquiry:{...body.inquiry,contact:{name:"FICTITIOUS PRIVATE VALUE",preferredChannel:"email"}}};const r=await POST(request(invalid));expect(r.status).toBe(422);const data=await r.json();expect(data.fields).toContainEqual(expect.objectContaining({field:"email",step:4}));expect(JSON.stringify(data)).not.toContain("PRIVATE VALUE");expect(mocks.rpc).not.toHaveBeenCalled();
});
it("inactive tenant, disabled module and lookup failure are not accepted",async()=>{
 mocks.tenant.mockResolvedValueOnce({data:null});expect((await POST(request())).status).toBe(503);mocks.enabled.mockResolvedValueOnce(false);expect((await POST(request())).status).toBe(503);mocks.tenant.mockResolvedValueOnce({error:{message:"PRIVATE DATABASE"}});expect((await POST(request())).status).toBe(503);expect(mocks.rpc).not.toHaveBeenCalled();
});
it("an ambiguous database failure retains a safe retry and mail failure does not undo stored intake",async()=>{
 mocks.rpc.mockResolvedValueOnce({error:{message:"PRIVATE DATABASE",code:"XX000"}});let r=await POST(request());expect(r.status).toBe(503);expect(JSON.stringify(await r.json())).not.toContain("PRIVATE DATABASE");mocks.mail.mockRejectedValueOnce(new Error("PRIVATE SENDGRID"));r=await POST(request());expect(r.status).toBe(200);
});
it("bounds JSON before persistence, and malformed requests do not claim success",async()=>{
 expect((await POST(request({oversized:"x".repeat(65537)}))).status).toBe(413);
 expect((await POST(new Request("https://veele-services.staging.fieldgrid.nl/api/veele-website/requests",{method:"POST",headers,body:"{"}))).status).toBe(400);expect(mocks.rpc).not.toHaveBeenCalled();
});
