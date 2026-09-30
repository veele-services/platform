import "server-only";
import {createHash} from "node:crypto";
import {createAdminClient} from "@/lib/supabase/admin";
import {requestMatchesTenant} from "@/lib/tenancy/request";
import type {QuoteSnapshot} from "./model";
export async function quoteAccess(token:string){
 if(!/^[A-Za-z0-9_-]{32,100}$/.test(token))return null;
 const hash=createHash("sha256").update(token).digest("hex");const admin=createAdminClient();
 const access=await admin.from("external_action_tokens").select("*").eq("token_hash",hash).eq("purpose","quote_acceptance").maybeSingle();
 if(access.error||!access.data)return null;const tk=access.data;
 const [{data:tenant},{data:quote}]=await Promise.all([admin.from("tenants").select("id,slug,name,timezone,status").eq("id",tk.tenant_id).single(),admin.from("quotes").select("*").eq("tenant_id",tk.tenant_id).eq("id",tk.subject_id).single()]);
 if(!tenant||tenant.status!=="active"||!(await requestMatchesTenant(tenant.slug))||!quote)return null;
 const active=!tk.revoked_at&&Date.parse(tk.expires_at)>Date.now()&&!quote.superseded_at&&!quote.archived_at&&!!quote.published_at&&!!quote.expires_at&&Date.parse(quote.expires_at)>Date.now();
 return {admin,hash,token:tk,tenant,quote,snapshot:quote.snapshot as unknown as QuoteSnapshot,active};
}
