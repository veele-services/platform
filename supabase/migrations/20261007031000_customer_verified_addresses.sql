-- Customer forms share the canonical structured address. Existing account,
-- exact object, capability, CAS, receipt and session guards remain in place.
create function private.customer_input_address(input jsonb, previous jsonb)
returns jsonb language plpgsql set search_path='' as $$
declare a jsonb;
begin
 if not input?'address' then return previous;end if;
 if jsonb_typeof(input->'address') is distinct from 'object' then raise exception 'Ongeldig adres' using errcode='23514';end if;
 a:=private.normalize_changed_address(input->'address',coalesce(previous,'{}'));
 if a->>'street' is distinct from btrim(input->>'street')
  or upper(replace(a->>'postal_code',' ','')) is distinct from upper(replace(input->>'postalCode',' ',''))
  or a->>'city' is distinct from btrim(input->>'city')
 then raise exception 'Adresvelden komen niet overeen' using errcode='23514';end if;
 return a;
end$$;
revoke all on function private.customer_input_address(jsonb,jsonb) from public,anon,authenticated,service_role;

create or replace function public.customer_portal_object_save(
 target_tenant uuid,target_account uuid,expected_account_version bigint,input jsonb,request_id uuid
)
returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.customer_portal_accounts;o public.objects;site public.object_records;ct public.customer_contacts;
 receipt private.customer_portal_commands;h text;result jsonb;k text;v jsonb;oid uuid;addr jsonb;postal text;size numeric;
