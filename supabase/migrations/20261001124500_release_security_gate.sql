set local check_function_bodies = off;

-- Customer portal access is bound to a published appointment, not merely to
-- another record sharing the object or customer.
create or replace function private.customer_visit_access(t uuid,o uuid,w uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select w is not null and private.object_session_active() and private.service_enabled(t,'planning')
 and exists(select 1 from public.object_customer_bindings b where b.tenant_id=t and b.object_id=o and b.user_id=auth.uid() and b.active)
 and exists(select 1 from public.work_orders x where x.tenant_id=t and x.object_id=o and x.id=w
   and x.published_at is not null and x.planning_state='final' and x.archive_at is null and x.status<>'cancelled');
$$;
revoke all on function private.customer_visit_access(uuid,uuid,uuid) from public,anon;
grant execute on function private.customer_visit_access(uuid,uuid,uuid) to authenticated;

create or replace function private.object_visit_access(t uuid,o uuid,w uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select private.object_session_active() and exists(select 1 from public.tenants x where x.id=t and x.status='active') and (
   private.object_manage(t)
   or private.customer_visit_access(t,o,w)
   or (w is null and exists(select 1 from public.object_customer_bindings b where b.tenant_id=t and b.object_id=o and b.user_id=auth.uid() and b.active and b.manage_secrets))
   or exists(select 1 from public.work_order_assignments a
     join public.personnel p on p.tenant_id=a.tenant_id and p.id=a.personnel_id
     join public.work_orders wo on wo.tenant_id=a.tenant_id and wo.id=a.work_order_id
     join public.tenant_memberships m on m.tenant_id=p.tenant_id and m.user_id=p.user_id
     where a.tenant_id=t and wo.object_id=o and wo.id=w and p.user_id=auth.uid() and p.status='active' and m.status='active'
       and 'staff'=any(m.roles) and private.service_enabled(t,'planning')
       and a.status not in ('cancelled','returned') and wo.status<>'cancelled'
       and exists(select 1 from public.dispatches d where d.tenant_id=t and d.assignment_id=a.id and d.revoked_at is null))
 ) and (w is null or exists(select 1 from public.work_orders wo where wo.tenant_id=t and wo.id=w and wo.object_id=o));
$$;

create or replace function public.customer_object_visits(target_tenant uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if not private.object_session_active() or not exists(select 1 from public.tenants where id=target_tenant and status='active') then raise exception 'Geen toegang' using errcode='42501';end if;
 return coalesce((select jsonb_agg(jsonb_build_object(
   'id',o.id,'name',o.name,'number',o.object_number,'address',o.address,'manageSecrets',b.manage_secrets,
   'visits',coalesce((select jsonb_agg(jsonb_build_object('id',w.id,'number',w.work_order_number,'start',w.projected_start_at,'end',w.projected_end_at,'status',w.status,'service',w.discipline) order by w.projected_start_at desc nulls last)
     from public.work_orders w where w.tenant_id=target_tenant and w.object_id=o.id and private.customer_visit_access(target_tenant,o.id,w.id)),'[]')) order by o.name)
   from public.object_customer_bindings b join public.objects o on o.tenant_id=b.tenant_id and o.id=b.object_id
   where b.tenant_id=target_tenant and b.user_id=auth.uid() and b.active),'[]');
end $$;

create or replace function private.object_visit_projection(target_tenant uuid,target_object uuid,target_order uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare o public.objects;w public.work_orders;result jsonb;manager boolean;customer boolean;
begin
 if not private.object_visit_access(target_tenant,target_object,target_order) then raise exception 'Geen toegang tot deze uitvoering' using errcode='42501';end if;
 manager:=private.object_manage(target_tenant);
 customer:=exists(select 1 from public.object_customer_bindings b where b.tenant_id=target_tenant and b.object_id=target_object and b.user_id=auth.uid() and b.active);
 select * into o from public.objects where tenant_id=target_tenant and id=target_object;
 select * into w from public.work_orders where tenant_id=target_tenant and id=target_order and object_id=o.id;
 result:=jsonb_build_object('object',jsonb_build_object('id',o.id,'name',o.name,'number',o.object_number,'address',o.address,'instructions',case when customer and not manager then '' else o.access_instructions end,'status',o.dossier_status),
   'order',case when w.id is null then null else jsonb_build_object('id',w.id,'number',w.work_order_number,'start',w.projected_start_at,'end',w.projected_end_at,'status',w.status,'service',w.discipline) end,
   'customer',customer,'manager',manager,'userId',auth.uid());
 return result||jsonb_build_object(
   'nodes',coalesce((select jsonb_agg(jsonb_build_object('id',n.id,'name',n.name,'parentId',n.parent_id,'kind',n.kind) order by n.position,n.name) from public.object_nodes n where n.tenant_id=target_tenant and n.object_id=o.id and n.active),'[]'),
   'instructions',case when customer and not manager then '[]'::jsonb else coalesce((select jsonb_agg(to_jsonb(r)||jsonb_build_object('read',exists(select 1 from public.object_instruction_receipts rc where rc.record_id=r.id and rc.record_version=r.version and rc.work_order_id=w.id and rc.user_id=auth.uid()))) from public.object_records r where r.tenant_id=target_tenant and r.object_id=o.id and r.kind='instruction' and r.state='active' and (r.service='' or r.service=w.discipline) and (r.work_order_id is null or r.work_order_id=w.id) and r.starts_at<=coalesce(w.projected_end_at,clock_timestamp()) and (r.ends_at is null or r.ends_at>=coalesce(w.projected_start_at,clock_timestamp()))),'[]') end,
   'requests',coalesce((select jsonb_agg(
     (case when customer and not manager then jsonb_build_object('id',r.id,'tenant_id',r.tenant_id,'object_id',r.object_id,'work_order_id',r.work_order_id,'node_id',r.node_id,'title',r.title,'body',r.body,'kind',r.kind,'priority',r.priority,'feedback',r.feedback,'state',r.state,'needs_review',r.needs_review,'response',r.response,'work_order_task_id',r.work_order_task_id,'version',r.version,'created_by',r.created_by,'created_at',r.created_at,'updated_at',r.updated_at) else to_jsonb(r) end)
     ||jsonb_build_object('read',exists(select 1 from public.object_request_receipts rc where rc.request_id=r.id and rc.version=r.version and rc.user_id=auth.uid()),
       'documents',coalesce((select jsonb_agg(jsonb_build_object('id',d.id,'title',d.title,'version',d.version,'mime',d.mime_type)) from public.object_documents d where d.request_id=r.id and d.tenant_id=target_tenant and d.category<>'security'),'[]'),
       'proposals',coalesce((select jsonb_agg(case when customer and not manager then jsonb_build_object('id',p.id,'version',p.version,'title',p.title,'scope',p.scope,'quantity',p.quantity,'price_cents',p.price_cents,'vat_basis_points',p.vat_basis_points,'accepted_at',p.accepted_at) else to_jsonb(p) end order by p.version desc) from public.object_request_proposals p where p.request_id=r.id),'[]')))
     from public.object_visit_requests r where r.tenant_id=target_tenant and r.object_id=o.id
       and (not customer or manager or (w.id is not null and r.work_order_id=w.id and r.created_by=auth.uid()))
       and (customer or w.id is null or r.work_order_id=w.id)),'[]'));
end $$;

-- A customer may attach evidence only to a request they created. Managers keep
-- their existing exact-object dossier capability.
create or replace function public.register_visit_attachment(target_tenant uuid,target_request uuid,input jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare r public.object_visit_requests;id uuid;
begin
 perform pg_advisory_xact_lock(hashtextextended('fieldgrid-planning:'||target_tenant::text,0));
 select * into r from public.object_visit_requests where tenant_id=target_tenant and object_visit_requests.id=target_request;
 if r.id is null or not private.object_visit_access(target_tenant,r.object_id,r.work_order_id)
   or (r.created_by<>auth.uid() and not private.object_manage(target_tenant))
   or not exists(select 1 from public.work_orders w where w.tenant_id=target_tenant and w.id=r.work_order_id and w.status in ('planned','released','seen','travelling','in_progress'))
 then raise exception 'Geen toegang tot dit verzoek' using errcode='42501';end if;
 insert into public.object_documents(tenant_id,object_id,work_order_id,request_id,title,category,storage_path,mime_type,file_name,size_bytes)
 values(target_tenant,r.object_id,r.work_order_id,r.id,input->>'title','photo',input->>'path',input->>'mime',input->>'fileName',(input->>'size')::bigint) returning object_documents.id into id;
 return id;
end $$;

create or replace function public.get_object_document(target_tenant uuid,target_document uuid,target_order uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare d public.object_documents;manager boolean;customer boolean;
begin
 if not private.object_session_active() then return null;end if;
 select * into d from public.object_documents where tenant_id=target_tenant and id=target_document;
 manager:=private.object_manage(target_tenant);
 customer:=exists(select 1 from public.object_customer_bindings b where b.tenant_id=target_tenant and b.object_id=d.object_id and b.user_id=auth.uid() and b.active);
 if d.id is null then return null;end if;
 if d.category='security' then
   if not manager or not private.has_role(target_tenant,array['tenant_admin','management']::public.app_role[]) then return null;end if;
 elsif not manager then
   if d.work_order_id is not null and d.work_order_id is distinct from target_order then return null;end if;
   if not private.object_visit_access(target_tenant,d.object_id,target_order) then return null;end if;
   if customer and (d.request_id is null or not exists(select 1 from public.object_visit_requests r where r.tenant_id=target_tenant and r.id=d.request_id and r.object_id=d.object_id and r.work_order_id=target_order and r.created_by=auth.uid())) then return null;end if;
 end if;
 return jsonb_build_object('path',d.storage_path,'name',d.file_name,'mime',d.mime_type,'title',d.title);
end $$;

-- A customer receipt may only acknowledge that customer's own request. Staff
-- receipts still require the concrete live assignment that granted the visit.
create or replace function public.acknowledge_object_request(target_tenant uuid,target_request uuid,expected_version bigint)
returns void language plpgsql security definer set search_path='' as $$
declare r public.object_visit_requests;assigned boolean;
begin
 perform pg_advisory_xact_lock(hashtextextended('fieldgrid-planning:'||target_tenant::text,0));
 select * into r from public.object_visit_requests where tenant_id=target_tenant and id=target_request;
 assigned:=exists(select 1 from public.work_order_assignments a
   join public.personnel p on p.tenant_id=a.tenant_id and p.id=a.personnel_id
   join public.tenant_memberships m on m.tenant_id=p.tenant_id and m.user_id=p.user_id
   join public.dispatches d on d.tenant_id=a.tenant_id and d.assignment_id=a.id and d.revoked_at is null
   where a.tenant_id=target_tenant and a.work_order_id=r.work_order_id and p.user_id=auth.uid()
     and p.status='active' and m.status='active' and 'staff'=any(m.roles)
     and a.status not in ('cancelled','returned'));
 if r.id is null or not private.object_visit_access(target_tenant,r.object_id,r.work_order_id)
   or (r.created_by<>auth.uid() and not private.object_manage(target_tenant) and not assigned)
 then raise exception 'Geen toegang' using errcode='42501';end if;
 if r.version<>expected_version then raise exception 'Dit verzoek is gewijzigd. Lees de actuele versie.' using errcode='40001';end if;
 insert into public.object_request_receipts(tenant_id,object_id,request_id,version,user_id)
 values(target_tenant,r.object_id,r.id,r.version,auth.uid()) on conflict do nothing;
end $$;

create or replace function public.accept_object_proposal(target_tenant uuid,target_proposal uuid)
returns void language plpgsql security definer set search_path='' as $$
declare p public.object_request_proposals;r public.object_visit_requests;rev public.task_revisions;cat public.task_catalog;task uuid;
begin
 perform pg_advisory_xact_lock(hashtextextended('fieldgrid-planning:'||target_tenant::text,0));
 select * into p from public.object_request_proposals where tenant_id=target_tenant and id=target_proposal for update;
 select * into r from public.object_visit_requests where tenant_id=target_tenant and id=p.request_id for update;
 if p.id is null or r.id is null or r.created_by<>auth.uid() or not private.customer_visit_access(target_tenant,p.object_id,r.work_order_id) then raise exception 'Geen toegang tot dit voorstel' using errcode='42501';end if;
 if p.accepted_at is not null then return;end if;
 if r.state<>'proposal' or r.needs_review or r.work_order_task_id is not null or exists(select 1 from public.object_request_proposals n where n.request_id=p.request_id and n.version>p.version) then raise exception 'Dit voorstel is gewijzigd. Bekijk de nieuwste versie.' using errcode='40001';end if;
 select * into rev from public.task_revisions where id=p.task_revision_id and tenant_id=target_tenant;
 select * into cat from public.task_catalog where id=rev.task_id and tenant_id=target_tenant;
 update public.object_request_proposals set accepted_by=auth.uid(),accepted_at=clock_timestamp() where id=p.id;
 insert into public.work_order_tasks(tenant_id,work_order_id,task_revision_id,task_code,task_name,duration_minutes,quantity,unit,unit_price_cents,vat_basis_points,is_extra_work,extra_work_status,added_by)
 values(target_tenant,r.work_order_id,rev.id,cat.code,p.title,rev.duration_minutes,p.quantity,rev.unit,p.price_cents,p.vat_basis_points,true,'awaiting_review',auth.uid()) returning id into task;
 update public.object_visit_requests set state='accepted',work_order_task_id=task where id=r.id;
 perform private.object_notify(target_tenant,r.object_id,r.work_order_id,'accepted:'||p.id::text);
end $$;

create or replace function public.file_upload_allowed(target_bucket text,target_path text,visit_request uuid default null)
returns boolean language plpgsql stable security definer set search_path='' as $$
declare parts text[]:=string_to_array(target_path,'/');t uuid;parent uuid;allowed boolean:=false;
begin
 if not private.actor_session_active() or array_length(parts,1)<2 or target_path ~ '[%?#[:cntrl:]]' or position(chr(92) in target_path)>0 or exists(select 1 from unnest(parts) p where p in ('','.','..')) then return false;end if;
 t:=private.storage_tenant_id(target_path);if t is null or not exists(select 1 from public.tenants where id=t and status='active') then return false;end if;
 if target_bucket='branding' then return array_length(parts,1)=2 and (private.is_platform_admin() or private.has_role(t,array['tenant_admin','management']::public.app_role[]));end if;
 if target_bucket='commercial-documents' then
   if array_length(parts,1)<>4 or not private.commercial_member(t) then return false;end if;
   begin parent:=parts[3]::uuid;exception when invalid_text_representation then return false;end;
   return (parts[2]='request' and exists(select 1 from public.requests r where r.tenant_id=t and r.id=parent)) or (parts[2]='quote' and exists(select 1 from public.quotes q where q.tenant_id=t and q.id=parent));
 end if;
 parent:=private.storage_subject_id(target_path);if parent is null then return false;end if;
 if target_bucket='object-documents' then
   if array_length(parts,1)<>3 or not exists(select 1 from public.objects o where o.tenant_id=t and o.id=parent) then return false;end if;
   if visit_request is not null then return exists(select 1 from public.object_visit_requests r join public.work_orders w on w.tenant_id=r.tenant_id and w.id=r.work_order_id
     where r.id=visit_request and r.tenant_id=t and r.object_id=parent and (r.created_by=auth.uid() or private.object_manage(t))
       and private.object_visit_access(t,parent,w.id) and w.status in ('planned','released','seen','travelling','in_progress'));end if;
   return private.object_manage(t);
 elsif target_bucket='customer-documents' then return private.can_manage_customer_document(target_path);
 elsif target_bucket='personnel-documents' then return array_length(parts,1)=3 and private.service_enabled(t,'personeel') and private.can_access_storage_object(target_bucket,target_path,true) and exists(select 1 from public.personnel p where p.tenant_id=t and p.id=parent);
 elsif target_bucket='invoices' then return array_length(parts,1)=3 and private.service_enabled(t,'finance') and private.can_access_storage_object(target_bucket,target_path,true) and exists(select 1 from public.invoices i where i.tenant_id=t and i.id=parent);
 elsif target_bucket='signatures' then return array_length(parts,1)=3 and exists(select 1 from private.work_order_signature_intents i where i.tenant_id=t and i.work_order_id=parent and i.storage_path=target_path and i.actor_id=auth.uid() and i.session_id=nullif(auth.jwt()->>'session_id','')::uuid and i.consumed_at is null and private.work_order_execution_actor(t,parent,auth.uid(),i.session_id));
 elsif target_bucket='reports' then return array_length(parts,1)=4 and private.service_enabled(t,'rapportage') and private.can_access_storage_object(target_bucket,target_path,true) and exists(select 1 from public.work_orders w where w.tenant_id=t and w.id=parent);
 end if;return allowed;
end $$;

-- Customer dossier documents require an exact object audience. Existing
-- customer-wide shares fail closed and must be reviewed before re-sharing.
alter table public.customer_documents add column portal_object_id uuid;
alter table public.customer_documents add constraint customer_documents_portal_object_fkey foreign key(tenant_id,portal_object_id) references public.objects(tenant_id,id) on delete restrict;
update public.customer_documents set visibility='internal' where visibility='customer';

create or replace function private.customer_document_scope_guard()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.visibility='customer' then
   if new.portal_object_id is null or not exists(select 1 from public.objects o where o.tenant_id=new.tenant_id and o.id=new.portal_object_id and o.customer_id=new.customer_id) then raise exception 'Kies het exacte klantobject waarmee dit document wordt gedeeld' using errcode='23514';end if;
 else new.portal_object_id:=null;end if;
 return new;
end $$;
create trigger customer_document_scope_guard before insert or update of visibility,portal_object_id,customer_id on public.customer_documents for each row execute function private.customer_document_scope_guard();

create or replace function private.customer_document_access(t uuid,d uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select private.object_session_active() and exists(select 1 from public.customer_documents x
 join public.object_customer_bindings b on b.tenant_id=x.tenant_id and b.object_id=x.portal_object_id and b.user_id=auth.uid() and b.active
 where x.tenant_id=t and x.id=d and x.visibility='customer' and not x.archived and x.portal_object_id is not null);
$$;
revoke all on function private.customer_document_access(uuid,uuid) from public,anon;
grant execute on function private.customer_document_access(uuid,uuid) to authenticated;

create or replace function public.customer_document_metadata(target_tenant uuid,target_document uuid,expected_version bigint,input_category text,input_visibility text,portal_object uuid,input_archived boolean)
returns void language plpgsql security definer set search_path='' as $$
begin
 if not private.customer_manage(target_tenant) or input_category not in ('agreement','correspondence','report','photo','other') or input_visibility not in ('internal','customer') then raise exception 'Geen toegang' using errcode='42501';end if;
 update public.customer_documents set category=input_category,visibility=input_visibility,
   portal_object_id=case when input_visibility='customer' then portal_object else null end,
   archived=input_archived,metadata_version=metadata_version+1
 where tenant_id=target_tenant and id=target_document and metadata_version=expected_version;
 if not found then raise exception 'Document intussen gewijzigd of niet beschikbaar' using errcode='40001';end if;
end $$;
revoke all on function public.customer_document_metadata(uuid,uuid,bigint,text,text,uuid,boolean) from public,anon,service_role;
grant execute on function public.customer_document_metadata(uuid,uuid,bigint,text,text,uuid,boolean) to authenticated;

create or replace function public.customer_portal_documents(target_tenant uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not private.object_session_active() then raise exception 'Geen toegang' using errcode='42501';end if;
 return jsonb_build_object(
 'documents',coalesce((select jsonb_agg(jsonb_build_object('id',d.id,'title',d.title,'version',d.version,'category',d.category,'date',d.document_on,'validUntil',d.valid_until)) from public.customer_documents d where d.tenant_id=target_tenant and private.customer_document_access(target_tenant,d.id)),'[]'),
 'reports',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'body',r.body,'at',r.created_at,'orderId',w.id,'number',w.work_order_number,'object',o.name)) from public.report_entries r join public.work_orders w on w.tenant_id=r.tenant_id and w.id=r.work_order_id join public.objects o on o.tenant_id=w.tenant_id and o.id=w.object_id where r.tenant_id=target_tenant and private.service_enabled(target_tenant,'rapportage') and r.customer_visible and r.deleted_at is null and w.status in ('approved','invoice_ready','invoiced') and exists(select 1 from public.object_customer_bindings b where b.tenant_id=target_tenant and b.object_id=o.id and b.user_id=auth.uid() and b.active)),'[]'),
 'workReports',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'version',r.version,'number',r.snapshot->>'number','object',r.snapshot->'object'->>'name','approvedAt',r.approved_at) order by r.approved_at desc,r.version desc) from public.work_order_report_versions r join public.work_orders w on w.tenant_id=r.tenant_id and w.id=r.work_order_id where r.tenant_id=target_tenant and r.state='approved' and private.service_enabled(target_tenant,'rapportage') and exists(select 1 from public.object_customer_bindings b where b.tenant_id=target_tenant and b.object_id=w.object_id and b.user_id=auth.uid() and b.active)),'[]'),
 'invoices',coalesce((select jsonb_agg(jsonb_build_object('id',i.id,'number',i.invoice_number,'date',i.issued_on,'due',i.due_on,'total',i.total_cents,'paid',i.paid_cents,'status',i.status,'pdf',i.pdf_storage_path is not null)) from public.invoices i where i.tenant_id=target_tenant and private.customer_invoice_access(target_tenant,i.id)),'[]'));
