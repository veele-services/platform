SET local check_function_bodies = off;

CREATE OR REPLACE FUNCTION private.invoice_source_guard()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare t public.work_order_tasks;w public.work_orders;i public.invoices;p public.object_request_proposals;used numeric;available numeric;
begin
 perform pg_advisory_xact_lock(hashtextextended('fieldgrid-planning:'||new.tenant_id::text,0));
 if new.work_order_task_id is null then raise exception 'Koppel een goedgekeurde uitvoeringstaak aan iedere factuurregel' using errcode='23514';end if;
 select * into t from public.work_order_tasks where tenant_id=new.tenant_id and id=new.work_order_task_id for update;
 select * into w from public.work_orders where tenant_id=new.tenant_id and id=t.work_order_id;
 select * into i from public.invoices where tenant_id=new.tenant_id and id=new.invoice_id;
 if t.id is null or i.id is null or w.customer_id<>i.customer_id or new.work_order_id is distinct from t.work_order_id or w.status<>'invoice_ready' or i.status<>'draft' or t.completed_at is null or (t.is_extra_work and t.extra_work_status is distinct from 'approved') then raise exception 'De bron is nog niet gecontroleerd of hoort niet bij deze klant' using errcode='23514';end if;
 if exists(select 1 from public.object_visit_requests r where r.tenant_id=new.tenant_id and r.work_order_task_id=t.id and r.needs_review) then raise exception 'Beoordeel het gewijzigde klantverzoek eerst' using errcode='23514';end if;
 select p1.* into p from public.object_request_proposals p1 join public.object_visit_requests r on r.id=p1.request_id where r.tenant_id=new.tenant_id and r.work_order_task_id=t.id and p1.accepted_at is not null order by p1.version desc limit 1;
 if p.id is not null and (t.quantity<>p.quantity or t.unit_price_cents<>p.price_cents or t.task_revision_id<>p.task_revision_id) then raise exception 'De uitvoering wijkt af van de geaccepteerde voorstelversie' using errcode='23514';end if;
 if exists(select 1 from public.invoice_lines old_line where old_line.tenant_id=new.tenant_id and old_line.work_order_id=t.work_order_id and old_line.work_order_task_id is null and not exists(select 1 from public.work_order_tasks old_task where old_task.tenant_id=old_line.tenant_id and old_task.work_order_id=old_line.work_order_id and old_task.id::text=old_line.source_snapshot->>'work_order_task_id')) then raise exception 'Deze werkbon heeft historische factuurregels zonder controleerbare bron. Laat de financiële koppeling eerst controleren' using errcode='23514';end if;
 available:=coalesce(t.executed_quantity,t.quantity);
 select coalesce(sum(l.quantity),0) into used from public.invoice_lines l where l.tenant_id=new.tenant_id and (l.work_order_task_id=t.id or (l.work_order_task_id is null and l.work_order_id=t.work_order_id and l.source_snapshot->>'work_order_task_id'=t.id::text)) and l.id<>new.id;
 if new.quantity>available-used or new.unit_price_cents<>t.unit_price_cents or new.vat_basis_points<>t.vat_basis_points or new.unit<>t.unit then raise exception 'Hoeveelheid of prijs wijkt af van de nog factureerbare bron' using errcode='23514';end if;
 new.subtotal_cents:=round(new.quantity*t.unit_price_cents);new.vat_cents:=round(new.subtotal_cents*t.vat_basis_points/10000.0);new.total_cents:=new.subtotal_cents+new.vat_cents;
 new.source_snapshot:=jsonb_build_object('work_order_task_id',t.id,'execution_version',t.execution_version,'executed_quantity',available,'object',w.object_snapshot,'agreement',t.commercial_snapshot,'proposal_id',p.id,'proposal_version',p.version,'accepted_by',p.accepted_by,'accepted_at',p.accepted_at);
 return new;
end $function$;

