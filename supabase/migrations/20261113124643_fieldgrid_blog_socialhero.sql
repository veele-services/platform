-- One editorial aggregate with independent draft/live snapshots. No public table access.
create table private.fieldgrid_blog_authors (
 id text primary key check (id ~ '^[a-z0-9-]+$'), name text not null, active boolean not null default true
);
insert into private.fieldgrid_blog_authors(id,name) values ('fieldgrid-redactie','Fieldgrid');
create table private.fieldgrid_blog_categories (
 id text primary key check (id ~ '^[a-z0-9-]+$'), name text not null, active boolean not null default true
);
insert into private.fieldgrid_blog_categories(id,name) values ('planning','Planning'),('werkbonnen','Werkbonnen'),('klantportaal','Klantportaal'),('team-onboarding','Team & onboarding');
create table private.fieldgrid_blog_posts (
 id uuid primary key default gen_random_uuid(), site_id text not null check(site_id='fieldgrid'),
 environment text not null check(environment in('development','staging','production')), external_id text not null check(length(external_id) between 1 and 200),
 source text not null check(source in('manual','socialhero')), draft jsonb not null, revision integer not null default 1 check(revision>0),
 live jsonb, live_revision integer, published_at timestamptz, modified_at timestamptz,
 is_test boolean not null default false, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(site_id,environment,external_id), unique(site_id,environment,id),
 check((live is null and live_revision is null and published_at is null) or (live is not null and live_revision between 1 and revision and published_at is not null))
);
create index fieldgrid_blog_live_list on private.fieldgrid_blog_posts(site_id,environment,published_at desc) where live is not null and not is_test;
-- Registry rows always point to the article; the target is its current live slug, so redirect chains cannot form.
create table private.fieldgrid_blog_slugs (
 site_id text not null, environment text not null, slug text not null check(slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug)<=100),
 post_id uuid not null, was_live boolean not null default false, primary key(site_id,environment,slug),
 foreign key(site_id,environment,post_id) references private.fieldgrid_blog_posts(site_id,environment,id)
);
create index fieldgrid_blog_slugs_post on private.fieldgrid_blog_slugs(post_id);
create table private.fieldgrid_blog_assets (
 id uuid primary key, site_id text not null check(site_id='fieldgrid'), environment text not null check(environment in('development','staging','production')),
 storage_path text not null unique, type text not null check(type in('image/jpeg','image/png','image/webp')), width integer not null check(width between 1 and 12000), height integer not null check(height between 1 and 12000),
 bytes integer not null check(bytes between 1 and 10485760), sha256 text not null check(sha256 ~ '^[a-f0-9]{64}$'), created_at timestamptz not null default now(),
 check(storage_path ~ '^fieldgrid/(development|staging|production)/[a-f0-9-]+\.(jpg|png|webp)$')
);
create index fieldgrid_blog_assets_scope on private.fieldgrid_blog_assets(site_id,environment);
create table private.fieldgrid_blog_credentials (
 id uuid primary key default gen_random_uuid(), site_id text not null check(site_id='fieldgrid'), environment text not null check(environment in('development','staging','production')),
 label text not null check(length(label) between 1 and 160), token_hash text not null unique check(token_hash ~ '^[a-f0-9]{64}$'),
 scopes text[] not null check(scopes <@ array['read','media:write','draft:write','publish']::text[] and cardinality(scopes)>0),
 expires_at timestamptz not null, revoked_at timestamptz, created_at timestamptz not null default now()
);
create table private.fieldgrid_blog_receipts (
 site_id text not null, environment text not null, operation text not null, key text not null check(length(key) between 1 and 240),
 request_hash text not null, result jsonb not null, created_at timestamptz not null default now(), primary key(site_id,environment,operation,key)
);
create table private.fieldgrid_blog_rate (
 credential_id uuid not null references private.fieldgrid_blog_credentials(id) on delete cascade, window_start timestamptz not null, hits integer not null,
 primary key(credential_id,window_start)
);
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values('fieldgrid-blog-media','fieldgrid-blog-media',false,10485760,array['image/jpeg','image/png','image/webp']) on conflict(id) do nothing;
-- Every table stays private, even from service_role; only narrowly granted RPCs reach it.
do $$ declare n text; begin
 foreach n in array array['authors','categories','posts','slugs','assets','credentials','receipts','rate'] loop
 execute format('alter table private.fieldgrid_blog_%I enable row level security',n);
 execute format('alter table private.fieldgrid_blog_%I force row level security',n);
 execute format('revoke all on private.fieldgrid_blog_%I from public,anon,authenticated,service_role',n);
 end loop;
