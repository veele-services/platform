import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ actor: vi.fn(), rpc: vi.fn(), prepare: vi.fn(), deliver: vi.fn(), mail: vi.fn() }));
vi.mock("server-only", () => ({}));vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/management/auth", () => ({ getManagementActor: mocks.actor }));
vi.mock("@/lib/management/rpc", () => ({ managementRpc: mocks.rpc }));
vi.mock("@/lib/management/invitations", () => ({ prepareManagementAccount: mocks.prepare, deliverManagementInvitation: mocks.deliver, requireManagementMail: mocks.mail }));
import { inviteManagementUser, runManagementCommand } from "@/app/app/gebruikers/actions";
const input = { name: "Fictieve manager", email: "manager@example.test", roleId: "11111111-1111-4111-8111-111111111111", requestId: "22222222-2222-4222-8222-222222222222" };
beforeEach(() => { vi.clearAllMocks();mocks.actor.mockResolvedValue({context:{tenant:{id:"33333333-3333-4333-8333-333333333333"}},db:{}});mocks.rpc.mockResolvedValue({id:"member"});mocks.prepare.mockResolvedValue("account");mocks.deliver.mockResolvedValue({}); });
it("runs fresh database-owner authorization before Auth account preparation or email", async () => {
 mocks.rpc.mockRejectedValueOnce(new Error("Log opnieuw in."));expect(await inviteManagementUser(input)).toEqual({ok:false,error:"Log opnieuw in."});expect(mocks.prepare).not.toHaveBeenCalled();expect(mocks.deliver).not.toHaveBeenCalled();
});
it("never delivers mail when membership binding fails after safe account preparation", async () => {
 mocks.rpc.mockResolvedValueOnce({authorized:true}).mockRejectedValueOnce(new Error("Geen toegang."));expect(await inviteManagementUser(input)).toEqual({ok:false,error:"Geen toegang."});expect(mocks.prepare).toHaveBeenCalledWith(input.email);expect(mocks.deliver).not.toHaveBeenCalled();
});
it("binds the exact owner-authorized role and delivers only the DB result", async () => {
 expect(await inviteManagementUser(input)).toEqual({ok:true});expect(mocks.rpc).toHaveBeenNthCalledWith(1,{},"management_command",expect.objectContaining({command:"prepare_invite",input:expect.objectContaining({roleId:input.roleId})}));expect(mocks.rpc).toHaveBeenNthCalledWith(2,{},"management_command",expect.objectContaining({command:"invite",request_id:input.requestId,input:expect.objectContaining({userId:"account",email:input.email,roleId:input.roleId})}));expect(mocks.deliver).toHaveBeenCalledWith(expect.anything(),{id:"member"},{});
});
it("surfaces an uncertain provider outcome while preserving the authorized membership", async () => {
 mocks.deliver.mockResolvedValue({warning:"Providerontvangst onzeker."});expect(await inviteManagementUser(input)).toEqual({ok:true,warning:"Providerontvangst onzeker."});
});
it("uses ordinary live backoffice identity for target-side ownership acceptance", async () => {
 await runManagementCommand({command:"accept_transfer",input:{transferId:input.roleId},requestId:input.requestId});expect(mocks.actor).toHaveBeenCalledWith("backoffice.access");expect(mocks.deliver).not.toHaveBeenCalled();
});
