-- Adapter only: all five email choices remain in the central preference and
-- suppression engine. It preserves push, quiet hours and timezone and never
-- receives a tenant, recipient, type code, policy or delivery channel from input.
create function public.customer_portal_preferences_save(
 target_tenant uuid,target_account uuid,expected_version bigint,input jsonb,request_id uuid
)
returns jsonb language plpgsql security definer set search_path='' as $$
declare source jsonb;types jsonb;payload jsonb;result jsonb;receipt private.customer_portal_commands;h text;k text;
begin
 if request_id is null or not private.customer_account_access(target_tenant,target_account) then raise exception 'Geen toegang tot deze voorkeuren' using errcode='42501';end if;
 if jsonb_typeof(input) is distinct from 'object' or octet_length(input::text)>2000 then raise exception 'Ongeldige voorkeuren' using errcode='23514';end if;
 if exists(select 1 from jsonb_object_keys(input)key where key not in('appointments','reports','invoices','tickets','news'))
 then raise exception 'Onbekende voorkeur' using errcode='23514';end if;
 for k in select unnest(array['appointments','reports','invoices','tickets','news']) loop
  if jsonb_typeof(input->k) is distinct from 'boolean' then raise exception 'Kies alle vijf voorkeuren' using errcode='23514';end if;
 end loop;
 perform pg_advisory_xact_lock(hashtextextended('fieldgrid-notification-policy',0));
 perform pg_advisory_xact_lock(hashtextextended('customer-portal-command:'||request_id::text,0));
 perform 1 from public.customer_portal_accounts where tenant_id=target_tenant and id=target_account for update;
 if not private.customer_account_access(target_tenant,target_account) then raise exception 'Klanttoegang is ingetrokken' using errcode='42501';end if;
 h:=encode(extensions.digest((input||jsonb_build_object('expectedVersion',expected_version))::text,'sha256'),'hex');
 select * into receipt from private.customer_portal_commands where id=request_id;
 if found then
  if receipt.tenant_id<>target_tenant or receipt.account_id<>target_account or receipt.actor_id<>auth.uid() or receipt.command<>'preferences_save' or receipt.input_hash<>h
  then raise exception 'Deze opdrachtsleutel hoort bij andere invoer' using errcode='23505';end if;
  return receipt.result;
 end if;
 source:=public.notification_query(target_tenant,'customer','preferences','{}');
 if expected_version is null or expected_version<>(source->>'revision')::bigint then raise exception 'Je voorkeuren zijn gewijzigd. Vernieuw en controleer je keuzes.' using errcode='40001';end if;
 select jsonb_agg(jsonb_build_object('code',entry->>'code','email',case when private.customer_notification_group(entry->>'code') is null then(entry->>'email')::boolean
  else(input->>private.customer_notification_group(entry->>'code'))::boolean end,'push',(entry->>'push')::boolean) order by entry->>'code')
 into types from jsonb_array_elements(source->'types')entry;
 payload:=jsonb_build_object('expected_revision',expected_version,'email',exists(select 1 from jsonb_each(input)entry where entry.value='true'::jsonb),
  'push',(source->>'push')::boolean,'timezone',source->>'timezone','quiet_enabled',(source->>'quiet_enabled')::boolean,
  'quiet_start',source->>'quiet_start','quiet_end',source->>'quiet_end','types',coalesce(types,'[]'));
 result:=public.notification_command(target_tenant,'customer','preferences_save',payload,request_id);
 result:=jsonb_build_object('preferenceVersion',(result->>'revision')::bigint);
 insert into private.customer_portal_commands(id,tenant_id,account_id,actor_id,command,input_hash,result)
 values(request_id,target_tenant,target_account,auth.uid(),'preferences_save',h,result);
 return result;
end $$;
revoke all on function public.customer_portal_preferences_save(uuid,uuid,bigint,jsonb,uuid) from public,anon,service_role;
grant execute on function public.customer_portal_preferences_save(uuid,uuid,bigint,jsonb,uuid) to authenticated;
