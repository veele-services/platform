import "server-only";
import { cookies, headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { TENANT_SLUG_HEADER } from "@/lib/tenancy/hostname";
import { BROWSER_SESSION_HEADER } from "./session-signal";
import { deriveBrowserSessionKey } from "./session-key";

/** Bind browser chrome to the identity that rendered the document. Not a
 * credential, capability or substitute for current resource authorization. */
export async function browserSessionKey(): Promise<string | null> {
  // Reuse this request's live proxy verification, not a cached browser or
  // earlier request's identity. The proxy strips all incoming copies first.
  const requestHeaders=await headers();
  const verified=requestHeaders.get(BROWSER_SESSION_HEADER);
  if(verified!==null)return /^[a-f0-9]{64}$/.test(verified)?verified:null;
  // Keep the live check for callers outside the normal HTTP proxy boundary.
  const db=await createClient();
  const [user,claims]=await Promise.all([db.auth.getUser(),db.auth.getClaims()]);
  const id=user.data.user?.id,session=claims.data?.claims?.session_id;
  if(user.error||claims.error||!id||claims.data?.claims?.sub!==id||typeof session!=="string"||!session)return null;
  const host=requestHeaders.get(TENANT_SLUG_HEADER)??"platform";
  const localTenant=(process.env.DEPLOY_TARGET??"local")==="local"?(await cookies()).get("fieldgrid_tenant_id")?.value??"":"";
  return deriveBrowserSessionKey(id,claims.data?.claims,host,localTenant);
}
