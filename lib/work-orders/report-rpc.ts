import "server-only";
import type { createClient } from "@/lib/supabase/server";
/** Additive RPC boundary also works while generated database types are refreshed
 * by the migration owner. Responses are narrowed by each domain loader. */
export async function reportRpc(db:Awaited<ReturnType<typeof createClient>>,name:string,args:Record<string,unknown>):Promise<unknown>{
 const rpc=db.rpc.bind(db) as unknown as (name:string,args:Record<string,unknown>)=>Promise<{data:unknown;error:{message:string}|null}>;
 const {data,error}=await rpc(name,args);if(error)throw new Error(error.message);return data;
}
