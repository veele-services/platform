-- Use the insertion instant to preserve crew order, including bulk assignment inserts.
alter table public.work_order_assignments alter column created_at set default clock_timestamp();
-- One live, deterministic owner of customer delivery. Existing reports stay immutable.
create or replace function private.delivery_personnel(t uuid,w uuid) returns uuid
language sql stable security definer set search_path='' as $$
 select a.personnel_id from public.work_order_assignments a
 where a.tenant_id=t and a.work_order_id=w and a.status not in('cancelled','returned')
 order by a.planned_start_at,a.created_at,case when a.personnel_id=(select lead_personnel_id from public.work_orders where tenant_id=t and id=w) then 0 else 1 end,a.id limit 1;
$$;
revoke all on function private.delivery_personnel(uuid,uuid) from public,anon,authenticated,service_role;
create or replace function private.is_delivery_owner(t uuid,w uuid,u uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.personnel p where p.tenant_id=t and p.id=private.delivery_personnel(t,w) and p.user_id=u and p.status='active');
$$;
revoke all on function private.is_delivery_owner(uuid,uuid,uuid) from public,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.submit_work_order_report(target_work_order_id uuid, expected_version bigint, summary text, idempotency_key uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare w public.work_orders;r public.work_order_report_versions;body jsonb;policy jsonb;n integer;s uuid;
begin
 select * into w from public.work_orders where id=target_work_order_id;
 s:=nullif(auth.jwt()->>'session_id','')::uuid;
 if not private.work_order_execution_actor(w.tenant_id,w.id,auth.uid(),s) then raise exception 'Actuele personeelsuitvoering vereist' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended('fieldgrid-planning:'||w.tenant_id::text,0));select * into w from public.work_orders where id=w.id for update;
 select * into r from public.work_order_report_versions where tenant_id=w.tenant_id and submission_key=idempotency_key;
 if found then if r.work_order_id<>w.id or r.created_by<>auth.uid() or r.snapshot->>'summary'<>btrim(summary) then raise exception 'Ongeldige herhaalsleutel' using errcode='23514';end if;return jsonb_build_object('id',r.id,'version',r.version,'state',r.state);end if;
 if w.version is distinct from expected_version then raise exception 'De werkbon is gewijzigd. Herlaad voor oplevering.' using errcode='40001';end if;
 if w.status in ('cancelled','invoice_ready','invoiced','approved') or length(btrim(summary)) not between 3 and 5000 then raise exception 'Controleer de rapportsamenvatting en actuele fase' using errcode='23514';end if;
 if not private.is_delivery_owner(w.tenant_id,w.id,auth.uid()) then raise exception 'Het eerst geplande personeelslid verzorgt de klantoplevering' using errcode='42501';end if;
 perform private.validate_work_order_report(w);
 select greatest(coalesce(max(version),0)+1,w.report_version) into n from public.work_order_report_versions where tenant_id=w.tenant_id and work_order_id=w.id;
 policy:=private.work_order_signature_policy(w);body:=private.work_order_report_snapshot(w,btrim(summary));
 update public.work_order_report_versions set state='superseded' where tenant_id=w.tenant_id and work_order_id=w.id and state in ('waiting_signature','review','correction');
 insert into public.work_order_report_versions(tenant_id,work_order_id,version,snapshot,content_hash,signature_policy,state,created_by,submission_key)
 values(w.tenant_id,w.id,n,body,encode(extensions.digest(body::text,'sha256'),'hex'),policy,case when policy->>'mode'='required' or (policy->>'employeeRequired')::boolean then 'waiting_signature' else 'review' end,auth.uid(),idempotency_key) returning * into r;
 update public.work_orders set report_version=n,report_state=r.state,signature_policy_snapshot=policy,status='completed',attention_reason=case when r.state='waiting_signature' then 'waiting_signature' else null end where id=w.id;
 perform private.enqueue_event(w.tenant_id,'work_order.report_submitted','work_order',w.id,jsonb_build_object('report_id',r.id,'state',r.state),'report-submitted:'||r.id);
 return jsonb_build_object('id',r.id,'version',r.version,'state',r.state);
end $function$;

