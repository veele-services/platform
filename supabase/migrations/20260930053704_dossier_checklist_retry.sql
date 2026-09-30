SET local check_function_bodies = off;

CREATE OR REPLACE FUNCTION private.task_execution_guard()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
 -- A repeated checked checkbox must not turn a partial result into full execution.
 if new.completed_at is not null and old.completed_at is not null and (new.executed_quantity,new.execution_state,new.completion_note) is not distinct from (old.executed_quantity,old.execution_state,old.completion_note) then new.completed_at:=old.completed_at;return new;end if;
 if (new.executed_quantity,new.execution_state,new.completed_at,new.completion_note) is distinct from (old.executed_quantity,old.execution_state,old.completed_at,old.completion_note) then
  if new.executed_quantity is not distinct from old.executed_quantity and new.execution_state=old.execution_state and new.completed_at is distinct from old.completed_at then
   new.executed_quantity:=case when new.completed_at is not null then new.quantity else null end;
   new.execution_state:=case when new.completed_at is not null then 'completed' else 'planned' end;
  end if;
  new.execution_version:=old.execution_version+1;
 end if;
 return new;
end $function$;
