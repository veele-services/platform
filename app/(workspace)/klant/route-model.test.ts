import { describe,expect,it,vi } from "vitest";
import { customerPortalViewSchema,customerRouteHref,customerRouteSchema,loadCustomerVisit } from "./route-model";
const account="10000000-0000-4000-8000-000000000001",visit="10000000-0000-4000-8000-000000000002",object="10000000-0000-4000-8000-000000000003";
const detail={visit:{id:visit,objectId:object,number:"WO-FIXTURE",service:"Onderhoud",status:"released",start:null,end:null,actualStart:null,actualEnd:null,version:1},canAddRequest:true,tasks:[],nodes:[],requests:[]};
describe("customer route selectors",()=>{
 it("preserves one explicit account and a bounded view on the same tenant origin",()=>{expect(customerRouteHref({account,view:"reports"})).toBe(`/klant?account=${account}&view=reports`);expect(customerRouteHref({})).toBe("/klant");});
 it.each([{}, {account}, {account,view:"news"}, {account,object,order:visit}])("accepts only existing route dimensions",query=>expect(customerRouteSchema.safeParse(query).success).toBe(true));
 it.each([{account:[account,account]},{account:"malformed"},{tenant:account},{view:"platform"},{view:["objects","reports"]},{order:"malformed"}])("rejects forged or duplicate selectors",query=>expect(customerRouteSchema.safeParse(query).success).toBe(false));
 it.each(["notifications","more"])("keeps the %s view reloadable",view=>expect(customerPortalViewSchema.parse(view)).toBe(view));
});
describe("customer concrete-visit browser load",()=>{
 it("uses private no-store same-origin fetch and strict customer DTO validation",async()=>{const fetcher=vi.fn().mockResolvedValue(new Response(JSON.stringify(detail))),abort=new AbortController();expect(await loadCustomerVisit(account,visit,abort.signal,fetcher)).toEqual({kind:"ok",detail});expect(fetcher).toHaveBeenCalledWith(`/api/customer-portal/visit?account=${account}&visit=${visit}`,{cache:"no-store",credentials:"same-origin",redirect:"error",signal:abort.signal});});
 it.each([401,403])("clears a denied HTTP %i detail rather than keeping cached private data",async status=>{const fetcher=vi.fn().mockResolvedValue(new Response("",{status}));expect(await loadCustomerVisit(account,visit,new AbortController().signal,fetcher)).toEqual({kind:"denied"});});
 it.each([409,500,503])("does not claim a transient HTTP %i was an access revocation",async status=>{const fetcher=vi.fn().mockResolvedValue(new Response("",{status}));expect(await loadCustomerVisit(account,visit,new AbortController().signal,fetcher)).toEqual({kind:"temporary"});});
 it("rejects another concrete visit even when its shape is valid",async()=>{const fetcher=vi.fn().mockResolvedValue(new Response(JSON.stringify({...detail,visit:{...detail.visit,id:account}})));expect(await loadCustomerVisit(account,visit,new AbortController().signal,fetcher)).toEqual({kind:"denied"});});
 it("never casts a rich internal visit payload to a customer DTO",async()=>{const fetcher=vi.fn().mockResolvedValue(new Response(JSON.stringify({...detail,internal_review:"PRIVATE CANARY"})));expect(await loadCustomerVisit(account,visit,new AbortController().signal,fetcher)).toEqual({kind:"temporary"});});
});
