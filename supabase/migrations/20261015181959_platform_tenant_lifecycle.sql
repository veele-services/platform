SET local check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.platform_tenant_lifecycle (
  target_tenant    uuid,
  desired_status   text,
  expected_version bigint,
  request_id       uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
 <<command>>
 declare tenant public.tenants; cached private.crm_receipts; fingerprint text; result jsonb; actor uuid:=auth.uid(); receipt_scope text;
 begin
  perform private.platform_team_assert(false);
  if target_tenant is null or desired_status is null or desired_status not in ('active','suspended') or expected_version is null or expected_version<1 or request_id is null then
   raise exception 'Kies een tenant en geldige status.' using errcode='22023';
  end if;
  receipt_scope:='platform-tenant-lifecycle:'||actor::text;
  fingerprint:=encode(extensions.digest(jsonb_build_object('tenant',target_tenant,'status',desired_status,'version',expected_version)::text,'sha256'),'hex');
  perform pg_advisory_xact_lock(hashtextextended(receipt_scope||':'||request_id::text,0));
  perform private.platform_team_assert(false);
  select * into cached from private.crm_receipts r where r.scope=receipt_scope and r.request_id=platform_tenant_lifecycle.request_id;
  if found then
   if cached.input_hash<>fingerprint then raise exception 'De herhaalsleutel hoort bij andere invoer.' using errcode='23514';end if;
   return cached.result;
  end if;
  select * into tenant from public.tenants t where t.id=target_tenant for update;
  if not found then raise exception 'Tenant niet gevonden.' using errcode='22023';end if;
  -- Recheck the live session and role after every potentially blocking lock.
  perform private.platform_team_assert(false);
  perform 1 from public.platform_admins where user_id=actor for key share;
  if not found then raise exception 'Je platformtoegang is ingetrokken.' using errcode='42501';end if;
  if not exists(select 1 from auth.sessions s where s.id=nullif(auth.jwt()->>'session_id','')::uuid and s.user_id=actor and s.created_at>clock_timestamp()-interval '15 minutes' and exists(select 1 from auth.mfa_amr_claims a where a.session_id=s.id and a.authentication_method='otp')) then
   raise exception 'Log opnieuw in met een inlogcode om de tenantstatus te wijzigen.' using errcode='42501';
  end if;
  if tenant.status='archived' then raise exception 'Een gearchiveerde tenant kan hier niet worden geactiveerd.' using errcode='23514';end if;
  if tenant.version<>expected_version then raise exception 'De tenant is intussen gewijzigd. Laad de actuele gegevens.' using errcode='40001';end if;
  if tenant.status<>desired_status then
   update public.tenants set status=desired_status where id=target_tenant returning version into expected_version;
   insert into public.audit_events(tenant_id,actor_user_id,action,entity_type,entity_id,before_data,after_data)
   values(target_tenant,actor,'tenant.status.updated','tenants',target_tenant,jsonb_build_object('status',tenant.status,'version',tenant.version),jsonb_build_object('status',desired_status,'version',expected_version));
  end if;
  result:=jsonb_build_object('ok',true,'tenantId',target_tenant,'status',desired_status,'version',expected_version,'changed',tenant.status<>desired_status);
  insert into private.crm_receipts(scope,request_id,input_hash,result) values(receipt_scope,platform_tenant_lifecycle.request_id,fingerprint,result);
  return result;
 end
 $function$;

REVOKE ALL ON FUNCTION "public"."platform_tenant_lifecycle"(uuid, text, bigint, uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."platform_tenant_lifecycle"(uuid, text, bigint, uuid) TO "authenticated", "postgres";

