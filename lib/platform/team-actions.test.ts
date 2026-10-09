import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ actor: vi.fn(), rpc: vi.fn(), prepare: vi.fn(), deliver: vi.fn(), mail: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("./team", () => ({ getPlatformTeamActor: mocks.actor }));
vi.mock("@/lib/tickets/rpc", () => ({ ticketRpc: mocks.rpc }));
vi.mock("./team-invitation", () => ({ deliverSupportInvitation: mocks.deliver }));
vi.mock("@/lib/management/invitations", () => ({ prepareManagementAccount: mocks.prepare, requireManagementMail: mocks.mail }));
import { inviteSupportMember, changeSupportMember } from "@/app/platform/team/actions";
const input = { name: "Fictieve supportmedewerker", email: "support@example.test", allTenants: true, tenantIds: [], requestId: "11111111-1111-4111-8111-111111111111" };
beforeEach(() => { vi.clearAllMocks(); mocks.actor.mockResolvedValue({ db: {} }); mocks.rpc.mockResolvedValue({ userId: "account" }); mocks.prepare.mockResolvedValue("account"); mocks.deliver.mockResolvedValue({}); });
it("authorizes the fresh platform owner before Auth or provider operations", async () => {
  mocks.rpc.mockRejectedValueOnce(new Error("Log opnieuw in."));
  expect(await inviteSupportMember(input)).toEqual({ ok: false, error: "Log opnieuw in." });
  expect(mocks.prepare).not.toHaveBeenCalled(); expect(mocks.deliver).not.toHaveBeenCalled();
});
it("binds only the authorized account and preserves the form request key", async () => {
  expect(await inviteSupportMember(input)).toEqual({ ok: true });
  expect(mocks.rpc).toHaveBeenNthCalledWith(2, {}, "platform_team_command", expect.objectContaining({ command: "invite", request_id: input.requestId, input: expect.objectContaining({ userId: "account", allTenants: true, version: 0 }) }));
  expect(mocks.deliver).toHaveBeenCalledWith({}, { userId: "account" });
});
it("does not send when a live membership binding fails after account preparation", async () => {
  mocks.rpc.mockResolvedValueOnce(true).mockRejectedValueOnce(new Error("Ingetrokken."));
  expect((await inviteSupportMember(input)).ok).toBe(false); expect(mocks.deliver).not.toHaveBeenCalled();
});
it("rejects privilege injection and empty scope before side effects", async () => {
  expect((await inviteSupportMember({ ...input, isPlatformAdmin: true })).ok).toBe(false);
  expect((await inviteSupportMember({ ...input, allTenants: false })).ok).toBe(false);
  expect(mocks.actor).not.toHaveBeenCalled();
});
it("revokes through the authenticated boundary without mail or Auth resets", async () => {
  expect(await changeSupportMember({ command: "revoke", userId: input.requestId, version: 1, requestId: input.requestId })).toEqual({ ok: true });
  expect(mocks.prepare).not.toHaveBeenCalled(); expect(mocks.deliver).not.toHaveBeenCalled();
});
it("preserves uncertain invitation delivery as a warning", async () => {
  mocks.deliver.mockResolvedValue({ warning: "Providerontvangst onzeker." });
  expect(await inviteSupportMember(input)).toEqual({ ok: true, warning: "Providerontvangst onzeker." });
});
