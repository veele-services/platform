-- Preserve original signed evidence. Separate audience projections from it.
create table if not exists private.work_order_report_ownership (
 report_id uuid primary key,
 tenant_id uuid not null,
 owners jsonb not null,
 foreign key(tenant_id,report_id) references public.work_order_report_versions(tenant_id,id) on delete cascade
);
alter table private.work_order_report_ownership enable row level security;
alter table private.work_order_report_ownership force row level security;
revoke all on private.work_order_report_ownership from public,anon,authenticated,service_role;
create index if not exists report_ownership_tenant_idx on private.work_order_report_ownership(tenant_id,report_id);

create or replace function private.capture_report_ownership()
returns trigger language plpgsql security definer set search_path='' as $$
declare section text;item record;actor uuid;owners jsonb:='{}';part jsonb;
begin
 foreach section in array array['notes','attachments','checklists','materials'] loop
  part:='{}';
  for item in select value,ordinality from jsonb_array_elements(coalesce(new.snapshot->section,'[]')) with ordinality loop
   actor:=null;
   if section='notes' then
    select e.author_user_id into actor from public.report_entries e where e.tenant_id=new.tenant_id and e.work_order_id=new.work_order_id and e.id::text=item.value->>'id';
   elsif section='attachments' then
    select a.uploaded_by into actor from public.attachments a where a.tenant_id=new.tenant_id and a.work_order_id=new.work_order_id and a.id::text=item.value->>'id' and a.sha256=item.value->>'sha256';
   elsif section='materials' then
    select case when count(distinct m.created_by)=1 then min(m.created_by::text)::uuid end into actor
    from public.work_order_material_usage m where m.tenant_id=new.tenant_id and m.work_order_id=new.work_order_id
     and jsonb_build_object('description',m.description,'quantity',m.quantity,'unit',m.unit,'taskId',m.task_id)=item.value;
   else
    -- Existing snapshots identify checklist answers by their offered fields.
    -- Ambiguous matches have no owner; never guess from a matching label alone.
    select case when count(distinct a.updated_by)=1 then min(a.updated_by::text)::uuid end into actor
    from public.work_order_checklists cl join public.work_order_template_versions tv on tv.id=cl.template_revision_id
    cross join lateral jsonb_array_elements(cl.definition->'questions') q
    join public.work_order_checklist_answers a on a.checklist_id=cl.id and a.question_id=q->>'id'
    where cl.tenant_id=new.tenant_id and cl.work_order_id=new.work_order_id
     and jsonb_build_object('name',cl.name,'version',tv.version,'question',q->>'label','unit',q->>'unit','type',q->>'type','value',a.value,'notApplicable',a.not_applicable,'reason',case when a.not_applicable then a.reason else null end,'answerVersion',a.version,'attachmentId',a.attachment_id)=item.value;
   end if;
   if actor is not null then part:=part||jsonb_build_object(item.ordinality::text,actor);end if;
  end loop;
  owners:=owners||jsonb_build_object(section,part);
 end loop;
 insert into private.work_order_report_ownership(report_id,tenant_id,owners) values(new.id,new.tenant_id,owners);
 return new;
end $$;
revoke all on function private.capture_report_ownership() from public,anon,authenticated,service_role;
drop trigger if exists report_capture_ownership on public.work_order_report_versions;
create trigger report_capture_ownership after insert on public.work_order_report_versions for each row execute function private.capture_report_ownership();

