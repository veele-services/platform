do $migration$
begin
-- A private address cannot acquire a new owner through an operational edit.
create or replace function private.travel_day_address_guard()
returns trigger language plpgsql set search_path='' as $$
declare t uuid:=case when tg_op='DELETE' then old.tenant_id else new.tenant_id end;
 p uuid:=case when tg_op='DELETE' then old.personnel_id else new.personnel_id end;
 caller_role text:=coalesce(nullif(current_setting('request.jwt.claim.role',true),''),nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'role','');
 sensitive_change boolean;
begin
 if tg_op='UPDATE' and (new.tenant_id,new.personnel_id,new.day) is distinct from (old.tenant_id,old.personnel_id,old.day)
 then raise exception 'De medewerker en werkdag van een reisinstelling zijn onveranderlijk' using errcode='23514';end if;
 sensitive_change:=case tg_op when 'INSERT' then new.departure_address is not null
   when 'DELETE' then old.departure_address is not null else new.departure_address is distinct from old.departure_address end;
 if sensitive_change and caller_role<>'service_role' and (auth.uid() is not null or caller_role in ('authenticated','anon'))
   and private.can_access_personnel(t,p,true) is not true
 then raise exception 'Geen bevoegdheid om het privévertrekadres te wijzigen' using errcode='42501';end if;
 if tg_op='DELETE' then return old;end if;
 if new.departure_address is not null then new.departure_address:=private.normalize_changed_address(new.departure_address,case when tg_op='UPDATE' then coalesce(old.departure_address,'{}') else '{}'::jsonb end);end if;
 return new;
end $$;
drop trigger travel_day_address_guard on public.personnel_travel_days;
create trigger travel_day_address_guard before insert or update or delete on public.personnel_travel_days
 for each row execute function private.travel_day_address_guard();

-- Preserve issued source allocations, including deletes and moves out of the
-- old parent. Only line writes take the planning lock: payment/status updates
-- already hold the parent row and must not invert finalize's lock order.
create or replace function private.invoice_lifecycle_guard()
returns trigger language plpgsql security definer set search_path='' as $$
declare parent public.invoices;
 caller_role text:=coalesce(nullif(current_setting('request.jwt.claim.role',true),''),nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'role','');
begin
 -- Owner-only local maintenance has no API caller; never use current_user in
 -- this definer to decide whether an authenticated request is privileged.
 if caller_role='' and auth.uid() is null then return case when tg_op='DELETE' then old else new end;end if;
 if tg_table_name='invoices' then
  if tg_op='DELETE' and (old.status<>'draft' or old.finalized_at is not null)
  then raise exception 'Een definitieve factuur blijft bewaard; gebruik een traceerbare correctie' using errcode='23514';end if;
  if tg_op='UPDATE' and (new.id,new.tenant_id,new.customer_id) is distinct from (old.id,old.tenant_id,old.customer_id)
    and exists(select 1 from public.invoice_lines where tenant_id=old.tenant_id and invoice_id=old.id)
  then raise exception 'Een factuur met bronregels kan niet worden verplaatst' using errcode='23514';end if;
 else
  perform pg_advisory_xact_lock(hashtextextended('fieldgrid-planning:'||old.tenant_id::text,0));
  select * into parent from public.invoices where tenant_id=old.tenant_id and id=old.invoice_id for update;
  if parent.id is not null and (parent.status<>'draft' or parent.finalized_at is not null)
  then raise exception 'Bronregels van een definitieve factuur blijven bewaard' using errcode='23514';end if;
  if tg_op='UPDATE' and (new.id,new.tenant_id,new.invoice_id,new.work_order_id,new.work_order_task_id)
    is distinct from (old.id,old.tenant_id,old.invoice_id,old.work_order_id,old.work_order_task_id)
  then raise exception 'Verwijder een ongebruikte conceptregel en voeg de juiste bron opnieuw toe' using errcode='23514';end if;
 end if;
 return case when tg_op='DELETE' then old else new end;
end $$;
revoke all on function private.invoice_lifecycle_guard() from public,anon,authenticated,service_role;
create trigger invoice_lifecycle_guard before update or delete on public.invoices
 for each row execute function private.invoice_lifecycle_guard();
create trigger invoice_line_lifecycle_guard before update or delete on public.invoice_lines
 for each row execute function private.invoice_lifecycle_guard();

