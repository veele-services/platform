SET local check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.object_agreement_options (
  target_tenant uuid,
  target_object uuid
)
  RETURNS TABLE (
    id               uuid,
    title            text,
    version          bigint,
    task_revision_id uuid,
    scope            text
  )
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
 perform private.management_assert(target_tenant,'backoffice.objects.read');
 perform private.management_assert(target_tenant,'backoffice.functions.object_agreement_options');

 return query select l.id,a.title,a.version,l.task_revision_id,l.scope from public.customer_agreement_lines l join public.customer_agreements a on a.tenant_id=l.tenant_id and a.id=l.agreement_id
 where l.tenant_id=target_tenant and l.object_id=target_object and private.object_manage(target_tenant) and a.state='active' and l.price_basis='visit' and not l.extra_work
 and a.starts_on<=(clock_timestamp() at time zone(select timezone from public.tenants tenant where tenant.id=target_tenant))::date and(a.ends_on is null or a.ends_on>=(clock_timestamp() at time zone(select timezone from public.tenants tenant where tenant.id=target_tenant))::date) and not exists(select 1 from public.customer_agreements n where n.previous_id=a.id and n.state='active' and n.starts_on<=(clock_timestamp() at time zone(select timezone from public.tenants tenant where tenant.id=target_tenant))::date);
end;
$function$;

