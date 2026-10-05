import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ actor: vi.fn(), customerRpc: vi.fn(), adminRpc: vi.fn(), select: vi.fn(), update: vi.fn(),
  merchant: vi.fn(), create: vi.fn(), get: vi.fn(), revalidate: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/objects/auth", () => ({ getObjectActor: m.actor }));
vi.mock("@/lib/payments/merchant", () => ({ requireTenantMerchant: m.merchant }));
vi.mock("@/lib/providers/mollie", () => ({ createMolliePayment: m.create, getMolliePayment: m.get }));
vi.mock("@/lib/tenancy/hostname", () => ({ tenantAppUrl: () => "https://fixture.staging.fieldgrid.nl/klant" }));
vi.mock("next/cache", () => ({ revalidatePath: m.revalidate }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => {
  const query = { select: () => query, eq: () => query, single: m.select, update: (value: unknown) => { m.update(value); return query; }, is: () => Promise.resolve({ error: null }) };
  return { from: () => query, rpc: m.adminRpc };
} }));

import { startCustomerPayment } from "./payment-action";

const tenant = "10000000-0000-4000-8000-000000000001", account = "20000000-0000-4000-8000-000000000001";
const invoice = "30000000-0000-4000-8000-000000000001", command = "40000000-0000-4000-8000-000000000001";
const attempt = { id: "50000000-0000-4000-8000-000000000001", tenant_id: tenant, provider: "mollie", provider_payment_id: null,
  merchant_profile_id: "pfl_Fictional", provider_mode: "test", invoice_group_id: "60000000-0000-4000-8000-000000000001",
  amount_cents: 7500, currency: "EUR", status: "open", idempotency_key: "fixture-exact-key", checkout_url: null };
const input = { accountId: account, invoiceIds: [invoice], commandId: command };
const payment = () => ({ id: "tr_Fictional", mode: "test", profileId: "pfl_Fictional", status: "open", amount: { value: "75.00", currency: "EUR" },
  metadata: { tenant_id: tenant, payment_attempt_id: attempt.id, invoice_group_id: attempt.invoice_group_id },
  _links: { checkout: { href: "https://www.mollie.com/checkout/fictional" } } });

beforeEach(() => {
  vi.resetAllMocks();
  m.actor.mockResolvedValue({ tenant: { id: tenant, name: "Fictieve leverancier", slug: "fixture" }, db: { rpc: m.customerRpc } });
  m.customerRpc.mockImplementation(async (name: string) => ({ error: null, data: name === "customer_portal_invoices" ? [{ id: invoice }] : attempt.id }));
  m.merchant.mockResolvedValue({ mode: "test", profileId: "pfl_Fictional" });
  m.select.mockResolvedValue({ data: { ...attempt }, error: null });
  m.adminRpc.mockImplementation(async (name: string) => ({ error: null, data: name === "claim_provider_payment_check" ? { action: "provider" } : { status: "open" } }));
  m.create.mockResolvedValue(payment());
  m.get.mockResolvedValue(payment());
});

describe("customer payment provider boundary", () => {
  it("creates only the prepared remaining amount and rechecks scope before returning checkout", async () => {
    expect(await startCustomerPayment(input)).toEqual({ ok: true, checkoutUrl: payment()._links.checkout.href });
    expect(m.create).toHaveBeenCalledWith(expect.objectContaining({ amountCents: 7500, idempotencyKey: attempt.idempotency_key,
      metadata: payment().metadata, redirectUrl: `https://fixture.staging.fieldgrid.nl/klant?account=${account}&view=invoices&payment=return` }));
    expect(m.customerRpc.mock.calls.filter(([name]) => name === "customer_portal_payment_prepare")).toHaveLength(2);
    expect(m.adminRpc).toHaveBeenLastCalledWith("release_provider_payment_check", expect.objectContaining({ target_attempt: attempt.id }));
    expect(m.update).toHaveBeenCalledOnce();
  });
  it("rejects an unscoped invoice before merchant/provider calls", async () => {
    m.customerRpc.mockResolvedValueOnce({ error: null, data: [] });
    expect((await startCustomerPayment(input)).ok).toBe(false);
    expect(m.merchant).not.toHaveBeenCalled();
    expect(m.create).not.toHaveBeenCalled();
  });
  it("requires operator-bound and provider-verified merchant identity", async () => {
    m.merchant.mockRejectedValueOnce(new Error("PRIVATE MERCHANT DETAIL"));
    const result = await startCustomerPayment(input);
    expect(result.ok).toBe(false); expect(JSON.stringify(result)).not.toContain("PRIVATE");
    expect(m.customerRpc).toHaveBeenCalledTimes(1); expect(m.create).not.toHaveBeenCalled();
  });
  it("never settles or publishes a checkout from a different provider merchant", async () => {
    m.create.mockResolvedValueOnce({ ...payment(), profileId: "pfl_Other" });
    expect((await startCustomerPayment(input)).ok).toBe(false);
    expect(m.update).not.toHaveBeenCalled();
    expect(m.adminRpc.mock.calls.map(([name]) => name)).toEqual(["claim_provider_payment_check", "release_provider_payment_check"]);
  });
  it("releases a provider lease after timeout and never claims payment confirmation", async () => {
    m.create.mockRejectedValueOnce(new Error("PRIVATE PROVIDER TIMEOUT"));
    const result = await startCustomerPayment(input);
    expect(result.ok).toBe(false); expect(JSON.stringify(result)).not.toContain("PRIVATE");
    expect(m.update).not.toHaveBeenCalled();
    expect(m.adminRpc).toHaveBeenLastCalledWith("release_provider_payment_check", expect.any(Object));
  });
  it("does not return checkout after customer access is revoked during provider I/O", async () => {
    m.customerRpc.mockResolvedValueOnce({ data: [{ id: invoice }], error: null })
      .mockResolvedValueOnce({ data: attempt.id, error: null })
      .mockResolvedValueOnce({ data: null, error: { code: "42501" } });
    expect(await startCustomerPayment(input)).toMatchObject({ ok: false });
    expect(m.create).toHaveBeenCalledOnce();
    expect(m.adminRpc).toHaveBeenLastCalledWith("release_provider_payment_check", expect.any(Object));
  });
  it("reads current status after a reuse claim so concurrent settlement cannot return a stale checkout", async () => {
    m.adminRpc.mockResolvedValueOnce({ data: { action: "reuse" }, error: null });
    m.select.mockResolvedValueOnce({ data: { ...attempt, checkout_url: payment()._links.checkout.href }, error: null })
      .mockResolvedValueOnce({ data: { status: "paid", checkout_url: null }, error: null });
    expect(await startCustomerPayment(input)).toEqual({ ok: true, settled: true });
    expect(m.create).not.toHaveBeenCalled(); expect(m.get).not.toHaveBeenCalled();
  });
  it("does not start a parallel provider request while another lease is active", async () => {
    m.adminRpc.mockResolvedValueOnce({ data: { action: "busy" }, error: null });
    expect((await startCustomerPayment(input)).ok).toBe(false);
    expect(m.create).not.toHaveBeenCalled(); expect(m.update).not.toHaveBeenCalled();
    expect(m.adminRpc).toHaveBeenCalledTimes(1);
  });
  it("keeps verified paid settlement authoritative when a late provider response still says open", async () => {
    m.adminRpc.mockImplementation(async (name: string) => ({ error: null, data: name === "claim_provider_payment_check" ? { action: "provider" } : { status: "paid" } }));
    expect(await startCustomerPayment(input)).toEqual({ ok: true, settled: true });
  });
});
