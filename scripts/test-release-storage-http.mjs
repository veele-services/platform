import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash,randomUUID} from 'node:crypto';
import test from 'node:test';
import {createClient} from '@supabase/supabase-js';
import {workOrderTestDatabase} from './work-order-test-target.mjs';

test('real local Auth, Data API and Storage enforce report ownership and revocation',async t=>{
  if(process.env.FIELDGRID_STAGING_SMOKE)throw Error('Synthetic HTTP fixtures are local only');
  const local=JSON.parse(execFileSync('pnpm',['supabase','status','-o','json'],{encoding:'utf8',stdio:['ignore','pipe','ignore']}));
  const api=new URL(local.API_URL);assert.equal(api.hostname,'127.0.0.1');assert.equal(api.port,'59321');
  Object.assign(process.env,{APP_ENV:'development',DEPLOY_TARGET:'local',APP_URL:'http://127.0.0.1:3000',SUPABASE_URL:local.API_URL,NEXT_PUBLIC_SUPABASE_URL:local.API_URL,NEXT_PUBLIC_SUPABASE_ANON_KEY:local.ANON_KEY,SUPABASE_SERVICE_ROLE_KEY:local.SERVICE_ROLE_KEY});
  const {uploadScannedFile,readScannedFile}=await import('../lib/files/scanned-storage.ts');
  const options={auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}};
  const admin=createClient(local.API_URL,local.SERVICE_ROLE_KEY,options),db=await workOrderTestDatabase();
  const tenant=randomUUID(),customer=randomUUID(),object=randomUUID(),order=randomUUID();
  const users=[],clients=[],people=[randomUUID(),randomUUID()],entries=[randomUUID(),randomUUID()],files=[randomUUID(),randomUUID()];
  const paths=entries.map((entry,i)=>`${tenant}/${order}/${entry}/${files[i]}.png`);
  const cleanupPaths=[...paths],png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64');
  const clean=result=>assert.equal(Boolean(result.error),false,`Synthetic operation must succeed (status=${result.error?.status??'none'}, code=${result.error?.code??'none'}); provider payload intentionally not logged`);
  let channel;
  try{
    for(let i=0;i<2;i++){
      const email=`${randomUUID()}@release-http.test`,password=`Fg-${randomUUID()}`;
      const created=await admin.auth.admin.createUser({email,password,email_confirm:true});clean(created);users.push(created.data.user.id);
      const client=createClient(local.API_URL,local.ANON_KEY,options);clean(await client.auth.signInWithPassword({email,password}));clients.push(client);
    }
    await db.query('begin');
    await db.query("insert into public.tenants(id,slug,name) values($1,$2,'FICTITIOUS HTTP isolation')",[tenant,`http-audit-${tenant}`]);
    await db.query("insert into public.tenant_settings(tenant_id,enabled_services) values($1,array['planning','personeel','rapportage'])",[tenant]);
    await db.query("insert into public.customers(id,tenant_id,customer_number,name,billing_email) values($1,$2,'FICTITIOUS','FICTITIOUS customer','billing@release-http.test')",[customer,tenant]);
    await db.query("insert into public.objects(id,tenant_id,customer_id,object_number,name,address) values($1,$2,$3,'FICTITIOUS','FICTITIOUS object','{}')",[object,tenant,customer]);
    for(let i=0;i<2;i++){
      await db.query("insert into public.tenant_memberships(tenant_id,user_id,roles,status) values($1,$2,array['staff']::public.app_role[],'active')",[tenant,users[i]]);
      await db.query("insert into public.personnel(id,tenant_id,user_id,full_name) values($1,$2,$3,'FICTITIOUS employee')",[people[i],tenant,users[i]]);
    }
    await db.query("insert into public.work_orders(id,tenant_id,customer_id,object_id,work_order_number,discipline,status,lead_personnel_id,planned_start_at,planned_end_at,projected_start_at,projected_end_at,created_by) values($1,$2,$3,$4,'FICTITIOUS','Test','released',$5,now(),now()+interval '2 hours',now(),now()+interval '2 hours',$6)",[order,tenant,customer,object,people[0],users[0]]);
    for(let i=0;i<2;i++){
      const assignment=randomUUID();
      await db.query("insert into public.work_order_assignments(id,tenant_id,work_order_id,personnel_id,status,planned_start_at,planned_end_at,projected_start_at,projected_end_at) values($1,$2,$3,$4,'in_progress',now(),now()+interval '2 hours',now(),now()+interval '2 hours')",[assignment,tenant,order,people[i]]);
      await db.query('insert into public.dispatches(tenant_id,work_order_id,assignment_id,dispatched_by,idempotency_key) values($1,$2,$3,$4,$5)',[tenant,order,assignment,users[0],randomUUID()]);
      await db.query("insert into public.report_entries(id,tenant_id,work_order_id,author_user_id,body) values($1,$2,$3,$4,'FICTITIOUS PRIVATE REPORT')",[entries[i],tenant,order,users[i]]);
    }
    await db.query("update public.work_orders set status='in_progress' where id=$1",[order]);await db.query('commit');

    await t.test('raw upload is denied; each employee publishes through the actual scanner gateway before metadata',async()=>{
      for(let i=0;i<2;i++){
        assert.ok((await clients[i].storage.from('reports').upload(paths[i],png,{contentType:'image/png'})).error);
        await uploadScannedFile(clients[i],'reports',paths[i],png,'image/png');
        clean(await clients[i].from('attachments').insert({id:files[i],tenant_id:tenant,work_order_id:order,report_entry_id:entries[i],uploaded_by:users[i],storage_bucket:'reports',storage_path:paths[i],file_name:'FICTITIOUS.png',mime_type:'image/png',size_bytes:png.length,sha256:createHash('sha256').update(png).digest('hex')}));
      }
    });
    await t.test('actual ClamAV rejects the harmless EICAR marker and unavailable scanner never publishes',async()=>{
      const {PDFDocument}=await import('pdf-lib');const pdf=await PDFDocument.create();pdf.addPage();
      const marker=String.raw`X5O!P%@AP[4\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*`;
      // EICAR is a file signature, not a substring guarantee. Embed the actual
      // standard test file, which ClamAV inspects recursively inside this PDF.
      await pdf.attach(Buffer.from(marker),'FICTITIOUS-EICAR.txt',{mimeType:'text/plain'});
      const rejected=await pdf.save({useObjectStreams:false});
      const path=`${tenant}/${order}/${entries[0]}/${randomUUID()}.pdf`;cleanupPaths.push(path);
      await assert.rejects(uploadScannedFile(clients[0],'reports',path,rejected,'application/pdf'),/geweigerd/);
      assert.ok((await admin.storage.from('reports').download(path)).error);
      const enabled=process.env.CLAMAV_ENABLED;process.env.CLAMAV_ENABLED='false';
      try{await assert.rejects(uploadScannedFile(clients[0],'reports',path,rejected,'application/pdf'),/tijdelijk niet beschikbaar/);}
      finally{process.env.CLAMAV_ENABLED=enabled;}
      assert.ok((await admin.storage.from('reports').download(path)).error);
    });
    await t.test('legacy bytes have no raw read until scanned; receipt forgery, changed bytes and ownership bypass fail',async()=>{
      const path=`${tenant}/${order}/${entries[0]}/${randomUUID()}.png`;cleanupPaths.push(path);
      clean(await admin.storage.from('reports').upload(path,png,{contentType:'image/png'}));
      assert.ok((await clients[0].storage.from('reports').download(path)).error);
      assert.ok((await clients[0].rpc('file_scan_state',{target_bucket:'reports',target_path:path})).error);
      assert.ok((await clients[0].rpc('file_scan_attest',{target_bucket:'reports',target_path:path,expected_id:randomUUID(),expected_version:'forged',proof:{}})).error);
      assert.equal((await readScannedFile('reports',path)).sha256,createHash('sha256').update(png).digest('hex'));
      clean(await clients[0].storage.from('reports').download(path));
      await assert.rejects(uploadScannedFile(clients[1],'reports',path,png,'image/png'),/Geen actuele toegang/);
      // Service replacement changes object version and immediately invalidates
      // old proof. Ordinary users cannot perform this replacement.
      clean(await admin.storage.from('reports').update(path,png,{contentType:'image/png'}));
      assert.ok((await clients[0].storage.from('reports').download(path)).error);
      await readScannedFile('reports',path);
      clean(await clients[0].storage.from('reports').download(path));
    });
    await t.test('Data API and RPC cannot read colleague private reports or raw customer billing',async()=>{
      const reports=await clients[0].from('report_entries').select('id').eq('work_order_id',order);clean(reports);assert.deepEqual(reports.data.map(r=>r.id),[entries[0]]);
      const crm=await clients[0].from('customers').select('id,billing_email').eq('id',customer);clean(crm);assert.deepEqual(crm.data,[]);
      const projection=await clients[0].rpc('staff_workspace',{target_tenant:tenant});clean(projection);assert.deepEqual(projection.data.reports.map(r=>r.id),[entries[0]]);
    });
    await t.test('Storage list/download/sign/update/upsert/copy/move/delete cannot cross ownership',async()=>{
      const a=clients[0].storage.from('reports'),b=clients[1].storage.from('reports');
      clean(await a.download(paths[0]));assert.ok((await a.download(paths[1])).error);
      const listed=await a.list(`${tenant}/${order}/${entries[1]}`);clean(listed);assert.equal(listed.data.length,0);
      assert.ok((await a.createSignedUrl(paths[1],60)).error);
      assert.ok((await a.update(paths[1],png,{contentType:'image/png'})).error);
      assert.ok((await a.upload(paths[1],png,{contentType:'image/png',upsert:true})).error);
      const copy=`${tenant}/${order}/${entries[0]}/${randomUUID()}.png`;cleanupPaths.push(copy);
      assert.ok((await a.copy(paths[1],copy)).error);assert.ok((await a.move(paths[1],copy)).error);
      const removed=await a.remove([paths[1]]);assert.ok(removed.error || removed.data.length===0);
      clean(await b.download(paths[1]));
      const ownCopy=`${tenant}/${order}/${entries[0]}/${randomUUID()}.png`;cleanupPaths.push(ownCopy);
      assert.ok((await a.copy(paths[0],ownCopy)).error);
      assert.ok((await a.update(paths[0],png,{contentType:'image/png'})).error);
      assert.ok((await a.upload(paths[0],png,{contentType:'image/png',upsert:true})).error);
      assert.ok((await a.move(paths[0],ownCopy)).error);
      const ownRemoved=await a.remove([paths[0]]);assert.ok(ownRemoved.error||ownRemoved.data.length===0);
      clean(await a.download(paths[0]));
    });
    await t.test('unfiltered Realtime sends own reports but no colleague insert or deletion identity',async()=>{
      const received=[],deletions=[];
      channel=clients[0].channel(`release-audit-${tenant}`).on('postgres_changes',{event:'*',schema:'public',table:'report_entries'},event=>{
        if(event.eventType==='DELETE')deletions.push(event.old.id);else received.push(event.new.id);
      });
      await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Realtime subscription unavailable')),10000);channel.subscribe(status=>{if(status==='SUBSCRIBED'){clearTimeout(timer);resolve();}else if(['CHANNEL_ERROR','TIMED_OUT'].includes(status)){clearTimeout(timer);reject(Error('Realtime subscription failed'));}});});
      // Channel join acknowledgement can precede the Postgres subscription write.
      let subscription=0;const readyBy=Date.now()+7000;
      while(!subscription&&Date.now()<readyBy){
        subscription=(await db.query("select count(*)::int n from realtime.subscription where entity='public.report_entries'::regclass and claims->>'sub'=$1 and claims ? 'session_id'",[users[0]])).rows[0].n;
        if(!subscription)await new Promise(resolve=>setTimeout(resolve,50));
      }
      assert.ok(subscription>0,'Realtime registered the authenticated session-bearing subscription');
      const colleagueEntry=randomUUID(),ownEntry=randomUUID();
      for(const [id,actor] of [[colleagueEntry,users[1]],[ownEntry,users[0]]])await db.query("insert into public.report_entries(id,tenant_id,work_order_id,author_user_id,body) values($1,$2,$3,$4,'FICTITIOUS REALTIME REPORT')",[id,tenant,order,actor]);
      const deadline=Date.now()+7000;while(!received.includes(ownEntry)&&Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,50));
      assert.ok(received.includes(ownEntry),'positive event proves subscription delivery works');
      assert.equal(received.includes(colleagueEntry),false);
      await db.query('delete from public.report_entries where id=$1',[colleagueEntry]);
      // A subsequent visible WAL event proves that the stream has advanced past
      // the delete. A silent subscription is never treated as isolation proof.
      const barrier=randomUUID();
      await db.query("insert into public.report_entries(id,tenant_id,work_order_id,author_user_id,body) values($1,$2,$3,$4,'FICTITIOUS WAL BARRIER')",[barrier,tenant,order,users[0]]);
      const drainedBy=Date.now()+7000;while(!received.includes(barrier)&&Date.now()<drainedBy)await new Promise(resolve=>setTimeout(resolve,50));
      assert.ok(received.includes(barrier),'authorized post-delete event proves live stream progress');
      assert.equal(deletions.includes(colleagueEntry),false,'private deletion IDs must not bypass RLS');
      const publication=(await db.query("select pubinsert,pubupdate,pubdelete,pubtruncate from pg_publication where pubname='supabase_realtime'")).rows[0];
      assert.deepEqual(publication,{pubinsert:true,pubupdate:true,pubdelete:false,pubtruncate:false});
      await clients[0].removeChannel(channel);channel=null;
    });
    await t.test('private files cannot mint bearer URLs that bypass later revocation',async()=>{
      const bucket=clients[0].storage.from('reports');
      const signed=await bucket.createSignedUrl(paths[0],3600);
      if(signed.data?.signedUrl){
        // Reproduce the complete boundary failure before enforcing the policy.
        // Never print the capability or leave a fixture revoked for other tests.
        await db.query("update public.tenant_memberships set status='revoked' where tenant_id=$1 and user_id=$2",[tenant,users[0]]);
        try{assert.equal((await fetch(signed.data.signedUrl)).ok,false,'a retained private URL must not authorize a new read after revocation');}
        finally{await db.query("update public.tenant_memberships set status='active' where tenant_id=$1 and user_id=$2",[tenant,users[0]]);}
      }
      assert.ok(signed.error,'single signing must be denied even for the current owner');
      const batch=await bucket.createSignedUrls([paths[0]],3600);
      assert.ok(batch.error || batch.data.every(file=>!file.signedUrl));
      assert.ok((await bucket.createSignedUrl(paths[0],3600,{transform:{width:100}})).error);
      assert.ok((await bucket.createSignedUploadUrl(`${tenant}/${order}/${entries[0]}/${randomUUID()}.png`)).error);
      clean(await bucket.download(paths[0]));
    });
    await t.test('existing access token loses Data API and Storage access after revocation',async()=>{
      await db.query("update public.tenant_memberships set status='revoked' where tenant_id=$1 and user_id=$2",[tenant,users[0]]);
      const reports=await clients[0].from('report_entries').select('id').eq('work_order_id',order);clean(reports);assert.deepEqual(reports.data,[]);
      assert.ok((await clients[0].storage.from('reports').download(paths[0])).error);
      assert.ok((await clients[0].rpc('staff_workspace',{target_tenant:tenant})).error);
    });
  }finally{
    if(channel)await clients[0].removeChannel(channel);
    await db.query('rollback');
    // Only generated fixture IDs and explicit paths owned by this test.
    try{
      clean(await admin.storage.from('reports').remove(cleanupPaths));
      for(const table of ['notification_deliveries','notification_requests','notification_planning_events'])await db.query(`delete from private.${table} where tenant_id=$1`,[tenant]);
      await db.query('delete from private.notification_template_versions where template_id in(select id from private.notification_templates where tenant_id=$1)',[tenant]);
      await db.query('delete from private.notification_templates where tenant_id=$1',[tenant]);
      await db.query('delete from public.work_orders where tenant_id=$1',[tenant]);
      await db.query('delete from public.objects where tenant_id=$1',[tenant]);
      await db.query('delete from public.customers where tenant_id=$1',[tenant]);
      await db.query('delete from public.tenants where id=$1',[tenant]);
      for(const user of users)clean(await admin.auth.admin.deleteUser(user));
    }finally{for(const client of clients)await client.realtime.disconnect();await db.end();}
  }
});
