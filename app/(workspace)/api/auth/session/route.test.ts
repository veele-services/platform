import { beforeEach,describe,expect,it,vi } from "vitest";
const state=vi.hoisted(()=>({user:{id:"FICTITIOUS-user"} as {id:string}|null,claims:{sub:"FICTITIOUS-user",session_id:"FICTITIOUS-session"} as Record<string,string>,host:"tenant",cookie:"tenant-a",signal:null as string|null,client:vi.fn()}));
vi.mock("server-only",()=>({}));
vi.mock("@/lib/supabase/server",()=>({createClient:state.client}));
vi.mock("next/headers",()=>({headers:async()=>new Headers({"x-fieldgrid-tenant-slug":state.host,...(state.signal===null?{}:{"x-fieldgrid-browser-session":state.signal})}),cookies:async()=>({get:()=>({value:state.cookie})})}));
import { GET } from "./route";
describe("browser account fingerprint",()=>{
  beforeEach(()=>{
    vi.clearAllMocks();state.user={id:"FICTITIOUS-user"};state.claims={sub:"FICTITIOUS-user",session_id:"FICTITIOUS-session"};state.host="tenant";state.cookie="tenant-a";state.signal=null;
    state.client.mockResolvedValue({auth:{getUser:async()=>({data:{user:state.user},error:null}),getClaims:async()=>({data:{claims:state.claims},error:null})}});
  });
  it("returns only a non-cacheable opaque signal, no user/session identifiers or credentials",async()=>{
    const response=await GET(),body=await response.json();expect(Object.keys(body)).toEqual(["sessionKey"]);expect(body.sessionKey).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(body)).not.toContain("FICTITIOUS");expect(response.headers.get("cache-control")).toContain("no-store");expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(await (await GET()).json()).toEqual(body);
  });
  it("changes on account, session or host transition",async()=>{
    const first=await(await GET()).json();state.claims.session_id="FICTITIOUS-other-session";expect(await(await GET()).json()).not.toEqual(first);
    state.claims.session_id="FICTITIOUS-session";
    state.host="other-tenant";expect(await(await GET()).json()).not.toEqual(first);
    state.host="tenant";state.user={id:"FICTITIOUS-other-user"};state.claims.sub=state.user.id;
    expect(await(await GET()).json()).not.toEqual(first);
  });
  it("returns this request's verified proxy signal without repeating authentication",async()=>{
    state.signal="a".repeat(64);
    const response=await GET();expect(await response.json()).toEqual({sessionKey:state.signal});
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(state.client).not.toHaveBeenCalled();
  });
  it.each(["","forged","A".repeat(64)])("fails closed for invalid proxy signals %j without falling back to another identity",async signal=>{
    state.signal=signal;
    expect(await(await GET()).json()).toEqual({sessionKey:null});
    expect(state.client).not.toHaveBeenCalled();
  });
  it("does not treat mismatched or missing identity as an active session",async()=>{
    state.claims.sub="other";expect(await(await GET()).json()).toEqual({sessionKey:null});state.user=null;expect(await(await GET()).json()).toEqual({sessionKey:null});
  });
});
