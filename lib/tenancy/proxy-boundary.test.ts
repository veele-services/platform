import {afterEach,beforeEach,expect,it,vi} from "vitest";
// This installed Next build still exports the old helper name, despite the
// bundled guide calling it doesProxyMatch. Test the actual framework matcher.
import {unstable_doesMiddlewareMatch as doesProxyMatch} from "next/experimental/testing/server";
import {NextRequest} from "next/server";
const mocks=vi.hoisted(()=>({user:vi.fn(),claims:vi.fn(),refresh:vi.fn()}));
vi.mock("server-only",()=>({}));
vi.mock("@supabase/ssr",()=>({createServerClient:(_url:unknown,_key:unknown,options:{cookies:{setAll:(items:unknown[])=>void}})=>{
 mocks.refresh.mockImplementation(()=>options.cookies.setAll([{name:"fixture-refreshed",value:"fixture-value",options:{httpOnly:true,sameSite:"lax",path:"/"}}]));
 return {auth:{getUser:mocks.user,getClaims:mocks.claims}};
}}));
import {config,proxy} from "@/proxy";
import {HOST_KIND_HEADER,TENANT_SLUG_HEADER} from "./hostname";
import {BROWSER_SESSION_HEADER} from "@/lib/auth/session-signal";
import {deriveBrowserSessionKey} from "@/lib/auth/session-key";
beforeEach(()=>{
 vi.clearAllMocks();mocks.user.mockResolvedValue({data:{user:null},error:null});mocks.claims.mockResolvedValue({data:{claims:{sub:"fixture-user",session_id:"fixture-session"}},error:null});
 vi.stubEnv("APP_URL","https://staging.fieldgrid.nl");vi.stubEnv("DEPLOY_TARGET","staging");
 vi.stubGlobal("fetch",vi.fn(async()=>new Response(JSON.stringify([{id:"FICTITIOUS"}]),{status:200})));
});
it("replaces spoofed signals with one live verified identity and preserves refreshed cookies",async()=>{
 mocks.user.mockImplementation(async()=>{mocks.refresh();return {data:{user:{id:"fixture-user"}},error:null};});
 const response=await proxy(new NextRequest("https://alpha.staging.fieldgrid.nl/api/auth/session",{headers:{host:"alpha.staging.fieldgrid.nl",[BROWSER_SESSION_HEADER]:"b".repeat(64)}}));
 expect(mocks.user).toHaveBeenCalledTimes(1);expect(mocks.claims).toHaveBeenCalledTimes(1);
 expect(response.headers.get(`x-middleware-request-${BROWSER_SESSION_HEADER}`)).toBe(deriveBrowserSessionKey("fixture-user",{sub:"fixture-user",session_id:"fixture-session"},"alpha"));
 expect(response.headers.get(BROWSER_SESSION_HEADER)).toBeNull();
 expect(response.cookies.get("fixture-refreshed")).toMatchObject({value:"fixture-value",httpOnly:true,sameSite:"lax",path:"/"});
});
it("strips a forged signal even on public requests and returns no signal without a live user",async()=>{
 const request=(path:string)=>new NextRequest(`https://staging.fieldgrid.nl${path}`,{headers:{host:"staging.fieldgrid.nl",[BROWSER_SESSION_HEADER]:"b".repeat(64)}});
 const publicResponse=await proxy(request("/login"));
 expect(publicResponse.headers.get(`x-middleware-request-${BROWSER_SESSION_HEADER}`)).toBeNull();
 const response=await proxy(request("/api/auth/session"));
 expect(response.headers.get(`x-middleware-request-${BROWSER_SESSION_HEADER}`)).toBe("");
 expect(mocks.claims).not.toHaveBeenCalled();
});
it("fails closed when the live user and JWT claims disagree",async()=>{
 mocks.user.mockResolvedValue({data:{user:{id:"fixture-user"}},error:null});
 mocks.claims.mockResolvedValue({data:{claims:{sub:"other-user",session_id:"fixture-session"}},error:null});
 const response=await proxy(new NextRequest("https://staging.fieldgrid.nl/api/auth/session",{headers:{host:"staging.fieldgrid.nl"}}));
 expect(response.headers.get(`x-middleware-request-${BROWSER_SESSION_HEADER}`)).toBe("");
});
it("binds local signals to the selected tenant and ignores that selection on staging",async()=>{
 mocks.user.mockResolvedValue({data:{user:{id:"fixture-user"}},error:null});
 const request=()=>new NextRequest("https://staging.fieldgrid.nl/api/auth/session",{headers:{host:"staging.fieldgrid.nl",cookie:"fieldgrid_tenant_id=fixture-local"}});
 vi.stubEnv("DEPLOY_TARGET","local");
 const local=await proxy(request());
 expect(local.headers.get(`x-middleware-request-${BROWSER_SESSION_HEADER}`)).toBe(deriveBrowserSessionKey("fixture-user",{sub:"fixture-user",session_id:"fixture-session"},"platform","fixture-local"));
 vi.stubEnv("DEPLOY_TARGET","staging");
 const staging=await proxy(request());
 expect(staging.headers.get(`x-middleware-request-${BROWSER_SESSION_HEADER}`)).toBe(deriveBrowserSessionKey("fixture-user",{sub:"fixture-user",session_id:"fixture-session"},"platform"));
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