create or replace function private.report_backoffice(t uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select private.has_role(t,array['tenant_admin','management','planner','finance']::public.app_role[])
$$;
revoke all on function private.report_backoffice(uuid) from public,anon,service_role;
grant execute on function private.report_backoffice(uuid) to authenticated;

create or replace function private.report_snapshot_for_actor(r public.work_order_report_versions)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;owners jsonb;section text;visible jsonb;
begin
 if private.report_backoffice(r.tenant_id) then return r.snapshot;end if;
 -- Only the documented customer-facing schema crosses a delivery boundary.
 select jsonb_object_agg(key,value) into result from jsonb_each(r.snapshot) where key=any(array['schema','number','title','summary','tenant','customer','object','executionDate','endedAt','timezone','tasks','notes','checklists','materials','attachments']);
 if not private.is_work_order_assignee(r.tenant_id,r.work_order_id) then return result;end if;
 select o.owners into owners from private.work_order_report_ownership o where o.tenant_id=r.tenant_id and o.report_id=r.id;
 foreach section in array array['notes','attachments','checklists','materials'] loop
  select coalesce(jsonb_agg(value order by ordinality),'[]') into visible from jsonb_array_elements(coalesce(result->section,'[]')) with ordinality
   where owners->section->>ordinality::text=auth.uid()::text;
  result:=jsonb_set(result,array[section],visible);
 end loop;
 if r.created_by is distinct from auth.uid() then result:=jsonb_set(result,'{summary}','"Gezamenlijk rapport. Je ziet hier de opdrachtresultaten en je eigen bijdrage."');end if;
 -- Old versions without captured ownership remain intact for backoffice/customer;
 -- private individual contributions are not guessed or reconstructed for staff.
 return result;
end $$;
revoke all on function private.report_snapshot_for_actor(public.work_order_report_versions) from public,anon,authenticated,service_role;

create or replace function private.report_delivery(r public.work_order_report_versions)
returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',r.id,'version',r.version,'state',r.state,'snapshot',private.report_snapshot_for_actor(r),
 'contentHash',r.content_hash,'projection',case when private.report_backoffice(r.tenant_id) then 'original' when private.is_work_order_assignee(r.tenant_id,r.work_order_id) then 'own_contribution' else 'customer_copy' end,
 'policy',r.signature_policy,'createdAt',r.created_at,'approvedAt',r.approved_at,
 'employeeVerified',exists(select 1 from public.signatures s where s.tenant_id=r.tenant_id and s.report_id=r.id and s.signature_kind='employee' and s.revoked_at is null),
 'waiver',(select jsonb_build_object('reason',case when private.report_backoffice(r.tenant_id) then x.reason else 'Klantondertekening door bevoegd beheer vrijgesteld' end,'at',x.created_at) from public.work_order_signature_waivers x where x.report_id=r.id),
 'signatures',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'name',s.signer_name,'capacity',s.signer_capacity,
 'capturedBy',case when private.report_backoffice(r.tenant_id) or s.captured_by=auth.uid() then coalesce(s.captured_by_name,p.full_name,'Medewerker') end,
 'signedAt',s.signed_at,'channel',s.channel,'kind',s.signature_kind) order by s.signed_at,s.id)
 from public.signatures s left join public.personnel p on p.tenant_id=s.tenant_id and p.user_id=s.captured_by
 where s.tenant_id=r.tenant_id and s.report_id=r.id and s.revoked_at is null
 and (s.signature_kind='customer' or private.report_backoffice(r.tenant_id) or (private.is_work_order_assignee(r.tenant_id,r.work_order_id) and s.captured_by=auth.uid()))),'[]'))
$$;
revoke all on function private.report_delivery(public.work_order_report_versions) from public,anon,authenticated,service_role;

create or replace function private.checklist_question_states(c public.work_order_checklists)
returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('questionId',q->>'id',
 'visible',not(q ? 'condition') or exists(select 1 from public.work_order_checklist_answers gate where gate.tenant_id=c.tenant_id and gate.checklist_id=c.id and gate.question_id=q->'condition'->>'questionId' and gate.value=q->'condition'->'equals'),
 'answered',a.id is not null,'editable',a.id is null or a.updated_by=auth.uid() or private.planning_access(c.tenant_id)) order by n),'[]')
 from jsonb_array_elements(c.definition->'questions') with ordinality questions(q,n)
 left join public.work_order_checklist_answers a on a.tenant_id=c.tenant_id and a.checklist_id=c.id and a.question_id=q->>'id'
$$;
revoke all on function private.checklist_question_states(public.work_order_checklists) from public,anon,authenticated,service_role;

create or replace function public.work_order_report(target_work_order_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare w public.work_orders;can_review boolean;can_execute boolean;policy jsonb;
begin
 select * into w from public.work_orders where id=target_work_order_id;
 if not private.object_session_active() or not private.can_access_work_order(w.tenant_id,w.id) or not private.service_enabled(w.tenant_id,'rapportage') then raise exception 'Geen rapporttoegang' using errcode='42501';end if;
 can_review:=private.has_role(w.tenant_id,array['tenant_admin','management','finance']::public.app_role[]);
 can_execute:=private.work_order_execution_actor(w.tenant_id,w.id,auth.uid(),nullif(auth.jwt()->>'session_id','')::uuid);
 policy:=private.work_order_signature_policy(w);
 return jsonb_build_object('orderId',w.id,'orderVersion',w.version,'number',w.work_order_number,'state',w.report_state,'policy',policy,'canReview',can_review,
 'canEditPolicy',private.has_role(w.tenant_id,array['tenant_admin','management']::public.app_role[]) and w.status not in ('cancelled','approved','invoice_ready','invoiced') and w.report_state in ('draft','correction'),'configuredMode',w.signature_mode,'employeeSignatureRequired',w.employee_signature_required,
 'canSubmit',can_execute and w.status not in ('cancelled','approved','invoice_ready','invoiced') and (w.lead_personnel_id is null or exists(select 1 from public.personnel p where p.id=w.lead_personnel_id and p.user_id=auth.uid())),
 'canCapture',can_execute,'canWaive',can_review and exists(select 1 from public.tenant_settings ts where ts.tenant_id=w.tenant_id and coalesce((ts.settings->'workOrders'->>'allowSignatureWaivers')::boolean,false) and coalesce(ts.settings->'workOrders'->'signatureWaiverUsers','[]') ? auth.uid()::text),'legacy',not exists(select 1 from public.work_order_report_versions r where r.work_order_id=w.id),
 'checklists',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'revisionId',v.id,'name',c.name,'version',v.version,'questions',c.definition->'questions','questionStates',private.checklist_question_states(c),'answers',coalesce((select jsonb_agg(jsonb_build_object('questionId',a.question_id,'value',a.value,'notApplicable',a.not_applicable,'reason',a.reason,'attachmentId',a.attachment_id,'version',a.version,'actor',a.updated_by,'updatedAt',a.updated_at) order by a.question_id) from public.work_order_checklist_answers a where a.checklist_id=c.id and (private.report_backoffice(w.tenant_id) or a.updated_by=auth.uid())),'[]')) order by c.created_at,c.id) from public.work_order_checklists c join public.work_order_template_versions v on v.id=c.template_revision_id where c.work_order_id=w.id),'[]'),
 'versions',coalesce((select jsonb_agg(private.report_delivery(r) order by r.version desc) from public.work_order_report_versions r where r.tenant_id=w.tenant_id and r.work_order_id=w.id),'[]'),
 'historicalSignatures',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'name',s.signer_name,'version',s.report_version,'signedAt',s.signed_at)) from public.signatures s where s.tenant_id=w.tenant_id and s.work_order_id=w.id and s.report_id is null and (private.report_backoffice(w.tenant_id) or s.captured_by=auth.uid())),'[]'));
