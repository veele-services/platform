import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import test from "node:test";
import { workOrderTestDatabase } from "./work-order-test-target.mjs";

test("website intake persists native fields and all notes; retries, scope and rate boundaries", async t => {
  const db=await workOrderTestDatabase();await db.query("begin");
  const manager=randomUUID(),other=randomUUID();let tenant;
  const hash=value=>createHash("sha256").update(value).digest("hex");
  const input={name:"FICTITIOUS organisation",contact_name:"FICTITIOUS contact",email:"marketing@example.test",phone:"",subject:"FICTITIOUS website acceptance",description:"Aanvullende wensen\nVolledige notitie ✓",discipline:"Schoonmaak + Beveiliging + Facilitaire diensten",work_kind:"once",date:"2027-02-06",frequency:"In overleg",location:"FICTITIOUS location"};
  const metadata={envelopeVersion:"1.0.0",content_hash:hash("FICTITIOUS content"),planning_type:"discuss"};
  const call=async(id,p=input,notes=p.description,meta=metadata,target=tenant,role="service_role")=>{
    await db.query("savepoint website_call");
    try{await db.query(`set local role ${role}`);await db.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({role})]);
      const result=await db.query("select public.commercial_website_intake($1,$2,$3,$4,$5,$6) result",[target,id,p,notes,meta,hash("FICTITIOUS browser")]);
      await db.query("reset role");await db.query("release savepoint website_call");return result.rows[0].result;
    }catch(error){await db.query("rollback to savepoint website_call");await db.query("release savepoint website_call");throw error;}
  };
  try {
    tenant=(await db.query("select id from public.tenants where slug='veele-services' and status='active'")).rows[0]?.id;
    if(!tenant){assert.equal(Boolean(process.env.FIELDGRID_STAGING_SMOKE),false,"Existing active tenant required on staging");tenant=randomUUID();
      await db.query("insert into public.tenants(id,slug,name) values($1,'veele-services','FICTITIOUS marketing tenant')",[tenant]);
      await db.query("insert into public.tenant_settings(tenant_id,enabled_services) values($1,array['planning'])",[tenant]);
    }
    await db.query("insert into auth.users(id,email) values($1,$2)",[manager,`${manager}@marketing.test`]);
    await db.query("insert into public.tenant_memberships(tenant_id,user_id,roles,status) values($1,$2,array['tenant_admin']::public.app_role[],'active')",[tenant,manager]);
    await db.query("insert into public.tenants(id,slug,name) values($1,$2,'FICTITIOUS different tenant')",[other,`marketing-${other}`]);
    const id=randomUUID(),counts=(await db.query("select (select count(*) from public.objects) objects,(select count(*) from auth.users) accounts")).rows[0];
    await t.test("a combined request is one lead/contact and no object, booking or login account",async()=>{
      const receipt=await call(id);assert.equal(receipt.ok,true);assert.match(receipt.reference,/^AAN-\d{4}-[A-F0-9]{8}$/);
      const r=(await db.query("select r.*,c.name,c.billing_email,ct.full_name from public.requests r join public.customers c on c.id=r.customer_id join public.customer_contacts ct on ct.id=r.contact_id where r.id=$1",[id])).rows[0];
      assert.equal(r.description,input.description);assert.equal(r.discipline,input.discipline);assert.equal(r.preferences.frequency,"In overleg");assert.equal(r.preferences.date,"2027-02-06");assert.equal(r.name,input.name);assert.equal(r.full_name,input.contact_name);assert.equal(r.source,"website");assert.equal(r.status,"new");assert.equal(r.object_id,null);
      assert.equal(r.preferences.website_submission.content_hash,metadata.content_hash);
      assert.equal((await db.query("select x->>'planning_pending' pending from private.commercial_rows($1) x where x->>'id'=$2",[tenant,id])).rows[0].pending,"true");
      assert.deepEqual((await db.query("select (select count(*) from public.objects) objects,(select count(*) from auth.users) accounts")).rows[0],counts);
    });
    await t.test("lost-response retry reuses the receipt without overwriting later management work",async()=>{
      const original=await call(id);await db.query("update public.requests set next_action='FICTITIOUS reviewed' where id=$1",[id]);
      assert.deepEqual(await call(id),original);assert.equal((await db.query("select next_action from public.requests where id=$1",[id])).rows[0].next_action,"FICTITIOUS reviewed");
      await assert.rejects(call(id,input,input.description,{...metadata,content_hash:hash("changed")}),e=>e.code==="23514");
      assert.equal((await db.query("select count(*) n from public.requests where id=$1",[id])).rows[0].n,"1");
    });
    await t.test("phone-only contact and long Unicode notes read back without clipping or duplicate events",async()=>{
      const notes=("Meerdere diensten, expliciet Nee en commentaar 💙\n").repeat(400),rid=randomUUID();
      const p={...input,email:"",phone:"+31 6 12345678",description:"Zie volledige extra opmerkingen."};
      const meta={...metadata,content_hash:hash("long notes")};await call(rid,p,notes,meta);await call(rid,p,notes,meta);
      const result=(await db.query("select string_agg(body,'' order by (details->>'website_notes_part')::int) notes from public.commercial_events where request_id=$1 and details ? 'website_notes_part'",[rid])).rows[0];assert.equal(result.notes,notes);
      const contact=(await db.query("select c.billing_email,ct.email,ct.phone from public.requests r join public.customers c on c.id=r.customer_id join public.customer_contacts ct on ct.id=r.contact_id where r.id=$1",[rid])).rows[0];assert.equal(contact.billing_email,null);assert.equal(contact.email,null);assert.equal(contact.phone,p.phone);
    });
    await t.test("caller roles, other/inactive tenant and incomplete notes fail closed",async()=>{
      for(const role of["anon","authenticated"])await assert.rejects(call(randomUUID(),input,input.description,metadata,tenant,role),e=>e.code==="42501");
      await assert.rejects(call(randomUUID(),input,input.description,metadata,other),e=>e.code==="42501");
      await assert.rejects(call(randomUUID(),input,"Different notes"),e=>e.code==="23514");
      await db.query("savepoint inactive_tenant");await db.query("update public.tenants set status='suspended' where id=$1",[tenant]);await assert.rejects(call(id),e=>e.code==="42501");await db.query("rollback to savepoint inactive_tenant");await db.query("release savepoint inactive_tenant");
    });
    await t.test("existing public rate limits also apply to the new adapter",async()=>{
      for(let n=0;n<3;n++)await call(randomUUID(),{...input,email:`rate-${n}@marketing.test`});
      await assert.rejects(call(randomUUID(),{...input,email:"rate-final@marketing.test"}),e=>e.code==="23514");
    });
  } finally { await db.query("rollback");await db.end(); }
});
