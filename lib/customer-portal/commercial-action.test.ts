import { beforeEach,describe,expect,it,vi } from "vitest";
const mocks=vi.hoisted(()=>({rpc:vi.fn(),actor:vi.fn(),revalidate:vi.fn()}));
vi.mock("@/lib/objects/auth",()=>({getObjectActor:mocks.actor}));vi.mock("next/cache",()=>({revalidatePath:mocks.revalidate}));
import { saveCustomerCommercial } from "./commercial-action";
const tenant="10000000-0000-4000-8000-000000000001",account="10000000-0000-4000-8000-000000000002",id="10000000-0000-4000-8000-000000000003",commandId="10000000-0000-4000-8000-000000000004";
const input={accountId:account,commandId,action:{command:"decide",input:{id,version:3,revision:2,decision:"accepted",name:"Klant",evidence:"",confirmed:true}}};
beforeEach(()=>{vi.resetAllMocks();mocks.actor.mockResolvedValue({tenant:{id:tenant},db:{rpc:mocks.rpc}});mocks.rpc.mockResolvedValue({data:{id,version:4,status:"accepted"},error:null});});
describe("customer offer decision action",()=>{
 it("binds the decision to hostname tenant, selected account and explicit immutable version",async()=>{expect(await saveCustomerCommercial(input)).toMatchObject({ok:true,status:"accepted"});expect(mocks.rpc).toHaveBeenCalledWith("customer_portal_commercial_command",{target_tenant:tenant,target_account:account,command_id:commandId,command:"decide",input:input.action.input});});
 it.each(["price","customer_id","tenant_id","owner_id"])("refuses forged commercial field %s",async field=>{expect(await saveCustomerCommercial({...input,action:{...input.action,input:{...input.action.input,[field]:tenant}}})).toMatchObject({ok:false});expect(mocks.actor).not.toHaveBeenCalled();});
 it("requires actual confirmation and change/rejection reasons",async()=>{for(const change of [{confirmed:false},{decision:"rejected"},{decision:"change_requested"}])expect(await saveCustomerCommercial({...input,action:{...input.action,input:{...input.action.input,...change}}})).toMatchObject({ok:false});expect(mocks.actor).not.toHaveBeenCalled();});
 it("does not expose internal database errors or accept foreign receipts",async()=>{mocks.rpc.mockResolvedValueOnce({data:null,error:{code:"40001",message:"PRIVATE"}});const result=await saveCustomerCommercial(input);expect(result).toMatchObject({ok:false,code:"40001"});expect(JSON.stringify(result)).not.toContain("PRIVATE");mocks.rpc.mockResolvedValueOnce({data:{id:tenant,version:4,status:"accepted"},error:null});expect(await saveCustomerCommercial(input)).toMatchObject({ok:false});});
});
