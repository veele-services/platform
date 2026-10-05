import {afterEach,beforeEach,expect,it,vi} from "vitest";
// This installed Next build still exports the old helper name, despite the
// bundled guide calling it doesProxyMatch. Test the actual framework matcher.
import {unstable_doesMiddlewareMatch as doesProxyMatch} from "next/experimental/testing/server";
import {NextRequest} from "next/server";
vi.mock("@supabase/ssr",()=>({createServerClient:()=>({auth:{getUser:async()=>({data:{user:null}})}})}));
import {config,proxy} from "@/proxy";
import {HOST_KIND_HEADER,TENANT_SLUG_HEADER} from "./hostname";
beforeEach(()=>{
 vi.stubEnv("APP_URL","https://staging.fieldgrid.nl");vi.stubEnv("DEPLOY_TARGET","staging");
 vi.stubGlobal("fetch",vi.fn(async()=>new Response(JSON.stringify([{id:"FICTITIOUS"}]),{status:200})));
});
afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs();});
it.each(["/quote/unused.png","/booking/unused.svg","/pay/unused.webp","/api/files/commercial/file.jpg","/app/klanten.png","/favicon.svg/quote","/sw.js/booking"])("applies hostname and identity-header handling to dynamic path %s",url=>{
 expect(doesProxyMatch({config,nextConfig:{},url})).toBe(true);
});
it.each(["/_next/static/chunk.js","/_next/image?url=%2Ffavicon.svg&w=32&q=75","/favicon.svg","/manifest.webmanifest","/sw.js"])("retains the exact static asset exemption for %s",url=>{
 expect(doesProxyMatch({config,nextConfig:{},url})).toBe(false);
});
it("overwrites a spoofed tenant header on an image-suffixed action path",async()=>{
 const response=await proxy(new NextRequest("https://alpha.staging.fieldgrid.nl/quote/unused.png",{method:"POST",headers:{host:"alpha.staging.fieldgrid.nl",[TENANT_SLUG_HEADER]:"beta",[HOST_KIND_HEADER]:"platform"}}));
 expect(response.headers.get(`x-middleware-request-${TENANT_SLUG_HEADER}`)).toBe("alpha");
 expect(response.headers.get(`x-middleware-request-${HOST_KIND_HEADER}`)).toBe("tenant");
 const csp=response.headers.get("content-security-policy")??"";
 expect(csp).toContain("script-src 'self' 'nonce-");
 expect(csp).toContain("'strict-dynamic'");
 expect(csp).toContain("object-src 'none'");
 expect(response.headers.get("x-middleware-request-x-nonce")).toMatch(/^[A-Za-z0-9+/]{24}$/);
});
it("rejects unknown hosts and clears tenant headers on the platform host",async()=>{
 const response=await proxy(new NextRequest("https://unknown.invalid/quote/unused.png",{headers:{host:"unknown.invalid",[TENANT_SLUG_HEADER]:"alpha"}}));
 expect(response.status).toBe(404);
 const platform=await proxy(new NextRequest("https://staging.fieldgrid.nl/quote/unused.png",{headers:{host:"staging.fieldgrid.nl",[TENANT_SLUG_HEADER]:"alpha"}}));
 expect(platform.headers.get(`x-middleware-request-${TENANT_SLUG_HEADER}`)).toBeNull();
});
it("preserves a staff query deep link only inside the validated next destination",async()=>{
 const response=await proxy(new NextRequest("https://alpha.staging.fieldgrid.nl/staff?tab=meer&section=beschikbaarheid&workOrder=00000000-0000-4000-8000-000000000001",{headers:{host:"alpha.staging.fieldgrid.nl"}}));
 const location=new URL(response.headers.get("location")!);
 expect(location.pathname).toBe("/login");
 expect(location.searchParams.get("next")).toBe("/staff?tab=meer&section=beschikbaarheid&workOrder=00000000-0000-4000-8000-000000000001");
 expect([...location.searchParams.keys()]).toEqual(["next"]);
});
