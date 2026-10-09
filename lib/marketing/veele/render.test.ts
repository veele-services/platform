import { describe, expect, it } from "vitest";
import { renderWebsite, websitePages, websiteSitemap } from "./render";
import { publicMarketingPath } from "./routes";
import { resolveHostContext } from "@/lib/tenancy/hostname";
import { createContentSecurityPolicy } from "@/lib/auth/content-security-policy";

describe("isolated marketing delivery",()=>{
  it("renders all 28 routes with current tenant canonicals, real widgets and nonce",()=>{
    const paths=Object.keys(websitePages).filter(p=>p!=="404");expect(paths).toHaveLength(28);
    for(const path of paths){
      const {html,status}=renderWebsite(path,"https://veele-services.staging.fieldgrid.nl","nonce_fixture");
      expect(status).toBe(200);expect(html).not.toContain("dgwebserv.chatgpt.site");expect(html).not.toContain("veele-website.invalid");
      expect(html).toContain('content="noindex,follow"');expect(html).toContain('/veele-services/assets/');
      expect(html).toContain("4f6ad4d83eab08614126603fe68");expect(html).toContain('/login?next=%2Fklant');
      expect(html.match(/<script\b(?! nonce=)/)).toBeNull();
    }
    expect(websiteSitemap("https://tenant.test").match(/<url>/g)).toHaveLength(28);
    expect(renderWebsite("/missing","https://tenant.test","n").status).toBe(404);
  });
  it.each(["/app","/staff","/staff/manifest.webmanifest","/staff/pwa/icon-192.png","/klant","/login","/api/healthz","/aanvraag","/quote/token","/booking/token","/pay/token","/_next/static/chunk.js","/veele-services/assets/site.js","/branding/fieldgrid-icon-512.png","/branding/fieldgrid-logo.svg"])("does not rewrite %s",path=>expect(publicMarketingPath(path)).toBe(false));
  it("local alias cannot resolve a tenant on staging",()=>{
    expect(resolveHostContext("veele-services.localhost:3000","http://127.0.0.1:3000","local").kind).toBe("tenant");
    expect(resolveHostContext("veele-services.localhost:3000","https://staging.fieldgrid.nl","staging").kind).toBe("invalid");
  });
  it("external review style/image/connect sources are scoped to public marketing",()=>{
    expect(createContentSecurityPolicy(false,true,"https://fixture.supabase.co",true).value).toContain("https://cdn.trustindex.io");
    expect(createContentSecurityPolicy(false,true,"https://fixture.supabase.co",true).value).toContain("font-src 'self' data: https://cdn.trustindex.io");
    expect(createContentSecurityPolicy(false,true,"https://fixture.supabase.co").value).not.toContain("trustindex");
  });
});
