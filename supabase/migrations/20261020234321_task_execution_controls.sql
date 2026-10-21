-- Task-directed execution, immutable goals, personal visits and measured future norms.
-- Architecture and authorization: docs/architecture/task-controls.md.

-- Additive task execution model. No historical item identities or measurements are inferred.
alter table public.task_revisions drop constraint task_revisions_unit_check;
alter table public.task_revisions add constraint task_revisions_unit_check check (unit in ('task','hour','item','kilometre','square_metre','room'));
alter table public.task_revisions add column execution_config jsonb not null default '{}'::jsonb;

create table private.task_items (
 id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.tenants(id),
 customer_id uuid not null, object_id uuid not null, node_id uuid,
 item_number text not null default ('IT-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,12))),
 name text not null check(length(btrim(name)) between 1 and 180), item_type text not null check(length(btrim(item_type)) between 1 and 100),
 brand text not null default '', model text not null default '', serial_number text not null default '',
 status text not null default 'active' check(status in ('active','out_of_service','archived')),
 replaces_id uuid, version bigint not null default 1, created_at timestamptz not null default clock_timestamp(),
 unique(tenant_id,id), unique(tenant_id,item_number),
 foreign key(tenant_id,customer_id) references public.customers(tenant_id,id),
 foreign key(tenant_id,object_id) references public.objects(tenant_id,id),
 foreign key(tenant_id,object_id,node_id) references public.object_nodes(tenant_id,object_id,id),
 foreign key(tenant_id,replaces_id) references private.task_items(tenant_id,id)
);
create index task_items_location on private.task_items(tenant_id,object_id,status,id);
create index task_items_customer on private.task_items(tenant_id,customer_id);
create index task_items_replaces on private.task_items(tenant_id,replaces_id);
create index task_items_serial on private.task_items(tenant_id,lower(serial_number)) where serial_number<>'';
create table private.task_item_history (
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null,item_id uuid not null,version bigint not null,
 snapshot jsonb not null,actor_id uuid references auth.users(id),created_at timestamptz not null default clock_timestamp(),
 unique(tenant_id,item_id,version),foreign key(tenant_id,item_id) references private.task_items(tenant_id,id)
);
create table private.task_norm_versions (
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null,task_id uuid not null,revision_id uuid not null,
 variant_key text not null default '',comparison_key text not null,
 minutes numeric(12,6) not null check(minutes>0 and minutes<=1440),basis numeric(12,3) not null check(basis>0),
 effective_on date not null,created_by uuid not null references auth.users(id),reason text not null check(length(btrim(reason)) between 3 and 2000),
 created_at timestamptz not null default clock_timestamp(),unique(tenant_id,id),unique(tenant_id,task_id,variant_key,effective_on),
 foreign key(tenant_id,task_id) references public.task_catalog(tenant_id,id),foreign key(tenant_id,revision_id) references public.task_revisions(tenant_id,id)
);
create index task_norm_revision on private.task_norm_versions(tenant_id,revision_id);

-- Preserve exact per-unit arithmetic for quantities such as 20 minutes / 100 m².
alter table public.work_order_tasks alter column duration_minutes type numeric(18,9);
alter table public.work_order_tasks add column execution_snapshot jsonb not null default '{}'::jsonb;
alter table public.work_order_tasks add column original_budget_minutes numeric(18,6);
alter table public.work_order_tasks add column current_budget_minutes numeric(18,6);
alter table public.work_order_tasks add column original_quantity numeric(12,3);
alter table public.work_order_tasks add column commercially_approved_quantity numeric(12,3);
alter table public.work_order_tasks add constraint work_order_tasks_context_unique unique(tenant_id,work_order_id,id);

create table private.task_targets (
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null,work_order_id uuid not null,task_id uuid not null,object_id uuid not null,
 item_id uuid,node_id uuid,quantity numeric(12,3) not null default 1 check(quantity>0),variant_key text not null default '',
 snapshot jsonb not null,origin text not null check(origin in ('original','added')),
 reason text not null default '',added_by uuid not null references auth.users(id),created_at timestamptz not null default clock_timestamp(),
 withdrawn_at timestamptz,version bigint not null default 1,
 unique(tenant_id,id),unique(tenant_id,work_order_id,task_id,id),check(num_nonnulls(item_id,node_id)=1),
 foreign key(tenant_id,work_order_id,task_id) references public.work_order_tasks(tenant_id,work_order_id,id) on delete cascade,
 foreign key(tenant_id,object_id) references public.objects(tenant_id,id),
 foreign key(tenant_id,item_id) references private.task_items(tenant_id,id),
 foreign key(tenant_id,object_id,node_id) references public.object_nodes(tenant_id,object_id,id)
);
create unique index task_target_item_active on private.task_targets(tenant_id,task_id,item_id) where withdrawn_at is null;
create unique index task_target_node_active on private.task_targets(tenant_id,task_id,node_id) where withdrawn_at is null;
create index task_targets_order on private.task_targets(tenant_id,work_order_id,task_id,id);
create index task_targets_object on private.task_targets(tenant_id,object_id,node_id);
create index task_targets_item on private.task_targets(tenant_id,item_id);
create table private.task_target_executions (
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null,work_order_id uuid not null,task_id uuid not null,target_id uuid not null,
 round integer not null default 1 check(round>0),version bigint not null default 1,
 state text not null default 'planned' check(state in ('planned','in_progress','completed','not_done','not_applicable')),
 outcome text check(outcome in ('pass','deviation','rejected','followup')),
 followup text not null default 'none' check(followup in ('none','review','repair_proposal','followup_order')),
 finding text not null default '',exception_reason text not null default '',customer_visible boolean not null default false,
 attachment_id uuid,actor_id uuid references auth.users(id),completed_at timestamptz,created_at timestamptz not null default clock_timestamp(),
 unique(tenant_id,id),unique(tenant_id,work_order_id,task_id,id),unique(tenant_id,target_id,round),unique(tenant_id,work_order_id,task_id,target_id,id),
 foreign key(tenant_id,work_order_id,task_id,target_id) references private.task_targets(tenant_id,work_order_id,task_id,id) on delete cascade,
 foreign key(tenant_id,attachment_id) references public.attachments(tenant_id,id),
 check(state<>'completed' or outcome is not null),check(state not in ('not_done','not_applicable') or length(btrim(exception_reason))>=5)
);
create index task_target_executions_order on private.task_target_executions(tenant_id,work_order_id,task_id,target_id,round desc);
create index task_target_executions_attachment on private.task_target_executions(tenant_id,attachment_id);

alter table public.work_order_checklists drop constraint work_order_checklists_tenant_id_work_order_id_template_revi_key;
alter table public.work_order_checklists add column task_id uuid;
alter table public.work_order_checklists add column target_execution_id uuid;
alter table public.work_order_checklists add constraint checklist_task_context foreign key(tenant_id,work_order_id,task_id) references public.work_order_tasks(tenant_id,work_order_id,id) on delete cascade;
alter table public.work_order_checklists add constraint checklist_target_context foreign key(tenant_id,work_order_id,task_id,target_execution_id) references private.task_target_executions(tenant_id,work_order_id,task_id,id) on delete cascade;
alter table public.work_order_checklists add constraint checklist_scope_valid check(target_execution_id is null or task_id is not null);
create unique index checklist_order_scope on public.work_order_checklists(tenant_id,work_order_id,template_revision_id) where task_id is null;
create unique index checklist_task_scope on public.work_order_checklists(tenant_id,task_id,template_revision_id) where task_id is not null and target_execution_id is null;
create unique index checklist_target_scope on public.work_order_checklists(tenant_id,target_execution_id,template_revision_id) where target_execution_id is not null;
create index checklist_task_context on public.work_order_checklists(tenant_id,work_order_id,task_id,target_execution_id);

create table private.task_visits (
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null,work_order_id uuid not null,
 starts_at timestamptz not null,ends_at timestamptz not null check(ends_at>starts_at),version bigint not null default 1,
 state text not null default 'planned' check(state in ('planned','active','closed','missed','cancelled')),
 created_by uuid not null references auth.users(id),created_at timestamptz not null default clock_timestamp(),
 unique(tenant_id,id),unique(tenant_id,work_order_id,id),foreign key(tenant_id,work_order_id) references public.work_orders(tenant_id,id)
);
create index task_visits_order on private.task_visits(tenant_id,work_order_id,starts_at);
create table private.task_visit_sessions (
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null,work_order_id uuid not null,visit_id uuid not null,assignment_id uuid not null,personnel_id uuid not null,
 starts_at timestamptz not null default clock_timestamp(),ends_at timestamptz,
 unique(tenant_id,id),check(ends_at is null or ends_at>=starts_at),
 foreign key(tenant_id,work_order_id,visit_id) references private.task_visits(tenant_id,work_order_id,id),
 foreign key(tenant_id,assignment_id) references public.work_order_assignments(tenant_id,id),
 foreign key(tenant_id,personnel_id) references public.personnel(tenant_id,id)
);
create unique index task_visit_session_open on private.task_visit_sessions(tenant_id,personnel_id) where ends_at is null;
create index task_visit_sessions_visit on private.task_visit_sessions(tenant_id,visit_id);
create index task_visit_sessions_assignment on private.task_visit_sessions(tenant_id,assignment_id);
create table private.task_time_allocations (
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null,work_order_id uuid not null,task_id uuid not null,
 target_id uuid,target_execution_id uuid,source_id uuid not null,session_id uuid,personnel_id uuid not null,
 starts_at timestamptz not null,ends_at timestamptz,
 method text not null check(method in ('direct','batch','estimated')),quantity numeric(12,3) not null check(quantity>0),
 quality text not null default 'valid' check(quality in ('valid','review','excluded')),reason text not null default '',
 unique(tenant_id,id),check(ends_at is null or ends_at>=starts_at),
 foreign key(tenant_id,work_order_id,task_id) references public.work_order_tasks(tenant_id,work_order_id,id),
 foreign key(tenant_id,work_order_id,task_id,target_id) references private.task_targets(tenant_id,work_order_id,task_id,id),
 foreign key(tenant_id,work_order_id,task_id,target_id,target_execution_id) references private.task_target_executions(tenant_id,work_order_id,task_id,target_id,id),
 foreign key(tenant_id,source_id) references public.time_entries(tenant_id,id),
 foreign key(tenant_id,session_id) references private.task_visit_sessions(tenant_id,id),foreign key(tenant_id,personnel_id) references public.personnel(tenant_id,id)
);
create index task_allocations_source on private.task_time_allocations(tenant_id,source_id,starts_at);
create index task_allocations_task on private.task_time_allocations(tenant_id,work_order_id,task_id,target_id);
create index task_allocations_session on private.task_time_allocations(tenant_id,session_id);
create index task_allocations_personnel on private.task_time_allocations(tenant_id,personnel_id);
create table private.task_norm_decisions (
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null,task_id uuid not null,revision_id uuid not null,
 variant_key text not null default '',dataset_hash text not null,dataset jsonb not null,
 decision text not null check(decision in ('approved','rejected','deferred')),
 reason text not null check(length(btrim(reason)) between 3 and 2000),effective_on date,review_on date,
 actor_id uuid not null references auth.users(id),norm_id uuid,created_at timestamptz not null default clock_timestamp(),
 foreign key(tenant_id,task_id) references public.task_catalog(tenant_id,id),
 foreign key(tenant_id,revision_id) references public.task_revisions(tenant_id,id),foreign key(tenant_id,norm_id) references private.task_norm_versions(tenant_id,id)
);
create index task_norm_decisions_revision on private.task_norm_decisions(tenant_id,revision_id);
create index task_norm_decisions_norm on private.task_norm_decisions(tenant_id,norm_id);

do $$declare name text;begin
 foreach name in array array['task_items','task_item_history','task_norm_versions','task_targets','task_target_executions','task_visits','task_visit_sessions','task_time_allocations','task_norm_decisions'] loop
 execute format('alter table private.%I enable row level security',name);
 execute format('alter table private.%I force row level security',name);
 execute format('revoke all on private.%I from public,anon,authenticated,service_role',name);
 end loop;
end$$;

create index task_norm_decision_dataset on private.task_norm_decisions(tenant_id,task_id,variant_key,dataset_hash,created_at desc);

create index task_allocations_execution on private.task_time_allocations(tenant_id,target_execution_id);

-- Scope lineage preserves the old identity/result and links the receiving goal.
alter table private.task_targets add column source_target_id uuid;
alter table private.task_targets add column transferred_to_task_id uuid;
alter table private.task_targets add constraint task_target_source foreign key(tenant_id,source_target_id) references private.task_targets(tenant_id,id);
alter table private.task_targets add constraint task_target_transfer foreign key(tenant_id,transferred_to_task_id) references public.work_order_tasks(tenant_id,id);
create index task_targets_source on private.task_targets(tenant_id,source_target_id);
create index task_targets_transfer on private.task_targets(tenant_id,transferred_to_task_id);

create table private.task_norm_policies(tenant_id uuid primary key references public.tenants(id),version bigint not null default 1,settings jsonb not null,updated_by uuid not null references auth.users(id),updated_at timestamptz not null default clock_timestamp());
alter table private.task_norm_policies enable row level security;
alter table private.task_norm_policies force row level security;
revoke all on private.task_norm_policies from public,anon,authenticated,service_role;
create function public.task_norm_policy_command(target_tenant uuid,input jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare mid uuid:=(input->>'mutationId')::uuid;hash text;prior private.work_order_commands;policy private.task_norm_policies;settings jsonb:=input->'settings';r jsonb;begin
 perform pg_advisory_xact_lock(hashtextextended('task-catalogue:'||target_tenant,0));
 perform private.management_assert(target_tenant,'backoffice.tasks.write');perform private.management_assert(target_tenant,'backoffice.functions.task_catalogue_command');
 if not private.object_manage(target_tenant) or mid is null then raise exception 'Geen normbeheer' using errcode='42501';end if;
 hash:=encode(extensions.digest(input::text,'sha256'),'hex');select * into prior from private.work_order_commands where id=mid;
 if found then if(prior.tenant_id,prior.actor_id,prior.command,prior.payload_hash) is distinct from(target_tenant,auth.uid(),'task-norm-policy',hash) then raise exception 'Ongeldige herhaalsleutel' using errcode='23514';end if;return prior.result;end if;
 select * into policy from private.task_norm_policies where tenant_id=target_tenant for update;
 if coalesce(policy.version,0) is distinct from(input->>'version')::bigint then raise exception 'Norminstellingen zijn gewijzigd' using errcode='40001';end if;
 if jsonb_typeof(settings) is distinct from 'object' or not(settings ?& array['days','minimumDirect','minimumOrders','minimumBatches','minimumBatchOrders','percentDifference','minuteDifference','rounding']) or exists(select 1 from jsonb_each(settings) setting where setting.key not in ('days','minimumDirect','minimumOrders','minimumBatches','minimumBatchOrders','percentDifference','minuteDifference','rounding') or jsonb_typeof(setting.value)<>'number')
 or (settings->>'days')::integer not between 1 and 3650 or (settings->>'minimumDirect')::integer not between 1 and 100000 or (settings->>'minimumOrders')::integer not between 1 and 100000 or (settings->>'minimumBatches')::integer not between 1 and 100000 or (settings->>'minimumBatchOrders')::integer not between 1 and 100000 or (settings->>'percentDifference')::numeric not between 0 and 100 or (settings->>'minuteDifference')::numeric not between 0 and 1440 or (settings->>'rounding')::numeric<=0 or (settings->>'rounding')::numeric>60 then raise exception 'Controleer meetperiode, minimumaantallen en drempels' using errcode='23514';end if;
 insert into private.task_norm_policies(tenant_id,settings,updated_by) values(target_tenant,settings,auth.uid()) on conflict(tenant_id) do update set settings=excluded.settings,updated_by=auth.uid(),version=private.task_norm_policies.version+1,updated_at=clock_timestamp() returning * into policy;
 r:=jsonb_build_object('ok',true,'version',policy.version);
 insert into private.work_order_commands values(mid,target_tenant,auth.uid(),'task-norm-policy',hash,r,clock_timestamp());
 insert into public.audit_events(tenant_id,actor_user_id,action,entity_type,entity_id,after_data) values(target_tenant,auth.uid(),'task.norm_policy','tenant',target_tenant,jsonb_build_object('version',policy.version,'settings',settings));return r;
end$$;
revoke all on function public.task_norm_policy_command(uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.task_norm_policy_command(uuid,jsonb) to authenticated;

-- Personal visit sessions supplement, rather than replace, the unique assignment.
create table private.task_visit_crew (
 tenant_id uuid not null,work_order_id uuid not null,visit_id uuid not null,assignment_id uuid not null,personnel_id uuid not null,
 primary key(tenant_id,visit_id,personnel_id),foreign key(tenant_id,work_order_id,visit_id) references private.task_visits(tenant_id,work_order_id,id),
 foreign key(tenant_id,assignment_id) references public.work_order_assignments(tenant_id,id),foreign key(tenant_id,personnel_id) references public.personnel(tenant_id,id)
);
create index task_visit_crew_assignment on private.task_visit_crew(tenant_id,assignment_id);
create index task_visit_crew_personnel on private.task_visit_crew(tenant_id,personnel_id,visit_id);
alter table private.task_visit_crew enable row level security;
alter table private.task_visit_crew force row level security;
revoke all on private.task_visit_crew from public,anon,authenticated,service_role;

create or replace function private.task_execution_config(t uuid,c jsonb) returns void language plpgsql security definer set search_path='' as $$
declare v jsonb;checklist uuid;begin
 if c='{}'::jsonb then return;end if;
 if exists(select 1 from jsonb_each(c) setting where setting.key in ('photoPerTarget','findingOnDeviation','allowExtraTargets','allowUnknownItems') and jsonb_typeof(setting.value)<>'boolean') then raise exception 'Ongeldige uitvoeringsoptie' using errcode='23514';end if;
 if exists(select 1 from jsonb_object_keys(c) key where key not in ('mode','normBasis','checklistMode','checklistRevisionId','comparisonKey','itemTypes','variants','identification','photoPerTarget','findingOnDeviation','allowExtraTargets','allowUnknownItems','qualifications')) then raise exception 'Onbekende uitvoeringsinstelling' using errcode='23514';end if;
 if jsonb_typeof(coalesce(c->'qualifications','[]'))<>'array' or jsonb_array_length(coalesce(c->'qualifications','[]'))>50 or exists(select 1 from jsonb_array_elements_text(coalesce(c->'qualifications','[]')) requested(code) where not exists(select 1 from public.qualification_types q where q.tenant_id=t and q.code=requested.code and q.active)) then raise exception 'Kies bestaande actieve kwalificatiecodes van deze organisatie' using errcode='23514';end if;
 if jsonb_typeof(c)<>'object' or c->>'mode' is null or c->>'mode' not in ('once','quantity','rooms','items')
 or c->>'checklistMode' is null or c->>'checklistMode' not in ('none','task','target')
 or coalesce((c->>'normBasis')::numeric,0)<=0 or (c->>'normBasis')::numeric>100000 or (c->>'normBasis')::numeric<>round((c->>'normBasis')::numeric,3)
 or (c->>'mode'='once' and (c->>'normBasis')::numeric<>1)
 or (c->>'checklistMode'='target' and c->>'mode' not in ('rooms','items'))
 or jsonb_typeof(coalesce(c->'variants','[]'))<>'array' or jsonb_array_length(coalesce(c->'variants','[]'))>50
 or jsonb_typeof(coalesce(c->'itemTypes','[]'))<>'array' or jsonb_array_length(coalesce(c->'itemTypes','[]'))>50
 or c->>'comparisonKey' is null or length(c->>'comparisonKey') not between 1 and 100
 or coalesce(c->>'identification','optional') not in ('optional','required')
 then raise exception 'Controleer toepassingsvorm, checklist en normgrondslag' using errcode='23514';end if;
 if c->>'checklistMode'<>'none' and not private.service_enabled(t,'rapportage') then raise exception 'Rapportage is nodig voor controles' using errcode='23514';end if;
 for v in select value from jsonb_array_elements(coalesce(c->'variants','[]')) loop
  if length(btrim(coalesce(v->>'key','')))=0 or length(btrim(coalesce(v->>'name','')))=0 or length(btrim(coalesce(v->>'model','')))=0
  or coalesce((v->>'minutes')::numeric,0)<=0 or (v->>'minutes')::numeric>1440 or coalesce((v->>'basis')::numeric,0)<=0 or length(coalesce(v->>'comparisonKey',''))=0
  then raise exception 'Vul naam, model en eigen norm van iedere variant in' using errcode='23514';end if;
 end loop;
 if exists(select 1 from jsonb_array_elements(coalesce(c->'variants','[]')) variant_row group by variant_row->>'key' having count(*)>1) then raise exception 'Variantidentiteit moet uniek zijn' using errcode='23514';end if;
 for checklist in select nullif(c->>'checklistRevisionId','')::uuid union select nullif(value->>'checklistRevisionId','')::uuid from jsonb_array_elements(coalesce(c->'variants','[]')) loop
  if checklist is not null and not exists(select 1 from public.work_order_template_versions v join public.work_order_templates w on w.tenant_id=v.tenant_id and w.id=v.template_id where v.tenant_id=t and v.id=checklist and v.state='published' and w.kind='checklist') then raise exception 'Kies een gepubliceerde checklistversie van deze organisatie' using errcode='23514';end if;
 end loop;
 if c->>'checklistMode'<>'none' and nullif(c->>'checklistRevisionId','') is null and jsonb_array_length(coalesce(c->'variants','[]'))=0 then raise exception 'Koppel een gepubliceerde checklistversie' using errcode='23514';end if;
end$$;

create or replace function private.task_control_access(t uuid,w uuid,write_access boolean default false) returns boolean language sql stable security definer set search_path='' as $$
 select private.object_session_active() and private.service_enabled(t,'planning') and private.service_enabled(t,'rapportage') and (
 (private.work_order_access(t) and private.management_allowed(t,case when write_access then 'backoffice.work_orders.write' else 'backoffice.work_orders.read' end)
 and private.management_allowed(t,case when write_access then 'backoffice.functions.record_task_execution' else 'backoffice.functions.work_order_dossier' end))
 or (private.work_order_execution_actor(t,w,auth.uid(),nullif(auth.jwt()->>'session_id','')::uuid)
 and (not write_access or exists(select 1 from public.work_order_assignments a where a.tenant_id=t and a.work_order_id=w and a.personnel_id=private.current_personnel_id(t) and a.status not in ('completed','cancelled','returned') and (not exists(select 1 from private.task_visit_crew crew where crew.tenant_id=t and crew.assignment_id=a.id) or exists(select 1 from private.task_visit_sessions session where session.tenant_id=t and session.assignment_id=a.id and session.ends_at is null)))))
 );
$$;

create or replace function private.task_checklist_attach(t uuid,w uuid,task uuid,execution uuid,revision uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 if revision is null then return;end if;
 insert into public.work_order_checklists(tenant_id,work_order_id,task_id,target_execution_id,template_revision_id,name,definition)
 select t,w,task,execution,v.id,c.name,v.definition from public.work_order_template_versions v join public.work_order_templates c on c.tenant_id=v.tenant_id and c.id=v.template_id
 where v.tenant_id=t and v.id=revision and c.kind='checklist' and v.state in ('published','archived');
 if not found then raise exception 'De vastgelegde checklistversie is niet beschikbaar' using errcode='23514';end if;
end$$;

create or replace function private.task_norm_snapshot(r public.task_revisions,on_day date,variant_key text default '') returns jsonb language plpgsql stable security definer set search_path='' as $$
declare c jsonb:=r.execution_config;v jsonb;n private.task_norm_versions;minutes numeric:=r.duration_minutes;basis numeric:=coalesce((c->>'normBasis')::numeric,1);comparison text:=coalesce(c->>'comparisonKey',r.task_id::text);begin
 if variant_key<>'' then
 select value into v from jsonb_array_elements(coalesce(c->'variants','[]')) where value->>'key'=variant_key;
 if v is null then raise exception 'Geen passende variant' using errcode='23514';end if;
 minutes:=(v->>'minutes')::numeric;basis:=(v->>'basis')::numeric;comparison:=v->>'comparisonKey';
 end if;
 select * into n from private.task_norm_versions norm where norm.tenant_id=r.tenant_id and norm.task_id=r.task_id and norm.variant_key=task_norm_snapshot.variant_key and norm.comparison_key=comparison and norm.effective_on<=on_day order by norm.effective_on desc,norm.created_at desc limit 1;
 if n.id is not null then minutes:=n.minutes;basis:=n.basis;end if;
 return jsonb_build_object('revisionId',r.id,'revision',r.revision,'mode',coalesce(c->>'mode','quantity'),'unit',r.unit,'config',c,'variant',v,'variantKey',variant_key,'comparisonKey',comparison,'normId',n.id,'normMinutes',minutes,'normBasis',basis,'normDate',on_day,'checklistRevisionId',coalesce(v->>'checklistRevisionId',c->>'checklistRevisionId'));
end$$;

create or replace function private.task_target_add(task public.work_order_tasks,selection jsonb,origin text,why text) returns uuid language plpgsql security definer set search_path='' as $$
declare w public.work_orders;i private.task_items;node public.object_nodes;target private.task_targets;e uuid;r public.task_revisions;snapshot jsonb;v jsonb;key text:=coalesce(selection->>'variantKey','');amount numeric;begin
 select * into w from public.work_orders where tenant_id=task.tenant_id and id=task.work_order_id;
 select * into r from public.task_revisions where tenant_id=task.tenant_id and id=task.task_revision_id;
 if (task.execution_snapshot->>'mode')='items' then
  select * into i from private.task_items where tenant_id=task.tenant_id and id=(selection->>'itemId')::uuid and object_id=w.object_id and customer_id=w.customer_id and status='active';
  if i.id is null then raise exception 'Geen passend toegankelijk item op deze locatie' using errcode='23514';end if;
  if jsonb_array_length(coalesce(r.execution_config->'itemTypes','[]'))>0 and not(r.execution_config->'itemTypes' ? i.item_type) then raise exception 'Dit itemtype past niet bij de taak' using errcode='23514';end if;
  if jsonb_array_length(coalesce(r.execution_config->'variants','[]'))>0 then
   select value into v from jsonb_array_elements(r.execution_config->'variants') where value->>'key'=key and value->>'model'=i.model and (coalesce(value->>'itemType','')='' or value->>'itemType'=i.item_type);
   if v is null then raise exception 'Geen passende variant' using errcode='23514';end if;
  elsif key<>'' then raise exception 'Geen passende variant' using errcode='23514';end if;
  amount:=1;snapshot:=jsonb_build_object('id',i.id,'number',i.item_number,'name',i.name,'type',i.item_type,'brand',i.brand,'model',i.model,'serialNumber',i.serial_number,'nodeId',i.node_id);
 elsif task.execution_snapshot->>'mode'='rooms' then
  select * into node from public.object_nodes where tenant_id=task.tenant_id and object_id=w.object_id and id=(selection->>'nodeId')::uuid and active;
  if node.id is null then raise exception 'Kies een actief onderdeel van dit object' using errcode='23514';end if;
  amount:=case when r.unit='square_metre' then (selection->>'quantity')::numeric else 1 end;
  snapshot:=jsonb_build_object('id',node.id,'number',node.code,'name',node.name,'kind',node.kind,'nodeId',node.id);
 else raise exception 'Deze taak gebruikt geen afzonderlijke doelen' using errcode='23514';end if;
 if amount is null or amount<=0 or amount>100000 then raise exception 'Controleer de doelhoeveelheid' using errcode='23514';end if;
 snapshot:=snapshot||jsonb_build_object('objectName',(select name from public.objects where tenant_id=w.tenant_id and id=w.object_id),'location',(with recursive ancestors as(select n.id,n.parent_id,n.name,0 depth from public.object_nodes n where n.tenant_id=w.tenant_id and n.object_id=w.object_id and n.id=coalesce(i.node_id,node.id) union all select n.id,n.parent_id,n.name,a.depth+1 from public.object_nodes n join ancestors a on n.id=a.parent_id where n.tenant_id=w.tenant_id and n.object_id=w.object_id) select string_agg(name,' / ' order by depth desc) from ancestors),'norm',case when key='' then task.execution_snapshot-'variantNorms' else task.execution_snapshot->'variantNorms'->key end);
 if snapshot->'norm' is null or snapshot->'norm'='null'::jsonb then raise exception 'Geen vastgelegde passende variant; kies een nieuwe taaktoepassing' using errcode='23514';end if;
 -- A scope addition is budgeted using the frozen norm date, never today's norm.
 insert into private.task_targets(tenant_id,work_order_id,task_id,object_id,item_id,node_id,quantity,variant_key,snapshot,origin,reason,added_by)
 values(task.tenant_id,w.id,task.id,w.object_id,i.id,node.id,amount,key,snapshot,origin,why,coalesce(auth.uid(),task.added_by,w.created_by)) returning * into target;
 insert into private.task_target_executions(tenant_id,work_order_id,task_id,target_id) values(task.tenant_id,w.id,task.id,target.id) returning id into e;
 if r.execution_config->>'checklistMode'='target' then perform private.task_checklist_attach(task.tenant_id,w.id,task.id,e,nullif(snapshot#>>'{norm,checklistRevisionId}','')::uuid);end if;
 return target.id;
end$$;

create or replace function private.task_refresh_budget(task uuid) returns void language plpgsql security definer set search_path='' as $$
declare t public.work_order_tasks;amount numeric;budget numeric;begin
 select * into t from public.work_order_tasks where id=task for update;
 if t.execution_snapshot->>'mode' in ('rooms','items') then
 select sum(quantity),sum(quantity*(snapshot#>>'{norm,normMinutes}')::numeric/(snapshot#>>'{norm,normBasis}')::numeric) into amount,budget from private.task_targets where tenant_id=t.tenant_id and task_id=t.id and withdrawn_at is null;
 amount:=coalesce(amount,0)+t.transferred_quantity+t.withdrawn_quantity;budget:=coalesce(budget,0);
 if amount<=0 then raise exception 'Kies minimaal één doel' using errcode='23514';end if;
 else amount:=t.quantity;budget:=amount*(t.execution_snapshot->>'normMinutes')::numeric/(t.execution_snapshot->>'normBasis')::numeric;end if;
 update public.work_order_tasks set quantity=amount,current_budget_minutes=budget,original_budget_minutes=coalesce(original_budget_minutes,budget),original_quantity=coalesce(original_quantity,amount),commercially_approved_quantity=coalesce(commercially_approved_quantity,amount),duration_minutes=case when amount-t.transferred_quantity-t.withdrawn_quantity>0 then budget/(amount-t.transferred_quantity-t.withdrawn_quantity) else t.duration_minutes end where id=t.id;
 update public.work_orders set budget_labor_minutes=ceil((select sum(coalesce(current_budget_minutes,duration_minutes*quantity)) from public.work_order_tasks where tenant_id=t.tenant_id and work_order_id=t.work_order_id and (not is_extra_work or extra_work_status<>'rejected'))) where tenant_id=t.tenant_id and id=t.work_order_id;
end$$;

create or replace function private.task_checklist_ready(checklist uuid) returns boolean language sql stable security definer set search_path='' as $$
 select not exists(select 1 from public.work_order_checklists c cross join lateral jsonb_array_elements(c.definition->'questions') q
 left join public.work_order_checklist_answers a on a.tenant_id=c.tenant_id and a.checklist_id=c.id and a.question_id=q->>'id'
 where c.id=checklist and coalesce((q->>'required')::boolean,false)
 and (not(q ? 'condition') or exists(select 1 from public.work_order_checklist_answers gate where gate.tenant_id=c.tenant_id and gate.checklist_id=c.id and gate.question_id=q->'condition'->>'questionId' and gate.value=q->'condition'->'equals'))
 and (a.id is null or (not a.not_applicable and ((q->>'type'='check' and a.value is distinct from 'true'::jsonb) or (q->>'type' in ('text','choice') and length(btrim(a.value#>>'{}'))=0) or ((q->>'type'='photo' or coalesce((q->>'proof')::boolean,false)) and a.attachment_id is null)))));
$$;

create or replace function public.task_control_context(target_tenant uuid,target_task uuid,page_offset integer default 0,query text default '') returns jsonb language plpgsql stable security definer set search_path='' as $$
declare t public.work_order_tasks;manager boolean;r jsonb;begin
 select * into t from public.work_order_tasks where tenant_id=target_tenant and id=target_task;
 if t.id is null or not private.task_control_access(target_tenant,t.work_order_id) then raise exception 'Gegevens niet beschikbaar' using errcode='42501';end if;
 manager:=private.work_order_access(target_tenant) and private.management_allowed(target_tenant,'backoffice.work_orders.read') and private.management_allowed(target_tenant,'backoffice.functions.work_order_dossier');
 if page_offset<0 or page_offset>10000 or length(query)>200 then raise exception 'Ongeldige selectie' using errcode='23514';end if;
 select jsonb_build_object('taskId',t.id,'orderId',t.work_order_id,'objectId',(select object_id from public.work_orders where tenant_id=t.tenant_id and id=t.work_order_id),'name',t.task_name,'version',t.execution_version,'config',t.execution_snapshot,
 'executedQuantity',coalesce(t.executed_quantity,0),'remainingQuantity',t.quantity-t.transferred_quantity-t.withdrawn_quantity,'commerciallyApprovedQuantity',t.commercially_approved_quantity,'canFinance',private.management_allowed(target_tenant,'backoffice.finance.write') and private.commercial_access(target_tenant),'originalQuantity',coalesce(t.original_quantity,t.quantity),'quantity',t.quantity,'originalBudget',t.original_budget_minutes,'currentBudget',t.current_budget_minutes,
 'activeVisitId',(select session.visit_id from private.task_visit_sessions session where session.tenant_id=target_tenant and session.work_order_id=t.work_order_id and session.personnel_id=private.current_personnel_id(target_tenant) and session.ends_at is null),'canEdit',private.task_control_access(target_tenant,t.work_order_id,true) and private.task_execution_allowed(t) and exists(select 1 from public.work_orders w where w.tenant_id=target_tenant and w.id=t.work_order_id and w.report_state in ('draft','correction') and w.status in ('in_progress','correction_required')),'canRecheck',manager and private.task_control_access(target_tenant,t.work_order_id,true),'canAdd',t.execution_snapshot->>'mode' in ('rooms','items') and coalesce((t.execution_snapshot#>>'{config,allowExtraTargets}')::boolean,false) and manager and private.task_control_access(target_tenant,t.work_order_id,true) and private.management_allowed(target_tenant,'backoffice.functions.save_work_order'),
 'counts',(select jsonb_build_object('total',count(*),'completed',count(*)filter(where e.state='completed'),'exceptions',count(*)filter(where e.state in ('not_done','not_applicable')),'deviations',count(*)filter(where e.state='completed' and e.outcome<>'pass'))
 from private.task_targets x join lateral(select * from private.task_target_executions e where e.tenant_id=x.tenant_id and e.target_id=x.id order by round desc limit 1)e on true where x.tenant_id=target_tenant and x.task_id=t.id and x.withdrawn_at is null),
 'targets',coalesce((select jsonb_agg(value order by value->>'number',value->>'id') from (
 select jsonb_build_object('id',x.id,'quantity',x.quantity,'number',x.snapshot->>'number','name',x.snapshot->>'name','snapshot',x.snapshot,'origin',x.origin,'executionId',e.id,'version',e.version,'state',e.state,'outcome',e.outcome,'followup',e.followup,'finding',case when manager or e.actor_id=auth.uid() then e.finding else '' end,'exceptionReason',e.exception_reason,'own',e.actor_id=auth.uid(),'round',e.round) value
 from private.task_targets x join lateral(select * from private.task_target_executions e where e.tenant_id=x.tenant_id and e.target_id=x.id order by round desc limit 1)e on true
 where x.tenant_id=target_tenant and x.task_id=t.id and x.withdrawn_at is null and (query='' or x.snapshot::text ilike '%'||query||'%') order by x.snapshot->>'number',x.id offset page_offset limit 25) rows),'[]'),
 'checklists',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'revisionId',c.template_revision_id,'taskId',c.task_id,'targetExecutionId',c.target_execution_id,'name',c.name,'version',v.version,'questions',c.definition->'questions','questionStates',private.checklist_question_states(c),
 'answers',coalesce((select jsonb_agg(jsonb_build_object('questionId',a.question_id,'value',a.value,'notApplicable',a.not_applicable,'reason',a.reason,'attachmentId',a.attachment_id,'version',a.version,'actor',a.updated_by,'updatedAt',a.updated_at)) from public.work_order_checklist_answers a where a.tenant_id=c.tenant_id and a.checklist_id=c.id and (manager or a.updated_by=auth.uid())),'[]')) order by c.id)
 from public.work_order_checklists c join public.work_order_template_versions v on v.tenant_id=c.tenant_id and v.id=c.template_revision_id
 where c.tenant_id=target_tenant and c.task_id=t.id and (c.target_execution_id is null or c.target_execution_id in(select (value->>'executionId')::uuid from jsonb_array_elements(coalesce(r->'targets','[]'))))), '[]')) into r;
 -- Limit answer payloads to the visible target page (task checklist remains visible).
 r:=jsonb_set(r,'{checklists}',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'revisionId',c.template_revision_id,'taskId',c.task_id,'targetExecutionId',c.target_execution_id,'name',c.name,'version',v.version,'questions',c.definition->'questions','questionStates',private.checklist_question_states(c),
 'answers',coalesce((select jsonb_agg(jsonb_build_object('questionId',a.question_id,'value',a.value,'notApplicable',a.not_applicable,'reason',a.reason,'attachmentId',a.attachment_id,'version',a.version,'actor',a.updated_by,'updatedAt',a.updated_at)) from public.work_order_checklist_answers a where a.tenant_id=c.tenant_id and a.checklist_id=c.id and (manager or a.updated_by=auth.uid())),'[]')) order by c.id)
 from public.work_order_checklists c join public.work_order_template_versions v on v.tenant_id=c.tenant_id and v.id=c.template_revision_id
 where c.tenant_id=target_tenant and c.task_id=t.id and (c.target_execution_id is null or c.target_execution_id in(select (value->>'executionId')::uuid from jsonb_array_elements(r->'targets')))), '[]'));
 return r;
end$$;

create or replace function public.task_item_context(target_tenant uuid,target_object uuid,query text default '',page_offset integer default 0) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not ((private.management_allowed(target_tenant,'backoffice.objects.read') and private.management_allowed(target_tenant,'backoffice.functions.object_dossier')) or (private.work_order_access(target_tenant) and private.management_allowed(target_tenant,'backoffice.functions.work_order_options'))) then raise exception 'Geen contexttoegang' using errcode='42501';end if;
 if not private.object_manage(target_tenant) or not exists(select 1 from public.objects where tenant_id=target_tenant and id=target_object) then raise exception 'Gegevens niet beschikbaar' using errcode='42501';end if;
 if page_offset<0 or page_offset>100000 or length(query)>200 then raise exception 'Ongeldige selectie' using errcode='23514';end if;
 return jsonb_build_object('canManage',private.management_allowed(target_tenant,'backoffice.objects.write') and private.management_allowed(target_tenant,'backoffice.functions.save_object_dossier'),
 'objects',coalesce((select jsonb_agg(jsonb_build_object('id',o.id,'name',o.name)) from public.objects o where o.tenant_id=target_tenant and o.active and o.customer_id=(select customer_id from public.objects where tenant_id=target_tenant and id=target_object)),'[]'),
 'items',coalesce((select jsonb_agg(to_jsonb(x)) from(select i.* from private.task_items i where i.tenant_id=target_tenant and i.object_id=target_object and (query='' or concat_ws(' ',i.id,i.item_number,i.name,i.item_type,i.model,i.serial_number) ilike '%'||query||'%') order by i.item_number,i.id offset page_offset limit 25)x),'[]'),
 'total',(select count(*) from private.task_items i where i.tenant_id=target_tenant and i.object_id=target_object and (query='' or concat_ws(' ',i.id,i.item_number,i.name,i.item_type,i.model,i.serial_number) ilike '%'||query||'%')),
 'nodes',coalesce((with recursive tree as(select n.id,n.parent_id,n.name,n.name::text path from public.object_nodes n where n.tenant_id=target_tenant and n.object_id=target_object and n.parent_id is null and n.active union all select n.id,n.parent_id,n.name,t.path||' / '||n.name from public.object_nodes n join tree t on t.id=n.parent_id where n.tenant_id=target_tenant and n.object_id=target_object and n.active)select jsonb_agg(to_jsonb(tree) order by path,id) from tree),'[]'));
end$$;

create or replace function public.task_control_command(target_tenant uuid,input jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare action text:=input->>'action';mid uuid:=(input->>'mutationId')::uuid;hash text;prior private.work_order_commands;r jsonb;t public.work_order_tasks;w public.work_orders;
 i private.task_items;old_item private.task_items;x private.task_targets;e private.task_target_executions;selection jsonb;total numeric;finished integer;all_count integer;exceptions integer;added_count integer:=0;c record;begin
 if not private.object_session_active() or not private.service_enabled(target_tenant,'planning') or mid is null or jsonb_typeof(input)<>'object' then raise exception 'Geen actuele toegang of ongeldige wijziging' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended('fieldgrid-planning:'||target_tenant::text,0));
 if not private.object_session_active() then raise exception 'Actuele sessie vereist' using errcode='42501';end if;
 if action='item_save' then
  perform private.management_assert(target_tenant,'backoffice.objects.write');perform private.management_assert(target_tenant,'backoffice.functions.save_object_dossier');
  if not private.object_manage(target_tenant) then raise exception 'Geen itembeheer' using errcode='42501';end if;
 else
  select * into t from public.work_order_tasks where tenant_id=target_tenant and id=(input->>'taskId')::uuid for update;
  select * into w from public.work_orders where tenant_id=target_tenant and id=t.work_order_id for update;
  if t.id is null or not private.task_control_access(target_tenant,w.id,true) or not private.task_execution_allowed(t) then raise exception 'Geen actuele uitvoeringstoegang' using errcode='42501';end if;
  if w.archive_at is not null or w.status in ('approved','invoice_ready','invoiced','cancelled') or w.report_state not in ('draft','correction') then raise exception 'De vastgelegde oplevering blijft behouden; vraag een rapportcorrectie' using errcode='23514';end if;
 end if;
 hash:=encode(extensions.digest(input::text,'sha256'),'hex');select * into prior from private.work_order_commands where id=mid;
 if found then if(prior.tenant_id,prior.actor_id,prior.command,prior.payload_hash) is distinct from(target_tenant,auth.uid(),'task-control:'||action,hash) then raise exception 'Ongeldige herhaalsleutel' using errcode='23514';end if;return prior.result;end if;
 if action='item_save' then
  select * into old_item from private.task_items where tenant_id=target_tenant and id=(input->>'id')::uuid for update;
  if input ? 'id' and old_item.id is null then raise exception 'Item niet beschikbaar' using errcode='42501';end if;
  if old_item.id is not null and old_item.version is distinct from(input->>'version')::bigint then raise exception 'Item is gewijzigd' using errcode='40001';end if;
  if not exists(select 1 from public.objects o where o.tenant_id=target_tenant and o.id=(input->>'objectId')::uuid and o.customer_id=(input->>'customerId')::uuid and o.active) then raise exception 'Kies een actief object van deze klant' using errcode='23514';end if;
  if coalesce(input->>'serialNumber','')<>'' and not coalesce((input->>'duplicatesReviewed')::boolean,false) and exists(select 1 from private.task_items other where other.tenant_id=target_tenant and lower(other.serial_number)=lower(input->>'serialNumber') and other.id is distinct from old_item.id) then raise exception 'Mogelijke dubbele registratie: zoek eerst op serienummer en bevestig de selectie' using errcode='23514';end if;
  if old_item.id is null then
   insert into private.task_items(tenant_id,customer_id,object_id,node_id,name,item_type,brand,model,serial_number,replaces_id,status)
   values(target_tenant,(input->>'customerId')::uuid,(input->>'objectId')::uuid,nullif(input->>'nodeId','')::uuid,btrim(input->>'name'),btrim(input->>'itemType'),coalesce(input->>'brand',''),coalesce(input->>'model',''),coalesce(input->>'serialNumber',''),nullif(input->>'replacesId','')::uuid,coalesce(input->>'status','active')) returning * into i;
  else
   update private.task_items set customer_id=(input->>'customerId')::uuid,object_id=(input->>'objectId')::uuid,node_id=nullif(input->>'nodeId','')::uuid,name=btrim(input->>'name'),item_type=btrim(input->>'itemType'),brand=coalesce(input->>'brand',''),model=coalesce(input->>'model',''),serial_number=coalesce(input->>'serialNumber',''),status=coalesce(input->>'status',status),version=version+1 where tenant_id=target_tenant and id=old_item.id returning * into i;
  end if;
  insert into private.task_item_history(tenant_id,item_id,version,snapshot,actor_id) values(target_tenant,i.id,i.version,to_jsonb(i),auth.uid());
  r:=jsonb_build_object('ok',true,'id',i.id,'version',i.version);
 elsif action='targets_add' then
  perform private.management_assert(target_tenant,'backoffice.work_orders.write');perform private.management_assert(target_tenant,'backoffice.functions.save_work_order');
  if not private.object_manage(target_tenant) then raise exception 'Vraag een bevoegde planner om extra doelen' using errcode='42501';end if;
  if t.execution_version is distinct from(input->>'version')::bigint then raise exception 'Taakscope is gewijzigd' using errcode='40001';end if;
  if jsonb_typeof(input->'targets') is distinct from 'array' or jsonb_array_length(input->'targets') not between 1 and 500 or length(btrim(coalesce(input->>'reason','')))<5 then raise exception 'Kies doelen en beschrijf de scopewijziging' using errcode='23514';end if;
  for selection in select value from jsonb_array_elements(input->'targets') loop
   if exists(select 1 from private.task_targets current where current.tenant_id=target_tenant and current.task_id=t.id and current.withdrawn_at is null and (current.item_id=nullif(selection->>'itemId','')::uuid or current.node_id=nullif(selection->>'nodeId','')::uuid)) then continue;end if;
   perform private.task_target_add(t,selection,'added',input->>'reason');added_count:=added_count+1;
  end loop;
  if added_count>0 then
  perform private.task_refresh_budget(t.id);
  update public.work_order_tasks set execution_version=execution_version+1,completed_at=null,execution_state=case when coalesce(executed_quantity,0)>0 then 'partial' else 'planned' end where tenant_id=target_tenant and id=t.id returning * into t;
  end if;
  r:=jsonb_build_object('ok',true,'id',t.id,'version',t.execution_version);
 elsif action='scope_price_accept' then
  perform private.management_assert(target_tenant,'backoffice.finance.write');
  if not private.commercial_access(target_tenant) or length(btrim(coalesce(input->>'reason','')))<5 then raise exception 'Afzonderlijk prijsakkoord en financiële bevoegdheid vereist' using errcode='42501';end if;
  if t.execution_version is distinct from(input->>'version')::bigint then raise exception 'Taakscope is gewijzigd' using errcode='40001';end if;
  if t.agreement_line_id is not null or t.commercial_snapshot ? 'quote_id' then raise exception 'Deze contract- of offerteprijs vereist eerst een gewijzigde commerciële afspraak' using errcode='23514';end if;
  update public.work_order_tasks set commercially_approved_quantity=quantity,execution_version=execution_version+1 where tenant_id=target_tenant and id=t.id returning * into t;
  r:=jsonb_build_object('ok',true,'id',t.id,'version',t.execution_version);
 elsif action in ('target_result','target_recheck','target_withdraw') then
  select * into x from private.task_targets where tenant_id=target_tenant and task_id=t.id and id=(input->>'targetId')::uuid and withdrawn_at is null for update;
  select * into e from private.task_target_executions where tenant_id=target_tenant and target_id=x.id order by round desc limit 1 for update;
  if x.id is null then raise exception 'Doel niet beschikbaar' using errcode='42501';end if;
  if e.version is distinct from(input->>'version')::bigint then raise exception 'Deze controle is gewijzigd. Je invoer blijft behouden.' using errcode='40001';end if;
  if action='target_withdraw' then
   perform private.management_assert(target_tenant,'backoffice.work_orders.write');perform private.management_assert(target_tenant,'backoffice.functions.save_work_order');
   if not private.object_manage(target_tenant) or e.state='completed' or length(btrim(coalesce(input->>'reason','')))<5 then raise exception 'Intrekking vereist beheer, onuitgevoerd doel en reden' using errcode='23514';end if;
   update private.task_targets set withdrawn_at=clock_timestamp(),reason=input->>'reason',version=version+1 where id=x.id;
   update public.work_order_tasks set withdrawn_quantity=withdrawn_quantity+x.quantity where id=t.id;
   perform private.task_refresh_budget(t.id);
  elsif action='target_recheck' then
   perform private.management_assert(target_tenant,'backoffice.work_orders.write');perform private.management_assert(target_tenant,'backoffice.functions.record_task_execution');
   if not private.object_manage(target_tenant) or length(btrim(coalesce(input->>'reason','')))<5 or e.state not in ('completed','not_done','not_applicable') then raise exception 'Hercontrole vereist beheer, afgeronde controle en reden' using errcode='23514';end if;
   insert into private.task_target_executions(tenant_id,work_order_id,task_id,target_id,round,exception_reason) values(target_tenant,w.id,t.id,x.id,e.round+1,input->>'reason') returning * into e;
   if t.execution_snapshot#>>'{config,checklistMode}'='target' then perform private.task_checklist_attach(target_tenant,w.id,t.id,e.id,nullif(x.snapshot#>>'{norm,checklistRevisionId}','')::uuid);end if;
  else
   if w.status not in ('in_progress','correction_required') or e.state in ('completed','not_done','not_applicable') then raise exception 'Een afgeronde controle vereist een expliciete hercontrole' using errcode='23514';end if;
   if input->>'state' not in ('in_progress','completed','not_done','not_applicable') then raise exception 'Kies een uitvoeringsstatus' using errcode='23514';end if;
   if input->>'state'='completed' then
    if input->>'outcome' is null or input->>'outcome' not in ('pass','deviation','rejected','followup') then raise exception 'Leg de technische uitkomst afzonderlijk vast' using errcode='23514';end if;
    if input->>'outcome'='pass' and exists(select 1 from public.work_order_checklists checklist cross join lateral jsonb_array_elements(checklist.definition->'questions') question join public.work_order_checklist_answers answer on answer.tenant_id=checklist.tenant_id and answer.checklist_id=checklist.id and answer.question_id=question->>'id' where checklist.tenant_id=target_tenant and checklist.target_execution_id=e.id and not answer.not_applicable and question ? 'outcomeRule' and (not(question ? 'condition') or exists(select 1 from public.work_order_checklist_answers gate where gate.tenant_id=checklist.tenant_id and gate.checklist_id=checklist.id and gate.question_id=question#>>'{condition,questionId}' and gate.value=question#>'{condition,equals}')) and ((question->'outcomeRule' ? 'equals' and answer.value is distinct from question#>'{outcomeRule,equals}') or (question->'outcomeRule' ? 'minimum' and (answer.value#>>'{}')::numeric<(question#>>'{outcomeRule,minimum}')::numeric) or (question->'outcomeRule' ? 'maximum' and (answer.value#>>'{}')::numeric>(question#>>'{outcomeRule,maximum}')::numeric))) then raise exception 'Een controleantwoord wijkt af van de grens- of uitslagregel. Leg een afwijking en bevinding vast.' using errcode='23514';end if;
    if input->>'outcome'<>'pass' and length(btrim(coalesce(input->>'finding','')))<5 then raise exception 'Beschrijf de afwijking en opvolging' using errcode='23514';end if;
    for c in select id from public.work_order_checklists where tenant_id=target_tenant and target_execution_id=e.id loop
     if not private.task_checklist_ready(c.id) then raise exception 'Vul de verplichte controleantwoorden en bewijsgegevens in' using errcode='23514';end if;
    end loop;
    if t.execution_snapshot#>>'{config,identification}'='required' and not coalesce((input->>'identified')::boolean,false) then raise exception 'Bevestig de itemidentificatie' using errcode='23514';end if;
    if coalesce((t.execution_snapshot#>>'{config,photoPerTarget}')::boolean,false) and nullif(input->>'attachmentId','') is null then raise exception 'Een bewijsfoto voor dit doel is verplicht' using errcode='23514';end if;
   end if;
   if input->>'state' in ('not_done','not_applicable') and length(btrim(coalesce(input->>'reason','')))<5 then raise exception 'Niet uitvoeren vereist een reden' using errcode='23514';end if;
   if nullif(input->>'attachmentId','') is not null and not exists(select 1 from public.attachments a where a.tenant_id=target_tenant and a.work_order_id=w.id and a.id=(input->>'attachmentId')::uuid and a.deleted_at is null and a.mime_type in ('image/png','image/jpeg','image/webp') and (a.uploaded_by=auth.uid() or private.object_manage(target_tenant))) then raise exception 'Kies eigen doelgebonden bewijs uit deze werkbon' using errcode='42501';end if;
   update private.task_target_executions set state=input->>'state',outcome=case when input->>'state'='completed' then input->>'outcome' end,followup=coalesce(input->>'followup','none'),finding=coalesce(input->>'finding',''),exception_reason=coalesce(input->>'reason',''),attachment_id=nullif(input->>'attachmentId','')::uuid,customer_visible=coalesce((input->>'customerVisible')::boolean,false),actor_id=auth.uid(),version=version+1,completed_at=case when input->>'state'<>'in_progress' then clock_timestamp() end where id=e.id returning * into e;
  end if;
  select count(*),count(*)filter(where current.state='completed'),count(*)filter(where current.state in ('not_done','not_applicable')),coalesce(sum(target.quantity)filter(where current.state='completed'),0) into all_count,finished,exceptions,total
  from private.task_targets target join lateral(select state from private.task_target_executions exe where exe.tenant_id=target.tenant_id and exe.target_id=target.id order by round desc limit 1)current on true where target.tenant_id=target_tenant and target.task_id=t.id and target.withdrawn_at is null;
  update public.work_order_tasks set executed_quantity=total,execution_state=case when finished=all_count then 'completed' when total>0 then 'partial' else 'in_progress' end,completed_at=case when finished=all_count then clock_timestamp() end,completion_note=case when exceptions>0 then exceptions||' doelen niet uitgevoerd; resterende scope blijft open' else null end where tenant_id=target_tenant and id=t.id;
  r:=jsonb_build_object('ok',true,'id',e.id,'version',e.version);
 else raise exception 'Onbekende taakhandeling' using errcode='23514';end if;
 if w.id is not null then update public.work_orders set version=version+1 where tenant_id=target_tenant and id=w.id;end if;
 insert into private.work_order_commands values(mid,target_tenant,auth.uid(),'task-control:'||action,hash,r,clock_timestamp());
 insert into public.audit_events(tenant_id,actor_user_id,action,entity_type,entity_id,after_data) values(target_tenant,auth.uid(),'task_control.'||action,case when w.id is null then 'task_item' else 'work_order' end,coalesce(w.id,i.id),jsonb_build_object('result',r,'reason',input->>'reason','taskId',t.id));
 return r;
end$$;

CREATE OR REPLACE FUNCTION public.task_catalogue(target_tenant uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare finance boolean;
begin
 perform private.management_assert(target_tenant,'backoffice.tasks.read');
 perform private.management_assert(target_tenant,'backoffice.functions.task_catalogue');

 if not private.object_session_active() or not private.planning_access(target_tenant) then raise exception 'Geen toegang tot taakbeheer' using errcode='42501';end if;
 finance:=private.commercial_access(target_tenant);
 return jsonb_build_object('finance',finance,
  'categories',coalesce((select jsonb_agg(to_jsonb(c) order by c.name,c.id) from public.task_categories c where c.tenant_id=target_tenant),'[]'),
  'checklists',coalesce((select jsonb_agg(jsonb_build_object('revisionId',v.id,'name',c.name,'version',v.version,'questions',v.definition->'questions') order by c.name,v.version desc) from public.work_order_templates c join public.work_order_template_versions v on v.tenant_id=c.tenant_id and v.template_id=c.id where c.tenant_id=target_tenant and c.kind='checklist' and v.state='published'),'[]'),'tasks',coalesce((select jsonb_agg(jsonb_build_object('id',t.id,'categoryId',t.category_id,'code',t.code,'name',t.name,'description',t.description,'discipline',t.discipline,'active',t.active,'version',t.version,'revisionId',r.id,'duration',r.duration_minutes,'unit',r.unit,'executionConfig',r.execution_config,'requiresPhoto',r.requires_photo,'requiresSignature',r.requires_customer_signature,'extraWork',coalesce(e.active,false))||case when finance then jsonb_build_object('priceCents',r.price_cents,'vatBasisPoints',r.vat_basis_points) else '{}' end order by t.code,t.id)
   from public.task_catalog t left join lateral(select * from public.task_revisions r where r.tenant_id=t.tenant_id and r.task_id=t.id and r.valid_until is null order by r.revision desc limit 1)r on true left join public.extra_work_rules e on e.tenant_id=t.tenant_id and e.task_revision_id=r.id where t.tenant_id=target_tenant),'[]'));
end $function$;

CREATE OR REPLACE FUNCTION public.task_catalogue_command(target_tenant uuid, input jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare c public.task_categories;t public.task_catalog;r public.task_revisions;new_revision public.task_revisions;
 prior private.work_order_commands;mid uuid:=(input->>'mutationId')::uuid;action text:=input->>'action';hash text;result jsonb;new_code text;number integer;price bigint;vat integer;
begin
 perform private.management_assert(target_tenant,'backoffice.tasks.write');
 perform private.management_assert(target_tenant,'backoffice.functions.task_catalogue_command');

 if not private.object_manage(target_tenant) then raise exception 'Geen toegang tot taakbeheer' using errcode='42501';end if;
 if mid is null or action not in('category_save','category_active','task_save','task_active') or jsonb_typeof(input)<>'object' then raise exception 'Ongeldige taakwijziging' using errcode='23514';end if;
 perform pg_advisory_xact_lock(hashtextextended('task-catalogue:'||target_tenant,0));
 hash:=encode(extensions.digest(input::text,'sha256'),'hex');select * into prior from private.work_order_commands where id=mid;
 if found then if(prior.tenant_id,prior.actor_id,prior.command,prior.payload_hash) is distinct from(target_tenant,auth.uid(),'catalogue:'||action,hash) then raise exception 'Ongeldige herhaalsleutel' using errcode='23514';end if;return prior.result;end if;
 if action like 'category_%' then
  if nullif(input->>'id','') is not null then
   select * into c from public.task_categories where tenant_id=target_tenant and id=(input->>'id')::uuid for update;
   if c.id is null then raise exception 'Categorie niet beschikbaar' using errcode='42501';end if;
   if c.version is distinct from (input->>'version')::bigint then raise exception 'Categorie is gewijzigd' using errcode='40001';end if;
  end if;
  if action='category_active' then
   if c.id is null or jsonb_typeof(input->'active')<>'boolean' then raise exception 'Kies een categorie en status' using errcode='23514';end if;
   update public.task_categories set active=(input->>'active')::boolean,version=version+1,updated_at=clock_timestamp() where id=c.id returning * into c;
  else
   if c.id is null then insert into public.task_categories(tenant_id,name,prefix) values(target_tenant,btrim(input->>'name'),upper(btrim(input->>'prefix'))) returning * into c;
   else update public.task_categories set name=btrim(input->>'name'),prefix=upper(btrim(input->>'prefix')),version=version+1,updated_at=clock_timestamp() where id=c.id returning * into c;end if;
  end if;
  result:=jsonb_build_object('ok',true,'id',c.id,'version',c.version);
 else
  if nullif(input->>'id','') is not null then
   select * into t from public.task_catalog where tenant_id=target_tenant and id=(input->>'id')::uuid for update;
   if t.id is null then raise exception 'Taak niet beschikbaar' using errcode='42501';end if;
   if t.version is distinct from(input->>'version')::bigint then raise exception 'Taak is gewijzigd' using errcode='40001';end if;
   select * into r from public.task_revisions where tenant_id=target_tenant and task_id=t.id and valid_until is null order by revision desc limit 1 for update;
  end if;
  if action='task_active' then
   if t.id is null or jsonb_typeof(input->'active')<>'boolean' then raise exception 'Kies een taak en status' using errcode='23514';end if;
   update public.task_catalog set active=(input->>'active')::boolean,version=version+1 where id=t.id returning * into t;
  else
   if length(btrim(coalesce(input->>'name',''))) not between 2 and 180 or length(btrim(coalesce(input->>'discipline',''))) not between 2 and 100 or coalesce((input->>'duration')::integer,0) not between 1 and 1440 or length(coalesce(input->>'description',''))>3000 then raise exception 'Controleer naam, discipline en duur' using errcode='23514';end if;
   if not private.service_enabled(target_tenant,'rapportage') and(coalesce((input->>'extraWork')::boolean,false) or coalesce((input->>'requiresPhoto')::boolean,false) or coalesce((input->>'requiresSignature')::boolean,false)) then raise exception 'Rapportage is nodig voor bewijs en meerwerk' using errcode='23514';end if;
   if t.id is not null and not private.commercial_access(target_tenant) then
    if input ? 'priceCents' or input ? 'vatBasisPoints' then raise exception 'Tariefbeheer vereist' using errcode='42501';end if;
    price:=r.price_cents;vat:=r.vat_basis_points;
   else price:=(input->>'priceCents')::bigint;vat:=(input->>'vatBasisPoints')::integer;end if;
   if price is null or price<0 or vat is null or vat not between 0 and 10000 then raise exception 'Controleer prijs en btw' using errcode='23514';end if;
   if t.id is null then
    select * into c from public.task_categories where tenant_id=target_tenant and id=(input->>'categoryId')::uuid and active for update;
    if c.id is null then raise exception 'Kies een actieve taakcategorie' using errcode='23514';end if;
    number:=c.next_number;
    loop
     new_code:=c.prefix||'-'||lpad(number::text,greatest(3,length(number::text)),'0');
     exit when not exists(select 1 from public.task_catalog where tenant_id=target_tenant and task_catalog.code=new_code);
     number:=number+1;if number>=999999999 then raise exception 'Nummerreeks is uitgeput' using errcode='23514';end if;
    end loop;
    update public.task_categories set next_number=number+1,version=version+1,updated_at=clock_timestamp() where id=c.id;
    insert into public.task_catalog(tenant_id,category_id,code,name,description,discipline) values(target_tenant,c.id,new_code,btrim(input->>'name'),input->>'description',btrim(input->>'discipline')) returning * into t;
   else
    if input ? 'categoryId' then
     select * into c from public.task_categories where tenant_id=target_tenant and id=(input->>'categoryId')::uuid and(active or id=t.category_id);
     if c.id is null then raise exception 'Kies een actieve categorie binnen deze organisatie' using errcode='23514';end if;
    end if;
    update public.task_catalog set category_id=coalesce(c.id,category_id),name=btrim(input->>'name'),description=input->>'description',discipline=btrim(input->>'discipline'),version=version+1 where id=t.id returning * into t;
    update public.task_revisions set valid_until=greatest(clock_timestamp(),valid_from+interval '1 microsecond') where id=r.id;
   end if;
   if (coalesce(input->'executionConfig',r.execution_config)->>'mode'='once' and coalesce(input->>'unit',r.unit,'task')<>'task') or (coalesce(input->'executionConfig',r.execution_config)->>'mode'='items' and coalesce(input->>'unit',r.unit,'task')<>'item') or (coalesce(input->'executionConfig',r.execution_config)->>'mode'='rooms' and coalesce(input->>'unit',r.unit,'task') not in ('room','square_metre')) then raise exception 'Kies een passende eenheid bij de toepassingsvorm' using errcode='23514';end if;
   perform private.task_execution_config(target_tenant,coalesce(input->'executionConfig',r.execution_config,'{}'::jsonb));
   insert into public.task_revisions(tenant_id,task_id,revision,duration_minutes,price_cents,vat_basis_points,unit,requires_photo,requires_customer_signature,execution_config)
   values(target_tenant,t.id,coalesce(r.revision,0)+1,(input->>'duration')::integer,price,vat,coalesce(input->>'unit',r.unit,'task'),coalesce((input->>'requiresPhoto')::boolean,false),coalesce((input->>'requiresSignature')::boolean,false),coalesce(input->'executionConfig',r.execution_config,'{}'::jsonb)) returning * into new_revision;
   insert into public.qualification_requirements(tenant_id,code,scope,subject_id,hard_requirement,active) select target_tenant,code,'task_revision',new_revision.id,true,true from jsonb_array_elements_text(coalesce(new_revision.execution_config->'qualifications','[]')) code;
   if coalesce((input->>'extraWork')::boolean,false) then insert into public.extra_work_rules(tenant_id,task_revision_id,requires_photo,requires_review) values(target_tenant,new_revision.id,new_revision.requires_photo,true);end if;
  end if;
  result:=jsonb_build_object('ok',true,'id',t.id,'version',t.version,'code',t.code);
 end if;
 insert into private.work_order_commands values(mid,target_tenant,auth.uid(),'catalogue:'||action,hash,result,clock_timestamp());
 insert into public.audit_events(tenant_id,actor_user_id,action,entity_type,entity_id,after_data) values(target_tenant,auth.uid(),'catalogue.'||action,case when action like 'category_%' then 'task_category' else 'task' end,(result->>'id')::uuid,result);
 return result;
end $function$;

CREATE OR REPLACE FUNCTION private.task_revision_requirements_immutable()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
 if(new.requires_photo,new.requires_customer_signature,new.execution_config,new.unit) is distinct from(old.requires_photo,old.requires_customer_signature,old.execution_config,old.unit) then raise exception 'Bewijsafspraken horen bij een nieuwe taakversie' using errcode='23514';end if;
 return new;
end $function$;

CREATE OR REPLACE FUNCTION public.work_order_options(target_tenant uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare fin boolean;s public.tenant_settings;res jsonb;
begin
 perform private.management_assert(target_tenant,'backoffice.work_orders.read');
 perform private.management_assert(target_tenant,'backoffice.functions.work_order_options');

 if not private.work_order_access(target_tenant) then raise exception 'Geen toegang tot werkbonnen' using errcode='42501';end if;
 fin:=private.work_order_access(target_tenant,true);select * into s from public.tenant_settings where tenant_id=target_tenant;
 select jsonb_build_object('finance',fin,'canManageSignature',private.has_role(target_tenant,array['tenant_admin','management']::public.app_role[]) and private.management_allowed(target_tenant,'backoffice.work_orders.write') and private.management_allowed(target_tenant,'backoffice.functions.change_work_order_signature_policy'),'defaultPaymentTermsDays',s.payment_terms_days,
 'defaultSignatureMode',coalesce(s.settings->'workOrders'->>'signatureMode',case when s.signature_required_default then 'required' else 'none' end),
 'customers',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'name',c.name,'customer_number',c.customer_number) order by c.name,c.id) from public.customers c where tenant_id=target_tenant and status not in ('archived','inactive')),'[]'),
 'objects',coalesce((select jsonb_agg(jsonb_build_object('id',o.id,'customer_id',o.customer_id,'name',o.name,'address',o.address,'signatureMode',coalesce(to_jsonb(o)->>'signature_mode','inherit'),'instructions',o.arrival_instruction) order by o.name,o.id) from public.objects o where tenant_id=target_tenant and active and dossier_status not in ('archived','paused')),'[]'),
 'contacts',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'customer_id',c.customer_id,'objectIds',c.object_ids,'full_name',c.full_name,'email',c.email,'phone',c.phone) order by c.full_name,c.id) from public.customer_contacts c where c.tenant_id=target_tenant and c.active),'[]'),
 'personnel',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'full_name',p.full_name,'personnel_number',p.employee_number) order by p.full_name,p.id) from public.personnel p where p.tenant_id=target_tenant and p.status='active' and exists(select 1 from public.tenant_memberships m where m.tenant_id=p.tenant_id and m.user_id=p.user_id and m.status='active' and 'staff'=any(m.roles))),'[]'),
 'planners',coalesce((select jsonb_agg(jsonb_build_object('id',m.user_id,'label',coalesce(p.full_name,u.email,'Planner')) order by coalesce(p.full_name,u.email),m.user_id) from public.tenant_memberships m join auth.users u on u.id=m.user_id left join public.personnel p on p.tenant_id=m.tenant_id and p.user_id=m.user_id where m.tenant_id=target_tenant and m.status='active' and m.roles&&array['tenant_admin','management','planner']::public.app_role[]),'[]'),
 'tasks',coalesce((select jsonb_agg(jsonb_build_object('id',t.id,'revisionId',r.id,'code',t.code,'name',t.name,'discipline',t.discipline,'unit',r.unit,'durationMinutes',r.duration_minutes,'executionConfig',r.execution_config,'normVersions',coalesce((select jsonb_agg(jsonb_build_object('id',n.id,'minutes',n.minutes,'basis',n.basis,'variantKey',n.variant_key,'effectiveOn',n.effective_on,'comparisonKey',n.comparison_key) order by n.effective_on) from private.task_norm_versions n where n.tenant_id=r.tenant_id and n.task_id=r.task_id),'[]'))||case when fin then jsonb_build_object('priceCents',r.price_cents,'vatBasisPoints',r.vat_basis_points) else '{}' end order by t.name,t.id) from public.task_catalog t join lateral(select * from public.task_revisions r where r.tenant_id=t.tenant_id and r.task_id=t.id and r.valid_until is null order by revision desc limit 1)r on true where t.tenant_id=target_tenant and t.active),'[]'),
 'templates',coalesce((select jsonb_agg(jsonb_build_object('id',t.id,'name',t.name,'kind',t.kind,'revisionId',v.id,'version',v.version,'editVersion',v.edit_version,'state',v.state,'definition',v.definition) order by t.name,v.version desc) from public.work_order_templates t join public.work_order_template_versions v on v.tenant_id=t.tenant_id and v.template_id=t.id where t.tenant_id=target_tenant),'[]'),
 'disciplines',coalesce((select jsonb_agg(d.discipline order by d.discipline) from (select distinct discipline from public.task_catalog where tenant_id=target_tenant and active)d),'[]')) into res;
 return res;
end $function$;

CREATE OR REPLACE FUNCTION public.save_work_order(target_tenant uuid, input jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare w public.work_orders;old_w public.work_orders;prior private.work_order_commands;mid uuid:=(input->>'mutationId')::uuid;oid uuid:=(input->>'id')::uuid;hash text;
 item jsonb;r jsonb;planning jsonb;revision public.task_revisions;task public.task_catalog;contact public.customer_contacts;template public.work_order_template_versions;template_name text;
 task_row public.work_order_tasks; norm_snapshot jsonb; norm_day date;target_selection jsonb; task_quantity numeric; task_json jsonb;old_tasks jsonb;new_tasks jsonb;new_checklists uuid[];old_checklists uuid[];cid uuid;slot uuid;warn text;
begin
 perform private.management_assert(target_tenant,'backoffice.work_orders.write');
 perform private.management_assert(target_tenant,'backoffice.functions.save_work_order');

 if not private.object_session_active() or not private.planning_access(target_tenant) then raise exception 'Geen toegang tot werkbonbeheer' using errcode='42501';end if;
 if mid is null or oid is null or input->>'version' is null or (input->>'version')::bigint<0 then raise exception 'Een wijzigingssleutel en versie zijn verplicht' using errcode='23514';end if;
 perform pg_advisory_xact_lock(hashtextextended('fieldgrid-planning:'||target_tenant::text,0));
 hash:=encode(extensions.digest(input::text,'sha256'),'hex');select * into prior from private.work_order_commands where id=mid;
 if found then if (prior.tenant_id,prior.actor_id,prior.command,prior.payload_hash) is distinct from (target_tenant,auth.uid(),'save',hash) then raise exception 'Ongeldige herhaalsleutel' using errcode='23514';end if;return prior.result;end if;
 if not exists(select 1 from public.objects o join public.customers c on c.tenant_id=o.tenant_id and c.id=o.customer_id where o.tenant_id=target_tenant and o.id=(input->>'objectId')::uuid and c.id=(input->>'customerId')::uuid and o.active and c.status not in ('archived','inactive')) then raise exception 'Selecteer een object van de gekozen klant' using errcode='23514';end if;
 if length(btrim(coalesce(input->>'title','')))<2 or length(input->>'title')>180 or length(btrim(coalesce(input->>'discipline','')))=0 or length(input->>'description')>10000 or length(input->>'instructions')>4000 then raise exception 'Vul titel, dienst en geldige instructies in' using errcode='23514';end if;
 if coalesce(input->>'state','') not in ('draft','unassigned','tentative','final') or coalesce(input->>'signatureMode','') not in ('inherit','none','optional','required') or coalesce((input->>'requiredPersonnel')::int,0) not between 1 and 100 then raise exception 'Controleer planning en ondertekeninstellingen' using errcode='23514';end if;
 if nullif(input->>'plannerId','') is not null and not exists(select 1 from public.tenant_memberships m where m.tenant_id=target_tenant and m.user_id=(input->>'plannerId')::uuid and m.status='active' and m.roles&&array['tenant_admin','management','planner']::public.app_role[]) then raise exception 'Kies een actieve planner van deze organisatie' using errcode='23514';end if;
 if nullif(input->>'leadPersonnelId','') is not null and not exists(select 1 from jsonb_array_elements(input->'assignments')x where x->>'personnelId'=input->>'leadPersonnelId') then raise exception 'De uitvoeringsverantwoordelijke moet aan deze bon zijn toegewezen' using errcode='23514';end if;
 for item in select * from jsonb_array_elements(coalesce(input->'assignments','[]')) loop
 if not exists(select 1 from public.personnel p join public.tenant_memberships m on m.tenant_id=p.tenant_id and m.user_id=p.user_id where p.tenant_id=target_tenant and p.id=(item->>'personnelId')::uuid and p.status='active' and m.status='active' and 'staff'=any(m.roles)) then raise exception 'Een medewerker heeft geen actieve uitvoeringstoegang' using errcode='23514';end if;end loop;
 select * into old_w from public.work_orders where tenant_id=target_tenant and id=oid for update;
 if old_w.id is null and (input->>'version')::bigint<>0 or old_w.id is not null and old_w.version<>(input->>'version')::bigint then raise exception 'De werkbon is intussen gewijzigd. Laad de actuele versie.' using errcode='40001';end if;
 if old_w.id is not null and (old_w.actual_start_at is not null or old_w.status not in ('planned','released','seen','travelling') or old_w.archive_at is not null) then raise exception 'De uitvoering is gestart of afgesloten; de afgesproken scope blijft bewaard' using errcode='23514';end if;
 if old_w.id is not null and (old_w.customer_id<>(input->>'customerId')::uuid or old_w.object_id<>(input->>'objectId')::uuid) then raise exception 'Klant en object van een bestaande bon blijven vastgelegd. Maak zo nodig een nieuwe bon.' using errcode='23514';end if;
 if old_w.published_at is not null and (old_w.signature_mode,old_w.employee_signature_required) is distinct from (input->>'signatureMode',(input->>'employeeSignatureRequired')::boolean) then raise exception 'Wijzig een gepubliceerde ondertekenafspraak via het gemotiveerde beleid in het rapportdossier' using errcode='23514';end if;
 if (old_w.id is null and input->>'signatureMode'<>'inherit' or old_w.id is not null and old_w.signature_mode<>input->>'signatureMode') and not private.has_role(target_tenant,array['tenant_admin','management']::public.app_role[]) then raise exception 'Alleen beheer kan afwijken van het ondertekenbeleid' using errcode='42501';end if;
 if coalesce(old_w.employee_signature_required,false) is distinct from coalesce((input->>'employeeSignatureRequired')::boolean,false) and not private.has_role(target_tenant,array['tenant_admin','management']::public.app_role[]) then raise exception 'Alleen beheer wijzigt de medewerkershandtekening' using errcode='42501';end if;
 task_json:=coalesce(input->'tasks','[]');
 if old_w.id is not null and coalesce((input->>'preserveTasks')::boolean,false) then select coalesce(jsonb_agg(jsonb_build_object('revisionId',task_revision_id,'quantity',quantity,'instructions',instructions)),'[]') into task_json from public.work_order_tasks where work_order_id=oid;end if;
 if jsonb_array_length(task_json)>100 or (input->>'state'<>'draft' and jsonb_array_length(task_json)=0) then raise exception 'Kies minimaal één taak voor deze werkbon' using errcode='23514';end if;
 if nullif(input->>'templateRevisionId','') is not null then
 select v.* into template from public.work_order_template_versions v join public.work_order_templates t on t.id=v.template_id where v.tenant_id=target_tenant and v.id=(input->>'templateRevisionId')::uuid and t.kind='work_order' and (v.state='published' or (v.state='archived' and old_w.template_snapshot->>'id'=v.id::text));
 if template.id is null then raise exception 'Kies een gepubliceerde werkbontemplate' using errcode='23514';end if;
 select name into template_name from public.work_order_templates where id=template.template_id;
 end if;
 select coalesce(array_agg(x::uuid order by x),'{}') into new_checklists from jsonb_array_elements_text(coalesce(input->'checklistRevisionIds','[]'))x;
 select coalesce(array_agg(template_revision_id order by template_revision_id),'{}') into old_checklists from public.work_order_checklists where work_order_id=oid and task_id is null;
 select coalesce(jsonb_agg(jsonb_build_object('revisionId',task_revision_id,'quantity',quantity,'instructions',instructions) order by task_revision_id,quantity,instructions),'[]') into old_tasks from public.work_order_tasks where work_order_id=oid;
 select coalesce(jsonb_agg(jsonb_build_object('revisionId',x->>'revisionId','quantity',(x->>'quantity')::numeric,'instructions',coalesce(x->>'instructions','')) order by x->>'revisionId',(x->>'quantity')::numeric,x->>'instructions'),'[]') into new_tasks from jsonb_array_elements(task_json)x;
 if old_w.id is not null and (old_tasks<>new_tasks or old_checklists<>new_checklists) and (old_w.published_at is not null or old_w.quote_id is not null or exists(select 1 from public.work_order_tasks t where t.work_order_id=oid and (t.execution_state<>'planned' or t.agreement_line_id is not null)) or exists(select 1 from public.work_order_checklist_answers a join public.work_order_checklists c on c.id=a.checklist_id where c.work_order_id=oid)) then raise exception 'De gepubliceerde of commerciële taken en antwoorden blijven behouden. Maak een gecontroleerde opvolgbon voor nieuwe scope.' using errcode='23514';end if;
 begin
 if nullif(input->>'windowStart','') is not null or nullif(input->>'windowEnd','') is not null then
  if (input->>'windowStart')::timestamptz is null or (input->>'windowEnd')::timestamptz<=(input->>'windowStart')::timestamptz then raise exception 'Controleer het klanttijdvenster' using errcode='23514';end if;
  if old_w.appointment_slot_id is not null then update public.appointment_slots set starts_at=(input->>'windowStart')::timestamptz,ends_at=(input->>'windowEnd')::timestamptz where id=old_w.appointment_slot_id;slot:=old_w.appointment_slot_id;
  else insert into public.appointment_slots(tenant_id,starts_at,ends_at,capacity,booked_count,status) values(target_tenant,(input->>'windowStart')::timestamptz,(input->>'windowEnd')::timestamptz,1,1,'full') returning id into slot;end if;
 else slot:=old_w.appointment_slot_id;end if;
 if old_w.id is null then
 insert into public.work_orders(id,tenant_id,work_order_number,customer_id,object_id,discipline,created_by,planning_state)
 values(oid,target_tenant,'WB-'||to_char(clock_timestamp(),'YYYY')||'-'||upper(substr(replace(oid::text,'-',''),1,12)),(input->>'customerId')::uuid,(input->>'objectId')::uuid,input->>'discipline',auth.uid(),input->>'state');
 end if;
 update public.work_orders set title=btrim(input->>'title'),description=coalesce(input->>'description',''),discipline=input->>'discipline',priority=coalesce(input->>'priority','normal'),labels=array(select jsonb_array_elements_text(coalesce(input->'labels','[]'))),
 planner_user_id=nullif(input->>'plannerId','')::uuid,lead_personnel_id=nullif(input->>'leadPersonnelId','')::uuid,signature_mode=input->>'signatureMode',employee_signature_required=coalesce((input->>'employeeSignatureRequired')::boolean,false),
 planning_state=input->>'state',deadline=nullif(input->>'deadline','')::date,budget_labor_minutes=nullif(input->>'durationMinutes','')::int,
 requested_date=nullif(input->>'requestedDate','')::date,customer_window_kind=input->>'windowKind',required_personnel=(input->>'requiredPersonnel')::int,day_instructions=coalesce(input->>'instructions',''),appointment_slot_id=slot,
 details=details||jsonb_build_object('customerReference',coalesce(input->>'customerReference',''),'purchaseOrder',coalesce(input->>'purchaseOrder',''),'costCenter',coalesce(input->>'costCenter',''),'locationLabel',coalesce(input->>'locationLabel','')),
 template_snapshot=case when template.id is not null then jsonb_build_object('id',template.id,'name',template_name,'version',template.version,'definition',template.definition) else template_snapshot end
 where id=oid returning * into w;
 if old_w.id is null or old_tasks<>new_tasks then
 delete from public.work_order_tasks where work_order_id=oid;
 for item in select * from jsonb_array_elements(task_json) loop
 select * into revision from public.task_revisions where tenant_id=target_tenant and id=(item->>'revisionId')::uuid;
 select * into task from public.task_catalog where tenant_id=target_tenant and id=revision.task_id and active;
 if task.id is null or not((item->>'quantity')::numeric>0) or (item->>'quantity')::numeric>100000 then raise exception 'Controleer taak en hoeveelheid' using errcode='23514';end if;
 norm_day:=coalesce(nullif(input->>'requestedDate','')::date,(nullif(input->>'start','')::timestamptz at time zone (select timezone from public.tenants where id=target_tenant))::date,(clock_timestamp() at time zone (select timezone from public.tenants where id=target_tenant))::date);
 norm_snapshot:=private.task_norm_snapshot(revision,norm_day)||jsonb_build_object('variantNorms',coalesce((select jsonb_object_agg(variant->>'key',private.task_norm_snapshot(revision,norm_day,variant->>'key')) from jsonb_array_elements(coalesce(revision.execution_config->'variants','[]')) variant),'{}'));
 task_quantity:=case when norm_snapshot->>'mode'='once' then 1 when norm_snapshot->>'mode' in ('rooms','items') then (select case when revision.unit='square_metre' then sum((value->>'quantity')::numeric) else count(*) end from jsonb_array_elements(coalesce(item->'targets','[]'))) else (item->>'quantity')::numeric end;
 if task_quantity is null or task_quantity<=0 or task_quantity>100000 or jsonb_array_length(coalesce(item->'targets','[]'))>5000 then raise exception 'Kies de concrete doelen en een geldige hoeveelheid' using errcode='23514';end if;
 insert into public.work_order_tasks(tenant_id,work_order_id,task_revision_id,task_code,task_name,duration_minutes,quantity,unit,unit_price_cents,vat_basis_points,instructions,added_by,execution_snapshot)
 values(target_tenant,oid,revision.id,task.code,task.name,revision.duration_minutes,task_quantity,revision.unit,revision.price_cents,revision.vat_basis_points,coalesce(item->>'instructions',''),auth.uid(),norm_snapshot) returning * into task_row;
 if norm_snapshot->>'mode' in ('rooms','items') then
 for target_selection in select value from jsonb_array_elements(coalesce(item->'targets','[]')) loop perform private.task_target_add(task_row,target_selection,'original','');end loop;
 end if;
 if revision.execution_config->>'checklistMode'='task' then perform private.task_checklist_attach(target_tenant,oid,task_row.id,null,nullif(norm_snapshot->>'checklistRevisionId','')::uuid);end if;
 perform private.task_refresh_budget(task_row.id);
 end loop;end if;
 delete from public.work_order_contacts where work_order_id=oid;
 for item in select * from jsonb_array_elements(coalesce(input->'contacts','[]')) loop
 select * into contact from public.customer_contacts where tenant_id=target_tenant and customer_id=w.customer_id and id=(item->>'id')::uuid and active and (cardinality(object_ids)=0 or w.object_id=any(object_ids));
 if not found then raise exception 'Contactpersoon hoort niet bij deze klant of dit object' using errcode='23514';end if;
 insert into public.work_order_contacts(tenant_id,work_order_id,contact_id,roles,snapshot) values(target_tenant,oid,contact.id,array(select jsonb_array_elements_text(item->'roles')),jsonb_build_object('name',contact.full_name,'email',contact.email,'phone',contact.phone));
 end loop;
 if old_checklists<>new_checklists then
 delete from public.work_order_checklists where work_order_id=oid and task_id is null;
 foreach cid in array new_checklists loop
 insert into public.work_order_checklists(tenant_id,work_order_id,template_revision_id,name,definition)
 select target_tenant,oid,v.id,t.name,v.definition from public.work_order_template_versions v join public.work_order_templates t on t.id=v.template_id where v.tenant_id=target_tenant and v.id=cid and v.state='published' and t.kind='checklist';
 if not found then raise exception 'Kies een gepubliceerde checklistversie' using errcode='23514';end if;
 end loop;end if;
 if nullif(input->>'start','') is not null or old_w.projected_start_at is not null or jsonb_array_length(coalesce(input->'assignments','[]'))>0 then
 select * into w from public.work_orders where id=oid;
 planning:=public.change_work_order_planning(target_tenant,oid,w.version,gen_random_uuid(),nullif(input->>'start','')::timestamptz,nullif(input->>'end','')::timestamptz,coalesce(input->'assignments','[]'),array(select jsonb_array_elements_text(coalesce(input->'confirmedWarnings','[]'))));
 if not (planning->>'ok')::boolean then raise exception 'Planning vraagt bevestiging' using errcode='P0001',detail=planning::text;end if;
 end if;
 if not coalesce((input->>'preserveTasks')::boolean,false) then update public.work_orders set budget_labor_minutes=ceil((select sum(coalesce(current_budget_minutes,duration_minutes*quantity)) from public.work_order_tasks where tenant_id=target_tenant and work_order_id=oid)) where tenant_id=target_tenant and id=oid;end if;
 select * into w from public.work_orders where id=oid;
 r:=jsonb_build_object('ok',true,'id',w.id,'version',w.version);
 insert into private.work_order_commands values(mid,target_tenant,auth.uid(),'save',hash,r,clock_timestamp());
 insert into public.audit_events(tenant_id,actor_user_id,action,entity_type,entity_id,after_data) values(target_tenant,auth.uid(),case when old_w.id is null then 'work_order.created' else 'work_order.updated' end,'work_order',w.id,jsonb_build_object('version',w.version,'planningState',w.planning_state));
 return r;
 exception when sqlstate 'P0001' then get stacked diagnostics warn=pg_exception_detail;if warn is null or warn='' then raise;end if;return warn::jsonb||jsonb_build_object('error','Controleer en bevestig de planningswaarschuwingen.');
 end;
end $function$;

CREATE OR REPLACE FUNCTION public.attach_work_order_checklist(target_tenant uuid, input jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare w public.work_orders;v public.work_order_template_versions;template_name text;
 prior private.work_order_commands;mid uuid:=(input->>'mutationId')::uuid;hash text;result jsonb;
begin
 perform private.management_assert(target_tenant,'backoffice.work_orders.write');
 perform private.management_assert(target_tenant,'backoffice.functions.attach_work_order_checklist');

 if not private.object_manage(target_tenant) or not private.service_enabled(target_tenant,'rapportage') then raise exception 'Geen checklistbeheer' using errcode='42501';end if;
 if jsonb_typeof(input)<>'object' or mid is null or (input->>'version')::bigint is null or (input->>'version')::bigint<1 or input->>'orderId' is null or input->>'revisionId' is null or exists(select 1 from jsonb_object_keys(input) k where k not in('mutationId','orderId','revisionId','version')) then raise exception 'Ongeldige checklistwijziging' using errcode='23514';end if;
 perform pg_advisory_xact_lock(hashtextextended('fieldgrid-planning:'||target_tenant::text,0));
 hash:=encode(extensions.digest(input::text,'sha256'),'hex');select * into prior from private.work_order_commands where id=mid;
 if found then if(prior.tenant_id,prior.actor_id,prior.command,prior.payload_hash) is distinct from(target_tenant,auth.uid(),'checklist:attach',hash) then raise exception 'Ongeldige herhaalsleutel' using errcode='23514';end if;return prior.result;end if;
 select * into w from public.work_orders where tenant_id=target_tenant and id=(input->>'orderId')::uuid for update;
 if w.id is null then raise exception 'Werkbon niet beschikbaar' using errcode='42501';end if;
 if w.version is distinct from(input->>'version')::bigint then raise exception 'Werkbon is intussen gewijzigd' using errcode='40001';end if;
 if w.archive_at is not null or w.status in('approved','invoice_ready','invoiced','cancelled') or w.report_state not in('draft','correction') then raise exception 'Vraag eerst een rapportcorrectie. De vastgelegde oplevering blijft behouden.' using errcode='23514';end if;
 select tv.* into v from public.work_order_template_versions tv join public.work_order_templates t on t.tenant_id=tv.tenant_id and t.id=tv.template_id where tv.tenant_id=target_tenant and tv.id=(input->>'revisionId')::uuid and tv.state='published' and t.kind='checklist';
 if v.id is null then raise exception 'Kies een gepubliceerde checklistversie van deze organisatie' using errcode='23514';end if;
 if exists(select 1 from public.work_order_checklists c where c.tenant_id=target_tenant and c.work_order_id=w.id and c.task_id is null and c.template_revision_id=v.id) then raise exception 'Deze checklistversie is al gekoppeld' using errcode='23514';end if;
 if (select count(*) from public.work_order_checklists c where c.tenant_id=target_tenant and c.work_order_id=w.id and c.task_id is null)>=20 then raise exception 'Maximaal twintig checklists per werkbon' using errcode='23514';end if;
 select name into template_name from public.work_order_templates where tenant_id=target_tenant and id=v.template_id;
 insert into public.work_order_checklists(tenant_id,work_order_id,template_revision_id,name,definition) values(target_tenant,w.id,v.id,template_name,v.definition);
 update public.work_orders set version=version+1,updated_at=clock_timestamp() where tenant_id=target_tenant and id=w.id returning * into w;
 result:=jsonb_build_object('ok',true,'id',w.id,'version',w.version);
 insert into private.work_order_commands values(mid,target_tenant,auth.uid(),'checklist:attach',hash,result,clock_timestamp());
 insert into public.audit_events(tenant_id,actor_user_id,action,entity_type,entity_id,after_data) values(target_tenant,auth.uid(),'work_order.checklist_added','work_order',w.id,jsonb_build_object('revisionId',v.id,'name',template_name,'version',v.version));
 return result;
end $function$;

CREATE OR REPLACE FUNCTION public.answer_work_order_checklist(target_tenant uuid, input jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare c public.work_order_checklists;w public.work_orders;a public.work_order_checklist_answers;q jsonb;prior private.work_order_commands;mid uuid:=(input->>'mutationId')::uuid;hash text;r jsonb;val jsonb:=input->'value';na boolean:=coalesce((input->>'notApplicable')::boolean,false);manager boolean;attachment uuid:=nullif(input->>'attachmentId','')::uuid;
begin


 if not private.object_session_active() then raise exception 'Een actieve sessie is vereist' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended('fieldgrid-planning:'||target_tenant::text,0));
 select * into c from public.work_order_checklists where tenant_id=target_tenant and id=(input->>'checklistId')::uuid;
 select * into w from public.work_orders where tenant_id=target_tenant and id=c.work_order_id for update;
 manager:=private.planning_access(target_tenant) and private.management_allowed(target_tenant,'backoffice.work_orders.write') and private.management_allowed(target_tenant,'backoffice.functions.answer_work_order_checklist');
 if w.id is null or not(manager or (private.has_role(target_tenant,array['staff']::public.app_role[]) and exists(select 1 from public.work_order_assignments crew join public.personnel p on p.tenant_id=crew.tenant_id and p.id=crew.personnel_id join public.dispatches d on d.assignment_id=crew.id and d.revoked_at is null where crew.work_order_id=w.id and p.user_id=auth.uid() and crew.status not in ('cancelled','returned')))) then raise exception 'Geen toegang tot deze checklist' using errcode='42501';end if;
 if w.status not in ('in_progress','completed','correction_required') or coalesce(to_jsonb(w)->>'report_state','draft') in ('waiting_signature','review','approved') then raise exception 'Antwoorden horen bij de actieve uitvoering; een ingediend rapport blijft bewaard' using errcode='23514';end if;
 if mid is null then raise exception 'Een herhaalsleutel is vereist' using errcode='23514';end if;
 hash:=encode(extensions.digest(input::text,'sha256'),'hex');select * into prior from private.work_order_commands where id=mid;
 if found then if (prior.tenant_id,prior.actor_id,prior.command,prior.payload_hash) is distinct from(target_tenant,auth.uid(),'answer',hash) then raise exception 'Ongeldige herhaalsleutel' using errcode='23514';end if;return prior.result;end if;
 if c.target_execution_id is not null and exists(select 1 from private.task_target_executions e where e.tenant_id=c.tenant_id and e.id=c.target_execution_id and e.state in ('completed','not_done','not_applicable')) then raise exception 'Deze controle is afgerond. Vraag een expliciete hercontrole.' using errcode='23514';end if;
 if c.task_id is not null and not exists(select 1 from public.work_order_tasks task where task.tenant_id=c.tenant_id and task.id=c.task_id and private.task_execution_allowed(task)) then raise exception 'Geen actuele taaktoegang' using errcode='42501';end if;
 select x into q from jsonb_array_elements(c.definition->'questions')x where x->>'id'=input->>'questionId';
 if q is null then raise exception 'Deze vraag bestaat niet in de checklistversie' using errcode='23514';end if;
 if na then if not coalesce((q->>'allowNA')::boolean,false) or length(btrim(coalesce(input->>'reason','')))<3 then raise exception 'Niet van toepassing vereist toestemming en een reden' using errcode='23514';end if;
 else
 if q->>'type' in ('check','boolean') and jsonb_typeof(val) is distinct from 'boolean' or q->>'type'='number' and jsonb_typeof(val) is distinct from 'number' or q->>'type' in ('text','choice') and jsonb_typeof(val) is distinct from 'string' then raise exception 'Het antwoord past niet bij deze vraag' using errcode='23514';end if;
 if q->>'type'='choice' and not((q->'options') ? (val#>>'{}')) then raise exception 'Kies een beschikbare antwoordoptie' using errcode='23514';end if;
 if length(val::text)>10000 then raise exception 'Het antwoord is te lang' using errcode='23514';end if;
 end if;
 if attachment is not null and not exists(select 1 from public.attachments x where x.tenant_id=target_tenant and x.id=attachment and x.work_order_id=w.id and x.deleted_at is null and x.mime_type in ('image/jpeg','image/png','image/webp')) then raise exception 'Kies een foto uit deze werkbon' using errcode='23514';end if;
 select * into a from public.work_order_checklist_answers where checklist_id=c.id and question_id=q->>'id' for update;
 if a.id is not null and a.updated_by<>auth.uid() and not manager then raise exception 'Checklistantwoord is niet van jou; vraag de backoffice om een correctie' using errcode='42501';end if;
   if attachment is not null and not manager and not exists(select 1 from public.attachments proof where proof.tenant_id=target_tenant and proof.work_order_id=w.id and proof.id=attachment and proof.uploaded_by=auth.uid()) then raise exception 'Kies een eigen bewijsfoto' using errcode='42501';end if;
   if coalesce(a.version,0)<>coalesce((input->>'version')::bigint,0) then raise exception 'Dit antwoord is intussen gewijzigd. Bekijk de actuele waarde.' using errcode='40001';end if;
 insert into public.work_order_checklist_answers(tenant_id,checklist_id,question_id,value,not_applicable,reason,attachment_id,updated_by) values(target_tenant,c.id,q->>'id',val,na,coalesce(input->>'reason',''),attachment,auth.uid())
 on conflict(tenant_id,checklist_id,question_id) do update set value=excluded.value,not_applicable=excluded.not_applicable,reason=excluded.reason,attachment_id=excluded.attachment_id,updated_by=excluded.updated_by,version=public.work_order_checklist_answers.version+1,updated_at=clock_timestamp() returning * into a;
 update public.work_orders set version=version+1 where id=w.id;
 r:=jsonb_build_object('ok',true,'id',a.id,'version',a.version);
 insert into private.work_order_commands values(mid,target_tenant,auth.uid(),'answer',hash,r,clock_timestamp());
 insert into public.audit_events(tenant_id,actor_user_id,action,entity_type,entity_id,after_data) values(target_tenant,auth.uid(),'work_order.checklist_answer','work_order',w.id,jsonb_build_object('checklistId',c.id,'questionId',q->>'id','answerVersion',a.version));
 return r;
end $function$;

CREATE OR REPLACE FUNCTION public.record_task_execution(target_tenant uuid, target_task uuid, expected_version bigint, result text, actual_quantity numeric, reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  task public.work_order_tasks;
  work public.work_orders;
  own_quantity numeric;
  manager_actor boolean;
  staff_actor boolean;
begin
  perform pg_advisory_xact_lock(
    hashtextextended('fieldgrid-planning:' || target_tenant::text, 0)
  );
  select * into task
  from public.work_order_tasks candidate
  where candidate.tenant_id = target_tenant and candidate.id = target_task
  for update;
  select * into work
  from public.work_orders candidate
  where candidate.tenant_id = target_tenant and candidate.id = task.work_order_id
  for update;

  manager_actor := task.id is not null and private.object_manage(target_tenant) and private.management_allowed(target_tenant,'backoffice.work_orders.write') and private.management_allowed(target_tenant,'backoffice.functions.record_task_execution');
  staff_actor := task.id is not null and private.work_order_execution_actor(
    target_tenant,
    task.work_order_id,
    auth.uid(),
    nullif(auth.jwt() ->> 'session_id', '')::uuid
  );
  if task.id is null
    or not private.service_enabled(target_tenant, 'planning')
    or not private.service_enabled(target_tenant, 'rapportage')
    or not (manager_actor or staff_actor)
    or not private.task_execution_allowed(task)
  then
    raise exception 'Geen actuele uitvoeringstoegang' using errcode = '42501';
  end if;
  if task.execution_version <> expected_version then
    raise exception 'De uitvoering is gewijzigd. Vernieuw de werkbon.' using errcode = '40001';
  end if;

  if task.execution_snapshot->>'mode' in ('rooms','items') then raise exception 'Leg de uitvoering per gekoppeld doel vast' using errcode='23514';end if;
  if result='completed' and exists(select 1 from public.work_order_checklists c where c.tenant_id=task.tenant_id and c.task_id=task.id and c.target_execution_id is null and not private.task_checklist_ready(c.id)) then raise exception 'Rond eerst de taakcontrole af' using errcode='23514';end if;
  own_quantity := task.quantity - task.transferred_quantity - task.withdrawn_quantity;
  if work.status not in ('in_progress', 'correction_required')
    or result not in ('in_progress', 'completed', 'partial', 'not_done', 'not_applicable')
    or actual_quantity is null
    or actual_quantity < 0
    or actual_quantity > own_quantity
    or (result = 'completed' and actual_quantity <> own_quantity)
    or (result in ('not_done', 'not_applicable') and actual_quantity <> 0)
    or (result = 'partial' and (actual_quantity <= 0 or actual_quantity >= own_quantity))
    or (result not in ('completed', 'in_progress') and length(btrim(coalesce(reason, ''))) < 5)
  then
    raise exception 'Controleer de eigen resterende hoeveelheid, uitvoeringsstatus en toelichting'
      using errcode = '23514';
  end if;

  update public.work_order_tasks updated
  set executed_quantity = actual_quantity,
      execution_state = result,
      completed_at = case when result = 'in_progress' then null else clock_timestamp() end,
      completion_note = reason
  where updated.id = task.id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.work_order_dossier(target_tenant uuid, target_order uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare w public.work_orders;fin boolean;manage boolean;r jsonb;
begin
 perform private.management_assert(target_tenant,'backoffice.work_orders.read');
 perform private.management_assert(target_tenant,'backoffice.functions.work_order_dossier');

 -- module-scoped work-order dossier
 if not private.work_order_access(target_tenant) then raise exception 'Geen toegang tot werkbonnen' using errcode='42501';end if;
 select * into w from public.work_orders where tenant_id=target_tenant and id=target_order;
 if not found then return null;end if;
 fin:=private.work_order_access(target_tenant,true);manage:=private.management_allowed(target_tenant,'backoffice.work_orders.write') and private.has_role(target_tenant,array['tenant_admin','management','planner']::public.app_role[]);
 select jsonb_build_object('order',private.work_order_row(w.id,fin)||jsonb_build_object('description',w.description,'labels',w.labels,'instructions',w.day_instructions,
 'customerReference',coalesce(w.details->>'customerReference',''),'purchaseOrder',coalesce(w.details->>'purchaseOrder',''),'costCenter',coalesce(w.details->>'costCenter',''),'locationLabel',coalesce(w.details->>'locationLabel',''),
 'leadPersonnelId',w.lead_personnel_id,'plannerId',w.planner_user_id,'requestedDate',w.requested_date,'windowStart',s.starts_at,'windowEnd',s.ends_at,'windowKind',w.customer_window_kind,'durationMinutes',w.budget_labor_minutes,
 'signatureMode',w.signature_mode,'employeeSignatureRequired',w.employee_signature_required,'publishedAt',w.published_at,'templateSnapshot',w.template_snapshot,'templateRevisionId',w.template_snapshot->>'id','requestId',w.request_id,'quoteId',w.quote_id),
 'finance',fin,'canManage',manage,'canReview',private.management_allowed(target_tenant,'backoffice.reports.write') and private.service_enabled(target_tenant,'rapportage') and private.has_role(target_tenant,array['tenant_admin','management','finance']::public.app_role[]),
 'contacts',coalesce((select jsonb_agg(jsonb_build_object('id',c.contact_id,'name',c.snapshot->>'name','roles',c.roles,'email',c.snapshot->>'email','phone',c.snapshot->>'phone') order by c.snapshot->>'name') from public.work_order_contacts c where c.work_order_id=w.id),'[]'),
 'tasks',coalesce((select jsonb_agg(case when fin then to_jsonb(t) else to_jsonb(t)-'unit_price_cents'-'vat_basis_points'-'commercial_snapshot'-'staff_requested_amount_cents' end order by t.created_at,t.id) from public.work_order_tasks t where t.work_order_id=w.id),'[]'),
 'assignments',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'personnelId',p.id,'name',p.full_name,'start',a.projected_start_at,'end',a.projected_end_at,'status',a.status,'seenAt',(select min(created_at) from public.status_events e where e.assignment_id=a.id and e.new_status='seen'),'actualStart',a.actual_start_at,'actualEnd',a.actual_end_at) order by a.projected_start_at,a.id) from public.work_order_assignments a join public.personnel p on p.tenant_id=a.tenant_id and p.id=a.personnel_id where a.work_order_id=w.id),'[]'),
 'times',coalesce((select jsonb_agg(jsonb_build_object('id',t.id,'personnelId',p.id,'name',p.full_name,'start',t.starts_at,'end',t.ends_at,'kind',t.kind,'status',t.status) order by t.starts_at,t.id) from public.time_entries t join public.work_order_assignments a on a.id=t.assignment_id join public.personnel p on p.id=t.personnel_id where private.service_enabled(target_tenant,'personeel') and a.work_order_id=w.id and t.tenant_id=w.tenant_id),'[]'),
 'checklists',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'revisionId',v.id,'name',c.name,'version',v.version,'questions',c.definition->'questions','answers',coalesce((select jsonb_agg(jsonb_build_object('questionId',a.question_id,'value',a.value,'notApplicable',a.not_applicable,'reason',a.reason,'attachmentId',a.attachment_id,'version',a.version,'actor',a.updated_by,'updatedAt',a.updated_at) order by a.question_id) from public.work_order_checklist_answers a where a.checklist_id=c.id),'[]')) order by c.created_at,c.id) from public.work_order_checklists c join public.work_order_template_versions v on v.id=c.template_revision_id where c.work_order_id=w.id and c.task_id is null),'[]'),
 'reports',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'body',r.body,'created_at',r.created_at,'customer_visible',r.customer_visible,'author',coalesce((select p.full_name from public.personnel p where p.tenant_id=r.tenant_id and p.user_id=r.author_user_id order by p.id limit 1),'Backoffice')) order by r.created_at,r.id) from public.report_entries r where private.service_enabled(target_tenant,'rapportage') and r.work_order_id=w.id and r.deleted_at is null),'[]'),
 'attachments',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'file_name',a.file_name,'mime_type',a.mime_type,'created_at',a.created_at,'customerVisible',a.customer_visible) order by a.created_at,a.id) from public.attachments a where private.service_enabled(target_tenant,'rapportage') and a.work_order_id=w.id and a.deleted_at is null),'[]'),
 'history',coalesce((select jsonb_agg(to_jsonb(h) order by h.at desc,h.id) from (
  select item->>'id' id,(item->>'at')::timestamptz at,item->>'author' actor,item->>'title' event,item->>'description' note
  from jsonb_array_elements(case when private.service_enabled(target_tenant,'rapportage') then private.execution_activity(target_tenant,w.id,auth.uid()) else '[]'::jsonb end) item
  union all
  select e.id::text,e.created_at,coalesce(p.full_name,case when e.actor_user_id is not null then 'Backoffice' else 'Automatisch' end),'status.'||e.new_status::text,e.note
  from public.status_events e left join public.personnel p on p.tenant_id=e.tenant_id and p.user_id=e.actor_user_id
  where e.tenant_id=w.tenant_id and e.work_order_id=w.id and not private.service_enabled(target_tenant,'rapportage')
  union all
  select e.id::text,e.created_at,coalesce(p.full_name,case when e.actor_user_id is not null then 'Backoffice' else 'Automatisch' end),e.action,
   coalesce(e.after_data->>'reason',case when e.action='work_order.checklist_added' then e.after_data->>'name' end)
  from public.audit_events e left join public.personnel p on p.tenant_id=e.tenant_id and p.user_id=e.actor_user_id
  where e.tenant_id=w.tenant_id and e.entity_type='work_order' and e.entity_id=w.id
   and (not private.service_enabled(target_tenant,'rapportage') or e.action not in('work_order.open','work_order.travel','work_order.start','work_order.stop','work_order.pause','work_order.resume','work_order.return','work_order.communication'))
 )h),'[]'),
 'financial',case when fin then jsonb_build_object(
  'materials',coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'description',m.description,'quantity',m.quantity,'unit',m.unit,'customerVisible',m.customer_visible,'unitPriceCents',f.unit_price_cents) order by m.created_at,m.id) from public.work_order_material_usage m left join private.work_order_material_finance f on f.tenant_id=m.tenant_id and f.usage_id=m.id where m.tenant_id=target_tenant and m.work_order_id=w.id and private.service_enabled(target_tenant,'rapportage')),'[]'),
  'expenses',coalesce((select jsonb_agg(jsonb_build_object('id',e.id,'description',e.description,'amountCents',e.amount_cents,'customerVisible',e.customer_visible) order by e.created_at,e.id) from public.work_order_expenses e where e.tenant_id=target_tenant and e.work_order_id=w.id and private.service_enabled(target_tenant,'rapportage')),'[]'),
  'invoices',coalesce((select jsonb_agg(jsonb_build_object('id',i.id,'number',i.invoice_number,'status',i.status,'totalCents',i.total_cents,'orderTotalCents',(select coalesce(sum(allocated.total_cents),0) from public.invoice_lines allocated where allocated.tenant_id=target_tenant and allocated.invoice_id=i.id and allocated.work_order_id=w.id),'paidCents',i.paid_cents,'pdfAvailable',i.pdf_storage_path is not null and i.pdf_sha256 is not null,'issuedOn',i.issued_on) order by i.created_at,i.id) from public.invoices i where i.tenant_id=target_tenant and private.service_enabled(target_tenant,'finance') and exists(select 1 from public.invoice_lines l where l.tenant_id=target_tenant and l.invoice_id=i.id and l.work_order_id=w.id)),'[]')
 ) else null end) into r from (select 1) dummy left join public.appointment_slots s on s.id=w.appointment_slot_id;
 return r;
