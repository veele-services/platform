import { describe,expect,it } from "vitest";
import { resetWorkspaceHome,signedInLoginDestination } from "./workspace-destination";
describe("bounded customer auth navigation",()=>{
 it.each(["/app","/staff","/klant"])("keeps explicit reset home %s",home=>expect(resetWorkspaceHome(home)).toBe(home));
 it.each([null,undefined,"/klant?account=forged","//foreign.invalid","https://foreign.invalid","/platform","/staff/member","/klant/../platform"])("never uses a reset URL %s",next=>expect(resetWorkspaceHome(next)).toBe("/app"));
 it.each(["/klant","/klant?account=10000000-0000-4000-8000-000000000001&view=objects","/staff","/app/objecten","/platform/support"])("keeps a bounded authenticated workspace request %s",next=>expect(signedInLoginDestination(next)).toBe(next));
 it.each([null,undefined,"//foreign.invalid","https://foreign.invalid","/\\foreign.invalid","/a/..//foreign.invalid","/klant-fake","/api/tickets","/auth/confirm?token=PRIVATE"])("rejects unsafe or non-workspace login destination %s",next=>expect(signedInLoginDestination(next)).toBe("/app"));
});
