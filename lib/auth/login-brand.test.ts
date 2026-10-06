import {beforeEach,expect,it,vi} from "vitest";
const mocks=vi.hoisted(()=>({headers:vi.fn(),admin:vi.fn(),from:vi.fn(),select:vi.fn(),eq:vi.fn(),single:vi.fn()}));
vi.mock("server-only",()=>({}));
vi.mock("next/headers",()=>({headers:mocks.headers}));
vi.mock("@/lib/supabase/admin",()=>({createAdminClient:mocks.admin}));
import {getLoginBrand} from "./login-brand";
const tenant="10000000-0000-4000-8000-000000000001";
beforeEach(()=>{
 vi.clearAllMocks();mocks.headers.mockResolvedValue(new Headers({"x-fieldgrid-tenant-slug":"fixture-tenant"}));
 mocks.admin.mockReturnValue({from:mocks.from});
 const query={select:mocks.select,eq:mocks.eq,maybeSingle:mocks.single};
 mocks.from.mockReturnValue(query);mocks.select.mockReturnValue(query);mocks.eq.mockReturnValue(query);
 mocks.single.mockResolvedValue({data:{id:tenant,name:"FICTITIOUS Tenant",tenant_branding:{primary_color:"#152330",accent_color:"#41ac42",logo_path:`${tenant}/fixture.png`}},error:null});
});
it("loads public host branding in one query and uses the controlled logo endpoint",async()=>{
 const brand=await getLoginBrand();
 expect(mocks.from).toHaveBeenCalledExactlyOnceWith("tenants");
 expect(mocks.eq.mock.calls).toEqual([["slug","fixture-tenant"],["status","active"]]);
 expect(brand).toMatchObject({name:"FICTITIOUS Tenant",accentColor:"#41ac42"});
 expect(brand?.logoUrl).toMatch(new RegExp(`^/api/branding/${tenant}/email-logo\\?v=[a-f0-9]{64}$`));
});
it("returns no tenant branding on the platform host",async()=>{
 mocks.headers.mockResolvedValue(new Headers());expect(await getLoginBrand()).toBeNull();expect(mocks.admin).not.toHaveBeenCalled();
});
it("does not fall back to another tenant when hostname lookup fails",async()=>{
 mocks.single.mockResolvedValue({data:null,error:null});await expect(getLoginBrand()).rejects.toThrow("Onbekende tenant");
 mocks.headers.mockResolvedValue(new Headers({"x-fieldgrid-tenant-slug":"../other"}));await expect(getLoginBrand()).rejects.toThrow("Onbekende tenant");
});
