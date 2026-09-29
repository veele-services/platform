import { describe, expect, it } from "vitest";
import { mollieAmount, paymentAllocations } from "./payments";

describe("betalingsbedragen", () => {
  it("verdeelt één betaling exact over meerdere openstaande facturen", () => {
    expect(paymentAllocations([{ id: "a", totalCents: 12_100, paidCents: 2_100 }, { id: "b", totalCents: 5_050, paidCents: 0 }])).toEqual({ allocations: [{ invoiceId: "a", amountCents: 10_000 }, { invoiceId: "b", amountCents: 5_050 }], totalCents: 15_050 });
  });
  it("formatteert centen zonder binaire afronding", () => expect(mollieAmount(15_050)).toBe("150.50"));
  it("weigert nul en onveilige centbedragen", () => { expect(() => mollieAmount(0)).toThrow(); expect(() => mollieAmount(Number.MAX_SAFE_INTEGER + 1)).toThrow(); });
});
