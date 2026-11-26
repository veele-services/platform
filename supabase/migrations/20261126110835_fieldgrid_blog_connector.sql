-- Durable two-phase SocialHero pairing. The nil destination preserves existing records.
create table private.fieldgrid_blog_destinations (
 site_id text not null check(site_id='fieldgrid'), environment text not null check(environment in('development','staging','production')),
 id uuid not null, allow_draft boolean not null default true, allow_publish boolean not null default false, policy_updated_by uuid, policy_updated_at timestamptz, created_at timestamptz not null default now(), primary key(site_id,environment,id)
);
insert into private.fieldgrid_blog_destinations(site_id,environment,id,allow_publish)
 select 'fieldgrid',e,'00000000-0000-0000-0000-000000000000',true from unnest(array['development','staging','production']) e;
alter table private.fieldgrid_blog_posts add column destination_id uuid not null default '00000000-0000-0000-0000-000000000000';
alter table private.fieldgrid_blog_assets add column destination_id uuid not null default '00000000-0000-0000-0000-000000000000';
alter table private.fieldgrid_blog_receipts add column destination_id uuid not null default '00000000-0000-0000-0000-000000000000';
alter table private.fieldgrid_blog_credentials add column destination_id uuid not null default '00000000-0000-0000-0000-000000000000',
 add column connection_id uuid unique, add column state text not null default 'active' check(state in('pending','active'));
alter table private.fieldgrid_blog_posts drop constraint fieldgrid_blog_posts_site_id_environment_external_id_key,
 add unique(site_id,environment,destination_id,external_id), add foreign key(site_id,environment,destination_id) references private.fieldgrid_blog_destinations(site_id,environment,id);
alter table private.fieldgrid_blog_assets add foreign key(site_id,environment,destination_id) references private.fieldgrid_blog_destinations(site_id,environment,id);
alter table private.fieldgrid_blog_receipts drop constraint fieldgrid_blog_receipts_pkey,
 add primary key(site_id,environment,destination_id,operation,key), add foreign key(site_id,environment,destination_id) references private.fieldgrid_blog_destinations(site_id,environment,id);
alter table private.fieldgrid_blog_credentials drop constraint fieldgrid_blog_credentials_scopes_check,
 add check(scopes <@ array['read','draft','media:write','draft:write','publish']::text[] and cardinality(scopes)>0),
 add check((connection_id is null and destination_id='00000000-0000-0000-0000-000000000000' and state='active') or (connection_id is not null and destination_id<>'00000000-0000-0000-0000-000000000000')),
 add foreign key(site_id,environment,destination_id) references private.fieldgrid_blog_destinations(site_id,environment,id);
