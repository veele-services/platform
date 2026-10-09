-- Product communication is independent from deployment, entitlement and progress.
begin;

insert into public.permission_catalog(key,domain,name,description,module,action,scopes)
values ('backoffice.product.read','tenant','Roadmap en updates bekijken','Gepubliceerde ontwikkelingen en ideeën van de eigen organisatie volgen.','product','read',array['tenant']),
 ('backoffice.product.submit','tenant','Ideeën indienen en aanvullen','Organisatie-ideeën indienen en reacties toevoegen; geeft geen publicatierecht.','product','write',array['tenant']) on conflict do nothing;
insert into private.management_role_permissions(tenant_id,role_id,capability)
select r.tenant_id,r.id,c.key from private.management_roles r cross join public.permission_catalog c
where r.code in ('owner','management') and c.key in ('backoffice.product.read','backoffice.product.submit') on conflict do nothing;

create function private.product_audience_valid(a jsonb) returns boolean language sql immutable set search_path='' as $$
 select coalesce(jsonb_typeof(a)='object' and (a->>'scope') in ('internal','all','selected')
 and jsonb_typeof((a->'tenants'))='array' and jsonb_typeof((a->'groups'))='array'
 and jsonb_array_length((a->'tenants'))<=1000 and jsonb_array_length((a->'groups'))<=3
 and not exists(select 1 from jsonb_array_elements_text((a->'tenants')) v where v is null or v !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
 and not exists(select 1 from jsonb_array_elements_text((a->'groups')) v where v is null or v not in ('management','staff','customer'))
 and (case when (a->>'scope')='internal' then jsonb_array_length((a->'groups'))=0 and jsonb_array_length((a->'tenants'))=0
 else jsonb_array_length((a->'groups'))>0 and(case when (a->>'scope')='selected' then jsonb_array_length((a->'tenants'))>0 else jsonb_array_length((a->'tenants'))=0 end) end),false)
$$;
create function private.product_availability_valid(a jsonb) returns boolean language sql immutable set search_path='' as $$
 select coalesce(jsonb_typeof(a)='array' and jsonb_array_length(a)<=2 and not exists(
 select 1 from jsonb_array_elements(a) v where coalesce((v->>'environment') not in ('staging','production'),true) or not private.product_audience_valid(jsonb_build_object('scope',(v->>'scope'),'tenants',(v->'tenants'),'groups',case when (v->>'scope')='internal' then '[]'::jsonb else '["management"]'::jsonb end)) or jsonb_typeof((v->'phased')) is distinct from 'boolean'
 ) and (select count(*)=count(distinct (v->>'environment')) from jsonb_array_elements(a) v),false)
$$;

create table private.product_roadmap (
 id uuid primary key default gen_random_uuid(),title text not null check(length(btrim(title)) between 2 and 180),summary text not null check(length(btrim(summary)) between 1 and 600),body text not null default '' check(length(body)<=20000),
 category text not null check(length(btrim(category)) between 1 and 80),progress text not null default 'research' check(progress in ('research','planned','development','testing','released','paused')),
 priority text not null default 'normal' check(priority in ('low','normal','high','urgent')),responsible uuid references public.platform_admins(user_id) on delete set null,planning text not null default '' check(length(planning)<=160),
 publication text not null default 'draft' check(publication in ('draft','published','archived')),
 audience jsonb not null default '{"scope":"internal","tenants":[],"groups":[]}' check(private.product_audience_valid(audience)),
 availability jsonb not null default '[]' check(private.product_availability_valid(availability)),revision bigint not null default 1,
 published_at timestamptz,created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp()
);
create table private.product_releases (
 id uuid primary key default gen_random_uuid(),version text not null check(length(btrim(version)) between 1 and 80),title text not null check(length(btrim(title)) between 2 and 180),intro text not null default '' check(length(intro)<=4000),
 publication text not null default 'draft' check(publication in ('draft','published','archived')),
 audience jsonb not null default '{"scope":"internal","tenants":[],"groups":[]}' check(private.product_audience_valid(audience)),revision bigint not null default 1,
 published_at timestamptz,created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp()
);
create table private.product_changes (
 id uuid primary key default gen_random_uuid(),release_id uuid not null references private.product_releases(id),
 title text not null check(length(btrim(title)) between 2 and 180),body text not null check(length(btrim(body)) between 1 and 20000),
 kind text not null check(kind in ('new','improved','fixed')),category text not null check(length(btrim(category)) between 1 and 80),position integer not null check(position between 0 and 999),
 roadmap_id uuid references private.product_roadmap(id),audience jsonb check(audience is null or private.product_audience_valid(audience)),
 availability jsonb not null default '[]' check(private.product_availability_valid(availability)),revision bigint not null default 1,
 created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp()
);
create index product_changes_release_order on private.product_changes(release_id,position,id);
create index product_changes_roadmap on private.product_changes(roadmap_id) where roadmap_id is not null;
create table private.product_ideas (
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null references public.tenants(id),created_by uuid not null references auth.users(id),
 title text not null check(length(btrim(title)) between 2 and 180),category text not null check(length(btrim(category)) between 1 and 80),problem text not null check(length(btrim(problem)) between 10 and 20000),suggestion text not null default '' check(length(suggestion)<=12000),benefit text not null default '' check(length(benefit)<=8000),
 state text not null default 'draft' check(state in ('draft','review','information','followup','parked','rejected','closed')),roadmap_id uuid references private.product_roadmap(id),
 decision text not null default '' check(length(decision)<=8000),revision bigint not null default 1,
 created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp()
);
create index product_ideas_tenant on private.product_ideas(tenant_id,created_at desc,id);
create index product_ideas_state on private.product_ideas(state,created_at desc,id);
create index product_ideas_roadmap on private.product_ideas(roadmap_id) where roadmap_id is not null;
create index product_roadmap_public on private.product_roadmap(publication,progress,category,created_at desc);
create index product_releases_public on private.product_releases(publication,published_at desc,id);
create table private.product_messages (
 id uuid primary key default gen_random_uuid(),idea_id uuid not null references private.product_ideas(id),actor_id uuid not null references auth.users(id),actor_kind text not null check(actor_kind in ('platform','tenant')),
 body text not null check(length(btrim(body)) between 1 and 12000),created_at timestamptz not null default clock_timestamp()
);
create index product_messages_idea on private.product_messages(idea_id,created_at,id);
create table private.product_notes (
 id uuid primary key default gen_random_uuid(),entity_kind text not null check(entity_kind in ('idea','roadmap','release')),entity_id uuid not null,
 actor_id uuid not null references auth.users(id),body text not null check(length(btrim(body)) between 1 and 12000),created_at timestamptz not null default clock_timestamp()
);
create table private.product_audit (
 id uuid primary key default gen_random_uuid(),entity_kind text not null,entity_id uuid not null,actor_id uuid not null references auth.users(id),action text not null,detail jsonb not null default '{}',created_at timestamptz not null default clock_timestamp()
);
create index product_audit_resource on private.product_audit(entity_kind,entity_id,created_at desc,id);
create table private.product_receipts (
 actor_id uuid not null references auth.users(id),request_id uuid not null,context text not null,tenant_id uuid references public.tenants(id),command text not null,input_hash text not null,result jsonb not null,created_at timestamptz not null default clock_timestamp(),primary key(actor_id,request_id)
);
create table private.product_files (
 id uuid primary key default gen_random_uuid(),entity_kind text not null check(entity_kind in ('idea','change')),entity_id uuid not null,
 actor_id uuid not null references auth.users(id),path text not null unique,name text not null check(length(name) between 1 and 180),mime text not null check(mime in ('application/pdf','image/png','image/jpeg','image/webp')),size integer not null check(size between 1 and 10485760),sha256 text check(sha256 ~ '^[a-f0-9]{64}$'),created_at timestamptz not null default clock_timestamp()
);
create index product_files_parent on private.product_files(entity_kind,entity_id,id);
create table private.product_events (
 id uuid primary key default gen_random_uuid(),entity_kind text not null check(entity_kind in ('idea','release','roadmap')),entity_id uuid not null,type_code text not null,created_at timestamptz not null default clock_timestamp()
);
create table private.product_event_recipients (
 event_id uuid not null references private.product_events(id),tenant_id uuid not null references public.tenants(id),user_id uuid not null references auth.users(id),context text not null check(context in ('backoffice','staff','customer')),primary key(event_id,tenant_id,user_id)
);

-- Generated nullable references give polymorphic records real foreign keys.
alter table private.product_notes add column idea_ref uuid generated always as(case when entity_kind='idea' then entity_id end) stored references private.product_ideas(id),add column roadmap_ref uuid generated always as(case when entity_kind='roadmap' then entity_id end) stored references private.product_roadmap(id),add column release_ref uuid generated always as(case when entity_kind='release' then entity_id end) stored references private.product_releases(id);
alter table private.product_files add column idea_ref uuid generated always as(case when entity_kind='idea' then entity_id end) stored references private.product_ideas(id),add column change_ref uuid generated always as(case when entity_kind='change' then entity_id end) stored references private.product_changes(id);
alter table private.product_events add column idea_ref uuid generated always as(case when entity_kind='idea' then entity_id end) stored references private.product_ideas(id),add column roadmap_ref uuid generated always as(case when entity_kind='roadmap' then entity_id end) stored references private.product_roadmap(id),add column release_ref uuid generated always as(case when entity_kind='release' then entity_id end) stored references private.product_releases(id);
alter table private.product_audit add constraint product_audit_kind check(entity_kind in ('idea','roadmap','release','change')),add column idea_ref uuid generated always as(case when entity_kind='idea' then entity_id end) stored references private.product_ideas(id),add column roadmap_ref uuid generated always as(case when entity_kind='roadmap' then entity_id end) stored references private.product_roadmap(id),add column release_ref uuid generated always as(case when entity_kind='release' then entity_id end) stored references private.product_releases(id),add column change_ref uuid generated always as(case when entity_kind='change' then entity_id end) stored references private.product_changes(id);
create table private.product_idea_history(id uuid primary key default gen_random_uuid(),idea_id uuid not null references private.product_ideas(id),state text not null,created_at timestamptz not null default clock_timestamp());
create index product_idea_history_parent on private.product_idea_history(idea_id,created_at,id);
create function private.product_idea_history_record() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if TG_OP='INSERT' or NEW.state is distinct from OLD.state then insert into private.product_idea_history(idea_id,state) values(NEW.id,NEW.state);end if;
 return NEW;
end$$;
create trigger product_idea_history_record after insert or update on private.product_ideas for each row execute function private.product_idea_history_record();

-- Tables are never accessible through generic Data API or realtime row payloads.
do $$declare name text;begin
 foreach name in array array['product_idea_history','product_roadmap','product_releases','product_changes','product_ideas','product_messages','product_notes','product_audit','product_receipts','product_files','product_events','product_event_recipients'] loop
 execute format('alter table private.%I enable row level security',name);execute format('alter table private.%I force row level security',name);execute format('revoke all on private.%I from public,anon,authenticated,service_role',name);
 end loop;
end$$;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('product-documents','product-documents',false,10485760,array['application/pdf','image/png','image/jpeg','image/webp']) on conflict(id) do nothing;
create policy product_storage_private on storage.objects as restrictive for all to authenticated,anon using(bucket_id<>'product-documents') with check(bucket_id<>'product-documents');

create function private.product_platform(actor uuid) returns boolean language sql stable security definer set search_path='' as $$
 select private.notification_actor_active(null,'platform',actor) and exists(select 1 from public.platform_admins where user_id=actor)
$$;
create function private.product_actor(t uuid,ctx text,actor uuid,writing boolean default false) returns boolean language sql stable security definer set search_path='' as $$
 select coalesce(private.notification_actor_active(t,ctx,actor) and case ctx
 when 'backoffice' then (case when private.management_is_managed(t,actor) then private.management_has(t,actor,'backoffice.access') and private.management_has(t,actor,'backoffice.product.read') and(not writing or private.management_has(t,actor,'backoffice.product.submit'))
 else exists(select 1 from public.tenant_memberships where tenant_id=t and user_id=actor and status='active' and roles&&array['tenant_admin','management']::public.app_role[]) end)
 when 'staff' then not writing and exists(select 1 from public.tenant_settings where tenant_id=t and 'personeel'=any(enabled_services)) and exists(select 1 from public.tenant_memberships where tenant_id=t and user_id=actor and status='active' and 'staff'=any(roles))
 when 'customer' then not writing and exists(select 1 from public.tenant_settings where tenant_id=t and 'klantportaal'=any(enabled_services))
 else false end,false)
$$;
create function private.product_audience_allows(a jsonb,t uuid,ctx text) returns boolean language sql immutable set search_path='' as $$
 select coalesce(private.product_audience_valid(a) and (a->>'scope')<>'internal' and((a->>'scope')='all' or (a->'tenants') ? t::text) and (a->'groups') ? case ctx when 'backoffice' then 'management' when 'staff' then 'staff' when 'customer' then 'customer' else '' end,false)
$$;
create function private.product_audience_assert(a jsonb) returns void language plpgsql stable security definer set search_path='' as $$
begin
 if not private.product_audience_valid(a) or exists(select 1 from jsonb_array_elements_text((a->'tenants')) v where not exists(select 1 from public.tenants where id=v::uuid and status='active')) then raise exception 'Kies een geldige, niet-lege doelgroep met actieve organisaties.' using errcode='23514';end if;
end$$;
create function private.product_restriction_assert(child jsonb,parent jsonb) returns void language plpgsql stable security definer set search_path='' as $$
begin
 if child is null then return;end if;
 perform private.product_audience_assert(child);
 if (child->>'scope')='internal' then return;end if;
 if (parent->>'scope')='internal' or not((child->'groups') <@ (parent->'groups')) or((parent->>'scope')='selected' and((child->>'scope')<>'selected' or not((child->'tenants') <@ (parent->'tenants')))) then raise exception 'Een releaseonderdeel mag de releasedoelgroep alleen beperken.' using errcode='23514';end if;
end$$;
create function private.product_availability(a jsonb,t uuid) returns jsonb language sql immutable set search_path='' as $$
 select coalesce(jsonb_object_agg(env,case when v is null or (v->>'scope')='internal' then 'Niet als beschikbaar geregistreerd' when t is null then case when (v->>'scope')='all' then 'Beschikbaar voor alle organisaties' else 'Beschikbaar voor geselecteerde organisaties' end||case when coalesce((v->>'phased')::boolean,false) then ' (gefaseerde uitrol)' else '' end when (v->>'scope')='all' or (v->'tenants') ? t::text then (case when env='staging' then 'Op staging te testen' else 'Beschikbaar voor jouw organisatie' end)||case when coalesce((v->>'phased')::boolean,false) then ' (gefaseerde uitrol)' else '' end when coalesce(((v->>'phased'))::boolean,false) then 'Wordt stapsgewijs beschikbaar gemaakt' else 'Nog niet beschikbaar voor jouw organisatie' end),'{}'::jsonb)
 from (values('staging'),('production')) e(env) left join lateral(select v from jsonb_array_elements(a) v where (v->>'environment')=env) av on true
$$;
create function private.product_roadmap_allowed(r uuid,t uuid,ctx text,actor uuid,preview boolean default false) returns boolean language sql stable security definer set search_path='' as $$
 select private.product_actor(t,ctx,actor) and exists(select 1 from private.product_roadmap where id=r and(publication='published' or preview) and private.product_audience_allows(audience,t,ctx))
$$;
create function private.product_change_allowed(c uuid,t uuid,ctx text,actor uuid,preview boolean default false) returns boolean language sql stable security definer set search_path='' as $$
 select private.product_actor(t,ctx,actor) and exists(select 1 from private.product_changes c join private.product_releases r on r.id=c.release_id where c.id=$1 and(r.publication='published' or preview) and private.product_audience_allows(r.audience,t,ctx) and(c.audience is null or private.product_audience_allows(c.audience,t,ctx)))
$$;
create function private.product_files_dto(kind text,entity uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name,'mime',mime,'size',size) order by created_at),'[]'::jsonb) from private.product_files where entity_kind=kind and entity_id=entity and sha256 is not null
$$;
create function private.product_roadmap_dto(r uuid,t uuid,ctx text,actor uuid,admin boolean default false,preview boolean default false) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',id,'title',title,'summary',summary,'body',body,'category',category,'progress',progress,'planning',planning,'revision',revision,'publishedAt',published_at,'availability',private.product_availability(availability,t)) || case when admin then jsonb_build_object('priority',priority,'responsible',responsible,'publication',publication,'audience',audience,'availabilityInput',availability,'updatedAt',updated_at) else '{}'::jsonb end from private.product_roadmap where id=r and(admin or private.product_roadmap_allowed(r,t,ctx,actor,preview))
$$;
create function private.product_release_dto(rid uuid,t uuid,ctx text,actor uuid,admin boolean default false,preview boolean default false) returns jsonb language sql stable security definer set search_path='' as $$
 select case when admin or jsonb_array_length(parts)>0 then jsonb_build_object('id',r.id,'version',r.version,'title',r.title,'intro',r.intro,'publishedAt',r.published_at,'revision',r.revision,'changes',parts)||case when admin then jsonb_build_object('publication',r.publication,'audience',r.audience,'updatedAt',r.updated_at) else '{}'::jsonb end end
 from private.product_releases r cross join lateral(select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'title',c.title,'body',c.body,'kind',c.kind,'category',c.category,'position',c.position,'revision',c.revision,'roadmap',case when c.roadmap_id is not null then private.product_roadmap_dto(c.roadmap_id,t,ctx,actor,admin) end,'availability',private.product_availability(c.availability,t),'files',private.product_files_dto('change',c.id))||case when admin then jsonb_build_object('roadmapId',c.roadmap_id,'audience',c.audience,'availabilityInput',c.availability) else '{}'::jsonb end order by c.position,c.id),'[]'::jsonb) parts from private.product_changes c where c.release_id=r.id and(admin or private.product_change_allowed(c.id,t,ctx,actor,preview))) changes
 where r.id=rid and(admin or((r.publication='published' or preview) and private.product_actor(t,ctx,actor) and private.product_audience_allows(r.audience,t,ctx)))