end $function$;

CREATE OR REPLACE FUNCTION private.task_execution_allowed(task work_order_tasks)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select private.object_manage(task.tenant_id) or (
 private.is_work_order_assignee(task.tenant_id,task.work_order_id)
 and (task.assigned_personnel_id is null or task.assigned_personnel_id=private.current_personnel_id(task.tenant_id))
 and exists(select 1 from public.work_order_assignments a
 where a.tenant_id=task.tenant_id and a.work_order_id=task.work_order_id
 and a.personnel_id=private.current_personnel_id(task.tenant_id)
 and a.status not in ('completed','cancelled','returned') and (not exists(select 1 from private.task_visit_crew crew where crew.tenant_id=task.tenant_id and crew.assignment_id=a.id) or exists(select 1 from private.task_visit_sessions session where session.tenant_id=task.tenant_id and session.assignment_id=a.id and session.ends_at is null))));
$function$;

CREATE OR REPLACE FUNCTION private.staff_task_dto(task work_order_tasks)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select (
    select jsonb_object_agg(key, value)
    from jsonb_each(to_jsonb(task))
    where key = any(array[
      'id','tenant_id','work_order_id','task_revision_id','task_code','task_name',
      'quantity','unit','duration_minutes','is_extra_work','extra_work_status',
      'completed_at','created_at','updated_at','executed_quantity','execution_state',
      'execution_version','instructions','scope_root_task_id','transferred_quantity',
      'withdrawn_quantity','staff_request_reason','execution_snapshot','original_budget_minutes','current_budget_minutes','original_quantity'
    ])
  ) || jsonb_build_object(
    'staff_requested_amount_cents', case
      when task.added_by = auth.uid() then task.staff_requested_amount_cents
      else null
    end,
    'assigned_personnel_id', case
      when task.assigned_personnel_id = private.current_personnel_id(task.tenant_id)
      then task.assigned_personnel_id
    end,
    'completion_note', case
      when exists (
        select 1
        from public.work_order_task_contributions contribution
        where contribution.tenant_id = task.tenant_id
          and contribution.task_id = task.id
          and contribution.execution_version = task.execution_version
          and contribution.actor_id = auth.uid()
      ) then task.completion_note
    end,
    'can_execute', private.task_execution_allowed(task)
  )