create index fieldgrid_blog_credentials_provision_expiry on private.fieldgrid_blog_credentials(site_id,environment,expires_at) where connection_id is not null and state='pending' and revoked_at is null;
create index fieldgrid_blog_assets_destination on private.fieldgrid_blog_assets(site_id,environment,destination_id);
create table private.fieldgrid_blog_pairings (
 attempt_id uuid primary key, site_id text not null check(site_id='fieldgrid'), environment text not null check(environment in('development','staging','production')),
 connection_id uuid unique, destination_id uuid, code_hash text not null check(code_hash ~ '^[a-f0-9]{64}$'),
 encrypted_code text, encrypted_token text, token_hash text check(token_hash ~ '^[a-f0-9]{64}$'),
 origin text not null check(origin ~ '^https?://[^/?#[:space:]]+$' and length(origin)<=300),
 state text not null check(state in('claiming','pending','active','rejected','expired','disconnected','superseded')),
 allow_draft boolean not null, allow_publish boolean not null,
 expires_at timestamptz not null, created_by uuid not null references auth.users(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 check(encrypted_code is null or length(encrypted_code) between 20 and 12000), check(encrypted_token is null or length(encrypted_token) between 20 and 12000),
 foreign key(site_id,environment,destination_id) references private.fieldgrid_blog_destinations(site_id,environment,id)
);
create index fieldgrid_blog_pairings_scope on private.fieldgrid_blog_pairings(site_id,environment,created_at desc);
create index fieldgrid_blog_pairings_expiring on private.fieldgrid_blog_pairings(expires_at) where encrypted_code is not null or encrypted_token is not null;
-- Historical decision identifiers are retained even if an operator removes an old fixture/user.
create table private.fieldgrid_blog_policy_audit (
 id uuid primary key default gen_random_uuid(), site_id text not null check(site_id='fieldgrid'), environment text not null check(environment in('development','staging','production')),
 destination_id uuid not null, connection_id uuid, attempt_id uuid, actor_user_id uuid not null,
 requested_allow_draft boolean not null, requested_allow_publish boolean not null, allow_draft boolean not null, allow_publish boolean not null,
 reason text not null check(reason in('pairing','admin')), created_at timestamptz not null default clock_timestamp()
);
create index fieldgrid_blog_policy_audit_scope on private.fieldgrid_blog_policy_audit(site_id,environment,destination_id,created_at desc);
create table private.fieldgrid_blog_installations (
 site_id text not null check(site_id='fieldgrid'), environment text not null check(environment in('development','staging','production')),
 attempt_id uuid references private.fieldgrid_blog_pairings(attempt_id), active_connection_id uuid references private.fieldgrid_blog_credentials(connection_id),
 last_checked_at timestamptz, primary key(site_id,environment)
);
do $$ declare n text;begin foreach n in array array['destinations','pairings','installations','policy_audit'] loop
 execute format('alter table private.fieldgrid_blog_%I enable row level security',n);
 execute format('alter table private.fieldgrid_blog_%I force row level security',n);
 execute format('revoke all on private.fieldgrid_blog_%I from public,anon,authenticated,service_role',n);
 end loop;end $$;

create or replace function private.fieldgrid_blog_read(operation text,payload jsonb) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare site text:=coalesce(payload->>'siteId','fieldgrid'); env text:=payload->>'environment'; dest uuid:=coalesce((payload->>'destinationId')::uuid,'00000000-0000-0000-0000-000000000000'); all_dest boolean:=coalesce((payload->>'_allDestinations')::boolean,false); p private.fieldgrid_blog_posts; a private.fieldgrid_blog_assets; receipt private.fieldgrid_blog_receipts; result jsonb;begin
 if site<>'fieldgrid' or coalesce(env,'') not in('development','staging','production') then raise exception 'INVALID_SCOPE' using errcode='22023';end if;
 -- Service-only receipt probe precedes state-dependent HTTP normalization.
 if operation='receipt' then
 if coalesce(payload->>'requestHash','') !~ '^[a-f0-9]{64}$' or length(coalesce(payload->>'idempotencyKey','')) not between 1 and 240 then raise exception 'INVALID_PAYLOAD' using errcode='22023';end if;
 select * into receipt from private.fieldgrid_blog_receipts where site_id=site and environment=env and destination_id=dest and fieldgrid_blog_receipts.operation=payload->>'operation' and key=payload->>'idempotencyKey';
 if not found then return null;end if;
 if receipt.request_hash<>payload->>'requestHash' then raise exception 'IDEMPOTENCY_CONFLICT' using errcode='23514';end if;
 return receipt.result;
 end if;
 if operation='taxonomy' then return jsonb_build_object('authors',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name) order by id),'[]'::jsonb) from private.fieldgrid_blog_authors where active),'categories',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name) order by id),'[]'::jsonb) from private.fieldgrid_blog_categories where active));end if;
 if operation in('list','public.list') then
 select coalesce(jsonb_agg(case when operation='public.list' then private.fieldgrid_blog_entry(x)||jsonb_build_object('draft',x.live,'revision',x.live_revision,'updatedAt',coalesce(x.modified_at,x.published_at)) else private.fieldgrid_blog_entry(x) end order by case when operation='public.list' then coalesce(x.modified_at,x.published_at) else x.updated_at end desc),'[]') into result from private.fieldgrid_blog_posts x where x.site_id=site and x.environment=env and (operation='public.list' or all_dest or x.destination_id=dest) and (operation='list' or(x.live is not null and not x.is_test));return result;
 end if;
 if operation='get' then select * into p from private.fieldgrid_blog_posts where site_id=site and environment=env and (all_dest or destination_id=dest) and ((payload ? 'id' and id=(payload->>'id')::uuid) or (payload ? 'externalId' and external_id=payload->>'externalId'));return case when p.id is null then null else private.fieldgrid_blog_entry(p) end;end if;
 if operation='resolve' then
 select x.* into p from private.fieldgrid_blog_slugs s join private.fieldgrid_blog_posts x on x.id=s.post_id where s.site_id=site and s.environment=env and s.slug=payload->>'slug' and s.was_live and x.live is not null and not x.is_test;
 if p.id is null then return null;end if;
 if p.live->>'slug'<>payload->>'slug' then return jsonb_build_object('redirect','/blog/'||(p.live->>'slug'));end if;
 return jsonb_build_object('entry',private.fieldgrid_blog_entry(p)||jsonb_build_object('draft',p.live,'revision',p.live_revision,'updatedAt',coalesce(p.modified_at,p.published_at)));
 end if;
 if operation in('media','public.media') then
 select * into a from private.fieldgrid_blog_assets where id=(payload->>'assetId')::uuid and site_id=site and environment=env and (all_dest or operation='public.media' or destination_id=dest);
 if a.id is null then return null;end if;
 if operation='public.media' and not exists(select 1 from private.fieldgrid_blog_posts where site_id=site and environment=env and live is not null and not is_test and a.id=any(private.fieldgrid_blog_media_ids(live))) then return null;end if;
 return jsonb_build_object('assetId',a.id,'storagePath',a.storage_path,'type',a.type,'width',a.width,'height',a.height,'bytes',a.bytes,'sha256',a.sha256);
 end if;
 if operation='credentials' then return coalesce((select jsonb_agg(jsonb_build_object('id',id,'label',label,'scopes',scopes,'expiresAt',expires_at,'revokedAt',revoked_at) order by created_at desc) from private.fieldgrid_blog_credentials where site_id=site and environment=env and connection_id is null),'[]');end if;
 raise exception 'INVALID_OPERATION' using errcode='22023';
end $$;

