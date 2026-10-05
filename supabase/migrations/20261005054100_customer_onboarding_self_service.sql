-- One new atomic onboarding command. Drafts are private; completion appends a
-- canonical object through the same self-service action, never demo-reset SQL.
create function public.customer_portal_onboarding_save(
 target_tenant uuid,target_account uuid,input jsonb,request_id uuid
)
returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.customer_portal_accounts;c public.customers;ct public.customer_contacts;
 receipt private.customer_portal_commands;h text;result jsonb;source jsonb;baselines jsonb;
 mode text;k text;v jsonb;step integer;contact jsonb;object jsonb;preferences jsonb;object_result jsonb;
begin
 if request_id is null or not private.customer_account_access(target_tenant,target_account)
  or not private.service_enabled(target_tenant,'planning')
 then raise exception 'Geen toegang tot deze introductie' using errcode='42501';end if;
 if jsonb_typeof(input) is distinct from 'object' or octet_length(input::text)>20000
  or exists(select 1 from jsonb_object_keys(input)key where key not in('mode','expectedVersion','customerVersion','contactVersion','preferenceVersion','step','contact','object','preferences','confirmed'))
 then raise exception 'Ongeldige introductiegegevens' using errcode='23514';end if;
 mode:=input->>'mode';
 if mode is null or mode not in('save','complete','review') or jsonb_typeof(input->'confirmed') is distinct from 'boolean'
 then raise exception 'Controleer de opdracht' using errcode='23514';end if;
 for k in select unnest(array['expectedVersion','customerVersion','contactVersion','preferenceVersion','step']) loop
  if jsonb_typeof(input->k) is distinct from 'number' or input->>k!~'^[0-9]{1,15}$'
  then raise exception 'Ongeldige bronversie' using errcode='23514';end if;
 end loop;
 if (input->>'step')::numeric>3 then raise exception 'Ongeldige stap' using errcode='23514';end if;
 step:=(input->>'step')::integer;
 if step not between 0 and 3 or (input->>'expectedVersion')::bigint<1
  or (input->>'customerVersion')::bigint<1 or (input->>'contactVersion')::bigint<1
  or mode in('complete','review') and not(input->>'confirmed')::boolean
 then raise exception 'Controleer en bevestig je gegevens' using errcode='23514';end if;
 contact:=input->'contact';object:=input->'object';preferences:=input->'preferences';
 if jsonb_typeof(contact) is distinct from 'object'
  or exists(select 1 from jsonb_object_keys(contact)key where key not in('firstName','lastName','company','phone'))
 then raise exception 'Ongeldige contactgegevens' using errcode='23514';end if;
 for k,v in select key,value from jsonb_each(contact) loop
  if jsonb_typeof(v)<>'string' or length(v #>> '{}')>(case k when 'firstName' then 80 when 'lastName' then 100 when 'phone' then 40 else 180 end)
  then raise exception 'Controleer je contactgegevens' using errcode='23514';end if;
 end loop;
 if length(btrim(coalesce(contact->>'firstName','')))<1 or length(btrim(coalesce(contact->>'lastName','')))<1
  or length(btrim(coalesce(contact->>'company','')))<2 or length(btrim(coalesce(contact->>'phone','')))<5
 then raise exception 'Vul je contactgegevens in' using errcode='23514';end if;
 if jsonb_typeof(preferences) is distinct from 'object'
  or exists(select 1 from jsonb_object_keys(preferences)key where key not in('appointments','reports','invoices','tickets','news'))
 then raise exception 'Ongeldige voorkeuren' using errcode='23514';end if;
 for k in select unnest(array['appointments','reports','invoices','tickets','news']) loop
  if jsonb_typeof(preferences->k) is distinct from 'boolean' then raise exception 'Kies alle vijf voorkeuren' using errcode='23514';end if;
 end loop;
 if jsonb_typeof(object) is distinct from 'null' then
  if jsonb_typeof(object) is distinct from 'object'
   or exists(select 1 from jsonb_object_keys(object)key where key not in('version','name','type','size','street','postalCode','city','contact','phone','contactVersion','contactRecordVersion','instruction'))
  then raise exception 'Gebruik een nieuw eerste object' using errcode='23514';end if;
  for k in select unnest(array['version','contactVersion','contactRecordVersion']) loop
   if object->k is distinct from '0'::jsonb then raise exception 'Gebruik een nieuw eerste object' using errcode='23514';end if;
  end loop;
  for k in select unnest(array['name','type','street','postalCode','city','contact','phone','instruction']) loop
   if jsonb_typeof(object->k) is distinct from 'string' then raise exception 'Controleer de objectvelden' using errcode='23514';end if;
  end loop;
  if length(btrim(object->>'name')) not between 2 and 160 or object->>'type' not in('office','residential','school','care','retail','industrial','other')
   or length(btrim(object->>'street')) not between 2 and 200 or object->>'postalCode'!~'^[1-9][0-9]{3} ?[A-Za-z]{2}$'
   or length(btrim(object->>'city')) not between 2 and 100 or length(btrim(object->>'contact')) not between 2 and 180
   or length(btrim(object->>'phone')) not between 5 and 40 or length(object->>'instruction')>10000
   or jsonb_typeof(object->'size') not in('number','null') or not(object?'size')
  then raise exception 'Controleer naam, adres en contactgegevens' using errcode='23514';end if;
  if mode<>'complete' and object->>'size' is not null and ((object->>'size')::numeric<=0 or (object->>'size')::numeric>1000000)
  then raise exception 'Gebruik een geldige oppervlakte' using errcode='23514';end if;
 elsif step>=1 then raise exception 'Vul het eerste object in' using errcode='23514';end if;
 perform pg_advisory_xact_lock(hashtextextended('fieldgrid-notification-policy',0));
 perform pg_advisory_xact_lock(hashtextextended('fieldgrid-planning:'||target_tenant::text,0));
 perform pg_advisory_xact_lock(hashtextextended('customer-portal-command:'||request_id::text,0));
 select * into a from public.customer_portal_accounts where tenant_id=target_tenant and id=target_account for update;
 if not private.customer_account_access(target_tenant,target_account) or not private.service_enabled(target_tenant,'planning')
  or not a.can_edit_profile or not a.can_create_objects or a.contact_id is null
 then raise exception 'Geen recht om deze introductie af te ronden' using errcode='42501';end if;
 h:=encode(extensions.digest(input::text,'sha256'),'hex');
 select * into receipt from private.customer_portal_commands where id=request_id;
 if found then
  if receipt.tenant_id<>target_tenant or receipt.account_id<>target_account or receipt.actor_id<>auth.uid()
   or receipt.command<>'onboarding' or receipt.input_hash<>h
  then raise exception 'De opdrachtsleutel hoort bij andere invoer' using errcode='23505';end if;
  if receipt.result?'objectId' and not exists(select 1 from public.objects o join public.object_customer_bindings b on b.tenant_id=o.tenant_id and b.object_id=o.id
   where o.tenant_id=target_tenant and o.id=(receipt.result->>'objectId')::uuid and o.customer_id=a.customer_id and b.user_id=auth.uid() and b.active)
  then raise exception 'De objecttoegang is ingetrokken' using errcode='42501';end if;
  return receipt.result;
 end if;
 if a.onboarding_completed_at is not null then raise exception 'De introductie is al afgerond' using errcode='23514';end if;
 if a.version is distinct from(input->>'expectedVersion')::bigint
 then raise exception 'De introductie is gewijzigd. Vernieuw en controleer je invoer.' using errcode='40001';end if;
 if step>a.onboarding_step or mode='complete' and(step<>3 or a.onboarding_step<>3)
 then raise exception 'Doorloop de introductie in volgorde' using errcode='23514';end if;
 select * into c from public.customers where tenant_id=target_tenant and id=a.customer_id for update;
 select * into ct from public.customer_contacts where tenant_id=target_tenant and customer_id=a.customer_id and id=a.contact_id for update;
 source:=public.customer_portal_preferences(target_tenant,target_account);
 baselines:=jsonb_build_object('customerVersion',c.version,'contactVersion',ct.version,'preferenceVersion',source->'version');
 if c.version is distinct from(input->>'customerVersion')::bigint or ct.version is distinct from(input->>'contactVersion')::bigint
  or (source->>'version')::bigint is distinct from(input->>'preferenceVersion')::bigint
  or mode<>'review' and a.onboarding_draft?'_sources' and a.onboarding_draft->'_sources' is distinct from baselines
 then raise exception 'De brongegevens zijn gewijzigd. Controleer je concept opnieuw voordat je verdergaat.' using errcode='40001';end if;
 if mode='complete' then
  -- Keep billing, login email, ownership and every existing history row intact.
  update public.customers set name=btrim(contact->>'company'),phone=btrim(contact->>'phone'),version=version+1,updated_at=clock_timestamp()
  where tenant_id=target_tenant and id=c.id;
  update public.customer_contacts set full_name=btrim(contact->>'firstName')||' '||btrim(contact->>'lastName'),phone=btrim(contact->>'phone'),version=version+1,updated_at=clock_timestamp()
  where tenant_id=target_tenant and id=ct.id;
  object_result:=public.customer_portal_object_save(target_tenant,target_account,a.version,object,gen_random_uuid());
  perform public.customer_portal_preferences_save(target_tenant,target_account,(input->>'preferenceVersion')::bigint,preferences,gen_random_uuid());
  update public.customer_portal_accounts set onboarding_completed_at=clock_timestamp(),onboarding_step=3,onboarding_draft='{}',version=version+1,updated_at=clock_timestamp()
  where tenant_id=target_tenant and id=a.id returning version into a.version;
  result:=jsonb_build_object('accountVersion',a.version,'step',3,'completed',true,'objectId',object_result->'objectId');
 else
  update public.customer_portal_accounts set onboarding_draft=jsonb_build_object('contact',contact,'object',object,'preferences',preferences,'_sources',baselines),
   onboarding_step=case when mode='review' then onboarding_step else greatest(onboarding_step,least(step+1,3)) end,
   version=version+1,updated_at=clock_timestamp()
  where tenant_id=target_tenant and id=a.id returning version,onboarding_step into a.version,a.onboarding_step;
  result:=jsonb_build_object('accountVersion',a.version,'step',a.onboarding_step,'completed',false);
 end if;
 insert into private.customer_portal_commands(id,tenant_id,account_id,actor_id,command,input_hash,result)
 values(request_id,target_tenant,target_account,auth.uid(),'onboarding',h,result);
 return result;
end $$;
revoke all on function public.customer_portal_onboarding_save(uuid,uuid,jsonb,uuid) from public,anon,service_role;
grant execute on function public.customer_portal_onboarding_save(uuid,uuid,jsonb,uuid) to authenticated;