$function$;

CREATE OR REPLACE FUNCTION private.work_order_checklist_errors(target_order uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare c record;q jsonb;a public.work_order_checklist_answers;condition_value jsonb;errors jsonb:='[]'::jsonb;
begin
 for c in select * from public.work_order_checklists checklist where work_order_id=target_order and (checklist.target_execution_id is null or checklist.target_execution_id=(select e.id from private.task_target_executions e where e.tenant_id=checklist.tenant_id and e.target_id in(select active.id from private.task_targets active where active.tenant_id=checklist.tenant_id and active.withdrawn_at is null) and e.target_id=(select current.target_id from private.task_target_executions current where current.id=checklist.target_execution_id and current.tenant_id=checklist.tenant_id) order by e.round desc limit 1)) loop
 for q in select * from jsonb_array_elements(coalesce(c.definition->'questions','[]')) loop
   if q ? 'condition' then
     select value into condition_value from public.work_order_checklist_answers where checklist_id=c.id and question_id=q->'condition'->>'questionId';
     if condition_value is distinct from q->'condition'->'equals' then continue;end if;
   end if;
   select * into a from public.work_order_checklist_answers where checklist_id=c.id and question_id=q->>'id';
   if a.not_applicable then
     if not coalesce((q->>'allowNA')::boolean,false) or length(btrim(a.reason))<3 then errors:=errors||jsonb_build_array(q->>'label');end if;
   elsif coalesce((q->>'required')::boolean,false) and (a.id is null or a.value is null or a.value in ('null'::jsonb,'""'::jsonb) or (q->>'type'='check' and a.value<>'true') or (q->>'type'='photo' and a.attachment_id is null)) then errors:=errors||jsonb_build_array(q->>'label');
   elsif (coalesce((q->>'proof')::boolean,false) or q->>'type'='photo') and a.id is not null and not exists(select 1 from public.attachments p where p.tenant_id=c.tenant_id and p.work_order_id=c.work_order_id and p.id=a.attachment_id and p.deleted_at is null and p.mime_type in ('image/jpeg','image/png','image/webp')) then errors:=errors||jsonb_build_array(q->>'label'||' (bewijs)');end if;
 end loop;end loop;
 return errors;
end $function$;

CREATE OR REPLACE FUNCTION private.work_order_report_snapshot_legacy(w work_orders, summary text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select jsonb_build_object(
    'schema', 1,
    'number', w.work_order_number,
    'title', coalesce(nullif(w.title, ''), w.discipline),
    'summary', summary,
    'tenant', jsonb_build_object(
      'name', te.name,
      'primaryColor', coalesce(b.primary_color, '#222C35'),
      'accentColor', coalesce(b.accent_color, '#41AC42')
    ),
    'customer', jsonb_build_object('name', c.name),
    'object', jsonb_build_object(
      'name', o.name,
      'address', jsonb_build_object(
        'street', o.address ->> 'street',
        'postal_code', o.address ->> 'postal_code',
        'city', o.address ->> 'city',
        'country', o.address ->> 'country'
      )
    ),
    'executionDate', coalesce(w.actual_start_at, w.projected_start_at),
    'endedAt', w.actual_end_at,
    'timezone', te.timezone,
    'tasks', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', t.id,
          'code', t.task_code,
          'name', t.task_name,
          'quantity', t.quantity,
          'unit', t.unit,
          'executedQuantity', coalesce(t.executed_quantity, case when t.completed_at is not null then t.quantity else 0 end),
          'result', t.execution_state,
          'transferredQuantity', coalesce((to_jsonb(t) ->> 'transferred_quantity')::numeric, 0),
          'withdrawnQuantity', coalesce((to_jsonb(t) ->> 'withdrawn_quantity')::numeric, 0),
          'extraWork', t.is_extra_work,
          'extraUnitPriceCents',case when t.is_extra_work and t.extra_work_status='approved' then t.unit_price_cents else null end
        )
        order by t.created_at, t.id
      )
      from public.work_order_tasks t
      where t.tenant_id = w.tenant_id
        and t.work_order_id = w.id
        and (not t.is_extra_work or t.extra_work_status <> 'rejected')
    ), '[]'::jsonb),
    'checklists', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'name', checklist.name || coalesce((select ' · ' || (x.snapshot->>'number') || ' · ' || (x.snapshot->>'name') from private.task_target_executions e join private.task_targets x on x.tenant_id=e.tenant_id and x.id=e.target_id where e.tenant_id=checklist.tenant_id and e.id=checklist.target_execution_id),''),
          'version', template.version,
          'question', question ->> 'label',
          'unit', question ->> 'unit',
          'type', question ->> 'type',
          'value', answer.value,
          'notApplicable', answer.not_applicable,
          'reason', case when answer.not_applicable then answer.reason else null end,
          'answerVersion', answer.version,
          'attachmentId', answer.attachment_id
        )
        order by checklist.created_at, question ->> 'id'
      )
      from public.work_order_checklists checklist
      join public.work_order_template_versions template
        on template.id = checklist.template_revision_id
      cross join lateral jsonb_array_elements(checklist.definition -> 'questions') question
      join public.work_order_checklist_answers answer
        on answer.checklist_id = checklist.id
       and answer.question_id = question ->> 'id'
      where checklist.tenant_id = w.tenant_id
        and checklist.work_order_id = w.id and (checklist.target_execution_id is null or checklist.target_execution_id=(select e.id from private.task_target_executions e where e.tenant_id=checklist.tenant_id and e.target_id in(select active.id from private.task_targets active where active.tenant_id=checklist.tenant_id and active.withdrawn_at is null) and e.target_id=(select current.target_id from private.task_target_executions current where current.id=checklist.target_execution_id and current.tenant_id=checklist.tenant_id) order by e.round desc limit 1))
        and coalesce((question ->> 'customerVisible')::boolean, false)
        and (
          question -> 'condition' is null
          or question -> 'condition' = 'null'::jsonb
          or exists (
            select 1
            from public.work_order_checklist_answers condition_answer
            where condition_answer.checklist_id = checklist.id
              and condition_answer.question_id = question -> 'condition' ->> 'questionId'
              and condition_answer.value = question -> 'condition' -> 'equals'
          )
        )
    ), '[]'::jsonb),
    'materials', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'description', material.description,
          'quantity', material.quantity,
          'unit', material.unit,
          'taskId', material.task_id,
          'unitPriceCents', finance.unit_price_cents
        )
        order by material.created_at, material.id
      )
      from public.work_order_material_usage material
      left join private.work_order_material_finance finance
        on finance.tenant_id = material.tenant_id and finance.usage_id = material.id
      where material.tenant_id = w.tenant_id
        and material.work_order_id = w.id
        and material.customer_visible
    ), '[]'::jsonb),
    'expenses', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', expense.id,
          'description', expense.description,
          'amountCents', expense.amount_cents
        )
        order by expense.created_at, expense.id
      )
      from public.work_order_expenses expense
      where expense.tenant_id = w.tenant_id
        and expense.work_order_id = w.id
        and expense.customer_visible
    ), '[]'::jsonb),
    'notes', coalesce((
      select jsonb_agg(
        jsonb_build_object('id', entry.id, 'body', entry.body, 'createdAt',entry.created_at)
        order by entry.created_at, entry.id
      )
      from public.report_entries entry
      where entry.tenant_id = w.tenant_id
        and entry.work_order_id = w.id
        and entry.customer_visible
        and entry.deleted_at is null
    ), '[]'::jsonb),
    'attachments', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', attachment.id,
          'name', attachment.file_name,
          'mime', attachment.mime_type,
          'sha256', attachment.sha256
        )
        order by attachment.created_at, attachment.id
      )
      from public.attachments attachment
      where attachment.tenant_id = w.tenant_id
        and attachment.work_order_id = w.id
        and attachment.deleted_at is null
        and (
          attachment.report_entry_id is null
          or exists (
            select 1
            from public.report_entries parent_entry
            where parent_entry.tenant_id = attachment.tenant_id
              and parent_entry.id = attachment.report_entry_id
              and parent_entry.work_order_id = attachment.work_order_id
              and parent_entry.deleted_at is null
          )
        )
        and (
          attachment.customer_visible
          or exists (
            select 1
            from public.work_order_checklists checklist
            cross join lateral jsonb_array_elements(checklist.definition -> 'questions') question
            join public.work_order_checklist_answers answer
              on answer.checklist_id = checklist.id
             and answer.question_id = question ->> 'id'
            where checklist.work_order_id = w.id
              and answer.attachment_id = attachment.id
              and coalesce((question ->> 'customerVisible')::boolean, false)
          )
        )
    ), '[]'::jsonb)
  )
  from public.tenants te
  left join public.tenant_branding b on b.tenant_id = te.id
  join public.customers c on c.tenant_id = te.id and c.id = w.customer_id
  join public.objects o on o.tenant_id = te.id and o.id = w.object_id
  where te.id = w.tenant_id;
