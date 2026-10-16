import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ticketRpc } from "@/lib/tickets/rpc";

export async function POST() {
  const supabase = await createClient();
  const [{data:{user}},{data:claims}]=await Promise.all([supabase.auth.getUser(),supabase.auth.getClaims()]);
  const sessionId=claims?.claims?.session_id;
  // Even when the device registry is temporarily unavailable, revoking the Auth
  // session must still run. Delivery's live session check then fails closed.
  if(user&&typeof sessionId==="string")try{await ticketRpc(createAdminClient(),"notification_device_logout",{actor_id:user.id,session_id:sessionId});}catch{}
  await supabase.auth.signOut();
  // Keep the redirect relative. Standalone Next may see its internal
  // localhost origin even when the browser used the canonical tenant host;
  // an absolute Location would then violate CSP and cross-origin cookies.
  return new Response(null,{status:303,headers:{Location:"/login","Cache-Control":"no-store"}});
}
