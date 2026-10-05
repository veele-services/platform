-- The selected account narrows the central customer inbox. Every source still
-- passes its own current authorization; stored paths never choose scope.
create function private.customer_activity_path(t uuid,a uuid,nid uuid)
returns text language plpgsql stable security definer set search_path='' as $$
declare p public.customer_portal_accounts;n public.notifications;d private.notification_domain_events;
 obj uuid;wo uuid;customer uuid;path text;created_by uuid;ticket uuid;request_id uuid;
begin
 if not private.customer_account_access(t,a) then return null;end if;
 select * into p from public.customer_portal_accounts where tenant_id=t and id=a;
 select * into n from public.notifications where tenant_id=t and id=nid and user_id=auth.uid() and context='customer'
  and channel='in_app' and archived_at is null and withdrawn_at is null;
 if n.id is null or not private.notification_source_allowed(t,n.type_code,n.source_kind,n.source_id,n.source_revision,auth.uid(),'customer') then return null;end if;
 path:='/klant?account='||a;
 if n.source_kind='campaign' then
  if private.customer_news_access(t,a,n.id) then return path||'&view=news&news='||n.id;end if;
 elsif n.source_kind='customer_ticket' then
  select e.ticket_id into ticket from public.ticket_events e join private.customer_ticket_bindings b on b.tenant_id=e.tenant_id and b.ticket_id=e.ticket_id
   where e.tenant_id=t and e.id=n.source_id and b.account_id=a and private.customer_ticket_access(b.ticket_id,auth.uid());
  if ticket is not null then return path||'&view=tickets&ticket='||ticket;end if;
 elsif n.source_kind='object' then obj:=n.source_id;
 elsif n.source_kind='commercial' then
  select coalesce(q.customer_id,r.customer_id),coalesce(q.object_id,r.object_id),r.created_by,coalesce(r.customer_portal_group_id,r.id) into customer,obj,created_by,request_id
   from public.commercial_events e left join public.quotes q on q.tenant_id=e.tenant_id and q.id=e.quote_id
   left join public.requests r on r.tenant_id=e.tenant_id and r.id=coalesce(e.request_id,q.request_id) where e.tenant_id=t and e.id=n.source_id;
  if customer=p.customer_id and private.commercial_customer_scope(t,customer,obj,created_by) then return path||'&view=requests'||case when request_id is null then '' else '&request='||request_id end;end if;
  return null;
 elsif n.source_kind='domain' then
  select * into d from private.notification_domain_events where tenant_id=t and id=n.source_id;
  if d.entity_kind='invoice' then
   if exists(select 1 from public.invoices i where i.tenant_id=t and i.id=d.entity_id and i.customer_id=p.customer_id and private.customer_invoice_access(t,i.id)) then return path||'&view=invoices&invoice='||d.entity_id;end if;
  elsif d.entity_kind='quote' then
   if exists(select 1 from public.quotes q where q.tenant_id=t and q.id=d.entity_id and q.customer_id=p.customer_id and private.commercial_customer_scope(t,q.customer_id,q.object_id)) then return path||'&view=requests';end if;
  else
   wo:=d.work_order_id;
   select object_id into obj from public.work_orders where tenant_id=t and id=wo;
   if n.type_code='work_order.cancelled' then wo:=null;end if;
  end if;
 end if;
 if obj is not null and exists(select 1 from public.objects o join public.object_customer_bindings b on b.tenant_id=o.tenant_id and b.object_id=o.id
  where o.tenant_id=t and o.id=obj and o.customer_id=p.customer_id and o.dossier_status<>'archived' and b.user_id=auth.uid() and b.active)
 then
  if wo is not null then
   if private.customer_visit_access(t,obj,wo) then return path||'&view=appointments&object='||obj||'&order='||wo;end if;
   return null;
  end if;
  return path||'&view=objects&object='||obj;
 end if;
 return null;
end $$;