end $$;
revoke all on function public.work_order_report(uuid) from public,anon,service_role;
grant execute on function public.work_order_report(uuid) to authenticated;

create or replace function public.work_order_report_file(target_report_id uuid,asset_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare r public.work_order_report_versions;w public.work_orders;signed_record public.signatures;a public.attachments;allowed boolean;backoffice boolean;staff boolean;
begin
 select * into r from public.work_order_report_versions where id=target_report_id;
 select * into w from public.work_orders where tenant_id=r.tenant_id and id=r.work_order_id;
 backoffice:=private.report_backoffice(w.tenant_id);staff:=private.is_work_order_assignee(w.tenant_id,w.id);
 allowed:=backoffice or staff or(r.state='approved' and exists(select 1 from public.object_customer_bindings b where b.tenant_id=w.tenant_id and b.object_id=w.object_id and b.user_id=auth.uid() and b.active));
 if r.id is null or not private.object_session_active() or not allowed or not private.service_enabled(w.tenant_id,'rapportage') or not exists(select 1 from public.tenants t where t.id=w.tenant_id and t.status='active') then raise exception 'Rapportbestand niet beschikbaar' using errcode='42501';end if;
 if asset_id is not null then
  select * into signed_record from public.signatures where tenant_id=r.tenant_id and report_id=r.id and id=asset_id and revoked_at is null;
  if found then
   if signed_record.signature_kind<>'customer' and not(backoffice or(staff and signed_record.captured_by=auth.uid())) then raise exception 'Ondertekening niet beschikbaar' using errcode='42501';end if;
   return jsonb_build_object('bucket','signatures','path',signed_record.storage_path,'name','handtekening.png','mime','image/png','sha256',signed_record.sha256,'scope',jsonb_build_array(r.tenant_id,w.id));
  end if;
  select * into a from public.attachments where tenant_id=r.tenant_id and work_order_id=w.id and id=asset_id;
  if a.id is null or not exists(select 1 from jsonb_array_elements(private.report_snapshot_for_actor(r)->'attachments') x where x->>'id'=a.id::text and x->>'sha256'=a.sha256) then raise exception 'Bijlage niet beschikbaar in deze rapportweergave' using errcode='42501';end if;
  return jsonb_build_object('bucket',a.storage_bucket,'path',a.storage_path,'name',a.file_name,'mime',a.mime_type,'sha256',a.sha256,
   'scope',case when array_length(string_to_array(a.storage_path,'/'),1)=3 then jsonb_build_array(r.tenant_id,w.id)
     when a.storage_path like r.tenant_id::text||'/'||w.id::text||'/communication/%' then jsonb_build_array(r.tenant_id,w.id,'communication')
     else jsonb_build_array(r.tenant_id,w.id,a.report_entry_id) end);
 end if;
 return private.report_delivery(r);
end $$;
revoke all on function public.work_order_report_file(uuid,uuid) from public,anon,service_role;
grant execute on function public.work_order_report_file(uuid,uuid) to authenticated;

drop policy if exists report_version_audience_boundary on public.work_order_report_versions;
create policy report_version_audience_boundary on public.work_order_report_versions as restrictive for select to authenticated using(private.report_backoffice(tenant_id));
drop policy if exists signature_audience_boundary on public.signatures;
create policy signature_audience_boundary on public.signatures as restrictive for select to authenticated
 using(private.report_backoffice(tenant_id) or (captured_by=(select auth.uid()) and private.is_work_order_assignee(tenant_id,work_order_id)));

do $$ declare definition text;begin
 definition:=pg_get_functiondef('public.staff_workspace(uuid)'::regprocedure);
 if position('s.captured_by=auth.uid()' in definition)=0 then
  definition:=replace(definition,'s.work_order_id=any(ids))','s.work_order_id=any(ids) and s.captured_by=auth.uid())');
  if position('s.captured_by=auth.uid()' in definition)=0 then raise exception 'Signature workspace contract changed';end if;
  execute definition;
 end if;
end $$;
