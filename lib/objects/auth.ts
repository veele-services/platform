import "server-only";
import { cookies, headers } from "next/headers";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { TENANT_SLUG_HEADER } from "@/lib/tenancy/hostname";

// Customer bindings are deliberately independent from staff memberships.
// This resolves identity and host only. Each RPC still authorizes the resource.
export async function getObjectActor() {
 const db=await createClient();
 const [{data:{user},error},{data:claims,error:claimError}]=await Promise.all([db.auth.getUser(),db.auth.getClaims()]);
 if(error||claimError||!user||claims?.claims.sub!==user.id)throw new Error("Geen toegang");
 const sessionId=z.string().uuid().parse(claims.claims.session_id);
 const slug=(await headers()).get(TENANT_SLUG_HEADER);
 const admin=createAdminClient();
 let query=admin.from("tenants").select("id,slug,name,timezone").eq("status","active");
 if(slug)query=query.eq("slug",slug);
 else if((process.env.DEPLOY_TARGET??"local")==="local"){
  const cookie=(await cookies()).get("fieldgrid_tenant_id")?.value;
  const member=await db.from("tenant_memberships").select("tenant_id").eq("user_id",user.id).eq("status","active").limit(1).maybeSingle();
  const binding=member.data?null:await db.from("object_customer_bindings").select("tenant_id").eq("user_id",user.id).eq("active",true).limit(1).maybeSingle();
  const id=cookie||member.data?.tenant_id||binding?.data?.tenant_id;if(!id)throw new Error("Geen toegang");query=query.eq("id",z.string().uuid().parse(id));
 }else throw new Error("Geen toegang");
 const {data:tenant,error:tenantError}=await query.single();if(tenantError||!tenant)throw new Error("Geen toegang");
 return {db,admin,user,sessionId,tenant};
}
