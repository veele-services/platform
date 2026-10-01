begin;

create or replace function private.public_commercial_enabled(target_tenant uuid)
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select exists(
    select 1
    from public.tenants t
    join public.tenant_settings s on s.tenant_id=t.id
    where t.id=target_tenant
      and t.status='active'
      and 'planning'=any(s.enabled_services)
  );
$$;

revoke all on function private.public_commercial_enabled(uuid) from public,anon,authenticated,service_role;

do $patch$
declare
  target record;
  definition text;
  needle text:=chr(10)||'begin'||chr(10);
  boundary text;
  insertion_at integer;
begin
  for target in
    select * from (values
      ('private.commercial_intake(uuid,uuid,jsonb,text,uuid,uuid,uuid)','t'),
      ('public.commercial_public_intake(uuid,uuid,jsonb,text)','target_tenant'),
      ('public.commercial_external_decision(text,uuid,jsonb)','target_tenant'),
      ('public.book_appointment_slot(uuid,uuid,uuid,uuid)','target_tenant_id')
    ) as functions(signature,tenant_argument)
  loop
    select pg_get_functiondef(to_regprocedure(target.signature)) into definition;
    if definition is null then
      raise exception 'Commercial boundary function is missing: %',target.signature;
    end if;
    if position('-- public commercial entitlement boundary' in definition)=0 then
      insertion_at:=position(needle in definition);
      if insertion_at=0 then
        raise exception 'Review commercial boundary insertion: %',target.signature;
      end if;
      boundary:=format(
        E' -- public commercial entitlement boundary\n if not private.public_commercial_enabled(%s) then\n  raise exception ''De module Planning is niet beschikbaar'' using errcode=''42501'';\n end if;\n',
        target.tenant_argument
      );
      definition:=overlay(definition placing boundary from insertion_at+length(needle) for 0);
      execute definition;
    end if;
  end loop;
end $patch$;

notify pgrst,'reload schema';
commit;
