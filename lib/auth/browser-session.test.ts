import {afterEach,beforeEach,expect,it,vi} from "vitest";
const mocks=vi.hoisted(()=>({headers:vi.fn(),cookies:vi.fn(),client:vi.fn(),user:vi.fn(),claims:vi.fn()}));
vi.mock("server-only",()=>({}));
vi.mock("next/headers",()=>({headers:mocks.headers,cookies:mocks.cookies}));
vi.mock("@/lib/supabase/server",()=>({createClient:mocks.client}));
import {browserSessionKey} from "./browser-session";
import {BROWSER_SESSION_HEADER} from "./session-signal";
import {deriveBrowserSessionKey} from "./session-key";
beforeEach(()=>{
 vi.clearAllMocks();vi.stubEnv("DEPLOY_TARGET","local");
 mocks.headers.mockResolvedValue(new Headers());
 mocks.cookies.mockResolvedValue({get:()=>({value:"fixture-local-tenant"})});
 mocks.client.mockResolvedValue({auth:{getUser:mocks.user,getClaims:mocks.claims}});
 mocks.user.mockResolvedValue({data:{user:{id:"fixture-user"}},error:null});
 mocks.claims.mockResolvedValue({data:{claims:{sub:"fixture-user",session_id:"fixture-session"}},error:null});
});
afterEach(()=>vi.unstubAllEnvs());
it("reuses only this request's proxy signal without a second live user lookup",async()=>{
 mocks.headers.mockResolvedValue(new Headers({[BROWSER_SESSION_HEADER]:"a".repeat(64)}));
 expect(await browserSessionKey()).toBe("a".repeat(64));
 expect(mocks.client).not.toHaveBeenCalled();
});
it.each(["","forged", "A".repeat(64)])("fails closed for a missing or malformed verified signal %s",async signal=>{
 mocks.headers.mockResolvedValue(new Headers({[BROWSER_SESSION_HEADER]:signal}));
 expect(await browserSessionKey()).toBeNull();expect(mocks.client).not.toHaveBeenCalled();
});
it("retains a live fallback outside HTTP proxy coverage",async()=>{
 expect(await browserSessionKey()).toBe(deriveBrowserSessionKey("fixture-user",{sub:"fixture-user",session_id:"fixture-session"},"platform","fixture-local-tenant"));
 expect(mocks.user).toHaveBeenCalledTimes(1);expect(mocks.claims).toHaveBeenCalledTimes(1);
});
it("never trusts claims after a failed live user check",async()=>{
 mocks.user.mockResolvedValue({data:{user:null},error:new Error("Revoked session")});
 expect(await browserSessionKey()).toBeNull();
});
