do $migration$
begin
create or replace function public.work_order_exceptions(target_tenant uuid,target_order uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare backoffice boolean;
begin
 backoffice:=private.work_order_access(target_tenant);
 if not private.object_session_active() or not private.service_enabled(target_tenant,'planning')
   or not (backoffice or (private.service_enabled(target_tenant,'personeel')
     and private.service_enabled(target_tenant,'rapportage')
     and private.is_work_order_assignee(target_tenant,target_order)))
   or not exists(select 1 from public.work_orders where id=target_order and tenant_id=target_tenant)
 then raise exception 'Geen toegang tot werkbonmeldingen' using errcode='42501';end if;
 return jsonb_build_object('canManage',private.planning_access(target_tenant),'items',coalesce((select jsonb_agg(jsonb_build_object(
   'id',e.id,'kind',e.kind,'description',e.description,'ownerId',case when backoffice then e.owner_user_id else null end,
   'state',e.state,'blocking',e.blocking,'attachmentId',case when exists(select 1 from public.attachments a
     where a.tenant_id=e.tenant_id and a.work_order_id=e.work_order_id and a.id=e.attachment_id and a.deleted_at is null
       and private.service_enabled(target_tenant,'rapportage')
       and (backoffice or (a.uploaded_by=auth.uid() and private.owns_report_path(a.tenant_id,a.work_order_id,a.storage_path))))
     then e.attachment_id else null end,
   'resolution',e.resolution,'version',e.version,'createdAt',e.created_at,'resolvedAt',e.resolved_at)
   order by e.created_at desc,e.id) from public.work_order_exceptions e
   where e.tenant_id=target_tenant and e.work_order_id=target_order and (backoffice or e.created_by=auth.uid())),'[]'));
end $$;

do $patch$
declare definition text;needle text;
begin
 definition:=pg_get_functiondef('public.work_order_exception_command(uuid,jsonb)'::regprocedure);
 if position('-- private employee exception evidence' in definition)=0 then
  needle:=' if mid is null then';
  if position(needle in definition)=0 then raise exception 'Review exception actor boundary';end if;
  definition:=replace(definition,needle,' -- private employee exception evidence
 if not manager and nullif(input->>''ownerId'','''') is not null then
   raise exception ''Alleen de planning kan een behandelaar kiezen'' using errcode=''42501'';
 end if;
'||needle);
  definition:=replace(definition,'e.version<>(input->>''version'')::bigint','e.version is distinct from (input->>''version'')::bigint');
  needle:='and a.id=(input->>''attachmentId'')::uuid) then raise exception ''De bijlage hoort niet bij deze werkbon'' using errcode=''23514'';';
  if position(needle in definition)=0 then raise exception 'Review exception attachment boundary';end if;
  definition:=replace(definition,needle,'and a.id=(input->>''attachmentId'')::uuid and a.deleted_at is null
    and private.service_enabled(target_tenant,''rapportage'')
    and (manager or (a.uploaded_by=auth.uid() and private.owns_report_path(a.tenant_id,a.work_order_id,a.storage_path))))
    then raise exception ''Geen toegang tot deze bijlage'' using errcode=''42501'';');
  execute definition;
 end if;
end $patch$;
notify pgrst,'reload schema';
end $migration$;