do $patch$
declare definition text;needle text;
begin
 definition:=pg_get_functiondef('private.object_guard()'::regprocedure);
 if position('-- preserve customer authority on object reassignment' in definition)=0 then
  needle:='  if tg_op=''UPDATE'' and new.customer_id<>old.customer_id and exists(select 1 from public.work_orders where tenant_id=new.tenant_id and object_id=new.id) then raise exception ''Een object met uitvoering kan niet naar een andere klant worden verplaatst'' using errcode=''23514'';end if;';
  if position(needle in definition)=0 then raise exception 'Review object ownership guard';end if;
  definition:=replace(definition,needle,'  -- preserve customer authority on object reassignment
  if tg_op=''UPDATE'' and new.customer_id is distinct from old.customer_id and (
    exists(select 1 from public.work_orders where tenant_id=old.tenant_id and object_id=old.id)
    or exists(select 1 from public.object_customer_bindings where tenant_id=old.tenant_id and object_id=old.id)
    or exists(select 1 from public.requests where tenant_id=old.tenant_id and object_id=old.id)
    or exists(select 1 from public.quotes where tenant_id=old.tenant_id and object_id=old.id)
    or exists(select 1 from public.object_records where tenant_id=old.tenant_id and object_id=old.id)
    or exists(select 1 from public.object_documents where tenant_id=old.tenant_id and object_id=old.id)
    or exists(select 1 from public.object_nodes where tenant_id=old.tenant_id and object_id=old.id)
    or exists(select 1 from public.object_visit_requests where tenant_id=old.tenant_id and object_id=old.id)
    or exists(select 1 from public.customer_agreement_lines where tenant_id=old.tenant_id and object_id=old.id)
    or exists(select 1 from public.customer_notes where tenant_id=old.tenant_id and object_id=old.id)
    or exists(select 1 from public.dossier_documents where tenant_id=old.tenant_id and object_id=old.id)
    or exists(select 1 from public.tickets where tenant_id=old.tenant_id and object_id=old.id)
    or exists(select 1 from public.customer_contacts where tenant_id=old.tenant_id and old.id=any(object_ids))
    or exists(select 1 from private.object_secret_items where tenant_id=old.tenant_id and object_id=old.id)
  ) then raise exception ''Dit object heeft toegangskoppelingen of dossierhistorie. Maak voor een andere klant een afzonderlijk object.'' using errcode=''23514'';end if;');
  execute definition;
 end if;
 definition:=pg_get_functiondef('private.customer_guard()'::regprocedure);
 if position('-- archive role applies to every customer write' in definition)=0 then
  needle:=' if tg_table_name=''customers'' then';
  if position(needle in definition)=0 then raise exception 'Review customer lifecycle guard';end if;
  definition:=replace(definition,needle,needle||'
  -- archive role applies to every customer write
  if auth.uid() is not null and not private.has_role(new.tenant_id,array[''tenant_admin'',''management'']::public.app_role[])
    and ((tg_op=''INSERT'' and new.status=''archived'') or (tg_op=''UPDATE'' and new.status is distinct from old.status and (new.status=''archived'' or old.status=''archived'')))
  then raise exception ''Alleen beheer kan relaties archiveren of opnieuw activeren'' using errcode=''42501'';end if;');
  execute definition;
 end if;
 -- A customer binding is not an entitlement; exact retry receipts also require
 -- current entitlement before returning any previously authorized result.
 definition:=pg_get_functiondef('private.commercial_customer_scope(uuid,uuid,uuid,uuid)'::regprocedure);
 needle:='select private.object_session_active() and exists';
 if position(needle in definition)=0 then raise exception 'Review commercial customer scope';end if;
 execute replace(definition,needle,'select private.object_session_active() and private.service_enabled(t,''planning'') and exists');
 definition:=pg_get_functiondef('public.commercial_customer_action(uuid,uuid,text,jsonb)'::regprocedure);
 needle:=' if not private.object_session_active() then';
 if position(needle in definition)=0 then raise exception 'Review commercial customer replay';end if;
 execute replace(definition,needle,' if not private.object_session_active() or not private.service_enabled(target_tenant,''planning'') then');
 definition:=pg_get_functiondef('public.finalize_invoice(uuid)'::regprocedure);
 needle:='if not private.commercial_access(t) then';
 if position(needle in definition)=0 then raise exception 'Review final invoice replay';end if;
 execute replace(definition,needle,'if not private.commercial_access(t) or not private.service_enabled(t,''finance'') then');
 definition:=pg_get_functiondef('public.register_manual_payment(uuid,timestamp with time zone,text,jsonb,text)'::regprocedure);
 needle:='if not private.has_role(target_tenant_id,';
 if position(needle in definition)=0 then raise exception 'Review manual payment replay';end if;
 execute replace(definition,needle,'if not private.service_enabled(target_tenant_id,''finance'') or not private.has_role(target_tenant_id,');
end $patch$;

-- Shared serialization and lifecycle checks also cover direct Data API writes.
do $concurrency$
declare definition text;needle text;
begin
 definition:=pg_get_functiondef('private.invoice_source_guard()'::regprocedure);
 needle:=' select * into i from public.invoices where tenant_id=new.tenant_id and id=new.invoice_id;';
 if position(needle in definition)=0 then raise exception 'Review invoice parent validation lock';end if;
 execute replace(definition,needle,' select * into i from public.invoices where tenant_id=new.tenant_id and id=new.invoice_id for update;');
 definition:=pg_get_functiondef('private.object_binding_version()'::regprocedure);
 needle:=E'begin\n';
 if position(needle in definition)=0 then raise exception 'Review object binding lock';end if;
 execute replace(definition,needle,needle||' perform pg_advisory_xact_lock(hashtextextended(''fieldgrid-planning:''||new.tenant_id::text,0));'||E'\n');
 definition:=pg_get_functiondef('private.customer_guard()'::regprocedure);
 needle:=' if tg_op=''DELETE'' then';
 if position(needle in definition)=0 then raise exception 'Review direct customer delete authorization';end if;
 execute replace(definition,needle,needle||'
  if tg_table_name=''customers'' and auth.uid() is not null and not private.has_role(old.tenant_id,array[''tenant_admin'',''management'']::public.app_role[])
  then raise exception ''Alleen beheer kan relaties verwijderen'' using errcode=''42501'';end if;');
end $concurrency$;
notify pgrst,'reload schema';
end $migration$;
