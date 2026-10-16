-- Decisions and compliance extend the current tenant dossiers, source rights,
-- private scanned files and shared follow-up. Nothing is persisted in a browser.
insert into public.permission_catalog(key,domain,name,description,module,action,scopes,dependencies)
select 'backoffice.'||m.code||'.'||a.code,'tenant',m.label||case a.code when 'read' then ' bekijken' else ' beheren' end,
 'Managementregister met actuele bronrechten, classificatie en versiehistorie.',m.code,a.code,array['tenant'],
 array['backoffice.access','backoffice.followup.read','backoffice.functions.cockpit_followup']||case a.code when 'write' then array['backoffice.'||m.code||'.read','backoffice.followup.write','backoffice.functions.cockpit_followup_command'] else '{}'::text[] end
from(values('decisions','Beslisnotities'),('compliance','Documenten en compliance'))m(code,label) cross join(values('read'),('write'))a(code) on conflict(key) do nothing;
insert into private.management_role_permissions(tenant_id,role_id,capability)
select r.tenant_id,r.id,c.key from private.management_roles r join public.permission_catalog c on c.module in('decisions','compliance')
where r.code='owner' or(r.code='management' and exists(select 1 from private.management_role_permissions p where p.role_id=r.id and p.capability='backoffice.followup.'||c.action)) on conflict do nothing;

create table private.cockpit_decisions(
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null references public.tenants(id),
 title text not null check(length(btrim(title)) between 2 and 180),reason text not null check(length(btrim(reason)) between 3 and 10000),motivation text not null check(length(btrim(motivation)) between 3 and 15000),
 source_kind text not null,source_id uuid not null,scope text not null check(scope in('general','finance','personnel')),owner_id uuid not null references auth.users(id),
 state text not null default 'draft' check(state in('draft','final')),version integer not null default 1,revision bigint not null default 1,
 wants_followup boolean not null default false,followup_action_id uuid references private.cockpit_actions(id),created_by uuid not null references auth.users(id),
 created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp(),unique(tenant_id,id)
);
create table private.cockpit_decision_versions(
 tenant_id uuid not null references public.tenants(id),decision_id uuid not null references private.cockpit_decisions(id),version integer not null,
 snapshot jsonb not null,scope text not null,source_kind text not null,source_id uuid not null,actor_id uuid not null references auth.users(id),created_at timestamptz not null default clock_timestamp(),primary key(decision_id,version)
);
create table private.cockpit_requirements(
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null references public.tenants(id),title text not null check(length(btrim(title)) between 2 and 180),
 subject text not null check(length(btrim(subject)) between 2 and 300),source_kind text not null,source_id uuid not null,owner_id uuid references auth.users(id),
 followup_action_id uuid references private.cockpit_actions(id),checked_at timestamptz,
 expires_on date,evidence_id uuid references public.dossier_documents(id),approved_fingerprint text,approved_at timestamptz,approved_by uuid references auth.users(id),
 revision bigint not null default 1,created_by uuid not null references auth.users(id),created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp(),unique(tenant_id,id)
);
create table private.cockpit_requirement_versions(
 tenant_id uuid not null references public.tenants(id),requirement_id uuid not null references private.cockpit_requirements(id),revision bigint not null,
 snapshot jsonb not null,actor_id uuid not null references auth.users(id),event text not null,created_at timestamptz not null default clock_timestamp(),primary key(requirement_id,revision)
);
do $$declare n text;begin foreach n in array array['cockpit_decisions','cockpit_decision_versions','cockpit_requirements','cockpit_requirement_versions'] loop
 execute format('alter table private.%I enable row level security',n);execute format('alter table private.%I force row level security',n);execute format('revoke all on private.%I from public,anon,authenticated,service_role',n);end loop;end$$;
create index cockpit_decisions_tenant on private.cockpit_decisions(tenant_id,updated_at desc,id);
create index cockpit_requirements_expiry on private.cockpit_requirements(tenant_id,expires_on,id);
create function private.cockpit_governance_assert(t uuid,module text,writing boolean default false) returns void language plpgsql stable security definer set search_path='' as $$
begin
 if module is null or module not in('decisions','compliance') then raise exception 'Onbekend managementregister.' using errcode='22023';end if;
 perform private.cockpit_assert(t,'backoffice.'||module||'.read');
 perform private.cockpit_assert(t,'backoffice.functions.cockpit_followup');
 if writing then perform private.cockpit_assert(t,'backoffice.'||module||'.write');end if;
 if module='compliance' and not private.cockpit_scope(t,'quality') then raise exception 'Geen toegang tot kwaliteitsbeheer.' using errcode='42501';end if;
end$$;
create function private.cockpit_decision_visible(d private.cockpit_decisions) returns boolean language sql stable security definer set search_path='' as $$
 select private.cockpit_access(d.tenant_id,'backoffice.decisions.read') and private.cockpit_scope(d.tenant_id,d.scope) and private.cockpit_source(d.tenant_id,d.source_kind,d.source_id)
$$;
create function private.cockpit_requirement_visible(r private.cockpit_requirements) returns boolean language sql stable security definer set search_path='' as $$
 select private.cockpit_access(r.tenant_id,'backoffice.compliance.read') and private.cockpit_scope(r.tenant_id,'quality') and private.cockpit_source(r.tenant_id,r.source_kind,r.source_id)
 and(r.source_kind<>'personnel' or private.cockpit_scope(r.tenant_id,'personnel'))
