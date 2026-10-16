SET local check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.platform_template_save_v3 (
  target_tenant     uuid,
  template_key      text,
  subject           text,
  body              text,
  reset_to_default  boolean,
  expected_revision integer,
  request_id        uuid,
  actor_user_id     uuid,
  actor_session_id  uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
 declare current_template public.tenant_message_templates;saved public.tenant_message_templates;actor uuid:=actor_user_id;receipt_scope text;fingerprint text;cached private.crm_receipts;result jsonb;
 begin
  if auth.jwt()->>'role' is distinct from 'service_role' or not private.ticket_session_active(actor,actor_session_id) or not exists(select 1 from public.platform_admins where user_id=actor) then raise exception 'Actueel platformbeheer en een geldige sessie zijn vereist.' using errcode='42501';end if;
  if target_tenant is null or template_key is null or template_key not in ('invoice','quote','workorder','schedule') or reset_to_default is null or expected_revision is null or expected_revision<1 or request_id is null or subject is null or body is null or length(subject)>200 or length(body)>6000 or (not reset_to_default and (btrim(subject)='' or btrim(body)='' or subject~E'[\\n\\r]')) then raise exception 'Controleer het onderwerp en bericht.' using errcode='22023';end if;
  fingerprint:=encode(extensions.digest(jsonb_build_object('tenant',target_tenant,'key',template_key,'subject',subject,'body',body,'reset',reset_to_default,'revision',expected_revision)::text,'sha256'),'hex');receipt_scope:='platform-template-save:'||actor::text;
  perform pg_advisory_xact_lock(hashtextextended(receipt_scope||':'||request_id::text,0));
  if not private.ticket_session_active(actor,actor_session_id) or not exists(select 1 from public.platform_admins where user_id=actor) then raise exception 'Je platformtoegang is ingetrokken.' using errcode='42501';end if;
  select * into cached from private.crm_receipts r where r.scope=receipt_scope and r.request_id=platform_template_save_v3.request_id;
  if found then if cached.input_hash<>fingerprint then raise exception 'De herhaalsleutel hoort bij andere template-invoer.' using errcode='23514';end if;return cached.result;end if;
  select * into current_template from public.tenant_message_templates t where t.tenant_id=target_tenant and t.template_key=platform_template_save_v3.template_key for update;
  if not found then raise exception 'Template niet gevonden.' using errcode='P0002';end if;
  if not private.ticket_session_active(actor,actor_session_id) or not exists(select 1 from public.platform_admins where user_id=actor) then raise exception 'Je platformtoegang is ingetrokken.' using errcode='42501';end if;
  perform 1 from public.platform_admins where user_id=actor for key share;
  if not found then raise exception 'Je platformtoegang is ingetrokken.' using errcode='42501';end if;
  if current_template.revision<>expected_revision then raise exception 'Het template is intussen gewijzigd. Laad de actuele versie; je invoer blijft bewaard.' using errcode='40001';end if;
  saved:=public.save_tenant_message_template(target_tenant,template_key,subject,body,reset_to_default,actor);
  result:=jsonb_build_object('revision',saved.revision);
  insert into private.crm_receipts(scope,request_id,input_hash,result) values(receipt_scope,platform_template_save_v3.request_id,fingerprint,result);
  return result;
 end
 $function$;

REVOKE ALL ON FUNCTION "public"."platform_template_save_v3"(uuid, text, text, text, boolean, integer, uuid, uuid, uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."platform_template_save_v3"(uuid, text, text, text, boolean, integer, uuid, uuid, uuid) TO "postgres", "service_role";

