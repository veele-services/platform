-- Customer-visible shared documents keep their canonical immutable file source.
create function public.customer_portal_shared_documents(target_tenant uuid,target_account uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare a public.customer_portal_accounts;
begin
 if not private.customer_account_access(target_tenant,target_account) then raise exception 'Geen toegang tot klantdocumenten' using errcode='42501';end if;
 select * into a from public.customer_portal_accounts where tenant_id=target_tenant and id=target_account;
 return coalesce((select jsonb_agg(jsonb_build_object('id',d.id,'title',d.title,'version',d.version,'category',d.category,'date',d.document_on,'validUntil',d.valid_until) order by d.created_at desc,d.id)
 from public.customer_documents d where d.tenant_id=target_tenant and d.customer_id=a.customer_id and private.customer_document_access(target_tenant,d.id)),'[]');
end $$;
revoke all on function public.customer_portal_shared_documents(uuid,uuid) from public,anon,service_role;
grant execute on function public.customer_portal_shared_documents(uuid,uuid) to authenticated;
