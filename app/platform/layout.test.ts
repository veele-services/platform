import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PlatformShellAccess } from "./platform-shell";

const mocks = vi.hoisted(() => ({ context: vi.fn(), tickets: vi.fn(), notifications: vi.fn(), workspace: vi.fn(), host: null as string | null }));
vi.mock("next/headers", () => ({ headers: async () => ({ get: () => mocks.host }) }));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("NOT_FOUND"); } }));
vi.mock("@/lib/auth/context", () => ({ getAuthContext: mocks.context }));
vi.mock("@/lib/tickets/data", () => ({ getTicketAccess: mocks.tickets }));
vi.mock("@/lib/notifications/data", () => ({ getNotificationAccess: mocks.notifications }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({}) }));
vi.mock("@/lib/tickets/rpc", () => ({ ticketRpc: mocks.workspace }));
vi.mock("./platform-shell", () => ({ PlatformShell: () => null }));
import Layout from "./layout";

beforeEach(() => {
  mocks.host = null;
  vi.clearAllMocks();
  mocks.workspace.mockResolvedValue(true);
  mocks.context.mockResolvedValue({ user: { id: "fixture-user", email: "fixture@example.test", displayName: "Fictieve gebruiker" }, isPlatformAdmin: false });
  mocks.tickets.mockResolvedValue({ allowed: false, canCreate: false, canConfigure: false, canDelegate: false });
  mocks.notifications.mockResolvedValue({ allowed: false });
});

describe("shared platform shell boundary", () => {
  it("rejects the tenant origin even for a platform administrator", async () => {
    mocks.host = "fixture-tenant";
    mocks.context.mockResolvedValue({ user: { id: "fixture-user" }, isPlatformAdmin: true });
    await expect(Layout({ children: "private platform" })).rejects.toThrow("NOT_FOUND");
  });
  it("does not turn a regular authenticated account into platform access", async () => {
    await expect(Layout({ children: "private platform" })).rejects.toThrow("NOT_FOUND");
  });
  it("closes revoked sessions before reading any ticket or notification content", async () => {
    mocks.workspace.mockResolvedValue(false);
    await expect(Layout({ children: "revoked support" })).rejects.toThrow("NOT_FOUND");
    expect(mocks.tickets).not.toHaveBeenCalled();
    expect(mocks.notifications).not.toHaveBeenCalled();
  });
  it("does not disguise a database failure as access", async () => {
    mocks.workspace.mockRejectedValue(new Error("database unavailable"));
    await expect(Layout({ children: "support" })).rejects.toThrow("database unavailable");
    expect(mocks.tickets).not.toHaveBeenCalled();
  });
  it("keeps support configuration separate from tenant/platform administration and notifications", async () => {
    mocks.tickets.mockResolvedValue({ allowed: false, canCreate: false, canConfigure: true, canDelegate: false });
    const element = await Layout({ children: "support configuration" });
    const access = element.props.access as PlatformShellAccess;
    expect(access).toMatchObject({ canManage: false, canSupport: true, canConfigureSupport: true, canNotifications: false });
  });
});
