import {randomUUID} from 'node:crypto';
// Synthetic local integration fixtures. Contracts are pre-existing DB-boundary
// fixtures, not evidence that a real customer's acceptance was collected.
export function slaFixture(overrides={}){
 const f=Object.fromEntries(['tenant','foreign','owner','staff','planner','customer','object','agreement','task','revision','workOrder','person'].map(k=>[k,randomUUID()]));Object.assign(f,overrides);f.sessions=new Map([f.owner,f.staff,f.planner].map(id=>[id,randomUUID()]));return f;
}
export async function seedSlaFixture(db,f){
 const {tenant,foreign,owner,staff,planner,sessions,customer,object,agreement,task,revision,workOrder,person}=f;let ownerRole,category;
  for(const user of[owner,staff,planner]){await db.query('insert into auth.users(id,email,email_confirmed_at) values($1,$2,now()) on conflict(id) do nothing',[user,user+'@sla-fixture.invalid']);await db.query('insert into auth.sessions(id,user_id,created_at,updated_at) values($1,$2,now(),now())',[sessions.get(user),user])}
  for(const id of[tenant,foreign]){await db.query("insert into public.tenants(id,slug,name) values($1,$2,'FICTITIOUS service tenant')",[id,'sla-'+id]);await db.query("insert into public.tenant_settings(tenant_id,enabled_services) values($1,array['planning','personeel','rapportage','finance','tickets'])",[id]);await db.query('select private.management_seed($1)',[id])}
  await db.query("insert into public.tenant_memberships(tenant_id,user_id,roles,status) values($1,$2,array['tenant_admin']::public.app_role[],'active'),($1,$3,array['staff']::public.app_role[],'active'),($1,$4,array['planner']::public.app_role[],'active')",[tenant,owner,staff,planner]);await db.query('select private.ticket_seed_membership(id) from public.tenant_memberships where tenant_id=$1',[tenant]);ownerRole=(await db.query("select id from private.management_roles where tenant_id=$1 and code='owner'",[tenant])).rows[0].id;
  await db.query("insert into public.customers(id,tenant_id,customer_number,name) values($1,$2,'C-SLA','FICTITIOUS service customer')",[customer,tenant]);await db.query("insert into public.objects(id,tenant_id,customer_id,object_number,name,address) values($1,$2,$3,'O-SLA','FICTITIOUS service site','{}')",[object,tenant,customer]);
  await db.query("insert into public.task_catalog(id,tenant_id,code,name,discipline) values($1,$2,'SLA','FICTITIOUS service task','Test')",[task,tenant]);await db.query("insert into public.task_revisions(id,tenant_id,task_id,revision,duration_minutes,unit,price_cents,vat_basis_points) values($1,$2,$3,1,30,'task',1200,900)",[revision,tenant,task]);
  await db.query("insert into public.customer_agreements(id,tenant_id,customer_id,title,starts_on,accepted_by_name,accepted_on,created_by) values($1,$2,$3,'FICTITIOUS existing agreement',current_date-30,'FICTITIOUS customer',current_date-30,$4)",[agreement,tenant,customer,owner]);await db.query("insert into public.customer_agreement_lines(tenant_id,agreement_id,object_id,task_revision_id,scope,quantity,price_cents,limit_cents) values($1,$2,$3,$4,'FICTITIOUS source scope',1,1200,1200)",[tenant,agreement,object,revision]);
  await db.query("insert into public.personnel(id,tenant_id,user_id,full_name) values($1,$2,$3,'FICTITIOUS service employee')",[person,tenant,staff]);
  await db.query("insert into public.work_orders(id,tenant_id,customer_id,object_id,work_order_number,title,discipline,status,planned_start_at,planned_end_at,projected_start_at,projected_end_at,created_by) values($1,$2,$3,$4,'WB-SLA','FICTITIOUS service visit','Test','released','2033-10-05T08:00:00Z','2033-10-05T10:00:00Z','2033-10-05T08:00:00Z','2033-10-05T10:00:00Z',$5)",[workOrder,tenant,customer,object,owner]);
  const assignment=(await db.query("insert into public.work_order_assignments(tenant_id,work_order_id,personnel_id,status,planned_start_at,planned_end_at,projected_start_at,projected_end_at) values($1,$2,$3,'released','2033-10-05T08:00:00Z','2033-10-05T10:00:00Z','2033-10-05T08:00:00Z','2033-10-05T10:00:00Z') returning id",[tenant,workOrder,person])).rows[0].id;
  await db.query('insert into public.dispatches(tenant_id,work_order_id,assignment_id,dispatched_by,idempotency_key) values($1,$2,$3,$4,$5)',[tenant,workOrder,assignment,owner,randomUUID()]);
  category=(await db.query("select id from public.ticket_categories where tenant_id=$1 and code='planning'",[tenant])).rows[0].id;await db.query('update public.ticket_categories set customer_visible=true where id=$1',[category]);

 Object.assign(f,{ownerRole,category});return f;
}
export async function retireSlaFixture(db,f){
 await db.query("update public.tenants set status='archived' where id=any($1::uuid[])",[[f.tenant,f.foreign]]);
 await db.query('delete from auth.sessions where user_id=any($1::uuid[])',[[f.owner,f.staff,f.planner]]);
 await db.query("update auth.users set banned_until='infinity' where id=any($1::uuid[])",[[f.owner,f.staff,f.planner]]);
}