create or replace function private.fieldgrid_blog_write(operation text,payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare site text:=coalesce(payload->>'siteId','fieldgrid'); env text:=payload->>'environment'; dest uuid:=coalesce((payload->>'destinationId')::uuid,'00000000-0000-0000-0000-000000000000'); p private.fieldgrid_blog_posts; receipt private.fieldgrid_blog_receipts; fields jsonb; result jsonb; idem_key text:=payload->>'idempotencyKey'; op text:=operation; fingerprint text; xid text; aid uuid; owner_id uuid; credential uuid; hits integer; window_at timestamptz:=date_trunc('minute',clock_timestamp());begin
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
 else fingerprint:=encode(extensions.digest((payload-'idempotencyKey'-'tokenHash'-'credentialId'-'destinationId')::text,'sha256'),'hex');end if;
 perform pg_advisory_xact_lock(hashtextextended(site||':'||env||':'||dest::text||':'||operation||':'||idem_key,0));
 select * into receipt from private.fieldgrid_blog_receipts where site_id=site and environment=env and destination_id=dest and fieldgrid_blog_receipts.operation=op and fieldgrid_blog_receipts.key=idem_key;
 if found then if receipt.request_hash<>fingerprint then raise exception 'IDEMPOTENCY_CONFLICT' using errcode='23514';end if;return receipt.result;end if;
 if operation='draft' then
 xid:=payload->>'externalId';if xid is null or length(xid) not between 1 and 200 then raise exception 'INVALID_EXTERNAL_ID' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended(site||':'||env||':'||dest::text||':post:'||xid,0));
 select * into p from private.fieldgrid_blog_posts where site_id=site and environment=env and destination_id=dest and ((payload ? 'id' and id=(payload->>'id')::uuid) or (not(payload ? 'id') and external_id=xid)) for update;
 if p.id is not null and coalesce((payload->>'expectedRevision')::integer,0)<>p.revision then raise exception 'REVISION_CONFLICT' using errcode='40001';end if;
 if p.id is null and coalesce((payload->>'expectedRevision')::integer,0)<>0 then raise exception 'REVISION_CONFLICT' using errcode='40001';end if;
 fields:=private.fieldgrid_blog_validate(payload->'fields',site,env);
 if p.id is null then
 insert into private.fieldgrid_blog_posts(site_id,environment,destination_id,external_id,source,draft,is_test) values(site,env,dest,xid,coalesce(payload->>'source','socialhero'),fields,coalesce((payload->>'isTest')::boolean,false)) returning * into p;
 else
 update private.fieldgrid_blog_posts set draft=fields,revision=revision+1,updated_at=clock_timestamp() where id=p.id returning * into p;
 end if;
 insert into private.fieldgrid_blog_slugs(site_id,environment,slug,post_id) values(site,env,fields->>'slug',p.id) on conflict(site_id,environment,slug) do nothing;
 select post_id into owner_id from private.fieldgrid_blog_slugs where site_id=site and environment=env and slug=fields->>'slug';
 if owner_id<>p.id then raise exception 'SLUG_CONFLICT' using errcode='23505';end if;
 result:=private.fieldgrid_blog_entry(p);
 elsif operation='publish' then
 select * into p from private.fieldgrid_blog_posts where site_id=site and environment=env and destination_id=dest and ((payload ? 'id' and id=(payload->>'id')::uuid) or external_id=payload->>'externalId') for update;
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
 insert into private.fieldgrid_blog_assets(id,site_id,environment,destination_id,storage_path,type,width,height,bytes,sha256) values(aid,site,env,dest,payload->>'storagePath',payload->>'type',(payload->>'width')::integer,(payload->>'height')::integer,(payload->>'bytes')::integer,payload->>'sha256');
 result:=jsonb_build_object('assetId',aid,'width',(payload->>'width')::integer,'height',(payload->>'height')::integer,'type',payload->>'type','src','/blog-media/'||aid::text);
 elsif operation='credential.create' then
 insert into private.fieldgrid_blog_credentials(site_id,environment,label,token_hash,scopes,expires_at) values(site,env,payload->>'label',payload->>'tokenHash',array(select jsonb_array_elements_text(payload->'scopes')),(payload->>'expiresAt')::timestamptz) returning id into credential;
 result:=jsonb_build_object('id',credential);
 elsif operation='credential.revoke' then
 update private.fieldgrid_blog_credentials set revoked_at=clock_timestamp() where id=(payload->>'credentialId')::uuid and site_id=site and environment=env returning id into credential;
 if credential is null then raise exception 'NOT_FOUND' using errcode='P0002';end if; result:=jsonb_build_object('id',credential,'revoked',true);
 else raise exception 'INVALID_OPERATION' using errcode='22023';end if;
 insert into private.fieldgrid_blog_receipts(site_id,environment,destination_id,operation,key,request_hash,result) values(site,env,dest,operation,idem_key,fingerprint,result);
 return result;
end $$;

-- Legacy endpoints always use the legacy destination. Paired tokens cannot authenticate here.
create or replace function public.fieldgrid_blog_read(operation text,payload jsonb) returns jsonb language sql security definer set search_path='' as $$
 select private.fieldgrid_blog_read(operation,(payload-'_allDestinations')||jsonb_build_object('destinationId','00000000-0000-0000-0000-000000000000'))
