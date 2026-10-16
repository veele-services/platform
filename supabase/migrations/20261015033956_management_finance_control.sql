-- One authoritative allocation/pricing projection. The existing invoice
-- composer and the new management view consume exactly these same source rows.
create function private.execution_invoice_sources(target_tenant uuid,target_order uuid default null)
returns table(task_id uuid,work_order_id uuid,customer_id uuid,work_order_number text,title text,order_version bigint,report_version integer,updated_at timestamptz,created_at timestamptz,description text,quantity numeric,original_quantity numeric,allocated_quantity numeric,unit text,unit_price_cents bigint,vat_basis_points integer,subtotal_cents bigint,vat_cents bigint)
language plpgsql stable security definer set search_path='' as $$
#variable_conflict use_column
begin
 -- Pure internal projection: no direct execution grants. Human-facing callers
 -- retain their existing fresh authorization; bounded service jobs need no
 -- fabricated owner session to measure the very same financial source.
 return query
 with sources as (
  select t.*,w.customer_id,w.work_order_number,w.title,w.version order_version,w.report_version,w.updated_at,
   used.quantity allocated_quantity,coalesce(t.executed_quantity,t.quantity)-used.quantity remaining
  from public.work_order_tasks t
  join public.work_orders w on w.tenant_id=t.tenant_id and w.id=t.work_order_id
  cross join lateral (select coalesce(sum(l.quantity),0) quantity from public.invoice_lines l
   where l.tenant_id=t.tenant_id and l.work_order_id=t.work_order_id
    and coalesce(l.work_order_task_id::text,l.source_snapshot->>'work_order_task_id')=t.id::text) used
  where t.tenant_id=target_tenant and (target_order is null or w.id=target_order)
   and w.status='invoice_ready' and w.report_state='approved' and w.archive_at is null
   and t.completed_at is not null and t.unit_price_cents>0
   and (not t.is_extra_work or t.extra_work_status='approved')
   and coalesce(t.commercial_snapshot->>'price_basis','') not in ('week','month')
   and coalesce(t.executed_quantity,t.quantity)>used.quantity
   and not exists(select 1 from public.object_visit_requests r where r.tenant_id=t.tenant_id and r.work_order_task_id=t.id and r.needs_review)
   and not exists(select 1 from public.object_request_proposals p join public.object_visit_requests r on r.tenant_id=p.tenant_id and r.id=p.request_id
    where r.tenant_id=t.tenant_id and r.work_order_task_id=t.id and p.accepted_at is not null
     and p.version=(select max(p2.version) from public.object_request_proposals p2 where p2.tenant_id=p.tenant_id and p2.request_id=p.request_id and p2.accepted_at is not null)
     and (t.quantity<>p.quantity or t.unit_price_cents<>p.price_cents or t.task_revision_id is distinct from p.task_revision_id))
   and not exists(select 1 from public.invoice_lines l where l.tenant_id=t.tenant_id and l.work_order_id=t.work_order_id and l.work_order_task_id is null
    and not exists(select 1 from public.work_order_tasks old where old.tenant_id=l.tenant_id and old.work_order_id=l.work_order_id and old.id::text=l.source_snapshot->>'work_order_task_id'))
 ), amounts as (
  select sources.*,case when commercial_snapshot ? 'quote_id' then
   round((allocated_quantity+remaining)*(commercial_snapshot#>>'{line,net_cents}')::numeric/(commercial_snapshot#>>'{line,quantity}')::numeric)
    -round(allocated_quantity*(commercial_snapshot#>>'{line,net_cents}')::numeric/(commercial_snapshot#>>'{line,quantity}')::numeric)
   else round(remaining*unit_price_cents) end subtotal
  from sources
 ), rate_groups as (
  select amounts.*,coalesce(sum(subtotal) over(partition by work_order_id,vat_basis_points order by created_at,id rows between unbounded preceding and 1 preceding),0) prior_subtotal
  from amounts
 ), priced as (
  select rate_groups.*,round((prior_subtotal+subtotal)*vat_basis_points/10000.0)-round(prior_subtotal*vat_basis_points/10000.0) vat
  from rate_groups
 )
 select p.id,p.work_order_id,p.customer_id,p.work_order_number,p.title,p.order_version,p.report_version,p.updated_at,p.created_at,
  case when p.commercial_snapshot ? 'quote_id' then p.task_name||case when coalesce((p.commercial_snapshot#>>'{line,discount_basis_points}')::integer,0)>0 then ' (incl. '||((p.commercial_snapshot#>>'{line,discount_basis_points}')::numeric/100)::text||'% korting)' else '' end else p.task_code||' · '||p.task_name end,
  p.remaining,coalesce(p.executed_quantity,p.quantity),p.allocated_quantity,p.unit,p.unit_price_cents,p.vat_basis_points,p.subtotal::bigint,p.vat::bigint from priced p;
end$$;
revoke all on function private.execution_invoice_sources(uuid,uuid) from public,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.execution_invoice_concepts(target_tenant uuid, target_order uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare result jsonb;
begin
 perform private.management_assert(target_tenant,'backoffice.finance.read');
 perform private.management_assert(target_tenant,'backoffice.functions.execution_invoice_concepts');

 if not private.object_session_active() or not private.commercial_access(target_tenant) or not private.service_enabled(target_tenant,'finance') then
  raise exception 'Financiële toegang vereist' using errcode='42501';
 end if;
 if target_order is not null and not exists(select 1 from public.work_orders where tenant_id=target_tenant and id=target_order) then
  raise exception 'Concept niet beschikbaar' using errcode='P0002';
 end if;
 with candidates as (
 select work_order_id,customer_id,work_order_number,title,order_version,report_version,updated_at,
  sum(subtotal_cents)::bigint subtotal,sum(vat_cents)::bigint vat,sum(subtotal_cents+vat_cents)::bigint total,
  jsonb_agg(jsonb_build_object('taskId',task_id,'description',description,'quantity',quantity,'unit',unit,'unitPriceCents',unit_price_cents,'vatBasisPoints',vat_basis_points,'subtotalCents',subtotal_cents,'vatCents',vat_cents,'totalCents',subtotal_cents+vat_cents) order by created_at,task_id) lines
 from private.execution_invoice_sources(target_tenant,target_order)
 group by work_order_id,customer_id,work_order_number,title,order_version,report_version,updated_at
 )
 select coalesce(jsonb_agg(jsonb_build_object('id',s.work_order_id,'customerId',s.customer_id,'number',s.work_order_number,'title',s.title,
   'version',s.order_version,'reportVersion',s.report_version,'updatedAt',s.updated_at,'issuedOn',(clock_timestamp() at time zone tenant.timezone)::date,
   'dueOn',(clock_timestamp() at time zone tenant.timezone)::date+coalesce((select payment_terms_days from public.tenant_settings where tenant_id=target_tenant),14),
   'customer',jsonb_build_object('name',customer.name,'legalName',customer.legal_name,'companyNumber',customer.company_number,'vatNumber',customer.vat_number,'email',coalesce(customer.billing_email,customer.email),'phone',customer.phone,'billingAddress',customer.billing_address,'billingPreferences',customer.billing_preferences),
   'branding',jsonb_build_object('tenant_name',tenant.name,'primary_color',brand.primary_color,'accent_color',brand.accent_color,
    'logo_path',brand.logo_path,'sender_email',brand.sender_email,'pdf_footer',brand.pdf_footer),
   'lines',s.lines,'subtotalCents',s.subtotal,'vatCents',s.vat,'totalCents',s.total) order by s.updated_at desc,s.work_order_id),'[]') into result
 from candidates s join public.tenants tenant on tenant.id=target_tenant and tenant.status='active'
 join public.customers customer on customer.tenant_id=target_tenant and customer.id=s.customer_id
 left join public.tenant_branding brand on brand.tenant_id=target_tenant;
 return result;
end $function$
;

create index cockpit_invoice_task_allocation on public.invoice_lines(tenant_id,work_order_id,(coalesce(work_order_task_id::text,source_snapshot->>'work_order_task_id')));
insert into public.permission_catalog(key,domain,name,description,module,action,scopes,dependencies)
values('backoffice.functions.cockpit_finance_query','tenant','Omzetbewaking lezen','De bestaande factureerbare bronhoeveelheden, financiële controles en openstaande facturen.','finance','read',array['tenant'],array['backoffice.access','backoffice.finance.read','backoffice.functions.execution_invoice_concepts']),
 ('backoffice.functions.cockpit_finance_command','tenant','Financiële broncontrole vastleggen','Vaste prijs onderbouwen of de oorspronkelijke rapportcontrole uitvoeren, binnen de bestaande bronrechten.','finance','write',array['tenant'],array['backoffice.finance.write','backoffice.functions.cockpit_finance_query']) on conflict(key) do nothing;
insert into private.management_role_permissions(tenant_id,role_id,capability)
select r.tenant_id,r.id,c.key from private.management_roles r join public.permission_catalog c on c.key in('backoffice.functions.cockpit_finance_query','backoffice.functions.cockpit_finance_command')
where r.code='owner' or exists(select 1 from private.management_role_permissions p where p.role_id=r.id and p.capability=case when c.action='write' then 'backoffice.finance.write' else 'backoffice.finance.read' end) on conflict do nothing;

create table private.cockpit_finance_reviews(
 id uuid primary key default gen_random_uuid(),tenant_id uuid not null references public.tenants(id),
 work_order_id uuid not null,task_id uuid not null,source_fingerprint text not null check(source_fingerprint~'^[a-f0-9]{64}$'),
 outcome text not null check(outcome in('billable','included')),reason text not null check(length(btrim(reason)) between 3 and 4000),
 before_snapshot jsonb not null,result_snapshot jsonb not null,created_by uuid not null references auth.users(id),created_at timestamptz not null default clock_timestamp(),
 foreign key(tenant_id,work_order_id) references public.work_orders(tenant_id,id),foreign key(tenant_id,task_id) references public.work_order_tasks(tenant_id,id),unique(tenant_id,task_id,source_fingerprint)
);
alter table private.cockpit_finance_reviews enable row level security;
alter table private.cockpit_finance_reviews force row level security;
revoke all on private.cockpit_finance_reviews from public,anon,authenticated,service_role;
create index cockpit_finance_reviews_history on private.cockpit_finance_reviews(tenant_id,task_id,created_at desc,id);
create function private.cockpit_finance_review_immutable() returns trigger language plpgsql set search_path='' as $$
begin raise exception 'Een financiële controle wordt niet overschreven. Leg een nieuwe broncontrole vast.' using errcode='23514';end$$;
revoke all on function private.cockpit_finance_review_immutable() from public,anon,authenticated,service_role;
create trigger cockpit_finance_review_immutable before update or delete on private.cockpit_finance_reviews for each row execute function private.cockpit_finance_review_immutable();

create function private.cockpit_finance_assert(t uuid,writing boolean default false) returns void language plpgsql stable security definer set search_path='' as $$
begin
 perform private.management_assert(t,'backoffice.finance.read');perform private.management_assert(t,'backoffice.functions.execution_invoice_concepts');perform private.management_assert(t,'backoffice.functions.cockpit_finance_query');
 if not private.object_session_active() or not private.commercial_access(t) or not private.service_enabled(t,'finance') then raise exception 'Actuele financiële toegang vereist.' using errcode='42501';end if;
 if writing then perform private.management_assert(t,'backoffice.finance.write');perform private.management_assert(t,'backoffice.functions.cockpit_finance_command');end if;
end$$;
revoke all on function private.cockpit_finance_assert(uuid,boolean) from public,anon,authenticated,service_role;

-- A source fingerprint protects the actual report, proposal, price and allocated
-- quantities. It is not an approval supplied by a browser. This pure projection
-- is private and reused by the source-owned maintenance job.
create function private.cockpit_finance_task_rows(t uuid,target_order uuid default null) returns setof jsonb language sql stable security definer set search_path='' as $$
 with eligible as materialized(select * from private.execution_invoice_sources(t,target_order)),
 facts as materialized(
 select task.id,task.work_order_id,w.work_order_number,w.customer_id,c.name customer,w.object_id,w.status,w.archive_at,w.version order_version,w.report_version,w.report_state,
  task.task_code||' · '||task.task_name description,task.unit,task.unit_price_cents,task.vat_basis_points,coalesce(task.executed_quantity,task.quantity) quantity,used.quantity invoiced,
  coalesce(task.commercial_snapshot->>'price_basis','visit') price_basis,task.is_extra_work,task.extra_work_status,r.id report_id,r.state report_version_state,r.content_hash,
  jsonb_build_object('task',to_jsonb(task),'orderVersion',w.version,'reportVersion',w.report_version,'reportState',w.report_state,'reportId',r.id,'reportHash',r.content_hash,'reportVersionState',r.state,'allocated',used.quantity,
   'requests',coalesce((select jsonb_agg(jsonb_build_object('id',v.id,'version',v.version,'needsReview',v.needs_review) order by v.id) from public.object_visit_requests v where v.tenant_id=t and v.work_order_task_id=task.id),'[]'),
   'acceptedProposals',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'version',p.version,'quantity',p.quantity,'price',p.price_cents,'taskRevision',p.task_revision_id,'acceptedAt',p.accepted_at) order by p.id) from public.object_request_proposals p join public.object_visit_requests v on v.tenant_id=p.tenant_id and v.id=p.request_id where v.tenant_id=t and v.work_order_task_id=task.id and p.accepted_at is not null),'[]')) state,
  e.task_id eligible_id,e.subtotal_cents eligible_amount,
  case when task.commercial_snapshot ? 'quote_id' then
   round(coalesce(task.executed_quantity,task.quantity)*(task.commercial_snapshot#>>'{line,net_cents}')::numeric/nullif((task.commercial_snapshot#>>'{line,quantity}')::numeric,0))
    -round(used.quantity*(task.commercial_snapshot#>>'{line,net_cents}')::numeric/nullif((task.commercial_snapshot#>>'{line,quantity}')::numeric,0))
   else round(greatest(0,coalesce(task.executed_quantity,task.quantity)-used.quantity)*task.unit_price_cents) end nominal_amount
 from public.work_order_tasks task join public.work_orders w on w.tenant_id=task.tenant_id and w.id=task.work_order_id join public.customers c on c.tenant_id=w.tenant_id and c.id=w.customer_id
 left join public.work_order_report_versions r on r.tenant_id=w.tenant_id and r.work_order_id=w.id and r.version=w.report_version
 left join eligible e on e.task_id=task.id
 cross join lateral(select coalesce(sum(l.quantity),0) quantity from public.invoice_lines l where l.tenant_id=task.tenant_id and l.work_order_id=task.work_order_id and coalesce(l.work_order_task_id::text,l.source_snapshot->>'work_order_task_id')=task.id::text)used
 where task.tenant_id=t and(target_order is null or w.id=target_order) and w.archive_at is null and w.status<>'cancelled' and task.completed_at is not null and task.unit_price_cents>0 and coalesce(task.executed_quantity,task.quantity)>used.quantity
  and(w.actual_end_at is not null or w.status in('completed','under_review','returned','approved','invoice_ready','invoiced'))
 ), hashed as(select *,encode(extensions.digest(state::text,'sha256'),'hex') fingerprint from facts)
 select jsonb_build_object('id','task:'||h.id,'taskId',h.id,'sourceId',h.work_order_id,'sourceKind','work_order','sourceRef',h.work_order_number,'customerId',h.customer_id,'customer',h.customer,'objectId',h.object_id,'description',h.description,
  'amountCents',coalesce(h.eligible_amount,h.nominal_amount::bigint),'category',case when h.eligible_id is not null then 'confirmed' else 'review' end,'approved',h.report_state='approved' and(not h.is_extra_work or h.extra_work_status='approved'),
  'fixed',h.price_basis in('week','month'),'priceBasis',h.price_basis,'quantity',h.quantity,'invoiced',h.invoiced,'remaining',h.quantity-h.invoiced,'unit',h.unit,'unitPriceCents',h.unit_price_cents,'vatBasisPoints',h.vat_basis_points,
  'fingerprint',h.fingerprint,'sourceVersion',h.order_version,'reportId',h.report_id,'reportVersion',h.report_version,'reportState',h.report_version_state,'history','[]'::jsonb,'historyTotal',0,'excluded',false,'exclusionReason','')
 from hashed h where not exists(select 1 from private.cockpit_finance_reviews r where r.tenant_id=t and r.task_id=h.id and r.outcome='included' and r.source_fingerprint=h.fingerprint)
$$;
revoke all on function private.cockpit_finance_task_rows(uuid,uuid) from public,anon,authenticated,service_role;

create function private.cockpit_finance_invoice_rows(t uuid) returns setof jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id','invoice:'||i.id,'taskId',null,'sourceId',i.id,'sourceKind','invoice','sourceRef',i.invoice_number,'customerId',i.customer_id,'customer',coalesce(i.customer_snapshot->>'name',c.name),'objectId',null,'description','Factuur '||i.invoice_number,
  'amountCents',i.total_cents-i.paid_cents,'category','unpaid','approved',true,'fixed',false,'priceBasis','invoice','quantity',1,'invoiced',1,'remaining',0,'unit','factuur','unitPriceCents',i.total_cents,'vatBasisPoints',0,
  'fingerprint',encode(extensions.digest(jsonb_build_array(i.id,i.version,i.total_cents,i.paid_cents,i.status)::text,'sha256'),'hex'),'sourceVersion',i.version,'reportId',null,'reportVersion',null,'reportState',null,'history','[]'::jsonb,'historyTotal',0,'excluded',false,'exclusionReason','')
 from public.invoices i join public.customers c on c.tenant_id=i.tenant_id and c.id=i.customer_id where i.tenant_id=t and i.status in('final','sent','partially_paid','overdue') and i.finalized_at is not null and i.total_cents>i.paid_cents
$$;
revoke all on function private.cockpit_finance_invoice_rows(uuid) from public,anon,authenticated,service_role;

create function private.cockpit_finance_excluded_rows(t uuid) returns setof jsonb language sql stable security definer set search_path='' as $$
 select r.result_snapshot||jsonb_build_object('id','review:'||r.id,'category','excluded','excluded',true,'exclusionReason',r.reason,'reviewId',r.id,'historical',true,'reviewedAt',r.created_at,'history','[]'::jsonb,'historyTotal',0)
 from private.cockpit_finance_reviews r where r.tenant_id=t and r.outcome='included'
$$;
revoke all on function private.cockpit_finance_excluded_rows(uuid) from public,anon,authenticated,service_role;

create function public.cockpit_finance_query(target_tenant uuid,payload jsonb default '{}') returns jsonb language plpgsql stable security definer set search_path='' as $$
declare q text:=lower(btrim(coalesce(payload->>'search','')));tab text:=coalesce(payload->>'tab','confirmed');pg integer:=coalesce((payload->>'page')::integer,1);sz integer:=coalesce((payload->>'pageSize')::integer,20);record text:=payload->>'record';rows jsonb;selected jsonb;counts jsonb;total bigint;history jsonb;history_total bigint;writing boolean;begin
 perform private.cockpit_finance_assert(target_tenant);
 if jsonb_typeof(payload) is distinct from 'object' or length(q)>160 or tab not in('confirmed','review','unpaid','excluded') or pg not between 1 and 100000 or sz not between 5 and 100 or(record is not null and record!~'^(task|review|invoice):[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$') or exists(select 1 from jsonb_object_keys(payload) k where k not in('search','tab','page','pageSize','record')) then raise exception 'Ongeldige financiële selectie.' using errcode='22023';end if;
 writing:=private.management_allowed(target_tenant,'backoffice.finance.write') and private.management_allowed(target_tenant,'backoffice.functions.cockpit_finance_command');
 with all_rows as materialized(select r row from private.cockpit_finance_task_rows(target_tenant)r union all select r from private.cockpit_finance_invoice_rows(target_tenant)r union all select r from private.cockpit_finance_excluded_rows(target_tenant)r),
 filtered as materialized(select row from all_rows where row->>'category'=tab and(q='' or position(q in lower((row->>'customer')||' '||(row->>'description')||' '||(row->>'sourceRef')||' '||(row->>'id')))>0))
 select jsonb_build_object('confirmed',coalesce((select sum((row->>'amountCents')::bigint) from all_rows where row->>'category'='confirmed'),0),'review',coalesce((select sum((row->>'amountCents')::bigint) from all_rows where row->>'category'='review'),0),'unpaid',coalesce((select sum((row->>'amountCents')::bigint) from all_rows where row->>'category'='unpaid'),0)),
 (select count(*) from filtered),coalesce((select jsonb_agg(row order by row->>'sourceRef',row->>'id') from(select row from filtered order by row->>'sourceRef',row->>'id' limit sz offset(least(pg,greatest(1,ceil((select count(*) from filtered)::numeric/sz)::integer))-1)*sz)p),'[]'),
 (select row from all_rows where row->>'id'=record limit 1) into counts,total,rows,selected;
 pg:=least(pg,greatest(1,ceil(total::numeric/sz)::integer));
 if selected is null and record like 'review:%' then
  select r.result_snapshot||jsonb_build_object('id','review:'||r.id,'category',case when r.outcome='included' then 'excluded' else r.result_snapshot->>'category' end,'excluded',r.outcome='included','exclusionReason',case when r.outcome='included' then r.reason else '' end,'reviewId',r.id,'historical',true,'reviewedAt',r.created_at) into selected from private.cockpit_finance_reviews r where r.tenant_id=target_tenant and r.id=split_part(record,':',2)::uuid;
 end if;
 if selected is not null then
  select count(*) into history_total from private.cockpit_finance_reviews r where r.tenant_id=target_tenant and r.task_id=nullif(selected->>'taskId','')::uuid;
  select coalesce(jsonb_agg(jsonb_build_object('id',h.id,'outcome',h.outcome,'reason',h.reason,'actor',case when h.created_by=auth.uid() then 'U' else 'Financieel beheer' end,'createdAt',h.created_at) order by h.created_at desc,h.id),'[]') into history from(select * from private.cockpit_finance_reviews r where r.tenant_id=target_tenant and r.task_id=nullif(selected->>'taskId','')::uuid order by r.created_at desc,r.id desc limit 50)h;
  selected:=selected||jsonb_build_object('history',history,'historyTotal',history_total,'canInclude',writing and(selected->>'fixed')::boolean and selected->>'category'='review','canBill',coalesce(writing and not(selected->>'fixed')::boolean and selected->>'category'='review' and selected->>'reportState'='review' and private.management_allowed(target_tenant,'backoffice.reports.write') and private.management_allowed(target_tenant,'backoffice.functions.review_work_order_report') and private.service_enabled(target_tenant,'rapportage'),false),
   'canOpenSource',case selected->>'sourceKind' when 'invoice' then true else private.cockpit_source(target_tenant,'work_order',(selected->>'sourceId')::uuid) end);
 end if;
 return jsonb_build_object('rows',rows,'selected',selected,'counts',counts,'total',total,'page',pg,'pageSize',sz,'canWrite',writing,'timezone',(select timezone from public.tenants where id=target_tenant),'today',(now() at time zone(select timezone from public.tenants where id=target_tenant))::date);
end$$;
revoke all on function public.cockpit_finance_query(uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.cockpit_finance_query(uuid,jsonb) to authenticated;
notify pgrst,'reload schema';

create function public.cockpit_finance_command(target_tenant uuid,input jsonb,request_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid();task_id uuid:=nullif(input->>'id','')::uuid;w public.work_orders;task public.work_order_tasks;before_row jsonb;after_row jsonb;receipt private.cockpit_receipts;fingerprint text;review uuid;result jsonb;outcome text:=input->>'outcome';begin
 perform private.cockpit_finance_assert(target_tenant,true);
 if task_id is null or request_id is null or jsonb_typeof(input) is distinct from 'object' or octet_length(input::text)>18000 or outcome is null or outcome not in('billable','included') or coalesce(input->>'fingerprint','')!~'^[a-f0-9]{64}$' or length(btrim(coalesce(input->>'reason',''))) not between 3 and 4000 or exists(select 1 from jsonb_object_keys(input) k where k not in('id','fingerprint','outcome','reason','approval','outside')) then raise exception 'Controleer de bron, uitkomst en onderbouwing.' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended('cockpit-command:'||target_tenant::text||actor::text||request_id::text,0));perform private.cockpit_finance_assert(target_tenant,true);
 -- Native report review, source allocations and source edits use this same
 -- tenant planning lock. Acquire it before any work-order/task row lock.
 perform pg_advisory_xact_lock(hashtextextended('fieldgrid-planning:'||target_tenant::text,0));perform private.cockpit_finance_assert(target_tenant,true);
 select order_row.* into w from public.work_orders order_row join public.work_order_tasks source on source.tenant_id=order_row.tenant_id and source.work_order_id=order_row.id where source.tenant_id=target_tenant and source.id=task_id for update of order_row;
 select * into task from public.work_order_tasks source where source.tenant_id=target_tenant and source.id=task_id for update;
 if task.id is null or w.id is null then raise exception 'Geen toegankelijke financiële bron.' using errcode='42501';end if;
 perform private.cockpit_finance_assert(target_tenant,true);
 if outcome='billable' then
  perform private.management_assert(target_tenant,'backoffice.reports.write');perform private.management_assert(target_tenant,'backoffice.functions.review_work_order_report');
  if not private.service_enabled(target_tenant,'rapportage') then raise exception 'Rapportcontrole is niet ingeschakeld.' using errcode='42501';end if;
 end if;
 fingerprint:=encode(extensions.digest('finance:review:'||input::text,'sha256'),'hex');
 select * into receipt from private.cockpit_receipts r where r.tenant_id=target_tenant and r.actor_id=actor and r.request_id=cockpit_finance_command.request_id;
 if found then if receipt.fingerprint<>fingerprint then raise exception 'Deze herhaalsleutel heeft andere invoer.' using errcode='23514';end if;return receipt.result;end if;
 select r into before_row from private.cockpit_finance_task_rows(target_tenant,w.id)r where r->>'taskId'=task_id::text;
 if before_row is null or before_row->>'fingerprint' is distinct from input->>'fingerprint' then raise exception 'De bron is gewijzigd. Beoordeel de actuele uitvoering, prijs en allocaties opnieuw.' using errcode='40001';end if;
 if before_row->>'category'<>'review' then raise exception 'Deze bron vraagt geen financiële controle.' using errcode='23514';end if;
 if outcome='included' then
  if not(before_row->>'fixed')::boolean then raise exception 'De vastgelegde bron heeft geen vaste week- of maandprijs. Een financiële controle wijzigt de contractscope niet.' using errcode='23514';end if;
  after_row:=before_row;
 else
  if (before_row->>'fixed')::boolean or input->'approval' is distinct from 'true'::jsonb or input->'outside' is distinct from 'true'::jsonb or before_row->>'reportState' is distinct from 'review' or before_row->>'reportId' is null then raise exception 'Controleer het echte rapport en de prijsafspraak. Ontbrekend meerwerkakkoord of een vaste prijs wordt hier niet vervangen.' using errcode='23514';end if;
  -- This is the existing full work-order report review, with its signature,
  -- delivery, exception, version and execution checks; never set status flags.
  perform public.review_work_order_report(w.id,(before_row->>'reportId')::uuid,'approved',btrim(input->>'reason'));
  perform private.cockpit_finance_assert(target_tenant,true);perform private.management_assert(target_tenant,'backoffice.reports.write');perform private.management_assert(target_tenant,'backoffice.functions.review_work_order_report');
  select r into after_row from private.cockpit_finance_task_rows(target_tenant,w.id)r where r->>'taskId'=task_id::text;
  if after_row is null or after_row->>'category'<>'confirmed' then raise exception 'Deze bron is volgens de bestaande factuurcontrole nog niet factureerbaar. Beoordeel het brondossier; de rapportgoedkeuring is niet vastgelegd.' using errcode='23514';end if;
 end if;
 insert into private.cockpit_finance_reviews(tenant_id,work_order_id,task_id,source_fingerprint,outcome,reason,before_snapshot,result_snapshot,created_by)
 values(target_tenant,w.id,task_id,after_row->>'fingerprint',outcome,btrim(input->>'reason'),before_row,after_row,actor) returning id into review;
 insert into private.cockpit_events(tenant_id,record_kind,record_id,actor_id,event,revision,details) values(target_tenant,'finance',review,actor,outcome,1,jsonb_build_object('workOrderId',w.id,'taskId',task_id,'note',btrim(input->>'reason'),'nativeReportReview',outcome='billable'));
 perform private.cockpit_finance_sync(target_tenant,w.id,actor);
 result:=jsonb_build_object('ok',true,'id',review,'record',case when outcome='included' then 'review:'||review else 'task:'||task_id end,'tab',case when outcome='included' then 'excluded' else 'confirmed' end);
 insert into private.cockpit_receipts(tenant_id,actor_id,request_id,fingerprint,result) values(target_tenant,actor,request_id,fingerprint,result);return result;
end$$;
revoke all on function public.cockpit_finance_command(uuid,jsonb,uuid) from public,anon,authenticated,service_role;
grant execute on function public.cockpit_finance_command(uuid,jsonb,uuid) to authenticated;
notify pgrst,'reload schema';

-- Cursor metadata must not acquire native work-order KEY SHARE locks while
-- the worker owns an action. Source membership is derived from real rows.
create table private.cockpit_finance_checks(work_order_id uuid primary key,tenant_id uuid not null references public.tenants(id),checked_at timestamptz not null default '-infinity');
alter table private.cockpit_finance_checks enable row level security;
alter table private.cockpit_finance_checks force row level security;
revoke all on private.cockpit_finance_checks from public,anon,authenticated,service_role;
create index cockpit_finance_checks_due on private.cockpit_finance_checks(checked_at,work_order_id);
create function private.cockpit_finance_sync(t uuid,order_id uuid,actor uuid default null) returns boolean language plpgsql security definer set search_path='' as $$
declare w public.work_orders;a private.cockpit_actions;pending integer;paused boolean;signal_note text;label text;due date;result private.cockpit_actions;begin
 perform pg_advisory_xact_lock(hashtextextended('finance-signal:'||order_id::text,0));
 select * into a from private.cockpit_actions where tenant_id=t and trigger_key='finance:'||order_id::text for update;
 -- No reverse lock of a native source while owning its action. Re-read after
 -- waiting so an invoice allocation/review committed meanwhile is respected.
 select * into w from public.work_orders where tenant_id=t and id=order_id;
 if w.id is null or not private.service_enabled(t,'finance') then return false;end if;
 select count(*) into pending from private.cockpit_finance_task_rows(t,order_id)r where r->>'category'='review';
 paused:=w.archive_at is not null or w.status='cancelled';
 if a.id is null and(pending=0 or paused) then return false;end if;
 label:='Financiële broncontrole · '||w.work_order_number;
 signal_note:=case when paused then 'De bron is gearchiveerd of geannuleerd. Dit is geen financiële goedkeuring; controleer het brondossier.' when pending=0 then 'De bestaande factuurcontrole en vastgelegde broncontroles vragen geen resterende financiële beoordeling.' else pending||' bronregel(s) vragen controle van rapportgoedkeuring, prijsafspraak of bronhoeveelheid.' end;
 due:=(coalesce(w.actual_end_at,w.updated_at) at time zone(select timezone from public.tenants where id=t))::date;
 if a.id is null then
  insert into private.cockpit_actions(tenant_id,source_kind,source_id,title,scope,due_on,original_due_on,automatic,trigger_key,created_by,note)
  values(t,'work_order',w.id,label,'finance',due,due,true,'finance:'||order_id::text,null,signal_note) returning * into result;
  insert into private.cockpit_events(tenant_id,record_kind,record_id,actor_id,event,revision,details) values(t,'action:manual',result.id,actor,'create',result.revision,jsonb_build_object('workOrderId',w.id,'pendingSources',pending,'note',signal_note));return true;
 end if;
 if(a.title,a.state,a.source_paused,a.note) is not distinct from(label,case when paused or pending>0 then 'open' else 'done' end,paused,signal_note) then return false;end if;
 update private.cockpit_actions set title=label,state=case when paused or pending>0 then 'open' else 'done' end,source_paused=paused,note=signal_note,snoozed_until=case when a.state='done' and pending>0 then null else snoozed_until end,revision=revision+1,updated_at=clock_timestamp() where id=a.id returning * into result;
 insert into private.cockpit_events(tenant_id,record_kind,record_id,actor_id,event,revision,details) values(t,'action:manual',result.id,actor,case when result.state='done' and a.state<>'done' then 'complete' when result.state='open' and a.state='done' then 'reopen' else 'updated' end,result.revision,jsonb_build_object('workOrderId',w.id,'pendingSources',pending,'note',signal_note,'originalDue',result.original_due_on));return true;
end$$;
revoke all on function private.cockpit_finance_sync(uuid,uuid,uuid) from public,anon,authenticated,service_role;

-- Append one wake-up per source/order/transaction. Source writers never lock
-- the worker's progress rows, avoiding a source -> action -> progress cycle.
create table private.cockpit_finance_queue(
 id bigint generated always as identity primary key,tenant_id uuid not null references public.tenants(id) on delete cascade,
 work_order_id uuid not null references public.work_orders(id) on delete cascade,transaction_key text not null,created_at timestamptz not null default clock_timestamp(),unique(tenant_id,work_order_id,transaction_key)
);
alter table private.cockpit_finance_queue enable row level security;
alter table private.cockpit_finance_queue force row level security;
revoke all on private.cockpit_finance_queue from public,anon,authenticated,service_role;
revoke all on sequence private.cockpit_finance_queue_id_seq from public,anon,authenticated,service_role;
create function private.cockpit_finance_enqueue() returns trigger language plpgsql security definer set search_path='' as $$
declare tid uuid;oid uuid;begin
 if tg_op='DELETE' then tid:=old.tenant_id;oid:=old.work_order_id;
 elsif tg_table_name='work_orders' then tid:=new.tenant_id;oid:=new.id;else tid:=new.tenant_id;oid:=new.work_order_id;end if;
 if oid is not null and private.service_enabled(tid,'finance') and exists(select 1 from public.work_orders w join public.tenants tenant on tenant.id=w.tenant_id and tenant.status='active' where w.tenant_id=tid and w.id=oid) then
  insert into private.cockpit_finance_queue(tenant_id,work_order_id,transaction_key) values(tid,oid,pg_current_xact_id()::text) on conflict(tenant_id,work_order_id,transaction_key) do nothing;
 end if;
 return case when tg_op='DELETE' then old else new end;
end$$;
revoke all on function private.cockpit_finance_enqueue() from public,anon,authenticated,service_role;
create trigger cockpit_finance_order_enqueue after insert or update on public.work_orders for each row execute function private.cockpit_finance_enqueue();
create trigger cockpit_finance_task_enqueue after insert or update or delete on public.work_order_tasks for each row execute function private.cockpit_finance_enqueue();
create trigger cockpit_finance_allocation_enqueue after insert or update or delete on public.invoice_lines for each row execute function private.cockpit_finance_enqueue();

create function public.cockpit_finance_maintenance(batch_size integer default 50) returns integer language plpgsql security definer set search_path='' as $$
declare item record;processed integer:=0;processed_ids uuid[]:='{}';begin
 if auth.jwt()->>'role' is distinct from 'service_role' or batch_size is null or batch_size not between 1 and 100 then raise exception 'Alleen de bestaande worker verwerkt financiële signalen.' using errcode='42501';end if;
 if not pg_try_advisory_xact_lock(hashtextextended('cockpit-finance-maintenance',0)) then return 0;end if;
 -- Delete only the exact event IDs visible in this batch, never a numeric ID
 -- range: another transaction can allocate an earlier ID and commit later.
 for item in with first_events as materialized(select q.id,q.tenant_id,q.work_order_id from private.cockpit_finance_queue q join public.work_orders source on source.id=q.work_order_id and source.tenant_id=q.tenant_id join public.tenants tenant on tenant.id=q.tenant_id and tenant.status='active' where private.service_enabled(q.tenant_id,'finance') order by q.id limit batch_size)
  select tenant_id,work_order_id,array_agg(id) ids from first_events group by tenant_id,work_order_id order by min(id) loop
  perform private.cockpit_finance_sync(item.tenant_id,item.work_order_id);
  delete from private.cockpit_finance_queue where id=any(item.ids);
  insert into private.cockpit_finance_checks(work_order_id,tenant_id,checked_at) values(item.work_order_id,item.tenant_id,clock_timestamp()) on conflict(work_order_id) do update set checked_at=excluded.checked_at;
  processed_ids:=array_append(processed_ids,item.work_order_id);processed:=processed+1;
 end loop;
 for item in select w.id,w.tenant_id from public.work_orders w join public.tenants tenant on tenant.id=w.tenant_id and tenant.status='active' left join private.cockpit_finance_checks c on c.work_order_id=w.id
  where not w.id=any(processed_ids) and private.service_enabled(w.tenant_id,'finance') and((w.archive_at is null and w.status<>'cancelled' and(w.actual_end_at is not null or w.status in('completed','under_review','returned','approved','invoice_ready','invoiced')))
   or exists(select 1 from private.cockpit_actions a where a.tenant_id=w.tenant_id and a.trigger_key='finance:'||w.id::text and a.state<>'done'))
  order by coalesce(c.checked_at,'-infinity'::timestamptz),w.id limit(batch_size-processed) loop
  perform private.cockpit_finance_sync(item.tenant_id,item.id);
  insert into private.cockpit_finance_checks(work_order_id,tenant_id,checked_at) values(item.id,item.tenant_id,clock_timestamp()) on conflict(work_order_id) do update set checked_at=excluded.checked_at;processed:=processed+1;
 end loop;return processed;
end$$;
revoke all on function public.cockpit_finance_maintenance(integer) from public,anon,authenticated,service_role;
grant execute on function public.cockpit_finance_maintenance(integer) to service_role;
