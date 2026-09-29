import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ hostSlug: null as string | null, target: "staging", admin: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: async () => new Headers(mocks.hostSlug ? { "x-fieldgrid-tenant-slug": mocks.hostSlug } : {}) }));
vi.mock("@/lib/env/server", () => ({ getServerEnv: () => ({ DEPLOY_TARGET: mocks.target }) }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.admin }));
vi.mock("@/lib/tenancy/hostname", () => import("../tenancy/hostname"));

import { getInvitationTenant } from "./invite-tenant";

describe("personnel invitation tenant boundary", () => {
  beforeEach(() => { mocks.hostSlug = null; mocks.target = "staging"; mocks.admin.mockReset(); });

  it.each(["", "../another", "TENANT", "tenant.example.com"])("rejects invalid slug %s before looking up privileged data", async (slug) => {
    expect(await getInvitationTenant(slug)).toBeNull();
    expect(mocks.admin).not.toHaveBeenCalled();
  });

  it("rejects the platform origin and a mismatched tenant origin in staging", async () => {
    expect(await getInvitationTenant("employer")).toBeNull();
    mocks.hostSlug = "another-employer";
    expect(await getInvitationTenant("employer")).toBeNull();
    expect(mocks.admin).not.toHaveBeenCalled();
  });

  it.each(["staging", "local"])("allows only an active personnel-enabled tenant in %s", async (target) => {
    mocks.target = target;
    mocks.hostSlug = target === "local" ? null : "employer";
    const tenant = { id: "tenant-id", name: "Employer", slug: "employer" };
    const query = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), maybeSingle: vi.fn() };
    mocks.admin.mockReturnValue({ from: vi.fn().mockReturnValue(query) });
    query.maybeSingle.mockResolvedValueOnce({ data: tenant }).mockResolvedValueOnce({ data: { enabled_services: ["personeel"] } });
    expect(await getInvitationTenant("employer")).toEqual(tenant);
    expect(query.eq).toHaveBeenCalledWith("status", "active");
    query.maybeSingle.mockResolvedValueOnce({ data: tenant }).mockResolvedValueOnce({ data: { enabled_services: [] } });
    expect(await getInvitationTenant("employer")).toBeNull();
    query.maybeSingle.mockResolvedValueOnce({ data: null });
    expect(await getInvitationTenant("employer")).toBeNull();
  });
});