end $$;

create or replace function public.customer_file_access(target_tenant uuid,target_id uuid,kind text)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if not private.object_session_active() then raise exception 'Geen toegang' using errcode='42501';end if;
 if kind='document' then select jsonb_build_object('bucket','customer-documents','path',d.storage_path,'name',d.file_name,'mime',d.mime_type) into result from public.customer_documents d where d.tenant_id=target_tenant and d.id=target_id and (private.customer_manage(target_tenant) or private.customer_document_access(target_tenant,d.id));
 elsif kind='invoice' then select jsonb_build_object('bucket','invoices','path',i.pdf_storage_path,'name',i.invoice_number||'.pdf','mime','application/pdf') into result from public.invoices i where i.tenant_id=target_tenant and i.id=target_id and i.pdf_storage_path is not null and ((private.commercial_access(target_tenant) and private.service_enabled(target_tenant,'finance')) or private.customer_invoice_access(target_tenant,i.id));end if;
 if result is null then raise exception 'Document niet beschikbaar' using errcode='42501';end if;return result;
end $$;

-- Staff can express interest only through one eligibility-checking command.
create or replace function private.open_shift_eligible(t uuid,s uuid,p uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select private.object_session_active() and exists(select 1 from public.open_shifts x
 join public.personnel personnel on personnel.tenant_id=x.tenant_id and personnel.id=p and personnel.user_id=auth.uid() and personnel.status='active'
 join public.personnel_functions pf on pf.tenant_id=personnel.tenant_id and pf.personnel_id=personnel.id and pf.function_id=x.function_id
 where x.tenant_id=t and x.id=s and x.status='open' and not exists(select 1 from unnest(x.required_certificate_codes) required_code where not exists(
   select 1 from public.qualifications q where q.tenant_id=t and q.personnel_id=p and q.code=required_code and (q.valid_until is null or q.valid_until>=current_date))));
$$;
revoke all on function private.open_shift_eligible(uuid,uuid,uuid) from public,anon;
grant execute on function private.open_shift_eligible(uuid,uuid,uuid) to authenticated;

create or replace function public.set_shift_interest(target_tenant uuid,target_shift uuid,interested boolean)
returns void language plpgsql security definer set search_path='' as $$
declare pid uuid;current_status text;
begin
 select p.id into pid from public.personnel p where p.tenant_id=target_tenant and p.user_id=auth.uid() and p.status='active';
 perform 1 from public.open_shifts s where s.tenant_id=target_tenant and s.id=target_shift for update;
 if pid is null or not private.open_shift_eligible(target_tenant,target_shift,pid) then raise exception 'Deze open dienst is niet beschikbaar voor jouw functie en geldige kwalificaties' using errcode='42501';end if;
 select status into current_status from public.shift_interests where tenant_id=target_tenant and open_shift_id=target_shift and personnel_id=pid for update;
 if current_status in ('selected','rejected') then raise exception 'De planner heeft deze reactie al verwerkt' using errcode='23514';end if;
 insert into public.shift_interests(tenant_id,open_shift_id,personnel_id,status) values(target_tenant,target_shift,pid,case when interested then 'interested' else 'withdrawn' end)
 on conflict(tenant_id,open_shift_id,personnel_id) do update set status=excluded.status,updated_at=clock_timestamp();
end $$;
revoke all on function public.set_shift_interest(uuid,uuid,boolean) from public,anon,service_role;
grant execute on function public.set_shift_interest(uuid,uuid,boolean) to authenticated;
revoke insert,update,delete on public.shift_interests from authenticated;

create or replace function public.staff_workspace(target_tenant uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare ids uuid[];pid uuid;result jsonb;
begin
 if not private.object_session_active() or not private.has_role(target_tenant,array['staff']::public.app_role[]) or not private.service_enabled(target_tenant,'personeel') then raise exception 'Personeelstoegang vereist' using errcode='42501';end if;
 select p.id into pid from public.personnel p where p.tenant_id=target_tenant and p.user_id=auth.uid() and p.status='active';
 if pid is null then raise exception 'Geen actief personeelsdossier' using errcode='42501';end if;
 select coalesce(array_agg(w.id),'{}') into ids from public.work_orders w where w.tenant_id=target_tenant and private.service_enabled(target_tenant,'planning') and private.is_work_order_assignee(target_tenant,w.id);
 select jsonb_build_object(
 'customers',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'tenant_id',c.tenant_id,'name',c.name)) from public.customers c where c.tenant_id=target_tenant and exists(select 1 from public.work_orders w where w.id=any(ids) and w.customer_id=c.id)),'[]'),
 'objects',coalesce((select jsonb_agg(jsonb_build_object('id',o.id,'tenant_id',o.tenant_id,'name',o.name,'address',o.address)) from public.objects o where o.tenant_id=target_tenant and exists(select 1 from public.work_orders w where w.id=any(ids) and w.object_id=o.id)),'[]'),
 'personnel',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'tenant_id',p.tenant_id,'user_id',p.user_id,'employee_number',p.employee_number,'full_name',p.full_name,'status',p.status)) from public.personnel p where p.tenant_id=target_tenant and p.id=pid),'[]'),
 'workOrders',coalesce((select jsonb_agg(jsonb_build_object('id',w.id,'tenant_id',w.tenant_id,'customer_id',w.customer_id,'object_id',w.object_id,'work_order_number',w.work_order_number,'discipline',w.discipline,'title',w.title,'status',w.status,'version',w.version,'report_version',w.report_version,'report_state',w.report_state,'signature_required',w.signature_required,'day_instructions',w.day_instructions,'projected_start_at',w.projected_start_at,'projected_end_at',w.projected_end_at,'actual_start_at',w.actual_start_at,'actual_end_at',w.actual_end_at)) from public.work_orders w where w.id=any(ids)),'[]'),
 'assignments',coalesce((select jsonb_agg(to_jsonb(a)-'qualification_snapshot') from public.work_order_assignments a where a.tenant_id=target_tenant and a.work_order_id=any(ids) and a.personnel_id=pid),'[]'),
 'workOrderTasks',coalesce((select jsonb_agg(private.staff_task_dto(t)) from public.work_order_tasks t where t.tenant_id=target_tenant and t.work_order_id=any(ids)),'[]'),
 'tasks',coalesce((select jsonb_agg(to_jsonb(c)) from public.task_catalog c where private.service_enabled(target_tenant,'planning') and c.tenant_id=target_tenant),'[]'),
 'taskRevisions',coalesce((select jsonb_agg(to_jsonb(r)-array['price_cents','vat_basis_points']) from public.task_revisions r where private.service_enabled(target_tenant,'planning') and r.tenant_id=target_tenant),'[]'),
 'reports',coalesce((select jsonb_agg(to_jsonb(e)) from public.report_entries e where private.service_enabled(target_tenant,'rapportage') and e.tenant_id=target_tenant and e.work_order_id=any(ids) and e.author_user_id=auth.uid() and e.deleted_at is null),'[]'),
 'attachments',coalesce((select jsonb_agg(to_jsonb(a)-array['storage_path','storage_bucket']) from public.attachments a where private.service_enabled(target_tenant,'rapportage') and a.tenant_id=target_tenant and a.work_order_id=any(ids) and a.uploaded_by=auth.uid() and private.owns_report_path(a.tenant_id,a.work_order_id,a.storage_path) and a.deleted_at is null),'[]'),
 'signatures',coalesce((select jsonb_agg(to_jsonb(s)-array['storage_path']) from public.signatures s where private.service_enabled(target_tenant,'rapportage') and s.tenant_id=target_tenant and s.work_order_id=any(ids) and s.captured_by=auth.uid()),'[]'),
 'timeEntries',coalesce((select jsonb_agg(to_jsonb(e)) from public.time_entries e where e.tenant_id=target_tenant and e.personnel_id=pid),'[]'),
 'announcements',coalesce((select jsonb_agg(to_jsonb(a)) from public.announcements a where a.tenant_id=target_tenant and a.published_at<=clock_timestamp() and a.withdrawn_at is null and 'staff'=any(a.audience_roles)),'[]'),
 'announcementReads',coalesce((select jsonb_agg(to_jsonb(a)) from public.announcement_reads a where a.tenant_id=target_tenant and a.user_id=auth.uid() and private.announcement_read_allowed(a.tenant_id,a.announcement_id)),'[]'),
 'openShifts',coalesce((select jsonb_agg(to_jsonb(a)) from public.open_shifts a where private.service_enabled(target_tenant,'planning') and a.tenant_id=target_tenant and private.open_shift_eligible(target_tenant,a.id,pid)),'[]'),
 'shiftInterests',coalesce((select jsonb_agg(to_jsonb(a)) from public.shift_interests a where private.service_enabled(target_tenant,'planning') and a.tenant_id=target_tenant and a.personnel_id=pid),'[]'),
 'personnelDocuments',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'tenant_id',a.tenant_id,'personnel_id',a.personnel_id,'title',a.title,'file_name',a.file_name,'version',a.version,'visible_to_employee',a.visible_to_employee)) from public.personnel_documents a where a.tenant_id=target_tenant and a.personnel_id=pid and a.visible_to_employee and not a.dossier_managed),'[]'),
 'extraWorkRules',coalesce((select jsonb_agg(to_jsonb(a)) from public.extra_work_rules a where private.service_enabled(target_tenant,'planning') and private.service_enabled(target_tenant,'rapportage') and a.tenant_id=target_tenant and a.active),'[]'),
 'allowedExtraWork',coalesce((select jsonb_agg(to_jsonb(a)) from public.work_order_allowed_extra_work a where private.service_enabled(target_tenant,'rapportage') and a.tenant_id=target_tenant and a.work_order_id=any(ids)),'[]'),
 'travelLegs',coalesce((select jsonb_agg(to_jsonb(l)-array['origin_address','destination_address']) from public.travel_legs l join public.work_order_assignments a on a.id=l.assignment_id and a.tenant_id=l.tenant_id where a.tenant_id=target_tenant and a.personnel_id=pid and a.work_order_id=any(ids)),'[]')) into result;
 return result;
