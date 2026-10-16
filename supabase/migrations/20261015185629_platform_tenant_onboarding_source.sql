SET local check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.platform_tenant_provision_v3 (
  input            jsonb,
  request_id       uuid,
  actor_user_id    uuid,
  actor_session_id uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
 declare actor uuid:=actor_user_id;payload jsonb;fingerprint text;receipt_scope text;cached private.crm_receipts;tenant uuid;services text[];desired_sender_name text;
 begin
  if auth.jwt()->>'role' is distinct from 'service_role' or not private.ticket_session_active(actor,actor_session_id) or not exists(select 1 from public.platform_admins where user_id=actor) then raise exception 'Actueel platformbeheer en een geldige sessie zijn vereist.' using errcode='42501';end if;
  if request_id is null or jsonb_typeof(input) is distinct from 'object' or length(input::text)>20000
   or input-array['name','slug','domain','adminName','adminEmail','primaryColor','accentColor','enabledServices','senderEmail','senderName']<>'{}'::jsonb
   or exists(select 1 from unnest(array['name','slug','adminName','adminEmail','primaryColor','accentColor'])k where jsonb_typeof(input->k) is distinct from 'string')
   or exists(select 1 from unnest(array['domain','senderEmail','senderName'])k where input?k and jsonb_typeof(input->k) is distinct from 'string')
   or jsonb_typeof(input->'enabledServices') is distinct from 'array' then raise exception 'Ongeldige tenantinrichting.' using errcode='22023';end if;
  if length(btrim(input->>'name')) not between 2 and 120 or length(btrim(input->>'adminName')) not between 2 and 160
   or length(input->>'adminEmail')>320 or length(coalesce(input->>'domain',''))>253 or length(coalesce(input->>'senderEmail',''))>320
   or length(coalesce(input->>'senderName',''))>160 or length(input->>'slug')>63 or lower(btrim(input->>'slug'))='www'
   or jsonb_array_length(input->'enabledServices')>6 then raise exception 'Controleer de organisatie, beheerder en afzendergegevens.' using errcode='22023';end if;
  select coalesce(array_agg(distinct x order by x),'{}') into services from jsonb_array_elements_text(input->'enabledServices')x;
  if array_position(services,null) is not null or not services<@array['planning','personeel','rapportage','finance','tickets','klantportaal']::text[]
   or ('finance'=any(services) and not array['planning','rapportage']::text[]<@services) or ('rapportage'=any(services) and not 'planning'=any(services)) then raise exception 'Facturatie vereist Planning en Rapportage; Rapportage vereist Planning.' using errcode='23514';end if;
  desired_sender_name:=coalesce(nullif(btrim(input->>'senderName'),''),btrim(input->>'name'));
  payload:=jsonb_build_object('name',btrim(input->>'name'),'slug',lower(btrim(input->>'slug')),'domain',nullif(lower(btrim(input->>'domain')),''),'adminName',btrim(input->>'adminName'),'adminEmail',lower(btrim(input->>'adminEmail')),'primaryColor',upper(input->>'primaryColor'),'accentColor',upper(input->>'accentColor'),'enabledServices',to_jsonb(services),'senderEmail',nullif(lower(btrim(input->>'senderEmail')),''),'senderName',desired_sender_name);
  fingerprint:=encode(extensions.digest(payload::text,'sha256'),'hex');receipt_scope:='platform-tenant-provision:'||actor::text;
  perform pg_advisory_xact_lock(hashtextextended('platform-onboarding:'||request_id::text,0));
  if auth.jwt()->>'role' is distinct from 'service_role' or not private.ticket_session_active(actor,actor_session_id) or not exists(select 1 from public.platform_admins where user_id=actor) then raise exception 'Actueel platformbeheer en een geldige sessie zijn vereist.' using errcode='42501';end if;
  select * into cached from private.crm_receipts r where r.scope=receipt_scope and r.request_id=platform_tenant_provision_v3.request_id;
  if found then
   if cached.input_hash<>fingerprint then raise exception 'Deze aanmaakcode hoort bij andere tenant- of afzendergegevens.' using errcode='23505';end if;
   return cached.result;
  end if;
  -- A legacy request has no original sender-name snapshot. Never invent one,
  -- change its recipient or rewrite a tenant already created by that workflow.
  if exists(select 1 from public.tenants where onboarding_key=request_id) then raise exception 'Deze aanmaakcode is al voor een eerdere inrichting gebruikt.' using errcode='23505';end if;
  perform 1 from public.platform_admins where user_id=actor for key share;
  if not found then raise exception 'Je platformtoegang is ingetrokken.' using errcode='42501';end if;
  if auth.jwt()->>'role' is distinct from 'service_role' or not private.ticket_session_active(actor,actor_session_id) or not exists(select 1 from public.platform_admins where user_id=actor) then raise exception 'Actueel platformbeheer en een geldige sessie zijn vereist.' using errcode='42501';end if;
  tenant:=public.provision_platform_tenant(payload->>'name',payload->>'slug',actor,request_id,payload->>'primaryColor',payload->>'accentColor',services,payload->>'adminName',payload->>'adminEmail',payload->>'domain',payload->>'senderEmail');
  update public.tenant_branding set sender_name=desired_sender_name where tenant_id=tenant;
  insert into private.crm_receipts(scope,request_id,input_hash,result) values(receipt_scope,platform_tenant_provision_v3.request_id,fingerprint,jsonb_build_object('tenantId',tenant));
  return jsonb_build_object('tenantId',tenant);
 end
 $function$;

REVOKE ALL ON FUNCTION "public"."platform_tenant_provision_v3"(jsonb, uuid, uuid, uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."platform_tenant_provision_v3"(jsonb, uuid, uuid, uuid) TO "postgres", "service_role";

