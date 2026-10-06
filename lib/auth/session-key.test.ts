import {createHash} from "node:crypto";
import {expect,it,vi} from "vitest";
vi.mock("server-only",()=>({}));
import {deriveBrowserSessionKey} from "./session-key";

it("keeps the existing signal format and binds it to identity, session and host",()=>{
 const claims={sub:"fixture-user",session_id:"fixture-session"};
 const key=deriveBrowserSessionKey("fixture-user",claims,"tenant-a","local-a");
 expect(key).toBe(createHash("sha256").update(JSON.stringify(["fixture-user","fixture-session","tenant-a","local-a"])).digest("hex"));
 expect(deriveBrowserSessionKey("other-user",{...claims,sub:"other-user"},"tenant-a","local-a")).not.toBe(key);
 expect(deriveBrowserSessionKey("fixture-user",{...claims,session_id:"other-session"},"tenant-a","local-a")).not.toBe(key);
 expect(deriveBrowserSessionKey("fixture-user",claims,"tenant-b","local-a")).not.toBe(key);
 expect(deriveBrowserSessionKey("fixture-user",claims,"tenant-a","local-b")).not.toBe(key);
});
it.each([undefined,{sub:"other-user",session_id:"fixture-session"},{sub:"fixture-user"},{sub:"fixture-user",session_id:""},{sub:"fixture-user",session_id:123}])("rejects unverified or missing session claims %j",claims=>{
 expect(deriveBrowserSessionKey("fixture-user",claims,"tenant-a")).toBeNull();
});
