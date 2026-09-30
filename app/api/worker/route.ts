import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import webpush from "web-push";
import { createAdminClient } from "@/lib/supabase/admin";
import { getServerEnv } from "@/lib/env/server";
import type { Database } from "@/lib/database.types";
import { renderTemplateText, templateDefinition, type TemplateValues } from "@/lib/communications/templates";
import { processDossierReminders } from "@/lib/personnel/dossier-reminders";

type Event = Database["public"]["Tables"]["outbox_events"]["Row"];

function secretMatches(header: string | null, expected: string | undefined) {
  if (!header || !expected) return false;
  const supplied = Buffer.from(header.replace(/^Bearer\s+/i, ""));
  const wanted = Buffer.from(expected);
  return supplied.length === wanted.length && timingSafeEqual(supplied, wanted);
}

async function notificationFor(event: Event) {
  const payload = event.payload as Record<string, unknown>;
  if (event.event_type === "work_order.dispatched" || event.event_type === "work_order.rescheduled") {
    const admin = createAdminClient();
    const templateKey = event.event_type === "work_order.dispatched" ? "workorder" : "schedule";
    const [{ data: tenant, error: tenantError }, { data: workOrder, error: orderError }, { data: template, error: templateError }] = await Promise.all([
      admin.from("tenants").select("name,timezone").eq("id", event.tenant_id).single(),
      admin.from("work_orders").select("work_order_number,object_id,projected_start_at").eq("tenant_id", event.tenant_id).eq("id", event.aggregate_id).single(),
      admin.from("tenant_message_templates").select("subject,body").eq("tenant_id", event.tenant_id).eq("template_key", templateKey).single(),
    ]);
    if (tenantError || orderError) throw tenantError ?? orderError;
    const { data: object, error: objectError } = await admin.from("objects").select("name,address").eq("tenant_id", event.tenant_id).eq("id", workOrder.object_id).single();
    if (objectError) throw objectError;
    const address = (object.address ?? {}) as Record<string, unknown>;
    const location = [address.street, address.postal_code, address.city].filter((part) => typeof part === "string" && part).join(", ") || object.name;
    const values: TemplateValues = {
      bedrijfsnaam: tenant.name,
      bonnummer: workOrder.work_order_number,
      datum: workOrder.projected_start_at ? new Intl.DateTimeFormat("nl-NL", { dateStyle: "long", timeStyle: "short", timeZone: tenant.timezone }).format(new Date(workOrder.projected_start_at)) : "Nog niet ingepland",
      locatie: location,
    };
    const fallback = templateDefinition(templateKey);
    return {
      title: renderTemplateText(templateError ? fallback.subject : template.subject, values),
      body: renderTemplateText(templateError ? fallback.body : template.body, values),
      target: `/staff?workOrder=${event.aggregate_id}`,
      personnelId: String(payload.personnel_id ?? ""),
    };
  }
  if (event.event_type === "work_order.reviewed" && payload.decision === "returned") return { title: "Rapport teruggestuurd", body: "Je rapport heeft een correctie nodig. Open de beveiligde werkbon voor de toelichting.", target: `/staff?workOrder=${event.aggregate_id}`, personnelId: "" };
  if (event.event_type === "announcement.published" && payload.send_push === true) return { title: "Nieuw bericht", body: "Er is een nieuw teambericht gepubliceerd.", target: "/staff?tab=nieuws", personnelId: "" };
  return null;
}

async function recipients(event: Event) {
  const {data,error}=await createAdminClient().rpc("current_event_recipients",{target_event:event.id});
  if(error) throw new Error("Actuele ontvangers konden niet worden gecontroleerd");
  return (data??[]).map(r=>r.user_id);
}

async function processEvent(event: Event) {
  const admin = createAdminClient();
  const notification = await notificationFor(event);
  if (!notification) {
    await admin.from("outbox_events").update({ status: "sent", processed_at: new Date().toISOString(), locked_until: null }).eq("id", event.id);
    return;
  }
  const userIds = await recipients(event);
  if (userIds.length) { const inserted=await admin.from("notifications").upsert(userIds.map((userId) => ({ tenant_id: event.tenant_id, user_id: userId, outbox_event_id: event.id, channel: "in_app", title: notification.title, body: notification.body, target_path: notification.target, status: "sent" as const, sent_at: new Date().toISOString() })), { onConflict: "tenant_id,user_id,outbox_event_id,channel", ignoreDuplicates:true }); if(inserted.error)throw new Error("Melding kon niet worden geregistreerd"); }
  const env = getServerEnv();
  if (userIds.length && env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY && env.VAPID_SUBJECT) {
    webpush.setVapidDetails(env.VAPID_SUBJECT, env.VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY);
    const { data: subscriptions } = await admin.from("push_subscriptions").select("*").eq("tenant_id", event.tenant_id).in("user_id", userIds).is("revoked_at", null);
    for (const subscription of subscriptions ?? []) {
      try {
        if (!(await recipients(event)).includes(subscription.user_id)) continue;
        await webpush.sendNotification({ endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth_secret } }, JSON.stringify(notification), { TTL: 3600, urgency: "high" });
      } catch (error) {
        const status = typeof error === "object" && error && "statusCode" in error ? Number(error.statusCode) : 0;
        if (status === 404 || status === 410) await admin.from("push_subscriptions").update({ revoked_at: new Date().toISOString() }).eq("id", subscription.id);
        else throw error;
      }
    }
  }
  await admin.from("outbox_events").update({ status: "sent", processed_at: new Date().toISOString(), locked_until: null, last_error: null }).eq("id", event.id);
}

export async function POST(request: Request) {
  const env = getServerEnv();
  if (!secretMatches(request.headers.get("authorization"), env.ADMIN_API_SECRET)) return NextResponse.json({ error: "Niet geautoriseerd" }, { status: 401 });
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("claim_outbox", { batch_size: env.NOTIFICATION_WORKER_LIMIT, lock_seconds: 120 });
  if (error) return NextResponse.json({ error: "Outbox claim mislukt" }, { status: 500 });
  let sent = 0; let failed = 0;
  for (const event of data ?? []) {
    try { await processEvent(event); sent += 1; }
    catch (cause) {
      failed += 1;
      void cause;
      const lastError = "Verwerking mislukt; controleer de provider en actuele bron. Geen berichtinhoud opgeslagen.";
      const dead = event.attempts >= env.NOTIFICATION_WORKER_MAX_ATTEMPTS;
      const retry = Math.min(env.NOTIFICATION_WORKER_MAX_RETRY_SECONDS, env.NOTIFICATION_WORKER_BASE_RETRY_SECONDS * (2 ** Math.max(0, event.attempts - 1)));
      await admin.from("outbox_events").update({ status: dead ? "dead_letter" : "failed", last_error: lastError, locked_until: null, available_at: new Date(Date.now() + retry * 1000).toISOString() }).eq("id", event.id);
    }
  }
  const dossier = await processDossierReminders();
  const objectReminders = await admin.rpc("process_object_reminders");
  if (objectReminders.error) throw new Error("Objectherinneringen konden niet worden verwerkt.");
  return NextResponse.json({ claimed: data?.length ?? 0, sent, failed, dossier, objectReminders: objectReminders.data });
}
