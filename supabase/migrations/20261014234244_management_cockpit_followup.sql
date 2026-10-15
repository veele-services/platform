insert into public.permission_catalog(key,domain,name,description,module,action,scopes,dependencies)
values('backoffice.functions.cockpit_followup','tenant','Control Center bekijken','Operationele opvolging met bronrechten en eigen actieregistraties.','followup','read',array['tenant'],array['backoffice.followup.read']),
('backoffice.functions.cockpit_followup_command','tenant','Control Center beheren','Opvolgacties toevoegen, toewijzen en gemotiveerd uitstellen.','followup','write',array['tenant'],array['backoffice.followup.read','backoffice.followup.write']) on conflict(key) do nothing;
insert into private.management_role_permissions(tenant_id,role_id,capability)
select r.tenant_id,r.id,c.key from private.management_roles r cross join public.permission_catalog c
where c.key in('backoffice.functions.cockpit_followup','backoffice.functions.cockpit_followup_command') and exists(select 1 from private.management_role_permissions page where page.role_id=r.id and page.capability=case c.action when 'read' then 'backoffice.followup.read' else 'backoffice.followup.write' end) on conflict do nothing;

-- Management follow-up is a projection of the existing dossier sources. An
-- overlay stores responsibility/snoozing where a source has no such field;
-- it never claims that a visit, report or customer request was executed.
create table private.cockpit_actions(
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null references public.tenants(id),
 source_kind text not null,source_id uuid not null,title text not null check(length(btrim(title)) between 2 and 180),
 scope text not null default 'general' check(scope in('general','finance','personnel','quality')),
 due_on date not null,original_due_on date not null,owner_id uuid references auth.users(id),
 state text not null default 'open' check(state in('open','done')),snoozed_until date,
 note text not null default '' check(length(note)<=10000),automatic boolean not null default false,
 trigger_key text,revision bigint not null default 1,created_by uuid not null references auth.users(id),
 created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp(),
 unique(tenant_id,id),unique(tenant_id,source_kind,source_id,trigger_key)
);
create index cockpit_actions_due on private.cockpit_actions(tenant_id,due_on,id) where state='open';
create table private.cockpit_action_overlays(
 tenant_id uuid not null references public.tenants(id),source_kind text not null check(source_kind in('object','personnel','execution','request')),
 source_id uuid not null,owner_id uuid references auth.users(id),snoozed_until date,note text not null default '' check(length(note)<=10000),
 revision bigint not null default 1,updated_at timestamptz not null default clock_timestamp(),primary key(tenant_id,source_kind,source_id)
);
create table private.cockpit_events(
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null references public.tenants(id),
 record_kind text not null,record_id uuid not null,actor_id uuid not null references auth.users(id),
 event text not null,revision bigint not null,details jsonb not null default '{}',created_at timestamptz not null default clock_timestamp()
);
create index cockpit_events_record on private.cockpit_events(tenant_id,record_kind,record_id,created_at,id);
create table private.cockpit_receipts(
 tenant_id uuid not null references public.tenants(id),actor_id uuid not null references auth.users(id),request_id uuid not null,
 fingerprint text not null,result jsonb not null,created_at timestamptz not null default clock_timestamp(),primary key(tenant_id,actor_id,request_id)
);
do $$declare n text;begin
 foreach n in array array['cockpit_actions','cockpit_action_overlays','cockpit_events','cockpit_receipts'] loop
 execute format('alter table private.%I enable row level security',n);execute format('alter table private.%I force row level security',n);
 execute format('revoke all on private.%I from public,anon,authenticated,service_role',n);
 end loop;
end$$;

create function private.cockpit_access(t uuid,cap text) returns boolean language sql stable security definer set search_path='' as $$
 select coalesce(private.actor_session_active() and exists(select 1 from auth.users u where u.id=auth.uid() and u.email_confirmed_at is not null)
 and private.has_role(t,array['tenant_admin','management','planner','finance','hr']::public.app_role[])
 and private.management_allowed(t,'backoffice.access') and private.management_allowed(t,cap),false)
$$;
create function private.cockpit_assert(t uuid,cap text) returns void language plpgsql stable security definer set search_path='' as $$
begin if not private.cockpit_access(t,cap) then raise exception 'Geen toegang tot dit managementonderdeel.' using errcode='42501';end if;end$$;

