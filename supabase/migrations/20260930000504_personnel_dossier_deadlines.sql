SET local check_function_bodies = off;

ALTER TABLE "public"."qualification_requirements"
  ADD COLUMN "active" boolean NOT NULL DEFAULT true;

CREATE OR REPLACE FUNCTION private.assignment_requirements (
  t uuid,
  p uuid,
  w uuid,
  s timestamp with time zone,
  e timestamp with time zone
)
  RETURNS TABLE (
    code             text,
    hard_requirement boolean
  )
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
 with functions as (
  select pf.function_id from public.personnel_functions pf where pf.tenant_id=t and pf.personnel_id=p
  union select c.function_id from public.personnel_contracts c where c.tenant_id=t and c.personnel_id=p and c.active and c.function_id is not null
   and c.starts_on<=((e-interval '1 microsecond') at time zone 'Europe/Amsterdam')::date and (c.ends_on is null or c.ends_on>=(s at time zone 'Europe/Amsterdam')::date)
 ), requirements as (
  select q.code,q.hard_requirement from public.qualification_requirements q join public.work_orders wo on wo.id=w and wo.tenant_id=t where q.tenant_id=t and q.active
   and ((q.scope='customer' and q.subject_id=wo.customer_id) or(q.scope='object' and q.subject_id=wo.object_id) or(q.scope='work_order' and q.subject_id=w)
    or(q.scope='service' and q.service_name=wo.discipline) or(q.scope='function' and q.subject_id in(select function_id from functions)))
  union all select unnest(f.required_certificate_codes),true from public.function_catalog f where f.tenant_id=t and f.id in(select function_id from functions)
 ) select r.code,bool_or(r.hard_requirement) from requirements r group by r.code;
$function$;

CREATE OR REPLACE FUNCTION private.dossier_followup()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare payload jsonb:=new.dossier_data; deadline date; deadlines date[]; day_value text; reminder_recipient text; task_title text; item_kind text; owner_id uuid;
begin
 if not new.dossier_managed then return new; end if;
 owner_id:=nullif(payload->>'ownerId','')::uuid;
 if tg_table_name='personnel_dossier_items' then item_kind:=new.kind; end if;
 -- Canonical identity fields stay on personnel. No duplicate editable master data.
 if item_kind='profile' then
  update public.personnel set full_name=payload->>'name',employee_number=payload->>'employeeNumber',email=nullif(payload->>'email',''),phone=nullif(payload->>'phone',''),version=version+1,
   end_date=nullif(payload->>'lastDay','')::date,
   status=case when payload->>'employmentStatus' in ('former','archived') then 'former' else status end
  where tenant_id=new.tenant_id and id=new.personnel_id;
 end if;
 if item_kind='absence' then
  insert into public.availability(tenant_id,personnel_id,starts_at,ends_at,kind,note,approved_at,dossier_source_id)
  values(new.tenant_id,new.personnel_id,(payload->>'startsOn')::date::timestamp at time zone 'Europe/Amsterdam',
   ((coalesce(nullif(payload->>'endsOn','')::date,date '2099-12-30')+1)::timestamp at time zone 'Europe/Amsterdam'),'unavailable',null,now(),new.id)
  on conflict(dossier_source_id) do update set starts_at=excluded.starts_at,ends_at=excluded.ends_at;
 end if;
 task_title:=nullif(payload->>'followupTitle','');
 if item_kind='asset' and new.dossier_status<>'returned' and nullif(payload->>'dueOn','') is not null then task_title:='Bedrijfsmiddel retourneren'; end if;
 if task_title is not null and new.dossier_status<>'draft' then
  insert into public.personnel_dossier_items(tenant_id,personnel_id,kind,title,due_on,owner_user_id,dossier_managed,dossier_status,dossier_data)
  values(new.tenant_id,new.personnel_id,'task',task_title,nullif(payload->>'dueOn','')::date,owner_id,true,'open',jsonb_build_object('title',task_title,'dueOn',payload->>'dueOn','ownerId',owner_id,'relatedId',new.id,'generatedFrom',new.id,'priority','normal','reminderEmails',coalesce(payload->>'reminderEmails',''),'reminderDays',coalesce(payload->>'reminderDays','0')))
  on conflict(tenant_id,personnel_id,(dossier_data->>'generatedFrom')) where kind='task' and dossier_data->>'generatedFrom' is not null
  do update set title=excluded.title,due_on=excluded.due_on,owner_user_id=excluded.owner_user_id,dossier_data=public.personnel_dossier_items.dossier_data||excluded.dossier_data;
 end if;
 if item_kind='asset' and new.dossier_status='returned' then
  update public.personnel_dossier_items set dossier_status='completed',dossier_data=dossier_data||jsonb_build_object('evidence','Retour geregistreerd op '||(payload->>'returnedOn'))
  where tenant_id=new.tenant_id and personnel_id=new.personnel_id and kind='task' and dossier_data->>'generatedFrom'=new.id::text;
 end if;
 update public.personnel_dossier_deliveries set status='cancelled' where source_table=tg_table_name and source_id=new.id and status in ('scheduled','failed');
 if new.dossier_status in ('draft','completed','ended','returned','recovered','archived','revoked','rejected') or item_kind='profile' then return new; end if;
 -- Each explicit business deadline is scheduled; equal dates are coalesced per recipient.
 if tg_table_name='personnel_contracts' then
  if new.employment_type='fixed' and payload->>'noticePolicy'='applicable' and nullif(payload->>'writtenNoticeOn','') is null
    and new.ends_on+1 >= (new.starts_on+interval '6 months')::date then deadline:=(new.ends_on-interval '1 month')::date; end if;
  deadlines:=array[deadline,new.review_on,new.ends_on,case when new.employment_type in('fixed','permanent') then nullif(payload->>'probationUntil','')::date end];
 elsif tg_table_name='certificates' then deadlines:=array[new.expires_on];
 elsif item_kind='review' then deadlines:=array[nullif(payload->>'startsOn','')::date,case when task_title is null then nullif(payload->>'dueOn','')::date end];
 elsif task_title is not null then return new; -- Follow-up/return task owns its reminder.
 else deadlines:=array[nullif(payload->>'dueOn','')::date]; end if;
 for deadline in select distinct d from unnest(deadlines) d where d is not null loop
 for reminder_recipient in select btrim(value) from regexp_split_to_table(coalesce(payload->>'reminderEmails',''),',') value where btrim(value)<>''
  union select 'user:'||owner_id::text where owner_id is not null
 loop
  for day_value in select btrim(value) from regexp_split_to_table(coalesce(nullif(payload->>'reminderDays',''),'0'),',') value where btrim(value)~'^\d{1,3}$' loop
   if deadline-day_value::integer < (now() at time zone 'Europe/Amsterdam')::date then continue; end if;
   if not exists(select 1 from public.personnel_dossier_deliveries d where d.source_table=tg_table_name and d.source_id=new.id and d.recipient=reminder_recipient and d.due_on=deadline-day_value::integer and d.status in ('sent','processing','uncertain')) then
    insert into public.personnel_dossier_deliveries(tenant_id,personnel_id,source_table,source_id,source_revision,recipient,recipient_user_id,due_on,available_at)
    values(new.tenant_id,new.personnel_id,tg_table_name,new.id,new.dossier_revision,reminder_recipient,case when starts_with(reminder_recipient,'user:') then owner_id end,deadline-day_value::integer,((deadline-day_value::integer)+time '09:00') at time zone 'Europe/Amsterdam')
    on conflict do nothing;
   end if;
  end loop;
 end loop;
 end loop;
 return new;