CREATE OR REPLACE FUNCTION public.prepare_work_order_signature(target_work_order_id uuid, target_report_id uuid, expected_hash text, signer_name text, signer_capacity text, signature_kind text, idempotency_key uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  work_order public.work_orders;
  report public.work_order_report_versions;
  intent private.work_order_signature_intents;
  session_id uuid;
begin
  select candidate.* into work_order
  from public.work_orders candidate
  where candidate.id = target_work_order_id;
  session_id := nullif(auth.jwt() ->> 'session_id', '')::uuid;
  if not private.work_order_execution_actor(
    work_order.tenant_id,
    work_order.id,
    auth.uid(),
    session_id
  ) then
    raise exception 'Vastleggen vereist personeelsuitvoering en actuele toewijzing'
      using errcode = '42501';
  end if;
  select candidate.* into work_order
  from public.work_orders candidate
  where candidate.id = work_order.id
  for update;
  select candidate.* into report
  from public.work_order_report_versions candidate
  where candidate.tenant_id = work_order.tenant_id
    and candidate.id = target_report_id
    and candidate.work_order_id = work_order.id;
  if report.id is null
    or report.version <> work_order.report_version
    or report.content_hash <> expected_hash
    or report.state not in ('waiting_signature','review')
  then
    raise exception 'Bekijk eerst de actuele rapportversie opnieuw' using errcode = '40001';
  end if;
  if signature_kind not in ('customer','employee')
    or (signature_kind = 'customer' and report.signature_policy ->> 'mode' = 'none')
    or length(btrim(signer_name)) not between 2 and 120
    or length(btrim(signer_capacity)) not between 2 and 120
  then
    raise exception 'Vul naam en hoedanigheid in' using errcode = '23514';
  end if;
  if not private.is_delivery_owner(work_order.tenant_id,work_order.id,auth.uid()) then raise exception 'Alleen de opleververantwoordelijke tekent dit rapport' using errcode='42501';end if;
  if signature_kind = 'customer' then
    perform private.customer_signature_snapshot(report.snapshot);
    if encode(extensions.digest(report.snapshot::text, 'sha256'), 'hex') <> report.content_hash then
      raise exception 'De rapportinhoud en het inhoudskenmerk komen niet overeen'
        using errcode = '40001';
    end if;
    if exists (
      select 1 from public.signatures signature
      where signature.tenant_id = report.tenant_id
        and signature.report_id = report.id
        and signature.signature_kind = 'customer'
        and signature.revoked_at is null
    ) then
      raise exception 'De klantondertekening is al vastgelegd' using errcode = '23514';
    end if;
  end if;
  select saved.* into intent
  from private.work_order_signature_intents saved
  where saved.id = idempotency_key;
  if found then
    if (
      intent.actor_id,
      intent.session_id,
      intent.report_id,
      intent.content_hash,
      intent.signer_name,
      intent.signer_capacity,
      intent.signature_kind
    ) is distinct from (
      auth.uid(),
      session_id,
      report.id,
      expected_hash,
      btrim(signer_name),
      btrim(signer_capacity),
      signature_kind
    ) then
      raise exception 'Ongeldige herhaalsleutel' using errcode = '23514';
    end if;
  else
    insert into private.work_order_signature_intents (
      id, tenant_id, work_order_id, report_id, actor_id, session_id,
      content_hash, signer_name, signer_capacity, signature_kind, storage_path
    ) values (
      idempotency_key, work_order.tenant_id, work_order.id, report.id,
      auth.uid(), session_id, expected_hash, btrim(signer_name),
      btrim(signer_capacity), signature_kind,
      work_order.tenant_id || '/' || work_order.id || '/' || idempotency_key || '.png'
    ) returning * into intent;
  end if;
  return jsonb_build_object(
    'id', intent.id,
    'path', intent.storage_path,
    'consumed', intent.consumed_at is not null
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.finalize_work_order_signature(target_intent uuid, image_hash text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare i private.work_order_signature_intents;w public.work_orders;r public.work_order_report_versions;sig public.signatures;
begin
 select * into i from private.work_order_signature_intents where id=target_intent for update;
 if i.id is null or not private.work_order_execution_actor(i.tenant_id,i.work_order_id,i.actor_id,i.session_id) then raise exception 'Ondertekenbevoegdheid vervallen' using errcode='42501';end if;
 select * into w from public.work_orders where tenant_id=i.tenant_id and id=i.work_order_id for update;
 select * into r from public.work_order_report_versions where tenant_id=i.tenant_id and id=i.report_id for update;
 if not private.is_delivery_owner(i.tenant_id,i.work_order_id,i.actor_id) then raise exception 'Opleverbevoegdheid vervallen' using errcode='42501';end if;
 if i.consumed_at is not null then select * into sig from public.signatures where id=i.id; if sig.sha256<>image_hash then raise exception 'De herhaalde afbeelding wijkt af' using errcode='23514';end if;return jsonb_build_object('id',sig.id,'state',r.state);end if;
 if r.version<>w.report_version or r.content_hash<>i.content_hash or r.state not in ('waiting_signature','review') or i.created_at<clock_timestamp()-interval '15 minutes' then raise exception 'Bekijk de actuele rapportversie opnieuw' using errcode='40001';end if;
 if image_hash!~'^[a-f0-9]{64}$' or not exists(select 1 from storage.objects so where so.bucket_id='signatures' and so.name=i.storage_path and so.metadata->>'mimetype'='image/png' and (so.metadata->>'size')::bigint between 1 and 2097152) then raise exception 'Ondertekeningbestand ontbreekt' using errcode='23514';end if;
 insert into public.signatures(id,tenant_id,work_order_id,captured_by,captured_by_name,signer_name,signer_capacity,storage_path,sha256,report_version,report_id,content_hash,signature_kind,channel)
 values(i.id,i.tenant_id,w.id,i.actor_id,(select p.full_name from public.personnel p where p.tenant_id=i.tenant_id and p.user_id=i.actor_id),i.signer_name,i.signer_capacity,i.storage_path,image_hash,r.version,r.id,r.content_hash,i.signature_kind,'personnel_app_on_site');
 update private.work_order_signature_intents set consumed_at=clock_timestamp() where id=i.id;
 if private.work_order_report_ready(r) then update public.work_order_report_versions set state='review' where id=r.id;update public.work_orders set report_state='review',attention_reason=null where id=w.id;end if;
 insert into public.audit_events(tenant_id,actor_user_id,action,entity_type,entity_id,after_data) values(w.tenant_id,i.actor_id,'report.signed','work_order',w.id,jsonb_build_object('report_id',r.id,'signature_id',i.id,'kind',i.signature_kind));
 return jsonb_build_object('id',i.id,'state',case when private.work_order_report_ready(r) then 'review' else 'waiting_signature' end);
end $function$;

CREATE OR REPLACE FUNCTION public.staff_report_signature_preview(target_tenant uuid, target_report uuid, expected_content_hash text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  staff_personnel_id uuid;
  report public.work_order_report_versions;
  work_order public.work_orders;
begin
  staff_personnel_id := private.require_staff_personnel(target_tenant);
  if not private.service_enabled(target_tenant, 'planning')
    or not private.service_enabled(target_tenant, 'rapportage')
    or target_report is null
    or expected_content_hash !~ '^[a-f0-9]{64}$'
  then
    raise exception 'Actuele rapportweergave vereist' using errcode = '42501';
  end if;

  select current_report.*
  into report
  from public.work_order_report_versions current_report
  where current_report.tenant_id = target_tenant
    and current_report.id = target_report;
  select candidate.*
  into work_order
  from public.work_orders candidate
  where candidate.tenant_id = target_tenant
    and candidate.id = report.work_order_id;

  if not private.is_delivery_owner(target_tenant,work_order.id,auth.uid()) or report.id is null
    or work_order.id is null
    or report.version <> work_order.report_version
    or report.state not in ('waiting_signature','review')
    or report.content_hash <> expected_content_hash
    or encode(extensions.digest(report.snapshot::text, 'sha256'), 'hex') <> report.content_hash
    or report.signature_policy ->> 'mode' = 'none'
    or exists (
      select 1
      from public.signatures signature
      where signature.tenant_id = report.tenant_id
        and signature.report_id = report.id
        and signature.signature_kind = 'customer'
        and signature.revoked_at is null
    )
    or not private.work_order_execution_actor(
      target_tenant,
      work_order.id,
      auth.uid(),
      nullif(auth.jwt() ->> 'session_id', '')::uuid
    )
    or not exists (
      select 1
      from public.work_order_assignments assignment
      join public.dispatches dispatch
        on dispatch.tenant_id = assignment.tenant_id
       and dispatch.assignment_id = assignment.id
       and dispatch.revoked_at is null
      where assignment.tenant_id = target_tenant
        and assignment.work_order_id = work_order.id
        and assignment.personnel_id = staff_personnel_id
        and assignment.status not in ('cancelled','returned')
    )
  then
    raise exception 'De rapportversie is niet beschikbaar voor ondertekening'
      using errcode = '42501';
  end if;
  perform private.customer_signature_snapshot(report.snapshot);

  return jsonb_build_object(
    'id', report.id,
    'version', report.version,
    'state', report.state,
    'snapshot', report.snapshot,
    'contentHash', report.content_hash,
    'projection', 'customer_copy',
    'policy', report.signature_policy,
    'createdAt', report.created_at,
    'approvedAt', report.approved_at,
    'employeeVerified', false,
    'waiver', null,
    'signatures', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', signature.id,
          'name', signature.signer_name,
          'capacity', signature.signer_capacity,
          'capturedBy', null,
          'signedAt', signature.signed_at,
          'channel', signature.channel,
          'kind', signature.signature_kind
        ) order by signature.signed_at, signature.id
      )
      from public.signatures signature
      where signature.tenant_id = report.tenant_id
        and signature.report_id = report.id
        and signature.signature_kind = 'customer'
        and signature.revoked_at is null
    ), '[]'::jsonb)
  );
