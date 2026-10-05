-- News is an already delivered customer-directed central campaign, not a staff
-- announcement or a new publication table. Select the explicit account's
-- confirmed customer/object audience and retain the central live source check.
create function private.customer_news_access(t uuid,a uuid,n uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select private.customer_account_access(t,a) and exists(
  select 1 from public.customer_portal_accounts p
  join public.notifications notice on notice.tenant_id=p.tenant_id and notice.user_id=p.user_id
  join private.notification_campaign_recipients recipient on recipient.tenant_id=p.tenant_id and recipient.id=notice.source_id
   and recipient.user_id=p.user_id and recipient.context='customer' and recipient.source_context->>'customer_id'=p.customer_id::text
  join public.objects obj on obj.tenant_id=p.tenant_id and obj.customer_id=p.customer_id and obj.id::text=recipient.source_context->>'object_id'
  where p.tenant_id=t and p.id=a and notice.id=n and notice.context='customer' and notice.channel='in_app'
   and notice.type_code='manual.tenant' and notice.source_kind='campaign' and notice.archived_at is null and notice.withdrawn_at is null
   and exists(select 1 from public.object_customer_bindings b where b.tenant_id=t and b.object_id=obj.id and b.user_id=p.user_id and b.active)
   and private.notification_source_allowed(t,notice.type_code,notice.source_kind,notice.source_id,notice.source_revision,p.user_id,'customer')
 );
$$;
revoke all on function private.customer_news_access(uuid,uuid,uuid) from public,anon,authenticated,service_role;

create function public.customer_portal_news(target_tenant uuid,target_account uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not private.customer_account_access(target_tenant,target_account) then raise exception 'Geen toegang tot klantnieuws' using errcode='42501';end if;
 return coalesce((select jsonb_agg(jsonb_build_object('id',n.id,'title',n.title,'summary',left(n.body,180),'body',n.body,
  'category',coalesce(cat.category,'Nieuws'),'createdAt',n.created_at,'readAt',n.read_at,'version',n.revision,
  'ackRequired',n.ack_required,'acknowledgedAt',n.acknowledged_at) order by n.created_at desc,n.id)
  from(select notice.* from public.notifications notice where notice.tenant_id=target_tenant and notice.user_id=auth.uid()
   and private.customer_news_access(target_tenant,target_account,notice.id) order by notice.created_at desc,notice.id limit 100)n
  left join public.notification_catalog cat on cat.code=n.type_code),'[]');
end $$;
revoke all on function public.customer_portal_news(uuid,uuid) from public,anon,service_role;
grant execute on function public.customer_portal_news(uuid,uuid) to authenticated;
