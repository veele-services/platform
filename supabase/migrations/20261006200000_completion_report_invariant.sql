-- Stopping personal time and submitting the customer delivery are separate states.
-- Every writer, including old clients and workers, goes through this invariant.
-- The canonical report, hash, signatures and historic evidence stay immutable.
create function private.work_order_delivery_complete(w public.work_orders) returns boolean
language sql stable security definer set search_path='' as $$
 select w.report_state in('review','approved')
 and exists(select 1 from public.work_order_report_versions r
   where r.tenant_id=w.tenant_id and r.work_order_id=w.id and r.version=w.report_version
   and r.state in('review','approved') and private.work_order_report_ready(r))
 and not exists(select 1 from public.work_order_assignments a
   where a.tenant_id=w.tenant_id and a.work_order_id=w.id and a.status not in('completed','returned','cancelled'))
 and not exists(select 1 from public.time_entries e join public.work_order_assignments a
   on a.tenant_id=e.tenant_id and a.id=e.assignment_id
   where a.tenant_id=w.tenant_id and a.work_order_id=w.id and e.ends_at is null);
$$;
revoke all on function private.work_order_delivery_complete(public.work_orders) from public,anon,authenticated,service_role;

create function private.enforce_work_order_delivery_completion() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.status='completed' and not private.work_order_delivery_complete(new) then
   -- Compatibility commands used to equate stopped clocks with delivery.
   -- Return the actual pending state; never manufacture a report or signature.
   new.status:='in_progress';
   new.attention_reason:=case when new.report_state='waiting_signature' then 'waiting_signature' else 'report_pending' end;
 elsif new.status in('in_progress','correction_required')
   and new.report_state in('review','approved') and private.work_order_delivery_complete(new) then
   new.status:='completed';
   if new.attention_reason in('report_pending','waiting_signature') then new.attention_reason:=null;end if;
 end if;
 return new;
end;
$$;
revoke all on function private.enforce_work_order_delivery_completion() from public,anon,authenticated,service_role;
create trigger a_work_order_delivery_completion before insert or update on public.work_orders
for each row execute function private.enforce_work_order_delivery_completion();

-- Reconcile only premature, operational "completed" rows. Approved/invoiced
-- history and immutable versions/signatures are deliberately not rewritten.
with reconciled as (
 update public.work_orders w set status='in_progress',
 attention_reason=case when report_state='waiting_signature' then 'waiting_signature' else 'report_pending' end
 where w.status='completed' and not private.work_order_delivery_complete(w)
 returning w.tenant_id,w.id,w.report_state
)
insert into public.audit_events(tenant_id,actor_user_id,action,entity_type,entity_id,after_data)
select tenant_id,null,'work_order.delivery_pending','work_order',id,jsonb_build_object('report_state',report_state,'reason','Stopped contribution awaits submitted delivery') from reconciled;

-- Keep the historic `complete` command safe for old clients: it can stop own
-- time and ask the canonical submission command to freeze a report. The trigger
-- still withholds overall completion until every required signature exists.
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
  if action='start' then perform private.refresh_live_planning(w.tenant_id);select * into result from public.work_orders where id=w.id;end if;
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
  update public.work_order_assignments set status='completed',paused_at=null,actual_end_at=now_at,projected_start_at=coalesce(actual_start_at,projected_start_at),projected_end_at=greatest(now_at,coalesce(actual_start_at,projected_start_at)+interval '1 second') where id=a.id;
 end if;
 update public.work_orders set status=case when exists(select 1 from public.work_order_assignments aa where aa.tenant_id=w.tenant_id and aa.work_order_id=w.id and aa.status not in ('completed','returned','cancelled')) then 'in_progress'::public.work_order_status else 'completed'::public.work_order_status end,
 actual_end_at=case when not exists(select 1 from public.work_order_assignments aa where aa.tenant_id=w.tenant_id and aa.work_order_id=w.id and aa.status not in ('completed','returned','cancelled')) then now_at else null end where id=w.id returning * into result;
 insert into public.status_events(tenant_id,work_order_id,assignment_id,actor_user_id,previous_status,new_status,reason_code,note,idempotency_key) values(w.tenant_id,w.id,a.id,auth.uid(),w.status,result.status,action,note,idempotency_key);
 perform private.enqueue_event(w.tenant_id,'work_order.'||action,'work_order',w.id,jsonb_build_object('assignment_id',a.id),'transition:'||idempotency_key);
 -- Compatibility for existing clients: their final complete creates a report;
 -- the current app explicitly separates stop from submit.
 if action='complete' and private.is_delivery_owner(w.tenant_id,w.id,auth.uid()) and not exists(select 1 from public.work_order_assignments closed where closed.tenant_id=w.tenant_id and closed.work_order_id=w.id and closed.status not in('completed','returned','cancelled')) then
  perform public.submit_work_order_report(w.id,result.version,coalesce(nullif(note,''),'Uitgevoerde werkzaamheden volgens de vastgelegde taakresultaten'),gen_random_uuid());
  select * into result from public.work_orders where id=w.id;
 end if;
 perform private.refresh_live_planning(w.tenant_id);select * into result from public.work_orders where id=w.id;
 return private.staff_work_order_result(result);
end $function$
;