end;
$function$;

CREATE OR REPLACE FUNCTION private.work_order_report_snapshot(w work_orders, summary text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select jsonb_build_object(
    'schema', 1,
    'number', w.work_order_number,
    'title', coalesce(nullif(w.title, ''), w.discipline),
    'summary', summary,
    'tenant', jsonb_build_object(
      'name', te.name,
      'primaryColor', coalesce(b.primary_color, '#222C35'),
      'accentColor', coalesce(b.accent_color, '#41AC42')
    ),
    'customer', jsonb_build_object('name', c.name),
    'object', jsonb_build_object(
      'name', o.name,
      'address', jsonb_build_object(
        'street', o.address ->> 'street',
        'postal_code', o.address ->> 'postal_code',
        'city', o.address ->> 'city',
        'country', o.address ->> 'country'
      )
    ),
    'executionDate', coalesce(w.actual_start_at, w.projected_start_at),
    'endedAt', w.actual_end_at,
    'timezone', te.timezone,
    'tasks', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', t.id,
          'code', t.task_code,
          'name', t.task_name,
          'quantity', t.quantity,
          'unit', t.unit,
          'executedQuantity', coalesce(t.executed_quantity, case when t.completed_at is not null then t.quantity else 0 end),
          'result', t.execution_state,
          'transferredQuantity', coalesce((to_jsonb(t) ->> 'transferred_quantity')::numeric, 0),
          'withdrawnQuantity', coalesce((to_jsonb(t) ->> 'withdrawn_quantity')::numeric, 0),
          'extraWork', t.is_extra_work,
          'extraUnitPriceCents',case when t.is_extra_work and t.extra_work_status='approved' then t.unit_price_cents else null end
        )
        order by t.created_at, t.id
      )
      from public.work_order_tasks t
      where t.tenant_id = w.tenant_id
        and t.work_order_id = w.id
        and (not t.is_extra_work or t.extra_work_status <> 'rejected')
    ), '[]'::jsonb),
    'checklists', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'name', checklist.name,
          'version', template.version,
          'question', question ->> 'label',
          'unit', question ->> 'unit',
          'type', question ->> 'type',
          'value', answer.value,
          'notApplicable', answer.not_applicable,
          'reason', case when answer.not_applicable then answer.reason else null end,
          'answerVersion', answer.version,
          'attachmentId', answer.attachment_id
        )
        order by checklist.created_at, question ->> 'id'
      )
      from public.work_order_checklists checklist
      join public.work_order_template_versions template
        on template.id = checklist.template_revision_id
      cross join lateral jsonb_array_elements(checklist.definition -> 'questions') question
      join public.work_order_checklist_answers answer
        on answer.checklist_id = checklist.id
       and answer.question_id = question ->> 'id'
      where checklist.tenant_id = w.tenant_id
        and checklist.work_order_id = w.id
        and coalesce((question ->> 'customerVisible')::boolean, false)
        and (
          question -> 'condition' is null
          or question -> 'condition' = 'null'::jsonb
          or exists (
            select 1
            from public.work_order_checklist_answers condition_answer
            where condition_answer.checklist_id = checklist.id
              and condition_answer.question_id = question -> 'condition' ->> 'questionId'
              and condition_answer.value = question -> 'condition' -> 'equals'
          )
        )
    ), '[]'::jsonb),
    'materials', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'description', material.description,
          'quantity', material.quantity,
          'unit', material.unit,
          'taskId', material.task_id,
          'unitPriceCents', finance.unit_price_cents
        )
        order by material.created_at, material.id
      )
      from public.work_order_material_usage material
      left join private.work_order_material_finance finance
        on finance.tenant_id = material.tenant_id and finance.usage_id = material.id
      where material.tenant_id = w.tenant_id
        and material.work_order_id = w.id
        and material.customer_visible
    ), '[]'::jsonb),
    'expenses', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', expense.id,
          'description', expense.description,
          'amountCents', expense.amount_cents
        )
        order by expense.created_at, expense.id
      )
      from public.work_order_expenses expense
      where expense.tenant_id = w.tenant_id
        and expense.work_order_id = w.id
        and expense.customer_visible
    ), '[]'::jsonb),
    'notes', coalesce((
      select jsonb_agg(
        jsonb_build_object('id', entry.id, 'body', entry.body, 'createdAt',entry.created_at)
        order by entry.created_at, entry.id
      )
      from public.report_entries entry
      where entry.tenant_id = w.tenant_id
        and entry.work_order_id = w.id
        and entry.customer_visible
        and entry.deleted_at is null
    ), '[]'::jsonb),
    'attachments', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', attachment.id,
          'name', attachment.file_name,
          'mime', attachment.mime_type,
          'sha256', attachment.sha256
        )
        order by attachment.created_at, attachment.id
      )
      from public.attachments attachment
      where attachment.tenant_id = w.tenant_id
        and attachment.work_order_id = w.id
        and attachment.deleted_at is null
        and (
          attachment.report_entry_id is null
          or exists (
            select 1
            from public.report_entries parent_entry
            where parent_entry.tenant_id = attachment.tenant_id
              and parent_entry.id = attachment.report_entry_id
              and parent_entry.work_order_id = attachment.work_order_id
              and parent_entry.deleted_at is null
          )
        )
        and (
          attachment.customer_visible
          or exists (
            select 1
            from public.work_order_checklists checklist
            cross join lateral jsonb_array_elements(checklist.definition -> 'questions') question
            join public.work_order_checklist_answers answer
              on answer.checklist_id = checklist.id
             and answer.question_id = question ->> 'id'
            where checklist.work_order_id = w.id
              and answer.attachment_id = attachment.id
              and coalesce((question ->> 'customerVisible')::boolean, false)
          )
        )
    ), '[]'::jsonb)
  )
  from public.tenants te
  left join public.tenant_branding b on b.tenant_id = te.id
  join public.customers c on c.tenant_id = te.id and c.id = w.customer_id
  join public.objects o on o.tenant_id = te.id and o.id = w.object_id
  where te.id = w.tenant_id;
