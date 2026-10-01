import { describe,expect,it } from "vitest";
import { cleanAccountBrowserState,cosmeticPlanningPreferences,customerScroll,rememberCustomerScroll } from "./browser-state";
function storage(seed:Record<string,string>):Storage{
  const values=new Map(Object.entries(seed));return {get length(){return values.size;},key:i=>[...values.keys()][i]??null,getItem:key=>values.get(key)??null,setItem:(key,value)=>{values.set(key,value);},removeItem:key=>{values.delete(key);},clear:()=>values.clear()};
}
describe("account browser-state minimization",()=>{
  it("removes legacy search values and search-bearing keys while preserving visual preferences and unrelated storage",()=>{
    const local=storage({"fieldgrid:planboard:tenant:actor":JSON.stringify({search:"FICTITIOUS private search",from:"08:00",to:"17:00",zoom:"wide",height:190,collapsed:true,view:"all",status:"completed",address:"FICTITIOUS private address"}),unrelated:"keep"});
    const session=storage({"customer-scroll:/app/klanten?q=FICTITIOUS": "140",unrelated:"also keep"});
    rememberCustomerScroll("FICTITIOUS transient query",140);
    cleanAccountBrowserState(local,session);
    expect(JSON.parse(local.getItem("fieldgrid:planboard:tenant:actor")!)).toEqual({from:"08:00",to:"17:00",zoom:"wide",height:190,collapsed:true,view:"all",status:"completed"});
    expect(session.length).toBe(1);expect(local.getItem("unrelated")).toBe("keep");expect(session.getItem("unrelated")).toBe("also keep");
    expect(customerScroll("FICTITIOUS transient query")).toBeUndefined();
  });
  it("does not persist unrecognized strings or inherited enum names",()=>{
    expect(cosmeticPlanningPreferences({view:"toString",status:"__proto__",from:"FICTITIOUS",height:NaN,search:"private"})).toEqual({});
    expect(cosmeticPlanningPreferences(null)).toEqual({});
  });
  it("keeps transient list scroll during same-session navigation but clears it at the account boundary",()=>{
    const local=storage({}),session=storage({});rememberCustomerScroll("tenant:/app/klanten",320);
    cleanAccountBrowserState(local,session,false);expect(customerScroll("tenant:/app/klanten")).toBe(320);
    cleanAccountBrowserState(local,session);expect(customerScroll("tenant:/app/klanten")).toBeUndefined();
  });
});
