-- A group is only a presentation/receipt key on existing requests. Each object
-- still has its own canonical request, owner, status, quote and planning chain.
alter table public.requests add column customer_portal_group_id uuid;
create index customer_request_group_idx on public.requests(tenant_id,customer_portal_group_id) where customer_portal_group_id is not null;

create function public.customer_portal_requests(target_tenant uuid,target_account uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare a public.customer_portal_accounts;result jsonb;
begin
 if not private.customer_account_access(target_tenant,target_account) then raise exception 'Geen toegang tot klantaanvragen' using errcode='42501';end if;
 select * into a from public.customer_portal_accounts where tenant_id=target_tenant and id=target_account;
 if not private.service_enabled(target_tenant,'planning') then return '[]';end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',data.group_id,'number',data.number,'subject',data.subject,'description',data.description,
  'status',data.status,'objectIds',data.objects,'createdAt',data.created_at,'frequency',data.frequency,'preferredOn',data.preferred_on,'parts',data.parts)
  order by data.created_at desc,data.group_id),'[]') into result from(
  select coalesce(r.customer_portal_group_id,r.id)group_id,min(r.request_number)number,min(r.subject)subject,min(r.description)description,
   case when count(distinct r.status)>1 then 'mixed' else min(r.status) end status,
   coalesce(jsonb_agg(distinct r.object_id) filter(where r.object_id is not null),'[]')objects,min(r.created_at)created_at,
   coalesce(min(r.preferences->>'frequency'),'In overleg')frequency,min(r.preferences->>'date')::date preferred_on,
   jsonb_agg(jsonb_build_object('id',r.id,'number',r.request_number,'objectId',r.object_id,'status',r.status) order by r.created_at,r.id)parts
  from public.requests r where r.tenant_id=target_tenant and r.customer_id=a.customer_id
   and private.commercial_customer_scope(target_tenant,r.customer_id,r.object_id,r.created_by)
  group by coalesce(r.customer_portal_group_id,r.id)
 )data;
 return result;
end $$;
revoke all on function public.customer_portal_requests(uuid,uuid) from public,anon,service_role;
grant execute on function public.customer_portal_requests(uuid,uuid) to authenticated;
