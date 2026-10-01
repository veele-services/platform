import { createHash } from "node:crypto";
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state=vi.hoisted(()=>({ rows:{} as Record<string,Record<string,unknown>[]>, reads:[] as string[], provider:vi.fn(), get:vi.fn(), logo:vi.fn(), rpc:vi.fn() }));
vi.mock("server-only",()=>({}));
vi.mock("@/lib/supabase/admin",()=>({createAdminClient:()=>({rpc:state.rpc,from:(table:string)=>{
  state.reads.push(table);let rows=state.rows[table]??[];
  const q={select:()=>q,update:()=>q,eq:(key:string,value:unknown)=>{rows=rows.filter(r=>r[key]===value);return q;},is:(key:string,value:unknown)=>{rows=rows.filter(r=>r[key]===value);return q;},gt:(key:string,value:string)=>{rows=rows.filter(r=>String(r[key])>value);return q;},in:(key:string,values:unknown[])=>{rows=rows.filter(r=>values.includes(r[key]));return q;},single:async()=>({data:rows[0]??null,error:null}),maybeSingle:async()=>({data:rows[0]??null,error:null}),then:(resolve:(result:unknown)=>unknown)=>Promise.resolve({data:rows,error:null}).then(resolve)};
  return q;
}})}));
vi.mock("@/lib/providers/mollie",()=>({createMolliePayment:state.provider,getMolliePayment:state.get}));
vi.mock("@/lib/env/server",()=>({getServerEnv:()=>({})}));
vi.mock("@/lib/tenancy/request",()=>({requestMatchesTenant:async()=>true}));
vi.mock("@/lib/tenancy/hostname",()=>({tenantAppUrl:(_slug:string,path:string)=>`https://tenant.staging.fieldgrid.nl${path}`}));
vi.mock("@/lib/branding/logo",()=>({getBrandingLogoUrl:state.logo}));
vi.mock("next/navigation",()=>({notFound:()=>{throw Error("not-found");}}));
import { POST } from "@/app/api/payments/create/route";
import PaymentPage from "@/app/pay/[token]/page";

