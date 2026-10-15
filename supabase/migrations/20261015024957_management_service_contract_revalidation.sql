-- Readable historic contract bindings remain intact. A new norm version must
-- still have an active contract after any policy/row lock wait.
create or replace function private.cockpit_service_source(v private.cockpit_service_versions,writing boolean default false) returns boolean language sql stable security definer set search_path='' as $$
 select private.cockpit_source(v.tenant_id,'object',v.object_id) and private.cockpit_source(v.tenant_id,'customer',v.customer_id)
 and exists(select 1 from public.customer_agreements a join public.customer_agreement_lines l on l.tenant_id=a.tenant_id and l.agreement_id=a.id join public.objects o on o.tenant_id=a.tenant_id and o.id=l.object_id where a.tenant_id=v.tenant_id and a.id=v.agreement_id and a.customer_id=v.customer_id and l.object_id=v.object_id and(not writing or(a.state='active' and o.customer_id=a.customer_id)))
$$;
revoke all on function private.cockpit_service_source(private.cockpit_service_versions,boolean) from public,anon,authenticated,service_role;
