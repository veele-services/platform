-- A separate new object action, with no change to historical auth functions or
-- raw table permissions. The account selects identity, never all customer sites.
create function public.customer_portal_object_save(
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
  if k not in('id','version','name','type','size','street','postalCode','city','contact','phone','contactVersion','contactRecordVersion','instruction')
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
 h:=encode(extensions.digest((input||jsonb_build_object('accountVersion',expected_account_version))::text,'sha256'),'hex');
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