$function$;

CREATE OR REPLACE FUNCTION public.staff_workspace(target_tenant uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  ids uuid[] := '{}'::uuid[];
  staff_personnel_id uuid;
  result jsonb;
begin
  if not private.object_session_active()
    or not private.has_role(target_tenant, array['staff']::public.app_role[])
    or not private.service_enabled(target_tenant, 'personeel')
  then
    raise exception 'Personeelstoegang vereist' using errcode = '42501';
  end if;

  select p.id
  into staff_personnel_id
  from public.personnel p
  where p.tenant_id = target_tenant
    and p.user_id = auth.uid()
    and p.status = 'active';

  -- Missing/inactive personnel is a friendly empty workspace. Authentication,
  -- tenant role and module checks above still fail closed.
  if staff_personnel_id is not null then
    select coalesce(array_agg(w.id), '{}'::uuid[])
    into ids
    from public.work_orders w
    where w.tenant_id = target_tenant
      and private.service_enabled(target_tenant, 'planning')
      and (
        private.is_work_order_assignee(target_tenant, w.id)
        -- A returned assignment is no longer an active execution capability,
        -- but remains visible to its employee as immutable planning/history.
        -- Keep this projection-only exception separate from
        -- is_work_order_assignee so storage and mutation guards stay closed.
        or (
          w.status <> 'cancelled'
          and exists (
            select 1
            from public.work_order_assignments returned_assignment
            where returned_assignment.tenant_id = target_tenant
              and returned_assignment.work_order_id = w.id
              and returned_assignment.personnel_id = staff_personnel_id
              and returned_assignment.status = 'returned'
              and exists (
                select 1
                from public.dispatches returned_dispatch
                where returned_dispatch.tenant_id = returned_assignment.tenant_id
                  and returned_dispatch.assignment_id = returned_assignment.id
                  and returned_dispatch.revoked_at is null
              )
          )
        )
      );
  end if;

  select jsonb_build_object(
    'customers', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', customer.id,
        'tenant_id', customer.tenant_id,
        'name', customer.name
      ))
      from public.customers customer
      where customer.tenant_id = target_tenant
        and exists (
          select 1 from public.work_orders w
          where w.id = any(ids) and w.customer_id = customer.id
        )
    ), '[]'::jsonb),
    -- The shared WorkspaceData.contacts shape is a backoffice customer-contact
    -- DTO. Staff gets a separate assignment-bound projection instead.
    'contacts', '[]'::jsonb,
    'staffContacts', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', contact.contact_id,
          'tenant_id', contact.tenant_id,
          'work_order_id', contact.work_order_id,
          'name', contact.snapshot ->> 'name',
          'email', contact.snapshot ->> 'email',
          'phone', contact.snapshot ->> 'phone',
          'roles', contact.roles
        )
        order by
          case when 'site' = any(contact.roles) then 0 when 'requester' = any(contact.roles) then 1 else 2 end,
          contact.snapshot ->> 'name',
          contact.contact_id
      )
      from public.work_order_contacts contact
      where contact.tenant_id = target_tenant
        and contact.work_order_id = any(ids)
    ), '[]'::jsonb),
    'objects', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', object.id,
        'tenant_id', object.tenant_id,
        'name', object.name,
        'address', object.address
      ))
      from public.objects object
      where object.tenant_id = target_tenant
        and exists (
          select 1 from public.work_orders w
          where w.id = any(ids) and w.object_id = object.id
        )
    ), '[]'::jsonb),
    'personnel', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', person.id,
        'tenant_id', person.tenant_id,
        'employee_number', person.employee_number,
        'full_name', person.full_name,
        'preferred_name', person.preferred_name,
        'email', person.email,
        'phone', person.phone,
        'mobile_phone', person.mobile_phone,
        'birth_date', person.birth_date,
        'status', person.status,
        'home_address', person.home_address,
        'emergency_contact', person.emergency_contact,
        'standard_vehicle', person.standard_vehicle,
        'departure_kind', person.departure_kind,
        'departure_depot_id', person.departure_depot_id,
        'alternate_departure_address', person.alternate_departure_address,
        'return_to_departure', person.return_to_departure,
        'driving_license', person.driving_license,
        'driving_license_categories', person.driving_license_categories,
        'carpool_allowed', person.carpool_allowed,
        'own_transport', person.own_transport,
        'travel_limitations', person.travel_limitations,
        'notification_preferences', person.notification_preferences,
        'availability_preferences', person.availability_preferences,
        'availability_self_service_enabled', person.availability_self_service_enabled,
        'onboarding_draft', person.onboarding_draft,
        'onboarding_step', person.onboarding_step,
        'onboarding_completed_at', person.onboarding_completed_at,
        'onboarding_version', person.onboarding_version,
        'version', person.version
      ))
      from public.personnel person
      where person.tenant_id = target_tenant and person.id = staff_personnel_id
    ), '[]'::jsonb),
    'staffDepots', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', depot.id,
          'tenant_id', depot.tenant_id,
          'name', depot.name
        )
        order by depot.name, depot.id
      )
      from public.travel_depots depot
      where staff_personnel_id is not null
        and depot.tenant_id = target_tenant
        and depot.active
    ), '[]'::jsonb),
    'visits',coalesce((select jsonb_agg(jsonb_build_object('id',v.id,'tenant_id',v.tenant_id,'work_order_id',v.work_order_id,'assignment_id',crew.assignment_id,'starts_at',v.starts_at,'ends_at',v.ends_at,'state',v.state,'own_session_start',session.starts_at,'own_session_end',session.ends_at) order by v.starts_at,v.id) from private.task_visits v join private.task_visit_crew crew on crew.tenant_id=v.tenant_id and crew.visit_id=v.id left join private.task_visit_sessions session on session.tenant_id=v.tenant_id and session.visit_id=v.id and session.personnel_id=staff_personnel_id where v.tenant_id=target_tenant and crew.personnel_id=staff_personnel_id and v.work_order_id=any(ids) and private.work_order_execution_actor(target_tenant,v.work_order_id,auth.uid(),nullif(auth.jwt()->>'session_id','')::uuid)),'[]'),'workOrders', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', w.id,
        'tenant_id', w.tenant_id,
        'customer_id', w.customer_id,
        'object_id', w.object_id,
        'work_order_number', w.work_order_number,
        'discipline', w.discipline,
        'title', w.title,
        'description', w.description,
        'status', w.status,
        'version', w.version,
        'report_version', w.report_version,
        'report_state', w.report_state,
        'signature_required', w.signature_required,
        'day_instructions', w.day_instructions,
        'projected_start_at', w.projected_start_at,
        'projected_end_at', w.projected_end_at,
        'actual_start_at', w.actual_start_at,
        'actual_end_at', w.actual_end_at,
        'published_at', w.published_at,
        'deadline', w.deadline,
        'requested_date', w.requested_date,
        'details', jsonb_strip_nulls(jsonb_build_object(
          'customerReference', w.details -> 'customerReference',
          'locationLabel', w.details -> 'locationLabel',
          'recurrence_window', w.details -> 'recurrence_window'
        ))
      ))
      from public.work_orders w
      where w.id = any(ids)
    ), '[]'::jsonb),
    'assignments', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', assignment.id,
        'tenant_id', assignment.tenant_id,
        'work_order_id', assignment.work_order_id,
        'personnel_id', assignment.personnel_id,
        'status', assignment.status,
        'planned_start_at', assignment.planned_start_at,
        'planned_end_at', assignment.planned_end_at,
        'projected_start_at', assignment.projected_start_at,
        'projected_end_at', assignment.projected_end_at,
        'departed_at', assignment.departed_at,
        'paused_at', assignment.paused_at,
        'actual_start_at', assignment.actual_start_at,
        'actual_end_at', assignment.actual_end_at,
        'return_reason_code', assignment.return_reason_code,
        'return_note', assignment.return_note,
        'version', assignment.version,
        'created_at', assignment.created_at
      ))
      from public.work_order_assignments assignment
      where assignment.tenant_id = target_tenant
        and assignment.work_order_id = any(ids)
        and assignment.personnel_id = staff_personnel_id
    ), '[]'::jsonb),
    'workOrderTasks', coalesce((
      select jsonb_agg(private.staff_task_dto(task))
      from public.work_order_tasks task
      where task.tenant_id = target_tenant and task.work_order_id = any(ids)
    ), '[]'::jsonb),
    'tasks', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', task.id,
        'tenant_id', task.tenant_id,
        'code', task.code,
        'discipline', task.discipline,
        'name', task.name,
        'description', task.description,
        'active', task.active
      ))
      from public.task_catalog task
      where private.service_enabled(target_tenant, 'planning')
        and task.tenant_id = target_tenant
        and exists (
          select 1
          from public.task_revisions relevant_revision
          where relevant_revision.tenant_id = task.tenant_id
            and relevant_revision.task_id = task.id
            and (
              exists (
                select 1 from public.work_order_tasks work_task
                where work_task.tenant_id = target_tenant
                  and work_task.work_order_id = any(ids)
                  and work_task.task_revision_id = relevant_revision.id
              )
              or exists (
                select 1
                from public.extra_work_rules allowed_rule
                join public.work_order_allowed_extra_work allowed
                  on allowed.tenant_id = allowed_rule.tenant_id
                 and allowed.extra_work_rule_id = allowed_rule.id
                where allowed_rule.tenant_id = target_tenant
                  and allowed_rule.task_revision_id = relevant_revision.id
                  and allowed.work_order_id = any(ids)
              )
            )
        )
    ), '[]'::jsonb),
    'taskRevisions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', task_revision.id,
        'tenant_id', task_revision.tenant_id,
        'task_id', task_revision.task_id,
        'revision', task_revision.revision,
        'duration_minutes', task_revision.duration_minutes,
        'unit', task_revision.unit,
        'valid_from', task_revision.valid_from,
        'valid_until', task_revision.valid_until
      ))
      from public.task_revisions task_revision
      where private.service_enabled(target_tenant, 'planning')
        and task_revision.tenant_id = target_tenant
        and (
          exists (
            select 1 from public.work_order_tasks work_task
            where work_task.tenant_id = target_tenant
              and work_task.work_order_id = any(ids)
              and work_task.task_revision_id = task_revision.id
          )
          or exists (
            select 1
            from public.extra_work_rules allowed_rule
            join public.work_order_allowed_extra_work allowed
              on allowed.tenant_id = allowed_rule.tenant_id
             and allowed.extra_work_rule_id = allowed_rule.id
            where allowed_rule.tenant_id = target_tenant
              and allowed_rule.task_revision_id = task_revision.id
              and allowed.work_order_id = any(ids)
          )
        )
    ), '[]'::jsonb),
    'reports', coalesce((
      select jsonb_agg(
        to_jsonb(entry) - 'author_user_id'
        || jsonb_build_object('owned_by_current_user', true)
      )
      from public.report_entries entry
      where private.service_enabled(target_tenant, 'rapportage')
        and entry.tenant_id = target_tenant
        and entry.work_order_id = any(ids)
        and entry.author_user_id = auth.uid()
        and entry.deleted_at is null
    ), '[]'::jsonb),
    'attachments', coalesce((
      select jsonb_agg(
        to_jsonb(attachment) - array['storage_path','storage_bucket','uploaded_by']
        || jsonb_build_object('owned_by_current_user', true)
      )
      from public.attachments attachment
      where private.service_enabled(target_tenant, 'rapportage')
        and attachment.tenant_id = target_tenant
        and attachment.work_order_id = any(ids)
        and attachment.uploaded_by = auth.uid()
        and private.owns_report_path(attachment.tenant_id, attachment.work_order_id, attachment.storage_path)
        and attachment.deleted_at is null
        and (
          attachment.report_entry_id is null
          or exists (
            select 1
            from public.report_entries parent_entry
            where parent_entry.tenant_id = attachment.tenant_id
              and parent_entry.id = attachment.report_entry_id
              and parent_entry.work_order_id = attachment.work_order_id
              and parent_entry.author_user_id = auth.uid()
              and parent_entry.deleted_at is null
          )
        )
    ), '[]'::jsonb),
    'signatures', coalesce((
      select jsonb_agg(to_jsonb(signature) - array['storage_path','captured_by'])
      from public.signatures signature
      where private.service_enabled(target_tenant, 'rapportage')
        and signature.tenant_id = target_tenant
        and signature.work_order_id = any(ids)
        and signature.captured_by = auth.uid()
    ), '[]'::jsonb),
    'timeEntries', coalesce((
      select jsonb_agg(to_jsonb(entry) - 'approved_by' order by entry.starts_at desc, entry.id)
      from public.time_entries entry
      where entry.tenant_id = target_tenant and entry.personnel_id = staff_personnel_id
    ), '[]'::jsonb),
    'staffTimeCorrectionRequests', coalesce((
      select jsonb_agg(
        to_jsonb(correction) - array['created_by','reviewed_by']
        order by correction.created_at desc, correction.id
      )
      from public.staff_time_correction_requests correction
      where correction.tenant_id = target_tenant
        and correction.personnel_id = staff_personnel_id
    ), '[]'::jsonb),
    'availability', coalesce((
      select jsonb_agg(to_jsonb(slot) order by slot.starts_at, slot.id)
      from public.availability slot
      where slot.tenant_id = target_tenant and slot.personnel_id = staff_personnel_id
    ), '[]'::jsonb),
    'staffLeaveRequests', coalesce((
      select jsonb_agg(
        to_jsonb(request) - array['created_by','reviewed_by']
        order by request.starts_on desc, request.id
      )
      from public.staff_leave_requests request
      where request.tenant_id = target_tenant and request.personnel_id = staff_personnel_id
    ), '[]'::jsonb),
    'staffLeaveEntitlements', coalesce((
      select jsonb_agg(
        to_jsonb(entitlement) - 'updated_by'
        order by entitlement.calendar_year desc, entitlement.id
      )
      from public.staff_leave_entitlements entitlement
      where entitlement.tenant_id = target_tenant
        and entitlement.personnel_id = staff_personnel_id
    ), '[]'::jsonb),
    'staffDayReviews', coalesce((
      select jsonb_agg(to_jsonb(review) - 'created_by' order by review.day desc, review.id)
      from public.staff_day_reviews review
      where review.tenant_id = target_tenant and review.personnel_id = staff_personnel_id
    ), '[]'::jsonb),
    'staffStatusEvents', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', event.id,
          'tenant_id', event.tenant_id,
          'work_order_id', event.work_order_id,
          'assignment_id', event.assignment_id,
          'previous_status', event.previous_status,
          'new_status', event.new_status,
          'reason_code', event.reason_code,
          'note', event.note,
          'created_at', event.created_at
        )
        order by event.created_at, event.id
      )
      from public.status_events event
      where event.tenant_id = target_tenant
        and event.work_order_id = any(ids)
        and (
          event.assignment_id is null
          or exists (
            select 1
            from public.work_order_assignments own_assignment
            where own_assignment.tenant_id = event.tenant_id
              and own_assignment.id = event.assignment_id
              and own_assignment.personnel_id = staff_personnel_id
          )
        )
    ), '[]'::jsonb),
    'staffMaterials', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', material.id,
          'tenant_id', material.tenant_id,
          'work_order_id', material.work_order_id,
          'task_id', material.task_id,
          'description', material.description,
          'quantity', material.quantity,
          'unit', material.unit,
          'unit_price_cents', finance.unit_price_cents,
          'customer_visible', material.customer_visible,
          'created_at', material.created_at,
          'owned_by_current_user', material.created_by = auth.uid()
        )
        order by material.created_at, material.id
      )
      from public.work_order_material_usage material
      left join private.work_order_material_finance finance
        on finance.tenant_id = material.tenant_id and finance.usage_id = material.id
      where private.service_enabled(target_tenant, 'rapportage')
        and material.tenant_id = target_tenant
        and material.work_order_id = any(ids)
    ), '[]'::jsonb),
    'staffExpenses', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', expense.id,
          'tenant_id', expense.tenant_id,
          'work_order_id', expense.work_order_id,
          'description', expense.description,
          'amount_cents', expense.amount_cents,
          'customer_visible', expense.customer_visible,
          'created_at', expense.created_at,
          'updated_at', expense.updated_at,
          'version', expense.version,
          'owned_by_current_user', expense.created_by = auth.uid()
        ) order by expense.created_at, expense.id
      )
      from public.work_order_expenses expense
      where private.service_enabled(target_tenant, 'rapportage')
        and expense.tenant_id = target_tenant
        and expense.work_order_id = any(ids)
        and expense.personnel_id = staff_personnel_id
    ), '[]'::jsonb),
    'announcements', coalesce((
      select jsonb_agg(to_jsonb(announcement) - 'created_by')
      from public.announcements announcement
      where announcement.tenant_id = target_tenant
        and announcement.published_at <= clock_timestamp()
        and announcement.withdrawn_at is null
        and 'staff' = any(announcement.audience_roles)
    ), '[]'::jsonb),
    'announcementReads', coalesce((
      select jsonb_agg(to_jsonb(read) - 'user_id')
      from public.announcement_reads read
      where read.tenant_id = target_tenant
        and read.user_id = auth.uid()
        and private.announcement_read_allowed(read.tenant_id, read.announcement_id)
    ), '[]'::jsonb),
    'openShifts', coalesce((
      select jsonb_agg(to_jsonb(shift) - array['created_by','selected_personnel_id'])
      from public.open_shifts shift
      where staff_personnel_id is not null
        and private.service_enabled(target_tenant, 'planning')
        and shift.tenant_id = target_tenant
        and private.open_shift_eligible(target_tenant, shift.id, staff_personnel_id)
    ), '[]'::jsonb),
    'shiftInterests', coalesce((
      select jsonb_agg(to_jsonb(interest))
      from public.shift_interests interest
      where private.service_enabled(target_tenant, 'planning')
        and interest.tenant_id = target_tenant
        and interest.personnel_id = staff_personnel_id
    ), '[]'::jsonb),
    'personnelDocuments', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', document.id,
        'tenant_id', document.tenant_id,
        'personnel_id', document.personnel_id,
        'title', document.title,
        'file_name', document.file_name,
        'version', document.version,
        'visible_to_employee', document.visible_to_employee
      ))
      from public.personnel_documents document
      where document.tenant_id = target_tenant
        and document.personnel_id = staff_personnel_id
        and document.visible_to_employee
        and not document.dossier_managed
    ), '[]'::jsonb),
    'extraWorkRules', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', rule.id,
        'tenant_id', rule.tenant_id,
        'task_revision_id', rule.task_revision_id,
        'active', rule.active,
        'requires_photo', rule.requires_photo,
        'requires_review', rule.requires_review
      ))
      from public.extra_work_rules rule
      where private.service_enabled(target_tenant, 'planning')
        and private.service_enabled(target_tenant, 'rapportage')
        and rule.tenant_id = target_tenant
        and rule.active
        and exists (
          select 1
          from public.work_order_allowed_extra_work allowed
          where allowed.tenant_id = rule.tenant_id
            and allowed.extra_work_rule_id = rule.id
            and allowed.work_order_id = any(ids)
        )
    ), '[]'::jsonb),
    'allowedExtraWork', coalesce((
      select jsonb_agg(to_jsonb(extra))
      from public.work_order_allowed_extra_work extra
      where private.service_enabled(target_tenant, 'rapportage')
        and extra.tenant_id = target_tenant
        and extra.work_order_id = any(ids)
    ), '[]'::jsonb),
    'travelLegs', coalesce((
      select jsonb_agg(to_jsonb(leg) - array['origin_address','destination_address','manual_updated_by'])
      from public.travel_legs leg
      join public.work_order_assignments assignment
        on assignment.id = leg.assignment_id and assignment.tenant_id = leg.tenant_id
      where assignment.tenant_id = target_tenant
        and assignment.personnel_id = staff_personnel_id
        and assignment.work_order_id = any(ids)
    ), '[]'::jsonb)
  )
  into result;

  return result;
end;
$function$;

CREATE OR REPLACE FUNCTION private.validate_work_order_report(w work_orders)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if exists(select 1 from private.task_targets target join lateral(select e.state from private.task_target_executions e where e.tenant_id=target.tenant_id and e.target_id=target.id order by round desc limit 1)e on true where target.tenant_id=w.tenant_id and target.work_order_id=w.id and target.withdrawn_at is null and e.state<>'completed') then raise exception 'Er zijn nog niet uitgevoerde taakdoelen. Beoordeel de resterende scope.' using errcode='23514';end if;
 if exists(select 1 from private.task_visit_sessions s where s.tenant_id=w.tenant_id and s.work_order_id=w.id and s.ends_at is null) then raise exception 'Meld de eigen bezoekdag eerst af' using errcode='23514';end if;
 if exists(select 1 from public.work_order_tasks t join public.task_revisions r on r.tenant_id=t.tenant_id and r.id=t.task_revision_id where t.tenant_id=w.tenant_id and t.work_order_id=w.id and r.requires_photo and (not t.is_extra_work or t.extra_work_status<>'rejected'))
 and not exists(select 1 from public.attachments a where a.tenant_id=w.tenant_id and a.work_order_id=w.id and a.deleted_at is null and a.customer_visible and a.mime_type in('image/jpeg','image/png','image/webp')) then raise exception 'Voeg een klantzichtbare foto van de werkzaamheden toe' using errcode='23514';end if;
 if exists(select 1 from public.work_order_exceptions e where e.tenant_id=w.tenant_id and e.work_order_id=w.id and e.blocking and e.state='open') then raise exception 'Los eerst de blokkerende bijzonderheden op' using errcode='23514';end if;
 if not private.work_order_checklist_ready(w.id) then raise exception 'Vul de verplichte checklistvragen en bewijsgegevens in' using errcode='23514';end if;
 if exists(select 1 from public.work_order_assignments a where a.tenant_id=w.tenant_id and a.work_order_id=w.id and a.status not in ('completed','returned','cancelled'))
 or exists(select 1 from public.time_entries e join public.work_order_assignments a on a.id=e.assignment_id and a.tenant_id=e.tenant_id where a.work_order_id=w.id and a.tenant_id=w.tenant_id and e.ends_at is null) then
 raise exception 'Laat iedere medewerker eerst de eigen inzet stoppen' using errcode='23514';end if;
 if not exists(select 1 from public.work_order_tasks t where t.tenant_id=w.tenant_id and t.work_order_id=w.id) or exists(select 1 from public.work_order_tasks t where t.tenant_id=w.tenant_id and t.work_order_id=w.id and (not t.is_extra_work or t.extra_work_status<>'rejected')
 and (t.completed_at is null and coalesce((to_jsonb(t)->>'transferred_quantity')::numeric,0)+coalesce((to_jsonb(t)->>'withdrawn_quantity')::numeric,0)<t.quantity)) then
 raise exception 'Leg alle verplichte taakresultaten of scopeoverdrachten vast' using errcode='23514';end if;
 if exists(select 1 from public.object_records r cross join public.work_order_assignments a join public.personnel p on p.id=a.personnel_id and p.tenant_id=a.tenant_id
 where r.tenant_id=w.tenant_id and r.object_id=w.object_id and r.kind='instruction' and r.state='active' and coalesce((r.details->>'acknowledgement')::boolean,false)
 and a.tenant_id=w.tenant_id and a.work_order_id=w.id and a.actual_start_at is not null and r.starts_at<=a.projected_end_at and (r.ends_at is null or r.ends_at>=a.projected_start_at)
 and (r.work_order_id is null or r.work_order_id=w.id) and (r.service='' or r.service=w.discipline)
 and not exists(select 1 from public.object_instruction_receipts rc where rc.tenant_id=w.tenant_id and rc.record_id=r.id and rc.record_version=r.version and rc.user_id=p.user_id and rc.work_order_id=w.id)) then
 raise exception 'Bevestig eerst de actuele verplichte objectinstructies' using errcode='23514';end if;
end $function$;

create function private.task_target_aggregate_guard() returns trigger language plpgsql security definer set search_path='' as $$
declare actual numeric;begin
 if new.execution_snapshot is distinct from old.execution_snapshot or (old.original_budget_minutes is not null and new.original_budget_minutes is distinct from old.original_budget_minutes) or (old.original_quantity is not null and new.original_quantity is distinct from old.original_quantity) then raise exception 'Oorspronkelijke taak-, doel- en normbegroting blijven vastgelegd' using errcode='23514';end if;
 if new.execution_snapshot->>'mode' in ('rooms','items') and (new.executed_quantity,new.completed_at,new.execution_state) is distinct from(old.executed_quantity,old.completed_at,old.execution_state) then
 select coalesce(sum(target.quantity)filter(where e.state='completed'),0) into actual from private.task_targets target join lateral(select state from private.task_target_executions e where e.tenant_id=target.tenant_id and e.target_id=target.id order by round desc limit 1)e on true where target.tenant_id=new.tenant_id and target.task_id=new.id and target.withdrawn_at is null;
 if coalesce(new.executed_quantity,0)<>actual or (new.execution_state='completed' and actual<>new.quantity-new.transferred_quantity-new.withdrawn_quantity) then raise exception 'Taakvolume volgt de geldige doeluitvoeringen' using errcode='23514';end if;
 end if;
 if new.execution_snapshot->>'mode' in ('rooms','items') and new.quantity is distinct from old.quantity and new.quantity<>(select coalesce(sum(quantity),0) from private.task_targets where tenant_id=new.tenant_id and task_id=new.id and withdrawn_at is null)+new.transferred_quantity+new.withdrawn_quantity then raise exception 'De hoeveelheid volgt de concrete actieve doelen en scopehistorie' using errcode='23514';end if;
 return new;
end$$;
create trigger zz_task_target_aggregate_guard before update on public.work_order_tasks for each row execute function private.task_target_aggregate_guard();

create function private.task_allocation_guard() returns trigger language plpgsql security definer set search_path='' as $$
declare source public.time_entries;assignment public.work_order_assignments;begin
 perform pg_advisory_xact_lock(hashtextextended('task-time:'||new.tenant_id::text||':'||new.personnel_id::text,0));
 if tg_op='INSERT' and new.target_id is not null and new.target_execution_id is null then select e.id into new.target_execution_id from private.task_target_executions e where e.tenant_id=new.tenant_id and e.target_id=new.target_id order by e.round desc limit 1;end if;
 select * into source from public.time_entries where tenant_id=new.tenant_id and id=new.source_id;
 select * into assignment from public.work_order_assignments where tenant_id=new.tenant_id and id=source.assignment_id;
 if source.id is null or source.kind<>'work' or source.status='rejected' or source.personnel_id<>new.personnel_id or assignment.work_order_id<>new.work_order_id or new.starts_at<source.starts_at
 or (source.ends_at is not null and (new.ends_at is null or new.ends_at>source.ends_at)) then raise exception 'Toerekening moet binnen de eigen geldige bronuren vallen' using errcode='23514';end if;
 if exists(select 1 from private.task_time_allocations a where a.tenant_id=new.tenant_id and a.personnel_id=new.personnel_id and a.id<>new.id and a.starts_at<coalesce(new.ends_at,'infinity'::timestamptz) and coalesce(a.ends_at,'infinity'::timestamptz)>new.starts_at) then raise exception 'Tijdallocaties mogen niet overlappen' using errcode='23514';end if;
 if new.session_id is not null and not exists(select 1 from private.task_visit_sessions session where session.tenant_id=new.tenant_id and session.id=new.session_id and session.assignment_id=source.assignment_id and session.personnel_id=new.personnel_id and session.work_order_id=new.work_order_id and new.starts_at>=session.starts_at and (session.ends_at is null or new.ends_at<=session.ends_at)) then raise exception 'Ongeldig bezoeksegment' using errcode='23514';end if;
 if new.method='direct' and new.target_id is not null and new.quantity<>1 then raise exception 'Een directe itemmeting hoort bij één doel' using errcode='23514';end if;
 if tg_op='UPDATE' and (new.source_id,new.task_id,new.target_id,new.target_execution_id,new.starts_at,new.personnel_id,new.method,new.quantity) is distinct from(old.source_id,old.task_id,old.target_id,old.target_execution_id,old.starts_at,old.personnel_id,old.method,old.quantity) then raise exception 'Een toerekening bewaart zijn bron en meetwijze; vraag een gecontroleerde correctie' using errcode='23514';end if;
 return new;
end$$;
create trigger task_allocation_guard before insert or update on private.task_time_allocations for each row execute function private.task_allocation_guard();

create function private.task_source_time_guard() returns trigger language plpgsql security definer set search_path='' as $$
declare at timestamptz;begin
 if tg_op='UPDATE' then
  if old.ends_at is null and new.ends_at is not null then
   update private.task_time_allocations set ends_at=new.ends_at,quality=case when new.ends_at-starts_at>interval '12 hours' then 'review' else quality end,reason=case when new.ends_at-starts_at>interval '12 hours' then 'Langlopend segment; timer en dagverdeling beoordelen' else reason end where tenant_id=new.tenant_id and source_id=new.id and ends_at is null;
  end if;
  if exists(select 1 from private.task_time_allocations a where a.tenant_id=new.tenant_id and a.source_id=new.id and (a.starts_at<new.starts_at or (new.ends_at is not null and a.ends_at>new.ends_at) or new.personnel_id<>old.personnel_id or new.assignment_id is distinct from old.assignment_id or new.kind<>'work')) then raise exception 'Deze urencorrectie vraagt ook een gecontroleerde correctie van de taakallocaties' using errcode='23514';end if;
 elsif tg_op='INSERT' and new.ends_at is null then
  perform pg_advisory_xact_lock(hashtextextended('task-time:'||new.tenant_id::text||':'||new.personnel_id::text,0));
  -- The native transition inserts work before closing travel in the same transaction.
  -- Enforce the final source invariant with a deferred constraint trigger.
 end if;
 return new;
