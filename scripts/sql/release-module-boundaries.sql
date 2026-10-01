do $migration$
begin
-- Tenant settings are provisioned by the platform. Tenant administrators may
-- edit ordinary settings, not replace or move the entitlement-bearing record.
revoke insert,delete on public.tenant_settings from authenticated;
drop policy if exists tenant_settings_manage_insert on public.tenant_settings;
drop policy if exists tenant_settings_manage_delete on public.tenant_settings;
create or replace function private.protect_platform_entitlements()
returns trigger language plpgsql security definer set search_path='' as $$
declare caller_role text:=coalesce(nullif(current_setting('request.jwt.claim.role',true),''),
 nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'role','');
begin
 if caller_role<>'service_role' then
  if tg_op in ('INSERT','DELETE') and caller_role in ('authenticated','anon') then
   raise exception 'De platformbeheerder beheert de tenantinstellingenregistratie' using errcode='42501';
  elsif tg_op='UPDATE' and (new.tenant_id,new.enabled_services,new.white_label_enabled)
    is distinct from (old.tenant_id,old.enabled_services,old.white_label_enabled) then
   raise exception 'Tenantkoppeling, modules en whitelabel worden door het platform beheerd' using errcode='42501';
  end if;
 end if;
 return case when tg_op='DELETE' then old else new end;
end $$;
revoke all on function private.protect_platform_entitlements() from public,anon,authenticated,service_role;
drop trigger tenant_settings_protect_platform_entitlements on public.tenant_settings;
create trigger tenant_settings_protect_platform_entitlements before insert or delete or update on public.tenant_settings
 for each row execute function private.protect_platform_entitlements();

-- Preserve the existing explicit privacy projections. Add module gates before
-- aggregating their source rows; personeel-only tenants retain their own HR UI.
do $patch$
declare definition text;pair text[];needle text;
begin
 definition:=pg_get_functiondef('public.staff_workspace(uuid)'::regprocedure);
 if position('-- module-scoped staff workspace' in definition)=0 then
  definition:=replace(definition,'begin','begin'||chr(10)||' -- module-scoped staff workspace');
  needle:='w.tenant_id=target_tenant and private.is_work_order_assignee';
  if position(needle in definition)=0 then raise exception 'Review staff assignment projection';end if;
  definition:=replace(definition,needle,'w.tenant_id=target_tenant and private.service_enabled(target_tenant,''planning'') and private.is_work_order_assignee');
  foreach pair slice 1 in array array[
   ['public.task_catalog c','planning'],['public.task_revisions r','planning'],
   ['public.open_shifts a','planning'],['public.shift_interests a','planning'],
   ['public.report_entries e','rapportage'],['public.attachments a','rapportage'],
   ['public.signatures s','rapportage'],['public.extra_work_rules a','rapportage'],
   ['public.work_order_allowed_extra_work a','rapportage']
  ] loop
   needle:='from '||pair[1]||' where ';
   if position(needle in definition)=0 then raise exception 'Review staff module source: %',pair[1];end if;
   definition:=replace(definition,needle,needle||format('private.service_enabled(target_tenant,%L) and ',pair[2]));
  end loop;
  definition:=replace(definition,'from public.extra_work_rules a where ',
    'from public.extra_work_rules a where private.service_enabled(target_tenant,''planning'') and ');
  execute definition;
 end if;
 definition:=pg_get_functiondef('public.work_order_dossier(uuid,uuid)'::regprocedure);
 if position('-- module-scoped work-order dossier' in definition)=0 then
  definition:=replace(definition,'begin','begin'||chr(10)||' -- module-scoped work-order dossier');
  foreach pair slice 1 in array array[
   ['where a.work_order_id=w.id and t.tenant_id=w.tenant_id','personeel'],
   ['where r.work_order_id=w.id and r.deleted_at is null','rapportage'],
   ['where a.work_order_id=w.id and a.deleted_at is null','rapportage']
  ] loop
   needle:=pair[1];
   if position(needle in definition)=0 then raise exception 'Review work-order module source: %',needle;end if;
   definition:=replace(definition,needle,'where '||format('private.service_enabled(target_tenant,%L) and ',pair[2])||substr(needle,7));
  end loop;
  needle:='''canReview'',private.has_role';
  if position(needle in definition)=0 then raise exception 'Review work-order review capability';end if;
  definition:=replace(definition,needle,'''canReview'',private.service_enabled(target_tenant,''rapportage'') and private.has_role');
  execute definition;
 end if;
 -- Exact legacy retries intentionally accept their old expected_version. The
 -- stored work order and assignment, not a new caller-selected target, define
 -- the receipt. Re-authorize the module before either path returns any data.
 definition:=pg_get_functiondef('public.dispatch_work_order(uuid,uuid,bigint,text)'::regprocedure);
 if position('-- module-scoped dispatch retry' in definition)=0 then
  needle:='  if exists (';
  if position(needle in definition)=0 then raise exception 'Review dispatch replay boundary';end if;
  definition:=replace(definition,needle,'  -- module-scoped dispatch retry
  if not private.service_enabled(target.tenant_id,''planning'') then
    raise exception ''De module Planning is niet ingeschakeld'' using errcode=''42501'';
  end if;
  if expected_version is null or expected_version<1 or nullif(btrim(idempotency_key),'''') is null then
    raise exception ''Versie en herhaalcode zijn verplicht'' using errcode=''23514'';
  end if;
  if exists(select 1 from public.dispatches d left join public.work_order_assignments a
    on a.id=d.assignment_id and a.tenant_id=d.tenant_id
    where d.tenant_id=target.tenant_id and d.idempotency_key=dispatch_work_order.idempotency_key
    and (d.work_order_id is distinct from target.id or a.work_order_id is distinct from target.id
      or a.personnel_id is distinct from target_personnel_id)) then
    raise exception ''Deze herhaalcode hoort bij een andere werkbon of medewerker'' using errcode=''23505'';
  end if;
'||needle);
  execute definition;
 end if;
end $patch$;
notify pgrst,'reload schema';
end $migration$;
