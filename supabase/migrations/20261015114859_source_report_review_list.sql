SET local check_function_bodies = off;

CREATE OR REPLACE FUNCTION private.cockpit_report_review_list (
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
 v jsonb:=coalesce(filters,'{}'::jsonb);v_query text;v_report_status text;v_stage text;v_sorting text;v_page_number integer;v_page_size integer;result jsonb;
begin
 perform private.cockpit_assert(t,'backoffice.reports.read');
 perform private.cockpit_assert(t,'backoffice.work_orders.read');
 perform private.cockpit_assert(t,'backoffice.functions.cockpit_report_review_list');
 if not private.service_enabled(t,'rapportage') or not private.report_backoffice(t) then
  raise exception 'Geen rapporttoegang.' using errcode='42501';
 end if;
 if jsonb_typeof(v)<>'object' or v-array['q','status','stage','sort','page','pageSize']<>'{}'::jsonb then
  raise exception 'Ongeldige rapportselectie.' using errcode='22023';
 end if;
 if exists(select 1 from jsonb_each(v) e where e.key in ('q','status','stage','sort') and jsonb_typeof(e.value)<>'string')
 or exists(select 1 from jsonb_each(v) e where e.key in ('page','pageSize') and (jsonb_typeof(e.value)<>'number' or e.value::text !~ '^[0-9]{1,6}$')) then
  raise exception 'Ongeldige rapportselectie.' using errcode='22023';
 end if;
 v_query:=coalesce(v->>'q','');v_report_status:=coalesce(v->>'status','');v_stage:=coalesce(v->>'stage','');v_sorting:=coalesce(v->>'sort','date_desc');
 v_page_number:=coalesce((v->>'page')::integer,1);v_page_size:=coalesce((v->>'pageSize')::integer,25);
 if length(v_query)>200 or v_report_status not in ('','draft','waiting_signature','review','correction','approved') or v_stage not in ('','open','processed')
 or v_sorting not in ('date','date_desc','number','customer','status') or v_page_number<1 or v_page_number>100000 or v_page_size<10 or v_page_size>100 then
  raise exception 'Ongeldige rapportselectie.' using errcode='22023';
 end if;
 with selected as materialized(
  select w.id,w.updated_at,w.work_order_number,c.name customer,w.report_state
  from public.work_orders w join public.customers c on c.id=w.customer_id and c.tenant_id=w.tenant_id
  join public.objects o on o.id=w.object_id and o.tenant_id=w.tenant_id
  where w.tenant_id=t and w.archive_at is null
  and (w.report_state in ('waiting_signature','review','correction','approved') or w.status in ('completed','under_review','correction_required','returned','approved','invoice_ready','invoiced'))
  and (v_query='' or concat_ws(' ',w.work_order_number,w.title,w.discipline,c.name,o.name) ilike '%'||replace(replace(replace(v_query,'\','\\'),'%','\%'),'_','\_')||'%')
  and (v_report_status='' or w.report_state::text=v_report_status)
  and (v_stage='' or (v_stage='processed')=(w.report_state='approved' or w.status in ('approved','invoice_ready','invoiced')))
 ), total as(select count(*) n from selected), bounds as(
  select n,least(v_page_number,greatest(1,ceil(n::numeric/v_page_size)::integer)) p from total
 ), paged as(
  select s.* from selected s order by
   case when v_sorting='date' then s.updated_at end asc,
   case when v_sorting='date_desc' then s.updated_at end desc,
   case when v_sorting='number' then s.work_order_number when v_sorting='customer' then s.customer when v_sorting='status' then s.report_state::text end asc,
   s.updated_at desc,s.id
  limit v_page_size offset ((select p from bounds)-1)*v_page_size
 )
 select jsonb_build_object('rows',coalesce((select jsonb_agg(private.work_order_row(p.id,false)||jsonb_build_object(
  'updatedAt',p.updated_at,'reportVersion',w.report_version,
  'legacy',not exists(select 1 from public.work_order_report_versions rv where rv.work_order_id=p.id and rv.tenant_id=t))
  order by case when v_sorting='date' then p.updated_at end asc,case when v_sorting='date_desc' then p.updated_at end desc,
  case when v_sorting='number' then p.work_order_number when v_sorting='customer' then p.customer when v_sorting='status' then p.report_state::text end asc,p.updated_at desc,p.id)
  from paged p join public.work_orders w on w.id=p.id),'[]'::jsonb),'total',b.n,'page',b.p,'pageSize',v_page_size)
 into result from bounds b;
 return result;
end
$function$;

CREATE OR REPLACE FUNCTION public.cockpit_report_review_list (
  target_tenant uuid,
  filters       jsonb DEFAULT '{}'::jsonb
)
  RETURNS jsonb
  LANGUAGE sql
  STABLE
  SET search_path TO ''
  AS $function$ select private.cockpit_report_review_list(target_tenant,filters); $function$;

CREATE INDEX work_order_report_review_recent ON public.work_orders USING btree (tenant_id, updated_at DESC, id)
  WHERE
    ((archive_at IS NULL) AND ((report_state = ANY (ARRAY['waiting_signature'::text, 'review'::text, 'correction'::text, 'approved'::text])) OR (status = ANY
    (ARRAY['completed'::public.work_order_status, 'under_review'::public.work_order_status, 'correction_required'::public.work_order_status, 'returned'::public.work_order_status,
    'approved'::public.work_order_status, 'invoice_ready'::public.work_order_status, 'invoiced'::public.work_order_status]))));

REVOKE ALL ON FUNCTION "private"."cockpit_report_review_list"(uuid, jsonb) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."cockpit_report_review_list"(uuid, jsonb) TO "authenticated", "postgres";

REVOKE ALL ON FUNCTION "public"."cockpit_report_review_list"(uuid, jsonb) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."cockpit_report_review_list"(uuid, jsonb) TO "authenticated", "postgres";