end$$;
create trigger task_source_time_guard before insert or update on public.time_entries for each row execute function private.task_source_time_guard();

create function public.task_visit_context(target_tenant uuid,target_order uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare manager boolean;person uuid:=private.current_personnel_id(target_tenant);begin
 if not private.task_control_access(target_tenant,target_order) then raise exception 'Geen actuele bezoektoegang' using errcode='42501';end if;
 manager:=private.work_order_access(target_tenant) and private.management_allowed(target_tenant,'backoffice.work_orders.write') and private.management_allowed(target_tenant,'backoffice.functions.change_work_order_planning');
 return jsonb_build_object('canPlan',manager,'activeKind',(select e.kind from public.time_entries e where e.tenant_id=target_tenant and e.personnel_id=person and e.ends_at is null limit 1),'visits',coalesce((select jsonb_agg(jsonb_build_object('id',v.id,'start',v.starts_at,'end',v.ends_at,'state',case when v.state='planned' and v.ends_at<statement_timestamp() then 'missed' else v.state end,'version',v.version,'personnelIds',(select jsonb_agg(c.personnel_id) from private.task_visit_crew c where c.tenant_id=v.tenant_id and c.visit_id=v.id),
 'sessions',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'start',s.starts_at,'end',s.ends_at,'own',s.personnel_id=person)) from private.task_visit_sessions s where s.tenant_id=v.tenant_id and s.visit_id=v.id and (manager or s.personnel_id=person)),'[]')) order by v.starts_at,v.id) from private.task_visits v where v.tenant_id=target_tenant and v.work_order_id=target_order and (manager or exists(select 1 from private.task_visit_crew crew where crew.tenant_id=v.tenant_id and crew.visit_id=v.id and crew.personnel_id=person))),'[]'),
 'activeAllocation',(select jsonb_build_object('id',a.id,'taskId',a.task_id,'targetId',a.target_id,'start',a.starts_at,'method',a.method) from private.task_time_allocations a where a.tenant_id=target_tenant and a.personnel_id=person and a.work_order_id=target_order and a.ends_at is null),
 'unallocatedMinutes',(select greatest(0,coalesce(sum(extract(epoch from(coalesce(e.ends_at,statement_timestamp())-e.starts_at))/60),0)-(select coalesce(sum(extract(epoch from(coalesce(a.ends_at,statement_timestamp())-a.starts_at))/60),0) from private.task_time_allocations a where a.tenant_id=target_tenant and a.work_order_id=target_order and a.personnel_id=person)) from public.time_entries e join public.work_order_assignments assignment on assignment.tenant_id=e.tenant_id and assignment.id=e.assignment_id where e.tenant_id=target_tenant and e.personnel_id=person and assignment.work_order_id=target_order and e.kind='work' and e.status<>'rejected'));
end$$;

create function public.task_visit_command(target_tenant uuid,input jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare action text:=input->>'action';mid uuid:=(input->>'mutationId')::uuid;hash text;prior private.work_order_commands;w public.work_orders;v private.task_visits;s private.task_visit_sessions;a public.work_order_assignments;
 source public.time_entries;t public.work_order_tasks;target private.task_targets;now_at timestamptz:=clock_timestamp();r jsonb;person uuid:=private.current_personnel_id(target_tenant);crew uuid;fit jsonb;begin
 if mid is null or not private.task_control_access(target_tenant,(input->>'orderId')::uuid) then raise exception 'Geen actuele bezoektoegang' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended('fieldgrid-planning:'||target_tenant::text,0));
 if not private.task_control_access(target_tenant,(input->>'orderId')::uuid) then raise exception 'Actuele bezoektoegang vereist' using errcode='42501';end if;
 select * into w from public.work_orders where tenant_id=target_tenant and id=(input->>'orderId')::uuid for update;
 if w.id is null or w.archive_at is not null or w.status in ('approved','invoice_ready','invoiced','cancelled') or w.report_state not in ('draft','correction') then raise exception 'Deze werkbon is niet open voor uitvoering' using errcode='23514';end if;
 hash:=encode(extensions.digest(input::text,'sha256'),'hex');select * into prior from private.work_order_commands where id=mid;
 if found then if(prior.tenant_id,prior.actor_id,prior.command,prior.payload_hash) is distinct from(target_tenant,auth.uid(),'task-visit:'||action,hash) then raise exception 'Ongeldige herhaalsleutel' using errcode='23514';end if;return prior.result;end if;
 if action in ('plan','reschedule','cancel') then
  perform private.management_assert(target_tenant,'backoffice.work_orders.write');perform private.management_assert(target_tenant,'backoffice.functions.change_work_order_planning');
  if not private.object_manage(target_tenant) then raise exception 'Planningbevoegdheid vereist' using errcode='42501';end if;
  if w.version is distinct from(input->>'version')::bigint then raise exception 'Werkbon is gewijzigd' using errcode='40001';end if;
  if action<>'plan' then
   select * into v from private.task_visits where tenant_id=target_tenant and work_order_id=w.id and id=(input->>'visitId')::uuid for update;
   if v.id is null or v.version is distinct from(input->>'visitVersion')::bigint then raise exception 'Het bezoek is gewijzigd' using errcode='40001';end if;
   if v.state not in ('planned','missed') or exists(select 1 from private.task_visit_sessions where tenant_id=target_tenant and visit_id=v.id) then raise exception 'Gestarte of afgesloten bezoeken blijven behouden; plan een nieuw segment' using errcode='23514';end if;
   if length(btrim(coalesce(input->>'reason','')))<5 then raise exception 'Geef een reden voor deze bezoekwijziging' using errcode='23514';end if;
  end if;
  if action='cancel' then update private.task_visits set state='cancelled',version=version+1 where id=v.id;
  else
  if (input->>'end')::timestamptz<=(input->>'start')::timestamptz or (input->>'end')::timestamptz-(input->>'start')::timestamptz>interval '24 hours' then raise exception 'Plan een bezoek van maximaal 24 uur' using errcode='23514';end if;
  if jsonb_typeof(input->'personnelIds') is distinct from 'array' or jsonb_array_length(input->'personnelIds') not between 1 and 100 then raise exception 'Kies de bestaande inzet voor dit bezoek' using errcode='23514';end if;
  if action='plan' then
  insert into private.task_visits(tenant_id,work_order_id,starts_at,ends_at,created_by) values(target_tenant,w.id,(input->>'start')::timestamptz,(input->>'end')::timestamptz,auth.uid()) returning * into v;
  else
   update private.task_visits set starts_at=(input->>'start')::timestamptz,ends_at=(input->>'end')::timestamptz,version=version+1 where id=v.id returning * into v;
   delete from private.task_visit_crew where tenant_id=target_tenant and visit_id=v.id;
  end if;
  for crew in select value::uuid from jsonb_array_elements_text(input->'personnelIds') loop
   select * into a from public.work_order_assignments where tenant_id=target_tenant and work_order_id=w.id and personnel_id=crew and status not in ('completed','cancelled','returned');
   if a.id is null then raise exception 'Plan eerst een actieve personeelsinzet op dezelfde werkbon' using errcode='23514';end if;
   fit:=private.personnel_fit(target_tenant,crew,v.starts_at,v.ends_at,w.id,w.required_function_id);
   if not coalesce((fit->>'eligible')::boolean,false) then raise exception 'Medewerker is niet inzetbaar tijdens het volledige bezoek: %',array_to_string(array(select jsonb_array_elements_text(fit->'hardBlocks')),', ') using errcode='23514';end if;
   if jsonb_array_length(coalesce(fit->'warnings','[]'))>0 and (not coalesce((input->>'acknowledgeWarnings')::boolean,false) or length(btrim(coalesce(input->>'overrideReason','')))<3) then raise exception 'Beoordeel en bevestig met reden: %',array_to_string(array(select warning->>'message' from jsonb_array_elements(fit->'warnings') warning),'; ') using errcode='23514';end if;
   if not exists(select 1 from public.personnel p where p.tenant_id=target_tenant and p.id=crew and p.status='active') then raise exception 'Deze medewerker is niet actief' using errcode='23514';end if;
   if exists(select 1 from public.availability other where other.tenant_id=target_tenant and other.personnel_id=crew and other.kind in ('unavailable','leave','sick') and other.starts_at<v.ends_at and other.ends_at>v.starts_at) then raise exception 'Deze medewerker is niet beschikbaar tijdens dit bezoek' using errcode='23P01';end if;
   if exists(select 1 from public.work_order_assignments other join public.work_orders ow on ow.tenant_id=other.tenant_id and ow.id=other.work_order_id where other.tenant_id=target_tenant and other.personnel_id=crew and other.work_order_id<>w.id and other.status not in ('completed','returned','cancelled') and ow.status<>'cancelled' and other.projected_start_at<v.ends_at and other.projected_end_at>v.starts_at and not exists(select 1 from private.task_visits known where known.tenant_id=other.tenant_id and known.work_order_id=other.work_order_id and known.state not in ('cancelled','missed'))) then raise exception 'Deze medewerker heeft een overlappende uitvoering' using errcode='23P01';end if;
   if exists(select 1 from private.assignment_requirements(target_tenant,crew,w.id,v.starts_at,v.ends_at) req where req.hard_requirement and not private.qualified_for_period(target_tenant,crew,req.code,v.starts_at,v.ends_at)) then raise exception 'Controleer de kwalificaties voor dit volledige bezoek' using errcode='23514';end if;
   if exists(select 1 from private.task_visit_crew c join private.task_visits other on other.tenant_id=c.tenant_id and other.id=c.visit_id where c.tenant_id=target_tenant and c.personnel_id=crew and other.id<>v.id and other.state not in ('cancelled','missed') and other.starts_at<v.ends_at and other.ends_at>v.starts_at) then raise exception 'Deze medewerker heeft een overlappend bezoek' using errcode='23P01';end if;
   insert into private.task_visit_crew values(target_tenant,w.id,v.id,a.id,crew);
  end loop;
  end if;
 else
  if not private.work_order_execution_actor(target_tenant,w.id,auth.uid(),nullif(auth.jwt()->>'session_id','')::uuid) then raise exception 'Alleen de eigen actuele personeelsinzet' using errcode='42501';end if;
  select * into a from public.work_order_assignments where tenant_id=target_tenant and work_order_id=w.id and personnel_id=person and status not in ('completed','cancelled','returned') for update;
  select * into v from private.task_visits where tenant_id=target_tenant and work_order_id=w.id and id=(input->>'visitId')::uuid for update;
  if a.id is null or v.id is null or not exists(select 1 from private.task_visit_crew c where c.tenant_id=target_tenant and c.visit_id=v.id and c.assignment_id=a.id and c.personnel_id=person) then raise exception 'Dit bezoek is niet aan jou toegewezen' using errcode='42501';end if;
  select * into s from private.task_visit_sessions where tenant_id=target_tenant and visit_id=v.id and assignment_id=a.id and ends_at is null for update;
  if action='start' then
   if v.state not in ('planned','active') or s.id is not null or (now_at at time zone (select timezone from public.tenants where id=target_tenant))::date<>(v.starts_at at time zone (select timezone from public.tenants where id=target_tenant))::date then raise exception 'Meld je op de geplande bezoekdag aan; een afgesloten dag blijft behouden' using errcode='23514';end if;
   if exists(select 1 from private.task_visit_sessions closed where closed.tenant_id=target_tenant and closed.visit_id=v.id and closed.assignment_id=a.id) then raise exception 'Deze eigen bezoekdag is afgesloten; plan een nieuw segment' using errcode='23514';end if;
   if exists(select 1 from public.time_entries e where e.tenant_id=target_tenant and e.personnel_id=person and e.ends_at is null and e.assignment_id is distinct from a.id) then raise exception 'Sluit eerst je andere actieve tijdregistratie' using errcode='23514';end if;
   insert into private.task_visit_sessions(tenant_id,work_order_id,visit_id,assignment_id,personnel_id) values(target_tenant,w.id,v.id,a.id,person) returning * into s;
   select * into source from public.time_entries where tenant_id=target_tenant and assignment_id=a.id and ends_at is null;
   if source.id is not null and source.kind<>'work' then update public.time_entries set ends_at=now_at where id=source.id;source:=null;end if;
   if source.id is null then insert into public.time_entries(tenant_id,personnel_id,assignment_id,kind,starts_at) values(target_tenant,person,a.id,'work',now_at);end if;
   update public.work_order_assignments set status='in_progress',actual_start_at=coalesce(actual_start_at,now_at),actual_end_at=null,paused_at=null,projected_start_at=now_at,projected_end_at=greatest(v.ends_at,now_at+interval '1 minute') where tenant_id=target_tenant and id=a.id;
   update public.work_orders set status='in_progress',actual_start_at=coalesce(actual_start_at,now_at),actual_end_at=null where tenant_id=target_tenant and id=w.id;
   update private.task_visits set state='active',version=version+1 where id=v.id;
  elsif action in ('close','pause','resume','allocate') then
   if s.id is null then raise exception 'Meld je eerst aan voor dit bezoek' using errcode='23514';end if;
   if action in ('close','pause','resume') then
    if action='pause' and a.paused_at is not null or action='resume' and a.paused_at is null then raise exception 'Pauzestatus is gewijzigd' using errcode='40001';end if;
    update public.time_entries set ends_at=now_at where tenant_id=target_tenant and assignment_id=a.id and ends_at is null;
    if action='close' then
     update private.task_visit_sessions set ends_at=now_at where id=s.id;
     update public.work_order_assignments set paused_at=null,actual_end_at=now_at where tenant_id=target_tenant and id=a.id;
     if not exists(select 1 from private.task_visit_sessions live where live.tenant_id=target_tenant and live.visit_id=v.id and live.ends_at is null) and not exists(select 1 from private.task_visit_crew crew where crew.tenant_id=target_tenant and crew.visit_id=v.id and not exists(select 1 from private.task_visit_sessions done where done.tenant_id=target_tenant and done.visit_id=v.id and done.personnel_id=crew.personnel_id and done.ends_at is not null)) then update private.task_visits set state='closed',version=version+1 where id=v.id;end if;
    else
     insert into public.time_entries(tenant_id,personnel_id,assignment_id,kind,starts_at) values(target_tenant,person,a.id,case when action='pause' then 'break' else 'work' end,now_at);
     update public.work_order_assignments set paused_at=case when action='pause' then now_at end where tenant_id=target_tenant and id=a.id;
    end if;
   else
    select * into source from public.time_entries where tenant_id=target_tenant and assignment_id=a.id and personnel_id=person and kind='work' and ends_at is null for update;
    if source.id is null then raise exception 'Start of hervat eerst je eigen arbeidsuren' using errcode='23514';end if;
    select * into t from public.work_order_tasks where tenant_id=target_tenant and work_order_id=w.id and id=(input->>'taskId')::uuid;
    if t.id is null or not private.task_execution_allowed(t) then raise exception 'Geen actuele taaktoegang' using errcode='42501';end if;
    if nullif(input->>'targetId','') is not null then select * into target from private.task_targets where tenant_id=target_tenant and task_id=t.id and id=(input->>'targetId')::uuid and withdrawn_at is null;if target.id is null then raise exception 'Doel niet beschikbaar' using errcode='42501';end if;end if;
    update private.task_time_allocations set ends_at=now_at where tenant_id=target_tenant and personnel_id=person and ends_at is null;
    insert into private.task_time_allocations(tenant_id,work_order_id,task_id,target_id,source_id,session_id,personnel_id,starts_at,method,quantity,quality)
    values(target_tenant,w.id,t.id,target.id,source.id,s.id,person,now_at,coalesce(input->>'method','direct'),coalesce((input->>'quantity')::numeric,1),case when input->>'method'='estimated' then 'excluded' else 'valid' end);
   end if;
  else raise exception 'Onbekende bezoekhandeling' using errcode='23514';end if;
 end if;
 update public.work_orders set version=version+1 where tenant_id=target_tenant and id=w.id;
 r:=jsonb_build_object('ok',true,'id',v.id,'sessionId',s.id);
 insert into private.work_order_commands values(mid,target_tenant,auth.uid(),'task-visit:'||action,hash,r,clock_timestamp());
 insert into public.audit_events(tenant_id,actor_user_id,action,entity_type,entity_id,after_data) values(target_tenant,auth.uid(),'task_visit.'||action,'work_order',w.id,jsonb_build_object('visitId',v.id,'sessionId',s.id,'taskId',input->>'taskId','targetId',input->>'targetId','reason',input->>'reason','availabilityOverrideReason',input->>'overrideReason'));
 return r;
