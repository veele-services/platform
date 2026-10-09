import { afterEach,beforeEach,describe,expect,it,vi } from "vitest";
const mocks=vi.hoisted(()=>({context:vi.fn(),actor:vi.fn(),headers:vi.fn(),rpc:vi.fn(),platform:vi.fn()}));
vi.mock("server-only",()=>({}));
vi.mock("./context",()=>({getAuthContext:mocks.context}));
vi.mock("@/lib/objects/auth",()=>({getObjectActor:mocks.actor}));
vi.mock("next/headers",()=>({headers:mocks.headers}));
vi.mock("@/lib/supabase/server",()=>({createClient:async()=>({})}));
vi.mock("@/lib/tickets/rpc",()=>({ticketRpc:mocks.platform}));
import { getLoginAccess } from "./login-access";

const tenant={id:"10000000-0000-4000-8000-000000000001",slug:"tenant-a",roles:["management"],enabledServices:["personeel"]};
beforeEach(()=>{
 vi.clearAllMocks();vi.stubEnv("DEPLOY_TARGET","staging");
 mocks.headers.mockResolvedValue(new Headers({"x-fieldgrid-tenant-slug":"tenant-a"}));
 mocks.context.mockResolvedValue({isPlatformAdmin:false,tenant});
 mocks.actor.mockResolvedValue({tenant,db:{rpc:mocks.rpc}});mocks.rpc.mockResolvedValue({data:[],error:null});
 mocks.platform.mockResolvedValue(false);
});
afterEach(()=>vi.unstubAllEnvs());

describe("live OTP workspace authorization",()=>{
 it("staging platform origin never selects a tenant for ordinary members",async()=>{
  mocks.headers.mockResolvedValue(new Headers());expect(await getLoginAccess()).toEqual({workspaces:[]});expect(mocks.actor).not.toHaveBeenCalled();
 });
 it("the platform origin admits only an actual platform administrator",async()=>{
  mocks.headers.mockResolvedValue(new Headers());mocks.context.mockResolvedValue({isPlatformAdmin:true,tenant:null});expect(await getLoginAccess()).toEqual({workspaces:["/platform"]});expect(mocks.actor).not.toHaveBeenCalled();
 });
 it("admits a live scoped platform operator without selecting any tenant",async()=>{
  mocks.headers.mockResolvedValue(new Headers());mocks.platform.mockResolvedValue(true);
  expect(await getLoginAccess()).toEqual({workspaces:["/platform"]});expect(mocks.actor).not.toHaveBeenCalled();
  expect(mocks.platform).toHaveBeenCalledWith({},"platform_workspace_access",{});
 });
 it("fails closed when the live platform entitlement check fails",async()=>{
  mocks.headers.mockResolvedValue(new Headers());mocks.platform.mockRejectedValue(new Error("Geen toegang"));
  await expect(getLoginAccess()).rejects.toThrow("Geen toegang");expect(mocks.actor).not.toHaveBeenCalled();
 });
 it("platform administrator status grants no additional workspace on a tenant origin",async()=>{
  mocks.context.mockResolvedValue({isPlatformAdmin:true,tenant:null});expect(await getLoginAccess()).toEqual({workspaces:[]});
 });
 it("rechecks the exact hostname tenant and rejects a mismatched actor",async()=>{
  mocks.actor.mockResolvedValue({tenant:{...tenant,slug:"tenant-b"},db:{rpc:mocks.rpc}});await expect(getLoginAccess()).rejects.toThrow("Geen toegang");expect(mocks.rpc).not.toHaveBeenCalled();
 });
 it("customer identity can log in without a staff or management membership",async()=>{
  mocks.context.mockResolvedValue({isPlatformAdmin:false,tenant:null});mocks.rpc.mockResolvedValue({data:[{id:"20000000-0000-4000-8000-000000000001",name:"Fictieve klant"}],error:null});
  expect(await getLoginAccess()).toEqual({workspaces:["/klant"]});expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("customer_portal_accounts",{target_tenant:tenant.id});
 });
 it("staff-only access requires the personnel module and does not grant management",async()=>{
  mocks.context.mockResolvedValue({isPlatformAdmin:false,tenant:{...tenant,roles:["staff"]}});expect(await getLoginAccess()).toEqual({workspaces:["/staff"]});
  mocks.context.mockResolvedValue({isPlatformAdmin:false,tenant:{...tenant,roles:["staff"],enabledServices:[]}});expect(await getLoginAccess()).toEqual({workspaces:[]});
 });
 it("a management member never skips a failed live identity recheck",async()=>{
  mocks.rpc.mockResolvedValue({data:null,error:{code:"42501"}});await expect(getLoginAccess()).rejects.toThrow("Geen toegang");
 });
});
