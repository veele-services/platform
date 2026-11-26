-- Immutable editorial evidence is independent of the mutable draft/live aggregate.
-- Actor identifiers intentionally have no cascading user/credential/post FK: audit survives removal.
create table private.fieldgrid_blog_revisions (
 post_id uuid not null, revision integer not null check(revision>0), site_id text not null check(site_id='fieldgrid'),
 environment text not null check(environment in('development','staging','production')), destination_id uuid not null,
 snapshot jsonb not null, source text not null check(source in('manual','socialhero')), actor_user_id uuid, actor_credential_id uuid, actor_name text,
 created_at timestamptz not null default clock_timestamp(), backfilled boolean not null default false, primary key(post_id,revision)
);
create index fieldgrid_blog_revisions_scope on private.fieldgrid_blog_revisions(site_id,environment,post_id,revision desc);
create table private.fieldgrid_blog_publish_events (
 id uuid primary key default gen_random_uuid(), post_id uuid not null, revision integer not null check(revision>0), site_id text not null check(site_id='fieldgrid'),
 environment text not null check(environment in('development','staging','production')), destination_id uuid not null,
 source text not null check(source in('manual','socialhero')), actor_user_id uuid, actor_credential_id uuid, actor_name text,
 published_at timestamptz not null default clock_timestamp(), backfilled boolean not null default false,
 foreign key(post_id,revision) references private.fieldgrid_blog_revisions(post_id,revision)
);
create index fieldgrid_blog_publish_events_scope on private.fieldgrid_blog_publish_events(site_id,environment,post_id,published_at desc);
create table private.fieldgrid_blog_publication_checks (
 post_id uuid not null, revision integer not null check(revision>0), verified_at timestamptz not null default clock_timestamp(), primary key(post_id,revision),
 foreign key(post_id,revision) references private.fieldgrid_blog_revisions(post_id,revision)
);
-- Earlier overwritten drafts cannot be reconstructed. Preserve the snapshots actually present at upgrade.
insert into private.fieldgrid_blog_revisions(post_id,revision,site_id,environment,destination_id,snapshot,source,created_at,backfilled)
 select id,revision,site_id,environment,destination_id,draft,source,updated_at,true from private.fieldgrid_blog_posts;
insert into private.fieldgrid_blog_revisions(post_id,revision,site_id,environment,destination_id,snapshot,source,created_at,backfilled)
 select id,live_revision,site_id,environment,destination_id,live,source,coalesce(modified_at,published_at),true from private.fieldgrid_blog_posts where live is not null and live_revision<>revision;
insert into private.fieldgrid_blog_publish_events(post_id,revision,site_id,environment,destination_id,source,published_at,backfilled)
 select id,live_revision,site_id,environment,destination_id,source,coalesce(modified_at,published_at),true from private.fieldgrid_blog_posts where live is not null;
do $$ declare n text;begin foreach n in array array['revisions','publish_events','publication_checks'] loop
 execute format('alter table private.fieldgrid_blog_%I enable row level security',n);
 execute format('alter table private.fieldgrid_blog_%I force row level security',n);
 execute format('revoke all on private.fieldgrid_blog_%I from public,anon,authenticated,service_role',n);
 end loop;end $$;
