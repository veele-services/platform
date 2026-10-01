import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getServerEnv } from "@/lib/env/server";
import { processDossierReminders } from "@/lib/personnel/dossier-reminders";
import { cleanupExpiredSignatureUploads } from "@/lib/work-orders/report-cleanup";
import { processTicketDeliveries } from "@/lib/tickets/worker";
import { prepareNotificationEvent, processNotificationDeliveries } from "@/lib/notifications/worker";
import { processDeferredMail } from "@/lib/notifications/deferred-mail";
import { cleanupTicketUploads, processTicketScans } from "@/lib/tickets/scan-worker";
import { ticketRpc } from "@/lib/tickets/rpc";
import { ticketWorkerHealthy } from "@/lib/tickets/worker-health";

function secretMatches(header: string | null, expected: string | undefined) {
 if (!header || !expected) return false;
 const supplied=Buffer.from(header.replace(/^Bearer\s+/i,"")),wanted=Buffer.from(expected);
 return supplied.length===wanted.length&&timingSafeEqual(supplied,wanted);
}
export async function POST(request:Request){
 const env=getServerEnv();
 if(!secretMatches(request.headers.get("authorization"),env.ADMIN_API_SECRET))return NextResponse.json({error:"Niet geautoriseerd"},{status:401});
 const admin=createAdminClient();
 const {data,error}=await admin.rpc("claim_outbox",{batch_size:env.NOTIFICATION_WORKER_LIMIT,lock_seconds:120,include_tickets:true,include_notifications:true});
 if(error)return NextResponse.json({error:"Outbox claim mislukt"},{status:500});
 let sent=0,failed=0;
 for(const event of data??[]){
  try{await prepareNotificationEvent(event.id);sent++;}
  catch{
   failed++;const dead=event.attempts>=env.NOTIFICATION_WORKER_MAX_ATTEMPTS;
   const retry=Math.min(env.NOTIFICATION_WORKER_MAX_RETRY_SECONDS,env.NOTIFICATION_WORKER_BASE_RETRY_SECONDS*2**Math.max(0,event.attempts-1));
   await admin.from("outbox_events").update({status:dead?"dead_letter":"failed",last_error:"Verwerking mislukt; controleer de provider en actuele bron. Geen berichtinhoud opgeslagen.",locked_until:null,available_at:new Date(Date.now()+retry*1000).toISOString()}).eq("id",event.id);
  }
 }
 const dossier=await processDossierReminders();
 const objectReminders=await admin.rpc("process_object_reminders");if(objectReminders.error)throw new Error("Objectherinneringen konden niet worden verwerkt.");
 const customerReminders=await admin.rpc("process_customer_reminders");if(customerReminders.error)throw new Error("Klantherinneringen konden niet worden verwerkt.");
 const expiredSignatureUploads=await cleanupExpiredSignatureUploads();
 const ticketDeadlines=await ticketRpc(admin,"process_ticket_deadlines",{});
 // Only historical ticket rows remain here. New ticket fanout is central.
 const ticketDeliveries=await processTicketDeliveries();
 const notificationDeliveries=await processNotificationDeliveries();
 const deferredMail=await processDeferredMail();
 const ticketScans=await processTicketScans();const expiredTicketUploads=await cleanupTicketUploads();
 const outcome={claimed:data?.length??0,sent,failed,dossier,objectReminders:objectReminders.data,customerReminders:customerReminders.data,expiredSignatureUploads,ticketDeadlines,ticketDeliveries,notificationDeliveries,deferredMail,ticketScans,expiredTicketUploads};
 const healthy=ticketWorkerHealthy(outcome)&&notificationDeliveries.failed===0&&notificationDeliveries.uncertain===0&&deferredMail.failed===0;
 return NextResponse.json({status:healthy?"ok":"degraded",...outcome},{status:healthy?200:503,headers:{"cache-control":"no-store"}});
}
