SET local check_function_bodies = off;

CREATE OR REPLACE FUNCTION private.cockpit_indexation_line (
  t            uuid,
  original     uuid,
  business_day date
)
  RETURNS uuid
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare selected uuid:=original;next_line uuid;depth integer:=0;begin
 loop
  select m.new_line_id into next_line from private.cockpit_indexation_lines m join private.cockpit_indexations i on i.tenant_id=m.tenant_id and i.id=m.indexation_id and i.state='Verwerkt' join public.customer_agreement_lines l on l.tenant_id=m.tenant_id and l.id=m.new_line_id join public.customer_agreements a on a.tenant_id=l.tenant_id and a.id=l.agreement_id where m.tenant_id=t and m.old_line_id=selected and m.effective_on<=business_day;
  if next_line is null then return selected;end if;selected:=next_line;depth:=depth+1;if depth>50 then raise exception 'Contractversieketen is te diep; controleer de bron.' using errcode='23514';end if;
 end loop;
end$function$;

CREATE OR REPLACE FUNCTION public.cockpit_indexation_evidence (
  target_tenant     uuid,
  target_customer   uuid,
  selected_evidence uuid DEFAULT NULL::uuid,
  search            text DEFAULT ''::text
)
  RETURNS jsonb
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare result jsonb;begin
 perform private.cockpit_indexation_assert(target_tenant);
 if not exists(select 1 from public.customers where tenant_id=target_tenant and id=target_customer and status='active') or length(coalesce(search,''))>160 then raise exception 'Geen toegang tot dit klantdossier.' using errcode='42501';end if;
 with files as materialized(select e from public.dossier_documents d join public.customer_documents document on document.tenant_id=d.tenant_id and document.id=d.source_id and not document.archived cross join lateral(select private.cockpit_evidence(target_tenant,'customer',target_customer,d.id)e)x where d.tenant_id=target_tenant and d.customer_id=target_customer and d.source_kind='customer' and x.e is not null)
 select jsonb_build_object('rows',coalesce((select jsonb_agg(e-'fingerprint' order by e->>'name') from(select e from files where position(lower(coalesce(search,'')) in lower(e->>'name'))>0 order by e->>'name',e->>'id' limit 50)x),'[]'),'selected',(select e-'fingerprint' from files where e->>'id'=selected_evidence::text),'total',(select count(*) from files where position(lower(coalesce(search,'')) in lower(e->>'name'))>0)) into result;return result;
end$function$;

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
 and a.starts_on<=(clock_timestamp() at time zone(select timezone from public.tenants where id=target_tenant))::date and(a.ends_on is null or a.ends_on>=(clock_timestamp() at time zone(select timezone from public.tenants where id=target_tenant))::date) and not exists(select 1 from public.customer_agreements n where n.previous_id=a.id and n.state='active' and n.starts_on<=(clock_timestamp() at time zone(select timezone from public.tenants where id=target_tenant))::date);
end;
$function$;

