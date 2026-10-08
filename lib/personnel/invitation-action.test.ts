import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ insert: vi.fn(), from: vi.fn(), deliver: vi.fn(), rpc: vi.fn(), auth: vi.fn(), prepare: vi.fn(), mobility: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/context", () => ({
  getAuthContext: mocks.auth,
  hasAnyRole: () => true,
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ from: mocks.from, rpc: mocks.rpc }) }));
vi.mock("@/lib/travel/forms", () => ({ mobilityFromForm: mocks.mobility }));
vi.mock("@/lib/personnel/invitations", () => ({
  requirePersonnelEmail: vi.fn(),
  preparePersonnelAccount: mocks.prepare,
  deliverPersonnelInvitation: mocks.deliver,
}));

import { invitePersonnel } from "@/app/app/operations-actions";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({ user: { id: "admin" }, tenant: { id: "tenant", enabledServices: ["personeel"] } });
  mocks.prepare.mockResolvedValue({ userId: "new-worker", tokenHash: null });
  mocks.mobility.mockResolvedValue({ standard_vehicle: "car" });
  mocks.rpc.mockResolvedValue({ data: null, error: null });
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

function invitation() {
  const form = new FormData();
  Object.entries({ name: "Fictieve Medewerker", email: "worker@example.test", startDate: "", employeeNumberMode: "automatic", employeeNumber: "" }).forEach(([key,value])=>form.set(key,value));
  return form;
}

it("requires the concrete invitation right before preparing an Auth account",async()=>{
  mocks.auth.mockResolvedValue({user:{id:"admin"},tenant:{id:"tenant",enabledServices:["personeel"],permissions:["backoffice.access","backoffice.personnel.write"]}});
  expect((await invitePersonnel(invitation())).ok).toBe(false);
  expect(mocks.prepare).not.toHaveBeenCalled();expect(mocks.rpc).not.toHaveBeenCalled();
});

it("rechecks rights after mobility IO before account preparation",async()=>{
  mocks.mobility.mockImplementation(async()=>{ mocks.auth.mockResolvedValue({user:{id:"admin"},tenant:{id:"tenant",enabledServices:["personeel"],permissions:[]}});return{}; });
  expect((await invitePersonnel(invitation())).ok).toBe(false);
  expect(mocks.prepare).not.toHaveBeenCalled();expect(mocks.insert).not.toHaveBeenCalled();
});

it("stops before the membership binder when rights change during Auth preparation",async()=>{
  mocks.prepare.mockImplementation(async()=>{mocks.auth.mockResolvedValue({user:{id:"other-user"},tenant:{id:"tenant",enabledServices:["personeel"]}});return{userId:"new-worker",tokenHash:null};});
  expect((await invitePersonnel(invitation())).ok).toBe(false);
  expect(mocks.rpc).not.toHaveBeenCalled();expect(mocks.insert).not.toHaveBeenCalled();expect(mocks.deliver).not.toHaveBeenCalled();
});

it("lets only the authenticated binder choose staff membership roles",async()=>{
  expect((await invitePersonnel(invitation())).ok).toBe(true);
  expect(mocks.rpc).toHaveBeenCalledWith("bind_personnel_account",{target_tenant:"tenant",expected_user:"new-worker",expected_email:"worker@example.test"});
  expect(mocks.deliver).toHaveBeenCalledWith(expect.objectContaining({confirmAccess:expect.any(Function)}));
});

it.each([" 0612345678 ", "", undefined])("saves the invitation phone as mobile without populating the secondary phone (%s)", async phone => {
  const form = new FormData();
  Object.entries({ name: "Fictieve Medewerker", email: "worker@example.test", startDate: "", employeeNumberMode: "automatic", employeeNumber: "" }).forEach(([key, value]) => form.set(key, value));
  if (phone !== undefined) form.set("phone", phone);
  expect(await invitePersonnel(form)).toEqual({ ok: true, employeeNumber: "P-0001" });
  expect(mocks.insert).toHaveBeenCalledWith(expect.objectContaining({ mobile_phone: phone?.trim() || null }));
  expect(mocks.insert.mock.calls[0][0]).not.toHaveProperty("phone");
});
