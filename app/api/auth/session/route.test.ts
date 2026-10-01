import { beforeEach,describe,expect,it,vi } from "vitest";
const state=vi.hoisted(()=>({user:{id:"FICTITIOUS-user"} as {id:string}|null,claims:{sub:"FICTITIOUS-user",session_id:"FICTITIOUS-session"} as Record<string,string>,host:"tenant",cookie:"tenant-a"}));
vi.mock("server-only",()=>({}));
vi.mock("@/lib/supabase/server",()=>({createClient:async()=>({auth:{getUser:async()=>({data:{user:state.user},error:null}),getClaims:async()=>({data:{claims:state.claims},error:null})}})}));
vi.mock("next/headers",()=>({headers:async()=>({get:()=>state.host}),cookies:async()=>({get:()=>({value:state.cookie})})}));
import { GET } from "./route";
describe("browser account fingerprint",()=>{
  beforeEach(()=>{state.user={id:"FICTITIOUS-user"};state.claims={sub:"FICTITIOUS-user",session_id:"FICTITIOUS-session"};state.host="tenant";state.cookie="tenant-a";});
  it("returns only a non-cacheable opaque signal, no user/session identifiers or credentials",async()=>{
    const response=await GET(),body=await response.json();expect(Object.keys(body)).toEqual(["sessionKey"]);expect(body.sessionKey).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(body)).not.toContain("FICTITIOUS");expect(response.headers.get("cache-control")).toContain("no-store");expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(await (await GET()).json()).toEqual(body);
  });
  it("changes on account, session or host transition",async()=>{
    const first=await(await GET()).json();state.claims.session_id="FICTITIOUS-other-session";expect(await(await GET()).json()).not.toEqual(first);
    state.host="other-tenant";expect(await(await GET()).json()).not.toEqual(first);
  });
  it("does not treat mismatched or missing identity as an active session",async()=>{
    state.claims.sub="other";expect(await(await GET()).json()).toEqual({sessionKey:null});state.user=null;expect(await(await GET()).json()).toEqual({sessionKey:null});
  });
});
