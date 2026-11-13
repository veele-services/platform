import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import test from 'node:test';
import pg from 'pg';
import { workOrderTestDatabase } from './work-order-test-target.mjs';
import { assertBlogTestDatabase, blogTestDatabaseConfig } from './blog-test-database.mjs';

// Default: the existing guarded local/CI Supabase stack. Opt in to the dedicated
// acceptance clone with FIELDGRID_BLOG_ISOLATED_TEST=1. Remote targets are refused.
// Neither mode reads a local .env file.
const isolated = process.env.FIELDGRID_BLOG_ISOLATED_TEST === '1';
if (process.env.FIELDGRID_STAGING_SMOKE) throw new Error('Blog fixture tests are local-only.');
const config = isolated ? blogTestDatabaseConfig() : undefined;
const scope = { siteId: 'fieldgrid', environment: 'development' };
const hash = value => createHash('sha256').update(value).digest('hex');
const client = async () => { const db = isolated ? new pg.Client(config) : await workOrderTestDatabase(); if (isolated) { await db.connect(); await assertBlogTestDatabase(db); } assert.equal((await db.query('select current_database() db')).rows[0].db, isolated ? 'fieldgrid_blog_isolated' : 'postgres'); return db; };

test('Fieldgrid blog: real isolated Postgres upgrade, authorization, revisions and durable operations', async t => {
  const db = await client(), admin = randomUUID(), member = randomUUID(), session = randomUUID(), run = randomUUID(), mediaId = randomUUID(), testMediaId = randomUUID();
  const credentials = { id: randomUUID(), tokenHash: hash(randomUUID()) };
  const call = async (rpc, operation, payload = {}, role = 'service_role', actor = null, sessionId = null, use = db) => {
    await use.query('begin');
    try {
      await use.query(`set local role ${role}`);
      await use.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify({ role, sub: actor, session_id: sessionId })]);
      const result = (await use.query(`select public.${rpc}($1,$2::jsonb) result`, [operation, JSON.stringify({ ...scope, ...payload })])).rows[0].result;
      await use.query('commit'); return result;
    } catch (error) { await use.query('rollback'); throw error; }
  };
  const adminWrite = (op,p) => call('fieldgrid_blog_admin_write',op,{ ...p, idempotencyKey: p.idempotencyKey ?? randomUUID() },'authenticated',admin,session);
  const serviceWrite = (op,p,use) => call('fieldgrid_blog_write',op,{credentialId:credentials.id,tokenHash:credentials.tokenHash,...p},'service_role',null,null,use);
  const publicRead = (op,p={}) => call('fieldgrid_blog_public_read',op,p,'service_role');
  const privateRead = (op,p={}) => call('fieldgrid_blog_read',op,p);
  const fields = (slug = `test-${run}`) => ({ type:'blog', locale:'nl-NL', title:'Geïsoleerde databaseproef', slug, excerpt:'Een concrete samenvatting.', content:{type:'doc',content:[{type:'heading',attrs:{level:2},content:[{type:'text',text:'Planning'}]},{type:'paragraph',content:[{type:'text',text:'Een echt artikel met voldoende tekst.'}]}]},seoTitle:'Planning',seoDescription:'Concrete uitleg',authorId:'fieldgrid-redactie',author:'Incorrect supplied name',categoryId:'planning',category:'Incorrect category',tags:['planning'],hero:{src:`/blog-media/${mediaId}`,alt:'Een planning op tafel',x:0.3,y:0.7},shareImage:null });
  const deny = promise => assert.rejects(promise, error => error.code === '42501');
  const conflict = (promise,code) => assert.rejects(promise,error => error.message === code);
  let first, published;
  try {
    await db.query('insert into auth.users(id,email,email_confirmed_at) values($1,$2,now()),($3,$4,now())',[admin,`${admin}@blog.invalid`,member,`${member}@blog.invalid`]);
    await db.query('insert into auth.sessions(id,user_id,created_at,updated_at) values($1,$2,now(),now())',[session,admin]);
    await db.query('insert into public.platform_admins(user_id) values($1)',[admin]);
    await db.query("insert into private.fieldgrid_blog_credentials(id,site_id,environment,label,token_hash,scopes,expires_at) values($1,'fieldgrid','development','Isolated integration test',$2,array['read','media:write','draft:write','publish'],now()+interval '1 hour')",[credentials.id,credentials.tokenHash]);

    await t.test('upgrade retains the existing Fieldgrid schema and a real author/category',async()=>{
      assert.ok(Number((await db.query("select count(*) n from information_schema.tables where table_schema='public'")).rows[0].n)>100);
      const catalog=await db.query("select relname,relrowsecurity,relforcerowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='private' and c.relname like 'fieldgrid_blog_%' and c.relkind='r'");
      assert.equal(catalog.rows.length,8);assert.ok(catalog.rows.every(r=>r.relrowsecurity&&r.relforcerowsecurity));
      assert.equal((await db.query("select count(*) n from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in('public','private') and p.proname like 'fieldgrid_blog_%' and (has_function_privilege('anon',p.oid,'execute') or (p.prosecdef and not coalesce(p.proconfig @> array['search_path=\"\"'],false)))")).rows[0].n,'0');
      const taxonomy=await publicRead('taxonomy');assert.ok(taxonomy.authors.some(a=>a.id==='fieldgrid-redactie'&&a.name==='Fieldgrid'));assert.ok(taxonomy.categories.some(c=>c.id==='planning'));
      await deny(call('fieldgrid_blog_admin_read','list',{},'authenticated',member,session));
      await deny(call('fieldgrid_blog_admin_read','list',{},'authenticated',admin,randomUUID()));
      await deny(publicRead('get',{externalId:run}));
      await db.query('begin');await db.query('set local role authenticated');await assert.rejects(db.query('select * from private.fieldgrid_blog_posts'),e=>e.code==='42501');await db.query('rollback');
    });
    await t.test('durable media registration/retry and scope validation',async()=>{
      const upload={assetId:mediaId,storagePath:`fieldgrid/development/${mediaId}.png`,type:'image/png',width:1200,height:1600,bytes:1234,sha256:hash('valid-decoded-image'),idempotencyKey:randomUUID()};
      assert.deepEqual(await serviceWrite('media',upload),await serviceWrite('media',upload));
      await conflict(serviceWrite('media',{...upload,width:1201}),'IDEMPOTENCY_CONFLICT');
      assert.equal(await publicRead('public.media',{assetId:mediaId}),null);
      assert.equal(await privateRead('media',{assetId:mediaId,environment:'staging'}),null);
      await conflict(adminWrite('draft',{externalId:`bad-media-${run}`,fields:{...fields(),hero:{...fields().hero,src:`/blog-media/${randomUUID()}`}}}),'INVALID_MEDIA');
    });
    await t.test('draft retries survive a lost response and enforce expected revision',async()=>{
      const draft={externalId:run,fields:fields(),expectedRevision:0,idempotencyKey:randomUUID()};
      first=await serviceWrite('draft',draft);assert.deepEqual(await serviceWrite('draft',draft),first);
      assert.equal(first.draft.author,'Fieldgrid');assert.equal(first.draft.category,'Planning');
      await conflict(serviceWrite('draft',{...draft,fields:{...fields(),title:'Changed'}}),'IDEMPOTENCY_CONFLICT');
      await conflict(serviceWrite('draft',{...draft,expectedRevision:2,idempotencyKey:randomUUID()}),'REVISION_CONFLICT');
      await conflict(adminWrite('draft',{externalId:`duplicate-${run}`,expectedRevision:0,fields:fields()}),'SLUG_CONFLICT');
      assert.equal(await publicRead('resolve',{slug:fields().slug}),null);assert.equal((await publicRead('public.list')).some(p=>p.id===first.id),false);
    });
    await t.test('database rejects bypassed editor validation and incomplete publication',async()=>{
      for(const invalid of [ { ...fields(`unsafe-${run}`),content:{type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'x',marks:[{type:'link',attrs:{href:'javascript:alert(1)'}}]}]}]} }, {...fields(`tax-${run}`),authorId:'fictional'}, {...fields(`h1-${run}`),content:{type:'doc',content:[{type:'heading',attrs:{level:1},content:[{type:'text',text:'h1'}]}]}} ]) await assert.rejects(adminWrite('draft',{externalId:randomUUID(),fields:invalid}),e=>['UNSAFE_LINK','INVALID_TAXONOMY','INVALID_CONTENT'].includes(e.message));
      const incomplete=await adminWrite('draft',{externalId:`empty-${run}`,fields:{...fields(`empty-${run}`),hero:null,excerpt:''}});
      await conflict(adminWrite('publish',{id:incomplete.id,revision:incomplete.revision}),'NOT_PUBLISHABLE');
      const supportedDocument = { type:'doc', content:[
        { type:'codeBlock', content:[{type:'text',text:'const a=1',marks:[{type:'code'}]}] },
        { type:'taskList', content:[{ type:'taskItem', attrs:{checked:true}, content:[{type:'paragraph',content:[{type:'text',text:'Taak'}]}] }] },
      ] };
      const supported=await adminWrite('draft',{externalId:`nodes-${run}`,fields:{...fields(`nodes-${run}`),content:supportedDocument}});
      assert.equal(supported.revision,1);
      let nested={type:'paragraph',content:[{type:'text',text:'deep'}]};for(let i=0;i<30;i++)nested={type:'blockquote',content:[nested]};
      await conflict(adminWrite('draft',{externalId:randomUUID(),fields:{...fields(`deep-${run}`),content:{type:'doc',content:[nested]}}}),'INVALID_CONTENT');
    });
    await t.test('atomic publication exposes only the selected live revision and referenced media',async()=>{
      const op={externalId:run,revision:1,idempotencyKey:randomUUID()};published=await serviceWrite('publish',op);assert.deepEqual(await serviceWrite('publish',op),published);
      assert.equal(published.publishedRevision,1);assert.equal((await publicRead('resolve',{slug:fields().slug})).entry.revision,1);assert.equal((await publicRead('public.media',{assetId:mediaId})).assetId,mediaId);
      const draft=await serviceWrite('draft',{externalId:run,fields:{...fields(),title:'New draft title'},expectedRevision:1,idempotencyKey:randomUUID()});assert.equal(draft.revision,2);
      const live=(await publicRead('resolve',{slug:fields().slug})).entry;assert.equal(live.draft.title,fields().title);assert.equal(live.revision,1);assert.equal(live.updatedAt,published.publishedUpdatedAt);
      await conflict(serviceWrite('publish',{externalId:run,revision:1,idempotencyKey:randomUUID()}),'REVISION_CONFLICT');
      await serviceWrite('publish',{externalId:run,revision:2,idempotencyKey:randomUUID()});
    });
    await t.test('historical slugs remain reserved and redirect directly to the current live URL',async()=>{
      for(const [revision,suffix] of [[2,'second'],[3,'third']]){const draft=await serviceWrite('draft',{externalId:run,fields:fields(`${fields().slug}-${suffix}`),expectedRevision:revision,idempotencyKey:randomUUID()});await serviceWrite('publish',{externalId:run,revision:draft.revision,idempotencyKey:randomUUID()});}
      assert.equal((await publicRead('resolve',{slug:fields().slug})).redirect,`/blog/${fields().slug}-third`);assert.equal((await publicRead('resolve',{slug:`${fields().slug}-second`})).redirect,`/blog/${fields().slug}-third`);
      await conflict(adminWrite('draft',{externalId:`reuse-${run}`,fields:fields()}),'SLUG_CONFLICT');
    });
    await t.test('raw request receipts replay before state-dependent normalization after later slug revisions',async()=>{
      const requestHash=hash('original raw body without a slug + externalId + expectedRevision=0');
      const original={externalId:`receipt-${run}`,fields:fields(`receipt-${run}`),expectedRevision:0,idempotencyKey:randomUUID(),requestHash};
      const receipt=await serviceWrite('draft',original);
      await serviceWrite('draft',{externalId:original.externalId,fields:fields(`receipt-later-${run}`),expectedRevision:1,idempotencyKey:randomUUID(),requestHash:hash('later edit')});
      assert.deepEqual(await privateRead('receipt',{operation:'draft',idempotencyKey:original.idempotencyKey,requestHash}),receipt);
      assert.deepEqual(await serviceWrite('draft',{...original,fields:fields(`receipt-later-${run}`)}),receipt,'The original request hash survives normalization against a newer slug');
      assert.equal((await privateRead('get',{externalId:original.externalId})).revision,2);
      assert.equal(await privateRead('receipt',{operation:'draft',idempotencyKey:randomUUID(),requestHash}),null);
      await conflict(privateRead('receipt',{operation:'draft',idempotencyKey:original.idempotencyKey,requestHash:hash('changed raw request')}),'IDEMPOTENCY_CONFLICT');
      await conflict(serviceWrite('draft',{...original,requestHash:hash('changed raw request')}),'IDEMPOTENCY_CONFLICT');
      await deny(call('fieldgrid_blog_admin_read','receipt',{operation:'draft',idempotencyKey:original.idempotencyKey,requestHash},'authenticated',admin,session));
      await deny(adminWrite('draft',{...original,idempotencyKey:randomUUID()}));
      await deny(publicRead('receipt',{operation:'draft',idempotencyKey:original.idempotencyKey,requestHash}));
    });
    await t.test('concurrent retries commit exactly one draft and a stale writer cannot replace it',async()=>{
      const db2=await client();try{const op={externalId:`concurrent-${run}`,fields:fields(`concurrent-${run}`),expectedRevision:0,idempotencyKey:randomUUID()};const [a,b]=await Promise.all([serviceWrite('draft',op),serviceWrite('draft',op,db2)]);assert.deepEqual(a,b);assert.equal(a.revision,1);
        const edits=[{...op,expectedRevision:1,idempotencyKey:randomUUID()},{...op,expectedRevision:1,idempotencyKey:randomUUID(),fields:{...op.fields,title:'Other edit'}}];const result=await Promise.allSettled([serviceWrite('draft',edits[0]),serviceWrite('draft',edits[1],db2)]);assert.equal(result.filter(x=>x.status==='fulfilled').length,1);assert.equal(result.find(x=>x.status==='rejected').reason.message,'REVISION_CONFLICT');
      }finally{await db2.end()}
    });
    await t.test('test publications never enter the public list, resolver or media access',async()=>{
      await serviceWrite('media',{assetId:testMediaId,storagePath:`fieldgrid/development/${testMediaId}.png`,type:'image/png',width:800,height:1200,bytes:500,sha256:hash('test-only-media'),idempotencyKey:randomUUID()});
      const draft=await adminWrite('draft',{externalId:`test-${run}`,fields:{...fields(`test-only-${run}`),hero:{...fields().hero,src:`/blog-media/${testMediaId}`}},isTest:true});await adminWrite('publish',{id:draft.id,revision:draft.revision});assert.equal(await publicRead('resolve',{slug:draft.draft.slug}),null);assert.equal((await publicRead('public.list')).some(p=>p.id===draft.id),false);assert.equal(await publicRead('public.media',{assetId:testMediaId}),null);
    });
    await t.test('scoped credentials expire/revoke and a durable per-credential limit applies',async()=>{
      await deny(serviceWrite('draft',{externalId:randomUUID(),fields:fields(`wrong-token-${run}`),tokenHash:hash('wrong'),idempotencyKey:randomUUID()}));
      const rate=await serviceWrite('rate',{});assert.equal(rate.allowed,true);for(let i=0;i<59;i++)await serviceWrite('rate',{});assert.equal((await serviceWrite('rate',{})).allowed,false);
      await db.query('update private.fieldgrid_blog_credentials set expires_at=now()-interval \'1 second\' where id=$1',[credentials.id]);await deny(serviceWrite('rate',{}));
      assert.equal((await db.query('select public.fieldgrid_blog_authenticate($1) result',[credentials.tokenHash])).rows[0].result,null);
      await db.query('update private.fieldgrid_blog_credentials set expires_at=now()+interval \'1 hour\' where id=$1',[credentials.id]);
      await db.query('update private.fieldgrid_blog_credentials set scopes=array[\'read\'] where id=$1',[credentials.id]);await deny(serviceWrite('publish',{externalId:run,revision:4,idempotencyKey:randomUUID()}));
      await db.query('update private.fieldgrid_blog_credentials set revoked_at=now() where id=$1',[credentials.id]);await deny(serviceWrite('rate',{}));
      await db.query('update auth.sessions set not_after=now()-interval \'1 second\' where id=$1',[session]);await deny(call('fieldgrid_blog_admin_read','list',{},'authenticated',admin,session));
    });
  } finally {
    // Preserve schema and migration; remove only this run's fixtures.
    await db.query("delete from private.fieldgrid_blog_receipts where result->>'externalId'=$1 or result->>'externalId' like $2 or result->>'assetId'=any($3::text[])",[run,`%${run}`,[mediaId,testMediaId]]);
    await db.query('delete from private.fieldgrid_blog_slugs where post_id in(select id from private.fieldgrid_blog_posts where external_id=$1 or external_id like $2)',[run,`%${run}`]);
    await db.query('delete from private.fieldgrid_blog_posts where external_id=$1 or external_id like $2',[run,`%${run}`]);
    await db.query('delete from private.fieldgrid_blog_assets where id=any($1::uuid[])',[[mediaId,testMediaId]]);
    await db.query('delete from private.fieldgrid_blog_credentials where id=$1',[credentials.id]);
    await db.query('delete from public.platform_admins where user_id=$1',[admin]);await db.query('delete from auth.users where id=any($1::uuid[])',[[admin,member]]);await db.end();
  }
});