end $function$;

CREATE OR REPLACE FUNCTION private.track_dossier_record()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare previous_person uuid; doc uuid; key text;
begin
 if not new.dossier_managed then
  if tg_op='UPDATE' and old.dossier_managed then raise exception 'Dossier privacy cannot be removed' using errcode='42501'; end if;
  return new;
 end if;
 if auth.uid() is not null and not private.dossier_access(new.tenant_id) then raise exception 'Dossier access required' using errcode='42501'; end if;
 if tg_op='UPDATE' then
  if new.tenant_id<>old.tenant_id or new.personnel_id<>old.personnel_id then raise exception 'Dossier identity is immutable' using errcode='23514'; end if;
  new.dossier_revision:=old.dossier_revision+1;
  if not old.dossier_managed then
   insert into public.personnel_dossier_history(tenant_id,personnel_id,source_table,source_id,revision,snapshot,actor_user_id)
   values(old.tenant_id,old.personnel_id,tg_table_name,old.id,old.dossier_revision,to_jsonb(old),auth.uid()) on conflict do nothing;
  end if;
 else new.dossier_revision:=1; end if;
 new.updated_by:=auth.uid(); new.updated_at:=now();
 if new.previous_id is not null then
  execute format('select personnel_id from public.%I where tenant_id=$1 and id=$2',tg_table_name) into previous_person using new.tenant_id,new.previous_id;
  if previous_person is distinct from new.personnel_id or new.previous_id=new.id then raise exception 'Previous record belongs to another employee' using errcode='23514'; end if;
 end if;
 for key in select jsonb_array_elements_text(coalesce(new.dossier_data->'document_ids','[]')) loop
  doc:=key::uuid;
  if not exists(select 1 from public.personnel_documents d where d.id=doc and d.tenant_id=new.tenant_id and d.personnel_id=new.personnel_id and d.dossier_managed) then raise exception 'Document belongs to another dossier' using errcode='23514';end if;
 end loop;
 if tg_table_name='personnel_dossier_items' and tg_op='UPDATE' then
  if new.kind<>old.kind then raise exception 'Dossier category is immutable' using errcode='23514';end if;
  if old.dossier_data ? 'generatedFrom' then new.dossier_data:=new.dossier_data||jsonb_build_object('generatedFrom',old.dossier_data->>'generatedFrom');end if;
 end if;
 if tg_table_name='personnel_documents' then
  if new.visible_to_employee or new.document_type not in ('contract','addendum','certificate','review','training','instruction','asset','notice') then raise exception 'Private dossier document category required' using errcode='23514'; end if;
  if tg_op='UPDATE' and (new.storage_path<>old.storage_path or new.sha256 is distinct from old.sha256 or new.version<>old.version or new.previous_id is distinct from old.previous_id) then raise exception 'Upload a new document version' using errcode='23514';end if;
 end if;
 if tg_table_name='certificates' then
  if upper(new.code)='VOG' or (new.storage_path is not null and (tg_op='INSERT' or new.storage_path is distinct from old.storage_path)) then raise exception 'Use a VOG control record, not a certificate file' using errcode='23514'; end if;
  if tg_op='UPDATE' and old.dossier_managed and new.code<>old.code then raise exception 'Certificate type is immutable; create a new certificate' using errcode='23514';end if;
  if tg_op='INSERT' and new.dossier_status='approved' and auth.uid() is not null then raise exception 'Verification requires a separate review' using errcode='23514';end if;
  if tg_op='UPDATE' and old.dossier_status='approved' and new.dossier_status='approved'
   and (new.name is distinct from old.name or new.issued_on is distinct from old.issued_on or new.valid_from is distinct from old.valid_from or new.expires_on is distinct from old.expires_on or (new.dossier_data - array['verificationNote','training','ownerId','reminderEmails','reminderDays']) is distinct from (old.dossier_data - array['verificationNote','training','ownerId','reminderEmails','reminderDays']))
  then new.dossier_status:='review';new.verified_at:=null;new.verified_by:=null;end if;
  if new.dossier_status='approved' and (tg_op='INSERT' or old.dossier_status is distinct from new.dossier_status) then
   new.verified_at:=case when auth.uid() is null then coalesce(new.verified_at,now()) else now() end;new.verified_by:=auth.uid();
  elsif tg_op='UPDATE' and new.dossier_status='approved' then new.verified_at:=old.verified_at;new.verified_by:=old.verified_by;end if;
 end if;
 return new;
