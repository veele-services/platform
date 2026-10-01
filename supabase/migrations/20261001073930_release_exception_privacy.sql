begin;
SET local check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.work_order_exception_command (
  target_tenant uuid,
  input         jsonb
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare w public.work_orders;e public.work_order_exceptions;prior private.work_order_commands;mid uuid:=(input->>'mutationId')::uuid;hash text;result jsonb;manager boolean;
begin
 if not private.object_session_active() then raise exception 'Actieve sessie vereist' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended('fieldgrid-planning:'||target_tenant::text,0));
 select * into w from public.work_orders where tenant_id=target_tenant and id=(input->>'orderId')::uuid for update;
 manager:=private.planning_access(target_tenant);
 if w.id is null or not(manager or private.work_order_execution_actor(target_tenant,w.id,auth.uid(),nullif(auth.jwt()->>'session_id','')::uuid)) then raise exception 'Geen toegang tot deze werkbon' using errcode='42501';end if;
 -- private employee exception evidence
 if not manager and nullif(input->>'ownerId','') is not null then
   raise exception 'Alleen de planning kan een behandelaar kiezen' using errcode='42501';
 end if;
 if mid is null then raise exception 'Een wijzigingssleutel is verplicht' using errcode='23514';end if;
 hash:=encode(extensions.digest(input::text,'sha256'),'hex');select * into prior from private.work_order_commands where id=mid;
 if found then if(prior.tenant_id,prior.actor_id,prior.command,prior.payload_hash) is distinct from(target_tenant,auth.uid(),'exception',hash) then raise exception 'Ongeldige herhaalsleutel' using errcode='23514';end if;return prior.result;end if;
 if input->>'action'='resolve' then
  if not manager then raise exception 'Alleen de planning kan een melding afhandelen' using errcode='42501';end if;
  select * into e from public.work_order_exceptions where tenant_id=target_tenant and work_order_id=w.id and id=(input->>'id')::uuid for update;
  if e.id is null or e.version is distinct from (input->>'version')::bigint or e.state<>'open' then raise exception 'Deze melding is intussen gewijzigd' using errcode='40001';end if;
  if length(btrim(coalesce(input->>'resolution','')))<3 then raise exception 'Vul in hoe de melding is opgelost' using errcode='23514';end if;
  update public.work_order_exceptions set state='resolved',resolution=input->>'resolution',resolved_by=auth.uid(),resolved_at=clock_timestamp(),version=version+1 where id=e.id returning * into e;
 elsif input->>'action'='create' then
  if nullif(input->>'ownerId','') is not null and not exists(select 1 from public.tenant_memberships m where m.tenant_id=target_tenant and m.user_id=(input->>'ownerId')::uuid and m.status='active' and m.roles&&array['tenant_admin','management','planner']::public.app_role[]) then raise exception 'Kies een actieve behandelaar' using errcode='23514';end if;
  if nullif(input->>'attachmentId','') is not null and not exists(select 1 from public.attachments a where a.tenant_id=target_tenant and a.work_order_id=w.id and a.id=(input->>'attachmentId')::uuid and a.deleted_at is null
    and private.service_enabled(target_tenant,'rapportage')
    and (manager or (a.uploaded_by=auth.uid() and private.owns_report_path(a.tenant_id,a.work_order_id,a.storage_path))))
    then raise exception 'Geen toegang tot deze bijlage' using errcode='42501';end if;
  insert into public.work_order_exceptions(id,tenant_id,work_order_id,kind,description,owner_user_id,blocking,attachment_id,created_by)
  values(gen_random_uuid(),target_tenant,w.id,input->>'kind',input->>'description',coalesce(nullif(input->>'ownerId','')::uuid,w.planner_user_id,w.created_by),coalesce((input->>'blocking')::boolean,false),nullif(input->>'attachmentId','')::uuid,auth.uid()) returning * into e;
 else raise exception 'Ongeldige meldingsactie' using errcode='23514';end if;
 result:=jsonb_build_object('ok',true,'id',e.id,'version',e.version);insert into private.work_order_commands values(mid,target_tenant,auth.uid(),'exception',hash,result,clock_timestamp());
 insert into public.audit_events(tenant_id,actor_user_id,action,entity_type,entity_id,after_data) values(target_tenant,auth.uid(),'work_order.exception_'||(input->>'action'),'work_order',w.id,jsonb_build_object('exceptionId',e.id,'kind',e.kind,'state',e.state));
 perform private.enqueue_event(target_tenant,'work_order.exception','work_order',w.id,jsonb_build_object('work_order_id',w.id,'exception_id',e.id,'owner_id',e.owner_user_id),'work-order-exception:'||mid);
 return result;
end $function$;

CREATE OR REPLACE FUNCTION public.work_order_exceptions (
  target_tenant uuid,
  target_order  uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
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
end $function$;

notify pgrst,'reload schema';
commit;
