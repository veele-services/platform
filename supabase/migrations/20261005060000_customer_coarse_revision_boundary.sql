-- A separate own-account invalidation channel, never a subscription to rich
-- source rows or shared staff revisions. No client writes or background actor
-- impersonation. Inactive/revoked access closes even this coarse read policy.
create table public.customer_portal_revisions(
 tenant_id uuid not null,
 account_id uuid not null,
 revision bigint not null default 1 check(revision>0),
 changed_at timestamptz not null default clock_timestamp(),
 primary key(tenant_id,account_id),
 foreign key(tenant_id,account_id) references public.customer_portal_accounts(tenant_id,id) on delete cascade
);
alter table public.customer_portal_revisions enable row level security;
alter table public.customer_portal_revisions force row level security;
revoke all on public.customer_portal_revisions from public,anon,authenticated,service_role;
grant select on public.customer_portal_revisions to authenticated;
create policy customer_revision_own on public.customer_portal_revisions for select to authenticated
 using(private.customer_account_access(tenant_id,account_id));
insert into public.customer_portal_revisions(tenant_id,account_id)
select tenant_id,id from public.customer_portal_accounts;
alter publication supabase_realtime add table public.customer_portal_revisions;

create function private.customer_revision_bump(t uuid,a uuid)
returns void language sql volatile security definer set search_path='' as $$
 insert into public.customer_portal_revisions(tenant_id,account_id)
 select p.tenant_id,p.id from public.customer_portal_accounts p where p.tenant_id=t and p.id=a
 on conflict(tenant_id,account_id) do update set revision=customer_portal_revisions.revision+1,changed_at=clock_timestamp();
$$;
revoke all on function private.customer_revision_bump(uuid,uuid) from public,anon,authenticated,service_role;

create function private.customer_account_revision_trigger()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 perform private.customer_revision_bump(new.tenant_id,new.id);
 return new;
end $$;
revoke all on function private.customer_account_revision_trigger() from public,anon,authenticated,service_role;
create trigger customer_account_revision after insert or update on public.customer_portal_accounts
for each row execute function private.customer_account_revision_trigger();
