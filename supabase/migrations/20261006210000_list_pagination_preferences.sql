-- Preserve existing list access, projection, filters and sort contracts; paginate at the database with a bounded selected size.

CREATE OR REPLACE FUNCTION public.customer_list (
  target_tenant uuid,
  filters       jsonb DEFAULT '{}'::jsonb
)
  RETURNS jsonb
  LANGUAGE plpgsql
  STABLE
  SET search_path TO ''
  AS $function$
declare result jsonb; page_size integer:=greatest(10,least(100,coalesce((filters->>'pageSize')::integer,25))); page_no integer:=greatest(1,least(100000,coalesce((filters->>'page')::int,1))); sort_key text:=coalesce(filters->>'sort','name'); finance boolean:=private.commercial_access(target_tenant) and private.service_enabled(target_tenant,'finance');
begin
 if not private.customer_manage(target_tenant) then raise exception 'Geen toegang tot klanten' using errcode='42501';end if;
 with source as (
  select c.id,c.customer_number,c.name,c.customer_type,c.status,c.version,c.owner_user_id,
  coalesce(nullif(c.visit_address->>'city',''),c.billing_address->>'city','') city,
  (select full_name from public.customer_contacts cc where cc.tenant_id=c.tenant_id and cc.customer_id=c.id and cc.active and (cc.active_from is null or cc.active_from<=(now() at time zone (select timezone from public.tenants where id=target_tenant))::date) and (cc.active_until is null or cc.active_until>=(now() at time zone (select timezone from public.tenants where id=target_tenant))::date) order by cc.is_primary desc,cc.created_at,cc.id limit 1) contact,
  (select count(*) from public.objects o where o.tenant_id=c.tenant_id and o.customer_id=c.id and o.dossier_status='active') objects,
  (select min(w.projected_start_at) from public.work_orders w where w.tenant_id=c.tenant_id and w.customer_id=c.id and w.status not in ('cancelled','completed','approved','invoiced') and w.projected_start_at>=now()) next_visit,
  (select count(*) from public.requests r where r.tenant_id=c.tenant_id and r.customer_id=c.id and r.archived_at is null and r.status in ('new','review','waiting_info')) requests,
  (select count(*) from public.customer_notes n where n.tenant_id=c.tenant_id and n.customer_id=c.id and n.state='open' and n.kind='action') actions,
  case when finance then (select count(*) from public.invoices i where i.tenant_id=c.tenant_id and i.customer_id=c.id and i.status not in ('draft','paid','void','credited') and i.total_cents>i.paid_cents) else null end financial_attention,
  c.services,c.email,c.billing_email,c.phone
  from public.customers c where c.tenant_id=target_tenant
 ), filtered as (
  select * from source s where
  (coalesce(filters->>'q','')='' or concat_ws(' ',s.name,s.customer_number,s.city,s.email,s.billing_email,s.phone,s.contact) ilike '%'||replace(replace(filters->>'q','%','\%'),'_','\_')||'%')
  and (coalesce(filters->>'status','')='' or s.status=filters->>'status')
  and (coalesce(filters->>'type','')='' or s.customer_type=filters->>'type')
  and (coalesce(filters->>'city','')='' or s.city ilike '%'||(filters->>'city')||'%')
  and (coalesce(filters->>'owner','')='' or s.owner_user_id::text=filters->>'owner')
  and (coalesce(filters->>'service','')='' or filters->>'service'=any(s.services))
  and (coalesce(filters->>'attention','')='' or (filters->>'attention'='objects' and s.objects>0) or (filters->>'attention'='requests' and s.requests>0) or (filters->>'attention'='actions' and s.actions>0) or (filters->>'attention'='finance' and s.financial_attention>0)
   or (filters->>'attention'='commercial' and exists(select 1 from public.quotes q where q.tenant_id=target_tenant and q.customer_id=s.id and q.archived_at is null and q.status='awaiting_acceptance' and q.followup_on<=(now() at time zone (select timezone from public.tenants where id=target_tenant))::date)))
 ), paged as (
 select * from filtered order by
 case when sort_key='name' then lower(name) end asc,case when sort_key='name_desc' then lower(name) end desc,
 case when sort_key='number' then customer_number end,case when sort_key='city' then city end,
 case when sort_key='status' then status end,case when sort_key='next_visit' then next_visit end,
 case when sort_key='attention' then actions+requests end desc,id limit page_size offset (page_no-1)*page_size
 ) select jsonb_build_object('rows',coalesce((select jsonb_agg(to_jsonb(p)-'services'-'email'-'billing_email'-'phone') from paged p),'[]'), 'total',(select count(*) from filtered),'page',page_no,'pageSize',page_size,'finance',finance) into result;
 return result;
end $function$;

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
 if not private.commercial_member(target_tenant) then raise exception 'Geen commerciële toegang' using errcode='42501';end if;
 if v_tab not in ('requests','quotes') or v_sort not in ('attention','updated','number','customer','amount','expires') then raise exception 'Ongeldige lijstoptie' using errcode='23514';end if;
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
 filtered as (select * from marked where x->>'tab'=v_tab and(coalesce(filters->>'status','')='' or x->>'status'=filters->>'status')
  and(coalesce(filters->>'operation','')='' or filters->>'operation'='none' and x->>'operation_id' is null or filters->>'operation'='unplanned' and x->>'operation_id' is not null and coalesce((x->>'planned')::boolean,false)=false or filters->>'operation'='planned' and (x->>'planned')::boolean)
  and(case coalesce(filters->>'attention','') when '' then true when 'new' then is_new when 'followup' then followup when 'expiring' then expiring when 'convert' then convert when 'overdue' then (x->>'followup_on')::date<=today else false end)),
 ordered as(select x from filtered order by
  case when v_sort='attention' then coalesce((x->>'followup_on')::date,'infinity') end asc,
  case when v_sort='number' then x->>'number' when v_sort='customer' then x->>'customer' end asc,
  case when v_sort='amount' then (x->>'subtotal_cents')::bigint end desc,
  case when v_sort='expires' then(x->>'expires_at')::timestamptz end asc nulls last,
  (x->>'updated_at')::timestamptz desc,x->>'id' asc
  limit v_size offset(v_page-1)*v_size)
 select jsonb_build_object('rows',coalesce((select jsonb_agg(x) from ordered),'[]'),'total',(select count(*) from filtered),'page',v_page,'page_size',v_size,'today',today,
 'counts',jsonb_build_object('new',(select count(*) from marked where is_new),'followup',(select count(*) from marked where followup),'expiring',(select count(*) from marked where expiring),'convert',(select count(*) from marked where convert))) into result;
 return result;
