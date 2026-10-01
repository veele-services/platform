-- Private download routes validate the authorized source identity after storage
-- I/O. Keep that parent identity in the descriptor even when the release gate
-- replaces the Object 360 document projection.
create or replace function public.get_object_document(
  target_tenant uuid,
  target_document uuid,
  target_order uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  d public.object_documents;
  manager boolean;
  customer boolean;
begin
  if not private.object_session_active() then
    return null;
  end if;

  select * into d
  from public.object_documents
  where tenant_id=target_tenant and id=target_document;

  if d.id is null then
    return null;
  end if;

  manager:=private.object_manage(target_tenant);
  customer:=exists(
    select 1
    from public.object_customer_bindings b
    where b.tenant_id=target_tenant
      and b.object_id=d.object_id
      and b.user_id=auth.uid()
      and b.active
  );

  if d.category='security' then
    if not manager or not private.has_role(target_tenant,array['tenant_admin','management']::public.app_role[]) then
      return null;
    end if;
  elsif not manager then
    if d.work_order_id is not null and d.work_order_id is distinct from target_order then
      return null;
    end if;
    if not private.object_visit_access(target_tenant,d.object_id,target_order) then
      return null;
    end if;
    if customer and (
      d.request_id is null
      or not exists(
        select 1
        from public.object_visit_requests r
        where r.tenant_id=target_tenant
          and r.id=d.request_id
          and r.object_id=d.object_id
          and r.work_order_id=target_order
          and r.created_by=auth.uid()
      )
    ) then
      return null;
    end if;
  end if;

  return jsonb_build_object(
    'path',d.storage_path,
    'name',d.file_name,
    'mime',d.mime_type,
    'title',d.title,
    'scope',jsonb_build_array(d.tenant_id,d.object_id)
  );
end
$$;
