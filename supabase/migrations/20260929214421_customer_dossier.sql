-- Append-only customer dossier, available to the planning backoffice only.
create table public.customer_notes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  customer_id uuid not null,
  body text not null check (char_length(btrim(body)) between 1 and 10000),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  foreign key (tenant_id, customer_id) references public.customers(tenant_id, id) on delete cascade
);
create index customer_notes_customer_idx on public.customer_notes (tenant_id, customer_id, created_at desc);
create index customer_notes_author_idx on public.customer_notes (created_by);

create table public.customer_documents (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  customer_id uuid not null,
  title text not null check (char_length(btrim(title)) between 2 and 160),
  storage_path text not null unique,
  file_name text not null check (char_length(file_name) between 1 and 255),
  mime_type text not null check (mime_type in ('application/pdf', 'image/jpeg', 'image/png')),
  size_bytes bigint not null check (size_bytes between 1 and 10485760),
  sha256 text not null check (sha256 ~ '^[a-f0-9]{64}$'),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  foreign key (tenant_id, customer_id) references public.customers(tenant_id, id) on delete restrict,
  constraint customer_document_path check (
    storage_path ~ ('^' || tenant_id::text || '/' || customer_id::text || '/[a-f0-9]{32}\.(pdf|jpg|png)$')
  )
);
create index customer_documents_customer_idx on public.customer_documents (tenant_id, customer_id, created_at desc);
create index customer_documents_author_idx on public.customer_documents (created_by);

do $$
declare table_name text;
begin
  foreach table_name in array array['customer_notes', 'customer_documents'] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('alter table public.%I force row level security', table_name);
    execute format('revoke all on public.%I from anon, authenticated', table_name);
    execute format('grant select, insert on public.%I to authenticated', table_name);
    execute format('grant all on public.%I to service_role', table_name);
    execute format(
      'create policy %I_read on public.%I for select to authenticated using ((select private.has_role(tenant_id, array[''tenant_admin'',''management'',''planner'',''finance'']::public.app_role[])))',
      table_name, table_name
    );
    execute format(
      'create policy %I_insert on public.%I for insert to authenticated with check (created_by = (select auth.uid()) and (select private.has_role(tenant_id, array[''tenant_admin'',''management'',''planner'',''finance'']::public.app_role[])))',
      table_name, table_name
    );
    execute format(
      'create policy %I_planning_entitlement on public.%I as restrictive for all to authenticated using ((select private.service_enabled(tenant_id, ''planning''))) with check ((select private.service_enabled(tenant_id, ''planning'')))',
      table_name, table_name
    );
    execute format(
      'create trigger %I_service_entitlement_guard before insert or update or delete on public.%I for each row execute function private.enforce_service_entitlement(''planning'')',
      table_name, table_name
    );
  end loop;
end;
$$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('customer-documents', 'customer-documents', false, 10485760, array['application/pdf','image/jpeg','image/png']);

-- Keep existing buckets/policies unchanged. Validate both tenant and customer
-- segments, even for direct Storage API calls; no service-role uploads needed.
create function private.can_manage_customer_document(object_name text)
returns boolean language sql stable security invoker set search_path = '' as $$
  select exists (
    select 1 from public.customers c
    where c.tenant_id = private.storage_tenant_id(object_name)
      and c.id = private.storage_subject_id(object_name)
      and private.has_role(c.tenant_id, array['tenant_admin','management','planner','finance']::public.app_role[])
      and private.service_enabled(c.tenant_id, 'planning')
      and object_name ~ ('^' || c.tenant_id::text || '/' || c.id::text || '/[a-f0-9]{32}\.(pdf|jpg|png)$')
  );
$$;
revoke all on function private.can_manage_customer_document(text) from public, anon;
grant execute on function private.can_manage_customer_document(text) to authenticated;

create policy customer_document_storage_read on storage.objects for select to authenticated
using (bucket_id = 'customer-documents' and (select private.can_manage_customer_document(name)));
create policy customer_document_storage_insert on storage.objects for insert to authenticated
with check (bucket_id = 'customer-documents' and (select private.can_manage_customer_document(name)));
-- Failed metadata inserts may be cleaned up, but linked documents stay immutable.
create policy customer_document_storage_cleanup on storage.objects for delete to authenticated
using (
  bucket_id = 'customer-documents' and (select private.can_manage_customer_document(name))
  and not exists (select 1 from public.customer_documents d where d.storage_path = name)
);
