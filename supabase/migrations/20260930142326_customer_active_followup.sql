SET local check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.customer_list (
  target_tenant uuid,
  filters       jsonb DEFAULT '{}'::jsonb
)
  RETURNS jsonb
  LANGUAGE plpgsql
  STABLE
  SET search_path TO ''
  AS $function$
declare result jsonb; page_no integer:=greatest(1,least(100000,coalesce((filters->>'page')::int,1))); sort_key text:=coalesce(filters->>'sort','name'); finance boolean:=private.commercial_access(target_tenant) and private.service_enabled(target_tenant,'finance');
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
 case when sort_key='attention' then actions+requests end desc,id limit 25 offset (page_no-1)*25
 ) select jsonb_build_object('rows',coalesce((select jsonb_agg(to_jsonb(p)-'services'-'email'-'billing_email'-'phone') from paged p),'[]'), 'total',(select count(*) from filtered),'page',page_no,'finance',finance) into result;
 return result;
end $function$;
