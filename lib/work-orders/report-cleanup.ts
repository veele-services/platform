import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { reportRpc } from "./report-rpc";

/** Never delete report evidence: this RPC enumerates only unconsumed upload
 * intents older than 24 hours, past their 15-minute finalization deadline. */
export async function cleanupExpiredSignatureUploads():Promise<number>{
 const admin=createAdminClient();
 const expired=await reportRpc(admin,"expired_work_order_signature_uploads",{}) as Array<{id:string;storage_path:string}>;
 if(!expired.length)return 0;
 const result=await admin.storage.from("signatures").remove(expired.map(i=>i.storage_path));
 if(result.error)throw new Error("Verlopen ondertekeninguploads konden niet worden opgeruimd");
 return result.data.length;
}
