-- Existing tenant_branding stays canonical. Its existing timestamp becomes a
-- real monotone CAS source, without a parallel registration or client version.
create function private.tenant_branding_touch()
returns trigger language plpgsql set search_path='' as $$
begin
 new.updated_at:=greatest(clock_timestamp(),old.updated_at+interval '1 microsecond');
 return new;
end $$;
revoke all on function private.tenant_branding_touch() from public,anon,authenticated,service_role;
create trigger tenant_branding_touch before update on public.tenant_branding
for each row execute function private.tenant_branding_touch();

-- House style is a tenant setting even when optional modules are disabled.
-- This grants management only the coarse counter, never the changed rows.
create policy tenant_house_style_revision_management_read
on public.staff_workspace_revisions for select to authenticated
using (
 private.object_session_active()
 and private.has_role(tenant_id,array['management','tenant_admin']::public.app_role[])
);

-- Only publicly projected style changes invalidate all three tenant portals.
-- Clients never subscribe to raw branding rows, sender mail or PDF settings.
create function private.tenant_house_style_revision()
returns trigger language plpgsql security definer set search_path='' as $$
declare t uuid;a uuid;
begin
 if tg_op='UPDATE' and row(old.primary_color,old.accent_color,old.logo_path)
  is not distinct from row(new.primary_color,new.accent_color,new.logo_path) then return new;end if;
 t:=case when tg_op='DELETE' then old.tenant_id else new.tenant_id end;
 if not exists(select 1 from public.tenants where id=t) then
  if tg_op='DELETE' then return old;end if;return new;
 end if;
 insert into public.staff_workspace_revisions(tenant_id,revision,updated_at)
 values(t,1,clock_timestamp()) on conflict(tenant_id) do update
 set revision=staff_workspace_revisions.revision+1,updated_at=excluded.updated_at;
 for a in select id from public.customer_portal_accounts where tenant_id=t order by id loop
  perform private.customer_revision_bump(t,a);
 end loop;
 if tg_op='DELETE' then return old;end if;return new;
end $$;
revoke all on function private.tenant_house_style_revision() from public,anon,authenticated,service_role;
create trigger tenant_house_style_revision after insert or update or delete on public.tenant_branding
for each row execute function private.tenant_house_style_revision();
