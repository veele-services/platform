-- Query-first release repair. Generate and verify a forward migration before release.
begin;

create or replace function private.actor_session_active()
returns boolean language sql stable security definer set search_path='' as $$
 select exists (
   select 1 from auth.sessions s join auth.users u on u.id=s.user_id
   where s.user_id=(select auth.uid())
     and s.id::text=(select auth.jwt()->>'session_id')
     and (s.not_after is null or s.not_after>now())
     and u.deleted_at is null and not coalesce(u.is_anonymous,false)
     and (u.banned_until is null or u.banned_until<=now())
 );
$$;
revoke all on function private.actor_session_active() from public,anon;
grant execute on function private.actor_session_active() to authenticated;

create or replace function private.is_platform_admin()
returns boolean language sql stable security definer set search_path='' as $$
 select (select private.actor_session_active()) and exists (
   select 1 from public.platform_admins where user_id=(select auth.uid())
 );
$$;

create or replace function private.member_roles(target_tenant_id uuid)
returns public.app_role[] language sql stable security definer set search_path='' as $$
 select coalesce((select m.roles from public.tenant_memberships m
   join public.tenants t on t.id=m.tenant_id and t.status='active'
   where m.tenant_id=target_tenant_id and m.user_id=(select auth.uid())
     and m.status='active' and (select private.actor_session_active())
 ),'{}'::public.app_role[]);
$$;

