import { describe,expect,it } from "vitest";
import { brandingLogoVersion,currentBrandingLogoPath } from "./logo-url";
const tenant="10000000-0000-4000-8000-000000000001",path=`${tenant}/logo-fixture.png`;
describe("controlled versioned branding logo URL",()=>{
 it("changes only the controlled same-tenant current-logo endpoint when immutable bytes change",()=>{
  expect(currentBrandingLogoPath(tenant,path)).toBe(`/api/branding/${tenant}/email-logo?v=${brandingLogoVersion(path)}`);
  expect(brandingLogoVersion(path)).toMatch(/^[a-f0-9]{64}$/);
  expect(currentBrandingLogoPath(tenant,path.replace("fixture","replacement"))).not.toBe(currentBrandingLogoPath(tenant,path));
 });
 it.each([null,undefined,"",`other/${path}`,`${tenant}/../private.png`,`${tenant}/%2e%2e/logo.png`,`${tenant}/logo.png?token=private`,"https://external.invalid/logo.png"])("fails closed for an absent/forged logo source %s",source=>{
  expect(currentBrandingLogoPath(tenant,source)).toBeNull();
 });
 it("never interprets a client external tenant string as a URL",()=>{expect(currentBrandingLogoPath("https://external.invalid",path)).toBeNull();});
});