$function$;

CREATE OR REPLACE FUNCTION private.customer_signature_snapshot(snapshot jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 IMMUTABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  allowed_keys text[] := array[
    'schema','number','title','summary','tenant','customer','object',
    'executionDate','endedAt','timezone','tasks','notes','checklists',
    'materials','expenses','attachments'
  ];
begin
  if jsonb_typeof(snapshot) <> 'object'
    or not (snapshot ?& allowed_keys)
    or snapshot - allowed_keys <> '{}'::jsonb
    or snapshot ->> 'schema' <> '1'
    or jsonb_typeof(snapshot -> 'tenant') <> 'object'
    or jsonb_typeof(snapshot -> 'customer') <> 'object'
    or jsonb_typeof(snapshot -> 'object') <> 'object'
    or jsonb_typeof(snapshot #> '{object,address}') <> 'object'
    or jsonb_typeof(snapshot -> 'tasks') <> 'array'
    or jsonb_typeof(snapshot -> 'notes') <> 'array'
    or jsonb_typeof(snapshot -> 'checklists') <> 'array'
    or jsonb_typeof(snapshot -> 'materials') <> 'array'
    or jsonb_typeof(snapshot -> 'expenses') <> 'array'
    or jsonb_typeof(snapshot -> 'attachments') <> 'array'
    or (snapshot -> 'tenant') - array['name','primaryColor','accentColor'] <> '{}'::jsonb
    or (snapshot -> 'customer') - array['name'] <> '{}'::jsonb
    or (snapshot -> 'object') - array['name','address'] <> '{}'::jsonb
    or (snapshot #> '{object,address}') - array['street','postal_code','city','country'] <> '{}'::jsonb
    or exists (
      select 1 from jsonb_array_elements(snapshot -> 'tasks') item
      where jsonb_typeof(item) <> 'object'
        or item - array[
          'id','code','name','quantity','unit','executedQuantity','result',
          'transferredQuantity','withdrawnQuantity','extraWork','extraUnitPriceCents'
        ] <> '{}'::jsonb
    )
    or exists (
      select 1 from jsonb_array_elements(snapshot -> 'notes') item
      where jsonb_typeof(item) <> 'object'
        or item - array['id','body','createdAt'] <> '{}'::jsonb
    )
    or exists (
      select 1 from jsonb_array_elements(snapshot -> 'checklists') item
      where jsonb_typeof(item) <> 'object'
        or item - array[
          'name','version','question','unit','type','value','notApplicable',
          'reason','answerVersion','attachmentId'
        ] <> '{}'::jsonb
    )
    or exists (
      select 1 from jsonb_array_elements(snapshot -> 'materials') item
      where jsonb_typeof(item) <> 'object'
        or item - array['description','quantity','unit','taskId','unitPriceCents'] <> '{}'::jsonb
    )
    or exists (
      select 1 from jsonb_array_elements(snapshot -> 'expenses') item
      where jsonb_typeof(item) <> 'object'
        or item - array['id','description','amountCents'] <> '{}'::jsonb
    )
    or exists (
      select 1 from jsonb_array_elements(snapshot -> 'attachments') item
      where jsonb_typeof(item) <> 'object'
        or item - array['id','name','mime','sha256'] <> '{}'::jsonb
    )
  then
    raise exception 'Deze rapportversie gebruikt een niet-ondersteund klantschema'
      using errcode = '23514';
  end if;
  return snapshot;
end;
$function$;

create or replace function private.execution_activity(t uuid,w uuid,u uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',x.id,'at',x.at,'title',x.title,'description',x.description,'author',x.author) order by x.at desc,x.id),'[]') from(
  select 'note:'||e.id id,e.created_at at,'Notitie toegevoegd' title,e.body description,p.full_name author
   from public.report_entries e left join public.personnel p on p.tenant_id=e.tenant_id and p.user_id=e.author_user_id
   where e.tenant_id=t and e.work_order_id=w and e.deleted_at is null and(e.author_user_id=u or e.customer_visible or private.report_backoffice(t))
  union all
  select 'material:'||m.id,m.created_at,'Materiaal toegevoegd',m.description,p.full_name
   from public.work_order_material_usage m left join public.personnel p on p.tenant_id=m.tenant_id and p.user_id=m.created_by where m.tenant_id=t and m.work_order_id=w
  union all
  select 'expense:'||e.id,e.created_at,'Onkosten toegevoegd',e.description,p.full_name
   from public.work_order_expenses e left join public.personnel p on p.tenant_id=e.tenant_id and p.user_id=e.created_by where e.tenant_id=t and e.work_order_id=w
  union all
  select 'status:'||e.id,e.created_at,case when e.reason_code='time_extended' then '15 minuten extra werktijd' when e.reason_code='stop' then 'Eigen werkzaamheden afgerond' when e.reason_code='pause' then 'Pauze gestart' when e.reason_code='resume' then 'Werkzaamheden hervat' else case e.new_status::text when 'seen' then 'Werkbon geopend' when 'travelling' then 'Onderweg' when 'in_progress' then 'Werkzaamheden gestart' when 'completed' then 'Afgerond' else 'Status gewijzigd' end end,e.note,p.full_name
   from public.status_events e left join public.personnel p on p.tenant_id=e.tenant_id and p.user_id=e.actor_user_id where e.tenant_id=t and e.work_order_id=w
  union all
  select 'access:'||a.id,a.created_at,'Beveiligd dossier geopend',null,p.full_name
   from private.object_access_audit a left join public.personnel p on p.tenant_id=a.tenant_id and p.user_id=a.actor_id
   where a.tenant_id=t and a.order_id=w and a.event='read' and a.item_id is null
  union all
  select 'task:'||k.id,k.created_at,'Meerwerk toegevoegd',k.task_name,p.full_name
   from public.work_order_tasks k left join public.personnel p on p.tenant_id=k.tenant_id and p.user_id=k.added_by where k.tenant_id=t and k.work_order_id=w and k.is_extra_work
 )x;
$$;
revoke all on function private.execution_activity(uuid,uuid,uuid) from public,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.work_order_report(target_work_order_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare w public.work_orders;can_review boolean;can_execute boolean;policy jsonb;
begin
 select * into w from public.work_orders where id=target_work_order_id;
 if not private.object_session_active() or not private.can_access_work_order(w.tenant_id,w.id) or not private.service_enabled(w.tenant_id,'rapportage') then raise exception 'Geen rapporttoegang' using errcode='42501';end if;
 can_review:=private.has_role(w.tenant_id,array['tenant_admin','management','finance']::public.app_role[]);
 can_execute:=private.work_order_execution_actor(w.tenant_id,w.id,auth.uid(),nullif(auth.jwt()->>'session_id','')::uuid);
 policy:=private.work_order_signature_policy(w);
 return jsonb_build_object('orderId',w.id,'orderVersion',w.version,'number',w.work_order_number,'state',w.report_state,'policy',policy,'canReview',can_review,
 'canEditPolicy',private.has_role(w.tenant_id,array['tenant_admin','management']::public.app_role[]) and w.status not in ('cancelled','approved','invoice_ready','invoiced') and w.report_state in ('draft','correction'),'configuredMode',w.signature_mode,'employeeSignatureRequired',w.employee_signature_required,
 'canSubmit',can_execute and w.status not in ('cancelled','approved','invoice_ready','invoiced') and private.is_delivery_owner(w.tenant_id,w.id,auth.uid()),
 'isDeliveryOwner',can_execute and private.is_delivery_owner(w.tenant_id,w.id,auth.uid()),
 'draftSnapshot',case when can_execute and private.is_delivery_owner(w.tenant_id,w.id,auth.uid()) then private.work_order_report_snapshot(w,'Uitgevoerde werkzaamheden') else null end,
 'activity',private.execution_activity(w.tenant_id,w.id,auth.uid()),
 'canCapture',can_execute and private.is_delivery_owner(w.tenant_id,w.id,auth.uid()),'canWaive',can_review and exists(select 1 from public.tenant_settings ts where ts.tenant_id=w.tenant_id and coalesce((ts.settings->'workOrders'->>'allowSignatureWaivers')::boolean,false) and coalesce(ts.settings->'workOrders'->'signatureWaiverUsers','[]') ? auth.uid()::text),'legacy',not exists(select 1 from public.work_order_report_versions r where r.work_order_id=w.id),
 'checklists',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'revisionId',v.id,'name',c.name,'version',v.version,'questions',c.definition->'questions','questionStates',private.checklist_question_states(c),'answers',coalesce((select jsonb_agg(jsonb_build_object('questionId',a.question_id,'value',a.value,'notApplicable',a.not_applicable,'reason',a.reason,'attachmentId',a.attachment_id,'version',a.version,'actor',a.updated_by,'updatedAt',a.updated_at) order by a.question_id) from public.work_order_checklist_answers a where a.checklist_id=c.id and (private.report_backoffice(w.tenant_id) or a.updated_by=auth.uid())),'[]')) order by c.created_at,c.id) from public.work_order_checklists c join public.work_order_template_versions v on v.id=c.template_revision_id where c.work_order_id=w.id),'[]'),
 'versions',coalesce((select jsonb_agg(private.report_delivery(r) order by r.version desc) from public.work_order_report_versions r where r.tenant_id=w.tenant_id and r.work_order_id=w.id),'[]'),
 'historicalSignatures',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'name',s.signer_name,'version',s.report_version,'signedAt',s.signed_at)) from public.signatures s where s.tenant_id=w.tenant_id and s.work_order_id=w.id and s.report_id is null and (private.report_backoffice(w.tenant_id) or s.captured_by=auth.uid())),'[]'));
