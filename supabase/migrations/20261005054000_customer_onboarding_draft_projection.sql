-- Explicit editable draft projection, never raw onboarding JSON. Baseline
-- versions, receipts, internal metadata, login email and owners stay private.
create function public.customer_portal_draft(target_tenant uuid,target_account uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare a public.customer_portal_accounts;ct public.customer_contacts;c public.customers;contact jsonb;object jsonb;preferences jsonb;
begin
 if not private.customer_account_access(target_tenant,target_account) then raise exception 'Geen toegang tot deze introductie' using errcode='42501';end if;
 select * into a from public.customer_portal_accounts where tenant_id=target_tenant and id=target_account;
 select * into c from public.customers where tenant_id=target_tenant and id=a.customer_id;
 select * into ct from public.customer_contacts where tenant_id=target_tenant and customer_id=a.customer_id and id=a.contact_id;
 contact:=jsonb_build_object('firstName',coalesce(a.onboarding_draft->'contact'->>'firstName',split_part(coalesce(ct.full_name,''),' ',1)),
  'lastName',coalesce(a.onboarding_draft->'contact'->>'lastName',regexp_replace(coalesce(ct.full_name,''),'^[^ ]+ *','')),
  'company',coalesce(a.onboarding_draft->'contact'->>'company',c.name),'phone',coalesce(a.onboarding_draft->'contact'->>'phone',ct.phone,c.phone,''));
 if jsonb_typeof(a.onboarding_draft->'object')='object' then
  select jsonb_object_agg(key,value) into object from jsonb_each(a.onboarding_draft->'object') where key in('version','name','type','size','street','postalCode','city','contact','phone','contactVersion','contactRecordVersion','instruction');
 end if;
 preferences:=(public.customer_portal_preferences(target_tenant,target_account))->'groups';
 preferences:=jsonb_build_object('appointments',coalesce(a.onboarding_draft->'preferences'->'appointments',preferences->'appointments'),
  'reports',coalesce(a.onboarding_draft->'preferences'->'reports',preferences->'reports'),
  'invoices',coalesce(a.onboarding_draft->'preferences'->'invoices',preferences->'invoices'),
  'tickets',coalesce(a.onboarding_draft->'preferences'->'tickets',preferences->'tickets'),
  'news',coalesce(a.onboarding_draft->'preferences'->'news',preferences->'news'));
 return jsonb_build_object('step',a.onboarding_step,'version',a.version,'contact',contact,'object',object,'preferences',preferences);
end $$;
revoke all on function public.customer_portal_draft(uuid,uuid) from public,anon,service_role;
grant execute on function public.customer_portal_draft(uuid,uuid) to authenticated;
