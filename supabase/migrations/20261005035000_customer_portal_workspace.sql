-- Narrow read-only DTO: bootstrap identity, exact-bound object summaries and
-- published visit summaries. Host resolution is unchanged. No vault metadata,
-- raw rows, request responses or internal workflow/review flags are exported.
create function private.customer_portal_profile(t uuid,a uuid)
returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('fullName',coalesce(nullif(ct.full_name,''),'Klant'),'email',u.email,
  'company',c.name,'phone',coalesce(ct.phone,c.phone,''),'invoiceEmail',coalesce(c.billing_email,''),
  'street',coalesce(c.billing_address->>'street',''),'postalCode',coalesce(c.billing_address->>'postal_code',''),
  'city',coalesce(c.billing_address->>'city',''),'companyNumber',coalesce(c.company_number,''),
  'customerVersion',c.version,'contactVersion',coalesce(ct.version,0))
 from public.customer_portal_accounts p join public.customers c on c.tenant_id=p.tenant_id and c.id=p.customer_id
 join auth.users u on u.id=p.user_id
 left join public.customer_contacts ct on ct.tenant_id=p.tenant_id and ct.id=p.contact_id and ct.customer_id=p.customer_id
 where p.tenant_id=t and p.id=a;
$$;
revoke all on function private.customer_portal_profile(uuid,uuid) from public,anon,authenticated,service_role;

create function public.customer_portal_workspace(target_tenant uuid,target_account uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare a public.customer_portal_accounts;tn public.tenants;b public.tenant_branding;s public.tenant_settings;objects jsonb;visits jsonb;
begin
 if not private.customer_account_access(target_tenant,target_account) then raise exception 'Geen toegang tot dit klantaccount' using errcode='42501';end if;
 select * into a from public.customer_portal_accounts where tenant_id=target_tenant and id=target_account;
 select * into tn from public.tenants where id=target_tenant;
 select * into b from public.tenant_branding where tenant_id=target_tenant;
 select * into s from public.tenant_settings where tenant_id=target_tenant;
 select coalesce(jsonb_agg(jsonb_build_object('id',o.id,'number',o.object_number,'name',o.name,'type',o.object_type,
  'status',o.dossier_status,'size',o.floor_area_m2,'version',o.version,
  'street',coalesce(o.address->>'street',''),'postalCode',coalesce(o.address->>'postal_code',''),'city',coalesce(o.address->>'city',''),
  'contact',coalesce(site_contact.full_name,''),'phone',coalesce(site_contact.phone,''),
  'contactVersion',coalesce(site_contact.version,0),'contactRecordVersion',coalesce(site_record.version,0),
  'services',coalesce((select jsonb_agg(x.service order by x.service) from(select distinct w.discipline service from public.work_orders w
   where w.tenant_id=target_tenant and w.object_id=o.id and private.customer_visit_access(target_tenant,o.id,w.id))x),'[]'),
  'instructions',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'body',r.body,'version',r.version,'createdAt',r.created_at,
   'author',case when r.details->>'customer_portal_author'='true' then coalesce((select ct.full_name from public.customer_portal_accounts pa
    join public.customer_contacts ct on ct.tenant_id=pa.tenant_id and ct.id=pa.contact_id and ct.customer_id=pa.customer_id
    where pa.tenant_id=target_tenant and pa.customer_id=a.customer_id and pa.user_id=r.created_by and pa.active limit 1),tn.name) else tn.name end)
    order by r.created_at desc,r.id) from public.object_records r where r.tenant_id=target_tenant and r.object_id=o.id
     and r.customer_visible and r.kind='instruction' and r.instruction_type='fixed' and r.work_order_id is null
     and r.state='active' and r.starts_at<=clock_timestamp() and(r.ends_at is null or r.ends_at>=clock_timestamp())),'[]')) order by o.name,o.id),'[]')
 into objects from public.objects o join public.object_customer_bindings binding on binding.tenant_id=o.tenant_id and binding.object_id=o.id
  and binding.user_id=auth.uid() and binding.active
 left join lateral(select r.contact_id,r.version from public.object_records r where r.tenant_id=o.tenant_id and r.object_id=o.id
  and r.kind='contact' and r.customer_visible and r.state='active' and r.details->>'customer_portal_site_contact'='true' order by r.id limit 1)site_record on true
 left join public.customer_contacts site_contact on site_contact.tenant_id=o.tenant_id and site_contact.id=site_record.contact_id and site_contact.customer_id=o.customer_id and site_contact.active
 where o.tenant_id=target_tenant and o.customer_id=a.customer_id and private.service_enabled(target_tenant,'planning');
 select coalesce(jsonb_agg(jsonb_build_object('id',w.id,'objectId',w.object_id,'number',w.work_order_number,'service',w.discipline,
  'status',w.status,'start',w.projected_start_at,'end',w.projected_end_at,'actualStart',w.actual_start_at,'actualEnd',w.actual_end_at,
  'version',w.version) order by w.projected_start_at,w.id),'[]') into visits from public.work_orders w
  where w.tenant_id=target_tenant and w.customer_id=a.customer_id and private.customer_visit_access(target_tenant,w.object_id,w.id);
 return jsonb_build_object('account',jsonb_build_object('id',a.id,'version',a.version,'canCreateObjects',a.can_create_objects,
  'canEditObjects',a.can_edit_objects,'canEditProfile',a.can_edit_profile,'onboardingStep',a.onboarding_step,'onboardingCompletedAt',a.onboarding_completed_at),
  'tenant',jsonb_build_object('name',tn.name,'slug',tn.slug,'timezone',tn.timezone,'primaryColor',b.primary_color,'accentColor',b.accent_color,
   'hasLogo',b.logo_path is not null,'whiteLabel',coalesce(s.white_label_enabled,false),'phone',coalesce(s.settings->'business'->>'phone',''),
   'planning',private.service_enabled(target_tenant,'planning'),'finance',private.service_enabled(target_tenant,'finance'),
   'reports',private.service_enabled(target_tenant,'rapportage'),'tickets',private.service_enabled(target_tenant,'tickets')),
  'profile',private.customer_portal_profile(target_tenant,target_account),'objects',objects,'visits',visits);
end $$;
revoke all on function public.customer_portal_workspace(uuid,uuid) from public,anon,service_role;
grant execute on function public.customer_portal_workspace(uuid,uuid) to authenticated;