const token="fictitious-payment-capability-for-tests";
const request=()=>new Request("https://tenant.staging.fieldgrid.nl/api/payments/create",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({token})});
const page=()=>PaymentPage({params:Promise.resolve({token}),searchParams:Promise.resolve({})});
const providerPayment=()=>({id:"tr_fictional",mode:"test",status:"open",amount:{value:"121.00",currency:"EUR"},metadata:{tenant_id:"tenant",invoice_group_id:"group",payment_attempt_id:"attempt"},_links:{checkout:{href:"https://www.mollie.com/checkout/fictional"}}});
describe("payment capability consumers",()=>{
  beforeEach(()=>{
    vi.stubGlobal("React",React);state.reads=[];state.provider.mockReset();state.get.mockReset().mockResolvedValue(providerPayment());state.logo.mockReset().mockResolvedValue(null);
    state.rpc.mockReset().mockImplementation(async(name:string)=>({
      data:name==="prepare_provider_payment"?state.rows.payment_attempts[0]
        :name==="claim_provider_payment_check"?{action:"provider"}
          :name==="release_provider_payment_check"?true:null,
      error:null,
    }));
    state.rows={
      external_action_tokens:[{token_hash:createHash("sha256").update(token).digest("hex"),purpose:"payment",tenant_id:"tenant",subject_id:"group",consumed_at:null,revoked_at:null,expires_at:"2999-01-01T00:00:00.000Z"}],
      invoice_groups:[{id:"group",tenant_id:"tenant",customer_id:"customer",status:"open",expires_at:"2999-01-01T00:00:00.000Z"}],
      tenants:[{id:"tenant",slug:"tenant",name:"Fictitious tenant",status:"active"}],tenant_branding:[],
      tenant_settings:[{tenant_id:"tenant",enabled_services:["finance"]}],
      invoice_group_items:[{tenant_id:"tenant",invoice_group_id:"group",invoice_id:"invoice"}],
      invoices:[{id:"invoice",tenant_id:"tenant",customer_id:"customer",invoice_number:"FICTITIOUS-1",total_cents:12100,paid_cents:0,status:"final"}],
      payment_attempts:[{id:"attempt",tenant_id:"tenant",invoice_group_id:"group",provider:"mollie",provider_mode:"test",provider_payment_id:"tr_fictional",amount_cents:12100,currency:"EUR",idempotency_key:"mollie-group-12100",checkout_url:"https://untrusted.example.invalid/checkout",status:"open"}],
      payment_allocations:[{tenant_id:"tenant",payment_attempt_id:"attempt",invoice_id:"invoice",amount_cents:12100}],
    };
  });
  it.each([{revoked_at:"2026-01-01T00:00:00Z"},{consumed_at:"2026-01-01T00:00:00Z"},{expires_at:"2000-01-01T00:00:00Z"},{purpose:"quote_acceptance"},{token_hash:"wrong"}])("both entry points deny invalid capability %j before invoice/provider access",async change=>{
    Object.assign(state.rows.external_action_tokens[0],change);
    expect((await POST(request())).status).toBe(404);
    await expect(page()).rejects.toThrow("not-found");
    expect(state.reads).toEqual(["external_action_tokens","external_action_tokens"]);
    expect(state.provider).not.toHaveBeenCalled();
  });
  it("valid link keeps invoice display and idempotent checkout retry working",async()=>{
    expect(await page()).toBeTruthy();
    const response=await POST(request());expect(response.status).toBe(200);
    expect(await response.json()).toEqual({checkoutUrl:"https://www.mollie.com/checkout/fictional"});
    expect(state.get).toHaveBeenCalledWith("tr_fictional");
    expect(state.provider).not.toHaveBeenCalled();
    expect(state.rows.external_action_tokens[0].consumed_at).toBeNull();
  });
  it("already-paid invoices do not create a provider transaction",async()=>{
    state.rows.invoices[0].paid_cents=12100;
    expect((await POST(request())).status).toBe(409);expect(state.provider).not.toHaveBeenCalled();
  });
  it.each([
    ["invoice_groups",{customer_id:"other"}], ["invoice_groups",{tenant_id:"other"}],
    ["invoice_groups",{status:"cancelled"}], ["invoice_groups",{expires_at:"2000-01-01"}],
    ["invoice_groups",{expires_at:null}], ["tenants",{status:"suspended"}],
    ["tenant_settings",{enabled_services:[]}], ["invoices",{tenant_id:"other"}],
    ["invoices",{customer_id:"other"}], ["invoices",{status:"draft"}],
    ["invoice_group_items",{tenant_id:"other"}],
  ] as const)("both consumers reject invalid current scope: %s %j",async(table,change)=>{
    Object.assign(state.rows[table][0],change);
    expect((await POST(request())).status).toBe(404);await expect(page()).rejects.toThrow("not-found");
    expect(state.provider).not.toHaveBeenCalled();expect(state.get).not.toHaveBeenCalled();
  });
  it.each([{provider:"manual"},{amount_cents:0},{invoice_group_id:"other"},{provider_mode:"live"}])("does not reuse a poisoned attempt %j",async change=>{
    Object.assign(state.rows.payment_attempts[0],change);expect((await POST(request())).status).toBe(400);
    expect(state.get).not.toHaveBeenCalled();
  });
  it("does not call the provider after an allocation validation/transaction failure",async()=>{
    state.rpc.mockResolvedValue({data:null,error:{message:"Atomic payment preparation denied"}});
    expect((await POST(request())).status).toBe(400);expect(state.get).not.toHaveBeenCalled();
  });
  it.each(["https://mollie.com.untrusted.invalid/", "javascript:alert(1)", "https://evil.invalid/"])("rejects an unexpected provider checkout destination %s",async href=>{
    const result=providerPayment();result._links.checkout.href=href;state.get.mockResolvedValue(result);
    expect((await POST(request())).status).toBe(400);
  });
  it("revalidates the capability after the provider response",async()=>{
    state.get.mockImplementation(async()=>{state.rows.external_action_tokens[0].revoked_at="2026-01-01";return providerPayment();});
    expect((await POST(request())).status).toBe(404);
  });
  it("revalidates the capability after resolving the logo for the invoice view",async()=>{
    state.logo.mockImplementation(async()=>{state.rows.external_action_tokens[0].revoked_at="2026-01-01";return null;});
    await expect(page()).rejects.toThrow("not-found");
  });
  it("reconciles a provider-confirmed paid retry through the settlement RPC, not a raw status update",async()=>{
    state.get.mockResolvedValue({...providerPayment(),status:"paid"});
    expect((await POST(request())).status).toBe(409);
    expect(state.rpc).toHaveBeenCalledWith("apply_confirmed_provider_payment",expect.objectContaining({target_payment_attempt_id:"attempt",provider_status:"paid",provider_amount_cents:12100}));
  });
  it.each(["failed","expired","canceled"])("opens one fresh atomic attempt after a confirmed %s provider result",async status=>{
    const next={...state.rows.payment_attempts[0],id:"new-attempt",provider_payment_id:null,idempotency_key:"mollie-group-new-attempt"};
    let prepared=0;
    state.rpc.mockImplementation(async(name:string)=>({
      data:name==="prepare_provider_payment"?(prepared++===0?state.rows.payment_attempts[0]:next)
        :name==="claim_provider_payment_check"?{action:"provider"}
          :name==="release_provider_payment_check"?true:null,
      error:null,
    }));
    state.get.mockResolvedValue({...providerPayment(),status});
    state.provider.mockResolvedValue({...providerPayment(),id:"tr_new",metadata:{...providerPayment().metadata,payment_attempt_id:"new-attempt"}});
    const response=await POST(request());expect(response.status).toBe(200);
    expect(state.provider).toHaveBeenCalledTimes(1);
    expect(state.provider).toHaveBeenCalledWith(expect.objectContaining({idempotencyKey:"mollie-group-new-attempt",metadata:expect.objectContaining({payment_attempt_id:"new-attempt"})}));
    expect(state.rows.payment_attempts[0].id).toBe("attempt");
  });
  it("does not send an open checkout if a racing webhook has already settled it",async()=>{
    state.rpc.mockImplementation(async(name:string)=>({
      data:name==="prepare_provider_payment"?state.rows.payment_attempts[0]
        :name==="claim_provider_payment_check"?{action:"provider"}
          :name==="apply_confirmed_provider_payment"?{status:"paid"}:true,
      error:null,
    }));
    expect((await POST(request())).status).toBe(409);expect(state.provider).not.toHaveBeenCalled();
  });
});