end $$;

-- Raw subordinate work-order rows are never a coworker or internal-review API.
drop policy if exists dispatches_personal_execution on public.dispatches;
create policy dispatches_personal_execution on public.dispatches as restrictive for select to authenticated using (
 private.has_role(tenant_id,array['tenant_admin','management','planner','finance']::public.app_role[])
 or exists(select 1 from public.work_order_assignments a where a.tenant_id=dispatches.tenant_id and a.id=dispatches.assignment_id and a.personnel_id=private.current_personnel_id(a.tenant_id)));
drop policy if exists review_decisions_backoffice_only on public.review_decisions;
create policy review_decisions_backoffice_only on public.review_decisions as restrictive for select to authenticated using (private.has_role(tenant_id,array['tenant_admin','management','planner','finance']::public.app_role[]));

-- A revoked database session cannot keep using a still-valid JWT to inspect
-- privilege topology through direct Data API reads.
drop policy if exists tenant_memberships_read on public.tenant_memberships;
create policy tenant_memberships_read on public.tenant_memberships for select to authenticated using (
 private.actor_session_active() and (user_id=auth.uid() or private.has_role(tenant_id,array['tenant_admin','management','hr']::public.app_role[])));
drop policy if exists object_bindings_read on public.object_customer_bindings;
create policy object_bindings_read on public.object_customer_bindings for select to authenticated using (
 private.actor_session_active() and (private.object_manage(tenant_id) or (user_id=auth.uid() and active)));
