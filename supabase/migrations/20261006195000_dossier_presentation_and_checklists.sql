-- Additive dossier projection, readable actor labels and guarded checklist binding.
-- Existing task prices, report versions, answers and audit records remain immutable.
CREATE OR REPLACE FUNCTION public.work_order_dossier (
  target_tenant uuid,
  target_order  uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare w public.work_orders;fin boolean;manage boolean;r jsonb;
begin
 -- module-scoped work-order dossier
 if not private.work_order_access(target_tenant) then raise exception 'Geen toegang tot werkbonnen' using errcode='42501';end if;
 select * into w from public.work_orders where tenant_id=target_tenant and id=target_order;
 if not found then return null;end if;
 fin:=private.work_order_access(target_tenant,true);manage:=private.has_role(target_tenant,array['tenant_admin','management','planner']::public.app_role[]);
 select jsonb_build_object('order',private.work_order_row(w.id,fin)||jsonb_build_object('description',w.description,'labels',w.labels,'instructions',w.day_instructions,
 'customerReference',coalesce(w.details->>'customerReference',''),'purchaseOrder',coalesce(w.details->>'purchaseOrder',''),'costCenter',coalesce(w.details->>'costCenter',''),'locationLabel',coalesce(w.details->>'locationLabel',''),
 'leadPersonnelId',w.lead_personnel_id,'plannerId',w.planner_user_id,'requestedDate',w.requested_date,'windowStart',s.starts_at,'windowEnd',s.ends_at,'windowKind',w.customer_window_kind,'durationMinutes',w.budget_labor_minutes,
 'signatureMode',w.signature_mode,'employeeSignatureRequired',w.employee_signature_required,'publishedAt',w.published_at,'templateSnapshot',w.template_snapshot,'templateRevisionId',w.template_snapshot->>'id','requestId',w.request_id,'quoteId',w.quote_id),
 'finance',fin,'canManage',manage,'canReview',private.service_enabled(target_tenant,'rapportage') and private.has_role(target_tenant,array['tenant_admin','management','finance']::public.app_role[]),
 'contacts',coalesce((select jsonb_agg(jsonb_build_object('id',c.contact_id,'name',c.snapshot->>'name','roles',c.roles,'email',c.snapshot->>'email','phone',c.snapshot->>'phone') order by c.snapshot->>'name') from public.work_order_contacts c where c.work_order_id=w.id),'[]'),
 'tasks',coalesce((select jsonb_agg(case when fin then to_jsonb(t) else to_jsonb(t)-'unit_price_cents'-'vat_basis_points'-'commercial_snapshot' end order by t.created_at,t.id) from public.work_order_tasks t where t.work_order_id=w.id),'[]'),
 'assignments',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'personnelId',p.id,'name',p.full_name,'start',a.projected_start_at,'end',a.projected_end_at,'status',a.status,'seenAt',(select min(created_at) from public.status_events e where e.assignment_id=a.id and e.new_status='seen'),'actualStart',a.actual_start_at,'actualEnd',a.actual_end_at) order by a.projected_start_at,a.id) from public.work_order_assignments a join public.personnel p on p.tenant_id=a.tenant_id and p.id=a.personnel_id where a.work_order_id=w.id),'[]'),
 'times',coalesce((select jsonb_agg(jsonb_build_object('id',t.id,'personnelId',p.id,'name',p.full_name,'start',t.starts_at,'end',t.ends_at,'kind',t.kind,'status',t.status) order by t.starts_at,t.id) from public.time_entries t join public.work_order_assignments a on a.id=t.assignment_id join public.personnel p on p.id=t.personnel_id where private.service_enabled(target_tenant,'personeel') and a.work_order_id=w.id and t.tenant_id=w.tenant_id),'[]'),
 'checklists',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'revisionId',v.id,'name',c.name,'version',v.version,'questions',c.definition->'questions','answers',coalesce((select jsonb_agg(jsonb_build_object('questionId',a.question_id,'value',a.value,'notApplicable',a.not_applicable,'reason',a.reason,'attachmentId',a.attachment_id,'version',a.version,'actor',a.updated_by,'updatedAt',a.updated_at) order by a.question_id) from public.work_order_checklist_answers a where a.checklist_id=c.id),'[]')) order by c.created_at,c.id) from public.work_order_checklists c join public.work_order_template_versions v on v.id=c.template_revision_id where c.work_order_id=w.id),'[]'),
 'reports',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'body',r.body,'created_at',r.created_at,'customer_visible',r.customer_visible) order by r.created_at,r.id) from public.report_entries r where private.service_enabled(target_tenant,'rapportage') and r.work_order_id=w.id and r.deleted_at is null),'[]'),
 'attachments',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'file_name',a.file_name,'mime_type',a.mime_type,'created_at',a.created_at) order by a.created_at,a.id) from public.attachments a where private.service_enabled(target_tenant,'rapportage') and a.work_order_id=w.id and a.deleted_at is null),'[]'),
 'history',coalesce((select jsonb_agg(to_jsonb(h) order by h.at desc,h.id) from (
  select item->>'id' id,(item->>'at')::timestamptz at,item->>'author' actor,item->>'title' event,item->>'description' note
  from jsonb_array_elements(case when private.service_enabled(target_tenant,'rapportage') then private.execution_activity(target_tenant,w.id,auth.uid()) else '[]'::jsonb end) item
  union all
  select e.id::text,e.created_at,coalesce(p.full_name,case when e.actor_user_id is not null then 'Backoffice' else 'Automatisch' end),'status.'||e.new_status::text,e.note
  from public.status_events e left join public.personnel p on p.tenant_id=e.tenant_id and p.user_id=e.actor_user_id
  where e.tenant_id=w.tenant_id and e.work_order_id=w.id and not private.service_enabled(target_tenant,'rapportage')
  union all
  select e.id::text,e.created_at,coalesce(p.full_name,case when e.actor_user_id is not null then 'Backoffice' else 'Automatisch' end),e.action,
   coalesce(e.after_data->>'reason',case when e.action='work_order.checklist_added' then e.after_data->>'name' end)
  from public.audit_events e left join public.personnel p on p.tenant_id=e.tenant_id and p.user_id=e.actor_user_id
  where e.tenant_id=w.tenant_id and e.entity_type='work_order' and e.entity_id=w.id
   and (not private.service_enabled(target_tenant,'rapportage') or e.action not in('work_order.open','work_order.travel','work_order.start','work_order.stop','work_order.pause','work_order.resume','work_order.return','work_order.communication'))
 )h),'[]'),
 'financial',case when fin then jsonb_build_object(
  'materials',coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'description',m.description,'quantity',m.quantity,'unit',m.unit,'customerVisible',m.customer_visible,'unitPriceCents',f.unit_price_cents) order by m.created_at,m.id) from public.work_order_material_usage m left join private.work_order_material_finance f on f.tenant_id=m.tenant_id and f.usage_id=m.id where m.tenant_id=target_tenant and m.work_order_id=w.id and private.service_enabled(target_tenant,'rapportage')),'[]'),
  'expenses',coalesce((select jsonb_agg(jsonb_build_object('id',e.id,'description',e.description,'amountCents',e.amount_cents,'customerVisible',e.customer_visible) order by e.created_at,e.id) from public.work_order_expenses e where e.tenant_id=target_tenant and e.work_order_id=w.id and private.service_enabled(target_tenant,'rapportage')),'[]'),
  'invoices',coalesce((select jsonb_agg(jsonb_build_object('id',i.id,'number',i.invoice_number,'status',i.status,'totalCents',i.total_cents,'orderTotalCents',(select coalesce(sum(allocated.total_cents),0) from public.invoice_lines allocated where allocated.tenant_id=target_tenant and allocated.invoice_id=i.id and allocated.work_order_id=w.id),'paidCents',i.paid_cents,'pdfAvailable',i.pdf_storage_path is not null and i.pdf_sha256 is not null,'issuedOn',i.issued_on) order by i.created_at,i.id) from public.invoices i where i.tenant_id=target_tenant and private.service_enabled(target_tenant,'finance') and exists(select 1 from public.invoice_lines l where l.tenant_id=target_tenant and l.invoice_id=i.id and l.work_order_id=w.id)),'[]')
 ) else null end) into r from (select 1) dummy left join public.appointment_slots s on s.id=w.appointment_slot_id;
 return r;
