import "server-only";
import {createHash} from "node:crypto";

export function deriveBrowserSessionKey(userId:string|undefined,claims:{sub?:unknown;session_id?:unknown}|undefined,host:string,localTenant="") {
  if(!userId||claims?.sub!==userId||typeof claims.session_id!=="string"||!claims.session_id)return null;
  return createHash("sha256").update(JSON.stringify([userId,claims.session_id,host,localTenant])).digest("hex");
}