end $$;
create function private.fieldgrid_blog_entry(p private.fieldgrid_blog_posts) returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('id',p.id,'externalId',p.external_id,'source',p.source,'draft',p.draft,'revision',p.revision,'published',p.live,'publishedRevision',p.live_revision,'publishedAt',p.published_at,'publishedUpdatedAt',p.modified_at,'updatedAt',p.updated_at,'createdAt',p.created_at,'isTest',p.is_test)
$$;
create function private.fieldgrid_blog_editor() returns boolean language sql stable security definer set search_path='' as $$
 select private.ticket_session_active(auth.uid(),nullif(auth.jwt()->>'session_id','')::uuid)
 and exists(select 1 from public.platform_admins where user_id=auth.uid())
$$;
create function private.fieldgrid_blog_media_ids(fields jsonb) returns uuid[] language plpgsql immutable set search_path='' as $$
declare refs text[]; ref text; result uuid[]:='{}';begin
 with recursive nodes(v,depth) as (select fields->'content',0 union all select c,depth+1 from nodes cross join lateral jsonb_array_elements(coalesce(v->'content','[]')) c where depth<25)
 select array_agg(src) into refs from (select v->'attrs'->>'src' src from nodes where v->>'type'='image' union all select fields->'hero'->>'src' union all select fields->'shareImage'->>'src') r where src is not null;
 foreach ref in array coalesce(refs,'{}') loop
 if ref !~ '^/blog-media/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$' then raise exception 'INVALID_MEDIA' using errcode='22023';end if;
 result:=array_append(result,substring(ref from 13)::uuid);
 end loop;return result;