begin
 if request_id is null or not private.customer_account_access(target_tenant,target_account) or not private.service_enabled(target_tenant,'planning')
 then raise exception 'Geen toegang tot dit klantobject' using errcode='42501';end if;
 if jsonb_typeof(input) is distinct from 'object' or octet_length(input::text)>15000
 then raise exception 'Ongeldige objectgegevens' using errcode='23514';end if;
 for k,v in select key,value from jsonb_each(input) loop
  if k not in('id','version','name','type','size','street','postalCode','city','contact','phone','contactVersion','contactRecordVersion','instruction','address')
  then raise exception 'Dit objectveld is niet bewerkbaar' using errcode='23514';end if;
 end loop;
 for k in select unnest(array['name','type','street','postalCode','city','contact','phone','instruction']) loop
  if jsonb_typeof(input->k) is distinct from 'string' then raise exception 'Controleer de objectvelden' using errcode='23514';end if;
 end loop;
 for k in select unnest(array['version','contactVersion','contactRecordVersion']) loop
  if jsonb_typeof(input->k) is distinct from 'number' or input->>k!~'^[0-9]{1,15}$' then raise exception 'Ongeldige bronversie' using errcode='23514';end if;
 end loop;
 if length(btrim(input->>'name')) not between 2 and 160 or input->>'type' not in('office','residential','school','care','retail','industrial','other')
  or length(btrim(input->>'street')) not between 2 and 200 or input->>'postalCode'!~'^[1-9][0-9]{3} ?[A-Za-z]{2}$'
  or length(btrim(input->>'city')) not between 2 and 100 or length(btrim(input->>'contact')) not between 2 and 180
  or length(btrim(input->>'phone')) not between 5 and 40 or length(input->>'instruction')>10000
  or not(input?'size') or jsonb_typeof(input->'size') not in('number','null')
  or input?'id' and(jsonb_typeof(input->'id') is distinct from 'string' or input->>'id'!~'^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$')
 then raise exception 'Controleer naam, adres en contactgegevens' using errcode='23514';end if;
 size:=(input->>'size')::numeric;oid:=(input->>'id')::uuid;
 if size is not null and(size<=0 or size>1000000) then raise exception 'Gebruik een geldige oppervlakte' using errcode='23514';end if;
 -- Object instruction adapters enqueue central notifications. Acquire their
 -- policy lock first, consistently with preferences/onboarding commands.
 perform pg_advisory_xact_lock(hashtextextended('fieldgrid-notification-policy',0));
 perform pg_advisory_xact_lock(hashtextextended('fieldgrid-planning:'||target_tenant::text,0));
 perform pg_advisory_xact_lock(hashtextextended('customer-portal-command:'||request_id::text,0));
 select * into a from public.customer_portal_accounts where tenant_id=target_tenant and id=target_account for update;
 if not private.customer_account_access(target_tenant,target_account) or not private.service_enabled(target_tenant,'planning')
  or oid is null and not a.can_create_objects or oid is not null and not a.can_edit_objects
 then raise exception 'Geen recht voor deze objectwijziging' using errcode='42501';end if;
 if oid is not null and not exists(select 1 from public.objects obj join public.object_customer_bindings b on b.tenant_id=obj.tenant_id and b.object_id=obj.id
  where obj.tenant_id=target_tenant and obj.id=oid and obj.customer_id=a.customer_id and obj.dossier_status='active' and b.user_id=auth.uid() and b.active)
 then raise exception 'Geen exacte toegang tot dit object' using errcode='42501';end if;
 h:=encode(extensions.digest(((input#-'{address,located_at}')||jsonb_build_object('accountVersion',expected_account_version))::text,'sha256'),'hex');
 select * into receipt from private.customer_portal_commands where id=request_id;
 if found then
  if receipt.tenant_id<>target_tenant or receipt.account_id<>target_account or receipt.actor_id<>auth.uid() or receipt.command<>'object_save' or receipt.input_hash<>h
  then raise exception 'De opdrachtsleutel hoort bij andere invoer' using errcode='23505';end if;
  if not exists(select 1 from public.objects obj join public.object_customer_bindings b on b.tenant_id=obj.tenant_id and b.object_id=obj.id
   where obj.tenant_id=target_tenant and obj.id=(receipt.result->>'objectId')::uuid and obj.customer_id=a.customer_id and b.user_id=auth.uid() and b.active)
  then raise exception 'De objecttoegang is ingetrokken' using errcode='42501';end if;
  return receipt.result;
 end if;
 if a.version is distinct from expected_account_version then raise exception 'Je klantaccount is gewijzigd. Vernieuw en controleer je invoer.' using errcode='40001';end if;
 if(select count(*) from private.customer_portal_commands where actor_id=auth.uid() and created_at>clock_timestamp()-interval '1 minute')>=60
 then raise exception 'Te veel wijzigingen. Probeer het later opnieuw.' using errcode='54000';end if;
 postal:=upper(replace(input->>'postalCode',' ',''));postal:=left(postal,4)||' '||right(postal,2);
 if oid is null then
  if(input->>'version')::bigint<>0 or(input->>'contactVersion')::bigint<>0 or(input->>'contactRecordVersion')::bigint<>0 then raise exception 'Ongeldige nieuwe objectversie' using errcode='40001';end if;
  oid:=gen_random_uuid();
 else
  select * into o from public.objects where tenant_id=target_tenant and id=oid and customer_id=a.customer_id for update;
  if o.version is distinct from(input->>'version')::bigint then raise exception 'Dit object is gewijzigd. Vernieuw en controleer je invoer.' using errcode='40001';end if;
 end if;
 addr:=o.address;
 if o.id is null or btrim(input->>'street') is distinct from(addr->>'street') or postal is distinct from upper(addr->>'postal_code') or btrim(input->>'city') is distinct from(addr->>'city') then
  addr:=jsonb_build_object('street',btrim(input->>'street'),'street_name',btrim(input->>'street'),'house_number','','house_letter','','house_addition','',
   'postal_code',postal,'city',btrim(input->>'city'),'country','NL','formatted',btrim(input->>'street')||', '||postal||' '||btrim(input->>'city'),
   'source','manual','status','needs_review','source_id',null,'bag_id',null,'latitude',null,'longitude',null,'located_at',null);
 end if;
 addr:=private.customer_input_address(input,addr);
 if o.id is null then
  insert into public.objects(id,tenant_id,customer_id,object_number,name,object_type,address,floor_area_m2)
  values(oid,target_tenant,a.customer_id,'OBJ-'||upper(substr(replace(oid::text,'-',''),1,10)),btrim(input->>'name'),input->>'type',addr,size) returning * into o;
  insert into public.object_customer_bindings(tenant_id,object_id,user_id,created_by) values(target_tenant,oid,auth.uid(),auth.uid());
 else
  update public.objects set name=btrim(input->>'name'),object_type=input->>'type',address=addr,floor_area_m2=size,
   latitude=case when addr=o.address then latitude end,longitude=case when addr=o.address then longitude end,
   arrival_location=case when addr=o.address then arrival_location end,updated_at=clock_timestamp() where tenant_id=target_tenant and id=oid;
 end if;
 select * into site from public.object_records where tenant_id=target_tenant and object_id=oid and kind='contact' and state='active'
  and customer_visible and details->>'customer_portal_site_contact'='true' order by id limit 1 for update;
 if coalesce(site.version,0)<>(input->>'contactRecordVersion')::bigint then raise exception 'De contactkoppeling is gewijzigd' using errcode='40001';end if;
 if site.id is not null then
  select * into ct from public.customer_contacts where tenant_id=target_tenant and id=site.contact_id and customer_id=a.customer_id and active for update;
  if ct.id is null or ct.version is distinct from(input->>'contactVersion')::bigint then raise exception 'De contactpersoon is gewijzigd' using errcode='40001';end if;
  if ct.full_name is distinct from btrim(input->>'contact') or coalesce(ct.phone,'') is distinct from btrim(input->>'phone') then
   if ct.object_ids<>array[oid] or exists(select 1 from public.customer_portal_accounts where tenant_id=target_tenant and contact_id=ct.id)
    or exists(select 1 from public.object_records where tenant_id=target_tenant and contact_id=ct.id and object_id<>oid) then ct.id:=null;
   else update public.customer_contacts set full_name=btrim(input->>'contact'),phone=btrim(input->>'phone'),version=version+1,updated_at=clock_timestamp() where tenant_id=target_tenant and id=ct.id;end if;
  end if;
 elsif(input->>'contactVersion')::bigint<>0 then raise exception 'Ongeldige contactversie' using errcode='40001';end if;
 if ct.id is null then
  insert into public.customer_contacts(tenant_id,customer_id,full_name,phone,object_ids,labels)
  values(target_tenant,a.customer_id,btrim(input->>'contact'),btrim(input->>'phone'),array[oid],array['operational']) returning * into ct;
 end if;
 if site.id is null then
  insert into public.object_records(tenant_id,object_id,kind,title,state,contact_id,customer_visible,details,created_by,updated_by)
  values(target_tenant,oid,'contact','Contactpersoon op locatie','active',ct.id,true,'{"customer_portal_site_contact":true}',auth.uid(),auth.uid());
 elsif site.contact_id is distinct from ct.id then update public.object_records set contact_id=ct.id where tenant_id=target_tenant and id=site.id;end if;
 if length(btrim(input->>'instruction'))>0 then
  insert into public.object_records(tenant_id,object_id,kind,title,body,state,instruction_type,starts_at,customer_visible,details,created_by,updated_by)
  values(target_tenant,oid,'instruction','Vaste instructie van klant',btrim(input->>'instruction'),'active','fixed',clock_timestamp(),true,'{"customer_portal_author":true}',auth.uid(),auth.uid());
 end if;
 update public.customer_portal_accounts set version=version+1,updated_at=clock_timestamp() where tenant_id=target_tenant and id=a.id returning version into a.version;
 result:=jsonb_build_object('objectId',oid,'accountVersion',a.version);
 insert into private.customer_portal_commands(id,tenant_id,account_id,actor_id,command,input_hash,result) values(request_id,target_tenant,target_account,auth.uid(),'object_save',h,result);
 return result;
end $$;
revoke all on function public.customer_portal_object_save(uuid,uuid,bigint,jsonb,uuid) from public,anon,service_role;
grant execute on function public.customer_portal_object_save(uuid,uuid,bigint,jsonb,uuid) to authenticated;

create or replace function public.customer_portal_profile_save(
 target_tenant uuid,target_account uuid,expected_account_version bigint,
 expected_customer_version bigint,expected_contact_version bigint,input jsonb,request_id uuid
)
returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.customer_portal_accounts;c public.customers;ct public.customer_contacts;
 receipt private.customer_portal_commands;h text;result jsonb;k text;v jsonb;addr jsonb;postal text;
begin
 if request_id is null or not private.customer_account_access(target_tenant,target_account)
  or not private.service_enabled(target_tenant,'planning')
 then raise exception 'Geen toegang tot dit klantprofiel' using errcode='42501';end if;
 if jsonb_typeof(input) is distinct from 'object' or octet_length(input::text)>5000
 then raise exception 'Ongeldige profielgegevens' using errcode='23514';end if;
 for k,v in select key,value from jsonb_each(input) loop
  if k not in('firstName','lastName','company','phone','invoiceEmail','street','postalCode','city','companyNumber','address')
   or (k<>'address' and (jsonb_typeof(v)<>'string' or length(v #>> '{}')>(case k when 'firstName' then 80 when 'lastName' then 100 when 'phone' then 40 when 'invoiceEmail' then 254 when 'street' then 200 when 'postalCode' then 7 when 'city' then 100 when 'companyNumber' then 8 else 180 end)))
  then raise exception 'Dit veld kan niet via het klantprofiel worden gewijzigd' using errcode='23514';end if;
 end loop;
 if length(btrim(coalesce(input->>'firstName','')))<1 or length(btrim(coalesce(input->>'lastName','')))<1
  or length(btrim(coalesce(input->>'company','')))<2 or length(btrim(coalesce(input->>'phone','')))<5
  or coalesce(input->>'invoiceEmail','')!~'^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  or length(btrim(coalesce(input->>'street','')))<2 or coalesce(input->>'postalCode','')!~'^[1-9][0-9]{3} ?[A-Za-z]{2}$'
  or length(btrim(coalesce(input->>'city','')))<2 or not(input?'companyNumber') or input->>'companyNumber'!~'^([0-9]{8})?$'
 then raise exception 'Controleer je contact- en factuurgegevens' using errcode='23514';end if;
 perform pg_advisory_xact_lock(hashtextextended('fieldgrid-notification-policy',0));
 perform pg_advisory_xact_lock(hashtextextended('fieldgrid-planning:'||target_tenant::text,0));
 perform pg_advisory_xact_lock(hashtextextended('customer-portal-command:'||request_id::text,0));
 select * into a from public.customer_portal_accounts where tenant_id=target_tenant and id=target_account for update;
 if not private.customer_account_access(target_tenant,target_account) or not a.can_edit_profile or a.contact_id is null
  or not private.service_enabled(target_tenant,'planning')
 then raise exception 'Geen recht om dit klantprofiel te wijzigen' using errcode='42501';end if;
 h:=encode(extensions.digest(((input#-'{address,located_at}')||jsonb_build_object('accountVersion',expected_account_version,'customerVersion',expected_customer_version,'contactVersion',expected_contact_version))::text,'sha256'),'hex');
 select * into receipt from private.customer_portal_commands where id=request_id;
 if found then
  if receipt.tenant_id<>target_tenant or receipt.account_id<>target_account or receipt.actor_id<>auth.uid()
   or receipt.command<>'profile_save' or receipt.input_hash<>h
  then raise exception 'De opdrachtsleutel hoort bij andere invoer' using errcode='23505';end if;
  return receipt.result;
 end if;
 select * into c from public.customers where tenant_id=target_tenant and id=a.customer_id for update;
 select * into ct from public.customer_contacts where tenant_id=target_tenant and customer_id=a.customer_id and id=a.contact_id for update;
 if a.version is distinct from expected_account_version or c.version is distinct from expected_customer_version
  or ct.version is distinct from expected_contact_version or ct.id is null
 then raise exception 'Je profiel is gewijzigd. Vernieuw en controleer je invoer.' using errcode='40001';end if;
 postal:=upper(replace(input->>'postalCode',' ',''));postal:=left(postal,4)||' '||right(postal,2);
 addr:=c.billing_address;
 if btrim(input->>'street') is distinct from(addr->>'street') or postal is distinct from upper(addr->>'postal_code')
  or btrim(input->>'city') is distinct from(addr->>'city') then
  addr:=jsonb_build_object('street',btrim(input->>'street'),'street_name',btrim(input->>'street'),'house_number','','house_letter','','house_addition','',
   'postal_code',postal,'city',btrim(input->>'city'),'country','NL','formatted',btrim(input->>'street')||', '||postal||' '||btrim(input->>'city'),
   'source','manual','status','needs_review','source_id',null,'bag_id',null,'latitude',null,'longitude',null,'located_at',null);
 end if;
 addr:=private.customer_input_address(input,addr);
 update public.customers set name=btrim(input->>'company'),phone=btrim(input->>'phone'),billing_email=lower(btrim(input->>'invoiceEmail')),
  billing_address=addr,company_number=nullif(input->>'companyNumber',''),version=version+1,updated_at=clock_timestamp()
 where tenant_id=target_tenant and id=c.id returning version into c.version;
 update public.customer_contacts set full_name=btrim(input->>'firstName')||' '||btrim(input->>'lastName'),phone=btrim(input->>'phone'),version=version+1,updated_at=clock_timestamp()
 where tenant_id=target_tenant and id=ct.id returning version into ct.version;
 update public.customer_portal_accounts set version=version+1,updated_at=clock_timestamp()
 where tenant_id=target_tenant and id=a.id returning version into a.version;
 result:=jsonb_build_object('accountVersion',a.version,'customerVersion',c.version,'contactVersion',ct.version);
 insert into private.customer_portal_commands(id,tenant_id,account_id,actor_id,command,input_hash,result)
 values(request_id,target_tenant,target_account,auth.uid(),'profile_save',h,result);
 return result;
end $$;
revoke all on function public.customer_portal_profile_save(uuid,uuid,bigint,bigint,bigint,jsonb,uuid) from public,anon,service_role;
grant execute on function public.customer_portal_profile_save(uuid,uuid,bigint,bigint,bigint,jsonb,uuid) to authenticated;

create or replace function public.customer_portal_onboarding_save(
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
   or exists(select 1 from jsonb_object_keys(object)key where key not in('version','name','type','size','street','postalCode','city','contact','phone','contactVersion','contactRecordVersion','instruction','address'))
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
 h:=encode(extensions.digest((input#-'{object,address,located_at}')::text,'sha256'),'hex');
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

-- Public canonical address data stays within the existing account/object scope.
do $$
declare d text; marker text; signature text;
begin
 for signature in select unnest(array['private.customer_portal_profile(uuid,uuid)','public.customer_portal_workspace(uuid,uuid)']) loop
  select pg_get_functiondef(signature::regprocedure) into d;
  marker:=case when signature like '%profile%' then '''street'',coalesce(c.billing_address->>''street'',''''),' else '''street'',coalesce(o.address->>''street'',''''),' end;
  if strpos(d,marker)=0 then raise exception 'Customer address projection marker missing';end if;
  d:=replace(d,marker,case when signature like '%profile%' then '''address'',c.billing_address,' else '''address'',o.address,' end||marker);
  execute d;
 end loop;
 select pg_get_functiondef('public.customer_portal_draft(uuid,uuid)'::regprocedure) into d;
 marker:='''contactRecordVersion'',''instruction'')';
 if strpos(d,marker)=0 then raise exception 'Customer draft address marker missing';end if;
 execute replace(d,marker,'''contactRecordVersion'',''instruction'',''address'')');
end$$;
