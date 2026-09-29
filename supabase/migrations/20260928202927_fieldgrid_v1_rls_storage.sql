-- Authentication/authorization helpers live outside every Data API exposed
-- schema. They read only the minimum membership data needed by RLS.

create or replace function private.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
    and exists (
      select 1
      from public.platform_admins pa
      where pa.user_id = (select auth.uid())
    );
$$;

create or replace function private.member_roles(target_tenant_id uuid)
returns public.app_role[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select tm.roles
    from public.tenant_memberships tm
    where tm.tenant_id = target_tenant_id
      and tm.user_id = (select auth.uid())
      and tm.status = 'active'
  ), '{}'::public.app_role[]);
$$;

create or replace function private.is_member(target_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select private.is_platform_admin())
    or cardinality((select private.member_roles(target_tenant_id))) > 0;
$$;

create or replace function private.has_role(target_tenant_id uuid, required_roles public.app_role[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select private.is_platform_admin())
    or ((select private.member_roles(target_tenant_id)) && required_roles);
$$;

create or replace function private.current_personnel_id(target_tenant_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.id
  from public.personnel p
  where p.tenant_id = target_tenant_id
    and p.user_id = (select auth.uid())
    and p.status = 'active'
  limit 1;
$$;

create or replace function private.is_work_order_assignee(target_tenant_id uuid, target_work_order_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.work_order_assignments a
    join public.personnel p
      on p.tenant_id = a.tenant_id
     and p.id = a.personnel_id
    where a.tenant_id = target_tenant_id
      and a.work_order_id = target_work_order_id
      and p.user_id = (select auth.uid())
      and p.status = 'active'
      and a.status <> 'cancelled'
      and exists (
        select 1
        from public.dispatches d
        where d.tenant_id = a.tenant_id
          and d.assignment_id = a.id
          and d.revoked_at is null
      )
  );
$$;

create or replace function private.can_access_work_order(target_tenant_id uuid, target_work_order_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select private.has_role(target_tenant_id, array['tenant_admin','management','planner','finance']::public.app_role[]))
    or (select private.is_work_order_assignee(target_tenant_id, target_work_order_id));
$$;

create or replace function private.can_access_customer(target_tenant_id uuid, target_customer_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select private.has_role(target_tenant_id, array['tenant_admin','management','planner','finance']::public.app_role[]))
    or exists (
      select 1
      from public.work_orders w
      where w.tenant_id = target_tenant_id
        and w.customer_id = target_customer_id
        and (select private.is_work_order_assignee(w.tenant_id, w.id))
    );
$$;

create or replace function private.can_access_object(target_tenant_id uuid, target_object_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select private.has_role(target_tenant_id, array['tenant_admin','management','planner','finance']::public.app_role[]))
    or exists (
      select 1
      from public.work_orders w
      where w.tenant_id = target_tenant_id
        and w.object_id = target_object_id
        and (select private.is_work_order_assignee(w.tenant_id, w.id))
    );
$$;

create or replace function private.can_access_personnel(target_tenant_id uuid, target_personnel_id uuid, sensitive boolean default false)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when sensitive then
      (select private.has_role(target_tenant_id, array['tenant_admin','management','hr']::public.app_role[]))
      or (select private.current_personnel_id(target_tenant_id)) = target_personnel_id
    else
      (select private.has_role(target_tenant_id, array['tenant_admin','management','planner','hr']::public.app_role[]))
      or (select private.current_personnel_id(target_tenant_id)) = target_personnel_id
  end;
$$;

revoke all on function private.is_platform_admin() from public, anon;
revoke all on function private.member_roles(uuid) from public, anon;
revoke all on function private.is_member(uuid) from public, anon;
revoke all on function private.has_role(uuid, public.app_role[]) from public, anon;
revoke all on function private.current_personnel_id(uuid) from public, anon;
revoke all on function private.is_work_order_assignee(uuid, uuid) from public, anon;
revoke all on function private.can_access_work_order(uuid, uuid) from public, anon;
revoke all on function private.can_access_customer(uuid, uuid) from public, anon;
revoke all on function private.can_access_object(uuid, uuid) from public, anon;
revoke all on function private.can_access_personnel(uuid, uuid, boolean) from public, anon;
grant usage on schema private to authenticated;
grant execute on function private.is_platform_admin() to authenticated;
grant execute on function private.member_roles(uuid) to authenticated;
grant execute on function private.is_member(uuid) to authenticated;
grant execute on function private.has_role(uuid, public.app_role[]) to authenticated;
grant execute on function private.current_personnel_id(uuid) to authenticated;
grant execute on function private.is_work_order_assignee(uuid, uuid) to authenticated;
grant execute on function private.can_access_work_order(uuid, uuid) to authenticated;
grant execute on function private.can_access_customer(uuid, uuid) to authenticated;
grant execute on function private.can_access_object(uuid, uuid) to authenticated;
grant execute on function private.can_access_personnel(uuid, uuid, boolean) to authenticated;

-- Force RLS for every application table, including background and token tables
-- that intentionally have no browser policy.
do $$
declare
  table_name text;
begin
  for table_name in
    select tablename from pg_tables where schemaname = 'public'
  loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('alter table public.%I force row level security', table_name);
  end loop;
end;
$$;

create policy platform_admins_read_self
on public.platform_admins for select to authenticated
using (user_id = (select auth.uid()));

create policy tenants_read_membership
on public.tenants for select to authenticated
using ((select private.is_member(id)));
create policy tenants_update_admin
on public.tenants for update to authenticated
using ((select private.has_role(id, array['tenant_admin']::public.app_role[])))
with check ((select private.has_role(id, array['tenant_admin']::public.app_role[])));

create policy tenant_settings_read
on public.tenant_settings for select to authenticated
using ((select private.is_member(tenant_id)));
create policy tenant_settings_manage
on public.tenant_settings for all to authenticated
using ((select private.has_role(tenant_id, array['tenant_admin','management']::public.app_role[])))
with check ((select private.has_role(tenant_id, array['tenant_admin','management']::public.app_role[])));

create policy tenant_branding_read
on public.tenant_branding for select to authenticated
using ((select private.is_member(tenant_id)));
create policy tenant_branding_manage
on public.tenant_branding for all to authenticated
using ((select private.has_role(tenant_id, array['tenant_admin','management']::public.app_role[])))
with check ((select private.has_role(tenant_id, array['tenant_admin','management']::public.app_role[])));

create policy tenant_domains_read
on public.tenant_domains for select to authenticated
using ((select private.is_member(tenant_id)));
create policy tenant_domains_manage
on public.tenant_domains for all to authenticated
using ((select private.has_role(tenant_id, array['tenant_admin']::public.app_role[])))
with check ((select private.has_role(tenant_id, array['tenant_admin']::public.app_role[])));

create policy tenant_memberships_read
on public.tenant_memberships for select to authenticated
using (
  user_id = (select auth.uid())
  or (select private.has_role(tenant_id, array['tenant_admin','management','hr']::public.app_role[]))
);
create policy tenant_memberships_manage
on public.tenant_memberships for all to authenticated
using ((select private.has_role(tenant_id, array['tenant_admin']::public.app_role[])))
with check ((select private.has_role(tenant_id, array['tenant_admin']::public.app_role[])));

-- Tenant-managed catalogues.
do $$
declare
  table_name text;
begin
  foreach table_name in array array['function_catalog','task_catalog','task_revisions','extra_work_rules']
  loop
    execute format(
      'create policy %I_read on public.%I for select to authenticated using ((select private.is_member(tenant_id)))',
      table_name,
      table_name
    );
    execute format(
      'create policy %I_manage on public.%I for all to authenticated using ((select private.has_role(tenant_id, array[''tenant_admin'',''management'',''planner'']::public.app_role[]))) with check ((select private.has_role(tenant_id, array[''tenant_admin'',''management'',''planner'']::public.app_role[])))',
      table_name,
      table_name
    );
  end loop;
end;
$$;

create policy personnel_read
on public.personnel for select to authenticated
using ((select private.can_access_personnel(tenant_id, id, false)));
create policy personnel_manage
on public.personnel for all to authenticated
using ((select private.has_role(tenant_id, array['tenant_admin','management','hr']::public.app_role[])))
with check ((select private.has_role(tenant_id, array['tenant_admin','management','hr']::public.app_role[])));

create policy personnel_functions_read
on public.personnel_functions for select to authenticated
using ((select private.can_access_personnel(tenant_id, personnel_id, false)));
create policy personnel_functions_manage
on public.personnel_functions for all to authenticated
using ((select private.has_role(tenant_id, array['tenant_admin','management','hr']::public.app_role[])))
with check ((select private.has_role(tenant_id, array['tenant_admin','management','hr']::public.app_role[])));

create policy availability_read
on public.availability for select to authenticated
using ((select private.can_access_personnel(tenant_id, personnel_id, false)));
create policy availability_insert_self_or_hr
on public.availability for insert to authenticated
with check (
  (select private.can_access_personnel(tenant_id, personnel_id, true))
);
create policy availability_update_self_or_hr
on public.availability for update to authenticated
using ((select private.can_access_personnel(tenant_id, personnel_id, true)))
with check ((select private.can_access_personnel(tenant_id, personnel_id, true)));

create policy qualifications_read
on public.qualifications for select to authenticated
using ((select private.can_access_personnel(tenant_id, personnel_id, false)));
create policy qualifications_manage
on public.qualifications for all to authenticated
using ((select private.has_role(tenant_id, array['tenant_admin','management','hr']::public.app_role[])))
with check ((select private.has_role(tenant_id, array['tenant_admin','management','hr']::public.app_role[])));

do $$
declare
  table_name text;
begin
  foreach table_name in array array['personnel_contracts','certificates','personnel_notes']
  loop
    execute format(
      'create policy %I_read on public.%I for select to authenticated using ((select private.can_access_personnel(tenant_id, personnel_id, true)))',
      table_name,
      table_name
    );
    execute format(
      'create policy %I_manage on public.%I for all to authenticated using ((select private.has_role(tenant_id, array[''tenant_admin'',''management'',''hr'']::public.app_role[]))) with check ((select private.has_role(tenant_id, array[''tenant_admin'',''management'',''hr'']::public.app_role[])))',
      table_name,
      table_name
    );
  end loop;
end;
$$;

create policy personnel_documents_read
on public.personnel_documents for select to authenticated
using (
  (select private.has_role(tenant_id, array['tenant_admin','management','hr']::public.app_role[]))
  or (
    visible_to_employee
    and personnel_id = (select private.current_personnel_id(tenant_id))
  )
);
create policy personnel_documents_manage
on public.personnel_documents for all to authenticated
using ((select private.has_role(tenant_id, array['tenant_admin','management','hr']::public.app_role[])))
with check ((select private.has_role(tenant_id, array['tenant_admin','management','hr']::public.app_role[])));

create policy reminders_read
on public.reminders for select to authenticated
using (
  assigned_user_id = (select auth.uid())
  or (select private.has_role(tenant_id, array['tenant_admin','management','hr']::public.app_role[]))
);
create policy reminders_manage
on public.reminders for all to authenticated
using ((select private.has_role(tenant_id, array['tenant_admin','management','hr']::public.app_role[])))
with check ((select private.has_role(tenant_id, array['tenant_admin','management','hr']::public.app_role[])));

create policy customers_read
on public.customers for select to authenticated
using ((select private.can_access_customer(tenant_id, id)));
create policy customers_manage
on public.customers for all to authenticated
using ((select private.has_role(tenant_id, array['tenant_admin','management','planner','finance']::public.app_role[])))
with check ((select private.has_role(tenant_id, array['tenant_admin','management','planner','finance']::public.app_role[])));

create policy customer_contacts_read
on public.customer_contacts for select to authenticated
using ((select private.can_access_customer(tenant_id, customer_id)));
create policy customer_contacts_manage
on public.customer_contacts for all to authenticated
using ((select private.has_role(tenant_id, array['tenant_admin','management','planner','finance']::public.app_role[])))
with check ((select private.has_role(tenant_id, array['tenant_admin','management','planner','finance']::public.app_role[])));

create policy objects_read
on public.objects for select to authenticated
using ((select private.can_access_object(tenant_id, id)));
create policy objects_manage
on public.objects for all to authenticated
using ((select private.has_role(tenant_id, array['tenant_admin','management','planner']::public.app_role[])))
with check ((select private.has_role(tenant_id, array['tenant_admin','management','planner']::public.app_role[])));

do $$
declare
  table_name text;
begin
  foreach table_name in array array['appointment_slots','requests','quotes']
  loop
    execute format(
      'create policy %I_read on public.%I for select to authenticated using ((select private.has_role(tenant_id, array[''tenant_admin'',''management'',''planner'',''finance'']::public.app_role[])))',
      table_name,
      table_name
    );
    execute format(
      'create policy %I_manage on public.%I for all to authenticated using ((select private.has_role(tenant_id, array[''tenant_admin'',''management'',''planner'',''finance'']::public.app_role[]))) with check ((select private.has_role(tenant_id, array[''tenant_admin'',''management'',''planner'',''finance'']::public.app_role[])))',
      table_name,
      table_name
    );
  end loop;
end;
$$;

create policy work_orders_read
on public.work_orders for select to authenticated
using ((select private.can_access_work_order(tenant_id, id)));
create policy work_orders_manage
on public.work_orders for all to authenticated
using ((select private.has_role(tenant_id, array['tenant_admin','management','planner']::public.app_role[])))
with check ((select private.has_role(tenant_id, array['tenant_admin','management','planner']::public.app_role[])));

do $$
declare
  table_name text;
begin
  foreach table_name in array array['work_order_tasks','work_order_allowed_extra_work']
  loop
    execute format(
      'create policy %I_read on public.%I for select to authenticated using ((select private.can_access_work_order(tenant_id, work_order_id)))',
      table_name,
      table_name
    );
    execute format(
      'create policy %I_manage on public.%I for all to authenticated using ((select private.has_role(tenant_id, array[''tenant_admin'',''management'',''planner'']::public.app_role[]))) with check ((select private.has_role(tenant_id, array[''tenant_admin'',''management'',''planner'']::public.app_role[])))',
      table_name,
      table_name
    );
  end loop;
end;
$$;

create policy work_order_assignments_read
on public.work_order_assignments for select to authenticated
using ((select private.can_access_work_order(tenant_id, work_order_id)));
create policy work_order_assignments_manage
on public.work_order_assignments for all to authenticated
using ((select private.has_role(tenant_id, array['tenant_admin','management','planner']::public.app_role[])))
with check ((select private.has_role(tenant_id, array['tenant_admin','management','planner']::public.app_role[])));

do $$
declare
  table_name text;
begin
  foreach table_name in array array['dispatches','status_events','travel_legs']
  loop
    if table_name = 'travel_legs' then
      execute 'create policy travel_legs_read on public.travel_legs for select to authenticated using (exists (select 1 from public.work_order_assignments a where a.tenant_id = travel_legs.tenant_id and a.id = travel_legs.assignment_id and (select private.can_access_work_order(a.tenant_id, a.work_order_id))))';
    else
      execute format(
        'create policy %I_read on public.%I for select to authenticated using ((select private.can_access_work_order(tenant_id, work_order_id)))',
        table_name,
        table_name
      );
    end if;
    execute format(
      'create policy %I_manage on public.%I for all to authenticated using ((select private.has_role(tenant_id, array[''tenant_admin'',''management'',''planner'']::public.app_role[]))) with check ((select private.has_role(tenant_id, array[''tenant_admin'',''management'',''planner'']::public.app_role[])))',
      table_name,
      table_name
    );
  end loop;
end;
$$;

create policy time_entries_read
on public.time_entries for select to authenticated
using (
  personnel_id = (select private.current_personnel_id(tenant_id))
  or (select private.has_role(tenant_id, array['tenant_admin','management','planner','hr','finance']::public.app_role[]))
);
create policy time_entries_manage
on public.time_entries for all to authenticated
using ((select private.has_role(tenant_id, array['tenant_admin','management','planner','hr']::public.app_role[])))
with check ((select private.has_role(tenant_id, array['tenant_admin','management','planner','hr']::public.app_role[])));

create policy open_shifts_read
on public.open_shifts for select to authenticated
using (
  (select private.has_role(tenant_id, array['tenant_admin','management','planner']::public.app_role[]))
  or (
    status = 'open'
    and exists (
      select 1
      from public.personnel_functions pf
      where pf.tenant_id = open_shifts.tenant_id
        and pf.personnel_id = (select private.current_personnel_id(open_shifts.tenant_id))
        and pf.function_id = open_shifts.function_id
    )
    and not exists (
      select 1
      from unnest(open_shifts.required_certificate_codes) required_code
      where not exists (
        select 1 from public.qualifications q
        where q.tenant_id = open_shifts.tenant_id
          and q.personnel_id = (select private.current_personnel_id(open_shifts.tenant_id))
          and q.code = required_code
          and (q.valid_until is null or q.valid_until >= current_date)
      )
    )
  )
);
create policy open_shifts_manage
on public.open_shifts for all to authenticated
using ((select private.has_role(tenant_id, array['tenant_admin','management','planner']::public.app_role[])))
with check ((select private.has_role(tenant_id, array['tenant_admin','management','planner']::public.app_role[])));

create policy shift_interests_read
on public.shift_interests for select to authenticated
using (
  personnel_id = (select private.current_personnel_id(tenant_id))
  or (select private.has_role(tenant_id, array['tenant_admin','management','planner']::public.app_role[]))
);
create policy shift_interests_staff_insert
on public.shift_interests for insert to authenticated
with check (personnel_id = (select private.current_personnel_id(tenant_id)));
create policy shift_interests_staff_update
on public.shift_interests for update to authenticated
using (personnel_id = (select private.current_personnel_id(tenant_id)))
with check (personnel_id = (select private.current_personnel_id(tenant_id)) and status in ('interested','withdrawn'));
create policy shift_interests_manage
on public.shift_interests for all to authenticated
using ((select private.has_role(tenant_id, array['tenant_admin','management','planner']::public.app_role[])))
with check ((select private.has_role(tenant_id, array['tenant_admin','management','planner']::public.app_role[])));

create policy report_entries_read
on public.report_entries for select to authenticated
using ((select private.can_access_work_order(tenant_id, work_order_id)));
create policy report_entries_staff_insert
on public.report_entries for insert to authenticated
with check (
  author_user_id = (select auth.uid())
  and (select private.is_work_order_assignee(tenant_id, work_order_id))
  and exists (
    select 1 from public.work_orders w
    where w.tenant_id = report_entries.tenant_id
      and w.id = report_entries.work_order_id
      and w.status in ('seen','travelling','in_progress','correction_required')
  )
);
create policy report_entries_staff_update
on public.report_entries for update to authenticated
using (
  author_user_id = (select auth.uid())
  and (select private.is_work_order_assignee(tenant_id, work_order_id))
  and exists (
    select 1 from public.work_orders w
    where w.tenant_id = report_entries.tenant_id
      and w.id = report_entries.work_order_id
      and w.status in ('seen','travelling','in_progress','correction_required')
  )
)
with check (
  author_user_id = (select auth.uid())
  and (select private.is_work_order_assignee(tenant_id, work_order_id))
  and exists (
    select 1 from public.work_orders w
    where w.tenant_id = report_entries.tenant_id
      and w.id = report_entries.work_order_id
      and w.status in ('seen','travelling','in_progress','correction_required')
  )
);
create policy report_entries_manage
on public.report_entries for all to authenticated
using ((select private.has_role(tenant_id, array['tenant_admin','management','planner']::public.app_role[])))
with check ((select private.has_role(tenant_id, array['tenant_admin','management','planner']::public.app_role[])));

create policy attachments_read
on public.attachments for select to authenticated
using ((select private.can_access_work_order(tenant_id, work_order_id)));
create policy attachments_staff_insert
on public.attachments for insert to authenticated
with check (
  uploaded_by = (select auth.uid())
  and (select private.is_work_order_assignee(tenant_id, work_order_id))
);
create policy attachments_staff_update
on public.attachments for update to authenticated
using (uploaded_by = (select auth.uid()) and (select private.is_work_order_assignee(tenant_id, work_order_id)))
with check (uploaded_by = (select auth.uid()) and (select private.is_work_order_assignee(tenant_id, work_order_id)));
create policy attachments_manage
on public.attachments for all to authenticated
using ((select private.has_role(tenant_id, array['tenant_admin','management','planner']::public.app_role[])))
with check ((select private.has_role(tenant_id, array['tenant_admin','management','planner']::public.app_role[])));

create policy signatures_read
on public.signatures for select to authenticated
using ((select private.can_access_work_order(tenant_id, work_order_id)));
create policy signatures_staff_insert
on public.signatures for insert to authenticated
with check (
  captured_by = (select auth.uid())
  and (select private.is_work_order_assignee(tenant_id, work_order_id))
);
create policy signatures_manage
on public.signatures for all to authenticated
using ((select private.has_role(tenant_id, array['tenant_admin','management']::public.app_role[])))
with check ((select private.has_role(tenant_id, array['tenant_admin','management']::public.app_role[])));

create policy review_decisions_read
on public.review_decisions for select to authenticated
using ((select private.can_access_work_order(tenant_id, work_order_id)));
create policy review_decisions_manage
on public.review_decisions for all to authenticated
using ((select private.has_role(tenant_id, array['tenant_admin','management','finance']::public.app_role[])))
with check ((select private.has_role(tenant_id, array['tenant_admin','management','finance']::public.app_role[])));

create policy announcements_read
on public.announcements for select to authenticated
using (
  (select private.has_role(tenant_id, array['tenant_admin','management']::public.app_role[]))
  or (
    withdrawn_at is null
    and published_at is not null
    and published_at <= clock_timestamp()
    and ((select private.member_roles(tenant_id)) && audience_roles)
  )
);
create policy announcements_manage
on public.announcements for all to authenticated
using ((select private.has_role(tenant_id, array['tenant_admin','management']::public.app_role[])))
with check ((select private.has_role(tenant_id, array['tenant_admin','management']::public.app_role[])));

create policy announcement_reads_self
on public.announcement_reads for select to authenticated
using (user_id = (select auth.uid()));
create policy announcement_reads_insert_self
on public.announcement_reads for insert to authenticated
with check (user_id = (select auth.uid()) and (select private.is_member(tenant_id)));
create policy announcement_reads_update_self
on public.announcement_reads for update to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'invoice_sequences','invoices','invoice_lines','invoice_groups','invoice_group_items',
    'payment_attempts','payment_allocations'
  ]
  loop
    execute format(
      'create policy %I_finance on public.%I for all to authenticated using ((select private.has_role(tenant_id, array[''tenant_admin'',''management'',''finance'']::public.app_role[]))) with check ((select private.has_role(tenant_id, array[''tenant_admin'',''management'',''finance'']::public.app_role[])))',
      table_name,
      table_name
    );
  end loop;
end;
$$;

create policy push_subscriptions_self
on public.push_subscriptions for all to authenticated
using (user_id = (select auth.uid()) and (select private.is_member(tenant_id)))
with check (user_id = (select auth.uid()) and (select private.is_member(tenant_id)));

create policy notifications_self_read
on public.notifications for select to authenticated
using (user_id = (select auth.uid()) and (select private.is_member(tenant_id)));
create policy notifications_self_update
on public.notifications for update to authenticated
using (user_id = (select auth.uid()) and (select private.is_member(tenant_id)))
with check (user_id = (select auth.uid()) and (select private.is_member(tenant_id)));

create policy audit_events_management_read
on public.audit_events for select to authenticated
using ((select private.has_role(tenant_id, array['tenant_admin','management']::public.app_role[])));

-- Replace broad FOR ALL management policies with command-specific policies.
-- This preserves the same authorization expression without evaluating two
-- permissive SELECT policies for every returned row.
do $$
declare
  policy_record record;
  relation_name text;
  using_expression text;
  check_expression text;
begin
  for policy_record in
    select p.polname, p.polrelid, c.relname, n.nspname,
           pg_get_expr(p.polqual, p.polrelid) as using_expression,
           pg_get_expr(p.polwithcheck, p.polrelid) as check_expression
    from pg_policy p
    join pg_class c on c.oid = p.polrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and p.polname like '%\_manage' escape '\'
  loop
    relation_name := format('%I.%I', policy_record.nspname, policy_record.relname);
    using_expression := coalesce(policy_record.using_expression, policy_record.check_expression);
    check_expression := coalesce(policy_record.check_expression, policy_record.using_expression);
    execute format('drop policy %I on %s', policy_record.polname, relation_name);
    execute format(
      'create policy %I on %s for insert to authenticated with check (%s)',
      policy_record.polname || '_insert', relation_name, check_expression
    );
    execute format(
      'create policy %I on %s for update to authenticated using (%s) with check (%s)',
      policy_record.polname || '_update', relation_name, using_expression, check_expression
    );
    execute format(
      'create policy %I on %s for delete to authenticated using (%s)',
      policy_record.polname || '_delete', relation_name, using_expression
    );
  end loop;
end;
$$;

-- Where staff and management legitimately share a command, keep one policy
-- with an explicit OR instead of two permissive policies.
drop policy attachments_staff_insert on public.attachments;
drop policy attachments_manage_insert on public.attachments;
create policy attachments_insert
on public.attachments for insert to authenticated
with check (
  (select private.has_role(tenant_id, array['tenant_admin','management','planner']::public.app_role[]))
  or (uploaded_by = (select auth.uid()) and (select private.is_work_order_assignee(tenant_id, work_order_id)))
);
drop policy attachments_staff_update on public.attachments;
drop policy attachments_manage_update on public.attachments;
create policy attachments_update
on public.attachments for update to authenticated
using (
  (select private.has_role(tenant_id, array['tenant_admin','management','planner']::public.app_role[]))
  or (uploaded_by = (select auth.uid()) and (select private.is_work_order_assignee(tenant_id, work_order_id)))
)
with check (
  (select private.has_role(tenant_id, array['tenant_admin','management','planner']::public.app_role[]))
  or (uploaded_by = (select auth.uid()) and (select private.is_work_order_assignee(tenant_id, work_order_id)))
);

drop policy report_entries_staff_insert on public.report_entries;
drop policy report_entries_manage_insert on public.report_entries;
create policy report_entries_insert
on public.report_entries for insert to authenticated
with check (
  (select private.has_role(tenant_id, array['tenant_admin','management','planner']::public.app_role[]))
  or (
    author_user_id = (select auth.uid())
    and (select private.is_work_order_assignee(tenant_id, work_order_id))
    and exists (
      select 1 from public.work_orders w
      where w.tenant_id = report_entries.tenant_id
        and w.id = report_entries.work_order_id
        and w.status in ('seen','travelling','in_progress','correction_required')
    )
  )
);
drop policy report_entries_staff_update on public.report_entries;
drop policy report_entries_manage_update on public.report_entries;
create policy report_entries_update
on public.report_entries for update to authenticated
using (
  (select private.has_role(tenant_id, array['tenant_admin','management','planner']::public.app_role[]))
  or (author_user_id = (select auth.uid()) and (select private.is_work_order_assignee(tenant_id, work_order_id)))
)
with check (
  (select private.has_role(tenant_id, array['tenant_admin','management','planner']::public.app_role[]))
  or (author_user_id = (select auth.uid()) and (select private.is_work_order_assignee(tenant_id, work_order_id)))
);

drop policy shift_interests_staff_insert on public.shift_interests;
drop policy shift_interests_manage_insert on public.shift_interests;
create policy shift_interests_insert
on public.shift_interests for insert to authenticated
with check (
  (select private.has_role(tenant_id, array['tenant_admin','management','planner']::public.app_role[]))
  or personnel_id = (select private.current_personnel_id(tenant_id))
);
drop policy shift_interests_staff_update on public.shift_interests;
drop policy shift_interests_manage_update on public.shift_interests;
create policy shift_interests_update
on public.shift_interests for update to authenticated
using (
  (select private.has_role(tenant_id, array['tenant_admin','management','planner']::public.app_role[]))
  or personnel_id = (select private.current_personnel_id(tenant_id))
)
with check (
  (select private.has_role(tenant_id, array['tenant_admin','management','planner']::public.app_role[]))
  or (personnel_id = (select private.current_personnel_id(tenant_id)) and status in ('interested','withdrawn'))
);

drop policy signatures_staff_insert on public.signatures;
drop policy signatures_manage_insert on public.signatures;
create policy signatures_insert
on public.signatures for insert to authenticated
with check (
  (select private.has_role(tenant_id, array['tenant_admin','management']::public.app_role[]))
  or (captured_by = (select auth.uid()) and (select private.is_work_order_assignee(tenant_id, work_order_id)))
);

-- Data API grants are deliberately narrower than table ownership. Tables with
-- service/provider secrets, raw tokens and worker state have no browser grant.
grant select on public.platform_admins to authenticated;
grant select, update on public.tenants to authenticated;
grant select, insert, update, delete on public.tenant_settings, public.tenant_branding, public.tenant_domains, public.tenant_memberships to authenticated;
grant select, insert, update, delete on public.function_catalog, public.personnel, public.personnel_functions, public.availability, public.qualifications, public.personnel_contracts, public.certificates, public.personnel_documents, public.personnel_notes, public.reminders to authenticated;
grant select, insert, update, delete on public.customers, public.customer_contacts, public.objects, public.appointment_slots, public.requests, public.quotes to authenticated;
grant select, insert, update, delete on public.task_catalog, public.task_revisions, public.extra_work_rules to authenticated;
grant select, insert, update, delete on public.work_orders, public.work_order_tasks, public.work_order_allowed_extra_work, public.work_order_assignments, public.dispatches, public.status_events, public.travel_legs, public.time_entries, public.open_shifts, public.shift_interests to authenticated;
grant select, insert, update on public.report_entries, public.attachments, public.signatures to authenticated;
grant select, insert, update, delete on public.review_decisions, public.announcements to authenticated;
grant select, insert, update on public.announcement_reads to authenticated;
grant select, insert, update, delete on public.invoice_sequences, public.invoices, public.invoice_lines, public.invoice_groups, public.invoice_group_items, public.payment_attempts, public.payment_allocations to authenticated;
grant select, insert, update, delete on public.push_subscriptions to authenticated;
grant select, update on public.notifications to authenticated;
grant select on public.audit_events to authenticated;

-- Private Storage. Every path begins with tenant UUID, then the protected
-- aggregate UUID. Logo fallback remains text unless a tenant uploads an asset.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('branding', 'branding', false, 2097152, array['image/jpeg','image/png','image/webp']),
  ('reports', 'reports', false, 10485760, array['image/jpeg','image/png','image/webp','application/pdf']),
  ('signatures', 'signatures', false, 2097152, array['image/png','image/svg+xml']),
  ('invoices', 'invoices', false, 10485760, array['application/pdf']),
  ('personnel-documents', 'personnel-documents', false, 20971520, array['application/pdf','image/jpeg','image/png'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create or replace function private.storage_tenant_id(object_name text)
returns uuid
language plpgsql
immutable
set search_path = ''
as $$
declare
  first_part text;
begin
  first_part := split_part(object_name, '/', 1);
  if first_part !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$' then
    return null;
  end if;
  return first_part::uuid;
end;
$$;

create or replace function private.storage_subject_id(object_name text)
returns uuid
language plpgsql
immutable
set search_path = ''
as $$
declare
  second_part text;
begin
  second_part := split_part(object_name, '/', 2);
  if second_part !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$' then
    return null;
  end if;
  return second_part::uuid;
end;
$$;

create or replace function private.can_access_storage_object(bucket text, object_name text, write_access boolean default false)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  target_tenant uuid := private.storage_tenant_id(object_name);
  target_subject uuid := private.storage_subject_id(object_name);
begin
  if target_tenant is null then
    return false;
  end if;

  if bucket = 'branding' then
    if write_access then
      return private.has_role(target_tenant, array['tenant_admin','management']::public.app_role[]);
    end if;
    return private.is_member(target_tenant);
  end if;

  if target_subject is null then
    return false;
  end if;

  if bucket in ('reports', 'signatures') then
    if private.has_role(target_tenant, array['tenant_admin','management','planner']::public.app_role[]) then
      return true;
    end if;
    if not private.is_work_order_assignee(target_tenant, target_subject) then
      return false;
    end if;
    if not write_access then
      return true;
    end if;
    return exists (
      select 1 from public.work_orders w
      where w.tenant_id = target_tenant
        and w.id = target_subject
        and w.status in ('seen','travelling','in_progress','correction_required')
    );
  elsif bucket = 'invoices' then
    return private.has_role(target_tenant, array['tenant_admin','management','finance']::public.app_role[]);
  elsif bucket = 'personnel-documents' then
    if private.has_role(target_tenant, array['tenant_admin','management','hr']::public.app_role[]) then
      return true;
    end if;
    if write_access then
      return false;
    end if;
    return target_subject = private.current_personnel_id(target_tenant)
      and exists (
        select 1 from public.personnel_documents d
        where d.tenant_id = target_tenant
          and d.personnel_id = target_subject
          and d.storage_path = object_name
          and d.visible_to_employee
      );
  end if;
  return false;
end;
$$;

revoke all on function private.storage_tenant_id(text) from public, anon;
revoke all on function private.storage_subject_id(text) from public, anon;
revoke all on function private.can_access_storage_object(text, text, boolean) from public, anon;
grant execute on function private.storage_tenant_id(text) to authenticated;
grant execute on function private.storage_subject_id(text) to authenticated;
grant execute on function private.can_access_storage_object(text, text, boolean) to authenticated;

create policy fieldgrid_storage_read
on storage.objects for select to authenticated
using ((select private.can_access_storage_object(bucket_id, name, false)));
create policy fieldgrid_storage_insert
on storage.objects for insert to authenticated
with check ((select private.can_access_storage_object(bucket_id, name, true)));
create policy fieldgrid_storage_update
on storage.objects for update to authenticated
using ((select private.can_access_storage_object(bucket_id, name, true)))
with check ((select private.can_access_storage_object(bucket_id, name, true)));
create policy fieldgrid_storage_delete
on storage.objects for delete to authenticated
using ((select private.can_access_storage_object(bucket_id, name, true)));

-- Realtime sends only rows that the subscriber can read through RLS.
alter publication supabase_realtime add table public.work_orders;
alter publication supabase_realtime add table public.status_events;
alter publication supabase_realtime add table public.report_entries;
alter publication supabase_realtime add table public.announcements;
alter publication supabase_realtime add table public.notifications;

-- PostgREST's service role bypasses RLS but still needs ordinary relation
-- privileges. Browser roles retain only the narrower grants above.
grant usage on schema public to service_role;
grant all privileges on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;