$$;
create function private.product_idea_dto(iid uuid,t uuid,ctx text,actor uuid,admin boolean default false) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',i.id,'title',i.title,'category',i.category,'problem',i.problem,'suggestion',i.suggestion,'benefit',i.benefit,'state',case when admin then i.state when i.state='draft' then 'received' when i.state='rejected' then 'closed' else i.state end,'decision',i.decision,'revision',i.revision,'createdAt',i.created_at,'updatedAt',i.updated_at,
 'roadmap',case when i.roadmap_id is not null then private.product_roadmap_dto(i.roadmap_id,i.tenant_id,case when admin then 'backoffice' else ctx end,actor,admin) end,
 'history',coalesce((select jsonb_agg(jsonb_build_object('id',h.id,'state',case when admin then h.state when h.state='draft' then 'received' when h.state='rejected' then 'closed' else h.state end,'createdAt',h.created_at) order by h.created_at,h.id) from private.product_idea_history h where h.idea_id=i.id),'[]'),'files',private.product_files_dto('idea',i.id),'messages',coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'body',m.body,'from',case when m.actor_kind='platform' then 'Fieldgrid' else 'Onze organisatie' end,'createdAt',m.created_at) order by m.created_at,m.id) from private.product_messages m where m.idea_id=i.id),'[]'::jsonb))
 ||case when admin then jsonb_build_object('tenantId',i.tenant_id,'tenantName',(select name from public.tenants where id=i.tenant_id),'createdBy',i.created_by,'roadmapId',i.roadmap_id) else '{}'::jsonb end
 from private.product_ideas i where i.id=iid and(admin or(i.tenant_id=t and ctx='backoffice' and private.product_actor(t,ctx,actor)))
