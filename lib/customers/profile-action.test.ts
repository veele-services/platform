import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  address: vi.fn(),
  rpc: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/context", () => ({
  getAuthContext: vi.fn(async () => ({
    tenant: {
      id: "aa000000-0000-4000-8000-000000000001",
      roles: ["tenant_admin"],
      enabledServices: ["planning"],
    },
  })),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({ rpc: mocks.rpc })),
}));
vi.mock("@/lib/work-orders/report-rpc", () => ({
  reportRpc: vi.fn(async (database: { rpc: typeof mocks.rpc }, name: string, args: Record<string, unknown>) => {
    const result = await database.rpc(name, args);
    if (result.error) throw result.error;
    return result.data;
  }),
}));
vi.mock("@/lib/addresses/form", () => ({ addressFromForm: mocks.address }));

import { saveCustomerProfile } from "@/app/app/klanten/actions";

function profile(sameAddress: boolean) {
  const form = new FormData();
  Object.entries({
    id: "aa000000-0000-4000-8000-000000000002",
    requestId: "aa000000-0000-4000-8000-000000000003",
    version: "0",
    name: "FICTIEF gedeeld adres",
    type: "private",
    status: "draft",
    email: "",
    billingEmail: "",
    contactEmail: "",
    paymentTerms: "30",
    ownerId: "",
  }).forEach(([key, value]) => form.set(key, value));
  if (sameAddress) form.set("sameAddress", "on");
  return form;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.rpc.mockResolvedValue({
    data: { id: "aa000000-0000-4000-8000-000000000002" },
    error: null,
  });
  mocks.address.mockImplementation(async (_form: FormData, name: string) => ({
    formatted: `FICTIEF ${name}`,
    located_at: new Date().toISOString(),
  }));
});

it("confirms a shared visit/billing address once and persists the same result", async () => {
  const form = profile(true);
  expect(await saveCustomerProfile(form)).toMatchObject({ ok: true });
  expect(mocks.address).toHaveBeenCalledExactlyOnceWith(form, "visitAddress");
  const input = mocks.rpc.mock.calls[0][1].input;
  expect(input.visitAddress).toBe(input.billingAddress);
  expect(input.visitAddress.formatted).toBe("FICTIEF visitAddress");
});

it("confirms separate visit and billing addresses independently", async () => {
  const form = profile(false);
  expect(await saveCustomerProfile(form)).toMatchObject({ ok: true });
  expect(mocks.address).toHaveBeenCalledTimes(2);
  expect(mocks.address).toHaveBeenCalledWith(form, "visitAddress");
  expect(mocks.address).toHaveBeenCalledWith(form, "billingAddress");
  const input = mocks.rpc.mock.calls[0][1].input;
  expect(input.visitAddress.formatted).toBe("FICTIEF visitAddress");
  expect(input.billingAddress.formatted).toBe("FICTIEF billingAddress");
});

it("does not persist either address when confirmation fails", async () => {
  mocks.address.mockRejectedValueOnce(new Error("FICTIEF provider failure"));
  expect(await saveCustomerProfile(profile(true))).toMatchObject({ ok: false });
  expect(mocks.rpc).not.toHaveBeenCalled();
});