create function private.cockpit_source(t uuid,kind text,rid uuid,writing boolean default false) returns boolean language plpgsql stable security definer set search_path='' as $$
declare action text:=case when writing then 'write' else 'read' end;begin
 if rid is null or not private.cockpit_access(t,'backoffice.followup.read') then return false;end if;
 case kind
 when 'tenant' then return rid=t and not writing;
 when 'customer' then return private.commercial_access(t) and private.management_allowed(t,'backoffice.customers.'||action) and exists(select 1 from public.customers where tenant_id=t and id=rid);
 when 'object' then return private.object_manage(t) and private.management_table_allowed(t,'objects',writing) and exists(select 1 from public.objects where tenant_id=t and id=rid);
 when 'personnel' then return private.can_access_personnel(t,rid,true) and private.management_table_allowed(t,'personnel_dossier_items',writing) and exists(select 1 from public.personnel where tenant_id=t and id=rid);
 when 'work_order' then return private.planning_access(t) and private.management_allowed(t,'backoffice.work_orders.'||action) and private.management_allowed(t,'backoffice.functions.work_order_dossier') and exists(select 1 from public.work_orders where tenant_id=t and id=rid);
 when 'commercial_request' then return private.commercial_access(t) and private.management_allowed(t,'backoffice.commercial.'||action) and private.management_allowed(t,'backoffice.functions.commercial_detail') and exists(select 1 from public.requests where tenant_id=t and id=rid);
 when 'quote' then return private.commercial_access(t) and private.management_allowed(t,'backoffice.commercial.'||action) and private.management_allowed(t,'backoffice.functions.commercial_detail') and exists(select 1 from public.quotes where tenant_id=t and id=rid);
 when 'agreement' then return private.commercial_access(t) and private.management_allowed(t,'backoffice.customers.'||action) and(private.management_allowed(t,'backoffice.finance.read') or private.management_allowed(t,'backoffice.commercial.read')) and exists(select 1 from public.customer_agreements where tenant_id=t and id=rid);
 when 'object_action' then return private.object_manage(t) and private.management_table_allowed(t,'object_records',writing) and exists(select 1 from public.object_records where tenant_id=t and id=rid and object_records.kind in('task','quality','material'));
 when 'personnel_action' then return exists(select 1 from public.personnel_dossier_items p where p.tenant_id=t and p.id=rid and p.kind in('task','checklist') and private.can_access_personnel(t,p.personnel_id,true)) and private.management_table_allowed(t,'personnel_dossier_items',writing);
 when 'execution' then return private.planning_access(t) and private.management_allowed(t,'backoffice.work_orders.'||action) and private.management_allowed(t,'backoffice.functions.work_order_operational_task_data') and exists(select 1 from public.work_order_tasks where tenant_id=t and id=rid);
 when 'request' then return private.object_manage(t) and private.management_table_allowed(t,'object_visit_requests',writing) and exists(select 1 from public.object_visit_requests where tenant_id=t and id=rid);
 else return false;
 end case;
end$$;
create function private.cockpit_scope(t uuid,scope text) returns boolean language sql stable security definer set search_path='' as $$
 select case scope when 'general' then true when 'finance' then private.commercial_access(t) and private.management_allowed(t,'backoffice.finance.read') and private.service_enabled(t,'finance')
 when 'personnel' then private.dossier_access(t) and private.management_allowed(t,'backoffice.personnel.sensitive')
 when 'quality' then private.management_allowed(t,'backoffice.reports.read') and private.service_enabled(t,'rapportage') else false end
$$;
create function private.cockpit_owner(t uuid,person uuid) returns boolean language sql stable security definer set search_path='' as $$
 select person is null or exists(select 1 from public.tenant_memberships m join auth.users u on u.id=m.user_id
 where m.tenant_id=t and m.user_id=person and m.status='active' and m.roles&&array['tenant_admin','management','planner','finance','hr']::public.app_role[]
 and u.email_confirmed_at is not null and u.deleted_at is null and not coalesce(u.is_anonymous,false) and(u.banned_until is null or u.banned_until<now())
 and(not private.management_is_managed(t,person) or private.management_has(t,person,'backoffice.access')))
$$;
create function private.cockpit_action_visible(a private.cockpit_actions) returns boolean language sql stable security definer set search_path='' as $$
 select private.cockpit_access(a.tenant_id,'backoffice.followup.read') and private.cockpit_scope(a.tenant_id,a.scope) and private.cockpit_source(a.tenant_id,a.source_kind,a.source_id)
