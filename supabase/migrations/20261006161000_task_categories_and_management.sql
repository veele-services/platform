-- Tenant-scoped catalogue numbering and audited management commands.
create table public.task_categories (
 id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.tenants(id),
 name text not null check(length(btrim(name)) between 2 and 120),
 prefix text not null check(prefix ~ '^[A-Z0-9][A-Z0-9-]{0,11}$'),
 next_number integer not null default 1 check(next_number between 1 and 999999999),
 active boolean not null default true, version bigint not null default 1,
 created_at timestamptz not null default clock_timestamp(), updated_at timestamptz not null default clock_timestamp(),
 unique(tenant_id,id), unique(tenant_id,prefix), unique(tenant_id,name)
);
alter table public.task_categories enable row level security;
alter table public.task_categories force row level security;
revoke all on public.task_categories from public,anon,authenticated,service_role;
grant select on public.task_categories to authenticated;
create policy task_categories_read on public.task_categories for select to authenticated using(private.object_manage(tenant_id));
alter table public.task_catalog add column category_id uuid, add column version bigint not null default 1,
 add foreign key(tenant_id,category_id) references public.task_categories(tenant_id,id);
alter table public.task_revisions add column requires_photo boolean not null default false,
 add column requires_customer_signature boolean not null default false;

create function public.task_catalogue(target_tenant uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare finance boolean;
begin
 if not private.object_session_active() or not private.planning_access(target_tenant) then raise exception 'Geen toegang tot taakbeheer' using errcode='42501';end if;
 finance:=private.commercial_access(target_tenant);
 return jsonb_build_object('finance',finance,
  'categories',coalesce((select jsonb_agg(to_jsonb(c) order by c.name,c.id) from public.task_categories c where c.tenant_id=target_tenant),'[]'),
  'tasks',coalesce((select jsonb_agg(jsonb_build_object('id',t.id,'categoryId',t.category_id,'code',t.code,'name',t.name,'description',t.description,'discipline',t.discipline,'active',t.active,'version',t.version,'revisionId',r.id,'duration',r.duration_minutes,'requiresPhoto',r.requires_photo,'requiresSignature',r.requires_customer_signature,'extraWork',coalesce(e.active,false))||case when finance then jsonb_build_object('priceCents',r.price_cents,'vatBasisPoints',r.vat_basis_points) else '{}' end order by t.code,t.id)
   from public.task_catalog t left join lateral(select * from public.task_revisions r where r.tenant_id=t.tenant_id and r.task_id=t.id and r.valid_until is null order by r.revision desc limit 1)r on true left join public.extra_work_rules e on e.tenant_id=t.tenant_id and e.task_revision_id=r.id where t.tenant_id=target_tenant),'[]'));
end $$;
revoke all on function public.task_catalogue(uuid) from public,anon,service_role;
grant execute on function public.task_catalogue(uuid) to authenticated;

create function public.task_catalogue_command(target_tenant uuid,input jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare c public.task_categories;t public.task_catalog;r public.task_revisions;new_revision public.task_revisions;
 prior private.work_order_commands;mid uuid:=(input->>'mutationId')::uuid;action text:=input->>'action';hash text;result jsonb;new_code text;number integer;price bigint;vat integer;
begin
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
   insert into public.task_revisions(tenant_id,task_id,revision,duration_minutes,price_cents,vat_basis_points,unit,requires_photo,requires_customer_signature)
   values(target_tenant,t.id,coalesce(r.revision,0)+1,(input->>'duration')::integer,price,vat,coalesce(r.unit,'task'),coalesce((input->>'requiresPhoto')::boolean,false),coalesce((input->>'requiresSignature')::boolean,false)) returning * into new_revision;
   if coalesce((input->>'extraWork')::boolean,false) then insert into public.extra_work_rules(tenant_id,task_revision_id,requires_photo,requires_review) values(target_tenant,new_revision.id,new_revision.requires_photo,true);end if;
  end if;
  result:=jsonb_build_object('ok',true,'id',t.id,'version',t.version,'code',t.code);
 end if;
 insert into private.work_order_commands values(mid,target_tenant,auth.uid(),'catalogue:'||action,hash,result,clock_timestamp());
 insert into public.audit_events(tenant_id,actor_user_id,action,entity_type,entity_id,after_data) values(target_tenant,auth.uid(),'catalogue.'||action,case when action like 'category_%' then 'task_category' else 'task' end,(result->>'id')::uuid,result);
 return result;
end $$;
revoke all on function public.task_catalogue_command(uuid,jsonb) from public,anon,service_role;
grant execute on function public.task_catalogue_command(uuid,jsonb) to authenticated;

create function private.task_revision_requirements_immutable() returns trigger language plpgsql set search_path='' as $$
begin
 if(new.requires_photo,new.requires_customer_signature) is distinct from(old.requires_photo,old.requires_customer_signature) then raise exception 'Bewijsafspraken horen bij een nieuwe taakversie' using errcode='23514';end if;
 return new;
end $$;
revoke all on function private.task_revision_requirements_immutable() from public,anon,authenticated,service_role;
create trigger task_revision_requirements_immutable before update on public.task_revisions for each row execute function private.task_revision_requirements_immutable();

CREATE OR REPLACE FUNCTION private.validate_work_order_report(w work_orders)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
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
end $function$

;
CREATE OR REPLACE FUNCTION private.work_order_signature_policy(w work_orders)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare mode text;source text;object_mode text;settings jsonb;employee boolean;legacy_default boolean;
begin
 if w.signature_policy_snapshot is not null then
  if exists(select 1 from public.work_order_tasks t join public.task_revisions r on r.tenant_id=t.tenant_id and r.id=t.task_revision_id where t.tenant_id=w.tenant_id and t.work_order_id=w.id and r.requires_customer_signature and(not t.is_extra_work or t.extra_work_status<>'rejected')) then return w.signature_policy_snapshot||jsonb_build_object('mode','required','source','task');end if;
  return w.signature_policy_snapshot;
 end if;
 select s.settings->'workOrders',s.signature_required_default into settings,legacy_default from public.tenant_settings s where tenant_id=w.tenant_id;
 select o.signature_mode into object_mode from public.objects o where tenant_id=w.tenant_id and id=w.object_id;
 mode:=nullif(to_jsonb(w)->>'signature_mode','inherit');source:='work_order';
 if mode is null and object_mode<>'inherit' then mode:=object_mode;source:='object';end if;
 if mode is null then mode:=nullif(w.template_snapshot->'definition'->>'signatureMode','inherit');source:='template';end if;
 if mode is null then mode:=coalesce(settings->>'signatureMode',case when legacy_default then 'required' else 'none' end);source:='tenant';end if;
 if mode not in ('none','optional','required') then raise exception 'Ongeldige ondertekeninstelling' using errcode='23514';end if;
 employee:=coalesce((settings->>'employeeSignatureRequired')::boolean,false) or coalesce((w.template_snapshot->'definition'->>'employeeSignatureRequired')::boolean,false) or w.employee_signature_required;
 if exists(select 1 from public.work_order_tasks t join public.task_revisions r on r.tenant_id=t.tenant_id and r.id=t.task_revision_id where t.tenant_id=w.tenant_id and t.work_order_id=w.id and r.requires_customer_signature and(not t.is_extra_work or t.extra_work_status<>'rejected')) then mode:='required';source:='task';end if;
 return jsonb_build_object('mode',mode,'source',source,'employeeRequired',employee);
end $function$
;

create function public.manage_work_order(target_tenant uuid,input jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare w public.work_orders;a public.work_order_assignments;r public.work_order_report_versions;prior private.work_order_commands;
 mid uuid:=(input->>'mutationId')::uuid;command text:=input->>'action';target text:=input->>'status';reason text:=btrim(coalesce(input->>'reason',''));hash text;result jsonb;at timestamptz:=clock_timestamp();next_status public.work_order_status;
begin
 if not private.object_manage(target_tenant) or not private.has_role(target_tenant,array['tenant_admin','management']::public.app_role[]) then raise exception 'Beheerrecht vereist' using errcode='42501';end if;
 if mid is null or command not in('remove_assignment','status') or length(reason) not between 3 and 1000 then raise exception 'Kies een wijziging en leg een reden vast' using errcode='23514';end if;
 perform pg_advisory_xact_lock(hashtextextended('fieldgrid-planning:'||target_tenant,0));
 hash:=encode(extensions.digest(input::text,'sha256'),'hex');select * into prior from private.work_order_commands where id=mid;
 if found then if(prior.tenant_id,prior.actor_id,prior.command,prior.payload_hash) is distinct from(target_tenant,auth.uid(),'manage:'||command,hash) then raise exception 'Ongeldige herhaalsleutel' using errcode='23514';end if;return prior.result;end if;
 select * into w from public.work_orders where tenant_id=target_tenant and id=(input->>'orderId')::uuid for update;
 if w.id is null then raise exception 'Werkbon niet beschikbaar' using errcode='42501';end if;
 if w.version is distinct from(input->>'version')::bigint then raise exception 'Werkbon is intussen gewijzigd' using errcode='40001';end if;
 if w.archive_at is not null or w.status in('approved','invoice_ready','invoiced','cancelled') then raise exception 'Deze werkbon is alleen leesbaar' using errcode='23514';end if;
 if command='remove_assignment' then
  if w.report_state not in('draft','correction') then raise exception 'Vraag eerst rapportcorrectie; de vastgelegde oplevering blijft bewaard' using errcode='23514';end if;
  select * into a from public.work_order_assignments where tenant_id=target_tenant and work_order_id=w.id and id=(input->>'assignmentId')::uuid for update;
  if a.id is null then raise exception 'Inzet niet beschikbaar' using errcode='42501';end if;
  if a.status in('completed','returned','cancelled') then raise exception 'Afgesloten inzet blijft in de historie bewaard' using errcode='23514';end if;
  update public.time_entries set ends_at=greatest(at,starts_at+interval '1 microsecond') where tenant_id=target_tenant and assignment_id=a.id and ends_at is null;
  update public.work_order_assignments set status='returned',actual_end_at=case when actual_start_at is not null then greatest(at,actual_start_at+interval '1 microsecond') else null end,paused_at=null,return_reason_code='management_removed',return_note=reason where id=a.id;
  update public.dispatches set revoked_at=at where tenant_id=target_tenant and assignment_id=a.id and revoked_at is null;
  -- Preserve completed task attribution. Open tasks can be picked up by the remaining team.
  update public.work_order_tasks set assigned_personnel_id=null where tenant_id=target_tenant and work_order_id=w.id and assigned_personnel_id=a.personnel_id and completed_at is null;
  next_status:=case when exists(select 1 from public.work_order_assignments x where x.tenant_id=target_tenant and x.work_order_id=w.id and x.status='in_progress') then 'in_progress'::public.work_order_status
   when exists(select 1 from public.work_order_assignments x where x.tenant_id=target_tenant and x.work_order_id=w.id and x.status='travelling') then 'travelling'::public.work_order_status
   when exists(select 1 from public.work_order_assignments x where x.tenant_id=target_tenant and x.work_order_id=w.id and x.status='seen') then 'seen'::public.work_order_status
   when exists(select 1 from public.work_order_assignments x where x.tenant_id=target_tenant and x.work_order_id=w.id and x.status in('planned','released')) then case when w.published_at is null then 'planned'::public.work_order_status else 'released'::public.work_order_status end
   else 'returned'::public.work_order_status end;
  update public.work_orders set status=next_status,actual_end_at=case when next_status='returned' and actual_start_at is not null then at else null end,lead_personnel_id=case when lead_personnel_id=a.personnel_id then null else lead_personnel_id end where id=w.id;
  insert into public.status_events(tenant_id,work_order_id,assignment_id,actor_user_id,previous_status,new_status,reason_code,note,idempotency_key) values(target_tenant,w.id,a.id,auth.uid(),a.status::public.work_order_status,'returned','planning_issue',reason,mid::text);
 elsif target in('correction_required','approved') then
  select * into r from public.work_order_report_versions where tenant_id=target_tenant and work_order_id=w.id and version=w.report_version;
  if r.id is null then raise exception 'Een actuele rapportversie is vereist voor rapportcontrole' using errcode='23514';end if;
  perform public.review_work_order_report(w.id,r.id,case when target='approved' then 'approved' else 'returned' end,reason);
 elsif target='planned' then
  if w.status<>'returned' or w.actual_start_at is not null or exists(select 1 from public.work_order_assignments x where x.tenant_id=target_tenant and x.work_order_id=w.id and x.actual_start_at is not null) then raise exception 'Alleen een teruggemelde, niet gestarte bon kan opnieuw worden ingepland. Maak voor resterend werk een opvolgbon.' using errcode='23514';end if;
  update public.work_orders set status='planned',planning_state='unassigned',published_at=null,attention_reason=null where id=w.id;
  insert into public.status_events(tenant_id,work_order_id,actor_user_id,previous_status,new_status,reason_code,note,idempotency_key) values(target_tenant,w.id,auth.uid(),w.status,'planned','management_replan',reason,mid::text);
 elsif target in('released','cancelled') then
  perform public.mutate_work_order(target_tenant,jsonb_build_object('orderId',w.id,'version',w.version,'mutationId',gen_random_uuid(),'action',case when target='released' then 'publish' else 'cancel' end,'reason',reason));
 elsif target='returned' then
  if w.projected_start_at is null or w.projected_end_at is null then raise exception 'Deze bon is nog niet ingepland. Deel de bon eerst in of kies annuleren.' using errcode='23514';end if;
  if w.report_state not in('draft','correction') then raise exception 'Een ingediend rapport blijft bewaard; gebruik rapportcorrectie' using errcode='23514';end if;
  update public.time_entries e set ends_at=greatest(at,e.starts_at+interval '1 microsecond') where e.tenant_id=target_tenant and e.ends_at is null and exists(select 1 from public.work_order_assignments x where x.tenant_id=e.tenant_id and x.id=e.assignment_id and x.work_order_id=w.id);
  update public.work_order_assignments set status='returned',actual_end_at=case when actual_start_at is not null then greatest(at,actual_start_at+interval '1 microsecond') else null end,paused_at=null,return_reason_code='management_returned',return_note=reason where tenant_id=target_tenant and work_order_id=w.id and status not in('completed','returned','cancelled');
  update public.dispatches set revoked_at=at where tenant_id=target_tenant and work_order_id=w.id and revoked_at is null;
  update public.work_orders set status='returned',actual_end_at=case when actual_start_at is not null then at else null end where id=w.id;
  insert into public.status_events(tenant_id,work_order_id,actor_user_id,previous_status,new_status,reason_code,note,idempotency_key) values(target_tenant,w.id,auth.uid(),w.status,'returned','management_returned',reason,mid::text);
 else raise exception 'Deze statuswijziging is niet toegestaan. Start en afronding volgen de echte uitvoering en rapportcontrole.' using errcode='23514';end if;
 perform private.refresh_live_planning(target_tenant);
 select * into w from public.work_orders where id=w.id;
 result:=jsonb_build_object('ok',true,'id',w.id,'version',w.version);
 insert into private.work_order_commands values(mid,target_tenant,auth.uid(),'manage:'||command,hash,result,clock_timestamp());
 insert into public.audit_events(tenant_id,actor_user_id,action,entity_type,entity_id,after_data) values(target_tenant,auth.uid(),'work_order.management_'||command,'work_order',w.id,jsonb_build_object('status',w.status,'assignmentId',a.id,'reason',reason,'version',w.version));
 return result;
end $$;
revoke all on function public.manage_work_order(uuid,jsonb) from public,anon,service_role;
grant execute on function public.manage_work_order(uuid,jsonb) to authenticated;


-- A deliberate management return remains blocked when live planning refreshes.
create or replace function private.refresh_live_planning(t uuid) returns integer
language plpgsql security definer set search_path='' as $$
declare p record;a record;c record;changes jsonb;next_start timestamptz;next_end timestamptz;previous_end timestamptz;previous_object uuid;travel integer;duration interval;breaks interval;changed integer:=0;at timestamptz:=clock_timestamp();bad boolean;affected uuid[]:=array[]::uuid[];
begin
 perform pg_advisory_xact_lock(hashtextextended('fieldgrid-planning:'||t::text,0));
 -- Only the current execution and its future work are reflowed. Original planned times remain immutable.
 for p in select distinct aa.personnel_id from public.work_order_assignments aa join public.work_orders w on w.tenant_id=aa.tenant_id and w.id=aa.work_order_id where aa.tenant_id=t and w.archive_at is null and w.status<>'cancelled' and aa.actual_start_at is not null and aa.status not in('cancelled','returned') and (aa.actual_end_at is null or aa.actual_end_at>at-interval '1 day') loop
  previous_end:=null;previous_object:=null;changes:='[]';
  for a in select aa.*,w.object_id,w.customer_window_kind,s.starts_at window_start,s.ends_at window_end from public.work_order_assignments aa join public.work_orders w on w.tenant_id=aa.tenant_id and w.id=aa.work_order_id left join public.appointment_slots s on s.tenant_id=w.tenant_id and s.id=w.appointment_slot_id where aa.tenant_id=t and aa.personnel_id=p.personnel_id and aa.status not in('returned','cancelled') and w.archive_at is null and w.status<>'cancelled' and(aa.planned_end_at>at-interval '1 day' or aa.actual_start_at is not null and aa.actual_end_at is null) and aa.planned_start_at<at+interval '2 days' order by coalesce(aa.actual_start_at,aa.planned_start_at),aa.created_at,aa.id loop
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
 for a in select aa.id,aa.work_order_id from public.work_order_assignments aa join public.work_orders w on w.tenant_id=aa.tenant_id and w.id=aa.work_order_id join public.appointment_slots s on s.tenant_id=w.tenant_id and s.id=w.appointment_slot_id where aa.tenant_id=t and aa.actual_start_at is null and aa.status in('planned','released','seen') and w.archive_at is null and w.status<>'cancelled' and s.ends_at<=at and s.ends_at>at-interval '1 day' loop
  update public.work_order_assignments set status='returned',return_reason_code='customer_window_unreachable',return_note='Automatisch teruggezet: klantvenster verstreken zonder werkstart.' where tenant_id=t and id=a.id;
  update public.dispatches set revoked_at=coalesce(revoked_at,at) where tenant_id=t and assignment_id=a.id and revoked_at is null;
  perform private.planning_window_signal(t,a.id,'unreachable');changed:=changed+1;affected:=array_append(affected,a.work_order_id);
 end loop;
 update public.work_orders w set projected_start_at=coalesce(b.starts,w.planned_start_at),projected_end_at=coalesce(b.ends,w.planned_end_at),attention_reason=case when b.active=0 and w.actual_start_at is null then 'planning_review_required' else w.attention_reason end,status=case when b.active=0 and w.actual_start_at is null then case when (w.status='returned' and exists(select 1 from public.work_order_assignments removed where removed.tenant_id=w.tenant_id and removed.work_order_id=w.id and removed.return_reason_code in('management_removed','management_returned'))) then w.status else 'planned'::public.work_order_status end else w.status end
 from(select aa.work_order_id,min(aa.projected_start_at) filter(where aa.status not in('returned','cancelled')) starts,max(aa.projected_end_at) filter(where aa.status not in('returned','cancelled')) ends,count(*) filter(where aa.status not in('returned','cancelled')) active from public.work_order_assignments aa where aa.tenant_id=t group by aa.work_order_id)b
 where w.tenant_id=t and w.id=b.work_order_id and(w.id=any(affected) or w.actual_start_at is not null or b.active=0) and w.archive_at is null and w.status<>'cancelled' and((w.projected_start_at,w.projected_end_at) is distinct from(coalesce(b.starts,w.planned_start_at),coalesce(b.ends,w.planned_end_at)) or(b.active=0 and w.actual_start_at is null and w.status<>'planned' and not (w.status='returned' and exists(select 1 from public.work_order_assignments removed where removed.tenant_id=w.tenant_id and removed.work_order_id=w.id and removed.return_reason_code in('management_removed','management_returned')))));
 for a in select aa.id,aa.projected_start_at,s.ends_at,aa.status,l.estimated_minutes from public.work_order_assignments aa join public.work_orders w on w.tenant_id=aa.tenant_id and w.id=aa.work_order_id join public.appointment_slots s on s.tenant_id=w.tenant_id and s.id=w.appointment_slot_id left join public.travel_legs l on l.tenant_id=aa.tenant_id and l.assignment_id=aa.id and l.direction='before' where aa.tenant_id=t and aa.status in('planned','released','seen','travelling') and aa.actual_start_at is null and w.archive_at is null and w.status<>'cancelled' and s.ends_at>at and(s.ends_at<=at+interval '30 minutes' or greatest(at,aa.projected_start_at)+make_interval(mins=>coalesce(l.estimated_minutes,0)+5)>=s.ends_at) loop
  perform private.planning_window_signal(t,a.id,'warning');
 end loop;
 return changed;
end;
$$;
