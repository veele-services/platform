import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import test from 'node:test';
import pg from 'pg';
import { workOrderTestDatabase } from './work-order-test-target.mjs';
import { assertBlogTestDatabase, blogTestDatabaseConfig } from './blog-test-database.mjs';

const isolated = process.env.FIELDGRID_BLOG_ISOLATED_TEST === '1';
if (process.env.FIELDGRID_STAGING_SMOKE) throw new Error('Connector fixtures are local-only.');
const database=process.env.FIELDGRID_BLOG_CONNECTOR_TEST_DATABASE ?? 'fieldgrid_blog_isolated';
if (!/^fieldgrid_blog_(?:isolated|acceptance_[a-z0-9_]+)$/.test(database)) throw new Error('Connector acceptance database must be a task-owned local database.');
const config = isolated ? blogTestDatabaseConfig(process.env,database) : undefined;
const connect = async () => {
  const db = isolated ? new pg.Client(config) : await workOrderTestDatabase();
  if (isolated) { await db.connect(); await assertBlogTestDatabase(db,database); }
  return db;
};
const digest = value => createHash('sha256').update(value).digest('hex');
const scope = { siteId:'fieldgrid',environment:'development' };

test('SocialHero connector: durable two-phase pairing and destination isolation in real Postgres', async t => {
  const db = await connect(), admin = randomUUID(), session = randomUUID(), run = randomUUID();
  const createdAttempts = [], destinations = [], externalId = `connector-${run}`;
  const call = async (rpc,operation,payload={},role='service_role',actor=null,sid=null,use=db) => {
    await use.query('begin');
    try {
      await use.query(`set local role ${role}`);
      await use.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({role,sub:actor,session_id:sid})]);
      const result = (await use.query(`select public.${rpc}($1,$2::jsonb) result`,[operation,JSON.stringify({...scope,...payload})])).rows[0].result;
      await use.query('commit'); return result;
    } catch(error) { await use.query('rollback'); throw error; }
  };
  const adminCall = (op,p={},use=db) => call('fieldgrid_blog_connector_admin_write',op,p,'authenticated',admin,session,use);
  const status = () => call('fieldgrid_blog_connector_admin_read','status',{},'authenticated',admin,session);
  const read = (c,op,p={}) => call('fieldgrid_blog_connector_read',op,{credentialId:c.id,tokenHash:c.tokenHash,...p});
  const write = (c,op,p={},use=db) => call('fieldgrid_blog_connector_write',op,{credentialId:c.id,tokenHash:c.tokenHash,...p},'service_role',null,null,use);
  const auth = async (tokenHash,legacy=false) => {
    await db.query('begin');
    try { await db.query('set local role service_role'); const value=(await db.query(`select public.${legacy?'fieldgrid_blog_authenticate':'fieldgrid_blog_connector_authenticate'}($1) result`,[tokenHash])).rows[0].result; await db.query('commit'); return value; }
    catch(error) { await db.query('rollback'); throw error; }
  };
  const reject = (promise,message) => assert.rejects(promise,e=>e.message===message);
  const denied = promise => assert.rejects(promise,e=>e.code==='42501');
  const begin = async (destinationId=randomUUID(),policy={allowDraft:true,allowPublish:false}) => {
    const c={attemptId:randomUUID(),connectionId:randomUUID(),destinationId,tokenHash:digest(randomUUID()),codeHash:digest(randomUUID()),origin:'http://localhost:3307',...policy};
    createdAttempts.push(c.attemptId); destinations.push(destinationId);
    await adminCall('pair.begin',{attemptId:c.attemptId,codeHash:c.codeHash,encryptedCode:`encrypted-code-${randomUUID()}`,origin:c.origin,allowDraft:c.allowDraft,allowPublish:c.allowPublish});
    return c;
  };
  const store = async c => {
    c.expiresAt ??= new Date(Date.now()+8*60_000).toISOString();
    await adminCall('pair.store',{...c,encryptedToken:`encrypted-token-${randomUUID()}`});
    c.id=(await auth(c.tokenHash)).id; return c;
  };
  const activate = async c => { await adminCall('pair.activate',c); return c; };
  const media = async c => {
    const assetId=randomUUID();
    await write(c,'media',{assetId,storagePath:`fieldgrid/development/${assetId}.png`,type:'image/png',width:1200,height:800,bytes:1024,sha256:digest(assetId),idempotencyKey:randomUUID()});
    return assetId;
  };
  const fields = (slug,assetId) => ({type:'blog',locale:'nl-NL',title:'Bestemmingsgebonden artikel',slug,excerpt:'Een echte samenvatting.',content:{type:'doc',content:[{type:'heading',attrs:{level:2},content:[{type:'text',text:'Uitvoering'}]},{type:'paragraph',content:[{type:'text',text:'Concrete inhoud voor de publicatietest.'}]}]},seoTitle:'Artikel',seoDescription:'Uitleg',authorId:'fieldgrid-redactie',categoryId:'planning',tags:[],hero:assetId?{src:`/blog-media/${assetId}`,alt:'Een overzicht',x:0.5,y:0.5}:null,shareImage:null});
  let first,second,third,asset,post,original,receiptKey,receiptHash;
  try {
    await db.query('insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())',[admin,`${admin}@connector.invalid`]);
    await db.query('insert into auth.sessions(id,user_id,created_at,updated_at) values($1,$2,now(),now())',[session,admin]);
    await db.query('insert into public.platform_admins(user_id) values($1)',[admin]);
    await t.test('only current platform administrator sessions can configure; no table or ciphertext grants',async()=>{
      await denied(call('fieldgrid_blog_connector_admin_read','status',{},'authenticated',admin,randomUUID()));
      await denied(call('fieldgrid_blog_connector_admin_write','pair.begin',{},'service_role'));
      await denied(call('fieldgrid_blog_connector_server_read','pair.secret',{attemptId:randomUUID()},'authenticated',admin,session));
      await db.query('begin');await db.query('set local role authenticated');await denied(db.query('select * from private.fieldgrid_blog_pairings'));await db.query('rollback');
      const unsafe=await db.query("select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in('public','private') and p.proname like 'fieldgrid_blog_%' and (has_function_privilege('anon',p.oid,'execute') or (p.prosecdef and not coalesce(p.proconfig @> array['search_path=\"\"'],false)))");
      assert.deepEqual(unsafe.rows,[]);
    });
    await t.test('begin/store durably retain recoverable encrypted provisioning and hide it from safe status',async()=>{
      const initial=await call('fieldgrid_blog_connector_admin_read','status',{environment:'staging'},'authenticated',admin,session);assert.equal(initial.allowDraft,true);assert.equal(initial.allowPublish,true);assert.equal(initial.policyConfigured,false);
      first=await begin(randomUUID(),{allowDraft:true,allowPublish:true});
      const begun=await status();assert.equal(begun.state,'claiming');assert.equal(JSON.stringify(begun).includes('encrypted'),false);
      const secret=await call('fieldgrid_blog_connector_server_read','pair.secret',{attemptId:first.attemptId});assert.ok(secret.encryptedCode);assert.equal(secret.encryptedToken,null);
      await adminCall('pair.begin',{...first,encryptedCode:`different-encryption-${randomUUID()}`});
      assert.equal((await call('fieldgrid_blog_connector_server_read','pair.secret',{attemptId:first.attemptId})).encryptedCode,secret.encryptedCode);
      await reject(adminCall('pair.begin',{...first,codeHash:digest('changed'),encryptedCode:`encrypted-${randomUUID()}`}), 'IDEMPOTENCY_CONFLICT');
      const recovered=await adminCall('pair.begin',{...first,attemptId:randomUUID(),encryptedCode:`encrypted-retry-${randomUUID()}`,allowDraft:false,allowPublish:false});assert.equal(recovered.attemptId,first.attemptId);assert.equal(recovered.allowDraft,true);assert.equal(recovered.allowPublish,true);
      await store(first);await store(first);
      assert.ok((await call('fieldgrid_blog_connector_server_read','pair.secret',{attemptId:first.attemptId})).encryptedToken);
    });
    await t.test('pending allows authentication, rate and capabilities only; no legacy credential bypass',async()=>{
      const c=await auth(first.tokenHash);assert.equal(c.state,'pending');assert.deepEqual(c.scopes,['read']);assert.equal(await auth(first.tokenHash,true),null);
      const caps=await read(first,'capabilities');assert.equal(caps.credential.connectionId,first.connectionId);assert.ok(caps.authors.length);assert.ok((await write(first,'rate')).allowed);
      for(const op of ['get','media','receipt']) await reject(read(first,op,{externalId}), 'PAIRING_IN_PROGRESS');
      for(const op of ['draft','media','publish']) await reject(write(first,op,{externalId}), 'PAIRING_IN_PROGRESS');
      await denied(call('fieldgrid_blog_write','draft',{credentialId:first.id,tokenHash:first.tokenHash,externalId}));
    });
    await t.test('activation is repeatable, destroys ciphertexts and applies the pre-authorized policy',async()=>{
      const concurrent=await connect();try { await Promise.all([activate(first),adminCall('pair.activate',first,concurrent)]); } finally { await concurrent.end(); }
      await activate(first);await store(first);
      assert.equal((await status()).state,'active');assert.deepEqual((await auth(first.tokenHash)).scopes,['read','draft','publish']);
      await adminCall('policy',{connectionId:first.connectionId,allowPublish:false});
      const activeSecret=await call('fieldgrid_blog_connector_server_read','pair.secret',{attemptId:first.attemptId});assert.equal(activeSecret.state,'active');assert.equal(activeSecret.encryptedCode,null);assert.equal(activeSecret.encryptedToken,null);
      const row=(await db.query('select encrypted_code,encrypted_token from private.fieldgrid_blog_pairings where attempt_id=$1',[first.attemptId])).rows[0];assert.deepEqual(row,{encrypted_code:null,encrypted_token:null});
      await reject(adminCall('pair.reject',first),'PAIRING_CANCELLED');
      await reject(write(first,'publish',{externalId,revision:1,idempotencyKey:randomUUID()}),'PUBLISH_NOT_ALLOWED');
      assert.ok((await adminCall('check',{connectionId:first.connectionId})).lastCheckedAt);
    });
    await t.test('destination controls media, posts and receipts while callers cannot choose a destination',async()=>{
      asset=await media(first); receiptKey=randomUUID();receiptHash=digest('original-body');
      original={externalId,expectedRevision:0,fields:fields(`connector-a-${run}`,asset),idempotencyKey:receiptKey,requestHash:receiptHash};
      post=await write(first,'draft',{...original,destinationId:randomUUID(),siteId:'wrong',environment:'production'});assert.equal(post.externalId,externalId);assert.equal(post.revision,1);
      assert.equal((await read(first,'get',{externalId})).id,post.id);
      await denied(call('fieldgrid_blog_write','draft',{credentialId:first.id,tokenHash:first.tokenHash,...original}));
      assert.equal(await call('fieldgrid_blog_read','get',{externalId}),null);
      second=await store(await begin());
      assert.ok(await auth(first.tokenHash),'Previous active credential remains usable during verification');
      await activate(second);assert.equal(await auth(first.tokenHash),null);assert.equal(await auth(first.tokenHash,true),null);
      assert.equal(await read(second,'get',{externalId}),null);assert.equal(await read(second,'get',{id:post.id}),null);assert.equal(await read(second,'media',{assetId:asset}),null);
      assert.equal(await read(second,'receipt',{operation:'draft',idempotencyKey:receiptKey,requestHash:receiptHash}),null);
      await reject(write(second,'draft',{...original,idempotencyKey:randomUUID()}),'INVALID_MEDIA');
      const own=await write(second,'draft',{...original,fields:fields(`connector-b-${run}`),idempotencyKey:receiptKey});assert.notEqual(own.id,post.id);assert.equal(own.externalId,externalId);
      await reject(write(second,'draft',{externalId:`slug-conflict-${run}`,fields:fields(`connector-a-${run}`),idempotencyKey:randomUUID()}),'SLUG_CONFLICT');
    });
    await t.test('reconnect same destination preserves mapping and idempotency across newer revisions',async()=>{
      third=await activate(await store(await begin(first.destinationId,{allowDraft:true,allowPublish:true})));
      assert.equal(await auth(second.tokenHash),null);assert.deepEqual((await auth(third.tokenHash)).scopes,['read','draft'],'Reconnect preserves the previously explicit publish opt-out');assert.equal((await read(third,'get',{externalId})).id,post.id);
      await write(third,'draft',{externalId,fields:fields(`connector-new-${run}`,asset),expectedRevision:1,idempotencyKey:randomUUID()});
      assert.deepEqual(await read(third,'receipt',{operation:'draft',idempotencyKey:receiptKey,requestHash:receiptHash}),post);
      assert.deepEqual(await write(third,'draft',{...original,fields:fields(`irrelevant-normalized-${run}`)}),post);
      await reject(read(third,'receipt',{operation:'draft',idempotencyKey:receiptKey,requestHash:digest('changed')}),'IDEMPOTENCY_CONFLICT');
    });
    await t.test('draft policy is live, audited and independent of publish permission',async()=>{
      const disabled=await adminCall('policy',{connectionId:third.connectionId,allowDraft:false,allowPublish:false});
      assert.equal(disabled.allowDraft,false);assert.equal(disabled.policyConfigured,true);assert.equal(disabled.policyUpdatedBy,admin);assert.ok(disabled.policyUpdatedAt);
      assert.deepEqual((await auth(third.tokenHash)).scopes,['read']);
      await reject(write(third,'draft',{externalId,expectedRevision:2,fields:fields(`denied-${run}`,asset),idempotencyKey:randomUUID()}),'DRAFT_NOT_ALLOWED');
      await reject(media(third),'DRAFT_NOT_ALLOWED');
      const audit=(await db.query('select * from private.fieldgrid_blog_policy_audit where destination_id=$1 order by created_at desc',[third.destinationId])).rows;
      assert.equal(audit[0].actor_user_id,admin);assert.equal(audit[0].allow_draft,false);assert.equal(audit[0].allow_publish,false);
      await adminCall('policy',{connectionId:third.connectionId,allowDraft:true,allowPublish:false});
    });
    await t.test('publication policy is checked live and editor/public routes retain paired article access',async()=>{
      await adminCall('policy',{connectionId:third.connectionId,allowPublish:true});assert.deepEqual((await auth(third.tokenHash)).scopes,['read','draft','publish']);
      const live=await write(third,'publish',{externalId,revision:2,idempotencyKey:randomUUID()});assert.equal(live.publishedRevision,2);
      assert.equal((await call('fieldgrid_blog_public_read','resolve',{slug:live.published.slug})).entry.id,post.id);
      assert.equal((await call('fieldgrid_blog_admin_read','get',{id:post.id},'authenticated',admin,session)).id,post.id);
      const editor=await call('fieldgrid_blog_admin_write','draft',{id:post.id,externalId,expectedRevision:2,fields:{...fields(`editor-${run}`,asset),title:'Handmatig nagekeken'},idempotencyKey:randomUUID()},'authenticated',admin,session);assert.equal(editor.id,post.id);assert.equal(editor.revision,3);
      await adminCall('policy',{connectionId:third.connectionId,allowPublish:false});await reject(write(third,'publish',{externalId,revision:3,idempotencyKey:randomUUID()}),'PUBLISH_NOT_ALLOWED');
      assert.equal((await read(third,'get',{externalId})).publishedRevision,2);
    });
    await t.test('snapshots and actor history are immutable; public confirmation is durable per revision',async()=>{
      const history=await call('fieldgrid_blog_admin_read','history',{id:post.id},'authenticated',admin,session);
      assert.deepEqual(history.revisions.map(r=>r.revision),[3,2,1]);
      assert.equal(history.revisions[0].actorUserId,admin);assert.equal(history.revisions[0].source,'manual');assert.equal(history.revisions[0].title,'Handmatig nagekeken');
      assert.equal(history.revisions[1].actorCredentialId,third.id);assert.equal(history.revisions[2].actorCredentialId,first.id);
      assert.equal(history.publishEvents[0].actorCredentialId,third.id);assert.equal(history.publishEvents[0].revision,2);
      const snapshot=(await db.query('select snapshot from private.fieldgrid_blog_revisions where post_id=$1 and revision=1',[post.id])).rows[0].snapshot;
      assert.equal(snapshot.slug,original.fields.slug);assert.equal(snapshot.title,original.fields.title);
      await reject(db.query("update private.fieldgrid_blog_revisions set snapshot='{}' where post_id=$1",[post.id]),'IMMUTABLE_BLOG_HISTORY');
      await reject(db.query('delete from private.fieldgrid_blog_publish_events where post_id=$1',[post.id]),'IMMUTABLE_BLOG_HISTORY');
      assert.deepEqual(await call('fieldgrid_blog_connector_server_read','publication.status',{id:post.id,revision:2}),{verified:false});
      await denied(call('fieldgrid_blog_connector_server_read','publication.confirm',{id:post.id,revision:2},'authenticated',admin,session));
      await reject(call('fieldgrid_blog_connector_server_read','publication.confirm',{id:post.id,revision:3}),'NOT_FOUND');
      await call('fieldgrid_blog_connector_server_read','publication.confirm',{id:post.id,revision:2});
      assert.equal((await read(third,'get',{externalId})).publicationVerified,true);
      assert.ok((await call('fieldgrid_blog_admin_read','history',{id:post.id},'authenticated',admin,session)).publishEvents[0].confirmedAt);
    });
    await t.test('taxonomy names and activation can be managed without changing stored snapshots',async()=>{
      const id=`auteur-${run}`,categoryId=`categorie-${run}`;
      const update=(op,p)=>call('fieldgrid_blog_admin_write',op,{...p,idempotencyKey:p.idempotencyKey??randomUUID()},'authenticated',admin,session);
      try {
        const create={id,name:'Eigen auteur',active:true,create:true,idempotencyKey:randomUUID()};
        assert.deepEqual(await update('taxonomy.author',create),await update('taxonomy.author',create));
        await reject(update('taxonomy.author',{...create,name:'Andere retry'}),'IDEMPOTENCY_CONFLICT');
        await reject(update('taxonomy.author',{...create,idempotencyKey:randomUUID()}),'IDEMPOTENCY_CONFLICT');
        await update('taxonomy.category',{id:categoryId,name:'Eigen categorie',active:true});
        const catalog=await call('fieldgrid_blog_admin_read','taxonomy.manage',{},'authenticated',admin,session);
        assert.ok(catalog.authors.some(a=>a.id===id&&a.active));assert.ok(catalog.categories.some(c=>c.id===categoryId&&c.active));
        const custom=await write(third,'draft',{externalId:`taxonomy-${run}`,expectedRevision:0,fields:{...fields(`taxonomy-${run}`),authorId:id,categoryId},idempotencyKey:randomUUID()});
        await update('taxonomy.author',{id,name:'Gewijzigde naam',active:false});
        await update('taxonomy.category',{id:categoryId,name:'Gewijzigde categorie',active:false});
        const inactive=await call('fieldgrid_blog_admin_read','taxonomy.manage',{},'authenticated',admin,session);
        assert.ok(inactive.authors.some(a=>a.id===id&&!a.active));
        assert.equal((await read(third,'get',{id:custom.id})).draft.author,'Eigen auteur');
        await reject(write(third,'draft',{externalId:`taxonomy-${run}`,expectedRevision:1,fields:{...custom.draft,title:'Nog een wijziging'},idempotencyKey:randomUUID()}),'INVALID_TAXONOMY');
        await update('taxonomy.author',{id,name:'Gewijzigde naam',active:true});await update('taxonomy.category',{id:categoryId,name:'Gewijzigde categorie',active:true});
      } finally { await db.query('delete from private.fieldgrid_blog_authors where id=$1',[id]);await db.query('delete from private.fieldgrid_blog_categories where id=$1',[categoryId]); }
    });
    await t.test('editor media for a paired article retains its destination and remains publishable by that connection',async()=>{
      await adminCall('policy',{connectionId:third.connectionId,allowPublish:true});
      const article=await write(third,'draft',{externalId:`manual-media-${run}`,expectedRevision:0,fields:fields(`manual-media-${run}`,asset),idempotencyKey:randomUUID()});
      const assetId=randomUUID();
      const upload={id:article.id,assetId,storagePath:`fieldgrid/development/${assetId}.png`,type:'image/png',width:1200,height:800,bytes:1200,sha256:digest(assetId),idempotencyKey:randomUUID()};
      const registered=await call('fieldgrid_blog_admin_write','media',upload,'authenticated',admin,session);
      assert.equal((await read(third,'media',{assetId})).assetId,registered.assetId);
      const edited=await call('fieldgrid_blog_admin_write','draft',{id:article.id,externalId:article.externalId,expectedRevision:1,fields:fields(`manual-media-${run}`,assetId),idempotencyKey:randomUUID()},'authenticated',admin,session);
      assert.equal((await write(third,'publish',{externalId:article.externalId,revision:edited.revision,idempotencyKey:randomUUID()})).publishedRevision,2);
      await reject(call('fieldgrid_blog_admin_write','media',{...upload,id:randomUUID(),assetId:randomUUID(),idempotencyKey:randomUUID()},'authenticated',admin,session),'NOT_FOUND');
      await reject(call('fieldgrid_blog_admin_write','media',{...upload,environment:'staging',assetId:randomUUID(),idempotencyKey:randomUUID()},'authenticated',admin,session),'NOT_FOUND');
      await adminCall('policy',{connectionId:third.connectionId,allowPublish:false});
    });
    await t.test('archiving every taxonomy record still returns arrays and rollback restores the catalog',async()=>{
      await db.query('begin');
      try {
        await db.query('update private.fieldgrid_blog_authors set active=false');await db.query('update private.fieldgrid_blog_categories set active=false');await db.query('set local role service_role');
        const caps=(await db.query('select public.fieldgrid_blog_connector_read($1,$2::jsonb) result',['capabilities',JSON.stringify({credentialId:third.id,tokenHash:third.tokenHash})])).rows[0].result;
        assert.deepEqual(caps.authors,[]);assert.deepEqual(caps.categories,[]);
        const publicCatalog=(await db.query('select public.fieldgrid_blog_public_read($1,$2::jsonb) result',['taxonomy',JSON.stringify(scope)])).rows[0].result;assert.deepEqual(publicCatalog,{authors:[],categories:[]});
        await db.query('set local role authenticated');await db.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({role:'authenticated',sub:admin,session_id:session})]);
        const managed=(await db.query('select public.fieldgrid_blog_admin_read($1,$2::jsonb) result',['taxonomy.manage',JSON.stringify(scope)])).rows[0].result;
        assert.ok(Array.isArray(managed.authors)&&managed.authors.every(a=>!a.active));assert.ok(Array.isArray(managed.categories)&&managed.categories.every(c=>!c.active));
      } finally {await db.query('rollback');}
      assert.ok((await read(third,'capabilities')).authors.length>0);
    });
    await t.test('public pages are bounded, searchable, scoped and contain only current live snapshots',async()=>{
      await adminCall('policy',{connectionId:third.connectionId,allowPublish:true});
      const ids=[];
      for(let i=0;i<14;i++){
        const entry=await write(third,'draft',{externalId:`page-${run}-${i}`,expectedRevision:0,fields:{...fields(`page-${run}-${i}`,asset),title:`Pagina ${i} ${run}`,tags:['vindbaar']},isTest:i===13,idempotencyKey:randomUUID()});
        await write(third,'publish',{externalId:entry.externalId,revision:1,idempotencyKey:randomUUID()});if(i<13)ids.push(entry.id);
      }
      const page=async(payload={})=>call('fieldgrid_blog_public_read','public.page',{page:1,pageSize:12,query:run,...payload});
      const firstPage=await page(),secondPage=await page({page:2});
      assert.equal(firstPage.total,13);assert.equal(firstPage.pages,2);assert.equal(firstPage.posts.length,12);assert.equal(secondPage.posts.length,1);
      assert.equal(firstPage.posts.some(a=>secondPage.posts.some(b=>a.id===b.id)),false);assert.ok([...firstPage.posts,...secondPage.posts].every(p=>ids.includes(p.id)));
      assert.equal((await page({page:999})).page,2);for(const pageSize of [1,3,4,12])assert.equal((await page({pageSize})).posts.length,pageSize);assert.equal((await page({category:'pLaNnInG',query:run.toUpperCase()})).total,13);
      assert.deepEqual((await page({query:`missing-${run}`})).posts,[]);assert.ok(firstPage.categories.includes('Planning'));
      assert.equal((await page({environment:'staging'})).total,0);
      await reject(page({pageSize:500}),'INVALID_PAYLOAD');await reject(page({query:'x'.repeat(101)}),'INVALID_PAYLOAD');
      await write(third,'draft',{externalId:`page-${run}-0`,expectedRevision:1,fields:{...fields(`page-${run}-0`,asset),title:'Onzichtbare conceptwijziging'},idempotencyKey:randomUUID()});
      assert.equal((await page()).posts.concat((await page({page:2})).posts).find(p=>p.id===ids[0]).draft.title,`Pagina 0 ${run}`);
    });
    await t.test('policy disabling waits for in-flight publish and prevents later transactions',async()=>{
      await adminCall('policy',{connectionId:third.connectionId,allowPublish:true});
      const blocker=await connect(),waiter=await connect();
      try {
        await blocker.query('begin');await blocker.query('set local role service_role');
        const published=(await blocker.query('select public.fieldgrid_blog_connector_write($1,$2::jsonb) result',['publish',JSON.stringify({...scope,credentialId:third.id,tokenHash:third.tokenHash,externalId,revision:3,idempotencyKey:randomUUID()})])).rows[0].result;
        assert.equal(published.publishedRevision,3);
        let disabled=false;
        const disable=adminCall('policy',{connectionId:third.connectionId,allowPublish:false}).then(()=>{disabled=true;});
        await waiter.query('select pg_sleep(0.05)');assert.equal(disabled,false,'Policy update waits until the actual publish transaction commits');
        await blocker.query('commit');await disable;
        assert.equal((await read(third,'get',{externalId})).publicationVerified,false);
        assert.deepEqual(await call('fieldgrid_blog_connector_server_read','publication.status',{id:post.id,revision:2}),{verified:true});
        await reject(write(third,'publish',{externalId,revision:3,idempotencyKey:randomUUID()}),'PUBLISH_NOT_ALLOWED');
      } finally { await blocker.end();await waiter.end(); }
    });
    await t.test('superseded and rejected attempts cannot activate; old active connection survives rejection',async()=>{
      const pending=await store(await begin()),newer=await store(await begin());
      await reject(activate(pending),'PAIRING_CANCELLED');await reject(adminCall('pair.reject',pending),'PAIRING_CANCELLED');
      await adminCall('pair.reject',newer);assert.equal(await auth(newer.tokenHash),null);assert.ok(await auth(third.tokenHash));
      assert.equal(await call('fieldgrid_blog_connector_server_read','pair.secret',{attemptId:pending.attemptId}),null);
      assert.equal(await call('fieldgrid_blog_connector_server_read','pair.secret',{attemptId:newer.attemptId}),null);
    });
    await t.test('expired provisioning is inaccessible and purge removes stored ciphertext',async()=>{
      const pending=await store(await begin());
      await db.query("update private.fieldgrid_blog_pairings set expires_at=now()-interval '1 second' where attempt_id=$1",[pending.attemptId]);
      await db.query("update private.fieldgrid_blog_credentials set expires_at=now()-interval '1 second' where id=$1",[pending.id]);
      assert.equal(await auth(pending.tokenHash),null);assert.equal((await status()).state,'expired');
      const row=(await db.query('select encrypted_code,encrypted_token from private.fieldgrid_blog_pairings where attempt_id=$1',[pending.attemptId])).rows[0];assert.deepEqual(row,{encrypted_code:null,encrypted_token:null});
      await reject(activate(pending),'PAIRING_CANCELLED');
    });
    await t.test('admin disconnect invalidates pending verification and active writes immediately',async()=>{
      const pending=await store(await begin());
      const blocker=await connect(),waiter=await connect();
      try {
        await blocker.query('begin');await blocker.query('set local role service_role');
        await blocker.query('select public.fieldgrid_blog_connector_write($1,$2::jsonb)',['draft',JSON.stringify({...scope,credentialId:third.id,tokenHash:third.tokenHash,externalId,fields:fields(`last-draft-${run}`,asset),expectedRevision:3,idempotencyKey:randomUUID()})]);
        let disconnected=false;
        const disconnect=adminCall('pair.disconnect',{connectionId:third.connectionId}).then(()=>{disconnected=true;});
        await waiter.query('select pg_sleep(0.05)');assert.equal(disconnected,false,'Disconnect waits for the actual in-flight credential transaction');
        await blocker.query('commit');await disconnect;
      } finally {await blocker.end();await waiter.end();}
      assert.equal(await auth(third.tokenHash),null);assert.equal(await auth(pending.tokenHash),null);assert.equal(await auth(third.tokenHash,true),null);
      await reject(activate(pending),'PAIRING_CANCELLED');await reject(write(third,'draft',original),'INVALID_CREDENTIAL');
      assert.equal((await call('fieldgrid_blog_public_read','resolve',{slug:`editor-${run}`})).entry.id,post.id,'Disconnect retains public live content');
    });
    await t.test('machine revoke is active-only and cannot revoke a newer connection',async()=>{
      const old=await activate(await store(await begin(first.destinationId)));
      const next=await store(await begin(first.destinationId));
      await reject(write(next,'revoke'),'PAIRING_IN_PROGRESS');assert.ok(await auth(old.tokenHash));
      await write(old,'revoke');assert.equal(await auth(old.tokenHash),null);assert.equal((await auth(next.tokenHash)).state,'pending');
      await activate(next);await reject(write(old,'revoke'),'INVALID_CREDENTIAL');assert.equal((await auth(next.tokenHash)).state,'active');
      await write(next,'revoke');assert.equal(await auth(next.tokenHash),null);
    });
  } finally {
    await db.query('delete from private.fieldgrid_blog_slugs where post_id in(select id from private.fieldgrid_blog_posts where destination_id=any($1::uuid[]))',[destinations]);
    await db.query('delete from private.fieldgrid_blog_posts where destination_id=any($1::uuid[])',[destinations]);
    await db.query('delete from private.fieldgrid_blog_assets where destination_id=any($1::uuid[])',[destinations]);
    await db.query('delete from private.fieldgrid_blog_receipts where destination_id=any($1::uuid[])',[destinations]);
    await db.query('delete from private.fieldgrid_blog_installations where attempt_id=any($1::uuid[])',[createdAttempts]);
    await db.query('delete from private.fieldgrid_blog_pairings where attempt_id=any($1::uuid[])',[createdAttempts]);
    await db.query('delete from private.fieldgrid_blog_credentials where destination_id=any($1::uuid[])',[destinations]);
    await db.query('delete from private.fieldgrid_blog_destinations where id=any($1::uuid[])',[destinations]);
    await db.query('delete from auth.sessions where user_id=$1',[admin]);await db.query('delete from public.platform_admins where user_id=$1',[admin]);await db.query('delete from auth.users where id=$1',[admin]);await db.end();
  }
});

