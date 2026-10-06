-- Persistent metadata for edits/removals; no dossier secrets or private note bodies.
create table private.execution_activity_events (
 id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.tenants(id) on delete cascade,
 work_order_id uuid not null, actor_id uuid references auth.users(id) on delete set null,
 title text not null, personnel_only boolean not null default false, created_at timestamptz not null default clock_timestamp(),
 foreign key(tenant_id,work_order_id) references public.work_orders(tenant_id,id) on delete cascade
);
create index execution_activity_events_order_idx on private.execution_activity_events(tenant_id,work_order_id,created_at desc);
alter table private.execution_activity_events enable row level security;
alter table private.execution_activity_events force row level security;
revoke all on private.execution_activity_events from public,anon,authenticated,service_role;
create or replace function private.capture_execution_activity() returns trigger
language plpgsql security definer set search_path='' as $$
declare row_data jsonb;title text;restricted boolean:=false;actor uuid;
begin
 row_data:=case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end;
 actor:=coalesce(auth.uid(),nullif(row_data->>'author_user_id','')::uuid,nullif(row_data->>'created_by','')::uuid,nullif(row_data->>'added_by','')::uuid);
 if tg_table_name='report_entries' then
  restricted:=not coalesce((row_data->>'customer_visible')::boolean,false);
  if tg_op='DELETE' or (tg_op='UPDATE' and old.deleted_at is null and new.deleted_at is not null) then title:='Notitie verwijderd';
  elsif tg_op='UPDATE' and (new.body,new.customer_visible) is distinct from(old.body,old.customer_visible) then title:='Notitie bijgewerkt';end if;
 elsif tg_table_name='work_order_tasks' then
  if tg_op='UPDATE' and (new.executed_quantity,new.execution_state) is distinct from(old.executed_quantity,old.execution_state) then title:='Taakresultaat vastgelegd';
  elsif tg_op='UPDATE' and new.extra_work_status is distinct from old.extra_work_status then title:='Meerwerk beoordeeld';end if;
 elsif tg_table_name='work_order_material_usage' then
  if tg_op='DELETE' then title:='Materiaal verwijderd';elsif tg_op='UPDATE' then title:='Materiaal bijgewerkt';end if;
 elsif tg_table_name='work_order_expenses' then
  if tg_op='DELETE' then title:='Onkosten verwijderd';elsif tg_op='UPDATE' then title:='Onkosten bijgewerkt';end if;
 end if;
 -- A parent deletion cascades through contributions; do not recreate history for a deleted dossier.
 if title is not null and exists(select 1 from public.work_orders w where w.tenant_id=(row_data->>'tenant_id')::uuid and w.id=(row_data->>'work_order_id')::uuid) then insert into private.execution_activity_events(tenant_id,work_order_id,actor_id,title,personnel_only) values((row_data->>'tenant_id')::uuid,(row_data->>'work_order_id')::uuid,actor,title,restricted);end if;
 return null;
