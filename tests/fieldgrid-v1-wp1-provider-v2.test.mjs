import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createProviderAdapter,providerCall,storageSelection,verifyTestPayments } from '../scripts/wp1/providers.mjs';
import { parseWriterUnits,parseUnitState } from '../scripts/wp1/services.mjs';
import { operationId } from '../scripts/wp1/environment.mjs';
import { assertRun,assertDiagnoseReport } from '../scripts/wp1/evidence.mjs';
import { CONTRACT,PROJECT,WORKFLOW,REPOSITORY } from '../scripts/wp1/contract.mjs';

const tenant='10000000-0000-4000-8000-000000000001',adminId='20000000-0000-4000-8000-000000000001';
function providerFixture(number=151) {
  let files=Array.from({length:number},(_,i)=>({name:`file-${String(i).padStart(4,'0')}`,id:`object-${i}`,updated_at:'2026-01-01T00:00:00Z',metadata:{size:4,mimetype:'text/plain'}}));
  const batches=[],pages=[];
  const client={auth:{admin:{listUsers:async()=>({data:{users:[{id:adminId}]},error:null})}},storage:{from(bucket){return{
    async list(prefix,{offset,limit}) {
      pages.push({bucket,prefix,offset});
      if(bucket!=='documents')return{data:[],error:null};
      if(prefix==='')return{data:[{name:'tenant',id:null}],error:null};
      if(prefix==='tenant')return{data:[{name:tenant,id:null}],error:null};
      if(prefix===`tenant/${tenant}`)return{data:[{name:'documents',id:null}],error:null};
      return{data:files.slice(offset,offset+limit),error:null};
    },
    async remove(paths){batches.push(paths.length);files=files.filter(file=>!paths.includes(`tenant/${tenant}/documents/${file.name}`));return{data:paths,error:null};},
  };}}};
  return{client,pages,batches};
}
function inventory(){return{context:{adminId},order:['documents','personnel'],data:{tenants:[{id:tenant}],assignments:[],documents:[],personnel:[],assignment_photos:[],assignment_checklist_evidence:[],assignment_report_note_attachments:[]}};}
test('real provider wrapper recursively lists canonical tenant directories and paginates/batches',async()=>{
  const f=providerFixture(),adapter=createProviderAdapter(f.client,{origin:`https://${PROJECT}.supabase.co`,sleep:async()=>{}});
  const report=await adapter.inventory(inventory());assert.equal(report.selected.length,151);assert.equal(report.retainedAuthCount,1);
  assert.ok(f.pages.some(page=>page.offset===100));
  await adapter.removeObjects(report.selected,report.all);assert.deepEqual(f.batches,[50,50,50,1]);
});
test('Storage preserves branding and configuration references despite a test-data prefix',()=>{
  const source=inventory();source.data.organization_settings=[{logo_url:`https://${PROJECT}.supabase.co/storage/v1/object/public/documents/tenant/${tenant}/documents/logo.png`}];
  const selected=storageSelection(source,[{bucket:'documents',path:`tenant/${tenant}/documents/logo.png`},{bucket:'documents',path:`tenant/${tenant}/documents/test.pdf`}],`https://${PROJECT}.supabase.co`);
  assert.equal(selected.length,1);assert.ok(selected[0].path.endsWith('test.pdf'));
});
test('provider failures are bounded, retried and redact every raw error detail',async()=>{
  let attempts=0;
  await assert.rejects(providerCall(async()=>{attempts++;return{error:{status:429,message:'secret@example.com password abc'}};},{sleep:async()=>{}}),error=>error.code==='PROVIDER_FAILED'&&!error.message.includes('secret'));
  assert.equal(attempts,3);
  await assert.rejects(providerCall(async()=>undefined,{sleep:async()=>{}}),error=>error.code==='PROVIDER_RESPONSE');
});
test('Mollie uses provider truth for mode and terminality while retaining exact financial checks',async()=>{
  const source={data:{payments:[{tenant_id:tenant,payment_method:'mollie',mollie_payment_id:'tr_Test123',provider_mode:null,provider_status:'open',amount_cents:100,currency:'EUR'}]}};
  let called=false;
  await assert.rejects(verifyTestPayments(source,{[tenant]:'live_abc'},async()=>{called=true;}));assert.equal(called,false);
  assert.equal(await verifyTestPayments(source,{[tenant]:'test_abc'},async()=>({ok:true,json:async()=>({id:'tr_Test123',mode:'test',status:'expired',amount:{value:'1.00',currency:'EUR'}})})),1);
  await assert.rejects(
    verifyTestPayments(source,{[tenant]:'test_abc'},async()=>({ok:true,json:async()=>({id:'tr_Test123',mode:'live',status:'expired',amount:{value:'1.00',currency:'EUR'}})})),
    error=>error.code==='PAYMENT_PROVIDER_MISMATCH',
  );
  await assert.rejects(
    verifyTestPayments(source,{[tenant]:'test_abc'},async()=>({ok:true,json:async()=>({id:'tr_Test123',mode:'test',status:'open',amount:{value:'1.00',currency:'EUR'}})})),
    error=>error.code==='PAYMENT_PROVIDER_ACTIVE',
  );
});
test('proven local staging-demo Mollie placeholders never call the provider',async()=>{
  const source={data:{
    payments:[{
      id:'30000000-0000-4000-8000-000000000001',
      tenant_id:tenant,
      source_id:null,
      payment_method:'mollie',
      mollie_payment_id:'tr_staging_demo_legacy',
      checkout_url:'https://www.mollie.com/checkout/staging-demo/legacy',
      paid_at:null,
    }],
    payment_allocations:[],
  }};
  let called=false;
  assert.equal(await verifyTestPayments(source,{[tenant]:'test_abc'},async()=>{called=true;throw new Error('must not call');}),0);
  assert.equal(called,false);
});
test('systemd unit scope and state cannot be replaced by input flags',()=>{
  const units='veele-staging,veele-staging-personeel,veele-staging-klant,veele-staging-api';
  assert.equal(parseWriterUnits(units).length,4);assert.throws(()=>parseWriterUnits(`${units},ssh.service`));
  assert.equal(parseUnitState('Id=veele-staging-api.service\nLoadState=loaded\nActiveState=inactive\nSubState=dead\nMainPID=0\nFragmentPath=/etc/systemd/system/veele-staging-api.service').active,false);
  assert.throws(()=>parseUnitState('Id=veele-staging-api.service\nLoadState=not-found\nActiveState=inactive\nMainPID=0'));
});
test('evidence requires genuine workflow identity, operation, freshness and backup proof',()=>{
  const now=Date.now(),sha='a'.repeat(40);const run={id:123,repository:{full_name:REPOSITORY},head_repository:{full_name:REPOSITORY},path:WORKFLOW,head_branch:'main',head_sha:sha,event:'workflow_dispatch',status:'completed',conclusion:'success',updated_at:new Date(now).toISOString(),run_attempt:1};
  assert.doesNotThrow(()=>assertRun(run,{id:123,expectedSha:sha,now}));assert.throws(()=>assertRun({...run,event:'pull_request'},{id:123,expectedSha:sha,now}));
  const report={contract:CONTRACT,project:PROJECT,environment:'staging',mode:'diagnose',sha,runId:123,attempt:1,readyForReset:true,blockers:[],generatedAt:new Date(now).toISOString(),backupRestoreVerified:true,resetRehearsalVerified:true,...Object.fromEntries(['inventoryDigest','catalogDigest','journalDigest','providerDigest','contextDigest','backupDigest'].map(name=>[name,'b'.repeat(64)]))};
  assert.doesNotThrow(()=>assertDiagnoseReport(report,{run,expectedSha:sha,now}));
  assert.throws(()=>assertDiagnoseReport({...report,mode:'verify'},{run,expectedSha:sha,now}));
  assert.throws(()=>assertDiagnoseReport({...report,backupRestoreVerified:false},{run,expectedSha:sha,now}));
  assert.equal(operationId(123,sha),operationId(123,sha));assert.notEqual(operationId(123,sha),operationId(124,sha));
});
