import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ insert: vi.fn(), from: vi.fn(), deliver: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/context", () => ({
  getAuthContext: async () => ({ user: { id: "admin" }, tenant: { id: "tenant", enabledServices: ["personeel"] } }),
  hasAnyRole: () => true,
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ from: mocks.from }) }));
vi.mock("@/lib/travel/forms", () => ({ mobilityFromForm: async () => ({ standard_vehicle: "car" }) }));
vi.mock("@/lib/personnel/invitations", () => ({
  requirePersonnelEmail: vi.fn(),
  preparePersonnelAccount: async () => ({ userId: "new-worker", tokenHash: null }),
  deliverPersonnelInvitation: mocks.deliver,
}));

import { invitePersonnel } from "@/app/app/operations-actions";

beforeEach(() => {
  vi.clearAllMocks();
  const query = {
    select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), ilike: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue({ data: [], error: null }),
    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    single: vi.fn().mockResolvedValue({ data: { id: "person", employee_number: "P-0001" }, error: null }),
    upsert: vi.fn().mockResolvedValue({ error: null }),
    insert: mocks.insert,
  };
  mocks.insert.mockReturnValue(query);
  mocks.from.mockReturnValue(query);
  mocks.deliver.mockResolvedValue({});
});

it.each([" 0612345678 ", "", undefined])("saves the invitation phone as mobile without populating the secondary phone (%s)", async phone => {
  const form = new FormData();
  Object.entries({ name: "Fictieve Medewerker", email: "worker@example.test", startDate: "", employeeNumberMode: "automatic", employeeNumber: "" }).forEach(([key, value]) => form.set(key, value));
  if (phone !== undefined) form.set("phone", phone);
  expect(await invitePersonnel(form)).toEqual({ ok: true, employeeNumber: "P-0001" });
  expect(mocks.insert).toHaveBeenCalledWith(expect.objectContaining({ mobile_phone: phone?.trim() || null }));
  expect(mocks.insert.mock.calls[0][0]).not.toHaveProperty("phone");
});