end;
$$;
revoke all on function private.capture_execution_activity() from public,anon,authenticated,service_role;
create trigger execution_activity_history after update or delete on public.report_entries for each row execute function private.capture_execution_activity();
create trigger execution_activity_history after update on public.work_order_tasks for each row execute function private.capture_execution_activity();
create trigger execution_activity_history after update or delete on public.work_order_material_usage for each row execute function private.capture_execution_activity();
create trigger execution_activity_history after update or delete on public.work_order_expenses for each row execute function private.capture_execution_activity();
CREATE OR REPLACE FUNCTION private.execution_activity(t uuid, w uuid, u uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select coalesce(jsonb_agg(jsonb_build_object('id',x.id,'at',x.at,'title',x.title,'description',x.description,'author',x.author) order by x.at desc,x.id),'[]') from(
  select 'note:'||e.id id,e.created_at at,'Notitie toegevoegd' title,e.body description,p.full_name author
   from public.report_entries e left join public.personnel p on p.tenant_id=e.tenant_id and p.user_id=e.author_user_id
   where e.tenant_id=t and e.work_order_id=w and e.deleted_at is null and(e.author_user_id=u or (e.customer_visible and private.is_delivery_owner(t,w,u)) or private.report_backoffice(t))
  union all
  select 'material:'||m.id,m.created_at,'Materiaal toegevoegd',m.description,p.full_name
   from public.work_order_material_usage m left join public.personnel p on p.tenant_id=m.tenant_id and p.user_id=m.created_by where m.tenant_id=t and m.work_order_id=w and(m.created_by=u or(m.customer_visible and private.is_delivery_owner(t,w,u)) or private.report_backoffice(t))
  union all
  select 'expense:'||e.id,e.created_at,'Onkosten toegevoegd',e.description,p.full_name
   from public.work_order_expenses e left join public.personnel p on p.tenant_id=e.tenant_id and p.user_id=e.created_by where e.tenant_id=t and e.work_order_id=w and(e.created_by=u or(e.customer_visible and private.is_delivery_owner(t,w,u)) or private.report_backoffice(t))
  union all
  select 'status:'||e.id,e.created_at,case when e.reason_code='time_extended' then '15 minuten extra werktijd' when e.reason_code='stop' then 'Eigen werkzaamheden afgerond' when e.reason_code='pause' then 'Pauze gestart' when e.reason_code='resume' then 'Werkzaamheden hervat' else case e.new_status::text when 'seen' then 'Werkbon geopend' when 'travelling' then 'Onderweg' when 'in_progress' then 'Werkzaamheden gestart' when 'completed' then 'Afgerond' else 'Status gewijzigd' end end,case when e.actor_user_id=u or private.report_backoffice(t) then e.note end,p.full_name
   from public.status_events e left join public.personnel p on p.tenant_id=e.tenant_id and p.user_id=e.actor_user_id where e.tenant_id=t and e.work_order_id=w
  union all
  select 'access:'||a.id,a.created_at,'Beveiligd dossier geopend',null,p.full_name
   from private.object_access_audit a left join public.personnel p on p.tenant_id=a.tenant_id and p.user_id=a.actor_id
   where a.tenant_id=t and a.order_id=w and a.event='read' and a.item_id is null
  union all
  select 'task:'||k.id,k.created_at,'Meerwerk toegevoegd',k.task_name,p.full_name
   from public.work_order_tasks k left join public.personnel p on p.tenant_id=k.tenant_id and p.user_id=k.added_by where k.tenant_id=t and k.work_order_id=w and k.is_extra_work
  union all
  select 'history:'||e.id,e.created_at,e.title,null,p.full_name from private.execution_activity_events e left join public.personnel p on p.tenant_id=e.tenant_id and p.user_id=e.actor_id where e.tenant_id=t and e.work_order_id=w and((not e.personnel_only and private.is_delivery_owner(t,w,u)) or e.actor_id=u or private.report_backoffice(t))
 )x;
$function$
;
CREATE OR REPLACE FUNCTION private.report_delivery(r work_order_report_versions)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select jsonb_build_object('id',r.id,'version',r.version,'state',r.state,'snapshot',private.report_snapshot_for_actor(r),
 'contentHash',r.content_hash,'projection',case when private.report_backoffice(r.tenant_id) or private.is_delivery_owner(r.tenant_id,r.work_order_id,auth.uid()) then 'original' when private.is_work_order_assignee(r.tenant_id,r.work_order_id) then 'own_contribution' else 'customer_copy' end,
 'policy',r.signature_policy,'createdAt',r.created_at,'approvedAt',r.approved_at,
 'employeeVerified',exists(select 1 from public.signatures s where s.tenant_id=r.tenant_id and s.report_id=r.id and s.signature_kind='employee' and s.revoked_at is null),
 'waiver',(select jsonb_build_object('reason',case when private.report_backoffice(r.tenant_id) then x.reason else 'Klantondertekening door bevoegd beheer vrijgesteld' end,'at',x.created_at) from public.work_order_signature_waivers x where x.report_id=r.id),
 'signatures',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'name',s.signer_name,'capacity',s.signer_capacity,
 'capturedBy',case when private.report_backoffice(r.tenant_id) or s.captured_by=auth.uid() then coalesce(s.captured_by_name,p.full_name,'Medewerker') end,
 'signedAt',s.signed_at,'channel',s.channel,'kind',s.signature_kind) order by s.signed_at,s.id)
 from public.signatures s left join public.personnel p on p.tenant_id=s.tenant_id and p.user_id=s.captured_by
 where s.tenant_id=r.tenant_id and s.report_id=r.id and s.revoked_at is null
 and (s.signature_kind='customer' or private.report_backoffice(r.tenant_id) or (private.is_work_order_assignee(r.tenant_id,r.work_order_id) and s.captured_by=auth.uid()))),'[]'))
$function$
;
