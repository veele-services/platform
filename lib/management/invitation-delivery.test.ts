import { beforeEach, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import type { TenantContext } from "@/lib/auth/context";
const mocks = vi.hoisted(() => ({ access: vi.fn(), provider: vi.fn(), logo: vi.fn(), snapshot: vi.fn(), update: vi.fn(), events: [] as string[] }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/env/server", () => ({ getServerEnv: () => ({ SENDGRID_API_KEY: "fake", SENDGRID_FROM_EMAIL: "sender@example.test", DEPLOY_TARGET: "local" }) }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ from: (table: string) => table === "mail_deliveries" ? { insert: () => ({ select: () => ({ single: async () => ({ data: { id: "delivery" }, error: null }) }) }), update: mocks.update } : { select: () => ({ eq: () => ({ eq: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: "member" }, error: null }) }) }) }) }) }) } }) }));
vi.mock("./rpc", () => ({ managementRpc: mocks.access }));
vi.mock("@/lib/tenancy/workspace-url", () => ({ tenantWorkspaceUrl: async () => "https://tenant.example.test/login" }));
vi.mock("@/lib/notifications/brand-asset", () => ({ freezeEmailLogo: mocks.logo }));
vi.mock("@/lib/communications/tenant-email-brand", () => ({ withTenantEmailBrand: async () => ({}) }));
vi.mock("@/lib/communications/management-invitation", () => ({ renderManagementInvitation: () => ({ subject: "Fictieve uitnodiging", html: "<p>OTP</p>", text: "OTP" }) }));
vi.mock("@/lib/notifications/mail-snapshot", () => ({ freezeMailSnapshot: mocks.snapshot, mailFailureOutcome: () => "uncertain", mailFailureMessage: () => "Providerontvangst onzeker." }));
vi.mock("@/lib/providers/sendgrid", () => ({ sendEmail: mocks.provider }));
import { deliverManagementInvitation } from "./invitations";
const tenant = { id: "11111111-1111-4111-8111-111111111111", slug: "tenant", name: "Tenant", primaryColor: "#112233", accentColor: "#445566", logoPath: null } as TenantContext;
const result = { id: "22222222-2222-4222-8222-222222222222", userId: "33333333-3333-4333-8333-333333333333", email: "manager@example.test", name: "Manager", role: "Planning", deliveryId: "44444444-4444-4444-8444-444444444444" };
const actorDb = {} as SupabaseClient<Database>;
beforeEach(() => {
 vi.clearAllMocks();mocks.events.length=0;
 mocks.update.mockReturnValue({ eq: async () => ({ error: null }) });
 mocks.logo.mockImplementation(async () => { mocks.events.push("logo");return null; });
 mocks.snapshot.mockImplementation(async () => { mocks.events.push("snapshot");return { subject: "Fictieve uitnodiging", html: "OTP", text: "OTP" }; });
 mocks.access.mockImplementation(async () => { mocks.events.push("authorize");return true; });
 mocks.provider.mockImplementation(async () => { mocks.events.push("provider");return { id: "provider-message" }; });
});
it("rechecks the exact owner and invitation receipt after branding IO and immediately before provider", async () => {
 expect(await deliverManagementInvitation(tenant,result,actorDb)).toEqual({});
 expect(mocks.events).toEqual(["logo","snapshot","authorize","provider"]);
 expect(mocks.access).toHaveBeenCalledWith(actorDb,"management_invitation_access",{ target_tenant: tenant.id, target_member: result.id, target_user: result.userId, delivery_id: result.deliveryId, recipient: result.email });
});
it("does not deliver when hybrid management access is revoked while staff membership remains active", async () => {
 mocks.access.mockResolvedValue(false);
 expect(await deliverManagementInvitation(tenant,result,actorDb)).toEqual({warning:"De uitnodiging of toegang is intussen ingetrokken; er is niets verstuurd."});
 expect(mocks.provider).not.toHaveBeenCalled();expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({status:"failed"}));
});
it("does not deliver after the owner session or OTP freshness expires during file IO", async () => {
 mocks.access.mockRejectedValue(new Error("Log opnieuw in."));
 expect(await deliverManagementInvitation(tenant,result,actorDb)).toEqual({warning:"Log opnieuw in."});expect(mocks.provider).not.toHaveBeenCalled();
});
