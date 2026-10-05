-- SQL callers must provide the same optimistic version required by the UI.
-- Recheck management after waiting for the tenant planning lock as well.
create or replace function public.customer_portal_bind(target_tenant uuid,target_customer uuid,target_user uuid,target_contact uuid,
 expected_version bigint,can_create boolean,can_edit_objects boolean,can_edit_profile boolean,enabled boolean)
returns uuid language plpgsql security definer set search_path='' as $$
declare a public.customer_portal_accounts;
begin
 if not private.customer_portal_manage(target_tenant) then raise exception 'Geen toegang tot klantaccountbeheer' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended('fieldgrid-planning:'||target_tenant::text,0));
 if not private.customer_portal_manage(target_tenant) then raise exception 'Geen toegang tot klantaccountbeheer' using errcode='42501';end if;
 if expected_version is null or expected_version<0 then
  raise exception 'Een actuele klantaccountversie is verplicht' using errcode='40001';
 end if;
 if not exists(select 1 from public.customers where tenant_id=target_tenant and id=target_customer and status not in ('inactive','archived','draft'))
 or not exists(select 1 from auth.users u where u.id=target_user and u.deleted_at is null and not coalesce(u.is_anonymous,false)
   and (u.banned_until is null or u.banned_until<clock_timestamp()))
 or not exists(select 1 from public.customer_contacts c where c.tenant_id=target_tenant and c.id=target_contact and c.customer_id=target_customer and c.active)
 then raise exception 'Kies een actief account en een contact van deze klant' using errcode='23514';end if;
 select * into a from public.customer_portal_accounts where tenant_id=target_tenant and customer_id=target_customer and user_id=target_user for update;
 if (a.id is null and expected_version<>0) or(a.id is not null and a.version<>expected_version)
 then raise exception 'Het klantaccount is gewijzigd. Vernieuw het dossier.' using errcode='40001';end if;
 if a.id is null then
  insert into public.customer_portal_accounts(tenant_id,customer_id,user_id,contact_id,active,can_create_objects,can_edit_objects,can_edit_profile,created_by)
  values(target_tenant,target_customer,target_user,target_contact,enabled,can_create,can_edit_objects,can_edit_profile,auth.uid()) returning * into a;
 else
  update public.customer_portal_accounts set contact_id=target_contact,active=enabled,can_create_objects=can_create,
   can_edit_objects=customer_portal_bind.can_edit_objects,can_edit_profile=customer_portal_bind.can_edit_profile,
   version=version+1,updated_at=clock_timestamp() where id=a.id returning * into a;
 end if;
 if not enabled then
  update public.object_customer_bindings b set active=false,version=b.version+1
  from public.objects o where b.tenant_id=target_tenant and b.user_id=target_user and b.active and o.tenant_id=b.tenant_id and o.id=b.object_id and o.customer_id=target_customer;
 end if;
 insert into public.audit_events(tenant_id,actor_user_id,action,entity_type,entity_id,after_data)
 values(target_tenant,auth.uid(),'customer.portal_binding','customer',target_customer,jsonb_build_object('accountId',a.id,'active',enabled,'canCreateObjects',can_create,'canEditObjects',can_edit_objects,'canEditProfile',can_edit_profile));
 return a.id;
end $$;
revoke all on function public.customer_portal_bind(uuid,uuid,uuid,uuid,bigint,boolean,boolean,boolean,boolean) from public,anon,service_role;
grant execute on function public.customer_portal_bind(uuid,uuid,uuid,uuid,bigint,boolean,boolean,boolean,boolean) to authenticated;