end $function$;

CREATE OR REPLACE FUNCTION public.personnel_dossier_summary (
  target_tenant uuid
)
  RETURNS TABLE (
    personnel_id          uuid,
    employment_status     text,
    function_id           uuid,
    team                  text,
    ends_on               date,
    open_actions          bigint,
    certificate_attention boolean
  )
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
 if not private.dossier_access(target_tenant) then return;end if;
 return query select p.id,coalesce(profile.dossier_data->>'employmentStatus',case when p.status='former' then 'former' when p.status='invited' then 'preparation' else 'active' end),c.function_id,coalesce(c.dossier_data->>'team',''),c.ends_on,
  (select count(*) from public.personnel_dossier_items i where i.tenant_id=target_tenant and i.personnel_id=p.id and i.kind in('task','checklist') and i.dossier_status<>'completed'),
  exists(select 1 from public.certificates cert where cert.tenant_id=target_tenant and cert.personnel_id=p.id and cert.dossier_managed and(cert.dossier_status in('unverified','review','revoked','rejected') or cert.expires_on<=((now() at time zone 'Europe/Amsterdam')::date+30)))
   or exists(select 1 from public.function_catalog f cross join lateral unnest(f.required_certificate_codes) code where f.tenant_id=target_tenant
    and(f.id=c.function_id or exists(select 1 from public.personnel_functions pf where pf.tenant_id=target_tenant and pf.personnel_id=p.id and pf.function_id=f.id))
    and not private.qualified_for_period(target_tenant,p.id,code,now(),now()+interval '1 microsecond'))
   or exists(select 1 from public.qualification_requirements q where q.tenant_id=target_tenant and q.active and q.scope='function'
    and(q.subject_id=c.function_id or exists(select 1 from public.personnel_functions pf where pf.tenant_id=target_tenant and pf.personnel_id=p.id and pf.function_id=q.subject_id))
    and not private.qualified_for_period(target_tenant,p.id,q.code,now(),now()+interval '1 microsecond'))
 from public.personnel p left join public.personnel_dossier_items profile on profile.tenant_id=target_tenant and profile.personnel_id=p.id and profile.kind='profile'
 left join lateral(select pc.* from public.personnel_contracts pc where pc.tenant_id=target_tenant and pc.personnel_id=p.id and pc.active and pc.starts_on<=(now() at time zone 'Europe/Amsterdam')::date and(pc.ends_on is null or pc.ends_on>=(now() at time zone 'Europe/Amsterdam')::date) order by pc.starts_on desc limit 1)c on true where p.tenant_id=target_tenant;
end $function$;
