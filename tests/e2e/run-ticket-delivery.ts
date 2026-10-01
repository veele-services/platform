// Local fixture harness, never loaded by application routes or deployment.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { z } from "zod";
import { prepareTicketNotifications, processTicketDeliveryClaims } from "../../lib/tickets/worker";
import { prepareNotificationEvent, processNotificationDeliveryClaims } from "../../lib/notifications/worker";
import { requireLocalApiUrl, requireLocalDatabaseUrl } from "./local-target";

async function main() {
  assert.equal(process.env.DEPLOY_TARGET, "local");
  assert.equal(process.env.FIELDGRID_TEST_SENDGRID, "1");
  requireLocalApiUrl();
  assert.equal(process.env.SENDGRID_API_KEY, "SG.fieldgrid-local-e2e-placeholder");
  const url = requireLocalDatabaseUrl();
  const tenantId = z.uuid().parse(process.argv[2]);
  const db = new pg.Client({ connectionString: url.toString() });
  await db.connect();
  try {
    const tenant = (await db.query("select name,slug from public.tenants where id=$1", [tenantId])).rows[0];
    assert.match(tenant.slug, /^tickets-e2e-[a-f0-9]{8}$/);
    const recipient = (await db.query("select u.id,u.email from auth.users u join public.tenant_memberships m on m.user_id=u.id where m.tenant_id=$1 and m.status='active' and 'tenant_admin'=any(m.roles)", [tenantId])).rows[0];
    assert.match(recipient.email, /^manager-[a-f0-9-]{36}@fieldgrid\.test$/);
    const ticket = (await db.query("select id,reporter_user_id from public.tickets where tenant_id=$1 and route='internal' order by created_at limit 1", [tenantId])).rows[0];
    assert.ok(ticket);
    const mailbox = async () => await (await fetch(`http://127.0.0.1:59329/messages?recipient=${encodeURIComponent(recipient.email)}`)).json() as Array<{ from: { name: string }; subject: string; content: Array<{ type: string; value: string }>; personalizations: Array<{ custom_args: { fieldgrid_delivery: string } }> }>;
    const baseline = (await mailbox()).length;
    const prepare = async (ticketId = ticket.id, actorId = ticket.reporter_user_id) => {
      // This deliberately synthetic event is restricted to the E2E tenant.
      const event = (await db.query("select private.ticket_emit($1,'reporter','reply','FICTITIOUS transport proof',$2) id", [ticketId, actorId])).rows[0].id;
      const outbox = (await db.query("select id from public.outbox_events where tenant_id=$1 and payload->>'event_id'=$2", [tenantId, event])).rows[0].id;
      await prepareTicketNotifications(outbox);
      await prepareTicketNotifications(outbox);
      const deliveries = (await db.query("select id from private.ticket_deliveries where tenant_id=$1 and outbox_id=$2 and recipient_id=$3 and channel='email'", [tenantId, outbox, recipient.id])).rows;
      assert.equal(deliveries.length, 1);
      return deliveries[0].id as string;
    };
    const claim = async (id: string) => {
      const lease = randomUUID();
      // Lease/CAS selection itself is covered by the DB suite. Here only this
      // known fixture delivery is claimed; no unrelated queue is processed.
      const updated = await db.query("update private.ticket_deliveries set status='claimed',lease=$1,locked_until=now()+interval '10 minutes',attempts=attempts+1 where id=$2 and tenant_id=$3 and recipient_id=$4 and status in ('queued','failed') returning id", [lease, id, tenantId, recipient.id]);
      assert.equal(updated.rowCount, 1);
      return { id, lease };
    };
    const status = async (id: string) => (await db.query("select status from private.ticket_deliveries where id=$1 and tenant_id=$2", [id, tenantId])).rows[0].status;
    const id = await prepare(), first = await claim(id);
    assert.equal((await processTicketDeliveryClaims([first])).sent, 1);
    assert.equal(await status(id), "sent");
    await processTicketDeliveryClaims([first]);
    const sent = await mailbox(); assert.equal(sent.length, baseline + 1);
    const message = sent.at(-1)!;
    assert.equal(message.subject, "Nieuwe ticketmelding"); assert.equal(message.from.name, tenant.name);
    assert.equal(message.personalizations[0].custom_args.fieldgrid_delivery, `ticket-${id}`);
    const text = message.content.find(part => part.type === "text/plain")!.value;
    const html = message.content.find(part => part.type === "text/html")!.value;
    assert.ok(text.includes(`/app/meldingen/${ticket.id}`));
    assert.ok(html.toLowerCase().includes("#214e72"));
    for (const canary of ["FICTITIOUS transport proof", "PRIVATE-FILE-CANARY", "Robin Tickettest"]) assert.ok(!JSON.stringify(message).includes(canary));

    const retryId = await prepare();
    await fetch("http://127.0.0.1:59329/reject-next", { method: "POST" });
    assert.equal((await processTicketDeliveryClaims([await claim(retryId)])).failed, 1);
    assert.equal(await status(retryId), "failed");
    assert.equal((await mailbox()).length, baseline + 1);
    assert.equal((await processTicketDeliveryClaims([await claim(retryId)])).sent, 1);
    assert.equal((await mailbox()).length, baseline + 2);

    const unknownId = await prepare(), unknown = await claim(unknownId);
    await fetch("http://127.0.0.1:59329/fail-next", { method: "POST" });
    assert.equal((await processTicketDeliveryClaims([unknown])).uncertain, 1);
    assert.equal(await status(unknownId), "uncertain");
    await processTicketDeliveryClaims([unknown]);
    assert.equal((await mailbox()).length, baseline + 2);

    const support = (await db.query("select id from public.tickets where tenant_id=$1 and route='platform_support' order by created_at limit 1", [tenantId])).rows[0];
    const platform = (await db.query("select g.user_id from public.permission_grants g join auth.users u on u.id=g.user_id where g.capability='platform.support.reply' and g.enabled and g.scope->'tenant_ids' @> to_jsonb(array[$1::text]) and u.email like 'platform-%@fieldgrid.test'", [tenantId])).rows[0];
    assert.ok(support); assert.ok(platform);
    const supportId = await prepare(support.id, platform.user_id);
    assert.equal((await processTicketDeliveryClaims([await claim(supportId)])).sent, 1);
    const supportMail = (await mailbox()).at(-1)!;
    assert.equal(supportMail.from.name, "Fieldgrid");
    assert.ok(supportMail.content.find(part => part.type === "text/plain")!.value.includes(`/app/support/${support.id}`));
    assert.ok(supportMail.content.find(part => part.type === "text/html")!.value.toLowerCase().includes("#222c35"));
    assert.equal((await mailbox()).length, baseline + 3);
    const centralPrepare=async()=>{
      const event=(await db.query("select private.ticket_emit($1,'reporter','reply','CENTRAL-PRIVATE-CANARY',$2) id",[ticket.id,ticket.reporter_user_id])).rows[0].id;
      const outbox=(await db.query("select id from public.outbox_events where tenant_id=$1 and payload->>'event_id'=$2",[tenantId,event])).rows[0].id;
      await prepareNotificationEvent(outbox);await prepareNotificationEvent(outbox);
      const rows=(await db.query("select d.id from private.notification_deliveries d join private.notification_requests r on r.id=d.request_id where d.tenant_id=$1 and r.source_kind='ticket' and r.source_id=$2 and d.recipient_user_id=$3 and d.channel='email'",[tenantId,event,recipient.id])).rows;
      assert.equal(rows.length,1);return rows[0].id as string;
    };
    const centralClaim=async(id:string)=>{
      const lease=randomUUID();const result=await db.query("update private.notification_deliveries set state='claimed',lease=$1,locked_until=now()+interval '10 minutes',attempts=attempts+1 where id=$2 and tenant_id=$3 and recipient_user_id=$4 and state in ('queued','failed') returning id",[lease,id,tenantId,recipient.id]);assert.equal(result.rowCount,1);return{id,lease};
    };
    const centralId=await centralPrepare();await fetch("http://127.0.0.1:59329/reject-next",{method:"POST"});
    assert.equal((await processNotificationDeliveryClaims([await centralClaim(centralId)])).failed,1);
    const frozen=(await db.query("select snapshot,transport_snapshot from private.notification_deliveries where id=$1",[centralId])).rows[0];assert.ok(frozen.transport_snapshot.html.includes('#214E72'));
    const acceptedClaim=await centralClaim(centralId);assert.equal((await processNotificationDeliveryClaims([acceptedClaim])).sent,1);await processNotificationDeliveryClaims([acceptedClaim]);
    const centralMail=(await mailbox()).at(-1)!;assert.equal(centralMail.personalizations[0].custom_args.fieldgrid_delivery,`notification-${centralId}`);assert.ok(!JSON.stringify(centralMail).includes('CENTRAL-PRIVATE-CANARY'));assert.equal(centralMail.content.find(c=>c.type==='text/html')!.value,frozen.transport_snapshot.html);
    assert.deepEqual((await db.query("select snapshot,transport_snapshot from private.notification_deliveries where id=$1",[centralId])).rows[0],frozen);
    assert.equal((await mailbox()).length,baseline+4);
    const centralUnknown=await centralPrepare();await fetch("http://127.0.0.1:59329/fail-next",{method:"POST"});const unknownClaim=await centralClaim(centralUnknown);
    assert.equal((await processNotificationDeliveryClaims([unknownClaim])).uncertain,1);await processNotificationDeliveryClaims([unknownClaim]);assert.equal((await mailbox()).length,baseline+4);
    assert.equal((await db.query("select state from private.notification_deliveries where id=$1",[centralUnknown])).rows[0].state,'uncertain');
    console.log("Ticket and central transport fixture passed: actual HTTP sink, frozen rendering, branding, minimal content, deduplication, confirmed retry and uncertain suppression.");
  } finally { await db.end(); }
}
main().catch(() => { console.error("Local ticket transport fixture failed; no private payload is logged."); process.exitCode = 1; });
