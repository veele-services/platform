import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { workOrderTestDatabase } from './work-order-test-target.mjs';

test('Management profiles enforce live authenticated permissions and safe ownership', async t => {
  const db = await workOrderTestDatabase(), tenant = randomUUID(), other = randomUUID();
  const users = Object.fromEntries(['owner','planning','administration','support','staff','outsider'].map(name => [name,randomUUID()]));
  const sessions = Object.fromEntries(Object.keys(users).map(name => [name,randomUUID()]));
  const members = {}, roles = {}, invitations = {};
  const assets=Object.fromEntries(['customer','object','order','assignment','person','otherPerson','catalogue','revision','task','reportEntry','employeeDoc','hrDoc','securityDoc'].map(name=>[name,randomUUID()]));
  const denied = error => error.code === '42501';
  const call = async (who, sql, values = [], principal = 'authenticated') => {
    await db.query('savepoint management_action');
    try {
      assert(['authenticated','anon','postgres','service_role'].includes(principal));
      await db.query(`set local role ${principal}`);
      await db.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({sub:users[who],session_id:sessions[who],role:principal})]);
      const result = await db.query(sql,values);
      await db.query('reset role'); await db.query("select set_config('request.jwt.claims','{}',true)");
      await db.query('release savepoint management_action');return result.rows;
    } catch(error) { await db.query('rollback to savepoint management_action');await db.query('release savepoint management_action');throw error; }
  };
  const rpc = async (who, name, args) => (await call(who,`select public.${name}(${args.map((_,i)=>`$${i+1}`).join(',')}) data`,args))[0].data;
  const command = (who, operation, input, request = randomUUID(), target = tenant) => rpc(who,'management_command',[target,operation,input,request]);
  await db.query('begin');
  try {
    for (const id of [tenant,other]) {
      await db.query("insert into public.tenants(id,name,slug) values($1,'Fictieve managementtest',$2)",[id,`management-${id}`]);
      await db.query("insert into public.tenant_settings(tenant_id,enabled_services) values($1,array['planning','personeel','rapportage','finance','klantportaal'])",[id]);
      await db.query('select private.management_seed($1)',[id]);
    }
    for (const [name,user] of Object.entries(users)) {
      await db.query('insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())',[user,`${name}-${user}@management.example.test`]);
      await db.query('insert into auth.sessions(id,user_id,created_at,updated_at) values($1,$2,now(),now())',[sessions[name],user]);
      await db.query("insert into auth.mfa_amr_claims(id,session_id,authentication_method,created_at,updated_at) values(gen_random_uuid(),$1,'otp',now(),now())",[sessions[name]]);
      if (['owner','staff','outsider'].includes(name)) members[name] = (await db.query("insert into public.tenant_memberships(tenant_id,user_id,roles,status) values($1,$2,$3,'active') returning id",[name==='outsider'?other:tenant,user,name==='staff'?['staff']:['tenant_admin','management']])).rows[0].id;
    }
    for (const role of (await db.query('select * from private.management_roles where tenant_id=$1',[tenant])).rows) roles[role.code]=role;
    for(const [name,code] of [['planning','planning'],['administration','administration'],['support','support']]) {
      const result = await command('owner','invite',{name:`Fictief ${name}`,email:`${name}-${users[name]}@management.example.test`,userId:users[name],roleId:roles[code].id});members[name]=result.id;invitations[name]=result;
    }
    await db.query("insert into public.customers(id,tenant_id,customer_number,name) values($1,$2,'MG-C','Fictieve klant')",[assets.customer,tenant]);
    await db.query("insert into public.objects(id,tenant_id,customer_id,object_number,name,address) values($1,$2,$3,'MG-O','Fictieve locatie','{}')",[assets.object,tenant,assets.customer]);
    for(const [person,user] of [[assets.person,users.staff],[assets.otherPerson,users.support]])await db.query("insert into public.personnel(id,tenant_id,user_id,full_name,status,home_address) values($1,$2,$3,'Fictieve medewerker','active',$4)",[person,tenant,user,{formatted:'PRIVATE HOME CANARY'}]);
    await db.query("insert into public.work_orders(id,tenant_id,customer_id,object_id,work_order_number,discipline,status,planned_start_at,planned_end_at,projected_start_at,projected_end_at,created_by,commercial_terms) values($1,$2,$3,$4,'MG-W','Onderhoud','in_progress','2031-01-01T09:00Z','2031-01-01T10:00Z','2031-01-01T09:00Z','2031-01-01T10:00Z',$5,$6)",[assets.order,tenant,assets.customer,assets.object,users.owner,{priceCents:987654}]);
    await db.query("insert into public.work_order_assignments(id,tenant_id,work_order_id,personnel_id,status,actual_start_at,planned_start_at,planned_end_at,projected_start_at,projected_end_at) values($1,$2,$3,$4,'in_progress',now(),'2031-01-01T09:00Z','2031-01-01T10:00Z','2031-01-01T09:00Z','2031-01-01T10:00Z')",[assets.assignment,tenant,assets.order,assets.person]);
    await db.query("insert into public.dispatches(tenant_id,work_order_id,assignment_id,dispatched_by,idempotency_key) values($1,$2,$3,$4,'MG-dispatch')",[tenant,assets.order,assets.assignment,users.owner]);
    await db.query("insert into public.task_catalog(id,tenant_id,code,name,discipline) values($1,$2,'MG-T','Fictieve taak','Onderhoud')",[assets.catalogue,tenant]);
    await db.query("insert into public.task_revisions(id,tenant_id,task_id,revision,duration_minutes,price_cents,vat_basis_points,unit) values($1,$2,$3,1,60,987654,2100,'task')",[assets.revision,tenant,assets.catalogue]);
    await db.query("insert into public.work_order_tasks(id,tenant_id,work_order_id,task_revision_id,task_code,task_name,duration_minutes,unit,unit_price_cents,vat_basis_points) values($1,$2,$3,$4,'MG-T','Fictieve taak',60,'task',987654,2100)",[assets.task,tenant,assets.order,assets.revision]);
    await db.query("insert into public.report_entries(id,tenant_id,work_order_id,author_user_id,body) values($1,$2,$3,$4,'Fictieve eigen rapportnotitie')",[assets.reportEntry,tenant,assets.order,users.staff]);
    for(const [doc,person,visible,managed] of [[assets.employeeDoc,assets.person,true,false],[assets.hrDoc,assets.otherPerson,false,true]])await db.query("insert into public.personnel_documents(id,tenant_id,personnel_id,title,document_type,storage_path,created_by,visible_to_employee,dossier_managed) values($1,$2,$3,'Fictieve instructie','instruction',$4,$5,$6,$7)",[doc,tenant,person,`${tenant}/${person}/${doc}.pdf`,users.owner,visible,managed]);
    await db.query("insert into public.object_documents(id,tenant_id,object_id,title,category,storage_path,mime_type,file_name,size_bytes,created_by) values($1,$2,$3,'Fictief beveiligd document','security',$4,'application/pdf','security.pdf',1,$5)",[assets.securityDoc,tenant,assets.object,`${tenant}/${assets.object}/${assets.securityDoc}.pdf`,users.owner]);
    await t.test('five stable explicit profiles; owner has support, planner lacks HR/finance',async()=>{
      const snapshot=await rpc('owner','management_query',[tenant]);assert.equal(snapshot.roles.length,5);
      assert(snapshot.roles.find(role=>role.code==='owner').permissions.includes('tickets.support.create'));
      const planner=snapshot.roles.find(role=>role.code==='planning');assert(!planner.permissions.includes('backoffice.personnel.sensitive'));assert(!planner.permissions.includes('backoffice.finance.read'));
      assert(planner.permissions.includes('backoffice.functions.get_planboard'));
    });
    await t.test('managed role can read only its own membership before auth-context resolution',async()=>{
      const memberships=await call('planning','select id,user_id from public.tenant_memberships where tenant_id=$1',[tenant]);assert.equal(memberships.length,1);assert.equal(memberships[0].user_id,users.planning);
      const context=await rpc('planning','management_context',[tenant]);assert.equal(context.role,'Planning');assert.equal(context.displayName,'Fictief planning');assert(context.permissions.includes('backoffice.planning.read'));
      await assert.rejects(rpc('planning','management_query',[tenant]),denied);
    });
    await t.test('RPC deny does not depend on UI visibility or coarse compatibility enum',async()=>{
      const board=await rpc('planning','get_planboard',[tenant,new Date().toISOString().slice(0,10),'unassigned','',null,1]);assert(board);
      await assert.rejects(rpc('support','get_planboard',[tenant,new Date().toISOString().slice(0,10),'unassigned','',null,1]),denied);
      await assert.rejects(rpc('planning','execution_invoice_concepts',[tenant,null]),denied);
      await assert.rejects(rpc('support','personnel_document_file',[tenant,randomUUID()]),denied);
      await assert.rejects(rpc('support','get_object_document',[tenant,randomUUID(),null]),denied);
      await assert.rejects(rpc('support','object_visit_context',[tenant,randomUUID(),null]),denied);
      await assert.rejects(rpc('support','customer_extra_agreements',[tenant,randomUUID()]),denied);
    });
    await t.test('default Planning cannot inherit HR, financial or object-vault capabilities',async()=>{
      const result=(await call('planning',"select private.dossier_access($1) hr,private.work_order_access($1,true) finance,private.management_allowed($1,'backoffice.objects.secrets.read') vault",[tenant],'postgres'))[0];assert.equal(result.hr,false);assert.equal(result.finance,false);assert.equal(result.vault,false);
    });
    await t.test('Planning cannot use direct full rows or documents to bypass financial and HR projections',async()=>{
      for(const [table,id] of [['work_orders',assets.order],['work_order_tasks',assets.task],['task_revisions',assets.revision],['object_documents',assets.securityDoc]])assert.deepEqual(await call('planning',`select id from public.${table} where id=$1`,[id]),[]);
      assert.deepEqual(await call('planning','select * from public.personnel_document_file($1,$2)',[tenant,assets.hrDoc]),[]);
      assert.equal((await call('planning',"select private.can_access_storage_object('personnel-documents',$1,false) allowed",[`${tenant}/${assets.otherPerson}/${assets.hrDoc}.pdf`]))[0].allowed,false);
      assert.equal(await rpc('planning','get_object_document',[tenant,assets.securityDoc,null]),null);
      const operations=await rpc('planning','work_order_operational_task_data',[tenant]);assert.equal(operations.workOrderTasks.length,1);assert(!('unit_price_cents' in operations.workOrderTasks[0]));
    });
    await t.test('invitation delivery rechecks fresh owner receipt, recipient and live management profile',async()=>{
      const invite=invitations.planning,args=[tenant,invite.id,invite.userId,invite.deliveryId,invite.email];assert.equal(await rpc('owner','management_invitation_access',args),true);
      assert.equal(await rpc('owner','management_invitation_access',[...args.slice(0,3),randomUUID(),invite.email]),false);
      await db.query('savepoint revoked_invitation');try{await db.query('update private.management_members set revoked_at=now() where membership_id=$1',[invite.id]);assert.equal(await rpc('owner','management_invitation_access',args),false);}finally{await db.query('rollback to savepoint revoked_invitation');await db.query('release savepoint revoked_invitation');}
    });
    await t.test('a fresh password session cannot replace recent OTP owner verification',async()=>{
      await db.query('savepoint password_only');try {
        await db.query("update auth.mfa_amr_claims set authentication_method='password' where session_id=$1",[sessions.owner]);
        await assert.rejects(command('owner','prepare_invite',{name:'Fictieve manager',email:'fiction@example.test',roleId:roles.support.id}),denied);
      }finally{await db.query('rollback to savepoint password_only');await db.query('release savepoint password_only');}
    });
    await t.test('role edits require expected revision and reject unknown/platform/delegation keys',async()=>{
      const base={roleId:roles.planning.id,revision:roles.planning.revision,permissions:['backoffice.access']};
      await assert.rejects(command('owner','save_role',{...base,revision:undefined}),error=>error.code==='40001');
      await assert.rejects(command('owner','save_role',{...base,permissions:undefined}),error=>error.code==='23514');
      for(const key of ['platform.support.read','unknown.read','management.users.manage'])await assert.rejects(command('owner','save_role',{...base,permissions:['backoffice.access',key]}),denied);
      await assert.rejects(command('planning','save_role',base),denied);
      await assert.rejects(command('owner','save_role',{...base,roleId:roles.owner.id}),denied);
    });
    await t.test('direct membership writes cannot create unmanaged or owner escape accounts',async()=>{
      const target=randomUUID();await db.query('insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())',[target,`${target}@management.example.test`]);
      for(const requested of [['tenant_admin'],['management','planner']])await assert.rejects(call('owner',"insert into public.tenant_memberships(tenant_id,user_id,roles,status) values($1,$2,$3,'active')",[tenant,target,requested]),denied);
      await assert.rejects(call('owner',"update public.tenant_memberships set roles=array['tenant_admin']::public.app_role[] where id=$1 returning id",[members.planning]).then(rows=>{if(!rows.length)throw Object.assign(new Error('RLS denied'),{code:'42501'});}),denied);
    });
    await t.test('single owner cannot be revoked; another tenant and inactive tenant fail closed',async()=>{
      await assert.rejects(command('owner','revoke',{memberId:members.owner,revision:1}),denied);
      await db.query('savepoint owner_guard');
      await assert.rejects(db.query("update public.tenant_memberships set status='revoked' where id=$1",[members.owner]),error=>error.code==='23514');
      await db.query('rollback to savepoint owner_guard');await db.query('release savepoint owner_guard');
    });
    await t.test('management revocation preserves a separately assigned staff identity',async()=>{
      const assigned=await command('owner','assign',{memberId:members.staff,roleId:roles.support.id,revision:1});assert.equal(assigned.id,members.staff);
      assert.equal((await rpc('staff','management_context',[tenant])).role,'Support');
      const assertStaffWorkspace=async()=>{
        const travel=(await call('staff','select public.travel_context($1,$2,$3,$4,$5) data',[tenant,users.staff,sessions.staff,'2031-01-01',null],'service_role'))[0].data;assert.deepEqual(travel.people.map(person=>person.id),[assets.person]);assert.equal(travel.canManage,false);
        await assert.rejects(call('staff','select public.travel_context($1,$2,$3,$4,$5)',[tenant,users.staff,sessions.staff,'2031-01-01',assets.otherPerson],'service_role'),denied);
        const report=await rpc('staff','work_order_report',[assets.order]);assert.equal(report.canReview,false);assert.equal(report.canEditPolicy,false);
        const task=await rpc('staff','work_order_task_context',[tenant,assets.task]);assert.equal(task.canAssign,false);
        const ownPath=`${tenant}/${assets.order}/${assets.reportEntry}/proof.png`;assert.equal(await rpc('staff','file_upload_allowed',['reports',ownPath,null]),true);
        assert.equal(await rpc('staff','file_upload_allowed',['reports',`${tenant}/${assets.order}/${randomUUID()}/forged.png`,null]),false);
        assert.equal((await call('staff','select * from public.personnel_document_file($1,$2)',[tenant,assets.employeeDoc])).length,1);
        assert.equal((await call('staff',"select id from public.dossier_documents where source_kind='personnel' and source_id=$1",[assets.employeeDoc])).length,1);
        const inbox=(await call('staff',"select private.notification_access($1,'staff',$2) access",[tenant,users.staff],'postgres'))[0].access;
        assert.equal(inbox.allowed,true);assert.equal(inbox.permissions.read_own,true);
        await assert.rejects(rpc('staff','get_planboard',[tenant,'2031-01-01','unassigned','',null,1]),denied);
      };
      await assertStaffWorkspace();
      await db.query('savepoint staff_inbox_without_management_cap');
      try {
        await db.query("delete from private.management_role_permissions where role_id=$1 and capability='notifications.read_own'",[roles.support.id]);
        const own=(await call('staff',"select private.notification_access($1,'staff',$2) access",[tenant,users.staff],'postgres'))[0].access;
        assert.equal(own.permissions.read_own,true);
        const backoffice=(await call('staff',"select private.notification_access($1,'backoffice',$2) access",[tenant,users.staff],'postgres'))[0].access;
        assert.equal(backoffice.permissions.read_own,false);
      }finally{await db.query('rollback to savepoint staff_inbox_without_management_cap');await db.query('release savepoint staff_inbox_without_management_cap');}
      await command('owner','revoke',{memberId:members.staff,revision:1});
      const membership=(await call('staff','select to_jsonb(roles) roles,status from public.tenant_memberships where id=$1',[members.staff]))[0];assert.deepEqual(membership.roles,['staff']);assert.equal(membership.status,'active');
      assert.deepEqual((await rpc('staff','management_context',[tenant])).permissions,[]);
      await assert.rejects(rpc('staff','management_query',[tenant]),denied);
      await assertStaffWorkspace();
      const backoffice=(await call('staff',"select private.notification_access($1,'backoffice',$2) access",[tenant,users.staff],'postgres'))[0].access;
      assert.equal(backoffice.permissions.read_own,false);
      await db.query('savepoint disabled_staff_inbox');
      try {
        const disabled=await db.query("update public.permission_grants set enabled=false,revision=revision+1 where tenant_id=$1 and user_id=$2 and capability='notifications.read_own' returning id",[tenant,users.staff]);assert.equal(disabled.rowCount,1);
        const own=(await call('staff',"select private.notification_access($1,'staff',$2) access",[tenant,users.staff],'postgres'))[0].access;
        assert.equal(own.permissions.read_own,false);
      }finally{await db.query('rollback to savepoint disabled_staff_inbox');await db.query('release savepoint disabled_staff_inbox');}
      const snapshot=await rpc('owner','management_query',[tenant]);assert.equal(snapshot.users.find(member=>member.id===members.staff).status,'revoked');
      await assert.rejects(command('owner','resend',{memberId:members.staff,revision:2}),error=>error.code==='23514');
      await command('owner','assign',{memberId:members.staff,roleId:roles.support.id,revision:2});
      assert.equal((await rpc('staff','management_context',[tenant])).role,'Support');
    });
    await t.test('ownership needs target acceptance and demotion removes direct-grant fallback',async()=>{
      await rpc('administration','management_context',[tenant]);
      const transfer=await command('owner','transfer',{memberId:members.administration});
      assert.equal((await rpc('owner','management_context',[tenant])).role,'Eigenaar');
      assert.equal((await rpc('administration','management_pending_transfer',[tenant])).id,transfer.id);
      await assert.rejects(command('support','accept_transfer',{transferId:transfer.id}),denied);
      const result=await command('administration','accept_transfer',{transferId:transfer.id});assert.equal(result.status,'accepted');
      assert.equal((await rpc('administration','management_context',[tenant])).role,'Eigenaar');assert.equal((await rpc('owner','management_context',[tenant])).role,'Management');
      assert((await call('owner','select roles from public.tenant_memberships where id=$1',[members.owner]))[0].roles.includes('management'));
      assert.equal((await call('owner',"select private.management_allowed($1,'management.users.manage') allowed",[tenant]))[0].allowed,false);
      await assert.rejects(command('owner','assign',{memberId:members.support,roleId:roles.planning.id,revision:1}),denied);
      const access=(await call('owner',"select private.notification_delegation_scope($1,'backoffice',$2) scope",[tenant,users.owner],'postgres'))[0];assert.equal(access.scope,null);
    });
    await t.test('command receipts are idempotent but cannot bypass revoked access',async()=>{
      const key=randomUUID(),input={memberId:members.support,roleId:roles.planning.id,revision:1};const first=await command('administration','assign',input,key);assert.deepEqual(await command('administration','assign',input,key),first);
      await assert.rejects(command('administration','assign',{...input,roleId:roles.support.id},key),error=>error.code==='23514');
      await db.query("update public.tenants set status='suspended' where id=$1",[tenant]);await assert.rejects(command('administration','assign',input,key),denied);await assert.rejects(rpc('administration','management_context',[tenant]),denied);await db.query("update public.tenants set status='active' where id=$1",[tenant]);
      await assert.rejects(command('administration','assign',{...input,revision:2},randomUUID(),other),denied);
      await assert.rejects(call('owner','select public.management_context($1)',[tenant],'anon'),denied);
    });
  }finally{await db.query('rollback');await db.end();}
});
