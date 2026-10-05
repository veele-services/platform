-- Add only the customer dispatch to the final installed engines. In particular,
-- retain the later notification-module catalog/grant filtering in ticket_query.
do $migration$
declare definition text; signature text; dispatch text; needle text:=E'\nbegin\n';
begin
 foreach signature in array array['public.ticket_query(uuid,text,text,jsonb)','public.ticket_command(uuid,text,text,jsonb,uuid)'] loop
  select pg_get_functiondef(signature::regprocedure) into definition;
  dispatch:=case when signature like '%ticket_query(%' then ' if actor_context=''customer'' then return private.customer_ticket_query(target_tenant,operation,payload);end if;'
   else ' if actor_context=''customer'' then return private.customer_ticket_command(target_tenant,command,payload,request_id);end if;' end;
  if position(dispatch in definition)=0 then
   if position(needle in definition)=0 then raise exception 'Ticket engine declaration no longer matches';end if;
   definition:=overlay(definition placing needle||dispatch||E'\n' from position(needle in definition) for length(needle));
   execute definition;
  end if;
 end loop;
end $migration$;