create function public.customer_portal_activity(target_tenant uuid,target_account uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare items jsonb;unread integer;
begin
 if not private.customer_account_access(target_tenant,target_account) then raise exception 'Geen toegang tot klantactiviteit' using errcode='42501';end if;
 select count(*) into unread from public.notifications n where n.tenant_id=target_tenant and n.user_id=auth.uid() and n.read_at is null
  and private.customer_activity_path(target_tenant,target_account,n.id) is not null;
 select coalesce(jsonb_agg(jsonb_build_object('id',n.id,'title',n.title,'summary',left(n.body,240),'createdAt',n.created_at,
  'readAt',n.read_at,'version',n.revision,'targetPath',private.customer_activity_path(target_tenant,target_account,n.id)) order by n.created_at desc,n.id),'[]') into items
 from(select nn.* from public.notifications nn where nn.tenant_id=target_tenant and nn.user_id=auth.uid()
  and private.customer_activity_path(target_tenant,target_account,nn.id) is not null order by nn.created_at desc,nn.id limit 200)n;
 return jsonb_build_object('items',items,'unread',unread);
end $$;

create function public.customer_portal_activity_mark(target_tenant uuid,target_account uuid,operation text,request_id uuid,target_notification uuid default null,expected_version bigint default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare receipt private.customer_portal_commands;n public.notifications;h text;result jsonb;updated integer:=0;
begin
 if request_id is null or not private.customer_account_access(target_tenant,target_account) then raise exception 'Geen toegang tot klantactiviteit' using errcode='42501';end if;
 if operation is null or operation not in('read','read_all') or(operation='read' and(target_notification is null or expected_version is null or expected_version<1))
  or(operation='read_all' and(target_notification is not null or expected_version is not null)) then raise exception 'Ongeldige leesopdracht' using errcode='23514';end if;
 perform pg_advisory_xact_lock(hashtextextended('fieldgrid-notification-policy',0));
 perform pg_advisory_xact_lock(hashtextextended('customer-portal-command:'||request_id::text,0));
 perform 1 from public.customer_portal_accounts where tenant_id=target_tenant and id=target_account for share;
 if not private.customer_account_access(target_tenant,target_account) or(operation='read' and private.customer_activity_path(target_tenant,target_account,target_notification) is null)
 then raise exception 'Dit klantbericht is niet meer toegankelijk' using errcode='42501';end if;
 h:=encode(extensions.digest(jsonb_build_object('notificationId',target_notification,'version',expected_version,'operation',operation)::text,'sha256'),'hex');
 select * into receipt from private.customer_portal_commands where id=request_id;
 if found then
  if receipt.tenant_id<>target_tenant or receipt.account_id<>target_account or receipt.actor_id<>auth.uid() or receipt.command<>'activity_mark' or receipt.input_hash<>h
  then raise exception 'De opdrachtsleutel hoort bij andere invoer' using errcode='23505';end if;
  return receipt.result;
 end if;
 if(select count(*) from private.customer_portal_commands where actor_id=auth.uid() and created_at>clock_timestamp()-interval '1 minute')>=120 then raise exception 'Te veel leesacties' using errcode='54000';end if;
 for n in select nn.* from public.notifications nn where nn.tenant_id=target_tenant and nn.user_id=auth.uid()
  and(operation='read' and nn.id=target_notification or operation='read_all' and nn.read_at is null)
  and private.customer_activity_path(target_tenant,target_account,nn.id) is not null order by nn.id for update
 loop
  if operation='read' and n.revision<>expected_version then raise exception 'Dit bericht is gewijzigd' using errcode='40001';end if;
  if updated>=1000 then raise exception 'Te veel ongelezen berichten; lees eerst afzonderlijke berichten' using errcode='54000';end if;
  perform public.notification_command(target_tenant,'customer','inbox_read',jsonb_build_object('id',n.id,'expected_revision',n.revision),gen_random_uuid());
  updated:=updated+1;
 end loop;
 result:=jsonb_build_object('updated',updated);
 insert into private.customer_portal_commands(id,tenant_id,account_id,actor_id,command,input_hash,result)
 values(request_id,target_tenant,target_account,auth.uid(),'activity_mark',h,result);
 return result;
end $$;
revoke all on function private.customer_activity_path(uuid,uuid,uuid) from public,anon,authenticated,service_role;
revoke all on function public.customer_portal_activity(uuid,uuid),public.customer_portal_activity_mark(uuid,uuid,text,uuid,uuid,bigint) from public,anon,service_role;
grant execute on function public.customer_portal_activity(uuid,uuid),public.customer_portal_activity_mark(uuid,uuid,text,uuid,uuid,bigint) to authenticated;
