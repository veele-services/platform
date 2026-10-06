-- Stopping one's assignment locks its contribution, even while a colleague
-- continues. The primary employee retains the separate report/signature flow.
create or replace function private.staff_report_editable(t uuid, w uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select private.work_order_execution_actor(t,w,auth.uid(),nullif(auth.jwt()->>'session_id','')::uuid)
 and exists(select 1 from public.work_orders wo
 join public.work_order_assignments a on a.tenant_id=wo.tenant_id and a.work_order_id=wo.id
 join public.personnel p on p.tenant_id=a.tenant_id and p.id=a.personnel_id
 where wo.tenant_id=t and wo.id=w and p.user_id=auth.uid()
 and a.status in ('seen','travelling','in_progress')
 and wo.status in ('seen','travelling','in_progress','completed','correction_required')
 and wo.report_state in ('draft','correction'));
$$;
revoke all on function private.staff_report_editable(uuid,uuid) from public,anon,authenticated,service_role;

create or replace function private.task_execution_allowed(task public.work_order_tasks)
returns boolean language sql stable security definer set search_path='' as $$
 select private.object_manage(task.tenant_id) or (
 private.is_work_order_assignee(task.tenant_id,task.work_order_id)
 and (task.assigned_personnel_id is null or task.assigned_personnel_id=private.current_personnel_id(task.tenant_id))
 and exists(select 1 from public.work_order_assignments a
 where a.tenant_id=task.tenant_id and a.work_order_id=task.work_order_id
 and a.personnel_id=private.current_personnel_id(task.tenant_id)
 and a.status not in ('completed','cancelled','returned')));
$$;
revoke all on function private.task_execution_allowed(public.work_order_tasks) from public,anon,authenticated,service_role;
