insert into public.permission_catalog(key,domain,name,description,module,action,scopes,dependencies)
values('backoffice.functions.cockpit_report_review_list','tenant','Rapportcontroles bekijken','Gerichte native rapportlijst zonder financiële of HR-inhoud; dossier en beoordeling behouden hun afzonderlijke rechten.','reports','read',array['tenant'],array['backoffice.access','backoffice.reports.read','backoffice.work_orders.read'])
on conflict(key) do nothing;

insert into private.management_role_permissions(tenant_id,role_id,capability)
select r.tenant_id,r.id,'backoffice.functions.cockpit_report_review_list'
from private.management_roles r
where r.code='owner' or (
 exists(select 1 from private.management_role_permissions p where p.role_id=r.id and p.capability='backoffice.reports.read')
 and exists(select 1 from private.management_role_permissions p where p.role_id=r.id and p.capability='backoffice.work_orders.read')
)
on conflict do nothing;

notify pgrst,'reload schema';