create function private.fieldgrid_blog_history_immutable() returns trigger language plpgsql set search_path='' as $$
begin raise exception 'IMMUTABLE_BLOG_HISTORY' using errcode='23514';end $$;
create trigger fieldgrid_blog_revisions_immutable before update or delete on private.fieldgrid_blog_revisions for each row execute function private.fieldgrid_blog_history_immutable();
create trigger fieldgrid_blog_publish_events_immutable before update or delete on private.fieldgrid_blog_publish_events for each row execute function private.fieldgrid_blog_history_immutable();
create trigger fieldgrid_blog_publication_checks_immutable before update or delete on private.fieldgrid_blog_publication_checks for each row execute function private.fieldgrid_blog_history_immutable();
create trigger fieldgrid_blog_policy_audit_immutable before update or delete on private.fieldgrid_blog_policy_audit for each row execute function private.fieldgrid_blog_history_immutable();
create function private.fieldgrid_blog_history_capture() returns trigger language plpgsql security definer set search_path='' as $$
declare actor uuid; credential uuid; label text;action_source text;begin
 actor:=case when current_setting('fieldgrid.blog_actor_user_id',true) is null then auth.uid() else nullif(current_setting('fieldgrid.blog_actor_user_id',true),'')::uuid end;
 credential:=nullif(current_setting('fieldgrid.blog_credential_id',true),'')::uuid;
 if actor is not null then select coalesce(nullif(raw_user_meta_data->>'full_name',''),email) into label from auth.users where id=actor;
 elsif credential is not null then select 'SocialHero: '||c.label into label from private.fieldgrid_blog_credentials c where c.id=credential;end if;
 action_source:=case when actor is not null then 'manual' when credential is not null then 'socialhero' else new.source end;
 if tg_op='INSERT' or new.revision<>old.revision then
 insert into private.fieldgrid_blog_revisions(post_id,revision,site_id,environment,destination_id,snapshot,source,actor_user_id,actor_credential_id,actor_name)
 values(new.id,new.revision,new.site_id,new.environment,new.destination_id,new.draft,action_source,actor,credential,label);
 end if;
 if new.live_revision is not null and (tg_op='INSERT' or new.live_revision is distinct from old.live_revision) then
 insert into private.fieldgrid_blog_publish_events(post_id,revision,site_id,environment,destination_id,source,actor_user_id,actor_credential_id,actor_name)
 values(new.id,new.live_revision,new.site_id,new.environment,new.destination_id,action_source,actor,credential,label);
 end if;return new;
end $$;
create trigger fieldgrid_blog_history_capture after insert or update on private.fieldgrid_blog_posts for each row execute function private.fieldgrid_blog_history_capture();
create function private.fieldgrid_blog_publication_projection(entry jsonb) returns jsonb language sql stable security definer set search_path='' as $$
 select case when entry is null or not(entry ? 'id' and entry ? 'revision') then entry else entry||jsonb_build_object('publicationVerified',exists(select 1 from private.fieldgrid_blog_publication_checks c where c.post_id=(entry->>'id')::uuid and c.revision=(entry->>'publishedRevision')::integer)) end
$$;
create or replace function private.fieldgrid_blog_entry(p private.fieldgrid_blog_posts) returns jsonb language sql stable set search_path='' as $$
 select private.fieldgrid_blog_publication_projection(jsonb_build_object('id',p.id,'externalId',p.external_id,'source',p.source,'draft',p.draft,'revision',p.revision,'published',p.live,'publishedRevision',p.live_revision,'publishedAt',p.published_at,'publishedUpdatedAt',p.modified_at,'updatedAt',p.updated_at,'createdAt',p.created_at,'isTest',p.is_test))
$$;
create function private.fieldgrid_blog_taxonomy_manage() returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('authors',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name,'active',active) order by name,id),'[]') from private.fieldgrid_blog_authors),
 'categories',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name,'active',active) order by name,id),'[]') from private.fieldgrid_blog_categories))
