-- Display names only; customer management and active membership remain authoritative.
create or replace function public.customer_owners(target_tenant uuid)
returns table(id uuid, label text, commercial boolean)
language sql stable security definer set search_path = '' as $function$
 select m.user_id,
  coalesce(nullif(btrim(p.full_name),''),
   nullif(btrim(u.raw_user_meta_data->>'full_name'),''),
   nullif(btrim(concat_ws(' ',nullif(u.raw_user_meta_data->>'first_name',''),nullif(u.raw_user_meta_data->>'last_name',''))),''),
   'Naam niet vastgelegd')::text,
  m.roles&&array['tenant_admin','management','finance']::public.app_role[]
 from public.tenant_memberships m
 join auth.users u on u.id=m.user_id
 left join lateral (
  select p.full_name from public.personnel p
  where p.tenant_id=m.tenant_id and (p.user_id=m.user_id or (u.email_confirmed_at is not null and lower(p.email)=lower(u.email)))
  order by (p.user_id=m.user_id) desc nulls last,p.id limit 1
 ) p on true
 where private.customer_manage(target_tenant) and m.tenant_id=target_tenant and m.status='active'
  and m.roles&&array['tenant_admin','management','planner','finance']::public.app_role[]
 order by 2,m.user_id
$function$;
revoke all on function public.customer_owners(uuid) from public,anon,service_role;
grant execute on function public.customer_owners(uuid) to authenticated,postgres;

-- Read-only invoice candidates. Approval exposes the remaining source without
-- reserving an invoice number or mutating the immutable accounting ledger.
create or replace function public.execution_invoice_concepts(target_tenant uuid, target_order uuid default null)
returns jsonb language plpgsql security definer set search_path = '' as $function$
declare result jsonb;
begin
 if not private.object_session_active() or not private.commercial_access(target_tenant) or not private.service_enabled(target_tenant,'finance') then
  raise exception 'Financiële toegang vereist' using errcode='42501';
 end if;
 if target_order is not null and not exists(select 1 from public.work_orders where tenant_id=target_tenant and id=target_order) then
  raise exception 'Concept niet beschikbaar' using errcode='P0002';
 end if;
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
 ), candidates as (
  select work_order_id,customer_id,work_order_number,title,order_version,report_version,updated_at,
   sum(subtotal)::bigint subtotal,sum(vat)::bigint vat,sum(subtotal+vat)::bigint total,
   jsonb_agg(jsonb_build_object('taskId',id,'description',case when commercial_snapshot ? 'quote_id' then task_name
     ||case when coalesce((commercial_snapshot#>>'{line,discount_basis_points}')::integer,0)>0 then ' (incl. '||((commercial_snapshot#>>'{line,discount_basis_points}')::numeric/100)::text||'% korting)' else '' end
     else task_code||' · '||task_name end,
    'quantity',remaining,'unit',unit,'unitPriceCents',unit_price_cents,'vatBasisPoints',vat_basis_points,
    'subtotalCents',subtotal,'vatCents',vat,'totalCents',subtotal+vat) order by created_at,id) lines
  from priced group by work_order_id,customer_id,work_order_number,title,order_version,report_version,updated_at
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
end $function$;
revoke all on function public.execution_invoice_concepts(uuid,uuid) from public,anon,service_role;
grant execute on function public.execution_invoice_concepts(uuid,uuid) to authenticated;