end$$;
revoke all on function private.task_allocation_guard(),private.task_source_time_guard() from public,anon,authenticated,service_role;
revoke all on function public.task_visit_context(uuid,uuid),public.task_visit_command(uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.task_visit_context(uuid,uuid),public.task_visit_command(uuid,jsonb) to authenticated;

create function private.task_assignment_session_close() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.status in ('completed','cancelled','returned') and old.status is distinct from new.status then
  update public.time_entries set ends_at=clock_timestamp() where tenant_id=new.tenant_id and assignment_id=new.id and ends_at is null;
  update private.task_visit_sessions set ends_at=clock_timestamp() where tenant_id=new.tenant_id and assignment_id=new.id and ends_at is null;
 end if;
 return new;
end$$;
create trigger task_assignment_session_close after update on public.work_order_assignments for each row execute function private.task_assignment_session_close();
revoke all on function private.task_assignment_session_close() from public,anon,authenticated,service_role;

create function private.task_single_source_guard() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if (select count(*) from public.time_entries source where source.tenant_id=new.tenant_id and source.personnel_id=new.personnel_id and source.ends_at is null)>1 then raise exception 'Sluit eerst je andere actieve tijdregistratie' using errcode='23514';end if;
 return null;
end$$;
create constraint trigger task_single_source_guard after insert or update on public.time_entries deferrable initially deferred for each row execute function private.task_single_source_guard();
revoke all on function private.task_single_source_guard() from public,anon,authenticated,service_role;

create function private.task_norm_analysis(t uuid,task uuid,variant text default '') returns jsonb language plpgsql stable security definer set search_path='' as $$
declare r public.task_revisions;c public.task_catalog;settings jsonb;raw jsonb;samples jsonb;direct_data jsonb;batch_data jsonb;current_norm jsonb;period integer;min_samples integer;min_orders integer;today date;comparison text;basis numeric;unit text;decision jsonb;chosen jsonb;proposal_method text;begin
 select * into c from public.task_catalog where tenant_id=t and id=task;
 select * into r from public.task_revisions where tenant_id=t and task_id=task and valid_until is null order by revision desc limit 1;
 if r.id is null then raise exception 'Taakversie niet beschikbaar' using errcode='23514';end if;
 select (statement_timestamp() at time zone timezone)::date into today from public.tenants where id=t;
 select coalesce(s.settings->'taskNorms','{}') into settings from public.tenant_settings s where s.tenant_id=t;
 select coalesce((select p.settings from private.task_norm_policies p where p.tenant_id=t),settings) into settings;
 settings:=jsonb_build_object('days',180,'minimumDirect',20,'minimumOrders',10,'minimumBatches',20,'minimumBatchOrders',10,'percentDifference',10,'minuteDifference',2,'rounding',1)||coalesce(settings,'{}');
 period:=(settings->>'days')::integer;min_samples:=(settings->>'minimumDirect')::integer;min_orders:=(settings->>'minimumOrders')::integer;
 current_norm:=private.task_norm_snapshot(r,today,variant);comparison:=current_norm->>'comparisonKey';basis:=(current_norm->>'normBasis')::numeric;unit:=current_norm->>'unit';
 with rows as (
 select a.id,a.work_order_id,a.task_id,a.target_id,a.target_execution_id,a.method,a.quality,a.reason,a.starts_at,a.ends_at,a.quantity,e.status source_status,
 extract(epoch from(a.ends_at-a.starts_at))/60 minutes,
 coalesce(target.snapshot->'norm',work_task.execution_snapshot) norm,
 (case when a.target_id is not null then coalesce(execution.state='completed',false) else work_task.execution_state='completed' end) and not exists(select 1 from public.work_order_checklists checklist where checklist.tenant_id=a.tenant_id and checklist.task_id=a.task_id and (checklist.target_execution_id is null or checklist.target_execution_id=a.target_execution_id) and not private.task_checklist_ready(checklist.id)) completed,
 case when a.target_id is not null then target.quantity else coalesce(work_task.executed_quantity,0) end executed_quantity,
 coalesce(execution.outcome,'pass') outcome,order_row.work_order_number number
 from private.task_time_allocations a join public.time_entries e on e.tenant_id=a.tenant_id and e.id=a.source_id
 join public.work_order_tasks work_task on work_task.tenant_id=a.tenant_id and work_task.id=a.task_id
 join public.task_revisions revision on revision.tenant_id=work_task.tenant_id and revision.id=work_task.task_revision_id
 join public.work_orders order_row on order_row.tenant_id=a.tenant_id and order_row.id=a.work_order_id
 left join private.task_targets target on target.tenant_id=a.tenant_id and target.id=a.target_id
 left join lateral(select state,outcome from private.task_target_executions execution where execution.tenant_id=a.tenant_id and execution.id=a.target_execution_id)execution on true
 where a.tenant_id=t and revision.task_id=task and a.starts_at>=((today-period)::timestamp at time zone (select timezone from public.tenants where id=t))
 and a.starts_at<((today+1)::timestamp at time zone (select timezone from public.tenants where id=t))
 )select coalesce(jsonb_agg(to_jsonb(rows) order by id),'[]') into raw from rows;
 with measurements as (
 select value->>'task_id' task_id,value->>'target_id' target_id,value->>'target_execution_id' execution_id,
 case when value->>'method'='batch' then 'batch' else coalesce(value->>'method','unknown') end batch_id,
 min(value->>'work_order_id') work_order_id,min(value->>'number') number,min(value->>'method') method,
 sum((value->>'minutes')::numeric) minutes,
 case when min(value->>'method')='batch' then max((value->>'quantity')::numeric) else max((value->>'executed_quantity')::numeric) end quantity,
 bool_and((value->>'quality')='valid' and value->>'source_status'='approved' and value->>'ends_at' is not null and (value->>'completed')::boolean and value->>'method' in ('direct','batch') and value#>>'{norm,comparisonKey}'=comparison and value#>>'{norm,variantKey}'=variant and value#>>'{norm,unit}'=unit and (value#>>'{norm,normBasis}')::numeric=basis) valid,
 string_agg(distinct case when value->>'quality'<>'valid' then coalesce(nullif(value->>'reason',''),value->>'quality') when value->>'source_status'<>'approved' then 'Bronuren niet goedgekeurd' when value->>'ends_at' is null then 'Actieve timer' when not(value->>'completed')::boolean then 'Onvolledige uitvoering' when value->>'method'='estimated' then 'Geschatte of verdeelde tijd' when value#>>'{norm,comparisonKey}'<>comparison or value#>>'{norm,variantKey}'<>variant or value#>>'{norm,unit}'<>unit or (value#>>'{norm,normBasis}')::numeric<>basis then 'Niet vergelijkbare werkwijze, variant of grondslag' end,'; ') reason,
 bool_or(value->>'outcome'<>'pass') deviation
 from jsonb_array_elements(raw) group by value->>'task_id',value->>'target_id',value->>'target_execution_id',case when value->>'method'='batch' then 'batch' else coalesce(value->>'method','unknown') end
 )select coalesce(jsonb_agg(to_jsonb(measurements)||jsonb_build_object('perBasis',case when quantity>0 then minutes/quantity*basis end) order by work_order_id,task_id,target_id,batch_id),'[]') into samples from measurements;
 with data as(select (value->>'perBasis')::numeric minutes,value->>'work_order_id' work_order_id from jsonb_array_elements(samples) where (value->>'valid')::boolean and value->>'method'='direct' and (value->>'quantity')::numeric>0)
 select jsonb_build_object('count',count(*),'orders',count(distinct work_order_id),'sum',coalesce(sum(minutes),0),'mean',avg(minutes),'median',percentile_cont(0.5) within group(order by minutes),'minimum',min(minutes),'maximum',max(minutes),'spread',stddev_pop(minutes)) into direct_data from data;
 with data as(select (value->>'perBasis')::numeric minutes,value->>'work_order_id' work_order_id from jsonb_array_elements(samples) where (value->>'valid')::boolean and value->>'method'='batch' and (value->>'quantity')::numeric>0)
 select jsonb_build_object('count',count(*),'orders',count(distinct work_order_id),'mean',avg(minutes),'median',percentile_cont(0.5) within group(order by minutes)) into batch_data from data;
 if (direct_data->>'count')::int>=min_samples and (direct_data->>'orders')::int>=min_orders then chosen:=direct_data;proposal_method:='direct';elsif (batch_data->>'count')::int>=(settings->>'minimumBatches')::int and (batch_data->>'orders')::int>=(settings->>'minimumBatchOrders')::int then chosen:=batch_data;proposal_method:='batch';end if;
 select jsonb_build_object('id',d.id,'decision',d.decision,'reason',d.reason,'effectiveOn',d.effective_on,'reviewOn',d.review_on,'datasetHash',d.dataset_hash) into decision from private.task_norm_decisions d where d.tenant_id=t and d.task_id=task and d.variant_key=variant order by created_at desc,id desc limit 1;
 return jsonb_build_object('taskId',task,'taskVersion',c.version,'revisionId',r.id,'variantKey',variant,'name',c.name,'unit',unit,'comparisonKey',comparison,'basis',basis,'currentMinutes',(current_norm->>'normMinutes')::numeric,'settings',settings,'policyVersion',coalesce((select version from private.task_norm_policies where tenant_id=t),0),'from',today-period,'through',today,'direct',direct_data,'batch',batch_data,'samples',samples,'excluded',(select count(*) from jsonb_array_elements(samples) where not coalesce((value->>'valid')::boolean,false)),
 'datasetHash',encode(extensions.digest(jsonb_build_object('raw',raw,'settings',settings,'comparisonKey',comparison,'unit',unit,'basis',basis)::text,'sha256'),'hex'),
 'proposalMethod',proposal_method,'proposedMinutes',case when chosen is not null
 and abs((chosen->>'median')::numeric-(current_norm->>'normMinutes')::numeric)>=(settings->>'minuteDifference')::numeric
 and abs((chosen->>'median')::numeric-(current_norm->>'normMinutes')::numeric)/(current_norm->>'normMinutes')::numeric*100>=(settings->>'percentDifference')::numeric
 and ((chosen->>'median')::numeric>=(current_norm->>'normMinutes')::numeric or not exists(select 1 from jsonb_array_elements(samples) sample where (sample->>'valid')::boolean and (sample->>'deviation')::boolean)) then round((chosen->>'median')::numeric/(settings->>'rounding')::numeric)*(settings->>'rounding')::numeric end,
 'lastDecision',decision,'scheduled',coalesce((select jsonb_agg(jsonb_build_object('id',n.id,'minutes',n.minutes,'basis',n.basis,'effectiveOn',n.effective_on) order by n.effective_on) from private.task_norm_versions n where n.tenant_id=t and n.task_id=task and n.variant_key=variant and n.comparison_key=comparison and n.effective_on>today),'[]'));
end$$;

create function public.task_norm_context(target_tenant uuid,target_task uuid,variant_key text default '') returns jsonb language plpgsql stable security definer set search_path='' as $$
declare analysis jsonb;begin
 perform private.management_assert(target_tenant,'backoffice.tasks.read');perform private.management_assert(target_tenant,'backoffice.functions.task_catalogue');
 if not private.planning_access(target_tenant) then raise exception 'Geen taakbeheer' using errcode='42501';end if;
 analysis:=private.task_norm_analysis(target_tenant,target_task,variant_key);
 return analysis||jsonb_build_object('canDecide',private.object_manage(target_tenant) and private.management_allowed(target_tenant,'backoffice.tasks.write') and private.management_allowed(target_tenant,'backoffice.functions.task_catalogue_command'));
end$$;

create function public.task_norm_command(target_tenant uuid,input jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare mid uuid:=(input->>'mutationId')::uuid;hash text;prior private.work_order_commands;analysis jsonb;c public.task_catalog;r jsonb;norm uuid;decision text:=input->>'decision';today date;latest private.task_norm_decisions;begin
 perform private.management_assert(target_tenant,'backoffice.tasks.write');perform private.management_assert(target_tenant,'backoffice.functions.task_catalogue_command');
 if not private.object_manage(target_tenant) or mid is null then raise exception 'Geen bevoegdheid voor normbesluiten' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended('task-catalogue:'||target_tenant,0));
 perform private.management_assert(target_tenant,'backoffice.tasks.write');perform private.management_assert(target_tenant,'backoffice.functions.task_catalogue_command');
 if not private.object_manage(target_tenant) then raise exception 'Actuele bevoegdheid vereist' using errcode='42501';end if;
 hash:=encode(extensions.digest(input::text,'sha256'),'hex');select * into prior from private.work_order_commands where id=mid;
 if found then if(prior.tenant_id,prior.actor_id,prior.command,prior.payload_hash) is distinct from(target_tenant,auth.uid(),'task-norm',hash) then raise exception 'Ongeldige herhaalsleutel' using errcode='23514';end if;return prior.result;end if;
 select * into c from public.task_catalog where tenant_id=target_tenant and id=(input->>'taskId')::uuid for update;
 if c.id is null then raise exception 'Taak niet beschikbaar' using errcode='42501';end if;
 if c.version is distinct from(input->>'version')::bigint then raise exception 'De taak is gewijzigd. Beoordeel de actuele bronversie.' using errcode='40001';end if;
 analysis:=private.task_norm_analysis(target_tenant,c.id,coalesce(input->>'variantKey',''));
 if analysis->>'datasetHash' is distinct from input->>'datasetHash' then raise exception 'De bronmetingen zijn gewijzigd. Beoordeel de actuele onderbouwing.' using errcode='40001';end if;
 if decision not in ('approved','rejected','deferred') or length(btrim(coalesce(input->>'reason','')))<3 or length(input->>'reason')>2000 then raise exception 'Kies een besluit en motiveer het' using errcode='23514';end if;
 today:=(analysis->>'through')::date;
 select * into latest from private.task_norm_decisions d where d.tenant_id=target_tenant and d.task_id=c.id and d.variant_key=coalesce(input->>'variantKey','') and d.dataset_hash=analysis->>'datasetHash' order by d.created_at desc limit 1;
 if latest.id is not null and not(latest.decision='deferred' and latest.review_on<=today) then raise exception 'Deze dataset is al beoordeeld. Nieuwe relevante brongegevens zijn nodig.' using errcode='40001';end if;
 if decision='approved' then
  if analysis->>'proposedMinutes' is null or (input->>'effectiveOn')::date is null or (input->>'effectiveOn')::date<=today then raise exception 'Een onderbouwd voorstel en toekomstige ingangsdatum zijn vereist' using errcode='23514';end if;
  insert into private.task_norm_versions(tenant_id,task_id,revision_id,variant_key,comparison_key,minutes,basis,effective_on,created_by,reason)
  values(target_tenant,c.id,(analysis->>'revisionId')::uuid,coalesce(input->>'variantKey',''),analysis->>'comparisonKey',(analysis->>'proposedMinutes')::numeric,(analysis->>'basis')::numeric,(input->>'effectiveOn')::date,auth.uid(),input->>'reason') returning id into norm;
 elsif decision='deferred' and ((input->>'reviewOn')::date is null or (input->>'reviewOn')::date<=today) then raise exception 'Kies een toekomstige herbeoordelingsdatum' using errcode='23514';end if;
 insert into private.task_norm_decisions(tenant_id,task_id,revision_id,variant_key,dataset_hash,dataset,decision,reason,effective_on,review_on,actor_id,norm_id)
 values(target_tenant,c.id,(analysis->>'revisionId')::uuid,coalesce(input->>'variantKey',''),analysis->>'datasetHash',analysis,decision,input->>'reason',case when decision='approved' then (input->>'effectiveOn')::date end,case when decision='deferred' then (input->>'reviewOn')::date end,auth.uid(),norm);
 update public.task_catalog set version=version+1 where tenant_id=target_tenant and id=c.id;
 r:=jsonb_build_object('ok',true,'id',c.id,'version',c.version+1,'normId',norm);
 insert into private.work_order_commands values(mid,target_tenant,auth.uid(),'task-norm',hash,r,clock_timestamp());
 insert into public.audit_events(tenant_id,actor_user_id,action,entity_type,entity_id,after_data) values(target_tenant,auth.uid(),'task.norm_'||decision,'task',c.id,jsonb_build_object('normId',norm,'datasetHash',analysis->>'datasetHash','reason',input->>'reason','effectiveOn',input->>'effectiveOn'));
 return r;
end$$;
revoke all on function private.task_norm_analysis(uuid,uuid,text),public.task_norm_context(uuid,uuid,text),public.task_norm_command(uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.task_norm_context(uuid,uuid,text),public.task_norm_command(uuid,jsonb) to authenticated;

alter table public.work_order_material_usage add column target_id uuid;
alter table public.work_order_material_usage add constraint material_target_context foreign key(tenant_id,work_order_id,task_id,target_id) references private.task_targets(tenant_id,work_order_id,task_id,id);
alter table public.work_order_material_usage add constraint material_target_task_required check(target_id is null or task_id is not null);
create index material_target_context on public.work_order_material_usage(tenant_id,work_order_id,task_id,target_id);
CREATE OR REPLACE FUNCTION public.staff_work_order_cost_command(target_tenant uuid, command text, input jsonb, idempotency_key uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare receipt private.staff_app_command_receipts;result jsonb;usage_id uuid;scoped_target private.task_targets;
begin
 if command in ('material.create','add_material') and nullif(input->>'targetId','') is not null then
  perform pg_advisory_xact_lock(hashtextextended('fieldgrid-planning:'||target_tenant::text,0));
  select * into scoped_target from private.task_targets x where x.tenant_id=target_tenant and x.id=(input->>'targetId')::uuid and x.work_order_id=(input->>'orderId')::uuid and x.task_id=(input->>'taskId')::uuid and x.withdrawn_at is null;
  if scoped_target.id is null or not private.task_control_access(target_tenant,scoped_target.work_order_id,true) or not exists(select 1 from public.work_order_tasks task where task.tenant_id=target_tenant and task.id=scoped_target.task_id and private.task_execution_allowed(task)) then raise exception 'Geen actuele toegang tot dit materiaaldoel' using errcode='42501';end if;
  select * into receipt from private.staff_app_command_receipts r where r.tenant_id=target_tenant and r.id=idempotency_key;
  if found then if receipt.actor_id<>auth.uid() or receipt.command<>'cost.'||command or receipt.payload<>input then raise exception 'Gebruik een nieuwe herhaalsleutel voor gewijzigde invoer' using errcode='23514';end if;return receipt.result;end if;
  result:=public.staff_work_order_cost_command_legacy(target_tenant,command,input-array['targetId','materialId'],idempotency_key);
  usage_id:=(result#>>'{row,id}')::uuid;
  if nullif(input->>'materialId','') is not null then perform private.bind_material_catalogue(target_tenant,usage_id,(input->>'materialId')::uuid);end if;
  update public.work_order_material_usage set target_id=scoped_target.id where tenant_id=target_tenant and id=usage_id and task_id=scoped_target.task_id;
  update private.staff_app_command_receipts set payload=input where tenant_id=target_tenant and id=idempotency_key;
  return result;
 end if;
  if command not in('material.create','add_material') or nullif(input->>'materialId','') is null then
    return public.staff_work_order_cost_command_legacy(target_tenant,command,input,idempotency_key);
  end if;
  select * into receipt from private.staff_app_command_receipts r where r.tenant_id=target_tenant and r.id=idempotency_key;
  if found then
    if receipt.actor_id<>auth.uid() or receipt.command<>'cost.'||command or receipt.payload<>input then
      raise exception 'Gebruik een nieuwe herhaalsleutel voor gewijzigde invoer.' using errcode='23514';end if;
    return receipt.result;
  end if;
  result:=public.staff_work_order_cost_command_legacy(target_tenant,command,input-'materialId',idempotency_key);
  usage_id:=(result#>>'{row,id}')::uuid;
  perform private.bind_material_catalogue(target_tenant,usage_id,(input->>'materialId')::uuid);
  update private.staff_app_command_receipts set payload=input where tenant_id=target_tenant and id=idempotency_key;
  return result;
end $function$;

create or replace function private.work_order_report_snapshot(w public.work_orders,summary text) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare snapshot jsonb;materials jsonb;targets jsonb;begin
 snapshot:=private.work_order_report_snapshot_legacy(w,summary);
 select coalesce(jsonb_agg(jsonb_build_object('description',m.description||coalesce((select ' · '||(x.snapshot->>'number')||' · '||(x.snapshot->>'name') from private.task_targets x where x.tenant_id=m.tenant_id and x.id=m.target_id),''),'quantity',m.quantity,'unit',m.unit,'taskId',m.task_id,'pricingState',coalesce(c.state,'unknown'),'unitPriceCents',case when c.state='approved' then c.unit_price_cents end) order by m.created_at,m.id),'[]') into materials
 from public.work_order_material_usage m left join private.work_order_material_commercial c on c.tenant_id=m.tenant_id and c.usage_id=m.id where m.tenant_id=w.tenant_id and m.work_order_id=w.id and m.customer_visible;
 select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object('id',target.id,'createdAt',e.completed_at,'body',concat_ws(E'\n',
 task.task_code||' · '||task.task_name,
 (target.snapshot->>'number')||' · '||(target.snapshot->>'name'),
 concat_ws(' · ',target.snapshot->>'objectName',target.snapshot->>'location',target.snapshot->>'model',nullif(target.snapshot->>'serialNumber','')),
 'Taakrevisie '||(target.snapshot#>>'{norm,revision}')||' · checklist '||coalesce(target.snapshot#>>'{norm,checklistRevisionId}','geen')||' · normversie '||coalesce(target.snapshot#>>'{norm,normId}',target.snapshot#>>'{norm,revisionId}'),
 case when target.transferred_to_task_id is not null then 'Restwerk overgedragen naar afzonderlijke werkbon' when target.withdrawn_at is not null then 'Scope ingetrokken: '||target.reason else case e.state when 'completed' then 'Controle uitgevoerd · '||case e.outcome when 'pass' then 'In orde' when 'deviation' then 'Afwijking vastgesteld' when 'rejected' then 'Afgekeurd' else 'Vervolgcontrole nodig' end when 'not_done' then 'Niet uitgevoerd · '||e.exception_reason when 'not_applicable' then 'Niet van toepassing · '||e.exception_reason else 'Nog niet uitgevoerd' end end,
 case when e.customer_visible then nullif(e.finding,'') end,
 case e.followup when 'review' then 'Opvolging: beoordeling nodig' when 'repair_proposal' then 'Opvolging: herstelvoorstel, nog geen opdracht' when 'followup_order' then 'Opvolging: afzonderlijke vervolgopdracht' end))) order by task.created_at,target.created_at,target.id),'[]') into targets
 from private.task_targets target join public.work_order_tasks task on task.tenant_id=target.tenant_id and task.id=target.task_id
 join lateral(select * from private.task_target_executions e where e.tenant_id=target.tenant_id and e.target_id=target.id order by round desc limit 1)e on true
 where target.tenant_id=w.tenant_id and target.work_order_id=w.id;
 snapshot:=jsonb_set(snapshot,'{notes}',coalesce(snapshot->'notes','[]')||targets);
 return jsonb_set(jsonb_set(snapshot,'{schema}','2'::jsonb,true),'{materials}',materials,true);
end$$;

-- Extra scope is operationally visible immediately; finance must explicitly
-- accept its price implication before any extra performance can be invoiced.
create function private.task_scope_invoice_guard() returns trigger language plpgsql security definer set search_path='' as $$
declare task public.work_order_tasks;allocated numeric;begin
 select root.* into task from public.work_order_tasks linked join public.work_order_tasks root on root.tenant_id=linked.tenant_id and root.id=linked.scope_root_task_id where linked.tenant_id=new.tenant_id and linked.id=new.work_order_task_id for update of root;
 if task.original_quantity is null then return new;end if;
 select coalesce(sum(line.quantity),0) into allocated from public.invoice_lines line join public.work_order_tasks source on source.tenant_id=line.tenant_id and (source.id=line.work_order_task_id or line.work_order_task_id is null and line.source_snapshot->>'work_order_task_id'=source.id::text) where line.tenant_id=new.tenant_id and source.scope_root_task_id=task.id and line.id<>new.id;
 if allocated+new.quantity>coalesce(task.commercially_approved_quantity,task.original_quantity) then raise exception 'Extra doelen vereisen afzonderlijk prijsakkoord vóór facturatie' using errcode='23514';end if;
 return new;
end$$;
create trigger zz_task_scope_invoice_guard before insert or update on public.invoice_lines for each row execute function private.task_scope_invoice_guard();
revoke all on function private.task_scope_invoice_guard() from public,anon,authenticated,service_role;

create function private.task_control_defaults() returns trigger language plpgsql security definer set search_path='' as $$
declare r public.task_revisions;w public.work_orders;day date;begin
 if new.execution_snapshot<>'{}'::jsonb or new.task_revision_id is null then return new;end if;
 select * into r from public.task_revisions where tenant_id=new.tenant_id and id=new.task_revision_id;
 if r.execution_config='{}'::jsonb then return new;end if;
 select * into w from public.work_orders where tenant_id=new.tenant_id and id=new.work_order_id;
 day:=coalesce(w.requested_date,(coalesce(w.planned_start_at,w.created_at) at time zone (select timezone from public.tenants where id=w.tenant_id))::date);
 new.execution_snapshot:=private.task_norm_snapshot(r,day)||jsonb_build_object('variantNorms',coalesce((select jsonb_object_agg(variant->>'key',private.task_norm_snapshot(r,day,variant->>'key')) from jsonb_array_elements(coalesce(r.execution_config->'variants','[]')) variant),'{}'));
 if r.execution_config->>'mode' not in ('rooms','items') then
 new.duration_minutes:=(new.execution_snapshot->>'normMinutes')::numeric/(new.execution_snapshot->>'normBasis')::numeric;
 new.original_quantity:=new.quantity;new.commercially_approved_quantity:=new.quantity;new.original_budget_minutes:=new.quantity*new.duration_minutes;new.current_budget_minutes:=new.original_budget_minutes;
 end if;
 return new;
end$$;
create trigger task_control_defaults before insert on public.work_order_tasks for each row execute function private.task_control_defaults();
revoke all on function private.task_control_defaults() from public,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION private.work_order_clone(t uuid, source_id uuid, title text, instructions text, requested date, kind text, copy_template boolean, copy_contacts boolean, copy_personnel boolean)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare source public.work_orders;created uuid;details jsonb;
begin
 select * into source from public.work_orders where tenant_id=t and id=source_id;
 if source.id is null then raise exception 'Werkbon niet beschikbaar' using errcode='42501';end if;
 details:='{}';
 if copy_contacts then details:=details||jsonb_build_object('contacts',coalesce(source.details->'contacts','[]'));end if;
 if copy_personnel then details:=details||jsonb_build_object('personnel_suggestion',coalesce((select jsonb_agg(a.personnel_id) from public.work_order_assignments a join public.personnel p on p.tenant_id=a.tenant_id and p.id=a.personnel_id and p.status='active' where a.tenant_id=t and a.work_order_id=source.id and a.status not in ('cancelled','returned')),'[]'));end if;
 insert into public.work_orders(tenant_id,work_order_number,customer_id,object_id,discipline,created_by,title,description,day_instructions,requested_date,source_kind,required_personnel,signature_required,signature_mode,employee_signature_required,template_snapshot,details,planning_state)
 values(t,'WB-'||to_char(clock_timestamp(),'YYYY')||'-'||upper(substr(gen_random_uuid()::text,1,8)),source.customer_id,source.object_id,source.discipline,auth.uid(),title,instructions,instructions,requested,kind,source.required_personnel,source.signature_required,coalesce(to_jsonb(source)#>>'{signature_policy_snapshot,mode}',source.signature_mode),coalesce((to_jsonb(source)#>>'{signature_policy_snapshot,employeeRequired}')::boolean,source.employee_signature_required),case when copy_template then source.template_snapshot else '{}' end,details,'unassigned') returning id into created;
 if copy_contacts then
  insert into public.work_order_contacts(tenant_id,work_order_id,contact_id,roles,snapshot)
  select t,created,c.contact_id,c.roles,c.snapshot from public.work_order_contacts c join public.customer_contacts contact on contact.tenant_id=c.tenant_id and contact.id=c.contact_id and contact.customer_id=source.customer_id
  where c.tenant_id=t and c.work_order_id=source.id;
 end if;
 if copy_template then
  insert into public.work_order_checklists(tenant_id,work_order_id,template_revision_id,name,definition)
  select t,created,template_revision_id,name,definition from public.work_order_checklists where tenant_id=t and work_order_id=source.id and task_id is null;
 end if;
 return created;
end $function$;
CREATE OR REPLACE FUNCTION public.work_order_series_command_legacy(target_tenant uuid, command_id uuid, command text, input jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare new_task public.work_order_tasks;selection jsonb;receipt private.work_order_related_receipts;series public.work_order_series;source public.work_orders;task public.work_order_tasks;created public.work_orders;
 occurrence public.work_order_occurrences;day date;from_day date;until_day date;tz text;horizon integer;start_at timestamptz;end_at timestamptz;rule jsonb;result jsonb;
 target uuid;count_created integer:=0;count_skipped integer:=0;count_preserved integer:=0;serial_command text:='series.'||command;
begin
 perform private.management_assert(target_tenant,'backoffice.work_orders.write');
 perform private.management_assert(target_tenant,'backoffice.functions.work_order_series_command');

 if not private.work_order_lineage_authorized(target_tenant) then raise exception 'Geen toegang tot terugkerend werk' using errcode='42501';end if;
 if command_id is null or jsonb_typeof(input)<>'object' then raise exception 'Een actiereferentie is verplicht' using errcode='23514';end if;
 perform pg_advisory_xact_lock(hashtextextended('fieldgrid-planning:'||target_tenant::text,0));
 select * into receipt from private.work_order_related_receipts where tenant_id=target_tenant and id=command_id;
 if found then
  if receipt.actor_id<>auth.uid() or receipt.command<>serial_command or receipt.payload<>input then raise exception 'Gebruik een nieuwe actiereferentie voor gewijzigde invoer' using errcode='23514';end if;
  return receipt.result;
 end if;
 select timezone into tz from public.tenants where id=target_tenant;
 if command='create' then
  select * into source from public.work_orders where tenant_id=target_tenant and id=(input->>'orderId')::uuid for update;
  if source.id is null then raise exception 'Bronwerkbon niet beschikbaar' using errcode='42501';end if;
  if (input->'definition') ? 'taskIds' and (jsonb_array_length(input#>'{definition,taskIds}')=0 or exists(select 1 from jsonb_array_elements_text(input#>'{definition,taskIds}') selected where not exists(select 1 from public.work_order_tasks candidate where candidate.tenant_id=target_tenant and candidate.work_order_id=source.id and candidate.id=selected::uuid))) then raise exception 'Kies bestaande taken van de bronwerkbon voor deze cyclus' using errcode='23514';end if;
  if source.version is distinct from(input->>'version')::bigint then raise exception 'De werkbon is gewijzigd' using errcode='40001';end if;
  if exists(select 1 from public.work_order_tasks where tenant_id=target_tenant and work_order_id=source.id and unit_price_cents>0) and not private.commercial_access(target_tenant) then raise exception 'Laat de financiële afspraken van de reeks door een bevoegde collega bevestigen' using errcode='42501';end if;
  if source.quote_id is not null and not exists(select 1 from public.quotes where tenant_id=target_tenant and id=source.quote_id and status='accepted' and work_kind='recurring') then raise exception 'Een eenmalige offerte wordt geen nieuwe periodieke prijsafspraak. Leg eerst de terugkerende afspraak vast.' using errcode='23514';end if;
  if exists(select 1 from public.work_order_tasks where tenant_id=target_tenant and work_order_id=source.id and(scope_root_task_id<>id or transferred_quantity>0 or is_extra_work)) then raise exception 'Gebruik oorspronkelijke reguliere werkzaamheden als basis voor een reeks' using errcode='23514';end if;
  rule:=input->'definition';perform private.validate_work_order_recurrence(rule);
  insert into public.work_order_series(tenant_id,source_order_id,title,definition,timezone,created_by) values(target_tenant,source.id,input->>'title',rule,tz,auth.uid()) returning * into series;
  result:=jsonb_build_object('id',series.id);
 else
  select * into series from public.work_order_series where tenant_id=target_tenant and id=(input->>'seriesId')::uuid for update;
  if series.id is null then raise exception 'Reeks niet beschikbaar' using errcode='42501';end if;
  if series.version is distinct from(input->>'version')::bigint then raise exception 'De reeks is gewijzigd. Vernieuw eerst.' using errcode='40001';end if;
  select * into source from public.work_orders where tenant_id=target_tenant and id=series.source_order_id;
  tz:=series.timezone;
  if command='update' then
   rule:=input->'definition';perform private.validate_work_order_recurrence(rule);
   update public.work_order_series set title=input->>'title',definition=rule,version=version+1 where id=series.id returning * into series;
   if coalesce((input->>'applyFuture')::boolean,false) then
    for occurrence in select * from public.work_order_occurrences where tenant_id=target_tenant and series_id=series.id and state='generated' and occurrence_on>=(clock_timestamp() at time zone tz)::date for update loop
     select * into created from public.work_orders where tenant_id=target_tenant and id=occurrence.work_order_id for update;
     if created.version=occurrence.generated_order_version and created.status='planned' and created.actual_start_at is null and created.projected_start_at is null
      and not exists(select 1 from public.work_order_assignments where tenant_id=target_tenant and work_order_id=created.id)
      and not exists(select 1 from public.report_entries where tenant_id=target_tenant and work_order_id=created.id)
      and not exists(select 1 from public.work_order_tasks where tenant_id=target_tenant and work_order_id=created.id and completed_at is not null)
      and not exists(select 1 from public.invoice_lines where tenant_id=target_tenant and work_order_id=created.id)
     then
      if private.work_order_recurrence_matches(rule,occurrence.occurrence_on) then
       update public.work_orders set title=series.title,required_personnel=(rule->>'requiredPersonnel')::integer,details=details||jsonb_build_object('recurrence_window',jsonb_build_object('startsAt',rule->>'startsAt','endsAt',rule->>'endsAt','timezone',tz)),version=version+1 where id=created.id returning * into created;
       update public.work_order_occurrences set series_version=series.version,generated_order_version=created.version where tenant_id=target_tenant and series_id=series.id and occurrence_on=occurrence.occurrence_on;
      else
       update public.work_orders set archive_at=clock_timestamp(),version=version+1 where id=created.id;
       update public.work_order_occurrences set state='skipped',reason='Niet meer in herhaalpatroon',series_version=series.version where tenant_id=target_tenant and series_id=series.id and occurrence_on=occurrence.occurrence_on;
      end if;
     else count_preserved:=count_preserved+1;end if;
    end loop;
   end if;
   result:=jsonb_build_object('id',series.id,'preserved',count_preserved);
  elsif command='skip' then
   day:=(input->>'day')::date;
   if day is null or length(trim(coalesce(input->>'reason','')))<3 or not private.work_order_recurrence_matches(series.definition,day) then raise exception 'Kies een datum binnen de reeks en leg een reden vast' using errcode='23514';end if;
   select * into occurrence from public.work_order_occurrences where tenant_id=target_tenant and series_id=series.id and occurrence_on=day for update;
   if occurrence.work_order_id is not null and occurrence.state<>'skipped' then
    select * into created from public.work_orders where tenant_id=target_tenant and id=occurrence.work_order_id for update;
    if created.version<>occurrence.generated_order_version or created.status<>'planned' or created.actual_start_at is not null or created.projected_start_at is not null
     or exists(select 1 from public.work_order_assignments where tenant_id=target_tenant and work_order_id=created.id)
     or exists(select 1 from public.report_entries where tenant_id=target_tenant and work_order_id=created.id)
     or exists(select 1 from public.invoice_lines where tenant_id=target_tenant and work_order_id=created.id)
    then raise exception 'Deze bon is gewijzigd of in uitvoering. Behandel de afspraak afzonderlijk via het dossier of planbord.' using errcode='23514';end if;
    update public.work_orders set archive_at=clock_timestamp(),version=version+1 where id=created.id;
   end if;
   insert into public.work_order_occurrences(tenant_id,series_id,occurrence_on,state,reason,series_version) values(target_tenant,series.id,day,'skipped',input->>'reason',series.version)
   on conflict(tenant_id,series_id,occurrence_on) do update set state='skipped',reason=excluded.reason;
   result:=jsonb_build_object('id',series.id);
  elsif command='generate' then
   if not series.active then raise exception 'Deze reeks is niet actief' using errcode='23514';end if;
   select least(26,greatest(1,coalesce(nullif(settings#>>'{planning,generation_horizon_weeks}','')::integer,6))) into horizon from public.tenant_settings where tenant_id=target_tenant;
   horizon:=coalesce(horizon,6);from_day:=(clock_timestamp() at time zone tz)::date;until_day:=from_day+horizon*7-1;
   for day in select d::date from generate_series(from_day::timestamp,until_day::timestamp,interval '1 day') d loop
    if not private.work_order_recurrence_matches(series.definition,day) then continue;end if;
    if exists(select 1 from public.work_order_occurrences where tenant_id=target_tenant and series_id=series.id and occurrence_on=day) then continue;end if;
    start_at:=(day+(series.definition->>'startsAt')::time) at time zone tz;
    end_at:=(day+(series.definition->>'endsAt')::time) at time zone tz;
    if start_at at time zone tz<>day+(series.definition->>'startsAt')::time or end_at at time zone tz<>day+(series.definition->>'endsAt')::time then
     insert into public.work_order_occurrences(tenant_id,series_id,occurrence_on,state,reason,series_version) values(target_tenant,series.id,day,'skipped','Tijd bestaat niet door overgang naar zomertijd',series.version);
     count_skipped:=count_skipped+1;continue;
    end if;
    if source.quote_id is not null then
     -- The existing conversion retains accepted lines, period prices and evidence.
     target:=public.commercial_next_visit(target_tenant,source.quote_id,day,gen_random_uuid());
     select * into created from public.work_orders where tenant_id=target_tenant and id=target;
     if exists(select 1 from public.work_order_occurrences where tenant_id=target_tenant and work_order_id=target) then raise exception 'Dit bezoek hoort al bij een andere reeks' using errcode='23514';end if;
    else
     target:=private.work_order_clone(target_tenant,source.id,series.title,source.day_instructions,day,'recurrence',true,true,true);
     -- Snapshot each new occurrence at its own commercial date. A contract task
     -- uses actual occurrence timestamps while it is copied, then awaits planning.
     update public.work_orders set planned_start_at=start_at,planned_end_at=end_at,projected_start_at=start_at,projected_end_at=end_at,commercial_terms=source.commercial_terms where id=target;
     for task in select * from public.work_order_tasks where tenant_id=target_tenant and work_order_id=source.id and (not(series.definition ? 'taskIds') or series.definition->'taskIds' ? id::text) order by created_at,id loop
      insert into public.work_order_tasks(tenant_id,work_order_id,task_revision_id,task_code,task_name,duration_minutes,quantity,unit,unit_price_cents,vat_basis_points,agreement_line_id,added_by)
      values(target_tenant,target,task.task_revision_id,task.task_code,task.task_name,task.duration_minutes,task.quantity,task.unit,task.unit_price_cents,task.vat_basis_points,task.agreement_line_id,auth.uid()) returning * into new_task;
      if new_task.execution_snapshot->>'mode' in ('rooms','items') then
       for selection in select jsonb_strip_nulls(jsonb_build_object('itemId',x.item_id,'nodeId',x.node_id,'quantity',x.quantity,'variantKey',x.variant_key)) from private.task_targets x where x.tenant_id=target_tenant and x.task_id=task.id and x.withdrawn_at is null loop
        perform private.task_target_add(new_task,selection,'original','Periodieke taaktoepassing');
       end loop;
      end if;
      if new_task.execution_snapshot#>>'{config,checklistMode}'='task' then perform private.task_checklist_attach(target_tenant,target,new_task.id,null,nullif(new_task.execution_snapshot->>'checklistRevisionId','')::uuid);end if;
      if new_task.execution_snapshot<>'{}'::jsonb then perform private.task_refresh_budget(new_task.id);end if;
     end loop;
     update public.work_orders set planned_start_at=null,planned_end_at=null,projected_start_at=null,projected_end_at=null where id=target;
     select * into created from public.work_orders where id=target;
    end if;
    -- Do not rewrite a visit that was previously created or planned manually.
    if created.status='planned' and created.projected_start_at is null and created.actual_start_at is null and not exists(select 1 from public.work_order_assignments where tenant_id=target_tenant and work_order_id=target) then
     update public.work_orders set required_personnel=(series.definition->>'requiredPersonnel')::integer,details=details||jsonb_build_object('recurrence_window',jsonb_build_object('startsAt',series.definition->>'startsAt','endsAt',series.definition->>'endsAt','timezone',tz,'start',start_at,'end',end_at)),version=version+1 where id=target returning * into created;
    end if;
    insert into public.work_order_occurrences(tenant_id,series_id,occurrence_on,work_order_id,state,series_version,generated_order_version) values(target_tenant,series.id,day,target,'generated',series.version,created.version);
    if target<>source.id then insert into public.work_order_relations(tenant_id,source_order_id,target_order_id,kind,reason,created_by) values(target_tenant,source.id,target,'recurrence',day::text,auth.uid()) on conflict(tenant_id,target_order_id) do nothing;end if;
    count_created:=count_created+1;
   end loop;
   result:=jsonb_build_object('id',series.id,'created',count_created,'skipped',count_skipped,'until',until_day);
  else raise exception 'Onbekende reeksactie' using errcode='23514';end if;
 end if;
 insert into public.audit_events(tenant_id,actor_user_id,action,entity_type,entity_id,after_data) values(target_tenant,auth.uid(),'work_order.'||serial_command,'work_order',source.id,result);
 insert into private.work_order_related_receipts(tenant_id,id,actor_id,command,payload,result) values(target_tenant,command_id,auth.uid(),serial_command,input,result);
 return result;
end $function$;
create or replace function private.generate_series_occurrence(target_series uuid,day date) returns jsonb
language plpgsql security definer set search_path='' as $$
declare new_task public.work_order_tasks;selection jsonb;series public.work_order_series;source public.work_orders;created public.work_orders;task public.work_order_tasks;
 target uuid;start_at timestamptz;end_at timestamptz;end_day date;effective_line uuid;agreement public.customer_agreements;
begin
  select * into series from public.work_order_series where id=target_series for update;
  if series.id is null or series.lifecycle_state in('paused','ended') or not series.active then raise exception 'Reeks is niet actief.' using errcode='23514';end if;
  if not private.work_order_recurrence_matches(series.definition,day) then raise exception 'Datum valt niet binnen het reeksprofiel.' using errcode='23514';end if;
  if exists(select 1 from public.work_order_occurrences o where o.tenant_id=series.tenant_id and o.series_id=series.id and o.occurrence_on=day) then
    return jsonb_build_object('state','existing');end if;
  select * into source from public.work_orders where tenant_id=series.tenant_id and id=series.source_order_id;
  if source.id is null then raise exception 'Bronwerkbon ontbreekt.' using errcode='23514';end if;
  end_day:=day+case when(series.definition->>'endsAt')::time<=(series.definition->>'startsAt')::time then 1 else 0 end;
  start_at:=(day+(series.definition->>'startsAt')::time) at time zone series.timezone;
  end_at:=(end_day+(series.definition->>'endsAt')::time) at time zone series.timezone;
  if start_at at time zone series.timezone<>day+(series.definition->>'startsAt')::time
    or end_at at time zone series.timezone<>end_day+(series.definition->>'endsAt')::time then
    insert into public.work_order_occurrences(tenant_id,series_id,occurrence_on,state,reason,series_version)
      values(series.tenant_id,series.id,day,'skipped','Tijd bestaat niet door overgang naar zomertijd',series.version);
    return jsonb_build_object('state','skipped');
  end if;
  if series.agreement_line_id is not null then
    effective_line:=private.cockpit_indexation_line(series.tenant_id,series.agreement_line_id,day);
    select a.* into agreement from public.customer_agreement_lines l join public.customer_agreements a
      on a.tenant_id=l.tenant_id and a.id=l.agreement_id
      where l.tenant_id=series.tenant_id and l.id=effective_line and l.object_id=source.object_id;
    if agreement.id is null or agreement.state<>'active' or agreement.starts_on>day or agreement.ends_on<end_day then
      raise exception 'Geen eenduidige actieve contractversie voor deze datum.' using errcode='23514';end if;
  end if;
  if source.quote_id is not null then
    if coalesce(nullif(current_setting('request.jwt.claims',true), '')::jsonb->>'role','')='service_role' then
      raise exception 'Geautomatiseerde contractplanning gebruikt geen offertebron.' using errcode='23514';end if;
    target:=public.commercial_next_visit(series.tenant_id,source.quote_id,day,extensions.gen_random_uuid());
    for new_task in select * from public.work_order_tasks where tenant_id=series.tenant_id and work_order_id=target and execution_snapshot<>'{}'::jsonb loop
     select * into task from public.work_order_tasks source_task where source_task.tenant_id=series.tenant_id and source_task.work_order_id=source.id and source_task.task_revision_id=new_task.task_revision_id;
     if (select count(*) from public.work_order_tasks source_task where source_task.tenant_id=series.tenant_id and source_task.work_order_id=source.id and source_task.task_revision_id=new_task.task_revision_id)<>1 then raise exception 'Concrete doelen vereisen een eenduidige oorspronkelijke taaktoepassing' using errcode='23514';end if;
     if series.definition ? 'taskIds' and not(series.definition->'taskIds' ? task.id::text) then raise exception 'Offertebezoek behoudt zijn geaccepteerde scope; gebruik afzonderlijke commerciële cycli' using errcode='23514';end if;
     if new_task.execution_snapshot->>'mode' in ('rooms','items') then
      for selection in select jsonb_strip_nulls(jsonb_build_object('itemId',x.item_id,'nodeId',x.node_id,'quantity',x.quantity,'variantKey',x.variant_key)) from private.task_targets x where x.tenant_id=series.tenant_id and x.task_id=task.id and x.withdrawn_at is null loop
       perform private.task_target_add(new_task,selection,'original','Periodieke taaktoepassing');
      end loop;
     end if;
     if new_task.execution_snapshot#>>'{config,checklistMode}'='task' then perform private.task_checklist_attach(series.tenant_id,target,new_task.id,null,nullif(new_task.execution_snapshot->>'checklistRevisionId','')::uuid);end if;
     perform private.task_refresh_budget(new_task.id);
    end loop;
    select * into created from public.work_orders where tenant_id=series.tenant_id and id=target;
  else
    insert into public.work_orders(tenant_id,work_order_number,customer_id,object_id,discipline,created_by,title,description,
      day_instructions,requested_date,source_kind,required_personnel,required_function_id,signature_required,signature_mode,
      employee_signature_required,template_snapshot,details,planning_state,planned_start_at,planned_end_at,projected_start_at,
      projected_end_at,commercial_terms)
    values(series.tenant_id,'WB-'||to_char(clock_timestamp(),'YYYY')||'-'||upper(substr(extensions.gen_random_uuid()::text,1,8)),
      source.customer_id,source.object_id,source.discipline,series.created_by,series.title,source.description,source.day_instructions,day,
      'recurrence',(series.definition->>'requiredPersonnel')::integer,source.required_function_id,source.signature_required,
      coalesce(to_jsonb(source)#>>'{signature_policy_snapshot,mode}',source.signature_mode),source.employee_signature_required,
      source.template_snapshot,source.details||jsonb_build_object('personnel_suggestion',to_jsonb(series.preferred_personnel_ids),
        'contract_generation',jsonb_build_object('seriesId',series.id,'seriesVersion',series.version,'agreementLineId',effective_line,'occurrenceOn',day)),
      'unassigned',start_at,end_at,start_at,end_at,source.commercial_terms) returning * into created;
    target:=created.id;
    insert into public.work_order_contacts(tenant_id,work_order_id,contact_id,roles,snapshot)
      select series.tenant_id,target,c.contact_id,c.roles,c.snapshot from public.work_order_contacts c
      join public.customer_contacts contact on contact.tenant_id=c.tenant_id and contact.id=c.contact_id and contact.customer_id=source.customer_id
      where c.tenant_id=series.tenant_id and c.work_order_id=source.id;
    insert into public.work_order_checklists(tenant_id,work_order_id,template_revision_id,name,definition)
      select series.tenant_id,target,template_revision_id,name,definition from public.work_order_checklists
      where tenant_id=series.tenant_id and work_order_id=source.id and task_id is null;
    for task in select * from public.work_order_tasks where tenant_id=series.tenant_id and work_order_id=source.id and (not(series.definition ? 'taskIds') or series.definition->'taskIds' ? id::text) order by created_at,id loop
      insert into public.work_order_tasks(tenant_id,work_order_id,task_revision_id,task_code,task_name,duration_minutes,quantity,
        unit,unit_price_cents,vat_basis_points,agreement_line_id,added_by)
      values(series.tenant_id,target,task.task_revision_id,task.task_code,task.task_name,task.duration_minutes,task.quantity,
        task.unit,task.unit_price_cents,task.vat_basis_points,task.agreement_line_id,series.created_by) returning * into new_task;
      if new_task.execution_snapshot->>'mode' in ('rooms','items') then
       for selection in select jsonb_strip_nulls(jsonb_build_object('itemId',x.item_id,'nodeId',x.node_id,'quantity',x.quantity,'variantKey',x.variant_key)) from private.task_targets x where x.tenant_id=series.tenant_id and x.task_id=task.id and x.withdrawn_at is null loop
        perform private.task_target_add(new_task,selection,'original','Periodieke taaktoepassing');
       end loop;
      end if;
      if new_task.execution_snapshot#>>'{config,checklistMode}'='task' then perform private.task_checklist_attach(series.tenant_id,target,new_task.id,null,nullif(new_task.execution_snapshot->>'checklistRevisionId','')::uuid);end if;
      if new_task.execution_snapshot<>'{}'::jsonb then perform private.task_refresh_budget(new_task.id);end if;
    end loop;
    update public.work_orders set planned_start_at=null,planned_end_at=null,projected_start_at=null,projected_end_at=null,
      details=details||jsonb_build_object('recurrence_window',jsonb_build_object('startsAt',series.definition->>'startsAt',
        'endsAt',series.definition->>'endsAt','endsNextDay',end_day>day,'timezone',series.timezone,'start',start_at,'end',end_at),
        'preferred_personnel_match',coalesce((select jsonb_agg(jsonb_build_object('personnelId',candidate,
          'fit',private.personnel_fit(series.tenant_id,candidate,start_at,end_at,target,source.required_function_id)) order by candidate)
          from unnest(series.preferred_personnel_ids) candidate),'[]'::jsonb)),
      version=version+1 where tenant_id=series.tenant_id and id=target returning * into created;
  end if;
  insert into public.work_order_occurrences(tenant_id,series_id,occurrence_on,work_order_id,state,series_version,generated_order_version)
    values(series.tenant_id,series.id,day,target,'generated',series.version,created.version);
  insert into public.work_order_relations(tenant_id,source_order_id,target_order_id,kind,reason,created_by)
    values(series.tenant_id,source.id,target,'recurrence',day::text,series.created_by) on conflict(tenant_id,target_order_id) do nothing;
  return jsonb_build_object('state','generated','orderId',target);
end $$;

create function private.task_related_goals(source public.work_order_tasks,receiver uuid,line jsonb,transferring boolean) returns void language plpgsql security definer set search_path='' as $$
declare goal private.task_targets;selection uuid;created uuid;execution uuid;amount numeric:=0;new_task public.work_order_tasks;begin
 if source.execution_snapshot='{}'::jsonb then return;end if;
 select * into new_task from public.work_order_tasks where tenant_id=source.tenant_id and id=receiver;
 if source.execution_snapshot->>'mode' in ('rooms','items') then
  if jsonb_typeof(line->'targetIds') is distinct from 'array' or jsonb_array_length(line->'targetIds') not between 1 and 5000 or (select count(distinct value) from jsonb_array_elements_text(line->'targetIds'))<>jsonb_array_length(line->'targetIds') then raise exception 'Selecteer de concrete ruimtes of items voor de nieuwe bon' using errcode='23514';end if;
  for selection in select value::uuid from jsonb_array_elements_text(line->'targetIds') loop
   select * into goal from private.task_targets where tenant_id=source.tenant_id and task_id=source.id and id=selection and withdrawn_at is null for update;
   if goal.id is null or (transferring and exists(select 1 from private.task_target_executions e where e.tenant_id=source.tenant_id and e.target_id=goal.id and e.round=(select max(round) from private.task_target_executions where tenant_id=source.tenant_id and target_id=goal.id) and e.state='completed')) then raise exception 'Alleen concrete beschikbare restdoelen kunnen worden overgedragen' using errcode='23514';end if;
   amount:=amount+goal.quantity;
   insert into private.task_targets(tenant_id,work_order_id,task_id,object_id,item_id,node_id,quantity,variant_key,snapshot,origin,reason,added_by,source_target_id)
   values(source.tenant_id,new_task.work_order_id,new_task.id,goal.object_id,goal.item_id,goal.node_id,goal.quantity,goal.variant_key,goal.snapshot,'original',case when transferring then 'Overgedragen restwerk' else 'Nieuwe afzonderlijke uitvoering' end,auth.uid(),goal.id) returning id into created;
   insert into private.task_target_executions(tenant_id,work_order_id,task_id,target_id) values(source.tenant_id,new_task.work_order_id,new_task.id,created) returning id into execution;
   if source.execution_snapshot#>>'{config,checklistMode}'='target' then perform private.task_checklist_attach(source.tenant_id,new_task.work_order_id,new_task.id,execution,nullif(goal.snapshot#>>'{norm,checklistRevisionId}','')::uuid);end if;
   if transferring then update private.task_targets set withdrawn_at=clock_timestamp(),transferred_to_task_id=new_task.id,reason='Overgedragen restwerk',version=version+1 where id=goal.id;end if;
  end loop;
  if amount<>(line->>'quantity')::numeric then raise exception 'De hoeveelheid volgt de geselecteerde concrete doelen' using errcode='23514';end if;
 end if;
 if source.execution_snapshot#>>'{config,checklistMode}'='task' then perform private.task_checklist_attach(source.tenant_id,new_task.work_order_id,new_task.id,null,nullif(source.execution_snapshot->>'checklistRevisionId','')::uuid);end if;
 perform private.task_refresh_budget(new_task.id);
 if transferring then perform private.task_refresh_budget(source.id);end if;
end$$;
revoke all on function private.task_related_goals(public.work_order_tasks,uuid,jsonb,boolean) from public,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.work_order_related_command_legacy(target_tenant uuid, command_id uuid, command text, input jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare receipt private.work_order_related_receipts;source public.work_orders;task public.work_order_tasks;root public.work_order_tasks;line jsonb;
 target uuid;new_task uuid;amount numeric;actual numeric;transfer_mode boolean;result jsonb;reason text;source_id uuid;quote public.quotes;
begin
 perform private.management_assert(target_tenant,'backoffice.work_orders.write');
 perform private.management_assert(target_tenant,'backoffice.functions.work_order_related_command');

 if not private.work_order_lineage_authorized(target_tenant) then raise exception 'Geen toegang tot deze werkbonactie' using errcode='42501';end if;
 if command_id is null or jsonb_typeof(input)<>'object' then raise exception 'Een actiereferentie en invoer zijn verplicht' using errcode='23514';end if;
 perform pg_advisory_xact_lock(hashtextextended('fieldgrid-planning:'||target_tenant::text,0));
 select * into receipt from private.work_order_related_receipts where tenant_id=target_tenant and id=command_id;
 if found then
  if receipt.actor_id<>auth.uid() or receipt.command<>command or receipt.payload<>input then raise exception 'Gebruik een nieuwe actiereferentie voor gewijzigde invoer' using errcode='23514';end if;
  return receipt.result;
 end if;
 source_id:=(input->>'orderId')::uuid;
 select * into source from public.work_orders where tenant_id=target_tenant and id=source_id for update;
 if source.id is null then raise exception 'Werkbon niet beschikbaar' using errcode='42501';end if;
 if source.version is distinct from (input->>'version')::bigint then raise exception 'De werkbon is gewijzigd. Vernieuw eerst.' using errcode='40001';end if;
 if command='material' then
  if source.status in ('invoice_ready','invoiced','cancelled') or source.archive_at is not null or exists(select 1 from public.signatures where tenant_id=target_tenant and work_order_id=source.id and report_version=source.report_version)
   or coalesce((input->>'customerVisible')::boolean,false) and to_jsonb(source)->>'report_state' in ('waiting_signature','review','approved') then raise exception 'Registreer verbruik vóór ondertekening en definitieve rapportcontrole' using errcode='23514';end if;
  if nullif(input->>'taskId','') is not null and not exists(select 1 from public.work_order_tasks where tenant_id=target_tenant and work_order_id=source.id and id=(input->>'taskId')::uuid) then raise exception 'Taak hoort niet bij deze werkbon' using errcode='23514';end if;
  if input ? 'unitPriceCents' or input ? 'costCents' then if not private.commercial_access(target_tenant) then raise exception 'Financiële bevoegdheid vereist' using errcode='42501';end if;end if;
  insert into public.work_order_material_usage(tenant_id,work_order_id,task_id,description,quantity,unit,customer_visible,created_by)
  values(target_tenant,source.id,nullif(input->>'taskId','')::uuid,input->>'description',(input->>'quantity')::numeric,input->>'unit',coalesce((input->>'customerVisible')::boolean,false),auth.uid()) returning id into target;
  if input ? 'unitPriceCents' or input ? 'costCents' then insert into private.work_order_material_finance values(target_tenant,target,(input->>'costCents')::bigint,(input->>'unitPriceCents')::bigint);end if;
  result:=jsonb_build_object('id',target);
 elsif command in ('split','followup','duplicate') then
  reason:=coalesce(input->>'reason','remainder');transfer_mode:=command='split' or(command='followup' and reason='remainder');
  if length(trim(coalesce(input->>'title',''))) not between 2 and 180 or length(coalesce(input->>'instructions',''))>2000 then raise exception 'Vul titel en geldige instructies in' using errcode='23514';end if;
  if command='followup' and reason not in ('remainder','repair','warranty','paid','inspection') then raise exception 'Kies een opvolgreden' using errcode='23514';end if;
  if transfer_mode and source.status='cancelled' then raise exception 'Een geannuleerde bon draagt geen nieuwe scope over' using errcode='23514';end if;
  if command='split' and exists(select 1 from public.work_order_relations where tenant_id=target_tenant and target_order_id=source.id and kind='split') then raise exception 'V1 ondersteunt één niveau deelbonnen. Gebruik een opvolgbon voor later restwerk.' using errcode='23514';end if;
  if command='followup' and reason='paid' then
   if not private.commercial_access(target_tenant) then raise exception 'Financiële bevoegdheid vereist' using errcode='42501';end if;
   select * into quote from public.quotes where tenant_id=target_tenant and id=(input->>'acceptedQuoteId')::uuid and customer_id=source.customer_id and object_id=source.object_id and status='accepted' and operation_id is null and archived_at is null;
   if quote.id is null then raise exception 'Kies een afzonderlijke geaccepteerde offerte voor dit betaalde vervolgwerk' using errcode='23514';end if;
   result:=public.commercial_command(target_tenant,gen_random_uuid(),'convert',jsonb_build_object('id',quote.id,'version',quote.version));
   target:=(result->>'operation_id')::uuid;
   update public.work_orders set title=input->>'title',description=coalesce(input->>'instructions',''),day_instructions=coalesce(input->>'instructions',''),requested_date=nullif(input->>'requestedDate','')::date,source_kind='followup' where id=target;
  else
   if jsonb_typeof(input->'tasks') is distinct from 'array' or jsonb_array_length(input->'tasks')>100 or(transfer_mode and jsonb_array_length(input->'tasks')=0) then raise exception 'Selecteer de over te nemen werkzaamheden' using errcode='23514';end if;
   if(select count(*) from jsonb_array_elements(input->'tasks'))<>(select count(distinct value->>'id') from jsonb_array_elements(input->'tasks')) then raise exception 'Selecteer iedere taak eenmaal' using errcode='23514';end if;
   target:=private.work_order_clone(target_tenant,source.id,input->>'title',coalesce(input->>'instructions',''),nullif(input->>'requestedDate','')::date,command,coalesce((input->>'copyTemplate')::boolean,true),coalesce((input->>'copyContacts')::boolean,true),coalesce((input->>'copyPersonnel')::boolean,false));
   if transfer_mode then update public.work_orders set request_id=source.request_id,quote_id=source.quote_id,commercial_terms=source.commercial_terms where id=target;end if;
   for line in select value from jsonb_array_elements(input->'tasks') loop
    select * into task from public.work_order_tasks where tenant_id=target_tenant and work_order_id=source.id and id=(line->>'id')::uuid for update;
    if task.id is null then raise exception 'Taak hoort niet bij de bronwerkbon' using errcode='23514';end if;
    amount:=(line->>'quantity')::numeric;
    if amount is null or amount<=0 or amount<>round(amount,3) then raise exception 'Gebruik een positieve hoeveelheid met maximaal drie decimalen' using errcode='23514';end if;
    new_task:=gen_random_uuid();
    if transfer_mode then
     actual:=coalesce(task.executed_quantity,case when task.completed_at is not null then task.quantity else 0 end);
     if amount>task.quantity-actual-task.transferred_quantity-task.withdrawn_quantity then raise exception 'Alleen nog beschikbare resthoeveelheid kan worden overgedragen' using errcode='23514';end if;
     select * into root from public.work_order_tasks where tenant_id=target_tenant and id=task.scope_root_task_id;
     if root.is_extra_work and root.extra_work_status is distinct from 'approved' and not exists(select 1 from public.object_visit_requests r join public.object_request_proposals p on p.tenant_id=r.tenant_id and p.request_id=r.id where r.tenant_id=target_tenant and r.work_order_task_id=root.id and p.accepted_at is not null and not r.needs_review and p.quantity=root.quantity and p.price_cents=root.unit_price_cents and p.task_revision_id=root.task_revision_id)
      and not exists(select 1 from public.customer_agreement_lines l join public.customer_agreements a on a.tenant_id=l.tenant_id and a.id=l.agreement_id where l.tenant_id=target_tenant and l.id=root.agreement_line_id and l.extra_work and a.evidence_document_id is not null) then raise exception 'Leg eerst passend akkoord op dit meerwerk vast' using errcode='23514';end if;
     insert into public.work_order_scope_transfers(tenant_id,source_task_id,target_task_id,target_order_id,quantity,reason,created_by) values(target_tenant,task.id,new_task,target,amount,reason,auth.uid());
     insert into public.work_order_tasks(id,tenant_id,work_order_id,task_revision_id,task_code,task_name,duration_minutes,quantity,unit,unit_price_cents,vat_basis_points,is_extra_work,extra_work_status,agreement_line_id,commercial_snapshot,scope_root_task_id,instructions,added_by,execution_snapshot)
     values(new_task,target_tenant,target,root.task_revision_id,task.task_code,task.task_name,task.duration_minutes,amount,task.unit,root.unit_price_cents,root.vat_basis_points,root.is_extra_work,case when root.is_extra_work then 'approved' end,root.agreement_line_id,root.commercial_snapshot,root.id,task.instructions,auth.uid(),task.execution_snapshot);
     update public.work_order_tasks set transferred_quantity=transferred_quantity+amount where id=task.id;
    else
     -- Independent duplication/repair does not copy a financial entitlement.
     insert into public.work_order_tasks(id,tenant_id,work_order_id,task_revision_id,task_code,task_name,duration_minutes,quantity,unit,unit_price_cents,vat_basis_points,instructions,added_by,execution_snapshot)
     values(new_task,target_tenant,target,task.task_revision_id,task.task_code,task.task_name,task.duration_minutes,amount,task.unit,0,task.vat_basis_points,task.instructions,auth.uid(),task.execution_snapshot);
    end if;
   perform private.task_related_goals(task,new_task,line,transfer_mode);
   end loop;
  end if;
  insert into public.work_order_relations(tenant_id,source_order_id,target_order_id,kind,reason,created_by) values(target_tenant,source.id,target,command,reason,auth.uid());
  result:=jsonb_build_object('id',target);
 else raise exception 'Onbekende werkbonactie' using errcode='23514';end if;
 insert into public.audit_events(tenant_id,actor_user_id,action,entity_type,entity_id,after_data) values(target_tenant,auth.uid(),'work_order.'||command,'work_order',source.id,jsonb_build_object('target_id',target,'reason',reason));
 insert into private.work_order_related_receipts(tenant_id,id,actor_id,command,payload,result) values(target_tenant,command_id,auth.uid(),command,input,result);
 return result;
end $function$;

CREATE OR REPLACE FUNCTION public.work_order_related_context(target_tenant uuid, target_order uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare base jsonb;can_finance boolean;
begin
  base:=public.work_order_related_context_legacy(target_tenant,target_order);
  can_finance:=coalesce((base->>'canFinance')::boolean,false);
  return base||jsonb_build_object(
    'tasks',coalesce((select jsonb_agg(item||jsonb_build_object('targeted',task.execution_snapshot->>'mode' in ('rooms','items'))) from jsonb_array_elements(base->'tasks') item join public.work_order_tasks task on task.tenant_id=target_tenant and task.id=(item->>'id')::uuid),'[]'),
    'tenantAutomationEnabled',coalesce((select settings.contract_planning_automation_enabled
      from public.tenant_settings settings where settings.tenant_id=target_tenant),false),
    'agreementOptions',coalesce((select jsonb_agg(distinct jsonb_build_object('id',l.id,'agreement',a.title||' · v'||a.version,
      'scope',l.scope,'objectId',l.object_id) order by jsonb_build_object('id',l.id,'agreement',a.title||' · v'||a.version,
      'scope',l.scope,'objectId',l.object_id)) from public.work_order_tasks task join public.customer_agreement_lines l
      on l.tenant_id=task.tenant_id and l.id=task.agreement_line_id join public.customer_agreements a
      on a.tenant_id=l.tenant_id and a.id=l.agreement_id where task.tenant_id=target_tenant and task.work_order_id=target_order and a.state='active'),'[]'),
    'personnelOptions',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'name',p.full_name) order by p.full_name,p.id)
      from public.personnel p where p.tenant_id=target_tenant and p.status='active'),'[]'),
    'materialCatalogue',coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'code',m.code,'name',m.name,'category',m.category,
      'description',m.description,'unit',m.unit,'proposedUnitPriceCents',m.proposed_unit_price_cents,
      'proposedVatBasisPoints',m.proposed_vat_basis_points,'billableDefault',m.billable_default,'version',m.version)
      order by m.category,m.name,m.id) from public.material_catalog m where m.tenant_id=target_tenant and m.active),'[]'),
    'materials',coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'description',m.description,'quantity',m.quantity,'unit',m.unit,
      'taskId',m.task_id,'createdAt',m.created_at,'customerVisible',m.customer_visible,'materialId',m.material_id,'materialSnapshot',m.material_snapshot)
      ||case when can_finance then jsonb_build_object('unitPriceCents',f.unit_price_cents,'costCents',f.cost_cents,
        'pricingState',coalesce(c.state,'unknown'),'commercialVersion',coalesce(c.version,1),'vatBasisPoints',c.vat_basis_points,
        'agreementEvidence',c.agreement_evidence) else '{}'::jsonb end order by m.created_at,m.id)
      from public.work_order_material_usage m left join private.work_order_material_finance f on f.tenant_id=m.tenant_id and f.usage_id=m.id
      left join private.work_order_material_commercial c on c.tenant_id=m.tenant_id and c.usage_id=m.id
      where m.tenant_id=target_tenant and m.work_order_id=target_order),'[]'),
    'series',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'title',s.title,'version',s.version,'definition',s.definition,
      'lifecycleState',s.lifecycle_state,'automationEnabled',s.automation_enabled,'agreementLineId',s.agreement_line_id,
      'generationHorizonWeeks',s.generation_horizon_weeks,'preferredPersonnelIds',to_jsonb(s.preferred_personnel_ids),
      'lifecycleReason',s.lifecycle_reason,'lastGeneratedAt',s.last_generated_at,'lastGeneratedThrough',s.last_generated_through,
      'lastGenerationResult',s.last_generation_result,'failures',coalesce((select jsonb_agg(jsonb_build_object('day',f.occurrence_on,
        'message',f.message,'attempts',f.attempts,'lastFailedAt',f.last_failed_at) order by f.occurrence_on)
        from private.contract_series_failures f where f.tenant_id=s.tenant_id and f.series_id=s.id and f.resolved_at is null),'[]'),
      'occurrences',coalesce((select jsonb_agg(jsonb_build_object('day',o.occurrence_on,'state',o.state,'reason',o.reason,
        'orderId',w.id,'number',w.work_order_number,'preferredMatches',coalesce(w.details->'preferred_personnel_match','[]'::jsonb)) order by o.occurrence_on) from public.work_order_occurrences o
        left join public.work_orders w on w.tenant_id=o.tenant_id and w.id=o.work_order_id
        where o.tenant_id=s.tenant_id and o.series_id=s.id),'[]')) order by s.created_at,s.id)
      from public.work_order_series s where s.tenant_id=target_tenant and(s.source_order_id=target_order or exists(select 1
        from public.work_order_occurrences o where o.tenant_id=s.tenant_id and o.series_id=s.id and o.work_order_id=target_order))),'[]'));
end $function$;

create function public.task_item_dossier(target_tenant uuid,target_item uuid,target_order uuid default null) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare item private.task_items;manager boolean;begin
 manager:=private.object_manage(target_tenant) and private.management_allowed(target_tenant,'backoffice.objects.read') and private.management_allowed(target_tenant,'backoffice.functions.object_dossier');
 select * into item from private.task_items i where i.tenant_id=target_tenant and i.id=target_item;
 if item.id is null or not private.object_session_active() or not private.service_enabled(target_tenant,'planning') or not(manager or (target_order is not null and private.task_control_access(target_tenant,target_order) and exists(select 1 from private.task_targets x where x.tenant_id=target_tenant and x.item_id=item.id and x.work_order_id=target_order))) then raise exception 'Gegevens niet beschikbaar' using errcode='42501';end if;
 return jsonb_build_object('item',jsonb_build_object('id',item.id,'number',item.item_number,'name',item.name,'type',item.item_type,'brand',item.brand,'model',item.model,'serialNumber',item.serial_number,'status',item.status,'objectId',item.object_id,'nodeId',item.node_id,'replacesId',item.replaces_id),
 'history',coalesce((select jsonb_agg(value order by value->>'at' desc) from(select jsonb_build_object('orderId',x.work_order_id,'number',w.work_order_number,'task',task.task_name,'at',e.completed_at,'state',e.state,'outcome',e.outcome,'followup',e.followup,'finding',case when manager or e.actor_id=auth.uid() then e.finding else '' end,'itemSnapshot',x.snapshot-'norm','round',e.round) value
 from private.task_targets x join public.work_order_tasks task on task.tenant_id=x.tenant_id and task.id=x.task_id join public.work_orders w on w.tenant_id=x.tenant_id and w.id=x.work_order_id join private.task_target_executions e on e.tenant_id=x.tenant_id and e.target_id=x.id
 where x.tenant_id=target_tenant and x.item_id=item.id and (manager or x.work_order_id=target_order) and e.completed_at is not null order by e.completed_at desc limit 100) rows),'[]'),
 'upcoming',coalesce((select jsonb_agg(jsonb_build_object('orderId',w.id,'number',w.work_order_number,'task',task.task_name,'date',w.requested_date,'state',w.status) order by w.requested_date,w.id)
 from private.task_targets x join public.work_order_tasks task on task.tenant_id=x.tenant_id and task.id=x.task_id join public.work_orders w on w.tenant_id=x.tenant_id and w.id=x.work_order_id where x.tenant_id=target_tenant and x.item_id=item.id and x.withdrawn_at is null and w.archive_at is null and w.status not in ('approved','invoice_ready','invoiced','cancelled') and (manager or w.id=target_order)),'[]'),
 'locations',case when manager then coalesce((select jsonb_agg(jsonb_build_object('version',h.version,'at',h.created_at,'name',h.snapshot->>'name','objectId',h.snapshot->>'object_id','nodeId',h.snapshot->>'node_id','status',h.snapshot->>'status') order by h.version desc) from private.task_item_history h where h.tenant_id=target_tenant and h.item_id=item.id),'[]') else '[]'::jsonb end);
end$$;
revoke all on function public.task_item_dossier(uuid,uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.task_item_dossier(uuid,uuid,uuid) to authenticated;

create function private.task_checklist_rule_guard() returns trigger language plpgsql set search_path='' as $$
declare q jsonb;rule jsonb;begin
 for q in select value from jsonb_array_elements(coalesce(new.definition->'questions','[]')) loop
  rule:=q->'outcomeRule';if rule is null then continue;end if;
  if jsonb_typeof(rule)<>'object' or rule='{}'::jsonb or exists(select 1 from jsonb_object_keys(rule) key where key not in ('equals','minimum','maximum'))
  or (rule ? 'equals' and ((q->>'type' in ('check','boolean') and jsonb_typeof(rule->'equals')<>'boolean') or (q->>'type'='choice' and (jsonb_typeof(rule->'equals')<>'string' or not(q->'options' ? (rule->>'equals')))) or q->>'type' not in ('check','boolean','choice')))
  or ((rule ? 'minimum' or rule ? 'maximum') and (q->>'type'<>'number' or (rule ? 'minimum' and jsonb_typeof(rule->'minimum')<>'number') or (rule ? 'maximum' and jsonb_typeof(rule->'maximum')<>'number')))
  or (rule ? 'minimum' and rule ? 'maximum' and (rule->>'minimum')::numeric>(rule->>'maximum')::numeric)
  then raise exception 'Controleer de verwachte uitslag en numerieke grenswaarden' using errcode='23514';end if;
 end loop;return new;
end$$;
create trigger task_checklist_rule_guard before insert or update on public.work_order_template_versions for each row execute function private.task_checklist_rule_guard();
revoke all on function private.task_checklist_rule_guard() from public,anon,authenticated,service_role;

create function private.task_visit_planboard_row(v private.task_visits) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare row jsonb;crew jsonb;begin
 row:=private.planboard_row(v.work_order_id);
 select coalesce(jsonb_agg(person||jsonb_build_object('start',v.starts_at,'end',v.ends_at,'actualStart',session.starts_at,'actualEnd',session.ends_at,'timeBudgetMinutes',extract(epoch from(v.ends_at-v.starts_at))/60,'overrun',session.starts_at is not null and session.ends_at is null and statement_timestamp()>v.ends_at) order by person->>'personnelId'),'[]') into crew
 from jsonb_array_elements(row->'assignments') person join private.task_visit_crew c on c.tenant_id=v.tenant_id and c.visit_id=v.id and c.assignment_id=(person->>'id')::uuid
 left join private.task_visit_sessions session on session.tenant_id=c.tenant_id and session.visit_id=v.id and session.personnel_id=c.personnel_id;
 return row||jsonb_build_object('visitId',v.id,'hasVisits',true,'start',v.starts_at,'end',v.ends_at,'assignments',crew,'actualStart',(select min(starts_at) from private.task_visit_sessions where tenant_id=v.tenant_id and visit_id=v.id),'actualEnd',case when v.state='closed' then(select max(ends_at) from private.task_visit_sessions where tenant_id=v.tenant_id and visit_id=v.id) end);
end$$;
create function private.task_planboard_day_order(w uuid,day_start timestamptz,day_end timestamptz) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare visit private.task_visits;begin
 select * into visit from private.task_visits v where v.work_order_id=w and v.state not in ('cancelled','missed') and v.starts_at<day_end and v.ends_at>day_start order by v.starts_at,v.id limit 1;
 if visit.id is not null then return private.task_visit_planboard_row(visit);end if;
 return private.planboard_row(w)||jsonb_build_object('hasVisits',exists(select 1 from private.task_visits where work_order_id=w));
end$$;
revoke all on function private.task_visit_planboard_row(private.task_visits),private.task_planboard_day_order(uuid,timestamptz,timestamptz) from public,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.get_planboard(target_tenant uuid, target_day date, list_view text DEFAULT 'unassigned'::text, search_text text DEFAULT ''::text, status_filter text DEFAULT ''::text, page_number integer DEFAULT 1)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare tz text; ds timestamptz; de timestamptz; orders jsonb; board jsonb; people jsonb; availability_data jsonb; total integer; last_change jsonb;
begin
 perform private.management_assert(target_tenant,'backoffice.planning.read');
 perform private.management_assert(target_tenant,'backoffice.functions.get_planboard');

 if not private.planning_access(target_tenant) then raise exception 'Geen toegang tot planning' using errcode='42501';end if;
 perform private.refresh_live_planning(target_tenant);
 if target_day is null or not isfinite(target_day) or list_view not in ('unassigned','planned','running','completed','cancelled','all') or page_number<1 or page_number>100000 or length(search_text)>200 then raise exception 'Ongeldige planbordfilters' using errcode='23514';end if;
 select timezone into tz from public.tenants where id=target_tenant;
 ds:=target_day::timestamp at time zone tz;de:=(target_day+1)::timestamp at time zone tz;
 with context_orders as materialized(
  select private.task_planboard_day_order(w.id,ds,de) as row from public.work_orders w left join public.appointment_slots s on s.tenant_id=w.tenant_id and s.id=w.appointment_slot_id
  where w.tenant_id=target_tenant and w.archive_at is null and w.planning_state<>'draft' and ((w.projected_start_at<de and w.projected_end_at>ds)
   or exists(select 1 from private.task_visits v where v.tenant_id=w.tenant_id and v.work_order_id=w.id and v.state not in ('cancelled','missed') and v.starts_at<de and v.ends_at>ds) or(w.projected_start_at is null and w.status='planned' and coalesce(w.requested_date,(s.starts_at at time zone tz)::date,target_day)=target_day))
 ), filtered as materialized(select row from context_orders where (list_view='all' or row->>'category'=list_view) and (status_filter='' or row->>'status'=status_filter)
  and (btrim(search_text)='' or position(lower(btrim(search_text)) in lower(concat_ws(' ',row->>'number',row->>'customer',row->>'object')))>0)),
 paged as(select row from filtered order by case when list_view='unassigned' then case row->>'priority' when 'urgent' then 0 when 'high' then 1 else 2 end end,
 case when list_view='unassigned' then coalesce(row->>'requestedDate',row->>'windowStart',row->>'start') else row->>'start' end nulls last,row->>'id' limit 50 offset (page_number-1)*50)
 select (select count(*) from filtered),coalesce((select jsonb_agg(row) from paged),'[]') into total,orders;
 select coalesce(jsonb_agg(row order by row->>'start',row->>'id'),'[]') into board from (
 select private.planboard_row(w.id) row from public.work_orders w where w.tenant_id=target_tenant and w.archive_at is null and w.planning_state<>'draft' and not exists(select 1 from private.task_visits v where v.tenant_id=w.tenant_id and v.work_order_id=w.id and v.state not in ('cancelled','missed')) and (w.projected_start_at<de and w.projected_end_at>ds or exists(select 1 from public.work_order_assignments a where a.tenant_id=w.tenant_id and a.work_order_id=w.id and a.status not in ('cancelled','returned') and a.projected_start_at<de and a.projected_end_at>ds))
 union all select private.task_visit_planboard_row(v) from private.task_visits v join public.work_orders w on w.tenant_id=v.tenant_id and w.id=v.work_order_id where v.tenant_id=target_tenant and w.archive_at is null and w.planning_state<>'draft' and v.state not in ('cancelled','missed') and v.starts_at<de and v.ends_at>ds) visits;
 select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'name',p.full_name,'number',p.employee_number,'status',p.status) order by p.full_name,p.id),'[]') into people from public.personnel p where p.tenant_id=target_tenant and (p.status='active' or exists(select 1 from public.work_order_assignments a where a.tenant_id=p.tenant_id and a.personnel_id=p.id and a.status not in ('cancelled','returned') and a.projected_start_at<de and a.projected_end_at>ds));
 select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'personnelId',a.personnel_id,'start',a.starts_at,'end',a.ends_at,'kind',case when a.kind='available' then 'available' else 'unavailable' end)),'[]') into availability_data from public.availability a where a.tenant_id=target_tenant and a.starts_at<de and a.ends_at>ds;
 select jsonb_build_object('id',c.id,'orderId',c.work_order_id,'version',(c.after_data->>'version')::bigint) into last_change from public.planning_changes c join public.work_orders w on w.tenant_id=c.tenant_id and w.id=c.work_order_id
 where c.tenant_id=target_tenant and w.archive_at is null and w.planning_state<>'draft' and c.actor_user_id=auth.uid() and c.undone_by is null and w.version=(c.after_data->>'version')::bigint and w.status in ('planned','released','seen','travelling') and w.actual_start_at is null
 and not exists(select 1 from public.planning_changes newer where newer.tenant_id=c.tenant_id and newer.actor_user_id=c.actor_user_id and newer.created_at>c.created_at) order by c.created_at desc limit 1;
 return jsonb_build_object('day',target_day,'timezone',tz,'board',board,'orders',orders,'total',total,'page',page_number,'people',people,'availability',availability_data,'undo',last_change);
