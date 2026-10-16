import { beforeEach, describe, expect, it, vi } from "vitest";
const state=vi.hoisted(()=>({attempt:{} as Record<string,unknown>|null,lookupError:null as {message:string}|null,get:vi.fn(),rpc:vi.fn()}));
vi.mock("server-only",()=>({}));
vi.mock("@/lib/supabase/admin",()=>({createAdminClient:()=>({from:()=>{const q={select:()=>q,eq:()=>q,maybeSingle:async()=>({data:state.attempt,error:state.lookupError})};return q;},rpc:state.rpc})}));
vi.mock("@/lib/providers/mollie",()=>({getMolliePayment:state.get}));
import { POST } from "./route";
const result=()=>({id:"tr_fictional",mode:"test",status:"paid",amount:{value:"100.00",currency:"EUR"},metadata:{tenant_id:"tenant",invoice_group_id:"group",payment_attempt_id:"attempt"}});
const request=(id="tr_fictional")=>new Request("https://staging.fieldgrid.nl/api/mollie/webhook",{method:"POST",body:new URLSearchParams({id,status:"paid",amount:"0.01"})});
describe("classic Mollie callback evidence",()=>{
  beforeEach(()=>{
    state.attempt={id:"attempt",tenant_id:"tenant",invoice_group_id:"group",provider:"mollie",provider_payment_id:"tr_fictional",provider_mode:"test",amount_cents:10000,currency:"EUR"};
    state.lookupError=null;state.get.mockReset().mockResolvedValue(result());state.rpc.mockReset().mockResolvedValue({error:null});
  });
  it("ignores caller-supplied paid/amount fields and passes authenticated provider evidence to the idempotent settlement RPC",async()=>{
    expect((await POST(request())).status).toBe(200);expect((await POST(request())).status).toBe(200);
    expect(state.get).toHaveBeenCalledTimes(2);
    expect(state.rpc).toHaveBeenCalledWith("apply_confirmed_provider_payment",expect.objectContaining({provider_amount_cents:10000,provider_status:"paid",provider_payload:result()}));
  });
  it.each([{id:"tr_other"},{mode:"live"},{amount:{value:"1.00",currency:"EUR"}},{metadata:{tenant_id:"other"}}])("never settles mismatched provider response %j",async change=>{
    state.get.mockResolvedValue({...result(),...change});expect((await POST(request())).status).toBe(503);expect(state.rpc).not.toHaveBeenCalled();
  });
  it("does not acknowledge a temporary database lookup failure",async()=>{
    state.attempt=null;state.lookupError={message:"Temporary lookup failure"};
    expect((await POST(request())).status).toBe(503);expect(state.get).not.toHaveBeenCalled();expect(state.rpc).not.toHaveBeenCalled();
  });
  it("does not acknowledge a temporary provider failure",async()=>{
    state.get.mockRejectedValue(new Error("Provider temporarily unavailable"));
    expect((await POST(request())).status).toBe(503);expect(state.rpc).not.toHaveBeenCalled();
  });
  it("ignores unknown or malformed ids without exposing provider data",async()=>{
    expect((await POST(request("../../other"))).status).toBe(200);state.attempt=null;
    expect((await POST(request())).status).toBe(200);expect(state.get).not.toHaveBeenCalled();
  });
});