end $function$;

create function public.attach_work_order_checklist(target_tenant uuid,input jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare w public.work_orders;v public.work_order_template_versions;template_name text;
 prior private.work_order_commands;mid uuid:=(input->>'mutationId')::uuid;hash text;result jsonb;
begin
 if not private.object_manage(target_tenant) or not private.service_enabled(target_tenant,'rapportage') then raise exception 'Geen checklistbeheer' using errcode='42501';end if;
 if jsonb_typeof(input)<>'object' or mid is null or (input->>'version')::bigint is null or (input->>'version')::bigint<1 or input->>'orderId' is null or input->>'revisionId' is null or exists(select 1 from jsonb_object_keys(input) k where k not in('mutationId','orderId','revisionId','version')) then raise exception 'Ongeldige checklistwijziging' using errcode='23514';end if;
 perform pg_advisory_xact_lock(hashtextextended('fieldgrid-planning:'||target_tenant::text,0));
 hash:=encode(extensions.digest(input::text,'sha256'),'hex');select * into prior from private.work_order_commands where id=mid;
 if found then if(prior.tenant_id,prior.actor_id,prior.command,prior.payload_hash) is distinct from(target_tenant,auth.uid(),'checklist:attach',hash) then raise exception 'Ongeldige herhaalsleutel' using errcode='23514';end if;return prior.result;end if;
 select * into w from public.work_orders where tenant_id=target_tenant and id=(input->>'orderId')::uuid for update;
 if w.id is null then raise exception 'Werkbon niet beschikbaar' using errcode='42501';end if;
 if w.version is distinct from(input->>'version')::bigint then raise exception 'Werkbon is intussen gewijzigd' using errcode='40001';end if;
 if w.archive_at is not null or w.status in('approved','invoice_ready','invoiced','cancelled') or w.report_state not in('draft','correction') then raise exception 'Vraag eerst een rapportcorrectie. De vastgelegde oplevering blijft behouden.' using errcode='23514';end if;
 select tv.* into v from public.work_order_template_versions tv join public.work_order_templates t on t.tenant_id=tv.tenant_id and t.id=tv.template_id where tv.tenant_id=target_tenant and tv.id=(input->>'revisionId')::uuid and tv.state='published' and t.kind='checklist';
 if v.id is null then raise exception 'Kies een gepubliceerde checklistversie van deze organisatie' using errcode='23514';end if;
 if exists(select 1 from public.work_order_checklists c where c.tenant_id=target_tenant and c.work_order_id=w.id and c.template_revision_id=v.id) then raise exception 'Deze checklistversie is al gekoppeld' using errcode='23514';end if;
 if (select count(*) from public.work_order_checklists c where c.tenant_id=target_tenant and c.work_order_id=w.id)>=20 then raise exception 'Maximaal twintig checklists per werkbon' using errcode='23514';end if;
 select name into template_name from public.work_order_templates where tenant_id=target_tenant and id=v.template_id;
 insert into public.work_order_checklists(tenant_id,work_order_id,template_revision_id,name,definition) values(target_tenant,w.id,v.id,template_name,v.definition);
 update public.work_orders set version=version+1,updated_at=clock_timestamp() where tenant_id=target_tenant and id=w.id returning * into w;
 result:=jsonb_build_object('ok',true,'id',w.id,'version',w.version);
 insert into private.work_order_commands values(mid,target_tenant,auth.uid(),'checklist:attach',hash,result,clock_timestamp());
 insert into public.audit_events(tenant_id,actor_user_id,action,entity_type,entity_id,after_data) values(target_tenant,auth.uid(),'work_order.checklist_added','work_order',w.id,jsonb_build_object('revisionId',v.id,'name',template_name,'version',v.version));
 return result;
end $$;
revoke all on function public.attach_work_order_checklist(uuid,jsonb) from public,anon,service_role;
grant execute on function public.attach_work_order_checklist(uuid,jsonb) to authenticated;
