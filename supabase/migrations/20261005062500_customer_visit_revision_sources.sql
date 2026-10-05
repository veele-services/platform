-- Public visit summaries and this customer's own request only. Internal
-- planning/review text and other authors' requests never invalidate a portal.
create function private.customer_visit_revision_trigger()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_op='UPDATE' and row(new.customer_id,new.object_id,new.work_order_number,new.discipline,new.status,
   new.projected_start_at,new.projected_end_at,new.actual_start_at,new.actual_end_at,
   new.published_at is not null,new.planning_state,new.archive_at is null)
  is not distinct from row(old.customer_id,old.object_id,old.work_order_number,old.discipline,old.status,
   old.projected_start_at,old.projected_end_at,old.actual_start_at,old.actual_end_at,
   old.published_at is not null,old.planning_state,old.archive_at is null) then return new;end if;
 if tg_op<>'INSERT' and old.published_at is not null and old.planning_state='final' and old.archive_at is null and old.status<>'cancelled'
 then perform private.customer_revision_for_object(old.tenant_id,old.customer_id,old.object_id);end if;
 if tg_op<>'DELETE' and new.published_at is not null and new.planning_state='final' and new.archive_at is null and new.status<>'cancelled'
 then perform private.customer_revision_for_object(new.tenant_id,new.customer_id,new.object_id);end if;
 return case when tg_op='DELETE' then old else new end;
end $$;
revoke all on function private.customer_visit_revision_trigger() from public,anon,authenticated,service_role;
create trigger customer_visit_revision after insert or update or delete on public.work_orders
 for each row execute function private.customer_visit_revision_trigger();

create function private.customer_revision_for_own_visit_request(t uuid,o uuid,w uuid,u uuid)
returns void language plpgsql volatile security definer set search_path='' as $$
declare a uuid;
begin
 for a in select p.id from public.customer_portal_accounts p
  join public.objects obj on obj.tenant_id=p.tenant_id and obj.customer_id=p.customer_id and obj.id=o
  join public.work_orders visit on visit.tenant_id=p.tenant_id and visit.customer_id=p.customer_id and visit.object_id=o and visit.id=w
  where p.tenant_id=t and p.user_id=u and visit.published_at is not null and visit.planning_state='final' and visit.archive_at is null and visit.status<>'cancelled'
   and exists(select 1 from public.object_customer_bindings b where b.tenant_id=t and b.object_id=o and b.user_id=u and b.active)
  order by p.id
 loop perform private.customer_revision_bump(t,a);end loop;
end $$;
revoke all on function private.customer_revision_for_own_visit_request(uuid,uuid,uuid,uuid) from public,anon,authenticated,service_role;

create function private.customer_own_visit_request_revision_trigger()
returns trigger language plpgsql security definer set search_path='' as $$
declare old_status text;new_status text;
begin
 if tg_op='UPDATE' then
  old_status:=case when old.state in('withdrawn','rejected','completed','partial','not_done','closed') then old.state when old.needs_review then 'received' else old.state end;
  new_status:=case when new.state in('withdrawn','rejected','completed','partial','not_done','closed') then new.state when new.needs_review then 'received' else new.state end;
  if row(new.object_id,new.work_order_id,new.created_by,new.node_id,new.title,new.body,new.kind,new.priority,new.feedback,new_status,new.response,new.work_order_task_id is null)
   is not distinct from row(old.object_id,old.work_order_id,old.created_by,old.node_id,old.title,old.body,old.kind,old.priority,old.feedback,old_status,old.response,old.work_order_task_id is null)
  then return new;end if;
 end if;
 if tg_op<>'INSERT' then perform private.customer_revision_for_own_visit_request(old.tenant_id,old.object_id,old.work_order_id,old.created_by);end if;
 if tg_op<>'DELETE' then perform private.customer_revision_for_own_visit_request(new.tenant_id,new.object_id,new.work_order_id,new.created_by);end if;
 return case when tg_op='DELETE' then old else new end;
end $$;
revoke all on function private.customer_own_visit_request_revision_trigger() from public,anon,authenticated,service_role;
create trigger customer_own_visit_request_revision after insert or update or delete on public.object_visit_requests
 for each row execute function private.customer_own_visit_request_revision_trigger();