end $function$;

CREATE OR REPLACE FUNCTION private.report_snapshot_for_actor(r work_order_report_versions)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  result jsonb;
  owners jsonb;
  section text;
  visible jsonb;
begin
  if private.report_backoffice(r.tenant_id) or private.is_delivery_owner(r.tenant_id,r.work_order_id,auth.uid()) then
    return r.snapshot;
  end if;
  select jsonb_object_agg(key, value)
  into result
  from jsonb_each(r.snapshot)
  where key = any(array[
    'schema','number','title','summary','tenant','customer','object',
    'executionDate','endedAt','timezone','tasks','notes','checklists',
    'materials','expenses','attachments'
  ]);
  if not private.is_work_order_assignee(r.tenant_id, r.work_order_id) then
    return result;
  end if;
  select ownership.owners
  into owners
  from private.work_order_report_ownership ownership
  where ownership.tenant_id = r.tenant_id
    and ownership.report_id = r.id;
  foreach section in array array['notes','attachments','checklists','materials'] loop
    select coalesce(jsonb_agg(value order by ordinality), '[]'::jsonb)
    into visible
    from jsonb_array_elements(coalesce(result -> section, '[]'::jsonb)) with ordinality
    where owners -> section ->> ordinality::text = auth.uid()::text;
    result := jsonb_set(result, array[section], visible);
  end loop;
  -- Expense ownership was not captured for historical report versions. Never
  -- guess it from matching labels or amounts; own live costs remain available
  -- through the bounded staff workspace.
  result := jsonb_set(result, '{expenses}', '[]'::jsonb);
  if r.created_by is distinct from auth.uid() then
    result := jsonb_set(
      result,
      '{summary}',
      '"Gezamenlijk rapport. Je ziet hier de opdrachtresultaten en je eigen bijdrage."'
    );
  end if;
  return result;