end $function$;
CREATE OR REPLACE FUNCTION public.change_work_order_planning(target_tenant uuid, target_work_order uuid, expected_version bigint, mutation_id uuid, target_start timestamp with time zone, target_end timestamp with time zone, target_assignments jsonb, confirmed_warnings text[] DEFAULT '{}'::text[], undo_change uuid DEFAULT NULL::uuid, appointment_data jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare assignment jsonb;fit jsonb;extra_warnings jsonb:='[]';result jsonb;reason text;state text;before_state jsonb;
begin
  perform private.management_assert(target_tenant,'backoffice.planning.write');
  perform private.management_assert(target_tenant,'backoffice.functions.change_work_order_planning');
  if not private.object_session_active() or not private.has_role(target_tenant,array['tenant_admin','management','planner']::public.app_role[]) then
    raise exception 'Actuele planningsbevoegdheid vereist.' using errcode='42501';
  end if;
  if exists(select 1 from public.planning_changes pc where pc.tenant_id=target_tenant and pc.work_order_id=target_work_order
    and pc.id=mutation_id and pc.actor_user_id=auth.uid()) then
    return public.change_work_order_planning_legacy(target_tenant,target_work_order,expected_version,mutation_id,target_start,target_end,
      target_assignments,confirmed_warnings,undo_change,appointment_data);
  end if;
  perform pg_advisory_xact_lock(hashtextextended('fieldgrid-planning:'||target_tenant::text,0));
  if not private.object_session_active() then raise exception 'Actuele planningssessie vereist' using errcode='42501';end if;
  if exists(select 1 from private.task_visits v where v.tenant_id=target_tenant and v.work_order_id=target_work_order and v.state<>'cancelled') then raise exception 'Wijzig de afzonderlijke bezoeken vanuit de werkbon; oorspronkelijke inzet en afgesloten dagen blijven behouden' using errcode='23514';end if;
  before_state:=private.planning_snapshot(target_work_order);
  if target_start is not null and target_assignments is not null and jsonb_typeof(target_assignments)='array' then
    for assignment in select value from jsonb_array_elements(target_assignments) loop
      fit:=private.personnel_fit(target_tenant,(assignment->>'personnelId')::uuid,
        (assignment->>'start')::timestamptz,(assignment->>'end')::timestamptz,target_work_order,null);
      if not coalesce((fit->>'eligible')::boolean,false) then
        if fit->'hardBlocks' ? 'personnel-unavailable' then
          raise exception 'Medewerker hoort niet bij deze organisatie.' using errcode='42501';
        elsif fit->'hardBlocks' ?| array['assignment-overlap','hard-absence'] then
          raise exception 'Medewerker is niet beschikbaar in dit tijdvak.' using errcode='23P01';
        else
          raise exception 'Medewerker is niet inzetbaar: %',array_to_string(array(select jsonb_array_elements_text(fit->'hardBlocks')),', ')
            using errcode='23514';
        end if;
      end if;
      extra_warnings:=extra_warnings||coalesce(fit->'warnings','[]'::jsonb);
      if jsonb_array_length(coalesce(fit->'warnings','[]'::jsonb))>0 then
        reason:=btrim(coalesce(assignment->>'overrideReason',''));
        if exists(select 1 from jsonb_array_elements(fit->'warnings') warning
          where not(coalesce(warning->>'key','')=any(coalesce(confirmed_warnings,'{}')))) then
          return jsonb_build_object('ok',false,'code','confirmation','warnings',extra_warnings,'before',before_state,'proposed',jsonb_build_object(
            'start',target_start,'end',target_end,'assignments',target_assignments));
        end if;
        if length(reason) not between 3 and 1000 then
          return jsonb_build_object('ok',false,'code','confirmation','warnings',extra_warnings||jsonb_build_array(jsonb_build_object(
            'key','reason:'||(assignment->>'personnelId'),'message','Geef een reden voor de beschikbaarheidsafwijking.')),
            'before',before_state,'proposed',jsonb_build_object('start',target_start,'end',target_end,'assignments',target_assignments));
        end if;
      end if;
    end loop;
  end if;
  result:=public.change_work_order_planning_legacy(target_tenant,target_work_order,expected_version,mutation_id,target_start,target_end,
    target_assignments,confirmed_warnings,undo_change,appointment_data);
  if coalesce((result->>'ok')::boolean,false) and not coalesce((result->>'replayed')::boolean,false) then
    for assignment in select value from jsonb_array_elements(coalesce(target_assignments,'[]')) loop
      fit:=private.personnel_fit(target_tenant,(assignment->>'personnelId')::uuid,(assignment->>'start')::timestamptz,
        (assignment->>'end')::timestamptz,target_work_order,null);
      state:=coalesce(fit->>'availabilityState','unknown');reason:=nullif(btrim(coalesce(assignment->>'overrideReason','')),'');
      update public.work_order_assignments set availability_state=state,availability_override_reason=reason
       where tenant_id=target_tenant and work_order_id=target_work_order and personnel_id=(assignment->>'personnelId')::uuid
         and status not in('cancelled','returned')
         and (availability_state is distinct from state or availability_override_reason is distinct from reason);
      if reason is not null then insert into public.audit_events(tenant_id,actor_user_id,action,entity_type,entity_id,after_data)
        values(target_tenant,auth.uid(),'planning.availability_override','work_order',target_work_order,
          jsonb_build_object('personnelId',assignment->>'personnelId','reason',reason,'availabilityState',state,
            'start',assignment->>'start','end',assignment->>'end','mutationId',mutation_id)); end if;
    end loop;
    update public.planning_changes pc set
      confirmed_warnings=coalesce(pc.confirmed_warnings,'[]'::jsonb)||extra_warnings,
      after_data=jsonb_set(pc.after_data,'{version}',to_jsonb((select version from public.work_orders where tenant_id=target_tenant and id=target_work_order)))
      where pc.id=mutation_id;
    -- Assignment projection triggers can advance the aggregate after the
    -- legacy command composed its response. Return the authoritative version
    -- so the next compare-and-swap starts from the committed state.
    result:=result||jsonb_build_object('version',(select version from public.work_orders where tenant_id=target_tenant and id=target_work_order));
  end if;
  return result||case when coalesce((result->>'ok')::boolean,false) then jsonb_build_object('fitWarnings',extra_warnings) else '{}'::jsonb end;
end $function$
;

CREATE OR REPLACE FUNCTION private.refresh_live_planning(t uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare p record;a record;c record;changes jsonb;next_start timestamptz;next_end timestamptz;previous_end timestamptz;previous_object uuid;travel integer;duration interval;breaks interval;changed integer:=0;at timestamptz:=clock_timestamp();bad boolean;affected uuid[]:=array[]::uuid[];
begin
 perform pg_advisory_xact_lock(hashtextextended('fieldgrid-planning:'||t::text,0));
 -- Only the current execution and its future work are reflowed. Original planned times remain immutable.
 for p in select distinct aa.personnel_id from public.work_order_assignments aa join public.work_orders w on w.tenant_id=aa.tenant_id and w.id=aa.work_order_id where aa.tenant_id=t and not exists(select 1 from private.task_visit_crew visit_crew where visit_crew.tenant_id=aa.tenant_id and visit_crew.assignment_id=aa.id) and w.archive_at is null and w.status<>'cancelled' and aa.actual_start_at is not null and aa.status not in('cancelled','returned') and (aa.actual_end_at is null or aa.actual_end_at>at-interval '1 day') loop
  previous_end:=null;previous_object:=null;changes:='[]';
  for a in select aa.*,w.object_id,w.customer_window_kind,s.starts_at window_start,s.ends_at window_end from public.work_order_assignments aa join public.work_orders w on w.tenant_id=aa.tenant_id and w.id=aa.work_order_id left join public.appointment_slots s on s.tenant_id=w.tenant_id and s.id=w.appointment_slot_id where aa.tenant_id=t and not exists(select 1 from private.task_visit_crew visit_crew where visit_crew.tenant_id=aa.tenant_id and visit_crew.assignment_id=aa.id) and aa.personnel_id=p.personnel_id and aa.status not in('returned','cancelled') and w.archive_at is null and w.status<>'cancelled' and(aa.planned_end_at>at-interval '1 day' or aa.actual_start_at is not null and aa.actual_end_at is null) and aa.planned_start_at<at+interval '2 days' order by coalesce(aa.actual_start_at,aa.planned_start_at),aa.created_at,aa.id loop
   next_start:=a.projected_start_at;next_end:=a.projected_end_at;bad:=false;
   if a.actual_start_at is not null then
    next_start:=a.actual_start_at;
    if a.actual_end_at is not null then next_end:=greatest(a.actual_end_at,next_start+interval '1 second');
    else
     select coalesce(sum(coalesce(e.ends_at,at)-e.starts_at),interval '0') into breaks from public.time_entries e where e.tenant_id=t and e.assignment_id=a.id and e.kind='break' and e.status<>'rejected';
     next_end:=greatest(next_start+make_interval(mins=>private.assignment_time_budget(t,a.id))+breaks,date_trunc('minute',at)+interval '1 minute');
    end if;
   elsif previous_end is not null and a.status in('planned','released','seen') then
    -- Keep a known leg's last measured estimate while recalculation is pending; never invent unknown travel.
    select l.estimated_minutes into travel from public.travel_legs l where l.tenant_id=t and l.assignment_id=a.id and l.direction='before' and l.calculated_at is not null;
    if previous_object=a.object_id then travel:=0;end if;
    duration:=a.planned_end_at-a.planned_start_at;
    next_start:=greatest(a.planned_start_at,a.projected_start_at,previous_end+make_interval(mins=>coalesce(travel,0)+case when travel>0 then 5 else 0 end));
    next_end:=next_start+duration;
    bad:=a.window_end is not null and(next_start>=a.window_end or(a.customer_window_kind='execution' and next_end>a.window_end));
   end if;
   changes:=changes||jsonb_build_array(jsonb_build_object('id',a.id,'start',next_start,'end',next_end,'drop',bad,'order',a.work_order_id));
   if not bad then previous_end:=greatest(previous_end,next_end);previous_object:=a.object_id;end if;
  end loop;
  -- Move later assignments first so normal overlap/availability/qualification guards remain active.
  for c in select value v from jsonb_array_elements(changes) with ordinality x(value,n) order by n desc loop
   if(c.v->>'drop')::boolean then
    update public.work_order_assignments set status='returned',return_reason_code='customer_window_unreachable',return_note='Automatisch teruggezet: klantvenster niet meer haalbaar.' where tenant_id=t and id=(c.v->>'id')::uuid and actual_start_at is null and status in('planned','released','seen');
    update public.dispatches set revoked_at=coalesce(revoked_at,at) where tenant_id=t and assignment_id=(c.v->>'id')::uuid and revoked_at is null;
    perform private.planning_window_signal(t,(c.v->>'id')::uuid,'unreachable');changed:=changed+1;affected:=array_append(affected,(c.v->>'order')::uuid);
   else
    begin
     update public.work_order_assignments set projected_start_at=(c.v->>'start')::timestamptz,projected_end_at=(c.v->>'end')::timestamptz where tenant_id=t and id=(c.v->>'id')::uuid and(projected_start_at,projected_end_at) is distinct from((c.v->>'start')::timestamptz,(c.v->>'end')::timestamptz);
     if found then changed:=changed+1;affected:=array_append(affected,(c.v->>'order')::uuid);end if;
    exception when check_violation or exclusion_violation then
     -- Record reality; an invalid derived future assignment needs a deliberate planner decision.
     update public.work_order_assignments set status='returned',return_reason_code='reflow_requires_planner',return_note='Automatisch teruggezet: beschikbaarheid of planningsvoorwaarden vragen controle.' where tenant_id=t and id=(c.v->>'id')::uuid and actual_start_at is null and status in('planned','released','seen');
     if found then
      update public.dispatches set revoked_at=coalesce(revoked_at,at) where tenant_id=t and assignment_id=(c.v->>'id')::uuid and revoked_at is null;
      perform private.planning_window_signal(t,(c.v->>'id')::uuid,'replan');changed:=changed+1;affected:=array_append(affected,(c.v->>'order')::uuid);
     else raise;end if;
    end;
   end if;
  end loop;
 end loop;
 for a in select aa.id,aa.work_order_id from public.work_order_assignments aa join public.work_orders w on w.tenant_id=aa.tenant_id and w.id=aa.work_order_id join public.appointment_slots s on s.tenant_id=w.tenant_id and s.id=w.appointment_slot_id where aa.tenant_id=t and not exists(select 1 from private.task_visit_crew visit_crew where visit_crew.tenant_id=aa.tenant_id and visit_crew.assignment_id=aa.id) and aa.actual_start_at is null and aa.status in('planned','released','seen') and w.archive_at is null and w.status<>'cancelled' and s.ends_at<=at and s.ends_at>at-interval '1 day' loop
  update public.work_order_assignments set status='returned',return_reason_code='customer_window_unreachable',return_note='Automatisch teruggezet: klantvenster verstreken zonder werkstart.' where tenant_id=t and id=a.id;
  update public.dispatches set revoked_at=coalesce(revoked_at,at) where tenant_id=t and assignment_id=a.id and revoked_at is null;
  perform private.planning_window_signal(t,a.id,'unreachable');changed:=changed+1;affected:=array_append(affected,a.work_order_id);
 end loop;
 update public.work_orders w set projected_start_at=coalesce(b.starts,w.planned_start_at),projected_end_at=coalesce(b.ends,w.planned_end_at),attention_reason=case when b.active=0 and w.actual_start_at is null then 'planning_review_required' else w.attention_reason end,status=case when b.active=0 and w.actual_start_at is null then case when (w.status='returned' and exists(select 1 from public.work_order_assignments removed where removed.tenant_id=w.tenant_id and removed.work_order_id=w.id and removed.return_reason_code in('management_removed','management_returned'))) then w.status else 'planned'::public.work_order_status end else w.status end
 from(select aa.work_order_id,min(aa.projected_start_at) filter(where aa.status not in('returned','cancelled')) starts,max(aa.projected_end_at) filter(where aa.status not in('returned','cancelled')) ends,count(*) filter(where aa.status not in('returned','cancelled')) active from public.work_order_assignments aa where aa.tenant_id=t and not exists(select 1 from private.task_visit_crew visit_crew where visit_crew.tenant_id=aa.tenant_id and visit_crew.assignment_id=aa.id) group by aa.work_order_id)b
 where w.tenant_id=t and w.id=b.work_order_id and(w.id=any(affected) or w.actual_start_at is not null or b.active=0) and w.archive_at is null and w.status<>'cancelled' and((w.projected_start_at,w.projected_end_at) is distinct from(coalesce(b.starts,w.planned_start_at),coalesce(b.ends,w.planned_end_at)) or(b.active=0 and w.actual_start_at is null and w.status<>'planned' and not (w.status='returned' and exists(select 1 from public.work_order_assignments removed where removed.tenant_id=w.tenant_id and removed.work_order_id=w.id and removed.return_reason_code in('management_removed','management_returned')))));
 for a in select aa.id,aa.projected_start_at,s.ends_at,aa.status,l.estimated_minutes from public.work_order_assignments aa join public.work_orders w on w.tenant_id=aa.tenant_id and w.id=aa.work_order_id join public.appointment_slots s on s.tenant_id=w.tenant_id and s.id=w.appointment_slot_id left join public.travel_legs l on l.tenant_id=aa.tenant_id and l.assignment_id=aa.id and l.direction='before' where aa.tenant_id=t and not exists(select 1 from private.task_visit_crew visit_crew where visit_crew.tenant_id=aa.tenant_id and visit_crew.assignment_id=aa.id) and aa.status in('planned','released','seen','travelling') and aa.actual_start_at is null and w.archive_at is null and w.status<>'cancelled' and s.ends_at>at and(s.ends_at<=at+interval '30 minutes' or greatest(at,aa.projected_start_at)+make_interval(mins=>coalesce(l.estimated_minutes,0)+5)>=s.ends_at) loop
  perform private.planning_window_signal(t,a.id,'warning');
 end loop;
 return changed;
end;
$function$
;

revoke all on function private.task_execution_config(uuid,jsonb),private.task_control_access(uuid,uuid,boolean),private.task_checklist_attach(uuid,uuid,uuid,uuid,uuid),private.task_norm_snapshot(public.task_revisions,date,text),private.task_target_add(public.work_order_tasks,jsonb,text,text),private.task_refresh_budget(uuid),private.task_checklist_ready(uuid),private.task_target_aggregate_guard() from public,anon,authenticated,service_role;
revoke all on function public.task_item_context(uuid,uuid,text,integer),public.task_control_context(uuid,uuid,integer,text),public.task_control_command(uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.task_item_context(uuid,uuid,text,integer),public.task_control_context(uuid,uuid,integer,text),public.task_control_command(uuid,jsonb) to authenticated;

create function public.task_scan_context(target_tenant uuid,target_order uuid,identity text) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not private.task_control_access(target_tenant,target_order) then raise exception 'Geen actuele werkbontoegang' using errcode='42501';end if;
 if length(btrim(identity)) not between 1 and 200 then raise exception 'Voer een geldig itemnummer in' using errcode='23514';end if;
 return coalesce((select jsonb_agg(jsonb_build_object('taskId',task.id,'taskName',task.task_name,'targetId',goal.id,'itemId',goal.item_id,'number',goal.snapshot->>'number','name',goal.snapshot->>'name') order by task.task_name,goal.id) from private.task_targets goal join public.work_order_tasks task on task.tenant_id=goal.tenant_id and task.id=goal.task_id where goal.tenant_id=target_tenant and goal.work_order_id=target_order and goal.withdrawn_at is null and (goal.item_id::text=btrim(identity) or lower(goal.snapshot->>'number')=lower(btrim(identity)) or lower(goal.snapshot->>'serialNumber')=lower(btrim(identity)))),'[]');
end$$;
revoke all on function public.task_scan_context(uuid,uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.task_scan_context(uuid,uuid,text) to authenticated;

-- Old forms may keep writing their established columns. New frozen projections
-- and finance acceptance are writable only by the reviewed command functions.
revoke insert,update on public.work_order_tasks from authenticated;
do $$declare columns text;begin
 select string_agg(quote_ident(attname),',' order by attnum) into columns from pg_attribute
 where attrelid='public.work_order_tasks'::regclass and attnum>0 and not attisdropped and attname not in ('execution_snapshot','original_budget_minutes','current_budget_minutes','original_quantity','commercially_approved_quantity');
 execute 'grant insert ('||columns||'), update ('||columns||') on public.work_order_tasks to authenticated';
end$$;
create function private.task_revision_config_guard() returns trigger language plpgsql security definer set search_path='' as $$
begin
 perform private.task_execution_config(new.tenant_id,new.execution_config);
 if(new.execution_config->>'mode'='once' and new.unit<>'task') or(new.execution_config->>'mode'='items' and new.unit<>'item') or(new.execution_config->>'mode'='rooms' and new.unit not in ('room','square_metre')) then raise exception 'Kies een passende eenheid bij de toepassingsvorm' using errcode='23514';end if;
 return new;
end$$;
create trigger task_revision_config_guard before insert on public.task_revisions for each row execute function private.task_revision_config_guard();
revoke all on function private.task_revision_config_guard() from public,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION private.work_order_scope_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare root public.work_order_tasks;src public.work_order_tasks;transfer public.work_order_scope_transfers;target public.work_orders;original public.work_orders;outgoing numeric;
begin
 perform pg_advisory_xact_lock(hashtextextended('fieldgrid-planning:'||new.tenant_id::text,0));
 if tg_op='INSERT' then new.scope_root_task_id:=coalesce(new.scope_root_task_id,new.id);
 elsif new.scope_root_task_id is distinct from old.scope_root_task_id or (new.withdrawn_quantity is distinct from old.withdrawn_quantity and not(new.execution_snapshot->>'mode' in ('rooms','items') and new.withdrawn_quantity>=old.withdrawn_quantity and new.withdrawn_quantity=(select coalesce(sum(goal.quantity),0) from private.task_targets goal where goal.tenant_id=new.tenant_id and goal.task_id=new.id and goal.withdrawn_at is not null and goal.transferred_to_task_id is null))) then
  raise exception 'De oorspronkelijke scope en ingetrokken hoeveelheid zijn niet rechtstreeks wijzigbaar' using errcode='23514';
 end if;
 select coalesce(sum(quantity),0) into outgoing from public.work_order_scope_transfers where tenant_id=new.tenant_id and source_task_id=new.id;
 if new.transferred_quantity<>outgoing then raise exception 'Scopeoverdracht vereist een gekoppelde, transactionele overdracht' using errcode='23514';end if;
 if tg_op='UPDATE' and (outgoing>0 or old.scope_root_task_id<>old.id)
 and (new.quantity,new.unit,new.unit_price_cents,new.vat_basis_points,new.task_revision_id,new.agreement_line_id,new.commercial_snapshot,new.is_extra_work,new.work_order_id)
 is distinct from (old.quantity,old.unit,old.unit_price_cents,old.vat_basis_points,old.task_revision_id,old.agreement_line_id,old.commercial_snapshot,old.is_extra_work,old.work_order_id) then
 raise exception 'Een overgedragen scope behoudt de oorspronkelijke hoeveelheid en financiële bron' using errcode='23514';end if;
 if coalesce(new.executed_quantity,case when new.completed_at is not null then new.quantity else 0 end)+new.transferred_quantity+new.withdrawn_quantity>new.quantity then
  raise exception 'Uitvoering en overdracht overschrijden de beschikbare hoeveelheid' using errcode='23514';end if;
 if new.scope_root_task_id<>new.id then
  select * into root from public.work_order_tasks where tenant_id=new.tenant_id and id=new.scope_root_task_id;
  select * into transfer from public.work_order_scope_transfers where tenant_id=new.tenant_id and target_task_id=new.id;
  select * into src from public.work_order_tasks where tenant_id=new.tenant_id and id=transfer.source_task_id;
  select * into target from public.work_orders where tenant_id=new.tenant_id and id=new.work_order_id;
  select * into original from public.work_orders where tenant_id=new.tenant_id and id=root.work_order_id;
  if root.id is null or transfer.id is null or src.scope_root_task_id<>root.id or transfer.target_order_id<>new.work_order_id
   or target.customer_id<>original.customer_id or target.object_id<>original.object_id
   or new.quantity<>transfer.quantity or new.unit_price_cents<>root.unit_price_cents or new.vat_basis_points<>root.vat_basis_points
   or new.task_revision_id is distinct from root.task_revision_id or new.commercial_snapshot is distinct from root.commercial_snapshot
   or new.agreement_line_id is distinct from root.agreement_line_id or new.is_extra_work<>root.is_extra_work
  then raise exception 'Overgedragen werkzaamheden moeten de oorspronkelijke scope en afspraak behouden' using errcode='23514';end if;
 end if;
 return new;
end $function$
;

create or replace function private.personnel_fit(
  target_tenant uuid,
  target_personnel uuid,
  target_start timestamptz,
  target_end timestamptz,
  target_work_order uuid default null,
  target_function uuid default null
) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  person public.personnel;
  timezone_name text;
  preferences jsonb;
  required_function uuid := target_function;
  hard jsonb := '[]';
  warnings jsonb := '[]';
  qualification_issues jsonb := '[]';
  availability_state text := 'unknown';
  local_day date;
  last_day date;
  day_name text;
  day_settings jsonb;
  segment_start timestamptz;
  segment_end timestamptz;
  preference_covers boolean := true;
  requirement record;
begin
  if target_start is null or target_end is null or target_end<=target_start or not isfinite(target_start) or not isfinite(target_end) then
    return jsonb_build_object('eligible',false,'hardBlocks',jsonb_build_array('invalid-period'),'warnings','[]'::jsonb,
      'qualificationIssues','[]'::jsonb,'availabilityState','unknown');
  end if;
  select p.* into person from public.personnel p where p.tenant_id=target_tenant and p.id=target_personnel;
  select t.timezone into timezone_name from public.tenants t where t.id=target_tenant and t.status='active';
  if person.id is null or timezone_name is null then hard:=hard||jsonb_build_array('personnel-unavailable');
  else
    preferences:=person.availability_preferences;
    if person.status<>'active' or (person.start_date is not null and person.start_date>(target_start at time zone timezone_name)::date)
      or (person.end_date is not null and person.end_date<((target_end-interval '1 microsecond') at time zone timezone_name)::date) then
      hard:=hard||jsonb_build_array('inactive-period');
    end if;
    if exists(select 1 from public.personnel_contracts c where c.tenant_id=target_tenant and c.personnel_id=target_personnel)
      and not exists(select 1 from public.personnel_contracts c where c.tenant_id=target_tenant and c.personnel_id=target_personnel and c.active
        and c.starts_on<=((target_end-interval '1 microsecond') at time zone timezone_name)::date
        and (c.ends_on is null or c.ends_on>=(target_start at time zone timezone_name)::date)) then
      hard:=hard||jsonb_build_array('outside-engagement');
    end if;
    if exists(select 1 from public.availability a where a.tenant_id=target_tenant and a.personnel_id=target_personnel
      and a.kind in('unavailable','leave','sick') and a.starts_at<target_end and a.ends_at>target_start) then
      hard:=hard||jsonb_build_array('hard-absence');
    end if;
    if exists(select 1 from public.work_order_assignments a join public.work_orders w on w.tenant_id=a.tenant_id and w.id=a.work_order_id
      where a.tenant_id=target_tenant and a.personnel_id=target_personnel and a.status not in('completed','returned','cancelled')
        and w.status<>'cancelled' and (target_work_order is null or a.work_order_id<>target_work_order)
        and not exists(select 1 from private.task_visits visit where visit.tenant_id=a.tenant_id and visit.work_order_id=a.work_order_id and visit.state not in ('cancelled','missed')) and a.projected_start_at<target_end and a.projected_end_at>target_start)
    or exists(select 1 from private.task_visit_crew crew join private.task_visits visit on visit.tenant_id=crew.tenant_id and visit.id=crew.visit_id join public.work_order_assignments assignment on assignment.tenant_id=crew.tenant_id and assignment.id=crew.assignment_id where crew.tenant_id=target_tenant and crew.personnel_id=target_personnel and (target_work_order is null or crew.work_order_id<>target_work_order) and assignment.status not in ('returned','cancelled') and visit.state not in ('cancelled','missed') and visit.starts_at<target_end and visit.ends_at>target_start) then
      hard:=hard||jsonb_build_array('assignment-overlap');
    end if;
    if required_function is null and target_work_order is not null then
      select w.required_function_id into required_function from public.work_orders w where w.tenant_id=target_tenant and w.id=target_work_order;
    end if;
    if required_function is not null and not exists(select 1 from public.personnel_functions pf
      where pf.tenant_id=target_tenant and pf.personnel_id=target_personnel and pf.function_id=required_function)
      and not exists(select 1 from public.personnel_contracts c where c.tenant_id=target_tenant and c.personnel_id=target_personnel
        and c.function_id=required_function and c.active and c.starts_on<=((target_end-interval '1 microsecond') at time zone timezone_name)::date
        and (c.ends_on is null or c.ends_on>=(target_start at time zone timezone_name)::date)) then
      hard:=hard||jsonb_build_array('required-function');
    end if;
    if exists(select 1 from public.availability a where a.tenant_id=target_tenant and a.personnel_id=target_personnel
      and a.kind='available' and a.starts_at<=target_start and a.ends_at>=target_end) then
      availability_state:='known_available';
    elsif preferences is not null and preferences<>'{}'::jsonb then
      local_day:=(target_start at time zone timezone_name)::date;
      last_day:=((target_end-interval '1 microsecond') at time zone timezone_name)::date;
      while local_day<=last_day loop
        day_name:=case extract(isodow from local_day) when 1 then 'monday' when 2 then 'tuesday' when 3 then 'wednesday'
          when 4 then 'thursday' when 5 then 'friday' when 6 then 'saturday' else 'sunday' end;
        day_settings:=preferences->'week'->day_name;
        segment_start:=greatest(target_start,local_day::timestamp at time zone timezone_name);
        segment_end:=least(target_end,(local_day+1)::timestamp at time zone timezone_name);
        if coalesce((day_settings->>'enabled')::boolean,false)=false
          or segment_start < (local_day+(day_settings->>'start')::time) at time zone timezone_name
          or segment_end > (local_day+(day_settings->>'end')::time) at time zone timezone_name
          or extract(isodow from local_day) in(6,7) and coalesce((preferences->>'weekends')::boolean,false)=false then
          preference_covers:=false;
        end if;
        local_day:=local_day+1;
      end loop;
      if preference_covers then availability_state:='preference_available';
      else availability_state:='outside_preference'; warnings:=warnings||jsonb_build_array(jsonb_build_object(
        'key','availability:'||target_personnel,'message','Buiten de opgegeven vaste beschikbaarheid. Leg een reden vast om af te wijken.'));
      end if;
    else
      warnings:=warnings||jsonb_build_array(jsonb_build_object('key','availability:'||target_personnel,
        'message','Beschikbaarheid is onbekend. Leg een reden vast om deze inzet toch te plannen.'));
    end if;
    if target_work_order is not null then
      for requirement in select * from private.assignment_requirements(target_tenant,target_personnel,target_work_order,target_start,target_end) loop
        if not private.qualified_for_period(target_tenant,target_personnel,requirement.code,target_start,target_end) then
          qualification_issues:=qualification_issues||jsonb_build_array(jsonb_build_object('code',requirement.code,'hard',requirement.hard_requirement));
          if requirement.hard_requirement then hard:=hard||jsonb_build_array('qualification:'||requirement.code);
          else warnings:=warnings||jsonb_build_array(jsonb_build_object('key','qualification:'||target_personnel||':'||requirement.code,
            'message','Controleer de zachte kwalificatie-eis '||requirement.code||'.')); end if;
        end if;
      end loop;
    end if;
  end if;
  return jsonb_build_object('eligible',jsonb_array_length(hard)=0,'hardBlocks',hard,'warnings',warnings,
    'qualificationIssues',qualification_issues,'availabilityState',availability_state);
end $$;

CREATE OR REPLACE FUNCTION private.planning_assignment_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare w public.work_orders; p public.personnel; changed boolean;
begin
 perform pg_advisory_xact_lock(hashtextextended('fieldgrid-planning:'||coalesce(new.tenant_id,old.tenant_id)::text,0));
 if tg_op='DELETE' then return old;end if;
 select * into w from public.work_orders where tenant_id=new.tenant_id and id=new.work_order_id;
 if not found then raise exception 'Werkbon bestaat niet in deze organisatie' using errcode='23503';end if;
 changed:=tg_op='INSERT';
 if tg_op='UPDATE' then
   changed:=(new.personnel_id,new.work_order_id,new.projected_start_at,new.projected_end_at) is distinct from (old.personnel_id,old.work_order_id,old.projected_start_at,old.projected_end_at)
     or (old.status in ('cancelled','returned') and new.status not in ('cancelled','returned'));
 end if;
 if new.status in ('cancelled','returned','completed') or not changed then return new;end if;
 if new.actual_start_at is null and w.status not in ('planned','released','seen','travelling') then
   raise exception 'Deze uitvoering kan niet meer via het planbord worden gewijzigd' using errcode='23514';end if;
 select * into p from public.personnel where tenant_id=new.tenant_id and id=new.personnel_id;
 if not found or p.status<>'active' then raise exception 'Medewerker is niet actief' using errcode='23514';end if;
 -- Actual execution is recorded by the existing status command. Do not erase
 -- or reject an actual start because reality deviates from the plan.
 if new.actual_start_at is not null then return new;end if;
 if exists(select 1 from public.availability a where a.tenant_id=new.tenant_id and a.personnel_id=new.personnel_id and a.kind in ('unavailable','leave','sick') and a.starts_at<new.projected_end_at and a.ends_at>new.projected_start_at) then
   raise exception 'Medewerker is niet beschikbaar in dit tijdvak' using errcode='23P01';end if;
 if exists(select 1 from public.work_order_assignments a join public.work_orders other on other.tenant_id=a.tenant_id and other.id=a.work_order_id
   where a.tenant_id=new.tenant_id and a.personnel_id=new.personnel_id and a.id<>new.id and a.status not in ('completed','returned','cancelled') and other.status<>'cancelled'
   and not exists(select 1 from private.task_visits visit where visit.tenant_id=a.tenant_id and visit.work_order_id=a.work_order_id and visit.state not in ('cancelled','missed')) and a.projected_start_at<new.projected_end_at and a.projected_end_at>new.projected_start_at) then
   raise exception 'Medewerker heeft een overlappende uitvoering' using errcode='23P01';end if;
 if exists(select 1 from private.task_visit_crew crew join private.task_visits visit on visit.tenant_id=crew.tenant_id and visit.id=crew.visit_id where crew.tenant_id=new.tenant_id and crew.personnel_id=new.personnel_id and crew.assignment_id<>new.id and visit.state not in ('cancelled','missed') and visit.starts_at<new.projected_end_at and visit.ends_at>new.projected_start_at) then raise exception 'Medewerker heeft een overlappend bezoek' using errcode='23P01';end if;
 return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.change_work_order_planning_legacy(target_tenant uuid, target_work_order uuid, expected_version bigint, mutation_id uuid, target_start timestamp with time zone, target_end timestamp with time zone, target_assignments jsonb, confirmed_warnings text[] DEFAULT '{}'::text[], undo_change uuid DEFAULT NULL::uuid, appointment_data jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
<<planning_mutation>>
declare w public.work_orders; person public.personnel; a record; req record; current_a public.work_order_assignments;
 old_state jsonb; new_state jsonb; prior public.planning_changes; undo_record public.planning_changes;
 warnings jsonb:='[]'::jsonb; tz text; window_start timestamptz; window_end timestamptz;
 n integer; assignment_id uuid; desired_status text; route record; neighbour public.work_order_assignments;
begin
 perform private.management_assert(target_tenant,'backoffice.planning.write');
 perform private.management_assert(target_tenant,'backoffice.functions.change_work_order_planning');

 if not private.planning_access(target_tenant) then raise exception 'Geen toegang tot planning' using errcode='42501';end if;
 if expected_version is null or expected_version<1 or mutation_id is null then raise exception 'Een geldige wijzigingsversie en wijzigingssleutel zijn verplicht' using errcode='23514';end if;
 perform pg_advisory_xact_lock(hashtextextended('fieldgrid-planning:'||target_tenant::text,0));
 select * into w from public.work_orders where tenant_id=target_tenant and id=target_work_order for update;
 if not found then raise exception 'Werkbon niet gevonden' using errcode='42501';end if;
 select * into prior from public.planning_changes where id=mutation_id;
 if found then
   if prior.tenant_id<>target_tenant or prior.actor_user_id<>auth.uid() or prior.work_order_id<>w.id then raise exception 'Ongeldige wijzigingssleutel' using errcode='42501';end if;
   return jsonb_build_object('ok',true,'changeId',prior.id,'version',w.version,'replayed',true);
 end if;
 if w.version<>expected_version then raise exception 'De planning is intussen gewijzigd. Bekijk de actuele situatie en probeer opnieuw.' using errcode='40001';end if;
 if w.status not in ('planned','released','seen','travelling') or w.actual_start_at is not null or exists(select 1 from public.work_order_assignments where tenant_id=target_tenant and work_order_id=w.id and (actual_start_at is not null or status in ('in_progress','completed'))) then
   raise exception 'Deze uitvoering kan niet meer via het planbord worden gewijzigd' using errcode='23514';end if;
 old_state:=private.planning_snapshot(w.id);
 if undo_change is not null then
   select * into undo_record from public.planning_changes where id=undo_change and tenant_id=target_tenant and actor_user_id=auth.uid() and work_order_id=w.id and undone_by is null for update;
   if not found or (undo_record.after_data->>'version')::bigint<>w.version or exists(select 1 from public.planning_changes c where c.tenant_id=target_tenant and c.actor_user_id=auth.uid() and c.created_at>undo_record.created_at) then
     raise exception 'Deze wijziging kan niet meer veilig ongedaan worden gemaakt' using errcode='40001';end if;
   target_start:=(undo_record.before_data->>'start')::timestamptz;
   target_end:=(undo_record.before_data->>'end')::timestamptz;
   target_assignments:=undo_record.before_data->'assignments';
   appointment_data:=undo_record.before_data->'appointment';
 end if;
 if appointment_data is not null then
   if jsonb_typeof(appointment_data)<>'object' or not(appointment_data ?& array['requestedDate','windowKind','requiredPersonnel','instructions']) then raise exception 'Ongeldige afspraakgegevens' using errcode='23514';end if;
   w.requested_date:=(appointment_data->>'requestedDate')::date;
   w.customer_window_kind:=appointment_data->>'windowKind';
   w.required_personnel:=(appointment_data->>'requiredPersonnel')::integer;
   w.day_instructions:=appointment_data->>'instructions';
   if w.customer_window_kind is null or w.customer_window_kind not in ('unknown','arrival','execution') or w.required_personnel is null or w.required_personnel not between 1 and 100 or w.day_instructions is null or length(w.day_instructions)>2000 or (w.requested_date is not null and not isfinite(w.requested_date)) then raise exception 'Controleer de afspraakgegevens' using errcode='23514';end if;
 end if;
 if target_assignments is null or jsonb_typeof(target_assignments)<>'array' or jsonb_array_length(target_assignments)>100 then raise exception 'Ongeldige medewerkersselectie' using errcode='23514';end if;
 if (target_start is null)<>(target_end is null) or target_end<=target_start or (target_start is null and (w.status<>'planned' or jsonb_array_length(target_assignments)>0)) then raise exception 'Vul een geldige begin- en eindtijd in' using errcode='23514';end if;
 if target_start is not null and (not isfinite(target_start) or not isfinite(target_end) or target_end-target_start>interval '7 days' or date_trunc('minute',target_start)<>target_start or date_trunc('minute',target_end)<>target_end) then raise exception 'Gebruik hele minuten en een uitvoering van maximaal zeven dagen' using errcode='23514';end if;
 select timezone into tz from public.tenants where id=target_tenant;
 if (select count(*) from jsonb_array_elements(target_assignments))<>(select count(distinct x->>'personnelId') from jsonb_array_elements(target_assignments)x) then raise exception 'Selecteer iedere medewerker maximaal één keer' using errcode='23514';end if;
 select s.starts_at,s.ends_at into window_start,window_end from public.appointment_slots s where s.tenant_id=target_tenant and s.id=w.appointment_slot_id;
 if target_start is not null then
   if w.requested_date is not null and (target_start at time zone tz)::date<>w.requested_date then warnings:=warnings||jsonb_build_array(jsonb_build_object('key','requested-date','message','De planning wijkt af van de gewenste datum '||to_char(w.requested_date,'DD-MM-YYYY')));end if;
   if window_start is not null then
     if w.customer_window_kind='unknown' then warnings:=warnings||jsonb_build_array(jsonb_build_object('key','window-unknown','message','Het type klantvenster is onbekend; controleer de afspraak.'));
     elsif target_start<window_start or (w.customer_window_kind='arrival' and target_start>window_end) or(w.customer_window_kind='execution' and target_end>window_end) then
       warnings:=warnings||jsonb_build_array(jsonb_build_object('key','customer-window','message',case when w.customer_window_kind='arrival' then 'De begintijd valt buiten het aankomstvenster.' else 'De volledige uitvoering past niet binnen het klantvenster.' end));end if;
   end if;
 end if;
 n:=jsonb_array_length(target_assignments);
 if n<w.required_personnel then warnings:=warnings||jsonb_build_array(jsonb_build_object('key','staffing','message',(w.required_personnel-n)::text||' medewerker(s) ontbreken voor de gewenste bezetting.'));end if;
 for a in select * from jsonb_to_recordset(target_assignments) as x("personnelId" uuid,start timestamptz,"end" timestamptz) loop
   if a."personnelId" is null or a.start is null or a."end" is null or a."end"<=a.start or a.start<target_start or a."end">target_end or date_trunc('minute',a.start)<>a.start or date_trunc('minute',a."end")<>a."end" then raise exception 'Ongeldig tijdvak voor medewerker' using errcode='23514';end if;
   select * into person from public.personnel where tenant_id=target_tenant and id=a."personnelId";
   if not found then raise exception 'Medewerker niet gevonden in deze organisatie' using errcode='42501';end if;
   select * into current_a from public.work_order_assignments where tenant_id=target_tenant and work_order_id=w.id and personnel_id=person.id and status not in ('cancelled','returned');
   -- An unchanged historical assignment remains intact; no new work for inactive staff.
   if person.status<>'active' and (current_a.id is null or (current_a.projected_start_at,current_a.projected_end_at) is distinct from (a.start,a."end")) then raise exception 'Medewerker % is niet actief',person.full_name using errcode='23514';end if;
   if exists(select 1 from public.availability v where v.tenant_id=target_tenant and v.personnel_id=person.id and v.kind in ('unavailable','leave','sick') and v.starts_at<a."end" and v.ends_at>a.start) then raise exception '% is niet beschikbaar in dit tijdvak',person.full_name using errcode='23P01';end if;
   if exists(select 1 from public.work_order_assignments other join public.work_orders ow on ow.id=other.work_order_id and ow.tenant_id=other.tenant_id where other.tenant_id=target_tenant and other.personnel_id=person.id and other.work_order_id<>w.id and other.status not in ('completed','returned','cancelled') and ow.status<>'cancelled' and not exists(select 1 from private.task_visits visit where visit.tenant_id=other.tenant_id and visit.work_order_id=other.work_order_id and visit.state not in ('cancelled','missed')) and other.projected_start_at<a."end" and other.projected_end_at>a.start) then raise exception '% heeft een overlappende uitvoering',person.full_name using errcode='23P01';end if;
   if exists(select 1 from public.availability v where v.tenant_id=target_tenant and v.personnel_id=person.id and v.kind='available' and v.starts_at<(date_trunc('day',a.start at time zone tz)+interval '1 day') at time zone tz and v.ends_at>date_trunc('day',a.start at time zone tz) at time zone tz)
    and not exists(select 1 from public.availability v where v.tenant_id=target_tenant and v.personnel_id=person.id and v.kind='available' and v.starts_at<=a.start and v.ends_at>=a."end") then warnings:=warnings||jsonb_build_array(jsonb_build_object('key','hours:'||person.id,'message',person.full_name||': buiten de bekende werktijden.'));end if;
   for req in select * from private.assignment_requirements(target_tenant,person.id,w.id,a.start,a."end") loop
     if not private.qualified_for_period(target_tenant,person.id,req.code,a.start,a."end") then
       if req.hard_requirement then raise exception '% mist de vereiste kwalificatie % voor de volledige uitvoering',person.full_name,req.code using errcode='23514';end if;
       warnings:=warnings||jsonb_build_array(jsonb_build_object('key','qualification:'||person.id||':'||req.code,'message',person.full_name||': controleer kwalificatie '||req.code));
     end if;
   end loop;
   -- Only an existing calculation whose endpoints match the actual neighbouring
   -- objects is usable here. No assumed home base, mode or invented minutes.
   for route in select l.* from public.travel_legs l join public.work_order_assignments ra on ra.id=l.assignment_id and ra.tenant_id=l.tenant_id
     where l.tenant_id=target_tenant and ra.work_order_id=w.id and ra.personnel_id=person.id and l.error_code is null and l.calculated_at is not null and l.estimated_minutes is not null loop
     if route.direction='before' then
       select aa.* into neighbour from public.work_order_assignments aa join public.work_orders ow on ow.tenant_id=aa.tenant_id and ow.id=aa.work_order_id
       where aa.tenant_id=target_tenant and aa.personnel_id=person.id and aa.work_order_id<>w.id and aa.status not in ('cancelled','returned') and ow.status<>'cancelled' and aa.projected_end_at<=a.start order by aa.projected_end_at desc limit 1;
     else
       select aa.* into neighbour from public.work_order_assignments aa join public.work_orders ow on ow.tenant_id=aa.tenant_id and ow.id=aa.work_order_id
       where aa.tenant_id=target_tenant and aa.personnel_id=person.id and aa.work_order_id<>w.id and aa.status not in ('cancelled','returned') and ow.status<>'cancelled' and aa.projected_start_at>=a."end" order by aa.projected_start_at limit 1;
     end if;
     if neighbour.id is not null and exists(select 1 from public.objects ob join public.work_orders ow on ow.object_id=ob.id and ow.tenant_id=ob.tenant_id
       where ow.tenant_id=target_tenant and ow.id=neighbour.work_order_id and ob.address=case when route.direction='before' then route.origin_address else route.destination_address end)
       and exists(select 1 from public.objects ob where ob.tenant_id=target_tenant and ob.id=w.object_id and ob.address=case when route.direction='before' then route.destination_address else route.origin_address end)
       and (case when route.direction='before' then a.start-neighbour.projected_end_at else neighbour.projected_start_at-a."end" end)<make_interval(mins=>route.estimated_minutes) then
         warnings:=warnings||jsonb_build_array(jsonb_build_object('key','travel:'||person.id||':'||route.direction,'message',person.full_name||': minder ruimte tussen afspraken dan de bestaande reisberekening van '||route.estimated_minutes||' minuten. Controleer de route opnieuw.'));
     end if;
   end loop;
 end loop;
 if exists(select 1 from jsonb_array_elements(warnings)x where not(coalesce(x->>'key','')=any(coalesce(confirmed_warnings,'{}')))) then
   return jsonb_build_object('ok',false,'code','confirmation','warnings',warnings,'before',old_state,'proposed',jsonb_build_object('start',target_start,'end',target_end,'assignments',target_assignments));
 end if;
 -- Removing an assignment archives it and revokes its dispatch, preserving time,
 -- reports, historical dispatches and invoice relations. Never delete the work order.
 update public.dispatches d set revoked_at=clock_timestamp() where d.tenant_id=target_tenant and d.work_order_id=w.id and d.revoked_at is null and not exists(select 1 from public.work_order_assignments aa join jsonb_array_elements(target_assignments)x on (x->>'personnelId')::uuid=aa.personnel_id where aa.id=d.assignment_id);
 update public.work_order_assignments aa set status='cancelled' where aa.tenant_id=target_tenant and aa.work_order_id=w.id and aa.status not in ('cancelled','returned') and not exists(select 1 from jsonb_array_elements(target_assignments)x where (x->>'personnelId')::uuid=aa.personnel_id);
 for a in select * from jsonb_to_recordset(target_assignments) as x("personnelId" uuid,start timestamptz,"end" timestamptz) loop
   select * into current_a from public.work_order_assignments where tenant_id=target_tenant and work_order_id=w.id and personnel_id=a."personnelId";
   desired_status:=case when w.status='planned' then 'planned' else 'released' end;
   if current_a.id is null then
     insert into public.work_order_assignments(tenant_id,work_order_id,personnel_id,planned_start_at,planned_end_at,projected_start_at,projected_end_at,status)
     values(target_tenant,w.id,a."personnelId",a.start,a."end",a.start,a."end",desired_status) returning id into assignment_id;
   else
     assignment_id:=current_a.id;
     if (current_a.projected_start_at,current_a.projected_end_at) is distinct from (a.start,a."end") or current_a.status in ('cancelled','returned') then
       update public.work_order_assignments set planned_start_at=a.start,planned_end_at=a."end",projected_start_at=a.start,projected_end_at=a."end",status=case when status in ('cancelled','returned') then desired_status else status end where id=assignment_id;
     end if;
   end if;
   if w.status<>'planned' and not exists(select 1 from public.dispatches d where d.tenant_id=target_tenant and d.assignment_id=planning_mutation.assignment_id and d.revoked_at is null) then
     insert into public.dispatches(tenant_id,work_order_id,assignment_id,dispatched_by,idempotency_key) values(target_tenant,w.id,assignment_id,auth.uid(),'planning:'||mutation_id||':'||a."personnelId");
   end if;
 end loop;
 update public.work_orders set planned_start_at=target_start,planned_end_at=target_end,projected_start_at=target_start,projected_end_at=target_end,
   requested_date=w.requested_date,customer_window_kind=w.customer_window_kind,required_personnel=w.required_personnel,day_instructions=w.day_instructions,
    planning_state=case
      when undo_change is not null then coalesce(undo_record.before_data->>'planningState',w.planning_state)
      when w.planning_state='unassigned' and target_start is not null and jsonb_array_length(target_assignments)>0 then 'tentative'
      when w.planning_state='tentative' and target_start is null then 'unassigned'
      else w.planning_state end where id=w.id;
 -- Restore the old contractual planned interval on undo without changing reality.
 if undo_change is not null then
   update public.work_orders set planned_start_at=(undo_record.before_data->>'plannedStart')::timestamptz,planned_end_at=(undo_record.before_data->>'plannedEnd')::timestamptz where id=w.id;
   update public.work_order_assignments aa set planned_start_at=(x->>'plannedStart')::timestamptz,planned_end_at=(x->>'plannedEnd')::timestamptz from jsonb_array_elements(target_assignments)x where aa.tenant_id=target_tenant and aa.work_order_id=w.id and aa.personnel_id=(x->>'personnelId')::uuid;
 end if;
 -- Cached routes depend on both neighbours, their origins and departure times.
 -- The existing route module can recalculate; stale minutes must not masquerade as reliable.
 update public.travel_legs leg set error_code='planning_changed',calculated_at=null where leg.tenant_id=target_tenant and leg.actual_started_at is null and exists(select 1 from public.work_order_assignments aa where aa.id=leg.assignment_id and aa.tenant_id=target_tenant and aa.personnel_id in(select (x->>'personnelId')::uuid from jsonb_array_elements(target_assignments||(old_state->'assignments'))x));
 new_state:=private.planning_snapshot(w.id);
 insert into public.planning_changes(id,tenant_id,work_order_id,actor_user_id,before_data,after_data,confirmed_warnings) values(mutation_id,target_tenant,w.id,auth.uid(),old_state,new_state,warnings);
 if undo_change is not null then update public.planning_changes set undone_by=mutation_id where id=undo_change;end if;
 insert into public.audit_events(tenant_id,actor_user_id,action,entity_type,entity_id,before_data,after_data) values(target_tenant,auth.uid(),case when undo_change is null then 'planning.changed' else 'planning.undone' end,'work_order',w.id,old_state,new_state||jsonb_build_object('confirmed_warnings',warnings,'mutation_id',mutation_id));
 if w.status<>'planned' then
   for a in select distinct (x->>'personnelId')::uuid as pid from jsonb_array_elements(target_assignments)x loop
     perform private.enqueue_event(target_tenant,'work_order.rescheduled','work_order',w.id,jsonb_build_object('personnel_id',a.pid),'planning:'||mutation_id||':'||a.pid);
   end loop;
 end if;
 return jsonb_build_object('ok',true,'changeId',mutation_id,'version',(new_state->>'version')::bigint,'warnings',warnings);
end $function$
;