$$;

create function private.product_query_for(target_tenant uuid,actor_context text,operation text,payload jsonb,actor uuid,admin boolean default false) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare ctx text:=actor_context;t uuid:=target_tenant;item_id uuid:=nullif((payload->>'id'),'')::uuid;q text:=left(coalesce((payload->>'search'),''),160);result jsonb;page integer:=greatest(1,coalesce(((payload->>'page'))::integer,1));size integer:=least(100,greatest(10,coalesce(((payload->>'pageSize'))::integer,25)));total integer;
begin
 if operation='preview' then
  if not admin then raise exception 'Alleen platformbeheer kan een ontvanger simuleren.' using errcode='42501';end if;
  t:=((payload->>'tenantId'))::uuid;ctx:=(payload->>'group');
  if ctx not in ('backoffice','staff','customer') or not exists(select 1 from public.tenants where id=t and status='active') then raise exception 'Kies een actieve ontvanger.' using errcode='23514';end if;
  -- Preview selects with the same audience/DTO functions, using a real authorized
  -- recipient. No membership impersonation, mutation or privilege union.
  select u.id into actor from auth.users u where private.product_actor(t,ctx,u.id) order by u.id limit 1;
  if actor is null then return jsonb_build_object('item',null,'noRecipient',true);end if;
  if (payload->>'id') is not null then return jsonb_build_object('item',case (payload->>'kind') when 'roadmap' then private.product_roadmap_dto(((payload->>'id'))::uuid,t,ctx,actor,false,true) when 'releases' then private.product_release_dto(((payload->>'id'))::uuid,t,ctx,actor,false,true) end,'noRecipient',false);end if;
  admin:=false;operation:='overview';
 end if;
 if operation='access' then return jsonb_build_object('canManage',admin,'canSubmit',not admin and private.product_actor(t,ctx,actor,true));end if;
 if operation='options' and admin then return jsonb_build_object('tenants',coalesce((select jsonb_agg(jsonb_build_object('id',tn.id,'name',tn.name) order by tn.name) from public.tenants tn where tn.status='active'),'[]'),'owners',coalesce((select jsonb_agg(jsonb_build_object('id',p.user_id,'name',coalesce((u.raw_user_meta_data->>'full_name'),u.email,'Platformbeheerder'))) from public.platform_admins p join auth.users u on u.id=p.user_id),'[]'));end if;
 if operation='overview' then return jsonb_build_object('roadmap',private.product_query_for(t,ctx,'roadmap',payload,actor,admin),'releases',private.product_query_for(t,ctx,'releases',payload,actor,admin),'ideas',case when ctx in ('platform','backoffice') then private.product_query_for(t,ctx,'ideas',payload,actor,admin) else null end);end if;
 if operation in ('idea','roadmap_item','release') then
  result:=case operation when 'idea' then private.product_idea_dto(item_id,t,ctx,actor,admin) when 'roadmap_item' then private.product_roadmap_dto(item_id,t,ctx,actor,admin) else private.product_release_dto(item_id,t,ctx,actor,admin) end;
  if result is null then raise exception 'Productinformatie niet beschikbaar.' using errcode='42501';end if;
  if admin then result:=result||jsonb_build_object('notes',coalesce((select jsonb_agg(jsonb_build_object('id',n.id,'body',n.body,'createdAt',n.created_at) order by n.created_at) from private.product_notes n where n.entity_kind=case operation when 'idea' then 'idea' when 'roadmap_item' then 'roadmap' else 'release' end and n.entity_id=item_id),'[]'),'audit',coalesce((select jsonb_agg(to_jsonb(a) order by a.created_at desc) from (select actor_id,action,detail,created_at from private.product_audit where entity_id=item_id order by created_at desc limit 100) a),'[]'),'linkedReleases',case when operation='roadmap_item' then coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'title',r.title,'version',r.version,'changeTitle',c.title)) from private.product_changes c join private.product_releases r on r.id=c.release_id where c.roadmap_id=item_id),'[]') else null end,'linkedIdeas',case when operation='roadmap_item' then coalesce((select jsonb_agg(jsonb_build_object('id',i.id,'title',i.title,'tenantName',tn.name)) from private.product_ideas i join public.tenants tn on tn.id=i.tenant_id where i.roadmap_id=item_id),'[]') else null end);end if;
  return result;
 end if;
 if operation='upload' then
  select jsonb_build_object('id',f.id,'path',f.path,'name',f.name,'mime',f.mime,'size',f.size) into result from private.product_files f where f.id=item_id and f.actor_id=actor and(admin or(f.entity_kind='idea' and private.product_actor(t,ctx,actor,true) and private.product_idea_dto(f.entity_id,t,ctx,actor) is not null));
  if result is null then raise exception 'Geen actuele uploadtoegang.' using errcode='42501';end if;return result;
 end if;
 if operation='file' then
  select jsonb_build_object('bucket','product-documents','path',f.path,'scope',(string_to_array(f.path,'/'))[1:3],'name',f.name,'mime',f.mime,'sha256',f.sha256) into result from private.product_files f where f.id=item_id and f.sha256 is not null and(admin or(f.entity_kind='idea' and private.product_idea_dto(f.entity_id,t,ctx,actor) is not null) or(f.entity_kind='change' and private.product_change_allowed(f.entity_id,t,ctx,actor)));
  if result is null then raise exception 'Bijlage niet beschikbaar.' using errcode='42501';end if;return result;
 end if;
 if operation='ideas' and ctx not in ('platform','backoffice') then raise exception 'Geen toegang tot inzendingen.' using errcode='42501';end if;
 if operation not in ('ideas','roadmap','releases') then raise exception 'Onbekende productquery.' using errcode='23514';end if;
 with selected as (
 select private.product_idea_dto(i.id,t,ctx,actor,admin) d,i.created_at at from private.product_ideas i where operation='ideas' and(admin or i.tenant_id=t)
 union all select private.product_roadmap_dto(r.id,t,ctx,actor,admin),r.created_at from private.product_roadmap r where operation='roadmap'
 union all select private.product_release_dto(r.id,t,ctx,actor,admin),coalesce(r.published_at,r.created_at) from private.product_releases r where operation='releases'
 ), filtered as(select d,at from selected where d is not null and (q='' or position(lower(q) in lower((d->>'title')||' '||coalesce((d->>'summary'),(d->>'intro'),(d->>'problem'),'')||' '||coalesce((select string_agg((v->>'title')||' '||(v->>'body'),' ') from jsonb_array_elements(coalesce((d->'changes'),'[]')) v),'')))>0)
 and(coalesce((payload->>'phase'),'')='' or((payload->>'phase')='planned' and (d->>'progress') in ('research','planned')) or((payload->>'phase')='development' and (d->>'progress') in ('development','testing')))
 and(coalesce((payload->>'status'),'')='' or coalesce((d->>'state'),(d->>'progress'))=(payload->>'status'))
 and(coalesce((payload->>'category'),'')='' or (d->>'category')=(payload->>'category') or exists(select 1 from jsonb_array_elements(coalesce((d->'changes'),'[]')) v where (v->>'category')=(payload->>'category')))
 and(not admin or(coalesce((payload->>'publication'),'')='' or (d->>'publication')=(payload->>'publication')) and(coalesce((payload->>'priority'),'')='' or (d->>'priority')=(payload->>'priority')) and(coalesce((payload->>'scope'),'')='' or (d->'audience'->>'scope')=(payload->>'scope'))))
 select jsonb_build_object('items',coalesce((select jsonb_agg(d order by at desc,(d->>'id')) from(select d,at from filtered order by at desc,(d->>'id') limit size offset (page-1)*size) p),'[]'),'total',(select count(*) from filtered),'page',page,'pageSize',size) into result;
 return result;
