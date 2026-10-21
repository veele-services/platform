-- Preserve the strict legacy personnel projection during migration and rollback.
-- New clients explicitly negotiate the scoped task/visit representation.
CREATE OR REPLACE FUNCTION public.staff_workspace(target_tenant uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  ids uuid[] := '{}'::uuid[];
  staff_personnel_id uuid;
  result jsonb;
begin
  if not private.object_session_active()
    or not private.has_role(target_tenant, array['staff']::public.app_role[])
    or not private.service_enabled(target_tenant, 'personeel')
  then
    raise exception 'Personeelstoegang vereist' using errcode = '42501';
  end if;

  select p.id
  into staff_personnel_id
  from public.personnel p
  where p.tenant_id = target_tenant
    and p.user_id = auth.uid()
    and p.status = 'active';

  -- Missing/inactive personnel is a friendly empty workspace. Authentication,
  -- tenant role and module checks above still fail closed.
  if staff_personnel_id is not null then
    select coalesce(array_agg(w.id), '{}'::uuid[])
    into ids
    from public.work_orders w
    where w.tenant_id = target_tenant
      and private.service_enabled(target_tenant, 'planning')
      and (
        private.is_work_order_assignee(target_tenant, w.id)
        -- A returned assignment is no longer an active execution capability,
        -- but remains visible to its employee as immutable planning/history.
        -- Keep this projection-only exception separate from
        -- is_work_order_assignee so storage and mutation guards stay closed.
        or (
          w.status <> 'cancelled'
          and exists (
            select 1
            from public.work_order_assignments returned_assignment
            where returned_assignment.tenant_id = target_tenant
              and returned_assignment.work_order_id = w.id
              and returned_assignment.personnel_id = staff_personnel_id
              and returned_assignment.status = 'returned'
              and exists (
                select 1
                from public.dispatches returned_dispatch
                where returned_dispatch.tenant_id = returned_assignment.tenant_id
                  and returned_dispatch.assignment_id = returned_assignment.id
                  and returned_dispatch.revoked_at is null
              )
          )
        )
      );
  end if;

  select jsonb_build_object(
    'customers', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', customer.id,
        'tenant_id', customer.tenant_id,
        'name', customer.name
      ))
      from public.customers customer
      where customer.tenant_id = target_tenant
        and exists (
          select 1 from public.work_orders w
          where w.id = any(ids) and w.customer_id = customer.id
        )
    ), '[]'::jsonb),
    -- The shared WorkspaceData.contacts shape is a backoffice customer-contact
    -- DTO. Staff gets a separate assignment-bound projection instead.
    'contacts', '[]'::jsonb,
    'staffContacts', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', contact.contact_id,
          'tenant_id', contact.tenant_id,
          'work_order_id', contact.work_order_id,
          'name', contact.snapshot ->> 'name',
          'email', contact.snapshot ->> 'email',
          'phone', contact.snapshot ->> 'phone',
          'roles', contact.roles
        )
        order by
          case when 'site' = any(contact.roles) then 0 when 'requester' = any(contact.roles) then 1 else 2 end,
          contact.snapshot ->> 'name',
          contact.contact_id
      )
      from public.work_order_contacts contact
      where contact.tenant_id = target_tenant
        and contact.work_order_id = any(ids)
    ), '[]'::jsonb),
    'objects', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', object.id,
        'tenant_id', object.tenant_id,
        'name', object.name,
        'address', object.address
      ))
      from public.objects object
      where object.tenant_id = target_tenant
        and exists (
          select 1 from public.work_orders w
          where w.id = any(ids) and w.object_id = object.id
        )
    ), '[]'::jsonb),
    'personnel', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', person.id,
        'tenant_id', person.tenant_id,
        'employee_number', person.employee_number,
        'full_name', person.full_name,
        'preferred_name', person.preferred_name,
        'email', person.email,
        'phone', person.phone,
        'mobile_phone', person.mobile_phone,
        'birth_date', person.birth_date,
        'status', person.status,
        'home_address', person.home_address,
        'emergency_contact', person.emergency_contact,
        'standard_vehicle', person.standard_vehicle,
        'departure_kind', person.departure_kind,
        'departure_depot_id', person.departure_depot_id,
        'alternate_departure_address', person.alternate_departure_address,
        'return_to_departure', person.return_to_departure,
        'driving_license', person.driving_license,
        'driving_license_categories', person.driving_license_categories,
        'carpool_allowed', person.carpool_allowed,
        'own_transport', person.own_transport,
        'travel_limitations', person.travel_limitations,
        'notification_preferences', person.notification_preferences,
        'availability_preferences', person.availability_preferences,
        'availability_self_service_enabled', person.availability_self_service_enabled,
        'onboarding_draft', person.onboarding_draft,
        'onboarding_step', person.onboarding_step,
        'onboarding_completed_at', person.onboarding_completed_at,
        'onboarding_version', person.onboarding_version,
        'version', person.version
      ))
      from public.personnel person
      where person.tenant_id = target_tenant and person.id = staff_personnel_id
    ), '[]'::jsonb),
    'staffDepots', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', depot.id,
          'tenant_id', depot.tenant_id,
          'name', depot.name
        )
        order by depot.name, depot.id
      )
      from public.travel_depots depot
      where staff_personnel_id is not null
        and depot.tenant_id = target_tenant
        and depot.active
    ), '[]'::jsonb),
    'visits',coalesce((select jsonb_agg(jsonb_build_object('id',v.id,'tenant_id',v.tenant_id,'work_order_id',v.work_order_id,'assignment_id',crew.assignment_id,'starts_at',v.starts_at,'ends_at',v.ends_at,'state',v.state,'own_session_start',session.starts_at,'own_session_end',session.ends_at) order by v.starts_at,v.id) from private.task_visits v join private.task_visit_crew crew on crew.tenant_id=v.tenant_id and crew.visit_id=v.id left join private.task_visit_sessions session on session.tenant_id=v.tenant_id and session.visit_id=v.id and session.personnel_id=staff_personnel_id where v.tenant_id=target_tenant and crew.personnel_id=staff_personnel_id and v.work_order_id=any(ids) and private.work_order_execution_actor(target_tenant,v.work_order_id,auth.uid(),nullif(auth.jwt()->>'session_id','')::uuid)),'[]'),'workOrders', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', w.id,
        'tenant_id', w.tenant_id,
        'customer_id', w.customer_id,
        'object_id', w.object_id,
        'work_order_number', w.work_order_number,
        'discipline', w.discipline,
        'title', w.title,
        'description', w.description,
        'status', w.status,
        'version', w.version,
        'report_version', w.report_version,
        'report_state', w.report_state,
        'signature_required', w.signature_required,
        'day_instructions', w.day_instructions,
        'projected_start_at', w.projected_start_at,
        'projected_end_at', w.projected_end_at,
        'actual_start_at', w.actual_start_at,
        'actual_end_at', w.actual_end_at,
        'published_at', w.published_at,
        'deadline', w.deadline,
        'requested_date', w.requested_date,
        'details', jsonb_strip_nulls(jsonb_build_object(
          'customerReference', w.details -> 'customerReference',
          'locationLabel', w.details -> 'locationLabel',
          'recurrence_window', w.details -> 'recurrence_window'
        ))
      ))
      from public.work_orders w
      where w.id = any(ids)
    ), '[]'::jsonb),
    'assignments', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', assignment.id,
        'tenant_id', assignment.tenant_id,
        'work_order_id', assignment.work_order_id,
        'personnel_id', assignment.personnel_id,
        'status', assignment.status,
        'planned_start_at', assignment.planned_start_at,
        'planned_end_at', assignment.planned_end_at,
        'projected_start_at', assignment.projected_start_at,
        'projected_end_at', assignment.projected_end_at,
        'departed_at', assignment.departed_at,
        'paused_at', assignment.paused_at,
        'actual_start_at', assignment.actual_start_at,
        'actual_end_at', assignment.actual_end_at,
        'return_reason_code', assignment.return_reason_code,
        'return_note', assignment.return_note,
        'version', assignment.version,
        'created_at', assignment.created_at
      ))
      from public.work_order_assignments assignment
      where assignment.tenant_id = target_tenant
        and assignment.work_order_id = any(ids)
        and assignment.personnel_id = staff_personnel_id
    ), '[]'::jsonb),
    'workOrderTasks', coalesce((
      select jsonb_agg(private.staff_task_dto(task))
      from public.work_order_tasks task
      where task.tenant_id = target_tenant and task.work_order_id = any(ids)
    ), '[]'::jsonb),
    'tasks', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', task.id,
        'tenant_id', task.tenant_id,
        'code', task.code,
        'discipline', task.discipline,
        'name', task.name,
        'description', task.description,
        'active', task.active
      ))
      from public.task_catalog task
      where private.service_enabled(target_tenant, 'planning')
        and task.tenant_id = target_tenant
        and exists (
          select 1
          from public.task_revisions relevant_revision
          where relevant_revision.tenant_id = task.tenant_id
            and relevant_revision.task_id = task.id
            and (
              exists (
                select 1 from public.work_order_tasks work_task
                where work_task.tenant_id = target_tenant
                  and work_task.work_order_id = any(ids)
                  and work_task.task_revision_id = relevant_revision.id
              )
              or exists (
                select 1
                from public.extra_work_rules allowed_rule
                join public.work_order_allowed_extra_work allowed
                  on allowed.tenant_id = allowed_rule.tenant_id
                 and allowed.extra_work_rule_id = allowed_rule.id
                where allowed_rule.tenant_id = target_tenant
                  and allowed_rule.task_revision_id = relevant_revision.id
                  and allowed.work_order_id = any(ids)
              )
            )
        )
    ), '[]'::jsonb),
    'taskRevisions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', task_revision.id,
        'tenant_id', task_revision.tenant_id,
        'task_id', task_revision.task_id,
        'revision', task_revision.revision,
        'duration_minutes', task_revision.duration_minutes,
        'unit', task_revision.unit,
        'valid_from', task_revision.valid_from,
        'valid_until', task_revision.valid_until
      ))
      from public.task_revisions task_revision
      where private.service_enabled(target_tenant, 'planning')
        and task_revision.tenant_id = target_tenant
        and (
          exists (
            select 1 from public.work_order_tasks work_task
            where work_task.tenant_id = target_tenant
              and work_task.work_order_id = any(ids)
              and work_task.task_revision_id = task_revision.id
          )
          or exists (
            select 1
            from public.extra_work_rules allowed_rule
            join public.work_order_allowed_extra_work allowed
              on allowed.tenant_id = allowed_rule.tenant_id
             and allowed.extra_work_rule_id = allowed_rule.id
            where allowed_rule.tenant_id = target_tenant
              and allowed_rule.task_revision_id = task_revision.id
              and allowed.work_order_id = any(ids)
          )
        )
    ), '[]'::jsonb),
    'reports', coalesce((
      select jsonb_agg(
        to_jsonb(entry) - 'author_user_id'
        || jsonb_build_object('owned_by_current_user', true)
      )
      from public.report_entries entry
      where private.service_enabled(target_tenant, 'rapportage')
        and entry.tenant_id = target_tenant
        and entry.work_order_id = any(ids)
        and entry.author_user_id = auth.uid()
        and entry.deleted_at is null
    ), '[]'::jsonb),
    'attachments', coalesce((
      select jsonb_agg(
        to_jsonb(attachment) - array['storage_path','storage_bucket','uploaded_by']
        || jsonb_build_object('owned_by_current_user', true)
      )
      from public.attachments attachment
      where private.service_enabled(target_tenant, 'rapportage')
        and attachment.tenant_id = target_tenant
        and attachment.work_order_id = any(ids)
        and attachment.uploaded_by = auth.uid()
        and private.owns_report_path(attachment.tenant_id, attachment.work_order_id, attachment.storage_path)
        and attachment.deleted_at is null
        and (
          attachment.report_entry_id is null
          or exists (
            select 1
            from public.report_entries parent_entry
            where parent_entry.tenant_id = attachment.tenant_id
              and parent_entry.id = attachment.report_entry_id
              and parent_entry.work_order_id = attachment.work_order_id
              and parent_entry.author_user_id = auth.uid()
              and parent_entry.deleted_at is null
          )
        )
    ), '[]'::jsonb),
    'signatures', coalesce((
      select jsonb_agg(to_jsonb(signature) - array['storage_path','captured_by'])
      from public.signatures signature
      where private.service_enabled(target_tenant, 'rapportage')
        and signature.tenant_id = target_tenant
        and signature.work_order_id = any(ids)
        and signature.captured_by = auth.uid()
    ), '[]'::jsonb),
    'timeEntries', coalesce((
      select jsonb_agg(to_jsonb(entry) - 'approved_by' order by entry.starts_at desc, entry.id)
      from public.time_entries entry
      where entry.tenant_id = target_tenant and entry.personnel_id = staff_personnel_id
    ), '[]'::jsonb),
    'staffTimeCorrectionRequests', coalesce((
      select jsonb_agg(
        to_jsonb(correction) - array['created_by','reviewed_by']
        order by correction.created_at desc, correction.id
      )
      from public.staff_time_correction_requests correction
      where correction.tenant_id = target_tenant
        and correction.personnel_id = staff_personnel_id
    ), '[]'::jsonb),
    'availability', coalesce((
      select jsonb_agg(to_jsonb(slot) order by slot.starts_at, slot.id)
      from public.availability slot
      where slot.tenant_id = target_tenant and slot.personnel_id = staff_personnel_id
    ), '[]'::jsonb),
    'staffLeaveRequests', coalesce((
      select jsonb_agg(
        to_jsonb(request) - array['created_by','reviewed_by']
        order by request.starts_on desc, request.id
      )
      from public.staff_leave_requests request
      where request.tenant_id = target_tenant and request.personnel_id = staff_personnel_id
    ), '[]'::jsonb),
    'staffLeaveEntitlements', coalesce((
      select jsonb_agg(
        to_jsonb(entitlement) - 'updated_by'
        order by entitlement.calendar_year desc, entitlement.id
      )
      from public.staff_leave_entitlements entitlement
      where entitlement.tenant_id = target_tenant
        and entitlement.personnel_id = staff_personnel_id
    ), '[]'::jsonb),
    'staffDayReviews', coalesce((
      select jsonb_agg(to_jsonb(review) - 'created_by' order by review.day desc, review.id)
      from public.staff_day_reviews review
      where review.tenant_id = target_tenant and review.personnel_id = staff_personnel_id
    ), '[]'::jsonb),
    'staffStatusEvents', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', event.id,
          'tenant_id', event.tenant_id,
          'work_order_id', event.work_order_id,
          'assignment_id', event.assignment_id,
          'previous_status', event.previous_status,
          'new_status', event.new_status,
          'reason_code', event.reason_code,
          'note', event.note,
          'created_at', event.created_at
        )
        order by event.created_at, event.id
      )
      from public.status_events event
      where event.tenant_id = target_tenant
        and event.work_order_id = any(ids)
        and (
          event.assignment_id is null
          or exists (
            select 1
            from public.work_order_assignments own_assignment
            where own_assignment.tenant_id = event.tenant_id
              and own_assignment.id = event.assignment_id
              and own_assignment.personnel_id = staff_personnel_id
          )
        )
    ), '[]'::jsonb),
    'staffMaterials', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', material.id,
          'tenant_id', material.tenant_id,
          'work_order_id', material.work_order_id,
          'task_id', material.task_id,
          'description', material.description,
          'quantity', material.quantity,
          'unit', material.unit,
          'unit_price_cents', finance.unit_price_cents,
          'customer_visible', material.customer_visible,
          'created_at', material.created_at,
          'owned_by_current_user', material.created_by = auth.uid()
        )
        order by material.created_at, material.id
      )
      from public.work_order_material_usage material
      left join private.work_order_material_finance finance
        on finance.tenant_id = material.tenant_id and finance.usage_id = material.id
      where private.service_enabled(target_tenant, 'rapportage')
        and material.tenant_id = target_tenant
        and material.work_order_id = any(ids)
    ), '[]'::jsonb),
    'staffExpenses', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', expense.id,
          'tenant_id', expense.tenant_id,
          'work_order_id', expense.work_order_id,
          'description', expense.description,
          'amount_cents', expense.amount_cents,
          'customer_visible', expense.customer_visible,
          'created_at', expense.created_at,
          'updated_at', expense.updated_at,
          'version', expense.version,
          'owned_by_current_user', expense.created_by = auth.uid()
        ) order by expense.created_at, expense.id
      )
      from public.work_order_expenses expense
      where private.service_enabled(target_tenant, 'rapportage')
        and expense.tenant_id = target_tenant
        and expense.work_order_id = any(ids)
        and expense.personnel_id = staff_personnel_id
    ), '[]'::jsonb),
    'announcements', coalesce((
      select jsonb_agg(to_jsonb(announcement) - 'created_by')
      from public.announcements announcement
      where announcement.tenant_id = target_tenant
        and announcement.published_at <= clock_timestamp()
        and announcement.withdrawn_at is null
        and 'staff' = any(announcement.audience_roles)
    ), '[]'::jsonb),
    'announcementReads', coalesce((
      select jsonb_agg(to_jsonb(read) - 'user_id')
      from public.announcement_reads read
      where read.tenant_id = target_tenant
        and read.user_id = auth.uid()
        and private.announcement_read_allowed(read.tenant_id, read.announcement_id)
    ), '[]'::jsonb),
    'openShifts', coalesce((
      select jsonb_agg(to_jsonb(shift) - array['created_by','selected_personnel_id'])
      from public.open_shifts shift
      where staff_personnel_id is not null
        and private.service_enabled(target_tenant, 'planning')
        and shift.tenant_id = target_tenant
        and private.open_shift_eligible(target_tenant, shift.id, staff_personnel_id)
    ), '[]'::jsonb),
    'shiftInterests', coalesce((
      select jsonb_agg(to_jsonb(interest))
      from public.shift_interests interest
      where private.service_enabled(target_tenant, 'planning')
        and interest.tenant_id = target_tenant
        and interest.personnel_id = staff_personnel_id
    ), '[]'::jsonb),
    'personnelDocuments', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', document.id,
        'tenant_id', document.tenant_id,
        'personnel_id', document.personnel_id,
        'title', document.title,
        'file_name', document.file_name,
        'version', document.version,
        'visible_to_employee', document.visible_to_employee
      ))
      from public.personnel_documents document
      where document.tenant_id = target_tenant
        and document.personnel_id = staff_personnel_id
        and document.visible_to_employee
        and not document.dossier_managed
    ), '[]'::jsonb),
    'extraWorkRules', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', rule.id,
        'tenant_id', rule.tenant_id,
        'task_revision_id', rule.task_revision_id,
        'active', rule.active,
        'requires_photo', rule.requires_photo,
        'requires_review', rule.requires_review
      ))
      from public.extra_work_rules rule
      where private.service_enabled(target_tenant, 'planning')
        and private.service_enabled(target_tenant, 'rapportage')
        and rule.tenant_id = target_tenant
        and rule.active
        and exists (
          select 1
          from public.work_order_allowed_extra_work allowed
          where allowed.tenant_id = rule.tenant_id
            and allowed.extra_work_rule_id = rule.id
            and allowed.work_order_id = any(ids)
        )
    ), '[]'::jsonb),
    'allowedExtraWork', coalesce((
      select jsonb_agg(to_jsonb(extra))
      from public.work_order_allowed_extra_work extra
      where private.service_enabled(target_tenant, 'rapportage')
        and extra.tenant_id = target_tenant
        and extra.work_order_id = any(ids)
    ), '[]'::jsonb),
    'travelLegs', coalesce((
      select jsonb_agg(to_jsonb(leg) - array['origin_address','destination_address','manual_updated_by'])
      from public.travel_legs leg
      join public.work_order_assignments assignment
        on assignment.id = leg.assignment_id and assignment.tenant_id = leg.tenant_id
      where assignment.tenant_id = target_tenant
        and assignment.personnel_id = staff_personnel_id
        and assignment.work_order_id = any(ids)
    ), '[]'::jsonb)
  )
  into result;

  -- Representation negotiation is never an authorization credential.
  if coalesce(nullif(current_setting('request.headers',true),'')::jsonb->>'x-fieldgrid-task-controls','')<>'1' then
    result:=result-'visits';
    result:=jsonb_set(result,'{workOrderTasks}',coalesce((select jsonb_agg((task-array['execution_snapshot','original_quantity','original_budget_minutes','current_budget_minutes'])||jsonb_build_object('duration_minutes',ceil((task->>'duration_minutes')::numeric))) from jsonb_array_elements(result->'workOrderTasks') task),'[]'::jsonb));
  end if;
  return result;
end;
$function$
;