$$;
create function private.fieldgrid_blog_taxonomy_write(operation text,payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare site text:=payload->>'siteId';env text:=payload->>'environment'; idem_key text:=payload->>'idempotencyKey';requested_operation text:=operation; fingerprint text; receipt private.fieldgrid_blog_receipts; result jsonb; target text;begin
 perform private.fieldgrid_blog_connector_scope(payload);
 if operation not in('taxonomy.author','taxonomy.category') or payload ? 'requestHash' or coalesce(payload->>'id','') !~ '^[a-z0-9]+(-[a-z0-9]+)*$' or length(payload->>'id')>100 or length(btrim(coalesce(payload->>'name',''))) not between 1 and 160 or jsonb_typeof(payload->'active') is distinct from 'boolean' or length(coalesce(idem_key,'')) not between 1 and 240 then raise exception 'INVALID_PAYLOAD' using errcode='22023';end if;
 fingerprint:=encode(extensions.digest((payload-'idempotencyKey')::text,'sha256'),'hex');
 perform pg_advisory_xact_lock(hashtextextended(site||':'||env||':taxonomy:'||operation||':'||idem_key,0));
 select * into receipt from private.fieldgrid_blog_receipts r where r.site_id=site and r.environment=env and r.destination_id='00000000-0000-0000-0000-000000000000' and r.operation=requested_operation and r.key=idem_key;
 if found then if receipt.request_hash<>fingerprint then raise exception 'IDEMPOTENCY_CONFLICT' using errcode='23514';end if;return receipt.result;end if;
 target:=case operation when 'taxonomy.author' then 'fieldgrid_blog_authors' else 'fieldgrid_blog_categories' end;
 perform pg_advisory_xact_lock(hashtextextended('fieldgrid:taxonomy:'||target||':'||(payload->>'id'),0));
 if coalesce((payload->>'create')::boolean,false) then
 if (operation='taxonomy.author' and exists(select 1 from private.fieldgrid_blog_authors where id=payload->>'id')) or (operation='taxonomy.category' and exists(select 1 from private.fieldgrid_blog_categories where id=payload->>'id')) then raise exception 'IDEMPOTENCY_CONFLICT' using errcode='23505';end if;
 end if;
 execute format('insert into private.%I(id,name,active) values($1,$2,$3) on conflict(id) do update set name=excluded.name,active=excluded.active',target) using payload->>'id',btrim(payload->>'name'),(payload->>'active')::boolean;
 result:=private.fieldgrid_blog_taxonomy_manage();
 insert into private.fieldgrid_blog_receipts(site_id,environment,operation,key,request_hash,result) values(site,env,operation,idem_key,fingerprint,result);
 return result;
end $$;
create or replace function public.fieldgrid_blog_admin_read(operation text,payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;begin
 if not private.fieldgrid_blog_editor() or operation='receipt' then raise exception 'PERMISSION_DENIED' using errcode='42501';end if;
 perform private.fieldgrid_blog_connector_scope(payload);
 if operation='taxonomy.manage' then return private.fieldgrid_blog_taxonomy_manage();end if;
 if operation='history' then
 if not exists(select 1 from private.fieldgrid_blog_posts where id=(payload->>'id')::uuid and site_id=payload->>'siteId' and environment=payload->>'environment') then raise exception 'NOT_FOUND' using errcode='P0002';end if;
 select jsonb_build_object('revisions',(select coalesce(jsonb_agg(jsonb_build_object('revision',r.revision,'title',r.snapshot->>'title','createdAt',r.created_at,'actorUserId',r.actor_user_id,'actorCredentialId',r.actor_credential_id,'actorName',r.actor_name,'source',r.source,'backfilled',r.backfilled) order by r.revision desc),'[]') from private.fieldgrid_blog_revisions r where r.post_id=(payload->>'id')::uuid),
 'publishEvents',(select coalesce(jsonb_agg(jsonb_build_object('revision',e.revision,'publishedAt',e.published_at,'actorUserId',e.actor_user_id,'actorCredentialId',e.actor_credential_id,'actorName',e.actor_name,'source',e.source,'backfilled',e.backfilled,'confirmedAt',c.verified_at) order by e.published_at desc,e.id),'[]') from private.fieldgrid_blog_publish_events e left join private.fieldgrid_blog_publication_checks c on c.post_id=e.post_id and c.revision=e.revision where e.post_id=(payload->>'id')::uuid)) into result;
 return result;
 end if;
 return private.fieldgrid_blog_read(operation,payload||jsonb_build_object('_allDestinations',true));
end $$;
-- Extend the established aggregate functions without changing their validation or receipt hashes.
-- Context values are local to the RPC transaction; callers cannot submit an audit actor.
do $$ declare definition text;begin
 select pg_get_functiondef('public.fieldgrid_blog_admin_write(text,jsonb)'::regprocedure) into definition;
 definition:=replace(definition,$patch$if operation in('draft','publish','media') and payload ? 'id' then$patch$, $patch$if operation in('taxonomy.author','taxonomy.category') then return private.fieldgrid_blog_taxonomy_write(operation,payload);end if; perform set_config('fieldgrid.blog_actor_user_id',auth.uid()::text,true);perform set_config('fieldgrid.blog_credential_id','',true); if operation in('draft','publish','media') and payload ? 'id' then$patch$);
 definition:=replace(definition,$patch$operation not in('draft','publish','media','credential.create','credential.revoke')$patch$, $patch$operation not in('draft','publish','media','credential.create','credential.revoke','taxonomy.author','taxonomy.category')$patch$);
 execute definition;
 select pg_get_functiondef('public.fieldgrid_blog_write(text,jsonb)'::regprocedure) into definition;
 definition:=replace(definition,'return private.fieldgrid_blog_write(operation,',$patch$perform set_config('fieldgrid.blog_actor_user_id','',true);perform set_config('fieldgrid.blog_credential_id',credential.id::text,true);return private.fieldgrid_blog_write(operation,$patch$);execute definition;
 select pg_get_functiondef('public.fieldgrid_blog_connector_write(text,jsonb)'::regprocedure) into definition;
 definition:=replace(definition,'return private.fieldgrid_blog_write(operation,safe);',$patch$perform set_config('fieldgrid.blog_actor_user_id','',true);perform set_config('fieldgrid.blog_credential_id',c.id::text,true);return private.fieldgrid_blog_write(operation,safe);$patch$);execute definition;
 foreach definition in array array['private.fieldgrid_blog_read(text,jsonb)','private.fieldgrid_blog_write(text,jsonb)'] loop
 execute replace(pg_get_functiondef(definition::regprocedure),'return receipt.result;','return private.fieldgrid_blog_publication_projection(receipt.result);');
 end loop;
end $$;
create or replace function public.fieldgrid_blog_connector_server_read(operation text,payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare p private.fieldgrid_blog_pairings;post uuid;requested_revision integer;begin
 perform private.fieldgrid_blog_connector_scope(payload);
 perform private.fieldgrid_blog_connector_purge(payload->>'siteId',payload->>'environment');
 if operation='purge' then return jsonb_build_object('purged',true);end if;
 if operation in('publication.status','publication.confirm') then
 post:=(payload->>'id')::uuid;requested_revision:=(payload->>'revision')::integer;
 if requested_revision is null or requested_revision<1 then raise exception 'INVALID_PAYLOAD' using errcode='22023';end if;
 if operation='publication.confirm' then
 if not exists(select 1 from private.fieldgrid_blog_publish_events e where e.post_id=post and e.revision=requested_revision and e.site_id=payload->>'siteId' and e.environment=payload->>'environment') then raise exception 'NOT_FOUND' using errcode='P0002';end if;
 insert into private.fieldgrid_blog_publication_checks(post_id,revision) values(post,requested_revision) on conflict do nothing;
 end if;
 return jsonb_build_object('verified',exists(select 1 from private.fieldgrid_blog_publication_checks c join private.fieldgrid_blog_publish_events e on e.post_id=c.post_id and e.revision=c.revision where c.post_id=post and c.revision=requested_revision and e.site_id=payload->>'siteId' and e.environment=payload->>'environment'));
 end if;
 if operation<>'pair.secret' then raise exception 'INVALID_OPERATION' using errcode='22023';end if;
 select p0.* into p from private.fieldgrid_blog_pairings p0 join private.fieldgrid_blog_installations i on i.attempt_id=p0.attempt_id where p0.attempt_id=(payload->>'attemptId')::uuid and p0.site_id=payload->>'siteId' and p0.environment=payload->>'environment' and (p0.state='active' or (p0.state in('claiming','pending') and p0.expires_at>clock_timestamp()));
 if not found then return null;end if;
 return jsonb_build_object('attemptId',p.attempt_id,'connectionId',p.connection_id,'destinationId',p.destination_id,'encryptedCode',case when p.state='active' then null else p.encrypted_code end,'encryptedToken',case when p.state='active' then null else p.encrypted_token end,'expiresAt',p.expires_at,'state',p.state,'origin',p.origin,'allowDraft',p.allow_draft,'allowPublish',p.allow_publish);
end $$;
revoke all on function private.fieldgrid_blog_history_immutable(),private.fieldgrid_blog_history_capture(),private.fieldgrid_blog_publication_projection(jsonb),private.fieldgrid_blog_taxonomy_manage(),private.fieldgrid_blog_taxonomy_write(text,jsonb) from public,anon,authenticated,service_role;

create function private.fieldgrid_blog_public_page(payload jsonb) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare site text:=payload->>'siteId';env text:=payload->>'environment';requested integer;page_size integer;page_number integer;pages integer;total integer;query text:=coalesce(payload->>'query','');category text:=coalesce(payload->>'category','');posts jsonb;categories jsonb;begin
 perform private.fieldgrid_blog_connector_scope(payload);
 if coalesce(payload->>'page','1') !~ '^[0-9]{1,7}$' or coalesce(payload->>'pageSize','12') !~ '^[0-9]{1,2}$' or length(query)>100 or length(category)>80 then raise exception 'INVALID_PAYLOAD' using errcode='22023';end if;
 requested:=coalesce((payload->>'page')::integer,1);page_size:=coalesce((payload->>'pageSize')::integer,12);if page_size not between 1 and 24 or requested<1 then raise exception 'INVALID_PAYLOAD' using errcode='22023';end if;
 select coalesce(jsonb_agg(label order by label),'[]') into categories from(select distinct live->>'category' label from private.fieldgrid_blog_posts where site_id=site and environment=env and live is not null and not is_test) c;
 select count(*) into total from private.fieldgrid_blog_posts p where p.site_id=site and p.environment=env and p.live is not null and not p.is_test
 and (category='' or lower(p.live->>'category')=lower(category)) and (query='' or strpos(lower(concat_ws(' ',p.live->>'title',p.live->>'excerpt',p.live->>'author',p.live->>'category',p.live->'tags')),lower(query))>0);
 pages:=greatest(1,(total+page_size-1)/page_size);page_number:=least(requested,pages);
 select coalesce(jsonb_agg(private.fieldgrid_blog_entry(x)||jsonb_build_object('draft',x.live,'revision',x.live_revision,'updatedAt',coalesce(x.modified_at,x.published_at)) order by coalesce(x.modified_at,x.published_at) desc,x.id),'[]') into posts from(
 select p.* from private.fieldgrid_blog_posts p where p.site_id=site and p.environment=env and p.live is not null and not p.is_test
 and (category='' or lower(p.live->>'category')=lower(category)) and (query='' or strpos(lower(concat_ws(' ',p.live->>'title',p.live->>'excerpt',p.live->>'author',p.live->>'category',p.live->'tags')),lower(query))>0)
 order by coalesce(p.modified_at,p.published_at) desc,p.id offset (page_number-1)*page_size limit page_size) x;
 return jsonb_build_object('posts',posts,'total',total,'page',page_number,'pages',pages,'categories',categories);
end $$;
create or replace function public.fieldgrid_blog_public_read(operation text,payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
begin if operation='public.page' then return private.fieldgrid_blog_public_page(payload);end if;
 if operation not in('public.list','resolve','public.media','taxonomy') then raise exception 'PERMISSION_DENIED' using errcode='42501';end if;return private.fieldgrid_blog_read(operation,payload-'_allDestinations'-'destinationId');end $$;
revoke all on function private.fieldgrid_blog_public_page(jsonb) from public,anon,authenticated,service_role;