end$$;


create function public.product_query(target_tenant uuid,actor_context text,operation text,payload jsonb default '{}') returns jsonb language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=auth.uid();admin boolean;
begin
 if not private.actor_session_active() or actor_context is null or actor_context not in ('platform','backoffice','staff','customer') or jsonb_typeof(payload) is distinct from 'object' then raise exception 'Geen actuele toegang.' using errcode='42501';end if;
 admin:=actor_context='platform' and target_tenant is null and private.product_platform(actor);
 if not admin and not private.product_actor(target_tenant,actor_context,actor) then raise exception 'Geen toegang tot productinformatie.' using errcode='42501';end if;
 return private.product_query_for(target_tenant,actor_context,operation,payload,actor,admin);
end$$;

-- Product events enter the existing in-app queue, never email or push in V1.
insert into public.notification_catalog(code,name,description,category,module,status,contexts,channels,default_channels,recipient_description,tenant_override)
select code,name,name,'Productontwikkeling',null,'active',contexts,array['in_app'],array['in_app'],'Alleen actuele ontvangers van de bijbehorende productinformatie',false from(values
 ('product.idea_received','Idee ontvangen',array['backoffice']),('product.idea_reply','Reactie op een idee',array['backoffice']),('product.idea_decision','Besluit over een idee',array['backoffice']),('product.release','Nieuwe productupdate',array['backoffice','staff','customer']),('product.available','Gekoppelde verbetering beschikbaar',array['backoffice'])) v(code,name,contexts);
insert into private.notification_templates(tenant_id,type_code,context,channel,draft)
select null,c.code,ctx,'in_app',jsonb_build_object('title',c.name,'body','Er staat productinformatie klaar in je beveiligde omgeving.','cta_label','Bekijken') from public.notification_catalog c cross join lateral unnest(c.contexts) ctx where c.code like 'product.%';
insert into private.notification_template_versions(template_id,revision,definition)
select id,1,draft from private.notification_templates where type_code like 'product.%' and tenant_id is null;
update private.notification_templates t set active_version_id=v.id from private.notification_template_versions v where v.template_id=t.id and t.type_code like 'product.%' and v.revision=1;

create function private.product_event_allowed(eid uuid,t uuid,ctx text,actor uuid) returns boolean language sql stable security definer set search_path='' as $$
 select private.product_actor(t,ctx,actor) and exists(select 1 from private.product_events e join private.product_event_recipients r on r.event_id=e.id
 where e.id=eid and r.tenant_id=t and r.user_id=actor and r.context=ctx and case e.entity_kind
 when 'idea' then ctx='backoffice' and private.product_idea_dto(e.entity_id,t,ctx,actor) is not null
 when 'release' then private.product_release_dto(e.entity_id,t,ctx,actor) is not null
 when 'roadmap' then ctx='backoffice' and private.product_roadmap_allowed(e.entity_id,t,ctx,actor) and exists(select 1 from private.product_ideas i where i.tenant_id=t and i.roadmap_id=e.entity_id)
 and exists(select 1 from private.product_roadmap m cross join lateral jsonb_array_elements(m.availability) av where m.id=e.entity_id and (av->>'environment')='production' and((av->>'scope')='all' or (av->'tenants') ? t::text))
 else false end)
$$;
create function private.product_notify(kind text,entity uuid,code text) returns uuid language plpgsql security definer set search_path='' as $$
declare eid uuid;candidate record;req uuid;path text;
begin
 insert into private.product_events(entity_kind,entity_id,type_code) values(kind,entity,code) returning id into eid;
 for candidate in
 select distinct on(t,user_id) t,user_id,ctx from (
 select tn.id t,m.user_id,'backoffice'::text ctx,0 rank from public.tenants tn join public.tenant_memberships m on m.tenant_id=tn.id where m.status='active'
 union all select p.tenant_id,p.user_id,'staff',1 from public.personnel p where p.status='active' and p.user_id is not null
 union all select a.tenant_id,a.user_id,'customer',2 from public.customer_portal_accounts a where a.active
 ) recipients where private.product_actor(t,ctx,user_id) and case kind
 when 'idea' then ctx='backoffice' and exists(select 1 from private.product_ideas i where i.id=entity and i.tenant_id=t)
 when 'release' then private.product_release_dto(entity,t,ctx,user_id) is not null
 when 'roadmap' then ctx='backoffice' and private.product_roadmap_allowed(entity,t,ctx,user_id) and exists(select 1 from private.product_ideas i where i.roadmap_id=entity and i.tenant_id=t)
 and exists(select 1 from private.product_roadmap m cross join lateral jsonb_array_elements(m.availability) av where m.id=entity and (av->>'environment')='production' and((av->>'scope')='all' or (av->'tenants') ? t::text)) else false end
 order by t,user_id,rank
 loop
  insert into private.product_event_recipients(event_id,tenant_id,user_id,context) values(eid,candidate.t,candidate.user_id,candidate.ctx);
  path:=case candidate.ctx when 'backoffice' then '/app/updates' when 'staff' then '/staff/updates' else '/klant/updates' end||'?'||case kind when 'idea' then 'idea' when 'release' then 'release' else 'roadmap' end||'='||entity;
  req:=private.notification_enqueue(candidate.t,code,'product',eid,eid::text,'product:'||eid||':'||candidate.user_id,
   jsonb_build_object('recipient_user_id',candidate.user_id,'context',candidate.ctx,'channels',array['in_app'],'path',path,'variables',jsonb_build_object('bedrijfsnaam',(select name from public.tenants where id=candidate.t))));
 end loop;
 return eid;
end$$;

