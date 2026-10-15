insert into public.permission_catalog(key,domain,name,description,module,action,scopes,dependencies)
values('backoffice.functions.cockpit_invoice_list','tenant','Factuuroverzicht bekijken','Gerichte native factuurlijst en financiële saldi; concepten, documenten en mutaties behouden hun afzonderlijke bevoegdheden.','finance','read',array['tenant'],array['backoffice.access','backoffice.finance.read'])
on conflict(key) do nothing;
insert into private.management_role_permissions(tenant_id,role_id,capability)
select r.tenant_id,r.id,'backoffice.functions.cockpit_invoice_list' from private.management_roles r
where r.code='owner' or exists(select 1 from private.management_role_permissions p where p.role_id=r.id and p.capability='backoffice.finance.read')
on conflict do nothing;
notify pgrst,'reload schema';