end $function$;

CREATE OR REPLACE FUNCTION public.work_order_list (
  target_tenant uuid,
  filters       jsonb DEFAULT '{}'::jsonb
)
  RETURNS jsonb
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare fin boolean; page_size integer:=greatest(10,least(100,coalesce((filters->>'pageSize')::integer,25)));page_n int:=greatest(1,least(100000,coalesce((filters->>'page')::int,1)));q text:=coalesce(filters->>'q','');sorting text:=coalesce(filters->>'sort','date');result jsonb;
begin
 if not private.work_order_access(target_tenant) then raise exception 'Geen toegang tot werkbonnen' using errcode='42501';end if;
 fin:=private.work_order_access(target_tenant,true);
 if length(q)>200 or sorting not in ('date','date_desc','number','title','customer','status') then raise exception 'Ongeldige zoekopdracht' using errcode='23514';end if;
 with filtered as materialized(
 select w.id,w.projected_start_at,w.created_at,private.work_order_row(w.id,fin) row from public.work_orders w join public.customers c on c.id=w.customer_id join public.objects o on o.id=w.object_id
 where w.tenant_id=target_tenant and ((filters->>'archived'='yes' and w.archive_at is not null) or (coalesce(filters->>'archived','')<>'yes' and w.archive_at is null))
 and (q='' or concat_ws(' ',w.work_order_number,w.title,w.discipline,c.name,o.name,o.address->>'street',o.address->>'postal_code',o.address->>'city',w.details->>'customerReference') ilike '%'||replace(replace(replace(q,'\','\\'),'%','\%'),'_','\_')||'%')
 and (coalesce(filters->>'customer','')='' or w.customer_id=(filters->>'customer')::uuid) and (coalesce(filters->>'object','')='' or w.object_id=(filters->>'object')::uuid)
 and (coalesce(filters->>'employee','')='' or exists(select 1 from public.work_order_assignments a where a.work_order_id=w.id and a.personnel_id=(filters->>'employee')::uuid and a.status not in ('cancelled','returned')))
 and (coalesce(filters->>'discipline','')='' or w.discipline=filters->>'discipline') and (coalesce(filters->>'priority','')='' or w.priority=filters->>'priority') and (coalesce(filters->>'source','')='' or w.source_kind=filters->>'source')
 and (coalesce(filters->>'from','')='' or (w.projected_start_at at time zone (select timezone from public.tenants where id=target_tenant))::date>=(filters->>'from')::date)
 and (coalesce(filters->>'to','')='' or (w.projected_start_at at time zone (select timezone from public.tenants where id=target_tenant))::date<=(filters->>'to')::date)
 ), flagged as materialized(select * from filtered where
 (coalesce(filters->>'report','')='' or row->>'reportState'=filters->>'report') and
 (coalesce(filters->>'planning','')='' or row->>'planningState'=filters->>'planning') and (coalesce(filters->>'execution','')='' or row->>'status'=filters->>'execution') and (coalesce(filters->>'billing','')='' or fin and row->>'billingState'=filters->>'billing') and
 (coalesce(filters->>'exception','')='' or (filters->>'exception'='crew' and (row->>'assignedPersonnel')::int<(row->>'requiredPersonnel')::int) or (filters->>'exception'='signature' and row->>'signatureState'='waiting') or (filters->>'exception'='remaining' and exists(select 1 from public.work_order_tasks t where t.work_order_id=filtered.id and t.execution_state in ('partial','not_done'))) or (filters->>'exception'='blocked' and row->>'status'='returned'))
 ), selected as(select * from flagged where coalesce(filters->>'view','all')='all' or row->>'category'=filters->>'view'), paged as(
 select * from selected order by
 case when sorting='date' then projected_start_at end asc nulls last,case when sorting='date_desc' then projected_start_at end desc nulls last,
 case when sorting='number' then row->>'number' when sorting='title' then row->>'title' when sorting='customer' then row->>'customer' when sorting='status' then row->>'status' end asc,
 created_at desc,id limit page_size offset (page_n-1)*page_size
 ) select jsonb_build_object('rows',coalesce((select jsonb_agg(row) from paged),'[]'),'total',(select count(*) from selected),'page',page_n,'pageSize',page_size,'finance',fin,
 'canManage',private.has_role(target_tenant,array['tenant_admin','management','planner']::public.app_role[]),
 'counts',jsonb_build_object('all',(select count(*) from flagged),'unassigned',(select count(*) from flagged where row->>'category'='unassigned'),'planned',(select count(*) from flagged where row->>'category'='planned'),'running',(select count(*) from flagged where row->>'category'='running'),'handling',(select count(*) from flagged where row->>'category'='handling'),'completed',(select count(*) from flagged where row->>'category'='completed'))) into result;
 return result;
end $function$;