-- A delivered report stays read-only; only an explicit management correction
-- permits another frozen version. Authorized retries keep their original result.
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
 if w.status in ('completed','cancelled','invoice_ready','invoiced','approved') or w.report_state not in ('draft','correction') or length(btrim(summary)) not between 3 and 5000 then raise exception 'Controleer de rapportsamenvatting en actuele fase' using errcode='23514';end if;
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
    if report.state <> 'waiting_signature'
      or work_order.status in ('completed','approved','invoice_ready','invoiced','cancelled') then
      raise exception 'Deze rapportversie is al ingediend. Nieuwe ondertekening is niet mogelijk.' using errcode='23514';
    end if;
    if signature_kind = 'customer' then
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
 if r.version<>w.report_version or r.content_hash<>i.content_hash or r.state <> 'waiting_signature' or w.status in ('completed','approved','invoice_ready','invoiced','cancelled') or i.created_at<clock_timestamp()-interval '15 minutes' then raise exception 'Bekijk de actuele rapportversie opnieuw' using errcode='40001';end if;
 if image_hash!~'^[a-f0-9]{64}$' or not exists(select 1 from storage.objects so where so.bucket_id='signatures' and so.name=i.storage_path and so.metadata->>'mimetype'='image/png' and (so.metadata->>'size')::bigint between 1 and 2097152) then raise exception 'Ondertekeningbestand ontbreekt' using errcode='23514';end if;
 insert into public.signatures(id,tenant_id,work_order_id,captured_by,captured_by_name,signer_name,signer_capacity,storage_path,sha256,report_version,report_id,content_hash,signature_kind,channel)
 values(i.id,i.tenant_id,w.id,i.actor_id,(select p.full_name from public.personnel p where p.tenant_id=i.tenant_id and p.user_id=i.actor_id),i.signer_name,i.signer_capacity,i.storage_path,image_hash,r.version,r.id,r.content_hash,i.signature_kind,'personnel_app_on_site');
 update private.work_order_signature_intents set consumed_at=clock_timestamp() where id=i.id;
 if private.work_order_report_ready(r) then update public.work_order_report_versions set state='review' where id=r.id;update public.work_orders set report_state='review',attention_reason=null where id=w.id;end if;
 insert into public.audit_events(tenant_id,actor_user_id,action,entity_type,entity_id,after_data) values(w.tenant_id,i.actor_id,'report.signed','work_order',w.id,jsonb_build_object('report_id',r.id,'signature_id',i.id,'kind',i.signature_kind));
 return jsonb_build_object('id',i.id,'state',case when private.work_order_report_ready(r) then 'review' else 'waiting_signature' end);
end $function$;

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
 'canSubmit',can_execute and w.status not in ('completed','cancelled','approved','invoice_ready','invoiced') and w.report_state in ('draft','correction') and private.is_delivery_owner(w.tenant_id,w.id,auth.uid()),
 'isDeliveryOwner',can_execute and private.is_delivery_owner(w.tenant_id,w.id,auth.uid()),
 'draftSnapshot',case when can_execute and private.is_delivery_owner(w.tenant_id,w.id,auth.uid()) then private.work_order_report_snapshot(w,'Uitgevoerde werkzaamheden') else null end,
 'activity',private.execution_activity(w.tenant_id,w.id,auth.uid()),
 'canCapture',can_execute and w.status not in ('completed','cancelled','approved','invoice_ready','invoiced') and w.report_state='waiting_signature' and private.is_delivery_owner(w.tenant_id,w.id,auth.uid()),'canWaive',can_review and exists(select 1 from public.tenant_settings ts where ts.tenant_id=w.tenant_id and coalesce((ts.settings->'workOrders'->>'allowSignatureWaivers')::boolean,false) and coalesce(ts.settings->'workOrders'->'signatureWaiverUsers','[]') ? auth.uid()::text),'legacy',not exists(select 1 from public.work_order_report_versions r where r.work_order_id=w.id),
 'checklists',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'revisionId',v.id,'name',c.name,'version',v.version,'questions',c.definition->'questions','questionStates',private.checklist_question_states(c),'answers',coalesce((select jsonb_agg(jsonb_build_object('questionId',a.question_id,'value',a.value,'notApplicable',a.not_applicable,'reason',a.reason,'attachmentId',a.attachment_id,'version',a.version,'actor',a.updated_by,'updatedAt',a.updated_at) order by a.question_id) from public.work_order_checklist_answers a where a.checklist_id=c.id and (private.report_backoffice(w.tenant_id) or a.updated_by=auth.uid())),'[]')) order by c.created_at,c.id) from public.work_order_checklists c join public.work_order_template_versions v on v.id=c.template_revision_id where c.work_order_id=w.id),'[]'),
 'versions',coalesce((select jsonb_agg(private.report_delivery(r) order by r.version desc) from public.work_order_report_versions r where r.tenant_id=w.tenant_id and r.work_order_id=w.id),'[]'),
 'historicalSignatures',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'name',s.signer_name,'version',s.report_version,'signedAt',s.signed_at)) from public.signatures s where s.tenant_id=w.tenant_id and s.work_order_id=w.id and s.report_id is null and (private.report_backoffice(w.tenant_id) or s.captured_by=auth.uid())),'[]'));
end $function$;