end;
$function$;

CREATE OR REPLACE FUNCTION public.transition_work_order(target_work_order_id uuid, action text, expected_version bigint, idempotency_key text, reason_code text DEFAULT NULL::text, note text DEFAULT NULL::text)
 RETURNS work_orders
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare w public.work_orders;a public.work_order_assignments;e public.status_events;now_at timestamptz:=clock_timestamp();result public.work_orders;
begin
 select * into w from public.work_orders where id=target_work_order_id;
 if not private.work_order_execution_actor(w.tenant_id,w.id,auth.uid(),nullif(auth.jwt()->>'session_id','')::uuid) then raise exception 'Actuele personeelsuitvoering vereist' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended('fieldgrid-planning:'||w.tenant_id::text,0));select * into w from public.work_orders where id=w.id for update;
 select aa.* into a from public.work_order_assignments aa join public.personnel p on p.id=aa.personnel_id and p.tenant_id=aa.tenant_id where aa.tenant_id=w.tenant_id and aa.work_order_id=w.id and p.user_id=auth.uid() and aa.status not in ('cancelled','returned') for update of aa;
 select * into e from public.status_events where tenant_id=w.tenant_id and status_events.idempotency_key=transition_work_order.idempotency_key;
 if found then if e.work_order_id<>w.id or e.actor_user_id<>auth.uid() or e.assignment_id<>a.id then raise exception 'Ongeldige herhaalsleutel' using errcode='23514';end if;return private.staff_work_order_result(w);end if;
 if w.version is distinct from expected_version then raise exception 'De uitvoering is gewijzigd. Herlaad en probeer opnieuw.' using errcode='40001';end if;
 if action not in ('stop','pause','resume','complete','resubmit') then
  if action='start' and a.status='seen' then update public.work_order_assignments set status='travelling' where id=a.id;select version into expected_version from public.work_orders where id=w.id;end if;
  result:=private.work_order_transition_legacy(w.id,action,expected_version,idempotency_key,reason_code,note);
  if action='open' then update public.work_order_assignments set seen_at=coalesce(seen_at,now_at) where id=a.id;end if;
  return private.staff_work_order_result(result);
 end if;
 if action='resubmit' then
  perform public.submit_work_order_report(w.id,w.version,coalesce(nullif(note,''),'Bijgewerkte taakresultaten en klantzichtbare rapportage'),gen_random_uuid());
  select * into result from public.work_orders where id=w.id;
  insert into public.status_events(tenant_id,work_order_id,assignment_id,actor_user_id,previous_status,new_status,reason_code,note,idempotency_key) values(w.tenant_id,w.id,a.id,auth.uid(),w.status,result.status,action,note,idempotency_key);
  return private.staff_work_order_result(result);
 end if;
 if w.status in ('cancelled','approved','invoice_ready','invoiced') or a.status<>'in_progress' then raise exception 'Deze inzet is niet actief' using errcode='23514';end if;
 if action='pause' and a.paused_at is not null or action='resume' and a.paused_at is null then raise exception 'De pauzestatus is al gewijzigd' using errcode='40001';end if;
 if action='complete' and exists(select 1 from public.work_order_tasks t where t.tenant_id=w.tenant_id and t.work_order_id=w.id and t.completed_at is null and(not t.is_extra_work or t.extra_work_status<>'rejected')) then raise exception 'Leg de verplichte taakresultaten vast, of stop alleen de eigen inzet.' using errcode='23514';end if;
 update public.time_entries set ends_at=now_at where tenant_id=w.tenant_id and assignment_id=a.id and ends_at is null;
 if action='pause' then
  update public.work_order_assignments set paused_at=now_at where id=a.id;
  insert into public.time_entries(tenant_id,personnel_id,assignment_id,kind,starts_at) values(w.tenant_id,a.personnel_id,a.id,'break',now_at);
 elsif action='resume' then
  update public.work_order_assignments set paused_at=null where id=a.id;
  insert into public.time_entries(tenant_id,personnel_id,assignment_id,kind,starts_at) values(w.tenant_id,a.personnel_id,a.id,'work',now_at);
 else
  update public.work_order_assignments set status='completed',paused_at=null,actual_end_at=now_at where id=a.id;
 end if;
 update public.work_orders set status=case when exists(select 1 from public.work_order_assignments aa where aa.tenant_id=w.tenant_id and aa.work_order_id=w.id and aa.status not in ('completed','returned','cancelled')) then 'in_progress'::public.work_order_status else 'completed'::public.work_order_status end,
 actual_end_at=case when not exists(select 1 from public.work_order_assignments aa where aa.tenant_id=w.tenant_id and aa.work_order_id=w.id and aa.status not in ('completed','returned','cancelled')) then now_at else null end where id=w.id returning * into result;
 insert into public.status_events(tenant_id,work_order_id,assignment_id,actor_user_id,previous_status,new_status,reason_code,note,idempotency_key) values(w.tenant_id,w.id,a.id,auth.uid(),w.status,result.status,action,note,idempotency_key);
 perform private.enqueue_event(w.tenant_id,'work_order.'||action,'work_order',w.id,jsonb_build_object('assignment_id',a.id),'transition:'||idempotency_key);
 -- Compatibility for existing clients: their final complete creates a report;
 -- the current app explicitly separates stop from submit.
 if action='complete' and result.status='completed' and private.is_delivery_owner(w.tenant_id,w.id,auth.uid()) then
  perform public.submit_work_order_report(w.id,result.version,coalesce(nullif(note,''),'Uitgevoerde werkzaamheden volgens de vastgelegde taakresultaten'),gen_random_uuid());
  select * into result from public.work_orders where id=w.id;
 end if;
 return private.staff_work_order_result(result);
end $function$;
