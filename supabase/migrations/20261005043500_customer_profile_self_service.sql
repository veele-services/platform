-- One new, narrowly scoped profile action. No existing authorization function,
-- raw-table grant, account owner, login email, invoice or object is changed.
-- Its rollback contract tests cover wrong user/account/tenant, forbidden keys,
-- version conflicts, receipt replay and revoked self-service capability.
create function public.customer_portal_profile_save(
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
  if k not in('firstName','lastName','company','phone','invoiceEmail','street','postalCode','city','companyNumber')
   or jsonb_typeof(v)<>'string' or length(v #>> '{}')>(case k when 'firstName' then 80 when 'lastName' then 100 when 'phone' then 40 when 'invoiceEmail' then 254 when 'street' then 200 when 'postalCode' then 7 when 'city' then 100 when 'companyNumber' then 8 else 180 end)
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
 h:=encode(extensions.digest((input||jsonb_build_object('accountVersion',expected_account_version,'customerVersion',expected_customer_version,'contactVersion',expected_contact_version))::text,'sha256'),'hex');
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
