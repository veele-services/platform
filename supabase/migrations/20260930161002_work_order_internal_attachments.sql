SET local check_function_bodies = off;

CREATE OR REPLACE FUNCTION private.work_order_report_source_guard()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare w uuid;t uuid;changed boolean:=true;
begin
 if tg_op='DELETE' then w:=old.work_order_id;t:=old.tenant_id;else w:=new.work_order_id;t:=new.tenant_id;end if;
 if tg_table_name='attachments' and tg_op<>'INSERT' and exists(select 1 from public.work_order_report_versions r where r.tenant_id=old.tenant_id and r.work_order_id=old.work_order_id and exists(select 1 from jsonb_array_elements(r.snapshot->'attachments')x where x->>'id'=old.id::text)) then
  if tg_op='DELETE' or (to_jsonb(old)-array['updated_at','version']) is distinct from (to_jsonb(new)-array['updated_at','version']) then raise exception 'Bewijsbijlage van een rapportversie is onveranderlijk; voeg een nieuwe bijlage toe' using errcode='23514';end if;
 end if;
 if tg_table_name='report_entries' then
  if tg_op='UPDATE' then changed:=(old.customer_visible or new.customer_visible) and (old.body,old.customer_visible,old.deleted_at,old.work_order_id,old.tenant_id) is distinct from (new.body,new.customer_visible,new.deleted_at,new.work_order_id,new.tenant_id);
  elsif tg_op='INSERT' then changed:=new.customer_visible;else changed:=old.customer_visible;end if;
 elsif tg_table_name='attachments' then
  if tg_op='UPDATE' then changed:=old.customer_visible or new.customer_visible;
  elsif tg_op='INSERT' then changed:=new.customer_visible;else changed:=old.customer_visible;end if;
 elsif tg_table_name='work_order_tasks' and tg_op='UPDATE' then changed:=(old.task_code,old.task_name,old.quantity,old.executed_quantity,old.unit,old.completed_at,old.execution_state) is distinct from (new.task_code,new.task_name,new.quantity,new.executed_quantity,new.unit,new.completed_at,new.execution_state);
 end if;
 if changed and exists(select 1 from public.work_order_report_versions r where r.tenant_id=t and r.work_order_id=w and r.state in ('waiting_signature','review','approved')) then raise exception 'Vraag eerst een rapportcorrectie aan voordat klantzichtbare uitvoering wordt gewijzigd' using errcode='23514';end if;
 if tg_op='DELETE' then return old;end if;return new;
end $function$;