create function public.product_command(target_tenant uuid,actor_context text,command text,payload jsonb,request_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
<<product_command>>
declare actor uuid:=auth.uid();admin boolean;ctx text:=actor_context;t uuid:=target_tenant;item_id uuid:=nullif((payload->>'id'),'')::uuid;expected bigint:=coalesce(((payload->>'revision'))::bigint,0);hash text;receipt private.product_receipts;result jsonb;
 idea private.product_ideas;r private.product_roadmap;rel private.product_releases;ch private.product_changes;file private.product_files;scope jsonb;parent uuid;entity_kind text;state text;note text;fid uuid;count_items integer;
begin
 if not private.actor_session_active() or ctx is null or ctx not in ('platform','backoffice','staff','customer') or request_id is null then raise exception 'Geen actuele toegang.' using errcode='42501';end if;
 admin:=ctx='platform' and t is null and private.product_platform(actor);
 if not admin and(ctx<>'backoffice' or not private.product_actor(t,ctx,actor,true)) then raise exception 'Geen wijzigingsrecht voor productinformatie.' using errcode='42501';end if;
 if not admin and command not in ('submit_idea','reply','file_intent','file_finish') then raise exception 'Alleen platformbeheer kan dit wijzigen.' using errcode='42501';end if;
 if jsonb_typeof(payload) is distinct from 'object' then raise exception 'Ongeldige opdracht.' using errcode='23514';end if;
 perform pg_advisory_xact_lock(hashtextextended('product-request:'||actor||':'||request_id,0));
 hash:=encode(extensions.digest(payload::text,'sha256'),'hex');
 select * into receipt from private.product_receipts where actor_id=actor and product_receipts.request_id=product_command.request_id;
 if found then
  if receipt.context is distinct from ctx or receipt.tenant_id is distinct from t or receipt.command is distinct from command or receipt.input_hash is distinct from hash then raise exception 'Deze aanvraag hoort bij andere inhoud.' using errcode='23505';end if;
  return receipt.result;
 end if;
 if command='submit_idea' then
  if admin or payload ?| array['tenantId','createdBy','state','audience','roadmapId'] then raise exception 'Indiener en organisatie worden uit je toegang bepaald.' using errcode='23514';end if;
  insert into private.product_ideas(tenant_id,created_by,title,category,problem,suggestion,benefit) values(t,actor,btrim((payload->>'title')),btrim((payload->>'category')),btrim((payload->>'problem')),coalesce((payload->>'suggestion'),''),coalesce((payload->>'benefit'),'')) returning * into idea;
  item_id:=idea.id;entity_kind:='idea';perform private.product_notify('idea',item_id,'product.idea_received');
 elsif command='save_roadmap' or command='convert_idea' then
  perform private.product_audience_assert(coalesce((payload->'audience'),'{"scope":"internal","tenants":[],"groups":[]}'::jsonb));
  if command='convert_idea' then select * into idea from private.product_ideas where product_ideas.id=item_id for update;if not found or idea.revision<>expected then raise exception 'Het idee is gewijzigd.' using errcode='40001';end if;item_id:=null;end if;
  if item_id is null then
   if (payload->>'publication') is not null then raise exception 'Nieuwe ontwikkelingen beginnen als concept.' using errcode='23514';end if;
   insert into private.product_roadmap(title,summary,body,category,progress,priority,responsible,planning,audience,availability)
   values(btrim((payload->>'title')),btrim((payload->>'summary')),coalesce((payload->>'body'),''),btrim((payload->>'category')),coalesce((payload->>'progress'),'research'),coalesce((payload->>'priority'),'normal'),nullif((payload->>'responsible'),'')::uuid,coalesce((payload->>'planning'),''),coalesce((payload->'audience'),'{"scope":"internal","tenants":[],"groups":[]}'::jsonb),coalesce((payload->'availability'),'[]'::jsonb)) returning * into r;
  else
   select * into r from private.product_roadmap where product_roadmap.id=item_id for update;if not found or r.revision<>expected then raise exception 'De ontwikkeling is gewijzigd.' using errcode='40001';end if;
   update private.product_roadmap set title=btrim((payload->>'title')),summary=btrim((payload->>'summary')),body=coalesce((payload->>'body'),''),category=btrim((payload->>'category')),progress=(payload->>'progress'),priority=(payload->>'priority'),responsible=nullif((payload->>'responsible'),'')::uuid,planning=coalesce((payload->>'planning'),''),audience=(payload->'audience'),availability=(payload->'availability'),revision=revision+1,updated_at=clock_timestamp() where product_roadmap.id=item_id returning * into r;
  end if;
  item_id:=r.id;entity_kind:='roadmap';
  if command='convert_idea' then update private.product_ideas set roadmap_id=item_id,state='followup',revision=revision+1,updated_at=clock_timestamp() where product_ideas.id=idea.id;insert into private.product_audit(entity_kind,entity_id,actor_id,action,detail) values('idea',idea.id,actor,'link',jsonb_build_object('roadmapId',item_id));end if;
 elsif command='save_release' then
  perform private.product_audience_assert((payload->'audience'));
  if item_id is null then
   insert into private.product_releases(version,title,intro,audience) values(btrim((payload->>'version')),btrim((payload->>'title')),coalesce((payload->>'intro'),''),(payload->'audience')) returning * into rel;
  else
   select * into rel from private.product_releases where product_releases.id=item_id for update;if not found or rel.revision<>expected then raise exception 'De release is gewijzigd.' using errcode='40001';end if;
   for ch in select * from private.product_changes where release_id=item_id loop perform private.product_restriction_assert(ch.audience,(payload->'audience'));end loop;
   update private.product_releases set version=btrim((payload->>'version')),title=btrim((payload->>'title')),intro=coalesce((payload->>'intro'),''),audience=(payload->'audience'),revision=revision+1,updated_at=clock_timestamp() where product_releases.id=item_id returning * into rel;
  end if;item_id:=rel.id;entity_kind:='release';
 elsif command in ('save_change','reorder_changes') then
  parent:=((payload->>'releaseId'))::uuid;select * into rel from private.product_releases where product_releases.id=parent for update;
  if not found or rel.revision<>expected then raise exception 'De release is gewijzigd.' using errcode='40001';end if;
  if command='reorder_changes' then
   select count(*) into count_items from private.product_changes where release_id=parent;
   if jsonb_typeof((payload->'ids')) is distinct from 'array' or jsonb_array_length((payload->'ids'))<>count_items or (select count(distinct value) from jsonb_array_elements_text((payload->'ids')))<>count_items or exists(select 1 from jsonb_array_elements_text((payload->'ids')) v where not exists(select 1 from private.product_changes where id=v::uuid and release_id=parent)) then raise exception 'Kies alle releaseonderdelen precies eenmaal.' using errcode='23514';end if;
   update private.product_changes c set position=a.n-1,revision=c.revision+1 from jsonb_array_elements_text((payload->'ids')) with ordinality a(v,n) where c.id=a.v::uuid and c.release_id=parent;
  else
   scope:=nullif((payload->'audience'),'null'::jsonb);perform private.product_restriction_assert(scope,rel.audience);
   if item_id is null then
    select count(*) into count_items from private.product_changes where release_id=parent;if count_items>=100 then raise exception 'Maximaal 100 wijzigingen per release.' using errcode='23514';end if;
    insert into private.product_changes(release_id,title,body,kind,category,position,roadmap_id,audience,availability) values(parent,btrim((payload->>'title')),btrim((payload->>'body')),(payload->>'kind'),btrim((payload->>'category')),count_items,nullif((payload->>'roadmapId'),'')::uuid,scope,coalesce((payload->'availability'),'[]'::jsonb)) returning id into fid;
   else
    select * into ch from private.product_changes where product_changes.id=item_id and release_id=parent for update;if not found then raise exception 'Onderdeel niet beschikbaar.' using errcode='42501';end if;
    update private.product_changes set title=btrim((payload->>'title')),body=btrim((payload->>'body')),kind=(payload->>'kind'),category=btrim((payload->>'category')),roadmap_id=nullif((payload->>'roadmapId'),'')::uuid,audience=scope,availability=coalesce((payload->'availability'),'[]'::jsonb),revision=revision+1,updated_at=clock_timestamp() where product_changes.id=item_id;fid:=item_id;
   end if;
  end if;
  update private.product_releases set revision=revision+1,updated_at=clock_timestamp() where product_releases.id=parent;item_id:=parent;entity_kind:='release';
 elsif command in ('publish','announce','archive') then
  entity_kind:=(payload->>'kind');
  if entity_kind='roadmap' then
   select * into r from private.product_roadmap where product_roadmap.id=item_id for update;
   if not found or r.revision<>expected then raise exception 'De ontwikkeling is gewijzigd.' using errcode='40001';end if;
   if command='announce' then
    if r.publication<>'published' then raise exception 'Publiceer de ontwikkeling eerst.' using errcode='23514';end if;
    perform private.product_notify('roadmap',item_id,'product.available');
    update private.product_roadmap set revision=revision+1,updated_at=clock_timestamp() where product_roadmap.id=item_id;
   else
    if command='publish' and r.publication='published' then raise exception 'Deze ontwikkeling is al gepubliceerd.' using errcode='23514';end if;
    update private.product_roadmap set publication=case command when 'archive' then 'archived' else 'published' end,published_at=case when command='publish' then clock_timestamp() else published_at end,revision=revision+1,updated_at=clock_timestamp() where product_roadmap.id=item_id;
   end if;
  elsif entity_kind='release' then
   select * into rel from private.product_releases where product_releases.id=item_id for update;
   if not found or rel.revision<>expected then raise exception 'De release is gewijzigd.' using errcode='40001';end if;
   if command='archive' then update private.product_releases set publication='archived',revision=revision+1,updated_at=clock_timestamp() where product_releases.id=item_id;
   else
    if not exists(select 1 from private.product_changes where release_id=item_id) or (payload->>'checked') is distinct from 'true' then raise exception 'Controleer onderdelen, doelgroep en productie-uitrol vóór publiceren.' using errcode='23514';end if;
    if command='publish' then
     if rel.publication='published' then raise exception 'Gebruik Opnieuw aankondigen voor een nieuwe meldingsronde.' using errcode='23514';end if;
     update private.product_releases set publication='published',published_at=clock_timestamp(),revision=revision+1,updated_at=clock_timestamp() where product_releases.id=item_id;
    elsif rel.publication<>'published' then raise exception 'Publiceer de release eerst.' using errcode='23514';
    else update private.product_releases set revision=revision+1,updated_at=clock_timestamp() where product_releases.id=item_id;end if;
    if coalesce(((payload->>'inform'))::boolean,false) then perform private.product_notify('release',item_id,'product.release');end if;
   end if;
  else raise exception 'Onbekend publicatieonderdeel.' using errcode='23514';end if;
 elsif command in ('idea_state','idea_link','reply') then
  select * into idea from private.product_ideas where product_ideas.id=item_id and(admin or tenant_id=t) for update;
  if not found or idea.revision<>expected then raise exception 'Idee niet beschikbaar of gewijzigd.' using errcode='40001';end if;
  entity_kind:='idea';
  if command='reply' then
   insert into private.product_messages(idea_id,actor_id,actor_kind,body) values(item_id,actor,case when admin then 'platform' else 'tenant' end,btrim((payload->>'body')));
   update private.product_ideas set revision=revision+1,updated_at=clock_timestamp() where product_ideas.id=item_id;
   if admin then perform private.product_notify('idea',item_id,'product.idea_reply');end if;
  elsif command='idea_link' then
   parent:=((payload->>'roadmapId'))::uuid;if not exists(select 1 from private.product_roadmap where product_roadmap.id=parent) then raise exception 'Ontwikkeling niet beschikbaar.' using errcode='23514';end if;
   update private.product_ideas set roadmap_id=parent,state='followup',revision=revision+1,updated_at=clock_timestamp() where product_ideas.id=item_id;
  else
   state:=(payload->>'state');note:=btrim(coalesce((payload->>'decision'),''));
   if state in ('information','parked','rejected') and length(note)<5 then raise exception 'Geef een duidelijke toelichting of vraag.' using errcode='23514';end if;
   update private.product_ideas set state=product_command.state,decision=note,revision=revision+1,updated_at=clock_timestamp() where product_ideas.id=item_id;
   if note<>'' then insert into private.product_messages(idea_id,actor_id,actor_kind,body) values(item_id,actor,'platform',note);end if;
   if state in ('information','parked','rejected','closed') then perform private.product_notify('idea',item_id,'product.idea_decision');end if;
  end if;
 elsif command='note' then
  entity_kind:=(payload->>'kind');
  if entity_kind='idea' and not exists(select 1 from private.product_ideas where product_ideas.id=item_id) or entity_kind='roadmap' and not exists(select 1 from private.product_roadmap where product_roadmap.id=item_id) or entity_kind='release' and not exists(select 1 from private.product_releases where product_releases.id=item_id) or entity_kind not in ('idea','roadmap','release') then raise exception 'Onderdeel niet beschikbaar.' using errcode='42501';end if;
  insert into private.product_notes(entity_kind,entity_id,actor_id,body) values(entity_kind,item_id,actor,btrim((payload->>'body')));
 elsif command='file_intent' then
  entity_kind:=(payload->>'kind');
  if entity_kind='idea' then
   select * into idea from private.product_ideas where product_ideas.id=item_id and(admin or tenant_id=t) for update;if not found then raise exception 'Idee niet beschikbaar.' using errcode='42501';end if;
  elsif entity_kind='change' and admin then
   select * into ch from private.product_changes where product_changes.id=item_id for update;
   if not found then raise exception 'Onderdeel niet beschikbaar.' using errcode='42501';end if;
  else raise exception 'Geen uploadtoegang.' using errcode='42501';end if;
  if (select count(*) from private.product_files f where f.entity_kind=product_command.entity_kind and f.entity_id=item_id)>=5 then raise exception 'Maximaal vijf bijlagen per onderdeel.' using errcode='23514';end if;
  fid:=gen_random_uuid();insert into private.product_files(id,entity_kind,entity_id,actor_id,path,name,mime,size) values(fid,entity_kind,item_id,actor,entity_kind||'/'||item_id||'/'||fid||'/bestand',left(btrim((payload->>'name')),180),(payload->>'mime'),((payload->>'size'))::integer) returning * into file;
  result:=jsonb_build_object('id',item_id,'fileId',fid,'path',file.path);
 elsif command='file_finish' then
  select * into file from private.product_files where product_files.id=item_id and actor_id=actor for update;
  if not found or not admin and(file.entity_kind<>'idea' or not exists(select 1 from private.product_ideas where product_ideas.id=file.entity_id and tenant_id=t)) then raise exception 'Geen uploadtoegang.' using errcode='42501';end if;
  if not exists(select 1 from storage.objects o join private.file_scan_receipts s on s.object_id=o.id and s.object_version=o.version where o.bucket_id='product-documents' and o.name=file.path and s.sha256=(payload->>'sha256') and s.mime_type=file.mime and s.size_bytes=file.size and coalesce(o.is_delete_marker,false)=false) then raise exception 'Actueel scanbewijs ontbreekt.' using errcode='23514';end if;
  update private.product_files set sha256=(payload->>'sha256') where product_files.id=item_id;item_id:=file.entity_id;entity_kind:=file.entity_kind;
 else raise exception 'Onbekende productopdracht.' using errcode='23514';end if;
 result:=coalesce(result,jsonb_build_object('id',item_id));if fid is not null then result:=result||jsonb_build_object('fileId',fid);end if;
 insert into private.product_audit(entity_kind,entity_id,actor_id,action,detail) values(entity_kind,item_id,actor,command,case when admin then payload else jsonb_build_object('context',ctx) end);
 insert into private.product_receipts(actor_id,request_id,context,tenant_id,command,input_hash,result) values(actor,product_command.request_id,ctx,t,command,hash,result);
 return result;
end$$;

CREATE OR REPLACE FUNCTION private.notification_source_allowed(t uuid, code text, kind text, source uuid, revision text, recipient uuid, ctx text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare cr private.notification_campaign_recipients;c private.notification_campaigns;visit public.work_orders;event_kind text;
begin
 if kind='product' then return exists(select 1 from private.product_events e where e.id=source and e.type_code=code and revision=e.id::text) and private.product_event_allowed(source,t,ctx,recipient);
 elsif kind='domain' then return private.notification_domain_source_allowed(t,code,source,revision,recipient,ctx);
 elsif kind='campaign' then
  select * into cr from private.notification_campaign_recipients where id=source and tenant_id=t and user_id is not distinct from recipient and context=ctx;if not found then return false;end if;
  select * into c from private.notification_campaigns where id=cr.campaign_id;
  if c.state not in ('scheduled','processing','partial','completed') or c.expires_at<=now() or c.confirmed_revision::text is distinct from revision then return false;end if;
  return exists(select 1 from private.notification_candidates(c.tenant_id,c.context,c.sender_id,c.criteria) r where r.tenant_id=t and r.recipient_key=cr.recipient_key and r.context=ctx and r.user_id is not distinct from cr.user_id and r.contact_id is not distinct from cr.contact_id and r.source_context->>'email_hash' is not distinct from cr.source_context->>'email_hash');
 elsif kind='object' then
  if code in ('object.followup','object.access_expiring') and(not private.notification_object_due(t,source) or not exists(select 1 from public.object_reminder_recipients r where r.tenant_id=t and r.object_id=source and r.user_id=recipient and r.active)) then return false;end if;
  if code='object.access_expiring' and not exists(select 1 from private.object_secret_items si where si.tenant_id=t and si.object_id=source and si.active and si.valid_until<now()+interval '7 days') then return false;end if;
  event_kind:=split_part(revision,':',1);
  if code='object.instruction' then
   select w.* into visit from public.work_orders w join public.object_records r on r.tenant_id=w.tenant_id and r.object_id=w.object_id where w.tenant_id=t and w.object_id=source and w.id=nullif(split_part(revision,':',4),'')::uuid and r.id=nullif(split_part(revision,':',2),'')::uuid and r.kind='instruction' and r.state='active' and r.version::text=split_part(revision,':',3) and(r.work_order_id is null or r.work_order_id=w.id) and(r.service='' or r.service=w.discipline) and r.starts_at<=w.projected_end_at and(r.ends_at is null or r.ends_at>=w.projected_start_at);
  elsif code in ('object.request','object.request_decided') then
   if event_kind='accepted' then select w.* into visit from public.object_request_proposals p join public.object_visit_requests r on r.tenant_id=p.tenant_id and r.id=p.request_id join public.work_orders w on w.tenant_id=r.tenant_id and w.id=r.work_order_id where p.tenant_id=t and p.id=nullif(split_part(revision,':',2),'')::uuid and p.accepted_at is not null and r.object_id=source;
   elsif event_kind in ('request','request-version','review','withdrawn','executed') then select w.* into visit from public.object_visit_requests r join public.work_orders w on w.tenant_id=r.tenant_id and w.id=r.work_order_id where r.tenant_id=t and r.object_id=source and r.id=nullif(split_part(revision,':',2),'')::uuid and r.version::text=coalesce(nullif(split_part(revision,':',3),''),'1');end if;
  end if;
  if code in ('object.instruction','object.request','object.request_decided') and(visit.id is null or visit.archive_at is not null or visit.status='cancelled') then return false;end if;
  return private.notification_actor_active(t,ctx,recipient) and exists(select 1 from public.objects o where o.tenant_id=t and o.id=source and o.dossier_status<>'archived' and
   ((ctx='backoffice' and exists(select 1 from public.tenant_memberships m where m.tenant_id=t and m.user_id=recipient and m.status='active' and m.roles&&array['tenant_admin','management','planner']::public.app_role[]))
   or(ctx='staff' and exists(select 1 from public.work_order_assignments a join public.personnel p on p.id=a.personnel_id and p.tenant_id=a.tenant_id where a.tenant_id=t and a.work_order_id=visit.id and a.status in ('released','seen','travelling','in_progress') and p.user_id=recipient and p.status='active' and exists(select 1 from public.dispatches d where d.tenant_id=t and d.assignment_id=a.id and d.revoked_at is null)))
   or(ctx='customer' and exists(select 1 from public.object_customer_bindings b where b.tenant_id=t and b.object_id=source and b.user_id=recipient and b.active))));
 elsif kind='customer' then
  return ctx='backoffice' and private.notification_actor_active(t,ctx,recipient) and private.notification_customer_due(t,source,recipient);
 end if;
 return private.notification_operational_source_allowed(t,code,kind,source,revision,recipient,ctx);
end$function$;


-- Product inbox totals, previews and direct details use the live source boundary.
CREATE OR REPLACE FUNCTION public.notification_query(target_tenant uuid, actor_context text, operation text, payload jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
<<notification_query>>
declare actor uuid:=auth.uid();ctx text:=actor_context;p jsonb:=payload;a jsonb;items jsonb;pg integer;sz integer;result jsonb;rec public.notifications;c private.notification_campaigns;pref private.notification_preferences;code text;query_tenant uuid;
begin
 if not private.ticket_session_active(actor,nullif(auth.jwt()->>'session_id','')::uuid) or not private.notification_actor_active(target_tenant,ctx,actor) or jsonb_typeof(p) is distinct from 'object' or length(p::text)>60000 then raise exception 'Geen toegang' using errcode='42501';end if;
 a:=private.notification_access(target_tenant,ctx,actor);
 if operation='access' then return a||jsonb_build_object('timezone',coalesce((select timezone from public.tenants where id=target_tenant),'Europe/Amsterdam'));end if;
 pg:=greatest(1,coalesce((p->>'page')::integer,1));sz:=least(100,greatest(1,coalesce((p->>'page_size')::integer,25)));
 if operation in ('inbox','detail') then
  if not coalesce((a->'permissions'->>'read_own')::boolean,false) then raise exception 'Geen inboxrecht' using errcode='42501';end if;
  if operation='detail' then select * into rec from public.notifications where id=(p->>'notification_id')::uuid and tenant_id is not distinct from target_tenant and context=ctx and user_id=actor and channel='in_app';if not found or rec.source_kind='product' and not private.notification_source_allowed(rec.tenant_id,rec.type_code,rec.source_kind,rec.source_id,rec.source_revision,actor,ctx) then raise exception 'Bericht niet beschikbaar' using errcode='42501';end if;return private.notification_inbox_dto(rec,actor);end if;
  with own as(select n.*,coalesce(cat.category,'Algemeen') category,private.notification_inbox_dto(n,actor) dto from public.notifications n left join public.notification_catalog cat on cat.code=n.type_code where n.tenant_id is not distinct from target_tenant and n.context=ctx and n.user_id=actor and n.channel='in_app' and(n.source_kind is distinct from 'product' or private.notification_source_allowed(n.tenant_id,n.type_code,n.source_kind,n.source_id,n.source_revision,actor,ctx))),filtered as(select * from own where(case coalesce(p->>'view','all') when 'archived' then archived_at is not null when 'unread' then read_at is null and archived_at is null when 'action' then ack_required and acknowledged_at is null and archived_at is null else archived_at is null end) and(coalesce(p->>'category','')='' or category=p->>'category') and(coalesce(p->>'search','')='' or dto->>'title' ilike '%'||(p->>'search')||'%' or dto->>'body' ilike '%'||(p->>'search')||'%')),paged as(select id from filtered order by created_at desc,id desc limit sz offset(pg-1)*sz)
  select jsonb_build_object('items',(select coalesce(jsonb_agg(private.notification_inbox_dto(n,actor) order by n.created_at desc,n.id desc),'[]'::jsonb) from public.notifications n join paged using(id)),'total',(select count(*) from filtered),'unread_count',(select count(*) from own where read_at is null and archived_at is null),'page',pg,'page_size',sz,'categories',(select coalesce(jsonb_agg(jsonb_build_object('id',category,'label',category)),'[]'::jsonb) from(select distinct category from own)cat)) into result;return result;
 elsif operation in ('recipients','explain') then
  if not(a->'permissions' @> '{"send_staff":true}' or a->'permissions' @> '{"send_customers":true}' or a->'permissions' @> '{"send_platform":true}' or operation='explain' and(a->'permissions' @> '{"settings_manage":true}' or a->'permissions' @> '{"manage_global":true}' or a->'permissions' @> '{"manage_tenant":true}')) then raise exception 'Geen verzendrecht' using errcode='42501';end if;
  if operation='explain' and p->>'campaign_id' is not null then
   select * into c from private.notification_campaigns where id=(p->>'campaign_id')::uuid and tenant_id is not distinct from target_tenant and context=ctx;
   if not found or not private.notification_campaign_allowed(c,actor,'read') then raise exception 'Campagne niet beschikbaar' using errcode='42501';end if;
   p:=p||jsonb_build_object('criteria',c.criteria,'channels',c.channels,'type_code',case when ctx='platform' then 'manual.platform' else 'manual.tenant' end);
  end if;
  result:=private.notification_recipients(target_tenant,ctx,actor,p);
  if operation='recipients' then return result;end if;
  code:=coalesce(p->>'type_code',case when ctx='platform' then 'manual.platform' else 'manual.tenant' end);
  if not exists(select 1 from public.notification_catalog where notification_catalog.code=notification_query.code) then raise exception 'Onbekend notificatietype' using errcode='23514';end if;
  return jsonb_build_object('summary','Actuele ontvangers en kanaalregels. Voorbeelden bevatten fictieve gegevens; bevestig de selectie vóór verzending.','recipients',result,'channels',(select jsonb_agg(jsonb_build_object('channel',v)||private.notification_policy(target_tenant,notification_query.code,coalesce(p->>'target_context',cat.contexts[1]),v,null)) from public.notification_catalog cat cross join lateral unnest(cat.channels)v where cat.code=notification_query.code),
  'previews',(select jsonb_agg(jsonb_build_object('channel',v,'context',audience.context,'tenant_name',case when ctx='platform' then 'Fieldgrid' else coalesce((select name from public.tenants where id=audience.tenant_id),'Fieldgrid') end,'title',case when v='push' then replace(tmpl->>'title','{bedrijfsnaam}',coalesce(tmpl#>>'{branding,company}','Fieldgrid')) else coalesce(c.title,private.notification_preview_text(tmpl->>'title')) end,'body',case when v='push' then replace(tmpl->>'body','{bedrijfsnaam}',coalesce(tmpl#>>'{branding,company}','Fieldgrid')) else coalesce(c.body,private.notification_preview_text(tmpl->>'body')) end,'template_version',tmpl->'revision')) from public.notification_catalog cat cross join lateral unnest(cat.channels)v cross join lateral(select distinct (x->>'tenant_id')::uuid tenant_id,x->>'context' context from jsonb_array_elements(result->'recipients')x where c.id is not null union all select target_tenant,coalesce(p->>'target_context',cat.contexts[1]) where c.id is null)audience cross join lateral(select private.notification_template(case when ctx='platform' then null else audience.tenant_id end,notification_query.code,audience.context,v)tmpl)effective where cat.code=notification_query.code and(c.id is null or v=any(c.channels))),
  'warnings',case when exists(select 1 from public.notification_catalog where notification_catalog.code=notification_query.code and status<>'active') then jsonb_build_array('Dit type is nog niet actief; er vindt geen aflevering plaats.') else '[]'::jsonb end,'affected_tenants',(select count(distinct x->>'tenant_id') from jsonb_array_elements(result->'recipients')x));
 elsif operation in ('campaigns','campaign') then
  if not coalesce((a->'permissions'->>'sent_read')::boolean,false) then raise exception 'Geen toegang tot verzendhistorie' using errcode='42501';end if;
  if operation='campaign' then select * into c from private.notification_campaigns where id=coalesce(p->>'campaign_id',p->>'id')::uuid and tenant_id is not distinct from target_tenant and context=ctx;if not found or not private.notification_campaign_allowed(c,actor,'read') then raise exception 'Campagne niet beschikbaar' using errcode='42501';end if;return private.notification_campaign_dto(c,target_tenant,ctx,actor);end if;
  with filtered as(select * from private.notification_campaigns camp where camp.tenant_id is not distinct from target_tenant and camp.context=ctx and private.notification_campaign_allowed(camp,actor,'read') and(case when p->>'view'='scheduled' then camp.state in ('draft','scheduled','paused') else camp.state not in ('draft','scheduled','paused') end) and(coalesce(p->>'search','')='' or camp.title ilike '%'||(p->>'search')||'%')),paged as(select * from filtered order by created_at desc,id limit sz offset(pg-1)*sz)
  select jsonb_build_object('items',(select coalesce(jsonb_agg(private.notification_campaign_dto(paged,target_tenant,ctx,actor) order by created_at desc),'[]'::jsonb) from paged),'total',(select count(*) from filtered),'page',pg,'page_size',sz) into result;return result;
 elsif operation in ('catalog','rules') then
  if not(a->'permissions' @> '{"settings_manage":true}' or a->'permissions' @> '{"manage_global":true}' or a->'permissions' @> '{"manage_tenant":true}') then raise exception 'Geen instellingenrecht' using errcode='42501';end if;
  query_tenant:=case when ctx='platform' then nullif(p->>'tenant_id','')::uuid else target_tenant end;
  if ctx='platform' and query_tenant is not null and not private.notification_cap(query_tenant,actor,'platform.notifications.manage_tenant') then raise exception 'Geen tenantinstellingenrecht' using errcode='42501';end if;
  select coalesce(jsonb_agg(to_jsonb(cat)||jsonb_build_object('permissions',jsonb_build_object('edit',true,'explain',true)) order by cat.category,cat.name),'[]'::jsonb) into items from public.notification_catalog cat;
  select jsonb_build_object('rules',items,'impact',jsonb_build_object('active_tenant_count',case when query_tenant is not null then(select count(*) from public.tenants where id=query_tenant and status='active') when ctx='platform' and private.notification_cap(null,actor,'platform.notifications.manage_global') then(select count(*) from public.tenants where status='active') else null end,'global_active_tenant_count',case when ctx='platform' and private.notification_cap(null,actor,'platform.notifications.manage_global') then(select count(*) from public.tenants where status='active') else null end),'revision',(select revision from private.notification_state where singleton),'policies',(select coalesce(jsonb_agg(private.notification_policy_dto(x,query_tenant,ctx,actor)),'[]'::jsonb) from private.notification_policies x where(x.tenant_id is null or x.tenant_id=query_tenant)),'tenants',case when ctx='platform' then(select coalesce(jsonb_agg(jsonb_build_object('id',id,'label',name)),'[]'::jsonb) from public.tenants where status='active' and private.notification_cap(id,actor,'platform.notifications.manage_tenant')) else '[]'::jsonb end,'audit',(select coalesce(jsonb_agg(jsonb_build_object('id',x.id,'label',x.action,'created_at',x.created_at)),'[]'::jsonb) from(select id,action,created_at from private.notification_audit where tenant_id is not distinct from query_tenant and action in ('policy_save','template_save','template_publish','template_reset') order by created_at desc limit 100)x)) into result;
  if not exists(select 1 from private.notification_policies where tenant_id is not distinct from query_tenant and scope=case when ctx='platform' then 'platform' else 'tenant' end and context is null and type_code is null and channel is null) then result:=jsonb_set(result,'{policies}',(result->'policies')||jsonb_build_array(private.notification_policy_dto(jsonb_populate_record(null::private.notification_policies,jsonb_build_object('id',null,'scope',case when ctx='platform' then 'platform' else 'tenant' end,'tenant_id',query_tenant,'mode','inherit','revision',0,'settings','{}'::jsonb)),query_tenant,ctx,actor)));end if;return result;
 elsif operation in ('templates','template') then
  if not(a->'permissions' @> '{"templates_manage":true}' or a->'permissions' @> '{"templates_override":true}') then raise exception 'Geen templaterecht' using errcode='42501';end if;
  if operation='template' then result:=private.notification_template_dto(target_tenant,ctx,actor,(p->>'id')::uuid);if result is null then raise exception 'Template niet beschikbaar' using errcode='42501';end if;return result;end if;
  select coalesce(jsonb_agg(private.notification_template_dto(target_tenant,ctx,actor,id) order by type_code,context,channel),'[]'::jsonb) into items from(select distinct on(type_code,context,channel) * from private.notification_templates where (ctx='platform' and tenant_id is null) or(ctx<>'platform' and(tenant_id is null or tenant_id=target_tenant)) order by type_code,context,channel,tenant_id nulls last)x;
  return jsonb_build_object('items',items);
 elsif operation='preferences' then
  select * into pref from private.notification_preferences where tenant_id is not distinct from target_tenant and user_id=actor and context=ctx and type_code is null;
  return jsonb_build_object('revision',coalesce(pref.revision,0),'email',coalesce(pref.email,true),'push',coalesce(pref.push,true),'quiet_enabled',pref.quiet_start is not null,'quiet_start',pref.quiet_start,'quiet_end',pref.quiet_end,'timezone',coalesce(pref.timezone,(select timezone from public.tenants where id=target_tenant),'Europe/Amsterdam'),'types',(select coalesce(jsonb_agg(jsonb_build_object('code',cat.code,'name',cat.name,'channels',cat.channels,'email',coalesce(pf.email,true),'push',coalesce(pf.push,true),'reason',private.notification_policy(target_tenant,cat.code,ctx,'email',actor)->>'reason')),'[]'::jsonb) from public.notification_catalog cat left join private.notification_preferences pf on pf.tenant_id is not distinct from target_tenant and pf.context=ctx and pf.user_id=actor and pf.type_code=cat.code where ctx=any(cat.contexts)));
 elsif operation='permissions' then return private.notification_permissions_query(target_tenant,ctx,actor,p);
 elsif operation in ('deliveries','devices') then
  if operation='deliveries' and not coalesce((a->'permissions'->>'delivery_read')::boolean,false) then raise exception 'Geen afleverrecht' using errcode='42501';end if;
  return private.notification_delivery_query(target_tenant,ctx,actor,operation,p);
 end if;
 raise exception 'Onbekende notificatievraag' using errcode='23514';
end$function$;

revoke all on function public.product_query(uuid,text,text,jsonb),public.product_command(uuid,text,text,jsonb,uuid) from public,anon,service_role;
grant execute on function public.product_query(uuid,text,text,jsonb),public.product_command(uuid,text,text,jsonb,uuid) to authenticated;
do $$declare f record;begin for f in select oid::regprocedure signature from pg_proc where pronamespace='private'::regnamespace and left(proname,8)='product_' loop execute format('revoke all on function %s from public,anon,authenticated,service_role',f.signature);end loop;end$$;
commit;
