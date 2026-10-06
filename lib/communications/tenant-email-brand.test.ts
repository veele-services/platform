import { beforeEach, expect, it, vi } from "vitest";
const mocks=vi.hoisted(()=>({settings:vi.fn(),tenant:vi.fn()}));
vi.mock("server-only",()=>({}));
vi.mock("@/lib/env/server",()=>({getServerEnv:()=>({APP_URL:"https://staging.fieldgrid.nl"})}));
vi.mock("@/lib/supabase/admin",()=>({createAdminClient:()=>({from:(table:string)=>{
 const query={select:()=>query,eq:()=>query,single:()=>table==="tenant_settings"?mocks.settings():mocks.tenant()};return query;
}})}));
import { withTenantEmailBrand } from "./tenant-email-brand";
const brand={company:"Fieldgrid",domain:"staging.fieldgrid.nl",primary:"#222C35",accent:"#41AC42"};
beforeEach(()=>{vi.resetAllMocks();mocks.settings.mockResolvedValue({data:{white_label_enabled:false},error:null});mocks.tenant.mockResolvedValue({data:{name:"Fictitious tenant",tenant_branding:{primary_color:"#123456",accent_color:"#654321",logo_path:"fixture.png"}},error:null});});
it("tenant support email receives the tenant identity and current attribution policy",async()=>{
 expect(await withTenantEmailBrand("fixture-tenant",brand)).toMatchObject({company:"Fictitious tenant",primary:"#123456",accent:"#654321",whiteLabelEnabled:false,emailLogoUrl:"https://staging.fieldgrid.nl/api/branding/fixture-tenant/email-logo"});
 mocks.settings.mockResolvedValue({data:{white_label_enabled:true},error:null});
 expect((await withTenantEmailBrand("fixture-tenant",brand)).whiteLabelEnabled).toBe(true);
});
it("unavailable platform-controlled identity policy fails closed",async()=>{
 mocks.settings.mockResolvedValue({data:null,error:{message:"PRIVATE"}});
 await expect(withTenantEmailBrand("fixture-tenant",brand)).rejects.toThrow("De e-mailhuisstijl kon niet worden gecontroleerd.");
 expect(mocks.tenant).not.toHaveBeenCalled();
});
it("platform messages and already frozen tenant brand snapshots retain their intended identity",async()=>{
 expect(await withTenantEmailBrand(null,brand)).toEqual({...brand,whiteLabelEnabled:true});expect(mocks.settings).not.toHaveBeenCalled();
 const frozen={...brand,company:"Frozen fictitious tenant",emailLogoUrl:"https://staging.fieldgrid.nl/frozen-logo"};
 expect(await withTenantEmailBrand("fixture-tenant",frozen)).toEqual({...frozen,whiteLabelEnabled:false});expect(mocks.tenant).not.toHaveBeenCalled();
});