$$;
-- File identifiers are resolved through their real dossier binding, restrictive
-- document permissions and a current scanner receipt. There is no caller-
-- supplied "clean" flag or externally supplied download/storage URL.
create function private.cockpit_evidence_identity(t uuid,kind text,parent uuid,evidence uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare d public.dossier_documents;label text;path text;bucket text;obj storage.objects;begin
 select * into d from public.dossier_documents where tenant_id=t and id=evidence;if not found then return null;end if;
 if d.source_kind='customer' and((kind='customer' and d.customer_id=parent) or kind='tenant' or(kind='agreement' and exists(select 1 from public.customer_agreements where tenant_id=t and id=parent and customer_id=d.customer_id))) then
  select file_name,storage_path into label,path from public.customer_documents where tenant_id=t and id=d.source_id;bucket:='customer-documents';
 elsif d.source_kind='object' and((kind='object' and d.object_id=parent) or(kind='customer' and d.customer_id=parent) or kind='tenant') then
  select file_name,storage_path into label,path from public.object_documents where tenant_id=t and id=d.source_id;bucket:='object-documents';
 elsif d.source_kind='personnel' and kind='personnel' and d.personnel_id=parent then
  select file_name,storage_path into label,path from public.personnel_documents where tenant_id=t and id=d.source_id and dossier_status not in('archived','withdrawn');bucket:='personnel-documents';
 end if;
 if path is null then return null;end if;
 select * into obj from storage.objects where bucket_id=bucket and name=path;
 if not found or coalesce(obj.is_delete_marker,false) or not private.file_is_scanned(obj.id,obj.version) or coalesce((obj.metadata->>'size')::bigint,0)<=0 then return null;end if;
 return jsonb_build_object('id',d.id,'name',label,'href','/api/files/dossier-document/'||d.id::text,'fingerprint',obj.id::text||':'||obj.version,'classification',d.classification);
end$$;
create function private.cockpit_evidence(t uuid,kind text,parent uuid,evidence uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare d public.dossier_documents;allowed boolean:=false;begin
 if evidence is null or not private.cockpit_source(t,kind,parent) then return null;end if;
 select * into d from public.dossier_documents where tenant_id=t and id=evidence;
 if not found then return null;end if;
 if d.source_kind='customer' then
  allowed:=private.commercial_access(t) and private.management_table_allowed(t,'customer_documents',false)
   and((kind='customer' and d.customer_id=parent) or(kind='agreement' and exists(select 1 from public.customer_agreements where tenant_id=t and id=parent and customer_id=d.customer_id)) or kind='tenant');
 elsif d.source_kind='object' then
  allowed:=private.object_manage(t) and private.management_table_allowed(t,'object_documents',false) and private.management_allowed(t,'backoffice.functions.get_object_document')
   and((kind='object' and d.object_id=parent) or(kind='customer' and d.customer_id=parent) or kind='tenant')
   and exists(select 1 from public.object_documents where tenant_id=t and id=d.source_id and(category<>'security' or private.management_allowed(t,'backoffice.objects.secrets.read')));
 elsif d.source_kind='personnel' then
  allowed:=kind='personnel' and d.personnel_id=parent and private.cockpit_scope(t,'personnel') and private.can_access_personnel(t,parent,true)
   and private.management_table_allowed(t,'personnel_documents',false) and private.management_allowed(t,'backoffice.functions.personnel_document_file');
 end if;
 if not coalesce(allowed,false) then return null;end if;
 return private.cockpit_evidence_identity(t,kind,parent,evidence);
end$$;
create function private.cockpit_requirement_status(r private.cockpit_requirements) returns text language plpgsql stable security definer set search_path='' as $$
declare e jsonb;today date:=(now() at time zone(select timezone from public.tenants where id=r.tenant_id))::date;begin
 e:=private.cockpit_evidence(r.tenant_id,r.source_kind,r.source_id,r.evidence_id);
 return case when e is null then 'Ontbreekt' when r.approved_fingerprint is distinct from e->>'fingerprint' or r.expires_on<today or r.owner_id is null or not private.cockpit_owner(r.tenant_id,r.owner_id) then 'Herbeoordeling' when r.expires_on<=today+30 then 'Verloopt binnenkort' else 'Geldig' end;
end$$;
-- Automated signals use a pure internal measurement, never an impersonated
-- tenant JWT. Its only service exposure is a bounded maintenance count.
alter table private.cockpit_events alter column actor_id drop not null;
alter table private.cockpit_actions alter column created_by drop not null;
create function private.cockpit_requirement_measure(r private.cockpit_requirements) returns text language plpgsql stable security definer set search_path='' as $$
declare e jsonb;today date:=(now() at time zone(select timezone from public.tenants where id=r.tenant_id))::date;begin
 e:=private.cockpit_evidence_identity(r.tenant_id,r.source_kind,r.source_id,r.evidence_id);
 return case when e is null then 'Ontbreekt' when r.approved_fingerprint is distinct from e->>'fingerprint' or r.expires_on<today or r.owner_id is null or not private.cockpit_owner(r.tenant_id,r.owner_id) then 'Herbeoordeling' when r.expires_on<=today+30 then 'Verloopt binnenkort' else 'Geldig' end;
end$$;
create or replace function private.cockpit_action_visible(a private.cockpit_actions) returns boolean language sql stable security definer set search_path='' as $$
 select private.cockpit_access(a.tenant_id,'backoffice.followup.read') and private.cockpit_scope(a.tenant_id,a.scope) and private.cockpit_source(a.tenant_id,a.source_kind,a.source_id)
 and(case when a.trigger_key like 'decision:%' then exists(select 1 from private.cockpit_decisions d where d.tenant_id=a.tenant_id and d.id=split_part(a.trigger_key,':',2)::uuid and private.cockpit_decision_visible(d))
 when a.trigger_key like 'requirement:%' then exists(select 1 from private.cockpit_requirements r where r.tenant_id=a.tenant_id and r.id=split_part(a.trigger_key,':',2)::uuid and private.cockpit_requirement_visible(r)) else true end)
$$;
create function private.cockpit_action_can_write(a private.cockpit_actions) returns boolean language sql stable security definer set search_path='' as $$
 select private.cockpit_action_visible(a) and private.cockpit_access(a.tenant_id,'backoffice.followup.write') and private.cockpit_access(a.tenant_id,'backoffice.functions.cockpit_followup_command')
 and(a.trigger_key not like 'requirement:%' or a.trigger_key is null or private.cockpit_access(a.tenant_id,'backoffice.compliance.write'))
$$;
create function private.cockpit_requirement_action_owner() returns trigger language plpgsql security definer set search_path='' as $$
declare r private.cockpit_requirements;begin
 if new.automatic and new.trigger_key like 'requirement:%' and new.owner_id is distinct from old.owner_id then
  if auth.jwt()->>'role' is distinct from 'service_role' and not private.cockpit_action_can_write(old) then raise exception 'Geen wijzigingsrecht bij de compliance-eis.' using errcode='42501';end if;
  update private.cockpit_requirements set owner_id=new.owner_id,revision=revision+1,updated_at=clock_timestamp() where tenant_id=new.tenant_id and id=split_part(new.trigger_key,':',2)::uuid and owner_id is distinct from new.owner_id returning * into r;
  if r.id is not null then insert into private.cockpit_requirement_versions(tenant_id,requirement_id,revision,snapshot,actor_id,event) values(r.tenant_id,r.id,r.revision,to_jsonb(r),auth.uid(),'owner_assigned');end if;
 end if;return new;
end$$;
create trigger cockpit_requirement_action_owner after update of owner_id on private.cockpit_actions for each row execute function private.cockpit_requirement_action_owner();
create function private.cockpit_requirement_sync(r private.cockpit_requirements,actor uuid default null,sync_owner boolean default false) returns void language plpgsql security definer set search_path='' as $$
declare a private.cockpit_actions;status text:=private.cockpit_requirement_measure(r);version bigint;event text;today date:=(now() at time zone(select timezone from public.tenants where id=r.tenant_id))::date;begin
 select * into a from private.cockpit_actions where tenant_id=r.tenant_id and id=r.followup_action_id for update;
 if status<>'Geldig' and(a.id is null or a.state='done') then
  insert into private.cockpit_actions(tenant_id,source_kind,source_id,title,scope,due_on,original_due_on,owner_id,automatic,trigger_key,created_by)
  values(r.tenant_id,r.source_kind,r.source_id,'Bewijs controleren: '||left(r.title,160),case when r.source_kind='personnel' then 'personnel' else 'quality' end,coalesce(r.expires_on,today),coalesce(r.expires_on,today),r.owner_id,true,'requirement:'||r.id||':'||r.revision,actor)
  on conflict(tenant_id,source_kind,source_id,trigger_key) do nothing returning * into a;
  if a.id is not null then update private.cockpit_requirements set followup_action_id=a.id where id=r.id;event:='create';version:=a.revision;end if;
 elsif status='Geldig' and a.id is not null and a.state<>'done' then
  update private.cockpit_actions set state='done',snoozed_until=null,revision=revision+1,updated_at=clock_timestamp() where id=a.id returning revision into version;event:='complete';
 end if;
 if event is not null then insert into private.cockpit_events(tenant_id,record_kind,record_id,actor_id,event,revision,details) values(r.tenant_id,'action:manual',a.id,actor,event,version,jsonb_build_object('requirementId',r.id,'note',case event when 'complete' then 'Actueel bewijs is beoordeeld en geldig.' else 'Bewijs vraagt aandacht: '||status end));end if;
 if sync_owner and a.id is not null and a.owner_id is distinct from r.owner_id then update private.cockpit_actions set owner_id=r.owner_id,revision=revision+1,updated_at=clock_timestamp() where id=a.id returning revision into version;insert into private.cockpit_events(tenant_id,record_kind,record_id,actor_id,event,revision,details) values(r.tenant_id,'action:manual',a.id,actor,'assign',version,jsonb_build_object('owner',r.owner_id,'note','Verantwoordelijke bijgewerkt vanuit de compliance-eis'));end if;
 update private.cockpit_requirements set checked_at=clock_timestamp() where id=r.id;
end$$;
create function private.cockpit_requirement_action_guard() returns trigger language plpgsql security definer set search_path='' as $$
declare r private.cockpit_requirements;begin
 if new.automatic and new.trigger_key like 'requirement:%' and auth.jwt()->>'role' is distinct from 'service_role' and not private.cockpit_action_can_write(old) then raise exception 'Geen wijzigingsrecht bij de compliance-eis.' using errcode='42501';end if;
 if new.automatic and new.trigger_key like 'requirement:%' and new.state='done' and old.state<>'done' then
  select * into r from private.cockpit_requirements where tenant_id=new.tenant_id and followup_action_id=new.id;
  if r.id is null or private.cockpit_requirement_measure(r)<>'Geldig' then raise exception 'Beoordeel het geldige bewijs bij de compliance-eis voordat dit signaal kan worden afgerond.' using errcode='23514';end if;
 end if;return new;
end$$;
create trigger cockpit_requirement_action_guard before update on private.cockpit_actions for each row execute function private.cockpit_requirement_action_guard();
create function public.cockpit_maintenance(batch_size integer default 50) returns integer language plpgsql security definer set search_path='' as $$
declare r private.cockpit_requirements;n integer:=0;begin
 if auth.jwt()->>'role' is distinct from 'service_role' then raise exception 'Service required.' using errcode='42501';end if;
 for r in select q.* from private.cockpit_requirements q join public.tenants t on t.id=q.tenant_id and t.status='active' order by q.checked_at nulls first,q.id for update of q skip locked limit least(greatest(batch_size,1),100) loop
  perform private.cockpit_requirement_sync(r);n:=n+1;
 end loop;return n;
end$$;
create function private.cockpit_decision_dto(d private.cockpit_decisions,detail boolean default false,history_page integer default 1) returns jsonb language sql stable security definer set search_path='' as $$
 select to_jsonb(d)||jsonb_build_object('followup',(select jsonb_build_object('id',a.id,'state',a.state,'revision',a.revision,'canModify',private.cockpit_access(d.tenant_id,'backoffice.followup.write') and private.cockpit_access(d.tenant_id,'backoffice.functions.cockpit_followup_command')) from private.cockpit_actions a where a.id=d.followup_action_id and private.cockpit_action_visible(a)),
 'versions',case when detail then(select coalesce(jsonb_agg(jsonb_build_object('version',v.version,'snapshot',v.snapshot,'createdAt',v.created_at) order by v.version desc),'[]') from(select * from private.cockpit_decision_versions v where v.decision_id=d.id and private.cockpit_scope(d.tenant_id,v.scope) and private.cockpit_source(d.tenant_id,v.source_kind,v.source_id) order by version desc limit 20 offset(history_page-1)*20)v) else '[]'::jsonb end,
 'versionTotal',(select count(*) from private.cockpit_decision_versions v where v.decision_id=d.id and private.cockpit_scope(d.tenant_id,v.scope) and private.cockpit_source(d.tenant_id,v.source_kind,v.source_id)),
 'history',case when detail then(select coalesce(jsonb_agg(jsonb_build_object('event',e.event,'details',e.details,'createdAt',e.created_at) order by e.created_at desc,e.id),'[]') from(select * from private.cockpit_events e where e.tenant_id=d.tenant_id and e.record_kind='decision' and e.record_id=d.id order by e.created_at desc,e.id limit 100)e) else '[]'::jsonb end)
$$;
create function private.cockpit_requirement_dto(r private.cockpit_requirements,detail boolean default false,history_page integer default 1) returns jsonb language sql stable security definer set search_path='' as $$
 with versions as materialized(select * from private.cockpit_requirement_versions v where v.requirement_id=r.id and private.cockpit_source(r.tenant_id,v.snapshot->>'source_kind',(v.snapshot->>'source_id')::uuid)
 and(v.snapshot->>'evidence_id' is null or private.cockpit_evidence(r.tenant_id,v.snapshot->>'source_kind',(v.snapshot->>'source_id')::uuid,(v.snapshot->>'evidence_id')::uuid) is not null))
 select to_jsonb(r)||jsonb_build_object('status',private.cockpit_requirement_status(r),'evidence',private.cockpit_evidence(r.tenant_id,r.source_kind,r.source_id,r.evidence_id),
 'history',case when detail then(select coalesce(jsonb_agg(jsonb_build_object('event',v.event,'snapshot',v.snapshot,'createdAt',v.created_at) order by v.revision desc),'[]') from(select * from versions order by revision desc limit 20 offset(history_page-1)*20)v) else '[]'::jsonb end,'versionTotal',(select count(*) from versions))
$$;
create function public.cockpit_governance_query(target_tenant uuid,module text,payload jsonb default '{}') returns jsonb language plpgsql stable security definer set search_path='' as $$
<<cockpit_governance_query>>
declare rows jsonb;selected jsonb;counts jsonb;total bigint;pg integer:=coalesce((payload->>'page')::integer,1);sz integer:=coalesce((payload->>'pageSize')::integer,20);history_page integer:=coalesce((payload->>'historyPage')::integer,1);
 q text:=lower(btrim(coalesce(payload->>'search','')));selection text:=coalesce(payload->>'filter','all');record uuid:=nullif(payload->>'record','')::uuid;begin
 perform private.cockpit_governance_assert(target_tenant,module);
 if jsonb_typeof(payload) is distinct from 'object' or exists(select 1 from jsonb_object_keys(payload)k where k not in('page','pageSize','historyPage','search','filter','record')) or pg not between 1 and 100000 or sz not between 5 and 100 or history_page not between 1 and 100000 or length(q)>160 or selection not in('all','drafts','final','attention','valid') then raise exception 'Ongeldige lijstselectie.' using errcode='22023';end if;
 if module='decisions' then
  with allowed as materialized(select d.* from private.cockpit_decisions d where d.tenant_id=target_tenant and private.cockpit_decision_visible(d)),
  filtered as materialized(select * from allowed d where(selection='all' or(selection='drafts' and d.state='draft') or(selection='final' and d.state='final')) and(q='' or lower(d.title||' '||d.reason||' '||d.source_id::text) like '%'||q||'%'))
  select count(*),jsonb_build_object('all',(select count(*) from allowed),'drafts',(select count(*) from allowed where state='draft'),'final',(select count(*) from allowed where state='final'),'followup',(select count(*) from allowed where state='final' and followup_action_id is not null)) into total,counts from filtered;
  pg:=least(pg,greatest(1,ceil(total::numeric/sz)::integer));
  select coalesce(jsonb_agg(private.cockpit_decision_dto(d) order by d.updated_at desc,d.id),'[]') into rows from(select d.* from private.cockpit_decisions d where d.tenant_id=target_tenant and private.cockpit_decision_visible(d) and(selection='all' or(selection='drafts' and d.state='draft') or(selection='final' and d.state='final')) and(q='' or lower(d.title||' '||d.reason||' '||d.source_id::text) like '%'||q||'%') order by d.updated_at desc,d.id limit sz offset(pg-1)*sz)d;
  if record is not null then select private.cockpit_decision_dto(d,true,history_page) into selected from private.cockpit_decisions d where d.tenant_id=target_tenant and d.id=record and private.cockpit_decision_visible(d);end if;
 else
  with allowed as materialized(select r.*,private.cockpit_requirement_status(r) status from private.cockpit_requirements r where r.tenant_id=target_tenant and private.cockpit_requirement_visible(r)),
  filtered as materialized(select * from allowed r where(selection='all' or(selection='attention' and r.status<>'Geldig') or(selection='valid' and r.status='Geldig')) and(q='' or lower(r.title||' '||r.subject||' '||r.source_id::text) like '%'||q||'%'))
  select count(*),jsonb_build_object('all',(select count(*) from allowed),'attention',(select count(*) from allowed where status<>'Geldig'),'valid',(select count(*) from allowed where status='Geldig'),'missing',(select count(*) from allowed where status='Ontbreekt'),'expiring',(select count(*) from allowed where status in('Verloopt binnenkort','Herbeoordeling'))) into total,counts from filtered;
  pg:=least(pg,greatest(1,ceil(total::numeric/sz)::integer));
  select coalesce(jsonb_agg(private.cockpit_requirement_dto(r) order by r.expires_on,r.id),'[]') into rows from(select r.* from private.cockpit_requirements r where r.tenant_id=target_tenant and private.cockpit_requirement_visible(r) and(selection='all' or(selection='attention' and private.cockpit_requirement_status(r)<>'Geldig') or(selection='valid' and private.cockpit_requirement_status(r)='Geldig')) and(q='' or lower(r.title||' '||r.subject||' '||r.source_id::text) like '%'||q||'%') order by r.expires_on,r.id limit sz offset(pg-1)*sz)r;
  if record is not null then select private.cockpit_requirement_dto(r,true,history_page) into selected from private.cockpit_requirements r where r.tenant_id=target_tenant and r.id=record and private.cockpit_requirement_visible(r);end if;
 end if;
 return jsonb_build_object('rows',rows,'selected',selected,'counts',counts,'total',total,'page',pg,'pageSize',sz,'historyPage',history_page,'canWrite',private.cockpit_access(target_tenant,'backoffice.'||module||'.write'),'scopes',to_jsonb(array(select s from unnest(array['general','finance','personnel'])s where private.cockpit_scope(target_tenant,s))),'today',(now() at time zone(select timezone from public.tenants where id=target_tenant))::date);
end$$;

create function private.cockpit_can_upload(t uuid,kind text,source uuid) returns boolean language sql stable security definer set search_path='' as $$
 select coalesce(private.cockpit_access(t,'backoffice.compliance.write') and private.cockpit_source(t,kind,source,true) and
 case kind when 'object' then private.management_table_allowed(t,'object_documents',true) and private.management_allowed(t,'backoffice.functions.get_object_document')
 when 'customer' then private.management_table_allowed(t,'customer_documents',true)
 when 'personnel' then private.cockpit_scope(t,'personnel') and private.management_table_allowed(t,'personnel_documents',true) and private.management_allowed(t,'backoffice.functions.personnel_document_file') else false end,false)
$$;
create function public.cockpit_evidence_options(target_tenant uuid,source_kind text,source_id uuid,search text default '') returns jsonb language plpgsql stable security definer set search_path='' as $$
declare rows jsonb;n bigint;begin
 perform private.cockpit_governance_assert(target_tenant,'compliance');
 if not private.cockpit_source(target_tenant,source_kind,source_id) or length(coalesce(search,''))>160 then raise exception 'Geen toegankelijk dossier.' using errcode='42501';end if;
 with choices as materialized(select private.cockpit_evidence(target_tenant,cockpit_evidence_options.source_kind,cockpit_evidence_options.source_id,d.id) item from public.dossier_documents d where d.tenant_id=target_tenant),
 visible as materialized(select item from choices where item is not null and(coalesce(search,'')='' or position(lower(search) in lower(item->>'name'))>0))
 select coalesce((select jsonb_agg(item order by item->>'name',item->>'id') from(select item from visible order by item->>'name',item->>'id' limit 50)page),'[]'),(select count(*) from visible) into rows,n;
 return jsonb_build_object('rows',rows,'total',n,'canUpload',private.cockpit_can_upload(target_tenant,source_kind,source_id));
end$$;
create function public.cockpit_governance_upload_allowed(target_tenant uuid,source_kind text,source_id uuid) returns boolean language plpgsql stable security definer set search_path='' as $$
begin
 perform private.cockpit_governance_assert(target_tenant,'compliance',true);
 if not private.cockpit_can_upload(target_tenant,source_kind,source_id) then raise exception 'Geen uploadrecht bij dit dossier.' using errcode='42501';end if;
 return true;
end$$;
create function public.cockpit_governance_command(target_tenant uuid,module text,command text,input jsonb,request_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
<<cockpit_governance_command>>
declare d private.cockpit_decisions;r private.cockpit_requirements;receipt private.cockpit_receipts;fingerprint text;result jsonb;actor uuid:=auth.uid();record uuid:=nullif(input->>'id','')::uuid;owner uuid:=nullif(input->>'owner','')::uuid;evidence jsonb;event text;begin
 perform private.cockpit_governance_assert(target_tenant,module,true);
 if request_id is null or jsonb_typeof(input) is distinct from 'object' or octet_length(input::text)>40000 or command is null then raise exception 'Ongeldige opdracht.' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended('cockpit-command:'||target_tenant::text||actor::text||request_id::text,0));
 perform private.cockpit_governance_assert(target_tenant,module,true);
 fingerprint:=encode(extensions.digest(module||command||input::text,'sha256'),'hex');
 if module='decisions' then select * into d from private.cockpit_decisions where tenant_id=target_tenant and id=record;
  if d.id is not null and not private.cockpit_decision_visible(d) then raise exception 'Geen toegang tot de huidige besluitbron.' using errcode='42501';end if;
 else select * into r from private.cockpit_requirements where tenant_id=target_tenant and id=record;
  if r.id is not null and not private.cockpit_requirement_visible(r) then raise exception 'Geen toegang tot de huidige bewijsbron.' using errcode='42501';end if;
 end if;
 select * into receipt from private.cockpit_receipts c where c.tenant_id=target_tenant and c.actor_id=actor and c.request_id=cockpit_governance_command.request_id;
 if found then if receipt.fingerprint<>fingerprint then raise exception 'De herhaalsleutel hoort bij andere invoer.' using errcode='23514';end if;return receipt.result;end if;
 if record is null or not private.cockpit_owner(target_tenant,owner) then raise exception 'Kies een geldige registratie en verantwoordelijke.' using errcode='22023';end if;
 if module='decisions' then
  if command not in('save','publish','revise') or exists(select 1 from jsonb_object_keys(input)k where k not in('id','revision','title','reason','motivation','scope','owner','sourceKind','sourceId','followup','due')) then raise exception 'Ongeldige beslisnotitie.' using errcode='22023';end if;
  select * into d from private.cockpit_decisions where tenant_id=target_tenant and id=record for update;
  perform private.cockpit_governance_assert(target_tenant,module,true);
  if d.id is not null and(not private.cockpit_decision_visible(d) or d.revision is distinct from (input->>'revision')::bigint) then raise exception 'De notitie is niet beschikbaar of intussen gewijzigd.' using errcode='40001';end if;
  if command='revise' then
   if d.id is null or d.state<>'final' then raise exception 'Alleen een vastgesteld besluit kan worden herzien.' using errcode='23514';end if;
   update private.cockpit_decisions set state='draft',version=version+1,revision=revision+1,updated_at=clock_timestamp() where id=record returning * into d;event:='revised';
  else
   if d.id is not null and d.state<>'draft' then raise exception 'Maak eerst een nieuwe revisie; een vastgesteld besluit blijft bewaard.' using errcode='23514';end if;
   if owner is null or not private.cockpit_source(target_tenant,input->>'sourceKind',(input->>'sourceId')::uuid) or not private.cockpit_scope(target_tenant,input->>'scope') or(input->>'sourceKind'='personnel' and input->>'scope'<>'personnel') then raise exception 'Kies een toegankelijke bron, classificatie en verantwoordelijke.' using errcode='42501';end if;
   if d.id is null then insert into private.cockpit_decisions(id,tenant_id,title,reason,motivation,scope,owner_id,source_kind,source_id,wants_followup,created_by) values(record,target_tenant,btrim(input->>'title'),btrim(input->>'reason'),btrim(input->>'motivation'),input->>'scope',owner,input->>'sourceKind',(input->>'sourceId')::uuid,coalesce((input->>'followup')::boolean,false),actor) returning * into d;
   else update private.cockpit_decisions set title=btrim(input->>'title'),reason=btrim(input->>'reason'),motivation=btrim(input->>'motivation'),scope=input->>'scope',owner_id=owner,source_kind=input->>'sourceKind',source_id=(input->>'sourceId')::uuid,wants_followup=coalesce((input->>'followup')::boolean,false),revision=revision+1,updated_at=clock_timestamp() where id=record returning * into d;end if;
   event:='saved';
   if command='publish' then
    if d.wants_followup and d.followup_action_id is null then
     if not private.cockpit_access(target_tenant,'backoffice.followup.write') or not private.cockpit_access(target_tenant,'backoffice.functions.cockpit_followup_command') or nullif(input->>'due','') is null then raise exception 'Een vervolgactie vereist wijzigingsrecht en een deadline.' using errcode='42501';end if;
     insert into private.cockpit_actions(tenant_id,source_kind,source_id,title,scope,due_on,original_due_on,owner_id,trigger_key,created_by)
     values(target_tenant,d.source_kind,d.source_id,'Besluit opvolgen: '||left(d.title,160),d.scope,(input->>'due')::date,(input->>'due')::date,owner,'decision:'||d.id,actor) returning id into d.followup_action_id;
     insert into private.cockpit_events(tenant_id,record_kind,record_id,actor_id,event,revision,details) values(target_tenant,'action:manual',d.followup_action_id,actor,'create',1,jsonb_build_object('decisionId',d.id,'note','Vervolgactie bij vastgesteld besluit'));
    end if;
    update private.cockpit_decisions set state='final',followup_action_id=d.followup_action_id where id=record returning * into d;
    insert into private.cockpit_decision_versions(tenant_id,decision_id,version,snapshot,scope,source_kind,source_id,actor_id) values(target_tenant,d.id,d.version,to_jsonb(d),d.scope,d.source_kind,d.source_id,actor);event:='published';
   end if;
  end if;
  result:=jsonb_build_object('ok',true,'id',d.id,'revision',d.revision);
  insert into private.cockpit_events(tenant_id,record_kind,record_id,actor_id,event,revision,details) values(target_tenant,'decision',d.id,actor,event,d.revision,jsonb_build_object('version',d.version,'scope',d.scope));
 else
  if command not in('save','approve') or exists(select 1 from jsonb_object_keys(input)k where k not in('id','revision','title','subject','owner','sourceKind','sourceId','expiresOn','evidenceId')) then raise exception 'Ongeldige compliance-eis.' using errcode='22023';end if;
  select * into r from private.cockpit_requirements where tenant_id=target_tenant and id=record for update;perform private.cockpit_governance_assert(target_tenant,module,true);
  if r.id is not null and(not private.cockpit_requirement_visible(r) or r.revision is distinct from (input->>'revision')::bigint) then raise exception 'De eis is niet beschikbaar of intussen gewijzigd.' using errcode='40001';end if;
  if command='save' then
   if not private.cockpit_source(target_tenant,input->>'sourceKind',(input->>'sourceId')::uuid) or(input->>'sourceKind'='personnel' and not private.cockpit_scope(target_tenant,'personnel')) then raise exception 'Kies een toegankelijk dossier.' using errcode='42501';end if;
   evidence:=private.cockpit_evidence(target_tenant,input->>'sourceKind',(input->>'sourceId')::uuid,nullif(input->>'evidenceId','')::uuid);
   if nullif(input->>'evidenceId','') is not null and evidence is null then raise exception 'Het bewijs is niet toegankelijk, niet gekoppeld aan dit dossier of nog niet veilig opgeslagen.' using errcode='42501';end if;
   if r.id is null then insert into private.cockpit_requirements(id,tenant_id,title,subject,source_kind,source_id,owner_id,expires_on,evidence_id,created_by) values(record,target_tenant,btrim(input->>'title'),btrim(input->>'subject'),input->>'sourceKind',(input->>'sourceId')::uuid,owner,nullif(input->>'expiresOn','')::date,nullif(input->>'evidenceId','')::uuid,actor) returning * into r;
   else update private.cockpit_requirements set title=btrim(input->>'title'),subject=btrim(input->>'subject'),source_kind=input->>'sourceKind',source_id=(input->>'sourceId')::uuid,owner_id=owner,expires_on=nullif(input->>'expiresOn','')::date,evidence_id=nullif(input->>'evidenceId','')::uuid,approved_fingerprint=null,approved_at=null,approved_by=null,revision=revision+1,updated_at=clock_timestamp() where id=record returning * into r;end if;event:='saved';
  else
   if r.id is null then raise exception 'Eis niet beschikbaar.' using errcode='42501';end if;
   evidence:=private.cockpit_evidence(target_tenant,r.source_kind,r.source_id,r.evidence_id);
   if evidence is null or r.owner_id is null or not private.cockpit_owner(target_tenant,r.owner_id) or r.expires_on is null or r.expires_on<(now() at time zone(select timezone from public.tenants where id=target_tenant))::date then raise exception 'Goedkeuring vereist toegankelijk, gecontroleerd bewijs met een geldige vervaldatum.' using errcode='23514';end if;
   update private.cockpit_requirements set approved_fingerprint=evidence->>'fingerprint',approved_at=clock_timestamp(),approved_by=actor,revision=revision+1,updated_at=clock_timestamp() where id=record returning * into r;event:='approved';
  end if;
  insert into private.cockpit_requirement_versions(tenant_id,requirement_id,revision,snapshot,actor_id,event) values(target_tenant,r.id,r.revision,to_jsonb(r)||jsonb_build_object('evidence',evidence),actor,event);
  perform private.cockpit_requirement_sync(r,actor,true);
  result:=jsonb_build_object('ok',true,'id',r.id,'revision',r.revision);
 end if;
 insert into private.cockpit_receipts(tenant_id,actor_id,request_id,fingerprint,result) values(target_tenant,actor,request_id,fingerprint,result);return result;
end$$;
revoke all on function private.cockpit_decision_dto(private.cockpit_decisions,boolean,integer),private.cockpit_requirement_dto(private.cockpit_requirements,boolean,integer) from public,anon,authenticated,service_role;
revoke all on function private.cockpit_can_upload(uuid,text,uuid) from public,anon,authenticated,service_role;
revoke all on function private.cockpit_action_can_write(private.cockpit_actions),private.cockpit_requirement_action_owner() from public,anon,authenticated,service_role;
revoke all on function private.cockpit_evidence_identity(uuid,text,uuid,uuid),private.cockpit_requirement_measure(private.cockpit_requirements),private.cockpit_requirement_sync(private.cockpit_requirements,uuid,boolean),private.cockpit_requirement_action_guard() from public,anon,authenticated,service_role;
revoke all on function public.cockpit_maintenance(integer) from public,anon,authenticated,service_role;
grant execute on function public.cockpit_maintenance(integer) to service_role;
revoke all on function private.cockpit_governance_assert(uuid,text,boolean),private.cockpit_decision_visible(private.cockpit_decisions),private.cockpit_requirement_visible(private.cockpit_requirements),private.cockpit_evidence(uuid,text,uuid,uuid),private.cockpit_requirement_status(private.cockpit_requirements) from public,anon,authenticated,service_role;
revoke all on function public.cockpit_evidence_options(uuid,text,uuid,text),public.cockpit_governance_upload_allowed(uuid,text,uuid) from public,anon,authenticated,service_role;
grant execute on function public.cockpit_evidence_options(uuid,text,uuid,text),public.cockpit_governance_upload_allowed(uuid,text,uuid) to authenticated;
revoke all on function public.cockpit_governance_query(uuid,text,jsonb),public.cockpit_governance_command(uuid,text,text,jsonb,uuid) from public,anon,authenticated,service_role;
grant execute on function public.cockpit_governance_query(uuid,text,jsonb),public.cockpit_governance_command(uuid,text,text,jsonb,uuid) to authenticated;
create or replace function public.cockpit_action_history(target_tenant uuid,kind text,record_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare source_kind text;a private.cockpit_actions;begin
 perform private.cockpit_assert(target_tenant,'backoffice.followup.read');
 perform private.cockpit_assert(target_tenant,'backoffice.functions.cockpit_followup');
 if kind='manual' then
  select * into a from private.cockpit_actions where tenant_id=target_tenant and id=record_id;
  if not found or not private.cockpit_action_visible(a) then raise exception 'Actie niet beschikbaar.' using errcode='42501';end if;
 else
  source_kind:=case kind when 'object' then 'object_action' when 'personnel' then 'personnel_action' when 'request' then 'request' when 'execution' then 'execution' end;
  if source_kind is null or not private.cockpit_source(target_tenant,source_kind,record_id) then raise exception 'Bron niet beschikbaar.' using errcode='42501';end if;
 end if;
 return coalesce((select jsonb_agg(row order by row->>'createdAt' desc,row->>'id') from(
  select jsonb_build_object('id',e.id,'event',e.event,'revision',e.revision,'details',e.details,'createdAt',e.created_at,
   'actor',case when e.actor_id is null then 'Automatische controle' else coalesce(nullif(mm.full_name,''),nullif(u.raw_user_meta_data->>'full_name',''),'Gebruiker') end) row
  from private.cockpit_events e left join auth.users u on u.id=e.actor_id left join public.tenant_memberships m on m.tenant_id=e.tenant_id and m.user_id=e.actor_id
  left join private.management_members mm on mm.membership_id=m.id and mm.tenant_id=e.tenant_id
  where e.tenant_id=target_tenant and e.record_kind='action:'||kind and e.record_id=cockpit_action_history.record_id order by e.created_at desc,e.id limit 100
 )events),'[]');
end$$;

create or replace function private.cockpit_followup_data(t uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare actions jsonb;overlays jsonb;owners jsonb;begin
 perform private.cockpit_assert(t,'backoffice.followup.read');
 perform private.cockpit_assert(t,'backoffice.functions.cockpit_followup');
 select coalesce(jsonb_agg(to_jsonb(a)||jsonb_build_object('canModify',private.cockpit_action_can_write(a)) order by a.due_on,a.id),'[]') into actions from private.cockpit_actions a where a.tenant_id=t and private.cockpit_action_visible(a);
 select coalesce(jsonb_agg(to_jsonb(o)),'[]') into overlays from private.cockpit_action_overlays o where o.tenant_id=t and private.cockpit_source(t,case o.source_kind when 'object' then 'object_action' when 'personnel' then 'personnel_action' else o.source_kind end,o.source_id);
 select coalesce(jsonb_agg(jsonb_build_object('id',m.user_id,'name',coalesce(nullif(mm.full_name,''),nullif(u.raw_user_meta_data->>'full_name',''),'Gebruiker')) order by mm.full_name,m.user_id),'[]') into owners
 from public.tenant_memberships m join auth.users u on u.id=m.user_id left join private.management_members mm on mm.tenant_id=m.tenant_id and mm.membership_id=m.id where m.tenant_id=t and private.cockpit_owner(t,m.user_id);
 return jsonb_build_object('actions',actions,'overlays',overlays,'owners',owners,'actorId',auth.uid(),'today',(now() at time zone(select timezone from public.tenants where id=t))::date,'canWrite',private.cockpit_access(t,'backoffice.followup.write') and private.cockpit_access(t,'backoffice.functions.cockpit_followup_command'));
end$$;

create function private.cockpit_work_order_options(t uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 perform private.cockpit_assert(t,'backoffice.followup.read');perform private.cockpit_assert(t,'backoffice.functions.cockpit_followup');
 return coalesce((select jsonb_agg(jsonb_build_object('id',w.id,'kind','work_order','label',w.work_order_number||' · '||w.title,'href','/app/werkbonnen/'||w.id::text) order by w.work_order_number,w.id) from public.work_orders w where w.tenant_id=t and private.cockpit_source(t,'work_order',w.id)),'[]');
end$$;
revoke all on function private.cockpit_work_order_options(uuid) from public,anon,authenticated,service_role;
grant execute on function private.cockpit_work_order_options(uuid) to authenticated;
create or replace function public.cockpit_followup(target_tenant uuid) returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare chain jsonb;extra jsonb;begin
 perform private.cockpit_assert(target_tenant,'backoffice.followup.read');
 perform private.cockpit_assert(target_tenant,'backoffice.functions.cockpit_followup');
 -- This call must stay INVOKER: operational/HR/financial source RLS remains in
 -- effect. Never move this projection into a service-role/definer RPC.
 chain:=public.dossier_chain(target_tenant);extra:=private.cockpit_followup_data(target_tenant);
 return extra||jsonb_build_object('sources',(select coalesce(jsonb_agg(s||jsonb_build_object('canModify',private.cockpit_source(target_tenant,case s->>'kind' when 'object' then 'object_action' when 'personnel' then 'personnel_action' else s->>'kind' end,(s->>'id')::uuid,true))),'[]') from jsonb_array_elements(chain->'actions') s),'customers',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name)),'[]') from public.customers where tenant_id=target_tenant and private.cockpit_source(target_tenant,'customer',id)),
 'sourceOptions',private.cockpit_work_order_options(target_tenant)||coalesce((select jsonb_agg(option order by option->>'label') from(
 select jsonb_build_object('id',id,'kind','customer','label',customer_number||' · '||name,'href','/app/klanten/'||id::text) option from public.customers where tenant_id=target_tenant and private.cockpit_source(target_tenant,'customer',id)
 union all select jsonb_build_object('id',id,'kind','object','label',object_number||' · '||name,'href','/app/objecten/'||id::text) from public.objects where tenant_id=target_tenant and private.cockpit_source(target_tenant,'object',id)
 union all select jsonb_build_object('id',id,'kind','quote','label',quote_number||' · '||subject,'href','/app/aanvragen?tab=quotes&recordKind=quote&record='||id::text) from public.quotes where tenant_id=target_tenant and private.cockpit_source(target_tenant,'quote',id)
 union all select jsonb_build_object('id',id,'kind','agreement','label',title||' · v'||version,'href','/app/klanten/'||customer_id::text||'?tab=contracten') from public.customer_agreements where tenant_id=target_tenant and private.cockpit_source(target_tenant,'agreement',id)
 union all select jsonb_build_object('id',id,'kind','personnel','label',employee_number||' · '||full_name,'href','/app/personeel/'||id::text) from public.personnel where tenant_id=target_tenant and private.cockpit_source(target_tenant,'personnel',id)
 union all select jsonb_build_object('id',id,'kind','commercial_request','label',request_number||' · '||subject,'href','/app/aanvragen?tab=requests&recordKind=request&record='||id::text) from public.requests where tenant_id=target_tenant and private.cockpit_source(target_tenant,'commercial_request',id)
 union all select jsonb_build_object('id',target_tenant,'kind','tenant','label','Organisatie','href','/app')
 )options),'[]'));
end$$;

create or replace function public.cockpit_followup_command(target_tenant uuid,command text,input jsonb,request_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
<<cockpit_followup_command>>
declare actor uuid:=auth.uid();fingerprint text;receipt private.cockpit_receipts;a private.cockpit_actions;o private.cockpit_action_overlays;
 rid uuid:=nullif(input->>'id','')::uuid;k text:=input->>'kind';source_kind text;version bigint;owner uuid:=nullif(input->>'owner','')::uuid;due date:=nullif(input->>'due','')::date;
 original_due date;note text:=btrim(coalesce(input->>'note',''));result jsonb;source_version bigint;begin
 perform private.cockpit_assert(target_tenant,'backoffice.followup.write');
 perform private.cockpit_assert(target_tenant,'backoffice.functions.cockpit_followup_command');
 if request_id is null or command is null or command not in('create','assign','snooze','complete','reopen') or jsonb_typeof(input) is distinct from 'object' or length(input::text)>16000 or exists(select 1 from jsonb_object_keys(input)x where x not in('id','kind','sourceKind','sourceId','title','scope','due','owner','note','revision','sourceVersion')) then raise exception 'Ongeldige opvolgactie.' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended('cockpit-command:'||target_tenant::text||actor::text||request_id::text,0));
 perform private.cockpit_assert(target_tenant,'backoffice.followup.write');
 perform private.cockpit_assert(target_tenant,'backoffice.functions.cockpit_followup_command');
 fingerprint:=encode(extensions.digest(command||input::text,'sha256'),'hex');
 if command<>'create' then
  if k='manual' then select * into a from private.cockpit_actions where tenant_id=target_tenant and id=rid;
   if a.id is null or not private.cockpit_action_can_write(a) then raise exception 'Geen wijzigingsrecht bij deze actie.' using errcode='42501';end if;
   if a.trigger_key like 'requirement:%' then perform 1 from private.cockpit_requirements where tenant_id=target_tenant and id=split_part(a.trigger_key,':',2)::uuid for update;
    if not private.cockpit_action_can_write(a) then raise exception 'De bronrechten zijn intussen gewijzigd.' using errcode='42501';end if;end if;
  else source_kind:=case k when 'object' then 'object_action' when 'personnel' then 'personnel_action' when 'request' then 'request' when 'execution' then 'execution' end;
   if source_kind is null or not private.cockpit_source(target_tenant,source_kind,rid,true) then raise exception 'Geen wijzigingsrecht bij deze bron.' using errcode='42501';end if;
  end if;
 end if;
 select * into receipt from private.cockpit_receipts r where r.tenant_id=target_tenant and r.actor_id=actor and r.request_id=cockpit_followup_command.request_id;
 if found then if receipt.fingerprint<>fingerprint then raise exception 'De herhaalsleutel hoort bij andere invoer.' using errcode='23514';end if;return receipt.result;end if;
 if not private.cockpit_owner(target_tenant,owner) then raise exception 'Kies een actieve verantwoordelijke uit deze organisatie.' using errcode='22023';end if;
 if command='create' then
  if not private.cockpit_source(target_tenant,input->>'sourceKind',(input->>'sourceId')::uuid) or not private.cockpit_scope(target_tenant,coalesce(input->>'scope','general')) or due is null then raise exception 'Kies een toegankelijke bron, classificatie en deadline.' using errcode='42501';end if;
  if input->>'sourceKind' in('personnel','personnel_action') and input->>'scope' is distinct from 'personnel' then raise exception 'Personeelsacties blijven vertrouwelijk.' using errcode='22023';end if;
  insert into private.cockpit_actions(tenant_id,source_kind,source_id,title,scope,due_on,original_due_on,owner_id,note,created_by)
  values(target_tenant,input->>'sourceKind',(input->>'sourceId')::uuid,btrim(input->>'title'),coalesce(input->>'scope','general'),due,due,owner,note,actor) returning * into a;rid:=a.id;k:='manual';version:=a.revision;
 elsif k='manual' then
  select * into a from private.cockpit_actions where tenant_id=target_tenant and id=rid for update;
  if not found or not private.cockpit_action_can_write(a) then raise exception 'Actie niet beschikbaar.' using errcode='42501';end if;
  perform private.cockpit_assert(target_tenant,'backoffice.followup.write');
 perform private.cockpit_assert(target_tenant,'backoffice.functions.cockpit_followup_command');
  if (input->>'revision')::bigint is distinct from a.revision then raise exception 'De actie is intussen gewijzigd.' using errcode='40001';end if;
  if command='snooze' and(due is null or due<(now() at time zone(select timezone from public.tenants where id=target_tenant))::date or length(note)<3) or command='complete' and length(note)<3 then raise exception 'Geef een geldige datum en een onderbouwde terugkoppeling.' using errcode='22023';end if;
  update private.cockpit_actions set owner_id=case when command='assign' then owner else owner_id end,snoozed_until=case when command='snooze' then due when command in('complete','reopen') then null else snoozed_until end,
   state=case when command='complete' then 'done' when command='reopen' then 'open' else state end,note=case when cockpit_followup_command.note<>'' then cockpit_followup_command.note else cockpit_actions.note end,revision=revision+1,updated_at=clock_timestamp() where id=rid returning revision into version;
 else
  source_kind:=case k when 'object' then 'object_action' when 'personnel' then 'personnel_action' when 'request' then 'request' when 'execution' then 'execution' end;
  if source_kind is null or not private.cockpit_source(target_tenant,source_kind,rid,true) then raise exception 'Geen wijzigingsrecht bij deze bron.' using errcode='42501';end if;
  -- Completing execution/customer requests belongs to their reviewed workflows.
  if command in('complete','reopen') then raise exception 'Rond deze actie af bij het brondossier.' using errcode='22023';end if;
  if command='snooze' and(due is null or due<(now() at time zone(select timezone from public.tenants where id=target_tenant))::date or length(note)<3) then raise exception 'Uitstellen vereist een toekomstige datum en reden.' using errcode='22023';end if;
  if k='object' then select r.version,r.due_on into source_version,original_due from public.object_records r where r.tenant_id=target_tenant and r.id=rid for update;
  elsif k='personnel' then select r.dossier_revision,r.due_on into source_version,original_due from public.personnel_dossier_items r where r.tenant_id=target_tenant and r.id=rid for update;
  elsif k='request' then select r.version into source_version from public.object_visit_requests r where r.tenant_id=target_tenant and r.id=rid for update;
  else select r.execution_version into source_version from public.work_order_tasks r where r.tenant_id=target_tenant and r.id=rid for update;end if;
  perform private.cockpit_assert(target_tenant,'backoffice.followup.write');
 perform private.cockpit_assert(target_tenant,'backoffice.functions.cockpit_followup_command');
  if not private.cockpit_source(target_tenant,source_kind,rid,true) then raise exception 'De brontoegang is gewijzigd.' using errcode='42501';end if;
  if source_version is null or(input->>'sourceVersion')::bigint is distinct from source_version then raise exception 'De bron is intussen gewijzigd.' using errcode='40001';end if;
  perform pg_advisory_xact_lock(hashtextextended('cockpit-source:'||target_tenant::text||k||rid::text,0));
  perform private.cockpit_assert(target_tenant,'backoffice.followup.write');
  perform private.cockpit_assert(target_tenant,'backoffice.functions.cockpit_followup_command');
  select * into o from private.cockpit_action_overlays where cockpit_action_overlays.tenant_id=target_tenant and cockpit_action_overlays.source_kind=k and cockpit_action_overlays.source_id=rid for update;
  if coalesce((input->>'revision')::bigint,-1)<>coalesce(o.revision,0) then raise exception 'De opvolging is intussen gewijzigd.' using errcode='40001';end if;
  if command='assign' and k='object' then update public.object_records set owner_user_id=owner where tenant_id=target_tenant and id=rid;
  elsif command='assign' and k='personnel' then update public.personnel_dossier_items set owner_user_id=owner where tenant_id=target_tenant and id=rid;end if;
  insert into private.cockpit_action_overlays(tenant_id,source_kind,source_id,owner_id,snoozed_until,note)
  values(target_tenant,k,rid,case when command='assign' then owner else o.owner_id end,case when command='snooze' then due else o.snoozed_until end,coalesce(nullif(note,''),o.note,''))
  on conflict on constraint cockpit_action_overlays_pkey do update set owner_id=excluded.owner_id,snoozed_until=excluded.snoozed_until,note=excluded.note,revision=cockpit_action_overlays.revision+1,updated_at=clock_timestamp() returning revision into version;
 end if;
 insert into private.cockpit_events(tenant_id,record_kind,record_id,actor_id,event,revision,details) values(target_tenant,'action:'||k,rid,actor,command,version,jsonb_build_object('note',note,'owner',owner,'until',due,'originalDue',coalesce(a.original_due_on,original_due)));
 result:=jsonb_build_object('ok',true,'id',rid,'revision',version);insert into private.cockpit_receipts(tenant_id,actor_id,request_id,fingerprint,result) values(target_tenant,actor,request_id,fingerprint,result);return result;
end$$;

notify pgrst,'reload schema';
