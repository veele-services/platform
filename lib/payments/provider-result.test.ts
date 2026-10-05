import { describe, expect, it, vi } from "vitest";
vi.mock("server-only",()=>({}));
import { verifiedCheckout, verifiedPayment, type PaymentIdentity } from "./provider-result";
import type { MolliePayment } from "@/lib/providers/mollie";

const attempt:PaymentIdentity={id:"attempt",tenant_id:"tenant",invoice_group_id:"group",provider:"mollie",provider_payment_id:"tr_fictional",provider_mode:"test",amount_cents:12100,currency:"EUR"};
const payment=():MolliePayment=>({id:"tr_fictional",mode:"test",status:"paid",amount:{value:"121.00",currency:"EUR"},metadata:{tenant_id:"tenant",invoice_group_id:"group",payment_attempt_id:"attempt"}});
describe("provider evidence identity",()=>{
  it("binds customer settlement to the frozen merchant profile",()=>{
    const bound={...attempt,merchant_profile_id:"pfl_Fictional"};
    expect(verifiedPayment({...payment(),profileId:"pfl_Fictional"},bound)).toBe(12100);
    expect(()=>verifiedPayment(payment(),bound)).toThrow();
    expect(()=>verifiedPayment({...payment(),profileId:"pfl_Other"},bound)).toThrow();
  });
  it("accepts an exact current provider response and a new unbound provider id",()=>{
    expect(verifiedPayment(payment(),attempt)).toBe(12100);
    expect(verifiedPayment(payment(),{...attempt,provider_payment_id:null})).toBe(12100);
  });
  it.each([
    {id:"tr_other"},{id:"unexpected"},{mode:"live"},{status:"invented"},
    {amount:{value:"120.99",currency:"EUR"}},{amount:{value:"121.00",currency:"USD"}},
    {amount:{value:"121.000",currency:"EUR"}},{amount:{value:"1e2",currency:"EUR"}},
    {amount:{value:"90071992547409920.00",currency:"EUR"}},
    {metadata:null},{metadata:{tenant_id:"other",invoice_group_id:"group",payment_attempt_id:"attempt"}},
    {metadata:{tenant_id:"tenant",invoice_group_id:"other",payment_attempt_id:"attempt"}},
    {metadata:{tenant_id:"tenant",invoice_group_id:"group",payment_attempt_id:"other"}},
  ])("rejects mismatched or malformed evidence %j",change=>{
    expect(()=>verifiedPayment({...payment(),...change} as MolliePayment,attempt)).toThrow();
  });
  it.each(["http://www.mollie.com/","https://mollie.com.evil.invalid/","https://mollie.com@evil.invalid/","https://user:pass@www.mollie.com/","https://www.mollie.com:8080/"])("denies non-provider checkout %s",href=>{
    expect(()=>verifiedCheckout({...payment(),_links:{checkout:{href}}})).toThrow();
  });
});
