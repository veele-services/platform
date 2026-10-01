import "server-only";
import { createHash } from "node:crypto";
import { cookies, headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { TENANT_SLUG_HEADER } from "@/lib/tenancy/hostname";

/** Bind browser chrome to the identity that rendered the document. Not a
 * credential, capability or substitute for current resource authorization. */
export async function browserSessionKey(): Promise<string | null> {
  const db=await createClient();
  const [user,claims]=await Promise.all([db.auth.getUser(),db.auth.getClaims()]);
  const id=user.data.user?.id,session=claims.data?.claims?.session_id;
  if(user.error||claims.error||!id||claims.data?.claims?.sub!==id||typeof session!=="string"||!session)return null;
  const host=(await headers()).get(TENANT_SLUG_HEADER)??"platform";
  const localTenant=(process.env.DEPLOY_TARGET??"local")==="local"?(await cookies()).get("fieldgrid_tenant_id")?.value??"":"";
  return createHash("sha256").update(JSON.stringify([id,session,host,localTenant])).digest("hex");
}
