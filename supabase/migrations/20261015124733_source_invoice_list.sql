SET local check_function_bodies = off;

CREATE OR REPLACE FUNCTION private.cockpit_invoice_list (
  t       uuid,
  filters jsonb DEFAULT '{}'::jsonb
)
  RETURNS jsonb
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
 v jsonb:=coalesce(filters,'{}'::jsonb);v_query text;v_status text;v_stage text;v_sort text;v_page integer;v_size integer;
 v_today date;v_sources boolean;result jsonb;
begin
 perform private.cockpit_assert(t,'backoffice.finance.read');
 perform private.cockpit_assert(t,'backoffice.functions.cockpit_invoice_list');
 if not private.has_role(t,array['tenant_admin','management','finance']::public.app_role[]) or not private.service_enabled(t,'finance') or not private.management_table_allowed(t,'invoices',false) then
  raise exception 'Financiële leestoegang vereist.' using errcode='42501';
 end if;
 if jsonb_typeof(v)<>'object' or v-array['q','status','stage','sort','page','pageSize']<>'{}'::jsonb then raise exception 'Ongeldige factuurselectie.' using errcode='22023';end if;
 if exists(select 1 from jsonb_each(v) e where e.key in('q','status','stage','sort') and jsonb_typeof(e.value)<>'string')
 or exists(select 1 from jsonb_each(v) e where e.key in('page','pageSize') and(jsonb_typeof(e.value)<>'number' or e.value::text!~'^[0-9]{1,6}$')) then raise exception 'Ongeldige factuurselectie.' using errcode='22023';end if;
 v_query:=coalesce(v->>'q','');v_status:=coalesce(v->>'status','');v_stage:=coalesce(v->>'stage','unpaid');v_sort:=coalesce(v->>'sort','date_desc');v_page:=coalesce((v->>'page')::integer,1);v_size:=coalesce((v->>'pageSize')::integer,25);
 if length(v_query)>200 or v_status not in('','draft','final','sent','partially_paid','paid','overdue','credited','void','concept') or v_stage not in('unpaid','all','concepts','paid') or v_sort not in('date','date_desc','number','customer','amount','amount_desc','status') or v_page not between 1 and 100000 or v_size not between 10 and 100 then raise exception 'Ongeldige factuurselectie.' using errcode='22023';end if;
 select (statement_timestamp() at time zone tenant.timezone)::date into v_today from public.tenants tenant where tenant.id=t and tenant.status='active';
 v_sources:=private.management_allowed(t,'backoffice.functions.execution_invoice_concepts') and private.commercial_access(t);
 if v_stage='concepts' and not v_sources then raise exception 'Geen actuele conceptbevoegdheid.' using errcode='42501';end if;
 with actual as materialized(
  select 'invoice'::text kind,i.id,i.customer_id,coalesce(i.customer_snapshot->>'name',c.name) customer,
   coalesce(i.invoice_number,'Concept') number,
   coalesce((select line.description from public.invoice_lines line where line.tenant_id=t and line.invoice_id=i.id order by line.created_at,line.id limit 1),'Factuur '||coalesce(i.invoice_number,'in concept')) title,
   coalesce(i.issued_on,(i.created_at at time zone tenant.timezone)::date) issued_on,i.updated_at,i.total_cents,i.paid_cents,i.version,
   i.status::text status,i.pdf_storage_path is not null pdf_available,
   i.finalized_at is not null and i.status in('final','sent','partially_paid','overdue') and i.total_cents>i.paid_cents unpaid,
   i.finalized_at is not null and i.status in('final','sent','partially_paid','overdue') and i.total_cents>i.paid_cents and i.due_on<v_today overdue
  from public.invoices i join public.customers c on c.tenant_id=i.tenant_id and c.id=i.customer_id
  join public.tenants tenant on tenant.id=i.tenant_id
  where i.tenant_id=t
 ), source_rows as materialized(
  select s.* from private.execution_invoice_sources(t) s where v_sources
 ), concepts as(
  select 'concept'::text kind,s.work_order_id id,s.customer_id,c.name customer,s.work_order_number number,s.title,
   v_today issued_on,s.updated_at,sum(s.subtotal_cents+s.vat_cents)::bigint total_cents,0::bigint paid_cents,s.order_version version,
   'concept'::text status,true pdf_available,false unpaid,false overdue
  from source_rows s join public.customers c on c.tenant_id=t and c.id=s.customer_id
  group by s.work_order_id,s.customer_id,c.name,s.work_order_number,s.title,s.updated_at,s.order_version
 ), all_rows as materialized(select * from actual union all select * from concepts),
 selected as materialized(
  select s.* from all_rows s where
   (v_stage='all' or(v_stage='unpaid' and s.unpaid)or(v_stage='concepts' and s.kind='concept')or(v_stage='paid' and s.status='paid'))
   and(v_status='' or(v_status='overdue' and s.overdue)or(v_status='sent' and s.unpaid and not s.overdue)or(v_status not in('overdue','sent') and s.status=v_status))
   and(v_query='' or concat_ws(' ',s.number,s.title,s.customer) ilike '%'||replace(replace(replace(v_query,'\','\\'),'%','\%'),'_','\_')||'%')
 ), bounds as(select count(*) n,least(v_page,greatest(1,ceil(count(*)::numeric/v_size)::integer)) p from selected),
 paged as(
  select s.* from selected s order by
   case when v_sort='date' then s.issued_on end asc,case when v_sort='date_desc' then s.issued_on end desc,
   case when v_sort='amount' then s.total_cents end asc,case when v_sort='amount_desc' then s.total_cents end desc,
   case when v_sort='number' then s.number when v_sort='customer' then s.customer when v_sort='status' then s.status end asc,
   s.updated_at desc,s.kind,s.id limit v_size offset((select p from bounds)-1)*v_size
 )
 select jsonb_build_object('rows',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'kind',p.kind,'number',p.number,'title',p.title,'customerId',p.customer_id,'customer',p.customer,'date',p.issued_on,'version',p.version,'status',p.status,'totalCents',p.total_cents,'paidCents',p.paid_cents,'outstandingCents',case when p.unpaid then p.total_cents-p.paid_cents else 0 end,'overdue',p.overdue,'pdfAvailable',p.pdf_available,'unpaid',p.unpaid)
  order by case when v_sort='date' then p.issued_on end asc,case when v_sort='date_desc' then p.issued_on end desc,case when v_sort='amount' then p.total_cents end asc,case when v_sort='amount_desc' then p.total_cents end desc,case when v_sort='number' then p.number when v_sort='customer' then p.customer when v_sort='status' then p.status end asc,p.updated_at desc,p.kind,p.id) from paged p),'[]'::jsonb),
  'total',b.n,'page',b.p,'pageSize',v_size,'today',v_today,'canSources',v_sources,
  'counts',jsonb_build_object('unpaid',coalesce((select sum(a.total_cents-a.paid_cents) from actual a where a.unpaid),0),'overdue',coalesce((select sum(a.total_cents-a.paid_cents) from actual a where a.overdue),0),'confirmed',case when v_sources then coalesce((select sum(s.subtotal_cents+s.vat_cents) from source_rows s),0)else null end)) into result from bounds b;
 return result;
end $function$;

CREATE OR REPLACE FUNCTION public.cockpit_invoice_list (
  target_tenant uuid,
  filters       jsonb DEFAULT '{}'::jsonb
)
  RETURNS jsonb
  LANGUAGE sql
  STABLE
  SET search_path TO ''
  AS $function$ select private.cockpit_invoice_list(target_tenant,filters);$function$;

REVOKE ALL ON FUNCTION "private"."cockpit_invoice_list"(uuid, jsonb) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."cockpit_invoice_list"(uuid, jsonb) TO "authenticated", "postgres";

REVOKE ALL ON FUNCTION "public"."cockpit_invoice_list"(uuid, jsonb) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."cockpit_invoice_list"(uuid, jsonb) TO "authenticated", "postgres";