CREATE OR REPLACE FUNCTION private.protect_allocated_execution()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
 if exists(select 1 from public.invoice_lines where tenant_id=old.tenant_id and (work_order_task_id=old.id or (work_order_task_id is null and work_order_id=old.work_order_id and source_snapshot->>'work_order_task_id'=old.id::text)))
 and (new.quantity,new.executed_quantity,new.execution_state,new.unit_price_cents,new.vat_basis_points,new.completed_at,new.task_revision_id,new.work_order_id,new.is_extra_work,new.extra_work_status) is distinct from (old.quantity,old.executed_quantity,old.execution_state,old.unit_price_cents,old.vat_basis_points,old.completed_at,old.task_revision_id,old.work_order_id,old.is_extra_work,old.extra_work_status)
 then raise exception 'Deze uitvoering is al financieel verwerkt. Gebruik een navolgbare correctie.' using errcode='23514';end if;
 return new;
end $function$;

CREATE OR REPLACE FUNCTION public.create_execution_invoice (
  target_tenant uuid,
  request_id    uuid,
  sources       jsonb
)
  RETURNS public.invoices
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare inv public.invoices;t public.work_order_tasks;w public.work_orders;src jsonb;customer uuid; qty numeric;
begin
 perform pg_advisory_xact_lock(hashtextextended('fieldgrid-planning:'||target_tenant::text,0));
 if not private.commercial_access(target_tenant) or not private.service_enabled(target_tenant,'finance') then raise exception 'Financiële toegang vereist' using errcode='42501';end if;
 if request_id is null then raise exception 'Verzoekreferentie ontbreekt' using errcode='23514';end if;
 select * into inv from public.invoices where tenant_id=target_tenant and source_request_id=request_id;
 if found then return inv;end if;
 if jsonb_typeof(sources)<>'array' or jsonb_array_length(sources) not between 1 and 500 then raise exception 'Selecteer de te factureren uitvoering' using errcode='23514';end if;
 for src in select value from jsonb_array_elements(sources) loop
  select * into t from public.work_order_tasks where tenant_id=target_tenant and id=(src->>'taskId')::uuid for update;
  select * into w from public.work_orders where tenant_id=target_tenant and id=t.work_order_id for update;
  if w.id is null or w.status<>'invoice_ready' or (customer is not null and customer<>w.customer_id) then raise exception 'Selecteer gecontroleerde werkbonnen van één klant' using errcode='23514';end if;
  if inv.id is null then customer:=w.customer_id;insert into public.invoices(tenant_id,customer_id,created_by,source_request_id) values(target_tenant,customer,auth.uid(),request_id) returning * into inv;end if;
  qty:=(src->>'quantity')::numeric;
  insert into public.invoice_lines(tenant_id,invoice_id,work_order_id,work_order_task_id,description,quantity,unit,unit_price_cents,subtotal_cents,vat_basis_points,vat_cents,total_cents,source_snapshot)
  values(target_tenant,inv.id,w.id,t.id,t.task_code||' · '||t.task_name,qty,t.unit,t.unit_price_cents,0,t.vat_basis_points,0,0,'{}');
 end loop;
 inv:=public.finalize_invoice(inv.id);
 -- A partial allocation leaves the reviewed remainder available, without another visit.
 update public.work_orders w1 set status='invoice_ready' where w1.tenant_id=target_tenant and w1.id in (select work_order_id from public.invoice_lines where invoice_id=inv.id)
 and exists(select 1 from public.work_order_tasks t1 where t1.tenant_id=target_tenant and t1.work_order_id=w1.id and t1.completed_at is not null and t1.unit_price_cents>0 and (not t1.is_extra_work or t1.extra_work_status='approved') and coalesce(t1.executed_quantity,t1.quantity)>(select coalesce(sum(l.quantity),0) from public.invoice_lines l where l.tenant_id=target_tenant and (l.work_order_task_id=t1.id or (l.work_order_task_id is null and l.work_order_id=t1.work_order_id and l.source_snapshot->>'work_order_task_id'=t1.id::text))));
 return inv;
end $function$;
