SET local check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.commercial_list (
  target_tenant uuid,
  filters       jsonb DEFAULT '{}'::jsonb
)
  RETURNS jsonb
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare today date;result jsonb;v_page integer:=greatest(1,least(coalesce((filters->>'page')::integer,1),100000));v_size integer:=greatest(10,least(100,coalesce((filters->>'pageSize')::integer,25)));v_tab text:=coalesce(filters->>'tab','requests');v_sort text:=coalesce(filters->>'sort','attention');
begin
 perform private.management_assert(target_tenant,'backoffice.commercial.read');
 perform private.management_assert(target_tenant,'backoffice.functions.commercial_list');

 if not private.commercial_member(target_tenant) then raise exception 'Geen commerciële toegang' using errcode='42501';end if;
 if v_tab not in ('all','requests','quotes') or v_sort not in ('attention','updated','number','customer','amount','expires') then raise exception 'Ongeldige lijstoptie' using errcode='23514';end if;
 select(now() at time zone timezone)::date into today from public.tenants where id=target_tenant;
 with base as materialized(select value as x from private.commercial_rows(target_tenant) value
  where (coalesce(filters->>'customer','')='' or value->>'customer_id'=filters->>'customer') and (coalesce(filters->>'object','')='' or value->>'object_id'=filters->>'object')
  and (coalesce(filters->>'work_kind','')='' or value->>'work_kind'=filters->>'work_kind') and(coalesce(filters->>'source','')='' or value->>'source'=filters->>'source')
  and(coalesce(filters->>'owner','')='' or value->>'owner_id'=filters->>'owner') and(coalesce(filters->>'priority','')='' or value->>'priority'=filters->>'priority')
  and (coalesce(filters->>'from','')='' or (value->>'created_at')::timestamptz>=(filters->>'from')::date::timestamp at time zone(select timezone from public.tenants where id=target_tenant))
  and (coalesce(filters->>'until','')='' or (value->>'created_at')::timestamptz<((filters->>'until')::date+1)::timestamp at time zone(select timezone from public.tenants where id=target_tenant))
  and (coalesce(filters->>'archived','')='yes' or value->>'archived_at' is null)
  and (coalesce(filters->>'q','')='' or strpos(lower(concat_ws(' ',value->>'number',value->>'subject',value->>'customer',value->>'object',value#>>'{address,street}',value#>>'{address,postal_code}',value#>>'{address,city}')),lower(left(filters->>'q',200)))>0)),
 marked as(select x,(x->>'tab'='requests' and x->>'status'='new') is_new,
  (x->>'tab'='quotes' and x->>'status'='awaiting_acceptance' and (x->>'followup_on')::date<=today) followup,
  (x->>'tab'='quotes' and x->>'status'='awaiting_acceptance' and (x->>'expires_at')::timestamptz>now() and ((x->>'expires_at')::timestamptz at time zone(select timezone from public.tenants where id=target_tenant))::date<=today+3) expiring,
  (x->>'tab'='quotes' and x->>'status'='accepted' and x->>'operation_id' is null) convert from base),
 filtered as (select * from marked where (v_tab='all' or x->>'tab'=v_tab) and(coalesce(filters->>'status','')='' or x->>'status'=filters->>'status')
  and(coalesce(filters->>'operation','')='' or filters->>'operation'='none' and x->>'operation_id' is null or filters->>'operation'='unplanned' and x->>'operation_id' is not null and coalesce((x->>'planned')::boolean,false)=false or filters->>'operation'='planned' and (x->>'planned')::boolean)
  and(case coalesce(filters->>'attention','') when '' then true when 'new' then is_new when 'followup' then followup when 'expiring' then expiring when 'convert' then convert when 'overdue' then (x->>'followup_on')::date<=today else false end)),
 ordered as(select x from filtered order by
  case when v_sort='attention' then coalesce((x->>'followup_on')::date,'infinity') end asc,
  case when v_sort='number' then x->>'number' when v_sort='customer' then x->>'customer' end asc,
  case when v_sort='amount' then (x->>'subtotal_cents')::bigint end desc,
  case when v_sort='expires' then(x->>'expires_at')::timestamptz end asc nulls last,
  (x->>'updated_at')::timestamptz desc,x->>'id' asc,x->>'source_kind' asc
  limit v_size offset(v_page-1)*v_size)
 select jsonb_build_object('rows',coalesce((select jsonb_agg(x) from ordered),'[]'),'total',(select count(*) from filtered),'page',v_page,'page_size',v_size,'today',today,
 'counts',jsonb_build_object('new',(select count(*) from marked where is_new),'followup',(select count(*) from marked where followup),'expiring',(select count(*) from marked where expiring),'convert',(select count(*) from marked where convert))) into result;
 return result;
end $function$;

