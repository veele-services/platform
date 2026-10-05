import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), rpc: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/context", () => ({ getAuthContext: mocks.auth }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn(async () => ({ rpc: mocks.rpc })) }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));

import { updateStaffContact } from "@/app/staff/actions";

const tenant = { id: "bb000000-0000-4000-8000-000000000001", roles: ["staff"], enabledServices: ["personeel"] };
const input = { version: 4, fullName: "Robin Test", mobilePhone: "+31612345678" };
beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({ user: { id: "aa000000-0000-4000-8000-000000000001" }, tenant });
  mocks.rpc.mockResolvedValue({ data: { version: "5" }, error: null });
});

it("updates only the own contact fields using the resolved tenant and returns the database version", async () => {
  expect(await updateStaffContact(input)).toEqual({ ok: true, version: 5 });
  expect(mocks.rpc).toHaveBeenCalledWith("staff_update_profile", { target_tenant: tenant.id, input });
});

it.each([
  { tenant: null },
  { tenant: { ...tenant, roles: ["management"] } },
  { tenant: { ...tenant, enabledServices: [] } },
])("rejects a caller without personnel access before reaching the RPC (%j)", async (context) => {
  mocks.auth.mockResolvedValue(context);
  expect(await updateStaffContact(input)).toEqual({ ok: false, error: "Personeelstoegang vereist" });
  expect(mocks.rpc).not.toHaveBeenCalled();
});

it.each(["email", "personnelId", "tenantId", "homeAddress"])("rejects the extra field %s instead of accepting hidden profile or identity changes", async (key) => {
  expect((await updateStaffContact({ ...input, [key]: "other@fieldgrid.test" })).ok).toBe(false);
  expect(mocks.rpc).not.toHaveBeenCalled();
});

it("retains the database conflict instead of accepting a stale draft", async () => {
  mocks.rpc.mockResolvedValue({ data: null, error: { message: "Je profiel is intussen gewijzigd. Laad het opnieuw." } });
  expect(await updateStaffContact(input)).toEqual({ ok: false, error: "Je profiel is intussen gewijzigd. Laad het opnieuw." });
});
