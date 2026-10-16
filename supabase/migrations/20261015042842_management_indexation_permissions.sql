-- Data initialization is intentionally separate from the CLI schema capture.
-- Draft until exercised through the migration runner. Uses the existing native
-- customer agreement command, including all line and agreement attributes.
insert into public.permission_catalog(key,domain,name,description,module,action,scopes,dependencies)
select 'backoffice.functions.'||v.code,'tenant',v.label,'Versiebeheer van indexatievoorstellen op echte klantcontracten.','finance',v.action,array['tenant'],
 array['backoffice.access','backoffice.finance.read','backoffice.customers.read']||case when v.action='write' then array['backoffice.finance.write','backoffice.functions.cockpit_indexation_query'] else '{}'::text[] end
from(values('cockpit_indexation_query','Prijsindexatie bekijken','read'),('cockpit_indexation_command','Prijsindexatie beheren','write'))v(code,label,action) on conflict(key) do nothing;
insert into private.management_role_permissions(tenant_id,role_id,capability)
select r.tenant_id,r.id,c.key from private.management_roles r join public.permission_catalog c on c.key in('backoffice.functions.cockpit_indexation_query','backoffice.functions.cockpit_indexation_command')
where r.code='owner' or exists(select 1 from private.management_role_permissions p where p.role_id=r.id and p.capability=case when c.action='write' then 'backoffice.finance.write' else 'backoffice.finance.read' end) on conflict do nothing;


revoke all on private.cockpit_indexations,private.cockpit_indexation_versions,private.cockpit_indexation_lines from public,anon,authenticated,service_role;
revoke all on function private.cockpit_indexation_assert(uuid,boolean),private.cockpit_indexation_owner(uuid),private.cockpit_indexation_source(uuid,uuid),private.cockpit_indexation_row(private.cockpit_indexations),private.cockpit_indexation_line(uuid,uuid,date) from public,anon,authenticated,service_role;
revoke all on function public.cockpit_indexation_query(uuid,jsonb),public.cockpit_indexation_evidence(uuid,uuid,uuid,text),public.cockpit_indexation_command(uuid,text,jsonb,uuid) from public,anon,authenticated,service_role;
grant execute on function public.cockpit_indexation_query(uuid,jsonb),public.cockpit_indexation_evidence(uuid,uuid,uuid,text),public.cockpit_indexation_command(uuid,text,jsonb,uuid) to authenticated;
notify pgrst,'reload schema';
