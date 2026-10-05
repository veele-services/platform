-- Keep the existing planning transaction, authorization and retry contract.
-- Recording an arrival preference does not plan an execution; assigning it later
-- makes it tentative until the existing explicit publication action is used.
DO $migration$
DECLARE
  definition text;
  original text;
  replacement text;
BEGIN
  definition := pg_get_functiondef('private.planning_snapshot(uuid)'::regprocedure);
  original := '''plannedEnd'',o.planned_end_at,''version'',o.version,';
  replacement := '''plannedEnd'',o.planned_end_at,''version'',o.version,''planningState'',o.planning_state,';
  IF position(original in definition) = 0 THEN
    RAISE EXCEPTION 'Unexpected planning snapshot definition';
  END IF;
  EXECUTE replace(definition, original, replacement);

  definition := pg_get_functiondef('public.change_work_order_planning(uuid,uuid,bigint,uuid,timestamptz,timestamptz,jsonb,text[],uuid,jsonb)'::regprocedure);
  original := 'requested_date=w.requested_date,customer_window_kind=w.customer_window_kind,required_personnel=w.required_personnel,day_instructions=w.day_instructions where id=w.id;';
  replacement := 'requested_date=w.requested_date,customer_window_kind=w.customer_window_kind,required_personnel=w.required_personnel,day_instructions=w.day_instructions,
    planning_state=case
      when undo_change is not null then coalesce(undo_record.before_data->>''planningState'',w.planning_state)
      when w.planning_state=''unassigned'' and target_start is not null and jsonb_array_length(target_assignments)>0 then ''tentative''
      when w.planning_state=''tentative'' and target_start is null then ''unassigned''
      else w.planning_state end where id=w.id;';
  IF position(original in definition) = 0 THEN
    RAISE EXCEPTION 'Unexpected planning mutation definition';
  END IF;
  EXECUTE replace(definition, original, replacement);
END
$migration$;
