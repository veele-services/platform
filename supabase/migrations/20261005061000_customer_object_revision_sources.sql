-- Invalidation only: no new resource access or rich source subscriptions.
-- Recipient scope is the explicit account plus exact binding, never a JWT
-- impersonation or a shared contact email. Private/vault fields are excluded.
create function private.customer_revision_for_object(t uuid,c uuid,o uuid)
returns void language plpgsql volatile security definer set search_path='' as $$
declare a uuid;
begin
 for a in select p.id from public.customer_portal_accounts p
  where p.tenant_id=t and p.customer_id=c
   and exists(select 1 from public.object_customer_bindings b
    where b.tenant_id=t and b.object_id=o and b.user_id=p.user_id and b.active)
  order by p.id
 loop perform private.customer_revision_bump(t,a);end loop;
end $$;
revoke all on function private.customer_revision_for_object(uuid,uuid,uuid) from public,anon,authenticated,service_role;

create function private.customer_object_revision_trigger()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_op='UPDATE' and row(new.customer_id,new.object_number,new.name,new.object_type,new.dossier_status,new.floor_area_m2,
   new.address->>'street',new.address->>'postal_code',new.address->>'city')
  is not distinct from row(old.customer_id,old.object_number,old.name,old.object_type,old.dossier_status,old.floor_area_m2,
   old.address->>'street',old.address->>'postal_code',old.address->>'city') then return new;end if;
 if tg_op<>'INSERT' then perform private.customer_revision_for_object(old.tenant_id,old.customer_id,old.id);end if;
 if tg_op<>'DELETE' and(tg_op='INSERT' or new.customer_id is distinct from old.customer_id) then
  perform private.customer_revision_for_object(new.tenant_id,new.customer_id,new.id);
 end if;
 return case when tg_op='DELETE' then old else new end;
end $$;
revoke all on function private.customer_object_revision_trigger() from public,anon,authenticated,service_role;
create trigger customer_object_revision after insert or update or delete on public.objects
 for each row execute function private.customer_object_revision_trigger();

create function private.customer_binding_revision_trigger()
returns trigger language plpgsql security definer set search_path='' as $$
declare a record;
begin
 if tg_op='UPDATE' and row(new.tenant_id,new.object_id,new.user_id,new.active)
  is not distinct from row(old.tenant_id,old.object_id,old.user_id,old.active) then return new;end if;
 -- After revocation the active binding no longer exists: target the account
 -- explicitly named by the old binding too. Its SELECT policy still governs
 -- whether the resulting coarse revision can be received.
 for a in select distinct p.tenant_id,p.id from public.customer_portal_accounts p
  join public.objects o on o.tenant_id=p.tenant_id and o.customer_id=p.customer_id
  where(tg_op<>'INSERT' and old.active and p.tenant_id=old.tenant_id and p.user_id=old.user_id and o.id=old.object_id)
    or(tg_op<>'DELETE' and new.active and p.tenant_id=new.tenant_id and p.user_id=new.user_id and o.id=new.object_id)
  order by p.tenant_id,p.id
 loop perform private.customer_revision_bump(a.tenant_id,a.id);end loop;
 return case when tg_op='DELETE' then old else new end;
end $$;
revoke all on function private.customer_binding_revision_trigger() from public,anon,authenticated,service_role;
create trigger customer_binding_revision after insert or update or delete on public.object_customer_bindings
 for each row execute function private.customer_binding_revision_trigger();