$$;
create or replace function public.fieldgrid_blog_write(operation text,payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare credential private.fieldgrid_blog_credentials; required_scope text;begin
 if operation not in('rate','draft','publish','media') then raise exception 'PERMISSION_DENIED' using errcode='42501';end if;
 select * into credential from private.fieldgrid_blog_credentials where id=(payload->>'credentialId')::uuid and token_hash=payload->>'tokenHash' and site_id=payload->>'siteId' and environment=payload->>'environment' and connection_id is null and revoked_at is null and expires_at>clock_timestamp() for share;
 required_scope:=case operation when 'draft' then 'draft:write' when 'publish' then 'publish' when 'media' then 'media:write' else null end;
 if credential.id is null or(required_scope is not null and not required_scope=any(credential.scopes)) then raise exception 'PERMISSION_DENIED' using errcode='42501';end if;
 return private.fieldgrid_blog_write(operation,(payload-'_allDestinations')||jsonb_build_object('destinationId','00000000-0000-0000-0000-000000000000'));
end $$;
create or replace function public.fieldgrid_blog_authenticate(token_hash text) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',id,'siteId',site_id,'environment',environment,'scopes',scopes,'expiresAt',expires_at) from private.fieldgrid_blog_credentials where fieldgrid_blog_credentials.token_hash=$1 and connection_id is null and revoked_at is null and expires_at>now()
$$;
create or replace function public.fieldgrid_blog_public_read(operation text,payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
begin if operation not in('public.list','resolve','public.media','taxonomy') then raise exception 'PERMISSION_DENIED' using errcode='42501';end if;return private.fieldgrid_blog_read(operation,payload-'_allDestinations'-'destinationId');end $$;
create or replace function public.fieldgrid_blog_admin_read(operation text,payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
begin if not private.fieldgrid_blog_editor() or operation='receipt' then raise exception 'PERMISSION_DENIED' using errcode='42501';end if;return private.fieldgrid_blog_read(operation,payload||jsonb_build_object('_allDestinations',true));end $$;
create or replace function public.fieldgrid_blog_admin_write(operation text,payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare dest uuid:='00000000-0000-0000-0000-000000000000';begin
 if not private.fieldgrid_blog_editor() or payload ? 'requestHash' or operation not in('draft','publish','media','credential.create','credential.revoke') then raise exception 'PERMISSION_DENIED' using errcode='42501';end if;
 if operation in('draft','publish','media') and payload ? 'id' then
 select destination_id into dest from private.fieldgrid_blog_posts where id=(payload->>'id')::uuid and site_id=payload->>'siteId' and environment=payload->>'environment';
 if not found then raise exception 'NOT_FOUND' using errcode='P0002';end if;
 end if;
 if operation='credential.revoke' and exists(select 1 from private.fieldgrid_blog_credentials where id=(payload->>'credentialId')::uuid and connection_id is not null) then raise exception 'PERMISSION_DENIED' using errcode='42501';end if;
 return private.fieldgrid_blog_write(operation,payload||jsonb_build_object('destinationId',dest));
end $$;

create function private.fieldgrid_blog_connector_scope(payload jsonb) returns void language plpgsql immutable set search_path='' as $$
begin
 if jsonb_typeof(payload) is distinct from 'object' or length(payload::text)>600000 or payload->>'siteId' is distinct from 'fieldgrid' or coalesce(payload->>'environment','') not in('development','staging','production') then raise exception 'INVALID_SCOPE' using errcode='22023';end if;
end $$;
create function private.fieldgrid_blog_connector_purge(site text,env text) returns void language plpgsql security definer set search_path='' as $$
begin
 update private.fieldgrid_blog_credentials c set revoked_at=coalesce(c.revoked_at,clock_timestamp()) where c.site_id=site and c.environment=env and c.connection_id is not null and c.state='pending' and c.revoked_at is null and c.expires_at<=clock_timestamp();
 update private.fieldgrid_blog_pairings set state='expired',encrypted_code=null,encrypted_token=null,updated_at=clock_timestamp() where site_id=site and environment=env and state in('claiming','pending') and expires_at<=clock_timestamp();
 update private.fieldgrid_blog_pairings set encrypted_code=null,encrypted_token=null where site_id=site and environment=env and state not in('claiming','pending') and (encrypted_code is not null or encrypted_token is not null);
end $$;
create function private.fieldgrid_blog_connector_status(site text,env text) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('state',coalesce(p.state,'unpaired'),'attemptId',p.attempt_id,'connectionId',p.connection_id,'destinationId',p.destination_id,'allowDraft',coalesce(d.allow_draft,p.allow_draft,true),'allowPublish',coalesce(d.allow_publish,p.allow_publish,true),'policyConfigured',d.id is not null,'policyUpdatedAt',d.policy_updated_at,'policyUpdatedBy',d.policy_updated_by,'expiresAt',case when p.state in('claiming','pending') then p.expires_at else null end,'origin',p.origin,'updatedAt',p.updated_at,'lastCheckedAt',i.last_checked_at,'activeConnectionId',i.active_connection_id)
 from (select site as site_id,env as environment) s left join private.fieldgrid_blog_installations i using(site_id,environment)
 left join private.fieldgrid_blog_pairings p on p.attempt_id=i.attempt_id
 left join private.fieldgrid_blog_destinations d on d.site_id=s.site_id and d.environment=s.environment and d.id=coalesce(p.destination_id,(select p1.destination_id from private.fieldgrid_blog_pairings p1 where p1.site_id=s.site_id and p1.environment=s.environment and p1.destination_id is not null order by p1.created_at desc limit 1))
$$;
create function public.fieldgrid_blog_connector_admin_read(operation text,payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if not private.fieldgrid_blog_editor() then raise exception 'PERMISSION_DENIED' using errcode='42501';end if;
 perform private.fieldgrid_blog_connector_scope(payload);
 if operation<>'status' then raise exception 'INVALID_OPERATION' using errcode='22023';end if;
 perform private.fieldgrid_blog_connector_purge(payload->>'siteId',payload->>'environment');
 return private.fieldgrid_blog_connector_status(payload->>'siteId',payload->>'environment');
end $$;
create function public.fieldgrid_blog_connector_admin_write(operation text,payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare site text:=payload->>'siteId';env text:=payload->>'environment'; attempt uuid; connection uuid; dest uuid; p private.fieldgrid_blog_pairings; i private.fieldgrid_blog_installations; expires timestamptz; draft_allowed boolean; publish_allowed boolean;begin
 if not private.fieldgrid_blog_editor() then raise exception 'PERMISSION_DENIED' using errcode='42501';end if;
 perform private.fieldgrid_blog_connector_scope(payload);
 perform pg_advisory_xact_lock(hashtextextended(site||':'||env||':connector-pair',0));
 perform private.fieldgrid_blog_connector_purge(site,env);
 insert into private.fieldgrid_blog_installations(site_id,environment) values(site,env) on conflict do nothing;
 select * into i from private.fieldgrid_blog_installations where site_id=site and environment=env for update;
 if operation='pair.begin' then
 attempt:=(payload->>'attemptId')::uuid;
 if jsonb_typeof(payload->'allowDraft') is distinct from 'boolean' or jsonb_typeof(payload->'allowPublish') is distinct from 'boolean' then raise exception 'INVALID_PAYLOAD' using errcode='22023';end if;
 if attempt is null or coalesce(payload->>'codeHash','') !~ '^[a-f0-9]{64}$' or length(coalesce(payload->>'encryptedCode','')) not between 20 and 12000 then raise exception 'INVALID_PAYLOAD' using errcode='22023';end if;
 select * into p from private.fieldgrid_blog_pairings where attempt_id=attempt for update;
 if found then
 if p.site_id<>site or p.environment<>env or p.code_hash<>payload->>'codeHash' or p.origin is distinct from payload->>'origin' then raise exception 'IDEMPOTENCY_CONFLICT' using errcode='23514';end if;
 if i.attempt_id is distinct from attempt or p.state not in('claiming','pending','active') then raise exception 'PAIRING_CANCELLED' using errcode='23514';end if;
 return private.fieldgrid_blog_connector_status(site,env);
 end if;
 select * into p from private.fieldgrid_blog_pairings where attempt_id=i.attempt_id;
 if found and p.code_hash=payload->>'codeHash' and p.origin=payload->>'origin' and p.state in('claiming','pending','active') and p.expires_at>clock_timestamp() then return private.fieldgrid_blog_connector_status(site,env);end if;
 update private.fieldgrid_blog_credentials set revoked_at=coalesce(revoked_at,clock_timestamp()) where connection_id in(select connection_id from private.fieldgrid_blog_pairings where attempt_id=i.attempt_id and state='pending');
 update private.fieldgrid_blog_pairings set state='superseded',encrypted_code=null,encrypted_token=null,updated_at=clock_timestamp() where attempt_id=i.attempt_id and state in('claiming','pending');
 insert into private.fieldgrid_blog_pairings(attempt_id,site_id,environment,code_hash,encrypted_code,origin,state,expires_at,created_by,allow_draft,allow_publish) values(attempt,site,env,payload->>'codeHash',payload->>'encryptedCode',payload->>'origin','claiming',clock_timestamp()+interval '10 minutes',auth.uid(),(payload->>'allowDraft')::boolean,(payload->>'allowPublish')::boolean);
 update private.fieldgrid_blog_installations set attempt_id=attempt where site_id=site and environment=env;
 elsif operation='pair.store' then
 attempt:=(payload->>'attemptId')::uuid; connection:=(payload->>'connectionId')::uuid;dest:=(payload->>'destinationId')::uuid;expires:=(payload->>'expiresAt')::timestamptz;
 select * into p from private.fieldgrid_blog_pairings where attempt_id=attempt and site_id=site and environment=env for update;
 if not found or i.attempt_id is distinct from attempt or p.state not in('claiming','pending','active') then raise exception 'PAIRING_CANCELLED' using errcode='23514';end if;
 if p.state in('pending','active') then
 if p.connection_id is distinct from connection or p.destination_id is distinct from dest or p.token_hash is distinct from payload->>'tokenHash' or p.expires_at is distinct from expires or p.origin is distinct from payload->>'origin' then raise exception 'IDEMPOTENCY_CONFLICT' using errcode='23514';end if;
 return private.fieldgrid_blog_connector_status(site,env);
 end if;
 if connection is null or dest is null or dest='00000000-0000-0000-0000-000000000000' or coalesce(payload->>'tokenHash','') !~ '^[a-f0-9]{64}$' or length(coalesce(payload->>'encryptedToken','')) not between 20 and 12000 or p.origin is distinct from payload->>'origin' or expires is null or expires<=clock_timestamp() or expires>clock_timestamp()+interval '11 minutes' then raise exception 'INVALID_PAYLOAD' using errcode='22023';end if;

 insert into private.fieldgrid_blog_destinations(site_id,environment,id,allow_draft,allow_publish,policy_updated_by,policy_updated_at) values(site,env,dest,p.allow_draft,p.allow_publish,p.created_by,clock_timestamp())
 on conflict(site_id,environment,id) do update set allow_draft=private.fieldgrid_blog_destinations.allow_draft and excluded.allow_draft,allow_publish=private.fieldgrid_blog_destinations.allow_publish and excluded.allow_publish,
 policy_updated_by=case when (private.fieldgrid_blog_destinations.allow_draft and not excluded.allow_draft) or (private.fieldgrid_blog_destinations.allow_publish and not excluded.allow_publish) then excluded.policy_updated_by else private.fieldgrid_blog_destinations.policy_updated_by end,
 policy_updated_at=case when (private.fieldgrid_blog_destinations.allow_draft and not excluded.allow_draft) or (private.fieldgrid_blog_destinations.allow_publish and not excluded.allow_publish) then excluded.policy_updated_at else private.fieldgrid_blog_destinations.policy_updated_at end
 returning allow_draft,allow_publish into draft_allowed,publish_allowed;
 insert into private.fieldgrid_blog_policy_audit(site_id,environment,destination_id,connection_id,attempt_id,actor_user_id,requested_allow_draft,requested_allow_publish,allow_draft,allow_publish,reason) values(site,env,dest,connection,attempt,p.created_by,p.allow_draft,p.allow_publish,draft_allowed,publish_allowed,'pairing');
 insert into private.fieldgrid_blog_credentials(site_id,environment,label,token_hash,scopes,expires_at,destination_id,connection_id,state) values(site,env,'SocialHero pairing',payload->>'tokenHash',array['read','draft'],expires,dest,connection,'pending');
 update private.fieldgrid_blog_pairings set connection_id=connection,destination_id=dest,token_hash=payload->>'tokenHash',encrypted_token=payload->>'encryptedToken',state='pending',expires_at=expires,updated_at=clock_timestamp() where attempt_id=attempt;
 elsif operation='pair.activate' then
 attempt:=(payload->>'attemptId')::uuid;connection:=(payload->>'connectionId')::uuid;
 select * into p from private.fieldgrid_blog_pairings where attempt_id=attempt and site_id=site and environment=env for update;
 if not found or i.attempt_id is distinct from attempt or p.connection_id is distinct from connection or p.state not in('pending','active') then raise exception 'PAIRING_CANCELLED' using errcode='23514';end if;
 if p.state='active' then return private.fieldgrid_blog_connector_status(site,env);end if;
 if p.expires_at<=clock_timestamp() then raise exception 'PAIRING_EXPIRED' using errcode='23514';end if;
 update private.fieldgrid_blog_credentials set state='active',expires_at='infinity' where connection_id=connection and revoked_at is null and state='pending';
 if not found then raise exception 'PAIRING_CANCELLED' using errcode='23514';end if;
 update private.fieldgrid_blog_credentials set revoked_at=coalesce(revoked_at,clock_timestamp()) where connection_id=i.active_connection_id and connection_id<>connection;
 update private.fieldgrid_blog_pairings set state='active',encrypted_code=null,encrypted_token=null,updated_at=clock_timestamp() where attempt_id=attempt;
 update private.fieldgrid_blog_installations set active_connection_id=connection,last_checked_at=clock_timestamp() where site_id=site and environment=env;
 elsif operation='pair.reject' then
 attempt:=(payload->>'attemptId')::uuid;
 select * into p from private.fieldgrid_blog_pairings where attempt_id=attempt and site_id=site and environment=env for update;
 if not found or i.attempt_id is distinct from attempt or (payload ? 'connectionId' and p.connection_id is distinct from (payload->>'connectionId')::uuid) then raise exception 'PAIRING_CANCELLED' using errcode='23514';end if;
 if p.state='active' then raise exception 'PAIRING_CANCELLED' using errcode='23514';end if;
 update private.fieldgrid_blog_credentials set revoked_at=coalesce(revoked_at,clock_timestamp()) where connection_id=p.connection_id;
 update private.fieldgrid_blog_pairings set state='rejected',encrypted_code=null,encrypted_token=null,updated_at=clock_timestamp() where attempt_id=attempt;
 elsif operation='pair.disconnect' then
 connection:=coalesce((payload->>'connectionId')::uuid,i.active_connection_id);
 if connection is not null and connection is distinct from i.active_connection_id and not exists(select 1 from private.fieldgrid_blog_pairings where attempt_id=i.attempt_id and connection_id=connection) then raise exception 'NOT_FOUND' using errcode='P0002';end if;
 update private.fieldgrid_blog_credentials set revoked_at=coalesce(revoked_at,clock_timestamp()) where site_id=site and environment=env and (connection_id=connection or connection_id in(select connection_id from private.fieldgrid_blog_pairings where attempt_id=i.attempt_id and state in('claiming','pending')));
 update private.fieldgrid_blog_pairings set state='disconnected',encrypted_code=null,encrypted_token=null,updated_at=clock_timestamp() where site_id=site and environment=env and (connection_id=connection or attempt_id=i.attempt_id);
 update private.fieldgrid_blog_installations set active_connection_id=case when active_connection_id=connection then null else active_connection_id end where site_id=site and environment=env;
 elsif operation in('policy','check') then
 connection:=(payload->>'connectionId')::uuid;
 if connection is null then connection:=i.active_connection_id;end if;
 if connection is null or connection is distinct from i.active_connection_id or not exists(select 1 from private.fieldgrid_blog_credentials where connection_id=connection and state='active' and revoked_at is null) then raise exception 'INVALID_CREDENTIAL' using errcode='42501';end if;
 if operation='policy' then
 if jsonb_typeof(payload->'allowPublish') is distinct from 'boolean' or (payload ? 'allowDraft' and jsonb_typeof(payload->'allowDraft') is distinct from 'boolean') then raise exception 'INVALID_PAYLOAD' using errcode='22023';end if;
 update private.fieldgrid_blog_destinations d set allow_publish=(payload->>'allowPublish')::boolean,allow_draft=coalesce((payload->>'allowDraft')::boolean,d.allow_draft),policy_updated_by=auth.uid(),policy_updated_at=clock_timestamp() from private.fieldgrid_blog_credentials c where c.connection_id=connection and d.site_id=c.site_id and d.environment=c.environment and d.id=c.destination_id returning d.id,d.allow_draft,d.allow_publish into dest,draft_allowed,publish_allowed;
 insert into private.fieldgrid_blog_policy_audit(site_id,environment,destination_id,connection_id,attempt_id,actor_user_id,requested_allow_draft,requested_allow_publish,allow_draft,allow_publish,reason) values(site,env,dest,connection,i.attempt_id,auth.uid(),draft_allowed,publish_allowed,draft_allowed,publish_allowed,'admin');
 end if;
 update private.fieldgrid_blog_installations set last_checked_at=clock_timestamp() where site_id=site and environment=env;
 else raise exception 'INVALID_OPERATION' using errcode='22023';end if;
 return private.fieldgrid_blog_connector_status(site,env);
end $$;

-- Never granted to authenticated: ciphertext is consumed exclusively by the website server.
create function public.fieldgrid_blog_connector_server_read(operation text,payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare p private.fieldgrid_blog_pairings;begin
 perform private.fieldgrid_blog_connector_scope(payload);
 perform private.fieldgrid_blog_connector_purge(payload->>'siteId',payload->>'environment');
 if operation='purge' then return jsonb_build_object('purged',true);end if;
 if operation<>'pair.secret' then raise exception 'INVALID_OPERATION' using errcode='22023';end if;
 select p0.* into p from private.fieldgrid_blog_pairings p0 join private.fieldgrid_blog_installations i on i.attempt_id=p0.attempt_id where p0.attempt_id=(payload->>'attemptId')::uuid and p0.site_id=payload->>'siteId' and p0.environment=payload->>'environment' and (p0.state='active' or (p0.state in('claiming','pending') and p0.expires_at>clock_timestamp()));
 if not found then return null;end if;
 return jsonb_build_object('attemptId',p.attempt_id,'connectionId',p.connection_id,'destinationId',p.destination_id,'encryptedCode',case when p.state='active' then null else p.encrypted_code end,'encryptedToken',case when p.state='active' then null else p.encrypted_token end,'expiresAt',p.expires_at,'state',p.state,'origin',p.origin);
end $$;
create function private.fieldgrid_blog_connector_credential(payload jsonb,pending boolean default false) returns private.fieldgrid_blog_credentials language plpgsql security definer set search_path='' as $$
declare c private.fieldgrid_blog_credentials;begin
 select * into c from private.fieldgrid_blog_credentials where id=(payload->>'credentialId')::uuid and token_hash=payload->>'tokenHash' and connection_id is not null and revoked_at is null and expires_at>clock_timestamp() for share;
 if c.id is null then raise exception 'INVALID_CREDENTIAL' using errcode='42501';end if;
 if c.state='pending' and not pending then raise exception 'PAIRING_IN_PROGRESS' using errcode='55000';end if;
 return c;
end $$;
create function private.fieldgrid_blog_connector_credential_json(c private.fieldgrid_blog_credentials) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',c.id,'siteId',c.site_id,'environment',c.environment,'connectionId',c.connection_id,'destinationId',c.destination_id,'state',c.state,'expiresAt',case when c.state='pending' then c.expires_at else null end,'origin',p.origin,'scopes',array['read'] || case when c.state='active' and d.allow_draft then array['draft'] else '{}'::text[] end || case when c.state='active' and d.allow_publish then array['publish'] else '{}'::text[] end)
 from private.fieldgrid_blog_pairings p join private.fieldgrid_blog_destinations d on d.site_id=c.site_id and d.environment=c.environment and d.id=c.destination_id where p.connection_id=c.connection_id
$$;
create function public.fieldgrid_blog_connector_authenticate(token_hash text) returns jsonb language plpgsql security definer set search_path='' as $$
declare c private.fieldgrid_blog_credentials;begin
 select * into c from private.fieldgrid_blog_credentials where fieldgrid_blog_credentials.token_hash=$1 and connection_id is not null;
 if not found then return null;end if;
 perform private.fieldgrid_blog_connector_purge(c.site_id,c.environment);
 if c.revoked_at is not null or c.expires_at<=clock_timestamp() then return null;end if;
 return private.fieldgrid_blog_connector_credential_json(c);
end $$;
create function public.fieldgrid_blog_connector_read(operation text,payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare c private.fieldgrid_blog_credentials; safe jsonb;begin
 c:=private.fieldgrid_blog_connector_credential(payload,operation='capabilities');
 perform private.fieldgrid_blog_connector_purge(c.site_id,c.environment);
 if operation='capabilities' then return jsonb_build_object('credential',private.fieldgrid_blog_connector_credential_json(c))||private.fieldgrid_blog_read('taxonomy',jsonb_build_object('siteId',c.site_id,'environment',c.environment));end if;
 if operation not in('get','media','receipt') then raise exception 'INVALID_OPERATION' using errcode='22023';end if;
 safe:=(payload-'_allDestinations')||jsonb_build_object('siteId',c.site_id,'environment',c.environment,'destinationId',c.destination_id);
 return private.fieldgrid_blog_read(operation,safe);
end $$;
create function public.fieldgrid_blog_connector_write(operation text,payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare c private.fieldgrid_blog_credentials; safe jsonb;fields jsonb; media uuid; allowed boolean; replay jsonb;begin
 if operation='revoke' then
 select * into c from private.fieldgrid_blog_credentials where id=(payload->>'credentialId')::uuid and connection_id is not null;
 if c.id is null then raise exception 'INVALID_CREDENTIAL' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended(c.site_id||':'||c.environment||':connector-pair',0));
 end if;
 c:=private.fieldgrid_blog_connector_credential(payload,operation='rate');
 perform private.fieldgrid_blog_connector_purge(c.site_id,c.environment);
 if operation='revoke' then
 -- Shared lock is upgraded inside this transaction; other writers finish before revocation returns.
 update private.fieldgrid_blog_credentials set revoked_at=coalesce(revoked_at,clock_timestamp()) where id=c.id;
 update private.fieldgrid_blog_pairings set state='disconnected',encrypted_code=null,encrypted_token=null,updated_at=clock_timestamp() where connection_id=c.connection_id;
 update private.fieldgrid_blog_installations set active_connection_id=null where active_connection_id=c.connection_id;
 return jsonb_build_object('revoked',true);
 end if;
 if operation not in('rate','draft','publish','media') then raise exception 'INVALID_OPERATION' using errcode='22023';end if;
 if operation in('draft','media') then
 select allow_draft into allowed from private.fieldgrid_blog_destinations where site_id=c.site_id and environment=c.environment and id=c.destination_id for share;
 if not coalesce(allowed,false) then raise exception 'DRAFT_NOT_ALLOWED' using errcode='42501';end if;
 end if;
 safe:=(payload-'_allDestinations')||jsonb_build_object('siteId',c.site_id,'environment',c.environment,'destinationId',c.destination_id,'source','socialhero');
 if operation='publish' then
 select allow_publish into allowed from private.fieldgrid_blog_destinations where site_id=c.site_id and environment=c.environment and id=c.destination_id for share;
 if not coalesce(allowed,false) then raise exception 'PUBLISH_NOT_ALLOWED' using errcode='42501';end if;
 select draft into fields from private.fieldgrid_blog_posts where site_id=c.site_id and environment=c.environment and destination_id=c.destination_id and ((safe ? 'id' and id=(safe->>'id')::uuid) or external_id=safe->>'externalId');
 elsif operation='draft' then fields:=safe->'fields';end if;
 if operation in('draft','publish','media') and safe ? 'requestHash' then
 replay:=private.fieldgrid_blog_read('receipt',safe||jsonb_build_object('operation',operation));
 if replay is not null then return replay;end if;
 end if;
 if fields is not null then foreach media in array private.fieldgrid_blog_media_ids(fields) loop
 if not exists(select 1 from private.fieldgrid_blog_assets where id=media and site_id=c.site_id and environment=c.environment and destination_id=c.destination_id) then raise exception 'INVALID_MEDIA' using errcode='22023';end if;
 end loop;end if;
 return private.fieldgrid_blog_write(operation,safe);
end $$;

revoke all on function private.fieldgrid_blog_connector_scope(jsonb),private.fieldgrid_blog_connector_purge(text,text),private.fieldgrid_blog_connector_status(text,text),private.fieldgrid_blog_connector_credential(jsonb,boolean),private.fieldgrid_blog_connector_credential_json(private.fieldgrid_blog_credentials) from public,anon,authenticated,service_role;
revoke all on function public.fieldgrid_blog_connector_admin_read(text,jsonb),public.fieldgrid_blog_connector_admin_write(text,jsonb),public.fieldgrid_blog_connector_server_read(text,jsonb),public.fieldgrid_blog_connector_authenticate(text),public.fieldgrid_blog_connector_read(text,jsonb),public.fieldgrid_blog_connector_write(text,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.fieldgrid_blog_connector_admin_read(text,jsonb),public.fieldgrid_blog_connector_admin_write(text,jsonb) to authenticated;
grant execute on function public.fieldgrid_blog_connector_server_read(text,jsonb),public.fieldgrid_blog_connector_authenticate(text),public.fieldgrid_blog_connector_read(text,jsonb),public.fieldgrid_blog_connector_write(text,jsonb) to service_role;