end $$;
create function private.fieldgrid_blog_validate(fields jsonb,site text,env text) returns jsonb language plpgsql stable set search_path='' as $$
declare node jsonb; mark jsonb; kind text; href text; author_name text; category_name text; media uuid; image jsonb; node_record record; node_count integer:=0; parent text;begin
 if jsonb_typeof(fields) is distinct from 'object' or length(fields::text)>500000 or length(coalesce(fields->>'title','')) not between 1 and 200 or coalesce(fields->>'slug','') !~ '^[a-z0-9]+(-[a-z0-9]+)*$' or length(fields->>'slug')>100
 or coalesce(fields->>'type','') not in('blog','article') or coalesce(fields->>'locale','') !~ '^[a-z]{2,3}(-[A-Za-z0-9]{2,8}){0,3}$' or jsonb_typeof(fields->'content') is distinct from 'object' or fields->'content'->>'type' is distinct from 'doc'
 or jsonb_typeof(fields->'tags') is distinct from 'array' or jsonb_array_length(fields->'tags')>15 or length(coalesce(fields->>'excerpt',''))>320 or length(coalesce(fields->>'seoTitle',''))>120 or length(coalesce(fields->>'seoDescription',''))>240 then raise exception 'INVALID_PAYLOAD' using errcode='22023'; end if;
 select name into author_name from private.fieldgrid_blog_authors where id=fields->>'authorId' and active;
 select name into category_name from private.fieldgrid_blog_categories where id=fields->>'categoryId' and active;
 if author_name is null or category_name is null then raise exception 'INVALID_TAXONOMY' using errcode='22023';end if;
 if exists(select 1 from jsonb_array_elements(fields->'tags') t where jsonb_typeof(t)<>'string' or length(t#>>'{}')>45) then raise exception 'INVALID_PAYLOAD' using errcode='22023';end if;
 for node_record in with recursive nodes(v,depth,parent) as(select fields->'content',0,null::text union all select c,depth+1,v->>'type' from nodes cross join lateral jsonb_array_elements(coalesce(v->'content','[]')) c where depth<25) select * from nodes limit 4001 loop
 node_count:=node_count+1;node:=node_record.v; parent:=node_record.parent;kind:=node->>'type';
 if node_count>4000 or node_record.depth>24 or jsonb_typeof(node)<>'object' then raise exception 'INVALID_CONTENT' using errcode='22023';end if;
 if (kind='doc')<>(node_record.depth=0) then raise exception 'INVALID_CONTENT' using errcode='22023';end if;
 if kind='text' and (jsonb_typeof(node->'text') is distinct from 'string' or length(node->>'text') not between 1 and 40000) then raise exception 'INVALID_CONTENT' using errcode='22023';end if;
 if kind in('doc','bulletList','orderedList','taskList','listItem','taskItem','blockquote','table','tableRow','tableCell','tableHeader') and coalesce(jsonb_array_length(node->'content'),0)=0 then raise exception 'INVALID_CONTENT' using errcode='22023';end if;
 if kind in('listItem','taskItem') and node->'content'->0->>'type' is distinct from 'paragraph' then raise exception 'INVALID_CONTENT' using errcode='22023';end if;
 if parent is not null and not(case parent when 'paragraph' then kind in('text','hardBreak') when 'heading' then kind in('text','hardBreak') when 'codeBlock' then kind='text' when 'bulletList' then kind='listItem' when 'orderedList' then kind='listItem' when 'taskList' then kind='taskItem' when 'table' then kind='tableRow' when 'tableRow' then kind in('tableCell','tableHeader') else parent in('doc','blockquote','listItem','taskItem','tableCell','tableHeader') and kind in('paragraph','heading','bulletList','orderedList','blockquote','codeBlock','horizontalRule','image','table','taskList') end) then raise exception 'INVALID_CONTENT' using errcode='22023';end if;
 if kind is null or kind not in('doc','text','paragraph','heading','bulletList','orderedList','listItem','blockquote','hardBreak','horizontalRule','image','table','tableRow','tableCell','tableHeader','codeBlock','taskList','taskItem') then raise exception 'INVALID_CONTENT' using errcode='22023';end if;
 if kind='heading' and coalesce((node->'attrs'->>'level')::integer,0) not between 2 and 4 then raise exception 'INVALID_CONTENT' using errcode='22023';end if;
 if node ? 'marks' then for mark in select value from jsonb_array_elements(node->'marks') loop
 if coalesce(mark->>'type','') not in('bold','italic','underline','strike','highlight','link','code') then raise exception 'INVALID_CONTENT' using errcode='22023';end if;
 if mark->>'type'='link' then href:=mark->'attrs'->>'href';if href is null or href !~ '^(https?://|/[^/]|#)' or href ~ '[[:space:][:cntrl:]\\]' or length(href)>2048 or href ~ '^https?://[^/]*@' then raise exception 'UNSAFE_LINK' using errcode='22023';end if;end if;
 end loop;end if;
 end loop;
 foreach media in array private.fieldgrid_blog_media_ids(fields) loop
 if not exists(select 1 from private.fieldgrid_blog_assets where id=media and site_id=site and environment=env) then raise exception 'INVALID_MEDIA' using errcode='22023';end if;
 end loop;
 foreach image in array array[fields->'hero',fields->'shareImage'] loop
 if image is not null and image<>'null'::jsonb and (length(coalesce(image->>'alt','')) not between 1 and 240 or coalesce((image->>'x')::numeric,-1) not between 0 and 1 or coalesce((image->>'y')::numeric,-1) not between 0 and 1) then raise exception 'INVALID_MEDIA' using errcode='22023';end if;
 end loop;
 return fields||jsonb_build_object('author',author_name,'category',category_name);
end $$;
-- Internal reader: service calls can inspect aggregate state; public wrapper below only exposes live snapshots.
create function private.fieldgrid_blog_read(operation text,payload jsonb) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare site text:=coalesce(payload->>'siteId','fieldgrid'); env text:=payload->>'environment'; p private.fieldgrid_blog_posts; a private.fieldgrid_blog_assets; receipt private.fieldgrid_blog_receipts; result jsonb;begin
 if site<>'fieldgrid' or coalesce(env,'') not in('development','staging','production') then raise exception 'INVALID_SCOPE' using errcode='22023';end if;
 -- Service-only receipt probe precedes state-dependent HTTP normalization.
 if operation='receipt' then
 if coalesce(payload->>'requestHash','') !~ '^[a-f0-9]{64}$' or length(coalesce(payload->>'idempotencyKey','')) not between 1 and 240 then raise exception 'INVALID_PAYLOAD' using errcode='22023';end if;
 select * into receipt from private.fieldgrid_blog_receipts where site_id=site and environment=env and fieldgrid_blog_receipts.operation=payload->>'operation' and key=payload->>'idempotencyKey';
 if not found then return null;end if;
 if receipt.request_hash<>payload->>'requestHash' then raise exception 'IDEMPOTENCY_CONFLICT' using errcode='23514';end if;
 return receipt.result;
 end if;
 if operation='taxonomy' then return jsonb_build_object('authors',(select jsonb_agg(jsonb_build_object('id',id,'name',name) order by id) from private.fieldgrid_blog_authors where active),'categories',(select jsonb_agg(jsonb_build_object('id',id,'name',name) order by id) from private.fieldgrid_blog_categories where active));end if;
 if operation in('list','public.list') then
 select coalesce(jsonb_agg(case when operation='public.list' then private.fieldgrid_blog_entry(x)||jsonb_build_object('draft',x.live,'revision',x.live_revision,'updatedAt',coalesce(x.modified_at,x.published_at)) else private.fieldgrid_blog_entry(x) end order by case when operation='public.list' then coalesce(x.modified_at,x.published_at) else x.updated_at end desc),'[]') into result from private.fieldgrid_blog_posts x where x.site_id=site and x.environment=env and (operation='list' or(x.live is not null and not x.is_test));return result;
 end if;
 if operation='get' then select * into p from private.fieldgrid_blog_posts where site_id=site and environment=env and ((payload ? 'id' and id=(payload->>'id')::uuid) or (payload ? 'externalId' and external_id=payload->>'externalId'));return case when p.id is null then null else private.fieldgrid_blog_entry(p) end;end if;
 if operation='resolve' then
 select x.* into p from private.fieldgrid_blog_slugs s join private.fieldgrid_blog_posts x on x.id=s.post_id where s.site_id=site and s.environment=env and s.slug=payload->>'slug' and s.was_live and x.live is not null and not x.is_test;
 if p.id is null then return null;end if;
 if p.live->>'slug'<>payload->>'slug' then return jsonb_build_object('redirect','/blog/'||(p.live->>'slug'));end if;
 return jsonb_build_object('entry',private.fieldgrid_blog_entry(p)||jsonb_build_object('draft',p.live,'revision',p.live_revision,'updatedAt',coalesce(p.modified_at,p.published_at)));
 end if;
 if operation in('media','public.media') then
 select * into a from private.fieldgrid_blog_assets where id=(payload->>'assetId')::uuid and site_id=site and environment=env;
 if a.id is null then return null;end if;
 if operation='public.media' and not exists(select 1 from private.fieldgrid_blog_posts where site_id=site and environment=env and live is not null and not is_test and a.id=any(private.fieldgrid_blog_media_ids(live))) then return null;end if;
 return jsonb_build_object('assetId',a.id,'storagePath',a.storage_path,'type',a.type,'width',a.width,'height',a.height,'bytes',a.bytes,'sha256',a.sha256);
 end if;
 if operation='credentials' then return coalesce((select jsonb_agg(jsonb_build_object('id',id,'label',label,'scopes',scopes,'expiresAt',expires_at,'revokedAt',revoked_at) order by created_at desc) from private.fieldgrid_blog_credentials where site_id=site and environment=env),'[]');end if;
 raise exception 'INVALID_OPERATION' using errcode='22023';
end $$;
create function private.fieldgrid_blog_write(operation text,payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare site text:=coalesce(payload->>'siteId','fieldgrid'); env text:=payload->>'environment'; p private.fieldgrid_blog_posts; receipt private.fieldgrid_blog_receipts; fields jsonb; result jsonb; idem_key text:=payload->>'idempotencyKey'; op text:=operation; fingerprint text; xid text; aid uuid; owner_id uuid; credential uuid; hits integer; window_at timestamptz:=date_trunc('minute',clock_timestamp());begin
 if site<>'fieldgrid' or coalesce(env,'') not in('development','staging','production') or jsonb_typeof(payload) is distinct from 'object' or length(payload::text)>600000 then raise exception 'INVALID_SCOPE' using errcode='22023';end if;
 if operation='rate' then
 credential:=(payload->>'credentialId')::uuid;
 if not exists(select 1 from private.fieldgrid_blog_credentials where id=credential and site_id=site and environment=env and revoked_at is null and expires_at>now()) then raise exception 'PERMISSION_DENIED' using errcode='42501';end if;
 insert into private.fieldgrid_blog_rate(credential_id,window_start,hits) values(credential,window_at,1) on conflict(credential_id,window_start) do update set hits=private.fieldgrid_blog_rate.hits+1 returning fieldgrid_blog_rate.hits into hits;
 delete from private.fieldgrid_blog_rate where window_start<now()-interval '1 day';
 return jsonb_build_object('allowed',hits<=60,'remaining',greatest(0,60-hits),'retryAfter',greatest(1,ceil(extract(epoch from(window_at+interval '1 minute'-clock_timestamp())))));
 end if;
 if idem_key is null or length(idem_key) not between 1 and 240 then raise exception 'IDEMPOTENCY_KEY_REQUIRED' using errcode='22023';end if;
 if payload ? 'requestHash' then
 if coalesce(payload->>'requestHash','') !~ '^[a-f0-9]{64}$' then raise exception 'INVALID_PAYLOAD' using errcode='22023';end if;
 fingerprint:=payload->>'requestHash';
 else fingerprint:=encode(extensions.digest((payload-'idempotencyKey'-'tokenHash'-'credentialId')::text,'sha256'),'hex');end if;
 perform pg_advisory_xact_lock(hashtextextended(site||':'||env||':'||operation||':'||idem_key,0));
 select * into receipt from private.fieldgrid_blog_receipts where site_id=site and environment=env and fieldgrid_blog_receipts.operation=op and fieldgrid_blog_receipts.key=idem_key;
 if found then if receipt.request_hash<>fingerprint then raise exception 'IDEMPOTENCY_CONFLICT' using errcode='23514';end if;return receipt.result;end if;
 if operation='draft' then
 xid:=payload->>'externalId';if xid is null or length(xid) not between 1 and 200 then raise exception 'INVALID_EXTERNAL_ID' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended(site||':'||env||':post:'||xid,0));
 select * into p from private.fieldgrid_blog_posts where site_id=site and environment=env and external_id=xid for update;
 if p.id is not null and coalesce((payload->>'expectedRevision')::integer,0)<>p.revision then raise exception 'REVISION_CONFLICT' using errcode='40001';end if;
 if p.id is null and coalesce((payload->>'expectedRevision')::integer,0)<>0 then raise exception 'REVISION_CONFLICT' using errcode='40001';end if;
 fields:=private.fieldgrid_blog_validate(payload->'fields',site,env);
 if p.id is null then
 insert into private.fieldgrid_blog_posts(site_id,environment,external_id,source,draft,is_test) values(site,env,xid,coalesce(payload->>'source','socialhero'),fields,coalesce((payload->>'isTest')::boolean,false)) returning * into p;
 else
 update private.fieldgrid_blog_posts set draft=fields,revision=revision+1,updated_at=clock_timestamp() where id=p.id returning * into p;
 end if;
 insert into private.fieldgrid_blog_slugs(site_id,environment,slug,post_id) values(site,env,fields->>'slug',p.id) on conflict(site_id,environment,slug) do nothing;
 select post_id into owner_id from private.fieldgrid_blog_slugs where site_id=site and environment=env and slug=fields->>'slug';
 if owner_id<>p.id then raise exception 'SLUG_CONFLICT' using errcode='23505';end if;
 result:=private.fieldgrid_blog_entry(p);
 elsif operation='publish' then
 select * into p from private.fieldgrid_blog_posts where site_id=site and environment=env and ((payload ? 'id' and id=(payload->>'id')::uuid) or external_id=payload->>'externalId') for update;
 if p.id is null then raise exception 'NOT_FOUND' using errcode='P0002';end if;
 if coalesce((payload->>'revision')::integer,0)<>p.revision then raise exception 'REVISION_CONFLICT' using errcode='40001';end if;
 perform private.fieldgrid_blog_validate(p.draft,site,env);
 if length(btrim(coalesce(p.draft->>'excerpt','')))=0 or p.draft->'hero' is null or p.draft->'hero'='null'::jsonb or not exists(with recursive nodes(v,depth) as(select p.draft->'content',0 union all select c,depth+1 from nodes cross join lateral jsonb_array_elements(coalesce(v->'content','[]')) c where depth<25) select 1 from nodes where length(btrim(coalesce(v->>'text','')))>0) then raise exception 'NOT_PUBLISHABLE' using errcode='22023';end if;
 if p.live_revision=p.revision then result:=private.fieldgrid_blog_entry(p); else
 update private.fieldgrid_blog_posts set live=draft,live_revision=revision,published_at=coalesce(published_at,clock_timestamp()),modified_at=clock_timestamp(),updated_at=clock_timestamp() where id=p.id returning * into p;
 update private.fieldgrid_blog_slugs set was_live=true where site_id=site and environment=env and post_id=p.id and slug=p.live->>'slug';
 result:=private.fieldgrid_blog_entry(p);end if;
 elsif operation='media' then
 aid:=(payload->>'assetId')::uuid;
 if payload->>'storagePath' is distinct from ('fieldgrid/'||env||'/'||aid::text||case payload->>'type' when 'image/jpeg' then '.jpg' when 'image/png' then '.png' when 'image/webp' then '.webp' else '.invalid' end) then raise exception 'INVALID_MEDIA' using errcode='22023';end if;
 insert into private.fieldgrid_blog_assets(id,site_id,environment,storage_path,type,width,height,bytes,sha256) values(aid,site,env,payload->>'storagePath',payload->>'type',(payload->>'width')::integer,(payload->>'height')::integer,(payload->>'bytes')::integer,payload->>'sha256');
 result:=jsonb_build_object('assetId',aid,'width',(payload->>'width')::integer,'height',(payload->>'height')::integer,'type',payload->>'type','src','/blog-media/'||aid::text);
 elsif operation='credential.create' then
 insert into private.fieldgrid_blog_credentials(site_id,environment,label,token_hash,scopes,expires_at) values(site,env,payload->>'label',payload->>'tokenHash',array(select jsonb_array_elements_text(payload->'scopes')),(payload->>'expiresAt')::timestamptz) returning id into credential;
 result:=jsonb_build_object('id',credential);
 elsif operation='credential.revoke' then
 update private.fieldgrid_blog_credentials set revoked_at=clock_timestamp() where id=(payload->>'credentialId')::uuid and site_id=site and environment=env returning id into credential;
 if credential is null then raise exception 'NOT_FOUND' using errcode='P0002';end if; result:=jsonb_build_object('id',credential,'revoked',true);
 else raise exception 'INVALID_OPERATION' using errcode='22023';end if;
 insert into private.fieldgrid_blog_receipts(site_id,environment,operation,key,request_hash,result) values(site,env,operation,idem_key,fingerprint,result);
 return result;
end $$;
create function public.fieldgrid_blog_read(operation text,payload jsonb) returns jsonb language sql security definer set search_path='' as $$ select private.fieldgrid_blog_read(operation,payload) $$;
create function public.fieldgrid_blog_write(operation text,payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare credential private.fieldgrid_blog_credentials; required_scope text;begin
 if operation not in('rate','draft','publish','media') then raise exception 'PERMISSION_DENIED' using errcode='42501';end if;
 select * into credential from private.fieldgrid_blog_credentials where id=(payload->>'credentialId')::uuid and token_hash=payload->>'tokenHash' and site_id=payload->>'siteId' and environment=payload->>'environment' and revoked_at is null and expires_at>clock_timestamp() for share;
 required_scope:=case operation when 'draft' then 'draft:write' when 'publish' then 'publish' when 'media' then 'media:write' else null end;
 if credential.id is null or(required_scope is not null and not required_scope=any(credential.scopes)) then raise exception 'PERMISSION_DENIED' using errcode='42501';end if;
 return private.fieldgrid_blog_write(operation,payload);
end $$;
create function public.fieldgrid_blog_public_read(operation text,payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
begin if operation not in('public.list','resolve','public.media','taxonomy') then raise exception 'PERMISSION_DENIED' using errcode='42501';end if;return private.fieldgrid_blog_read(operation,payload);end $$;
create function public.fieldgrid_blog_admin_read(operation text,payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
begin if not private.fieldgrid_blog_editor() or operation='receipt' then raise exception 'PERMISSION_DENIED' using errcode='42501';end if;return private.fieldgrid_blog_read(operation,payload);end $$;
create function public.fieldgrid_blog_admin_write(operation text,payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
begin if not private.fieldgrid_blog_editor() or payload ? 'requestHash' or operation not in('draft','publish','media','credential.create','credential.revoke') then raise exception 'PERMISSION_DENIED' using errcode='42501';end if;return private.fieldgrid_blog_write(operation,payload);end $$;
create function public.fieldgrid_blog_authenticate(token_hash text) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',id,'siteId',site_id,'environment',environment,'scopes',scopes,'expiresAt',expires_at) from private.fieldgrid_blog_credentials where fieldgrid_blog_credentials.token_hash=$1 and revoked_at is null and expires_at>now()
$$;
revoke all on function private.fieldgrid_blog_entry(private.fieldgrid_blog_posts),private.fieldgrid_blog_editor(),private.fieldgrid_blog_media_ids(jsonb),private.fieldgrid_blog_validate(jsonb,text,text),private.fieldgrid_blog_read(text,jsonb),private.fieldgrid_blog_write(text,jsonb) from public,anon,authenticated,service_role;
revoke all on function public.fieldgrid_blog_read(text,jsonb),public.fieldgrid_blog_write(text,jsonb),public.fieldgrid_blog_public_read(text,jsonb),public.fieldgrid_blog_admin_read(text,jsonb),public.fieldgrid_blog_admin_write(text,jsonb),public.fieldgrid_blog_authenticate(text) from public,anon,authenticated,service_role;
grant execute on function public.fieldgrid_blog_read(text,jsonb),public.fieldgrid_blog_write(text,jsonb),public.fieldgrid_blog_authenticate(text) to service_role;
grant execute on function public.fieldgrid_blog_public_read(text,jsonb) to service_role;
grant execute on function public.fieldgrid_blog_admin_read(text,jsonb),public.fieldgrid_blog_admin_write(text,jsonb) to authenticated;
