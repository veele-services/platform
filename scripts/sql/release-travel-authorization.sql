-- Query-first repair: retain estimates/history; reauthorize manual writes at use.
begin;

-- The legacy writer becomes an owner-only implementation, not an alternate RPC.
alter function public.store_travel_estimates(uuid,bigint,jsonb,text,uuid) set schema private;
revoke all on function private.store_travel_estimates(uuid,bigint,jsonb,text,uuid)
  from public,anon,authenticated,service_role;

create function public.store_travel_estimates(
  t uuid, revision bigint, legs jsonb, manual_action text default null,
  actor uuid default null, actor_session uuid default null
) returns boolean language plpgsql security definer set search_path='' as $$
declare leg jsonb; current_context jsonb;
begin
  if manual_action is not null then
    if manual_action not in ('set','clear') or actor is null or actor_session is null
      or jsonb_typeof(legs) is distinct from 'array' then
      raise exception 'Geen toegang' using errcode='42501';
    end if;
    if jsonb_array_length(legs)<>1 then
      raise exception 'Ongeldige handmatige rit' using errcode='22023';
    end if;
    -- Hold only the current authorization rows for this short local transaction.
    -- Acquire these before the travel lock (settings writes also take that lock).
    perform 1 from auth.users u join auth.sessions s on s.user_id=u.id
      join public.tenant_memberships m on m.user_id=u.id and m.tenant_id=t
      join public.tenants te on te.id=m.tenant_id
      join public.tenant_settings st on st.tenant_id=te.id
      where u.id=actor and s.id=actor_session and u.deleted_at is null
        and not coalesce(u.is_anonymous,false)
        and (u.banned_until is null or u.banned_until<=clock_timestamp())
        and (s.not_after is null or s.not_after>clock_timestamp())
        and m.status='active' and te.status='active'
        and 'planning'=any(st.enabled_services)
      for share of u,s,m,te,st;
    if not found then raise exception 'Geen toegang' using errcode='42501';end if;
    perform pg_advisory_xact_lock(hashtextextended('travel:'||t::text,0));
    leg:=legs->0;
    current_context:=public.travel_context(t,actor,actor_session,(leg->>'day')::date,null);
    if coalesce((current_context->>'canManage')::boolean,false) is not true then
      raise exception 'Geen toegang' using errcode='42501';
    end if;
    if not exists(select 1 from jsonb_array_elements(current_context->'assignments') a
      where a->>'id'=leg->>'assignmentId' and a->>'personnelId'=leg->>'personnelId') then
      raise exception 'Geen toegang tot deze rit' using errcode='42501';
    end if;
  end if;
  return private.store_travel_estimates(t,revision,legs,manual_action,actor);
end $$;
revoke all on function public.store_travel_estimates(uuid,bigint,jsonb,text,uuid,uuid)
  from public,anon,authenticated;
grant execute on function public.store_travel_estimates(uuid,bigint,jsonb,text,uuid,uuid) to service_role;
commit;
