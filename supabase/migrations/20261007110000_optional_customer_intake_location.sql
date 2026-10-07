-- Objectless requests remain scoped to their creator and active customer account.
-- Selected objects still require explicit binding; quotes retain their object guard.
begin;

create or replace function private.commercial_customer_scope(t uuid,c uuid,o uuid,creator uuid default null)
returns boolean language sql stable security definer set search_path='' as $$
 select private.object_session_active() and private.service_enabled(t,'planning')
 and exists(select 1 from public.tenants where id=t and status='active')
 and (o is null and creator is not null and creator=auth.uid() or exists(select 1 from public.object_customer_bindings b join public.objects obj on obj.tenant_id=b.tenant_id and obj.id=b.object_id
  where b.tenant_id=t and b.user_id=auth.uid() and b.active and obj.customer_id=c and b.object_id=o))
 and exists(select 1 from public.customer_portal_accounts a where a.tenant_id=t and a.customer_id=c
  and a.user_id=auth.uid() and private.customer_account_access(t,a.id));
$$;

-- One atomic wrapper around the existing commercial intake. Every explicitly
-- selected object keeps a real independent request; there is no planning,
-- quoting, pricing or automatic appointment confirmation here.
create or replace function public.customer_portal_request_create(target_tenant uuid,target_account uuid,input jsonb,request_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.customer_portal_accounts;receipt private.customer_portal_commands;h text;result jsonb;
 object_ids uuid[];oid uuid;child uuid;children uuid[]:='{}';service text;frequency text;preferred date;payload jsonb;object_name text;
begin
 if request_id is null or not private.customer_account_access(target_tenant,target_account) or not private.service_enabled(target_tenant,'planning')
 then raise exception 'Geen toegang tot deze aanvraag' using errcode='42501';end if;
 if jsonb_typeof(input) is distinct from 'object' or octet_length(input::text)>18000
  or exists(select 1 from jsonb_object_keys(input)key where key not in('service','objectIds','frequency','preferredOn','description'))
  or jsonb_typeof(input->'objectIds') is distinct from 'array'
 then raise exception 'Ongeldige aanvraaggegevens' using errcode='23514';end if;
 if jsonb_array_length(input->'objectIds') not between 0 and 25
  or exists(select 1 from jsonb_array_elements(input->'objectIds')entry where jsonb_typeof(entry)<>'string' or entry #>> '{}'!~'^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$')
 then raise exception 'Selecteer maximaal 25 eigen objecten' using errcode='23514';end if;
 select coalesce(array_agg(value::uuid order by value::uuid),'{}'::uuid[]) into object_ids from jsonb_array_elements_text(input->'objectIds');
 if cardinality(object_ids)<>(select count(distinct chosen.object_id) from unnest(object_ids) as chosen(object_id))
 then raise exception 'Selecteer ieder object eenmaal' using errcode='23514';end if;
 service:=btrim(input->>'service');frequency:=input->>'frequency';
 if jsonb_typeof(input->'service') is distinct from 'string' or length(service) not between 2 and 100
  or jsonb_typeof(input->'description') is distinct from 'string' or length(btrim(input->>'description')) not between 3 and 10000
  or jsonb_typeof(input->'frequency') is distinct from 'string' or frequency not in('Eenmalig','Wekelijks','Maandelijks','In overleg')
 then raise exception 'Controleer dienst, frequentie en wensen' using errcode='23514';end if;
 if jsonb_typeof(input->'preferredOn') is distinct from 'null' then
  if jsonb_typeof(input->'preferredOn') is distinct from 'string' or input->>'preferredOn'!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
  then raise exception 'Gebruik een geldige voorkeursdatum' using errcode='23514';end if;
  begin preferred:=(input->>'preferredOn')::date;exception when invalid_datetime_format or datetime_field_overflow then raise exception 'Gebruik een geldige voorkeursdatum' using errcode='23514';end;
  if preferred<(clock_timestamp() at time zone(select timezone from public.tenants where id=target_tenant))::date
  then raise exception 'Kies een toekomstige voorkeursdatum of laat deze leeg' using errcode='23514';end if;
 end if;
 -- Existing commercial commands take their tenant commercial lock first and
 -- enqueue central notifications. Preserve that order; this wrapper never
 -- takes the planning advisory lock or changes objects/customer source data.
 perform pg_advisory_xact_lock(hashtextextended('commercial:'||target_tenant::text,0));
 perform pg_advisory_xact_lock(hashtextextended('fieldgrid-notification-policy',0));
 perform pg_advisory_xact_lock(hashtextextended('customer-portal-command:'||request_id::text,0));
 select * into a from public.customer_portal_accounts where tenant_id=target_tenant and id=target_account for update;
 perform 1 from public.customer_contacts where tenant_id=target_tenant and id=a.contact_id for share;
 perform 1 from public.object_customer_bindings where tenant_id=target_tenant and user_id=auth.uid() and object_id=any(object_ids) order by object_id for share;
 if not private.customer_account_access(target_tenant,target_account) or not private.service_enabled(target_tenant,'planning')
  or exists(select 1 from unnest(object_ids) as chosen(object_id) where not exists(select 1 from public.objects o where o.tenant_id=target_tenant and o.id=chosen.object_id
   and o.customer_id=a.customer_id and o.dossier_status='active' and private.commercial_customer_scope(target_tenant,a.customer_id,o.id)))
 then raise exception 'Selecteer uitsluitend je eigen gekoppelde objecten van dit klantaccount' using errcode='42501';end if;
 h:=encode(extensions.digest(input::text,'sha256'),'hex');
 select * into receipt from private.customer_portal_commands where id=request_id;
 if found then
  if receipt.tenant_id<>target_tenant or receipt.account_id<>target_account or receipt.actor_id<>auth.uid() or receipt.command<>'request_create' or receipt.input_hash<>h
  then raise exception 'De opdrachtsleutel hoort bij andere invoer' using errcode='23505';end if;
  return receipt.result;
 end if;
 if service<>'Andere dienstverlening' and not exists(select 1 from public.task_catalog where tenant_id=target_tenant and active and btrim(discipline)=service)
 then raise exception 'Deze dienst is niet meer beschikbaar. Kies opnieuw.' using errcode='23514';end if;
 if(select count(*) from private.customer_portal_commands where actor_id=auth.uid() and command='request_create' and created_at>clock_timestamp()-interval '1 hour')>=20
 then raise exception 'Te veel aanvragen. Neem contact op met je accountmanager.' using errcode='54000';end if;
 -- An objectless intake is one real request, never a placeholder object.
 foreach oid in array (case when cardinality(object_ids)=0 then array[null::uuid] else object_ids end) loop
  select name into object_name from public.objects where tenant_id=target_tenant and id=oid and customer_id=a.customer_id;
  payload:=jsonb_build_object('subject',left(service||' · '||coalesce(object_name,'Locatie later vaststellen'),180),'description',btrim(input->>'description'),'discipline',service,
   'work_kind',case when frequency in('Eenmalig','In overleg') then 'once' else 'recurring' end,'date',preferred,'frequency',frequency,'contact_id',a.contact_id);
  child:=private.commercial_intake(target_tenant,gen_random_uuid(),payload,'portal',a.customer_id,oid,auth.uid());
  update public.requests set customer_portal_group_id=request_id where tenant_id=target_tenant and id=child;
  children:=array_append(children,child);
 end loop;
 result:=jsonb_build_object('groupId',request_id,'requestIds',to_jsonb(children));
 insert into private.customer_portal_commands(id,tenant_id,account_id,actor_id,command,input_hash,result) values(request_id,target_tenant,target_account,auth.uid(),'request_create',h,result);
 return result;
end $$;
revoke all on function public.customer_portal_request_create(uuid,uuid,jsonb,uuid) from public,anon,service_role;
grant execute on function public.customer_portal_request_create(uuid,uuid,jsonb,uuid) to authenticated;

commit;