$$;
create function private.cockpit_followup_data(t uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare actions jsonb;overlays jsonb;owners jsonb;begin
 perform private.cockpit_assert(t,'backoffice.followup.read');
 perform private.cockpit_assert(t,'backoffice.functions.cockpit_followup');
 select coalesce(jsonb_agg(to_jsonb(a) order by a.due_on,a.id),'[]') into actions from private.cockpit_actions a where a.tenant_id=t and private.cockpit_action_visible(a);
 select coalesce(jsonb_agg(to_jsonb(o)),'[]') into overlays from private.cockpit_action_overlays o where o.tenant_id=t and private.cockpit_source(t,case o.source_kind when 'object' then 'object_action' when 'personnel' then 'personnel_action' else o.source_kind end,o.source_id);
 select coalesce(jsonb_agg(jsonb_build_object('id',m.user_id,'name',coalesce(nullif(mm.full_name,''),nullif(u.raw_user_meta_data->>'full_name',''),'Gebruiker')) order by mm.full_name,m.user_id),'[]') into owners
 from public.tenant_memberships m join auth.users u on u.id=m.user_id left join private.management_members mm on mm.tenant_id=m.tenant_id and mm.membership_id=m.id where m.tenant_id=t and private.cockpit_owner(t,m.user_id);
 return jsonb_build_object('actions',actions,'overlays',overlays,'owners',owners,'actorId',auth.uid(),'today',(now() at time zone(select timezone from public.tenants where id=t))::date,'canWrite',private.cockpit_access(t,'backoffice.followup.write') and private.cockpit_access(t,'backoffice.functions.cockpit_followup_command'));
end$$;

create function public.cockpit_followup(target_tenant uuid) returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare chain jsonb;extra jsonb;begin
 perform private.cockpit_assert(target_tenant,'backoffice.followup.read');
 perform private.cockpit_assert(target_tenant,'backoffice.functions.cockpit_followup');
 -- This call must stay INVOKER: operational/HR/financial source RLS remains in
 -- effect. Never move this projection into a service-role/definer RPC.
 chain:=public.dossier_chain(target_tenant);extra:=private.cockpit_followup_data(target_tenant);
 return extra||jsonb_build_object('sources',(select coalesce(jsonb_agg(s||jsonb_build_object('canModify',private.cockpit_source(target_tenant,case s->>'kind' when 'object' then 'object_action' when 'personnel' then 'personnel_action' else s->>'kind' end,(s->>'id')::uuid,true))),'[]') from jsonb_array_elements(chain->'actions') s),'customers',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name)),'[]') from public.customers where tenant_id=target_tenant and private.cockpit_source(target_tenant,'customer',id)),
 'sourceOptions',coalesce((select jsonb_agg(option order by option->>'label') from(
 select jsonb_build_object('id',id,'kind','customer','label',customer_number||' · '||name,'href','/app/klanten/'||id::text) option from public.customers where tenant_id=target_tenant and private.cockpit_source(target_tenant,'customer',id)
 union all select jsonb_build_object('id',id,'kind','object','label',object_number||' · '||name,'href','/app/objecten/'||id::text) from public.objects where tenant_id=target_tenant and private.cockpit_source(target_tenant,'object',id)
 union all select jsonb_build_object('id',id,'kind','quote','label',quote_number||' · '||subject,'href','/app/aanvragen?tab=quotes&recordKind=quote&record='||id::text) from public.quotes where tenant_id=target_tenant and private.cockpit_source(target_tenant,'quote',id)
 union all select jsonb_build_object('id',id,'kind','agreement','label',title||' · v'||version,'href','/app/klanten/'||customer_id::text||'?tab=contracten') from public.customer_agreements where tenant_id=target_tenant and private.cockpit_source(target_tenant,'agreement',id)
 union all select jsonb_build_object('id',id,'kind','personnel','label',employee_number||' · '||full_name,'href','/app/personeel/'||id::text) from public.personnel where tenant_id=target_tenant and private.cockpit_source(target_tenant,'personnel',id)
 union all select jsonb_build_object('id',target_tenant,'kind','tenant','label','Organisatie','href','/app')
 )options),'[]'));
end$$;

-- Audit is read only, bounded, and re-authorized against the current source.
-- A stale dialog or a former owner cannot read notes after source revocation.
create function public.cockpit_action_history(target_tenant uuid,kind text,record_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
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
   'actor',coalesce(nullif(mm.full_name,''),nullif(u.raw_user_meta_data->>'full_name',''),'Gebruiker')) row
  from private.cockpit_events e left join auth.users u on u.id=e.actor_id left join public.tenant_memberships m on m.tenant_id=e.tenant_id and m.user_id=e.actor_id
  left join private.management_members mm on mm.membership_id=m.id and mm.tenant_id=e.tenant_id
  where e.tenant_id=target_tenant and e.record_kind='action:'||kind and e.record_id=cockpit_action_history.record_id order by e.created_at desc,e.id limit 100
 )events),'[]');
end$$;

create function public.cockpit_followup_command(target_tenant uuid,command text,input jsonb,request_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
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
  if not found or not private.cockpit_action_visible(a) then raise exception 'Actie niet beschikbaar.' using errcode='42501';end if;
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

revoke all on function private.cockpit_access(uuid,text),private.cockpit_assert(uuid,text),private.cockpit_source(uuid,text,uuid,boolean),private.cockpit_scope(uuid,text),private.cockpit_owner(uuid,uuid),private.cockpit_action_visible(private.cockpit_actions),private.cockpit_followup_data(uuid) from public,anon,authenticated,service_role;
-- The invoker projection may call only these guarded, bounded private adapters.
grant execute on function private.cockpit_assert(uuid,text),private.cockpit_source(uuid,text,uuid,boolean),private.cockpit_followup_data(uuid) to authenticated;
revoke all on function public.cockpit_followup(uuid),public.cockpit_followup_command(uuid,text,jsonb,uuid),public.cockpit_action_history(uuid,text,uuid) from public,anon,authenticated,service_role;
grant execute on function public.cockpit_followup(uuid),public.cockpit_followup_command(uuid,text,jsonb,uuid),public.cockpit_action_history(uuid,text,uuid) to authenticated;
notify pgrst,'reload schema';