// Upgrade acceptance is deliberately opt-in: it creates only a fresh task-owned
// database on the explicitly guarded fixture port, never the normal CI database.
test('connector upgrade preserves existing Auth and blog records plus historical receipt retries', { skip:!isolated }, async () => {
  const {readFile,writeFile}=await import('node:fs/promises');
  const target=`fieldgrid_blog_upgrade_connector_${randomUUID().replaceAll('-','').slice(0,8)}`;
  const main=await connect();
  try { await main.query(`create database ${target} template ${database}`); } finally { await main.end(); }
  const db=new pg.Client(blogTestDatabaseConfig(process.env,target));await db.connect();
  const oldMigration=await readFile(new URL('../supabase/migrations/20261113124643_fieldgrid_blog_socialhero.sql',import.meta.url),'utf8');
  const migration=await readFile(new URL('../supabase/migrations/20261126110835_fieldgrid_blog_connector.sql',import.meta.url),'utf8');
  const editorial=await readFile(new URL('../supabase/migrations/20261126113033_fieldgrid_blog_editorial_history.sql',import.meta.url),'utf8');
  const metadata=async(table,excludeDestination=false)=>{
    assert.match(table,/^(?:auth|public|private|storage)\.[a-z_]+$/);
    const expression=excludeDestination?"to_jsonb(t)-'destination_id'-'connection_id'-'state'":'to_jsonb(t)';
    return (await db.query(`select count(*)::integer rows,encode(extensions.digest(coalesce(string_agg((${expression})::text,E'\n' order by (${expression})::text),''),'sha256'),'hex') sha256 from ${table} t`)).rows[0];
  };
  const legacy=async(op,payload)=>{
    await db.query('begin');
    try { await db.query('set local role service_role'); const result=(await db.query('select public.fieldgrid_blog_write($1,$2::jsonb) result',[op,JSON.stringify({...scope,...credential,...payload})])).rows[0].result;await db.query('commit');return result; }
    catch(error){await db.query('rollback');throw error;}
  };
  const credential={credentialId:randomUUID(),tokenHash:digest(randomUUID())};
  try {
    await assertBlogTestDatabase(db,target);
    // Rebuild only this isolated clone's blog objects at the immutable previous
    // migration; all other Fieldgrid schema and data came from the real fixture.
    const functions=(await db.query("select n.nspname,p.proname,pg_get_function_identity_arguments(p.oid) args from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in('public','private') and p.proname like 'fieldgrid_blog_%'")).rows;
    for(const f of functions) await db.query(`drop function if exists ${f.nspname}.${f.proname}(${f.args}) cascade`);
    const tables=(await db.query("select tablename from pg_tables where schemaname='private' and tablename like 'fieldgrid_blog_%'")).rows;
    for(const {tablename} of tables) await db.query(`drop table if exists private.${tablename} cascade`);
    await db.query(oldMigration);
    const actor=randomUUID(),tenant=randomUUID(),customer=randomUUID(),object=randomUUID();
    await db.query('insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())',[actor,`${actor}@upgrade.invalid`]);
    await db.query('insert into auth.sessions(id,user_id,created_at,updated_at) values($1,$2,now(),now())',[randomUUID(),actor]);
    await db.query("insert into public.tenants(id,slug,name) values($1,$2,'FICTITIOUS pre-upgrade tenant')",[tenant,`upgrade-${tenant}`]);
    await db.query("insert into public.tenant_memberships(tenant_id,user_id,roles,status) values($1,$2,array['tenant_admin']::public.app_role[],'active')",[tenant,actor]);
    await db.query("insert into public.customers(id,tenant_id,customer_number,name) values($1,$2,'UPGRADE-C','FICTITIOUS customer')",[customer,tenant]);
    await db.query("insert into public.objects(id,tenant_id,customer_id,object_number,name,address) values($1,$2,$3,'UPGRADE-O','FICTITIOUS object','{}')",[object,tenant,customer]);
    await db.query("insert into public.work_orders(id,tenant_id,customer_id,object_id,work_order_number,discipline,title,created_by,planning_state) values($1,$2,$3,$4,'UPGRADE-W','Onderhoud','FICTITIOUS pre-upgrade work order',$5,'unassigned')",[randomUUID(),tenant,customer,object,actor]);
    await db.query("insert into private.fieldgrid_blog_credentials(id,site_id,environment,label,token_hash,scopes,expires_at) values($1,'fieldgrid','development','Pre-upgrade local fixture',$2,array['read','media:write','draft:write','publish'],now()+interval '1 day')",[credential.credentialId,credential.tokenHash]);
    const assetId=randomUUID(),externalId=randomUUID();
    const upload={assetId,storagePath:`fieldgrid/development/${assetId}.png`,type:'image/png',width:1200,height:800,bytes:1024,sha256:digest(assetId),idempotencyKey:randomUUID()};
    const media=await legacy('media',upload);
    const fields={type:'blog',locale:'nl-NL',title:'Bestaand artikel vóór migratie',slug:`upgrade-${externalId}`,excerpt:'De bestaande publieke inhoud moet bewaard blijven.',content:{type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'Bestaande artikelinhoud.'}]}]},authorId:'fieldgrid-redactie',categoryId:'planning',tags:[],hero:{src:`/blog-media/${assetId}`,alt:'Een bestaande afbeelding',x:0.5,y:0.5},shareImage:null};
    const draft={externalId,expectedRevision:0,fields,idempotencyKey:randomUUID()};
    const article=await legacy('draft',draft);
    const publish={externalId,revision:article.revision,idempotencyKey:randomUUID()};
    const live=await legacy('publish',publish);
    const objects=['auth.users','auth.sessions','public.tenants','public.tenant_memberships','public.work_orders','public.permission_catalog','storage.buckets','private.fieldgrid_blog_posts','private.fieldgrid_blog_assets','private.fieldgrid_blog_receipts','private.fieldgrid_blog_credentials','private.fieldgrid_blog_slugs'];
    const before={};for(const table of objects)before[table]=await metadata(table,table.startsWith('private.'));
    assert.ok(before['auth.users'].rows>0&&before['auth.sessions'].rows>0&&before['public.tenants'].rows>0&&before['public.work_orders'].rows>0);
    assert.ok(before['private.fieldgrid_blog_posts'].rows>0&&before['private.fieldgrid_blog_receipts'].rows>=3);
    await db.query('begin');try{await db.query(migration);await db.query(editorial);await db.query('commit');}catch(error){await db.query('rollback');throw error;}
    const after={};for(const table of objects)after[table]=await metadata(table,table.startsWith('private.'));
    assert.deepEqual(after,before);
    const backfill=(await db.query('select revision,snapshot,actor_user_id,actor_credential_id,backfilled from private.fieldgrid_blog_revisions where post_id=$1',[article.id])).rows;
    assert.equal(backfill.length,1);assert.equal(backfill[0].revision,1);assert.deepEqual(backfill[0].snapshot,article.draft);assert.equal(backfill[0].backfilled,true);assert.equal(backfill[0].actor_user_id,null);assert.equal(backfill[0].actor_credential_id,null);
    assert.equal((await db.query('select count(*)::integer n from private.fieldgrid_blog_publish_events where post_id=$1 and revision=1 and backfilled',[article.id])).rows[0].n,1);
    assert.deepEqual(await legacy('media',upload),media,'Pre-upgrade media request returns its existing durable receipt');
    assert.deepEqual(await legacy('draft',draft),{...article,publicationVerified:false},'Pre-upgrade draft receipt survives the internal destination default');
    assert.deepEqual(await legacy('publish',publish),{...live,publicationVerified:false},'Pre-upgrade publish receipt survives the internal destination default');
    const evidence={result:'passed',migration:'20261126110835_fieldgrid_blog_connector',migrationSha256:digest(migration),database:target,tables:objects.map(table=>({table,before:before[table],after:after[table]})),historicalReceiptReplay:['media','draft','publish'],backfill:{preservedPresentDraftAndLive:true,revisionSnapshots:1,publishEvents:1,historicalActor:'unknown; no actor fabricated'},source:'Fresh task-owned clone; old immutable blog migration and representative records created before applying connector migration; no hosted or shared-source writes'};
    await writeFile('/tmp/fieldgrid-blog-connector-upgrade-evidence.json',JSON.stringify(evidence,null,2)+'\n',{mode:0o600});
    console.log('Connector upgrade: existing table counts/hashes identical; historical media/draft/publish receipts replayed.');
  } finally { await db.end(); }
});
