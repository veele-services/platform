import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  context: vi.fn(),
  headers: vi.fn(),
  object: vi.fn(),
  getUser: vi.fn(),
  rpc: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: mocks.headers }));
vi.mock("@/lib/auth/context", () => ({ getAuthContext: mocks.context }));
vi.mock("@/lib/objects/auth", () => ({ getObjectActor: mocks.object }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: mocks.getUser },
    rpc: mocks.rpc,
  }),
}));
import { getProductActor, productQuery, productSnapshot } from "./data";
beforeEach(() => {
  vi.clearAllMocks();
  mocks.getUser.mockResolvedValue({
    data: { user: { id: "verified-user" } },
    error: null,
  });
  mocks.headers.mockResolvedValue(new Headers());
  mocks.context.mockResolvedValue({
    isPlatformAdmin: true,
    tenant: { id: "verified-tenant" },
  });
  mocks.rpc.mockResolvedValue({ data: {}, error: null });
});
it("resolves tenant queries from the verified hostname context rather than payload tenant IDs", async () => {
  await productQuery("backoffice", "roadmap", {
    tenantId: "forged-tenant",
    group: "customer",
  });
  expect(mocks.rpc).toHaveBeenCalledWith(
    "product_query",
    expect.objectContaining({
      target_tenant: "verified-tenant",
      actor_context: "backoffice",
    }),
  );
});
it("customer identity uses the existing customer binding boundary, without management membership fallback", async () => {
  mocks.object.mockResolvedValue({
    db: { rpc: mocks.rpc },
    tenant: { id: "customer-host-tenant" },
    user: { id: "customer-user" },
  });
  expect(await getProductActor("customer")).toMatchObject({
    tenantId: "customer-host-tenant",
    userId: "customer-user",
    workspace: "customer",
  });
  expect(mocks.context).not.toHaveBeenCalled();
});
it("platform views require a platform admin on the platform hostname", async () => {
  mocks.headers.mockResolvedValue(
    new Headers({ "x-fieldgrid-tenant-slug": "other" }),
  );
  // Use the canonical internal header name, not a user-controlled request role.
  const { TENANT_SLUG_HEADER } = await import("@/lib/tenancy/hostname");
  mocks.headers.mockResolvedValue(
    new Headers({ [TENANT_SLUG_HEADER]: "other" }),
  );
  await expect(getProductActor("platform")).rejects.toMatchObject({
    code: "42501",
  });
  mocks.headers.mockResolvedValue(new Headers());
  mocks.context.mockResolvedValue({ isPlatformAdmin: false, tenant: null });
  await expect(getProductActor("platform")).rejects.toMatchObject({
    code: "42501",
  });
});
it("checks access again after parallel reads so revoked access cannot produce a server snapshot", async () => {
  const empty = { items: [], total: 0, page: 1, pageSize: 25 };
  let access = 0;
  mocks.rpc.mockImplementation(async (_name, args) =>
    args.operation === "access"
      ? ++access === 1
        ? { data: { canManage: false, canSubmit: true }, error: null }
        : { data: null, error: { code: "42501", message: "revoked" } }
      : {
          data: { ideas: empty, roadmap: empty, releases: empty },
          error: null,
        },
  );
  await expect(productSnapshot("backoffice")).rejects.toMatchObject({
    code: "42501",
  });
  expect(access).toBe(2);
});
