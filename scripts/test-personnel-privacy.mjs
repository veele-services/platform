import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { workOrderTestDatabase } from './work-order-test-target.mjs';

test('HR classification applies to legacy rows as well as managed dossiers',async t=>{
  const db=await workOrderTestDatabase();
  const tenant=randomUUID(),otherTenant=randomUUID(),staff=randomUUID(),colleague=randomUUID(),hr=randomUUID(),planner=randomUUID();
  const own=randomUUID(),other=randomUUID(),foreign=randomUUID(),docs=Array.from({length:5},()=>randomUUID());
  const call=async(actor,sql,args=[])=>{
    await db.query('savepoint actor');
    try{await db.query('set local role authenticated');await db.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({sub:actor,session_id:actor,role:'authenticated'})]);
      const result=(await db.query(sql,args)).rows;await db.query('rollback to savepoint actor');await db.query('release savepoint actor');return result;
    }catch(e){await db.query('rollback to savepoint actor');await db.query('release savepoint actor');throw e;}
  };
  try{
    await db.query('begin');
    for(const id of [staff,colleague,hr,planner]){await db.query('insert into auth.users(id,email) values($1,$2)',[id,`fictional-${id}@fieldgrid.test`]);await db.query('insert into auth.sessions(id,user_id) values($1,$1)',[id]);}
    for(const id of [tenant,otherTenant]){await db.query("insert into public.tenants(id,slug,name) values($1,$2,'FICTITIOUS privacy tenant')",[id,`privacy-${id}`]);await db.query('insert into public.tenant_settings(tenant_id) values($1)',[id]);}
    for(const [id,role] of [[staff,'staff'],[colleague,'staff'],[hr,'hr'],[planner,'planner']])await db.query("insert into public.tenant_memberships(tenant_id,user_id,roles,status) values($1,$2,array[$3]::public.app_role[],'active')",[tenant,id,role]);
    for(const [id,tid,user] of [[own,tenant,staff],[other,tenant,colleague],[foreign,otherTenant,null]])await db.query("insert into public.personnel(id,tenant_id,user_id,full_name,emergency_contact) values($1,$2,$3,'FICTITIOUS employee',$4)",[id,tid,user,{name:'FICTITIOUS PRIVATE EMERGENCY'}]);
    for(const managed of [false,true]){
      await db.query("insert into public.personnel_notes(tenant_id,personnel_id,body,created_by,dossier_managed,dossier_data) values($1,$2,'FICTITIOUS INTERNAL HR',$3,$4,$5)",[tenant,own,hr,managed,{body:'FICTITIOUS INTERNAL HR'}]);
      await db.query("insert into public.personnel_contracts(tenant_id,personnel_id,starts_on,employment_type,dossier_managed,dossier_data) values($1,$2,'2030-01-01','permanent',$3,$4)",[tenant,own,managed,{salary:'FICTITIOUS PRIVATE PAY'}]);
      await db.query("insert into public.certificates(tenant_id,personnel_id,code,name,dossier_managed,dossier_data) values($1,$2,$3,'FICTITIOUS Certificate',$4,$5)",[tenant,own,managed?'MANAGED':'LEGACY',managed,{verificationNote:'FICTITIOUS INTERNAL REVIEW'}]);
    }
    for(const [index,tid,pid,visible,managed] of [[0,tenant,own,true,false],[1,tenant,own,false,false],[2,tenant,other,true,false],[3,tenant,own,false,true],[4,otherTenant,foreign,true,false]]){
      await db.query("insert into public.personnel_documents(id,tenant_id,personnel_id,title,document_type,storage_path,file_name,mime_type,sha256,created_by,visible_to_employee,dossier_managed,dossier_data) values($1,$2,$3,'FICTITIOUS document','instruction',$4,'instruction.pdf','application/pdf',$5,$6,$7,$8,$9)",[docs[index],tid,pid,`${tid}/${pid}/${docs[index]}.pdf`,'a'.repeat(64),hr,visible,managed,{internal:'FICTITIOUS INTERNAL DOCUMENT'}]);
    }
    await t.test('staff and planner cannot read private legacy or managed HR records; HR retains originals',async()=>{
      for(const table of ['personnel_notes','personnel_contracts','certificates']){
        for(const actor of [staff,colleague,planner])assert.deepEqual(await call(actor,`select * from public.${table} where tenant_id=$1`,[tenant]),[]);
        const original=await call(hr,`select * from public.${table} where tenant_id=$1`,[tenant]);assert.equal(original.length,2);assert.ok(JSON.stringify(original).includes('FICTITIOUS INTERNAL')||JSON.stringify(original).includes('FICTITIOUS PRIVATE PAY'));
      }
    });
    await t.test('planner identity and own operational selfservice remain available without emergency contacts',async()=>{
      await assert.rejects(call(planner,'select emergency_contact from public.personnel where tenant_id=$1',[tenant]),e=>e.code==='42501');
      assert.equal((await call(planner,'select id,full_name,status from public.personnel where tenant_id=$1',[tenant])).length,2);
      assert.equal((await call(staff,'select id from public.personnel where tenant_id=$1',[tenant])).length,1);
      assert.ok((await call(staff,'select public.personnel_mobility($1,$2) data',[tenant,own]))[0].data);
      await assert.rejects(call(staff,'select public.personnel_mobility($1,$2)',[tenant,other]),e=>e.code==='42501');
      await assert.rejects(call(planner,'select public.personnel_mobility($1,$2)',[tenant,own]),e=>e.code==='42501');
      // Availability is now management-owned operational data. Staff can
      // update only the explicitly enabled preference contract through the
      // guarded staff RPC; direct Data API rows must remain unavailable.
      await assert.rejects(
        call(staff,"insert into public.availability(tenant_id,personnel_id,starts_at,ends_at,kind) values($1,$2,'2030-01-01T08:00Z','2030-01-01T09:00Z','available') returning id",[tenant,own]),
        e=>e.code==='42501',
      );
    });
    await t.test('only explicitly published own document fields reach staff; raw HR metadata stays private',async()=>{
      assert.deepEqual(await call(staff,'select * from public.personnel_documents where tenant_id=$1',[tenant]),[]);
      const data=(await call(staff,'select public.staff_workspace($1) data',[tenant]))[0].data;
      assert.deepEqual(data.personnelDocuments.map(d=>d.id),[docs[0]]);
      assert.deepEqual(Object.keys(data.personnelDocuments[0]).sort(),['file_name','id','personnel_id','tenant_id','title','version','visible_to_employee']);
      assert.equal(JSON.stringify(data).includes('FICTITIOUS INTERNAL'),false);
      assert.deepEqual((await call(staff,"select source_id from public.dossier_documents where source_kind='personnel' and tenant_id=$1",[tenant])).map(d=>d.source_id),[docs[0]]);
      assert.equal((await call(hr,'select * from public.personnel_documents where tenant_id=$1',[tenant])).length,4);
    });
    await t.test('planning receives absence time blocks without private reasons; HR and own selfservice retain their scope',async()=>{
      const absence=randomUUID(),source=randomUUID();
      await db.query("insert into public.personnel_dossier_items(id,tenant_id,personnel_id,kind,title,dossier_status) values($1,$2,$3,'task','FICTITIOUS PRIVATE ABSENCE SOURCE','open')",[source,tenant,own]);
      await db.query("insert into public.availability(id,tenant_id,personnel_id,starts_at,ends_at,kind,note,dossier_source_id) values($1,$2,$3,'2030-01-01T08:00Z','2030-01-01T09:00Z','sick','FICTITIOUS PRIVATE ABSENCE REASON',$4)",[absence,tenant,own,source]);
      assert.deepEqual(await call(planner,'select id,kind,note from public.availability where tenant_id=$1',[tenant]),[]);
      assert.equal((await call(hr,'select note from public.availability where id=$1',[absence]))[0].note,'FICTITIOUS PRIVATE ABSENCE REASON');
      assert.equal((await call(staff,'select note from public.availability where id=$1',[absence]))[0].note,'FICTITIOUS PRIVATE ABSENCE REASON');
      assert.deepEqual(await call(colleague,'select id from public.availability where id=$1',[absence]),[]);
      const blocks=await call(planner,'select * from public.personnel_availability($1)',[tenant]);
      assert.equal(blocks.length,1);assert.equal(blocks[0].id,absence);assert.equal(blocks[0].kind,'unavailable');assert.equal(blocks[0].note,null);assert.equal(blocks[0].dossier_source_id,null);
      const board=(await call(planner,"select public.get_planboard($1,'2030-01-01','all','','',1) data",[tenant]))[0].data;
      assert.ok(board.availability.some(a=>a.id===absence&&a.kind==='unavailable'));
      assert.equal(JSON.stringify(board).includes('FICTITIOUS PRIVATE ABSENCE'),false);
      assert.equal((await call(hr,'select * from public.personnel_availability($1)',[tenant]))[0].note,'FICTITIOUS PRIVATE ABSENCE REASON');
      assert.equal((await call(hr,'select * from public.personnel_availability($1)',[tenant]))[0].dossier_source_id,source);
      assert.equal((await call(staff,'select * from public.personnel_availability($1)',[tenant])).length,1);
      assert.deepEqual(await call(colleague,'select * from public.personnel_availability($1)',[tenant]),[]);
      assert.deepEqual(await call(planner,'select * from public.personnel_availability($1)',[otherTenant]),[]);
      assert.deepEqual(await call(staff,"update public.availability set note='FICTITIOUS OWN UPDATE' where id=$1 returning id",[absence]),[]);
      assert.deepEqual(await call(planner,"update public.availability set note='DENIED UPDATE' where id=$1 returning id",[absence]),[]);
      await db.query("update public.tenant_memberships set status='revoked' where tenant_id=$1 and user_id=$2",[tenant,planner]);
      assert.deepEqual(await call(planner,'select * from public.personnel_availability($1)',[tenant]),[]);
      await db.query("update public.tenant_memberships set status='active' where tenant_id=$1 and user_id=$2",[tenant,planner]);
    });
    await t.test('availability projection requires a live session and module; combined roles preserve own access only',async()=>{
      await db.query('savepoint absence_lifecycle');
      try {
        await db.query("update public.tenant_memberships set roles=array['staff','planner']::public.app_role[] where tenant_id=$1 and user_id=$2",[tenant,staff]);
        assert.equal((await call(staff,'select * from public.personnel_availability($1)',[tenant]))[0].kind,'sick');
        await db.query('delete from auth.sessions where id=$1',[planner]);
        assert.deepEqual(await call(planner,'select * from public.personnel_availability($1)',[tenant]),[]);
        // Only trusted platform context may change entitlements. The read
        // assertions below still switch to each real authenticated principal.
        await db.query("select set_config('request.jwt.claims','{\"role\":\"service_role\"}',true)");
        await db.query("update public.tenant_settings set enabled_services=array_remove(enabled_services,'personeel') where tenant_id=$1",[tenant]);
        assert.deepEqual(await call(hr,'select * from public.personnel_availability($1)',[tenant]),[]);
        assert.deepEqual(await call(staff,'select * from public.personnel_availability($1)',[tenant]),[]);
      } finally { await db.query('rollback to savepoint absence_lifecycle'); await db.query('release savepoint absence_lifecycle'); }
    });
    await t.test('file descriptor keeps own downloads usable and rejects hidden, colleague and foreign files',async()=>{
      for(const [i,id] of docs.entries()){
        const result=await call(staff,'select * from public.personnel_document_file($1,$2)',[i===4?otherTenant:tenant,id]);
        assert.equal(result.length,i===0?1:0);
        if(result.length){assert.equal(result[0].sha256,'a'.repeat(64));assert.equal(Object.hasOwn(result[0],'dossier_data'),false);}
      }
      assert.equal((await call(hr,'select * from public.personnel_document_file($1,$2)',[tenant,docs[3]])).length,1);
      await db.query('update public.personnel_documents set visible_to_employee=false where id=$1',[docs[0]]);
      assert.deepEqual(await call(staff,'select * from public.personnel_document_file($1,$2)',[tenant,docs[0]]),[]);
      await db.query('update public.personnel_documents set visible_to_employee=true where id=$1',[docs[0]]);
      await db.query("update public.tenant_memberships set status='revoked' where tenant_id=$1 and user_id=$2",[tenant,staff]);
      assert.deepEqual(await call(staff,'select * from public.personnel_document_file($1,$2)',[tenant,docs[0]]),[]);
    });
  }finally{await db.query('rollback');await db.end();}
});