drop policy if exists object_request_receipts_read on public.object_request_receipts;
create policy object_request_receipts_read on public.object_request_receipts for select to authenticated using (
 private.actor_session_active() and (private.object_manage(tenant_id) or (user_id=auth.uid() and exists(select 1 from public.object_visit_requests r where r.tenant_id=object_request_receipts.tenant_id and r.id=object_request_receipts.request_id and r.created_by=auth.uid()))));

-- Coalesce public checkout refreshes so one capability cannot fan out into
-- concurrent provider requests. The lease contains no provider credential.
alter table public.payment_attempts add column provider_check_lease uuid;
alter table public.payment_attempts add column provider_check_until timestamptz;

create or replace function public.claim_provider_payment_check(target_attempt uuid,lease_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.payment_attempts;
begin
 if coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'role','')<>'service_role' or lease_id is null then raise exception 'Service role required' using errcode='42501';end if;
 select * into a from public.payment_attempts where id=target_attempt for update;
 if a.id is null or a.provider<>'mollie' or a.status not in ('open','pending') then raise exception 'Betaalpoging niet beschikbaar' using errcode='23514';end if;
 if a.checkout_url is not null and a.last_checked_at>clock_timestamp()-interval '30 seconds' then return jsonb_build_object('action','reuse');end if;
 if a.provider_check_until>clock_timestamp() and a.provider_check_lease is distinct from lease_id then return jsonb_build_object('action','busy','retryAfter',greatest(1,ceil(extract(epoch from a.provider_check_until-clock_timestamp()))::int));end if;
 update public.payment_attempts set provider_check_lease=lease_id,provider_check_until=clock_timestamp()+interval '15 seconds' where id=a.id;
 return jsonb_build_object('action','provider');
end $$;
revoke all on function public.claim_provider_payment_check(uuid,uuid) from public,anon,authenticated;
grant execute on function public.claim_provider_payment_check(uuid,uuid) to service_role;

create or replace function public.release_provider_payment_check(target_attempt uuid,lease_id uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
 if coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'role','')<>'service_role' or lease_id is null then raise exception 'Service role required' using errcode='42501';end if;
 update public.payment_attempts set provider_check_lease=null,provider_check_until=null where id=target_attempt and provider_check_lease=lease_id;
end $$;
revoke all on function public.release_provider_payment_check(uuid,uuid) from public,anon,authenticated;
grant execute on function public.release_provider_payment_check(uuid,uuid) to service_role;

commit;