create or replace function private.is_member(target_tenant_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select cardinality((select private.member_roles(target_tenant_id)))>0;
$$;

create or replace function private.has_role(target_tenant_id uuid,required_roles public.app_role[])
returns boolean language sql stable security definer set search_path='' as $$
 select (select private.member_roles(target_tenant_id)) && required_roles;
$$;

create or replace function private.current_personnel_id(target_tenant_id uuid)
returns uuid language sql stable security definer set search_path='' as $$
 select p.id from public.personnel p
 where p.tenant_id=target_tenant_id and p.user_id=(select auth.uid()) and p.status='active'
   and (select private.has_role(target_tenant_id,array['staff']::public.app_role[])) limit 1;
$$;

create or replace function private.is_work_order_assignee(target_tenant_id uuid,target_work_order_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select exists (select 1 from public.work_order_assignments a
   join public.work_orders w on w.id=a.work_order_id and w.tenant_id=a.tenant_id
   where a.tenant_id=target_tenant_id and a.work_order_id=target_work_order_id
     and a.personnel_id=(select private.current_personnel_id(target_tenant_id))
     and a.status not in ('cancelled','returned') and w.status<>'cancelled'
     and exists(select 1 from public.dispatches d where d.tenant_id=a.tenant_id
       and d.assignment_id=a.id and d.revoked_at is null));
$$;

-- The staff workspace supplies only customer ID/name. Assignment is not CRM access.
create or replace function private.can_access_customer(target_tenant_id uuid,target_customer_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select private.has_role(target_tenant_id,array['tenant_admin','management','planner','finance']::public.app_role[]);
$$;

-- Staff uploads bytes after creating the report entry, before attachment metadata.
-- The owned report path therefore authorizes both that insertion and failure cleanup.
-- Metadata alone must never authorize somebody else's bytes.
create or replace function private.owns_report_path(t uuid,w uuid,path text)
returns boolean language sql stable security definer set search_path='' as $$
 select cardinality(string_to_array(path,'/'))=4
   and split_part(path,'/',1)=t::text and split_part(path,'/',2)=w::text
   and split_part(path,'/',4)<>''
   and exists(select 1 from public.report_entries e where e.tenant_id=t
     and e.work_order_id=w and e.id::text=split_part(path,'/',3)
     and e.author_user_id=(select auth.uid()) and e.deleted_at is null);
$$;
revoke all on function private.owns_report_path(uuid,uuid,text) from public,anon;
grant execute on function private.owns_report_path(uuid,uuid,text) to authenticated;

create or replace function private.can_access_storage_object(bucket text,object_name text,write_access boolean default false)
returns boolean language plpgsql stable security definer set search_path='' as $$
declare t uuid:=private.storage_tenant_id(object_name); w uuid:=private.storage_subject_id(object_name);
begin
 if t is null then return false;end if;
 if bucket='branding' then
   if write_access then return private.has_role(t,array['tenant_admin','management']::public.app_role[]);end if;
   return private.is_member(t);
 end if;
 if w is null then return false;end if;
 if bucket in ('reports','signatures') then
   if private.has_role(t,array['tenant_admin','management','planner']::public.app_role[]) then return true;end if;
   if bucket<>'reports' or not private.is_work_order_assignee(t,w) or not private.owns_report_path(t,w,object_name) then return false;end if;
   if not write_access then return true;end if;
   return exists(select 1 from public.work_orders wo where wo.tenant_id=t and wo.id=w and wo.status in ('seen','travelling','in_progress','correction_required'));
 elsif bucket='invoices' then
   return private.has_role(t,array['tenant_admin','management','finance']::public.app_role[]);
 elsif bucket='personnel-documents' then
   if private.has_role(t,array['tenant_admin','management','hr']::public.app_role[]) then return true;end if;
   return not write_access and w=private.current_personnel_id(t)
     and exists(select 1 from public.personnel_documents d where d.tenant_id=t
       and d.personnel_id=w and d.storage_path=object_name and d.visible_to_employee);
 end if;
 return false;
end;
$$;

drop policy if exists release_private_reports on public.report_entries;
create policy release_private_reports on public.report_entries as restrictive for select to authenticated
using (private.has_role(tenant_id,array['tenant_admin','management','planner','finance']::public.app_role[])
  or (author_user_id=(select auth.uid()) and private.is_work_order_assignee(tenant_id,work_order_id)));

drop policy if exists release_private_attachments on public.attachments;
create policy release_private_attachments on public.attachments as restrictive for select to authenticated
using (private.has_role(tenant_id,array['tenant_admin','management','planner','finance']::public.app_role[])
  or (uploaded_by=(select auth.uid()) and private.is_work_order_assignee(tenant_id,work_order_id)
    and private.owns_report_path(tenant_id,work_order_id,storage_path)));

-- Guard writes even when caller forges a metadata row pointing at another file.
create or replace function private.guard_staff_attachment_path()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is not null and not private.has_role(new.tenant_id,array['tenant_admin','management','planner']::public.app_role[]) then
   if new.uploaded_by is distinct from auth.uid() or new.storage_bucket<>'reports'
     or new.report_entry_id is null or new.report_entry_id::text<>split_part(new.storage_path,'/',3)
     or not private.is_work_order_assignee(new.tenant_id,new.work_order_id)
     or not private.owns_report_path(new.tenant_id,new.work_order_id,new.storage_path)
     or (tg_op='INSERT' and not private.can_access_storage_object('reports',new.storage_path,true))
     or (tg_op='UPDATE' and not private.staff_report_editable(new.tenant_id,new.work_order_id))
   then raise exception 'Geen toegang tot dit rapportbestand' using errcode='42501';end if;
 end if;
 return new;
end;
$$;
revoke all on function private.guard_staff_attachment_path() from public,anon,authenticated;
drop trigger if exists release_attachment_path on public.attachments;
create trigger release_attachment_path before insert or update on public.attachments
for each row execute function private.guard_staff_attachment_path();

-- Preserve the full existing DTO; change exactly the two private row projections.
do $$
declare original text; revised text;
begin
 select pg_get_functiondef('public.staff_workspace(uuid)'::regprocedure) into original;
 revised:=replace(original,'e.work_order_id=any(ids) and e.deleted_at is null',
   'e.work_order_id=any(ids) and e.author_user_id=auth.uid() and e.deleted_at is null');
 revised:=replace(revised,'a.work_order_id=any(ids) and a.deleted_at is null',
   'a.work_order_id=any(ids) and a.uploaded_by=auth.uid() and private.owns_report_path(a.tenant_id,a.work_order_id,a.storage_path) and a.deleted_at is null');
 if revised=original and position('e.author_user_id=auth.uid()' in original)=0 then
   raise exception 'staff_workspace source changed: review the projection';
 end if;
 execute revised;
 select pg_get_functiondef('public.work_order_task_context(uuid,uuid)'::regprocedure) into original;
 revised:=replace(original,'where c.tenant_id=target_tenant and c.task_id=task.id)',
   'where c.tenant_id=target_tenant and c.task_id=task.id and (private.object_manage(target_tenant) or c.actor_id=auth.uid()))');
 if revised=original and position('or c.actor_id=auth.uid()' in original)=0 then
   raise exception 'work_order_task_context source changed: review the projection';
 end if;
 revised:=replace(revised,'''assignedPersonnelId'',task.assigned_personnel_id,',
   '''assignedPersonnelId'',case when private.object_manage(target_tenant) or task.assigned_personnel_id=private.current_personnel_id(target_tenant) then task.assigned_personnel_id end,');
 revised:=replace(revised,'and p.status=''active''),''[]''),',
   'and p.status=''active'' and (private.object_manage(target_tenant) or p.user_id=auth.uid())),''[]''),');
 execute revised;
end;
$$;

alter table private.work_order_commands enable row level security;
alter table private.work_order_commands force row level security;
alter table private.work_order_signature_intents enable row level security;
alter table private.work_order_signature_intents force row level security;
commit;
