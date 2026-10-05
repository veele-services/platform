-- Freeze the authorized audience at the domain transition, then enqueue through
-- the existing worker. Never take the notification policy lock while settlement
-- holds payment/invoice locks: the worker owns policy -> notification locks.
update public.notification_catalog set status='active' where code in('customer.report_available','customer.payment_received');
insert into private.notification_templates(type_code,context,channel,draft)
select code,'customer',ch,jsonb_build_object('title',case code when 'customer.report_available' then 'Nieuw rapport beschikbaar' else 'Betaling ontvangen' end,
 'body',case code when 'customer.report_available' then 'Een vrijgegeven rapport staat klaar in je klantportaal.' else 'Een betaling voor je facturen is bevestigd. Bekijk de actuele factuurstatus in je klantportaal.' end,'cta_label','Bekijken')
from unnest(array['customer.report_available','customer.payment_received'])code cross join unnest(array['in_app','email'])ch on conflict do nothing;
insert into private.notification_template_versions(template_id,revision,definition)
select id,revision,draft from private.notification_templates where type_code in('customer.report_available','customer.payment_received') and active_version_id is null on conflict do nothing;
update private.notification_templates t set active_version_id=v.id from private.notification_template_versions v
where v.template_id=t.id and v.revision=t.revision and t.type_code in('customer.report_available','customer.payment_received') and t.active_version_id is null;

-- Actor-parametric identity is for deferred delivery, not an interactive session.
-- The account/contact check must be exact even when a user owns another account.
create function private.customer_notification_account(t uuid,a uuid,actor uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select private.notification_actor_active(t,'customer',actor) and exists(
 select 1 from public.customer_portal_accounts p join public.customers c on c.tenant_id=p.tenant_id and c.id=p.customer_id
 join public.tenants tn on tn.id=p.tenant_id
 left join public.customer_contacts ct on ct.tenant_id=p.tenant_id and ct.id=p.contact_id and ct.customer_id=p.customer_id
 where p.tenant_id=t and p.id=a and p.user_id=actor and p.active and c.status not in('inactive','archived','draft')
 and(p.contact_id is null or(ct.active and(ct.active_from is null or ct.active_from<=(clock_timestamp() at time zone tn.timezone)::date)
 and(ct.active_until is null or ct.active_until>=(clock_timestamp() at time zone tn.timezone)::date))))
$$;
create function private.customer_notification_resource(t uuid,a uuid,kind text,entity uuid,actor uuid) returns boolean
language plpgsql stable security definer set search_path='' as $$
declare p public.customer_portal_accounts;payment public.payment_attempts;
begin
 if not private.customer_notification_account(t,a,actor) or not private.service_enabled(t,'planning') then return false;end if;
 select * into p from public.customer_portal_accounts where tenant_id=t and id=a;
 if kind='customer_report' then
  return private.service_enabled(t,'rapportage') and exists(select 1 from public.work_order_report_versions r
   join public.work_orders w on w.tenant_id=r.tenant_id and w.id=r.work_order_id
   join public.objects o on o.tenant_id=w.tenant_id and o.id=w.object_id and o.customer_id=p.customer_id
   join public.object_customer_bindings b on b.tenant_id=w.tenant_id and b.object_id=w.object_id and b.user_id=actor and b.active
   where r.tenant_id=t and r.id=entity and r.state='approved' and r.approved_at is not null and w.customer_id=p.customer_id);
 elsif kind='customer_payment' then
  if not private.service_enabled(t,'finance') then return false;end if;
  select pa.* into payment from public.payment_attempts pa join public.invoice_groups g on g.tenant_id=pa.tenant_id and g.id=pa.invoice_group_id and g.customer_id=p.customer_id
   where pa.tenant_id=t and pa.id=entity and pa.provider='mollie' and pa.status='paid' and pa.paid_at is not null;
  if payment.id is null or payment.provider_payment_id is null
   or payment.provider_payload->>'id' is distinct from payment.provider_payment_id or payment.provider_payload->>'status' is distinct from 'paid'
   or payment.provider_payload->>'mode' is distinct from payment.provider_mode
   or payment.provider_payload#>>'{metadata,tenant_id}' is distinct from t::text
   or payment.provider_payload#>>'{metadata,payment_attempt_id}' is distinct from payment.id::text
   or payment.provider_payload#>>'{metadata,invoice_group_id}' is distinct from payment.invoice_group_id::text
   or(payment.merchant_profile_id is not null and payment.provider_payload->>'profileId' is distinct from payment.merchant_profile_id)
  then return false;end if;
  return exists(select 1 from public.payment_allocations al where al.tenant_id=t and al.payment_attempt_id=entity)
   and not exists(select 1 from public.payment_allocations al left join public.invoices i on i.tenant_id=al.tenant_id and i.id=al.invoice_id
    where al.tenant_id=t and al.payment_attempt_id=entity and(i.id is null or i.customer_id<>p.customer_id or i.status not in('sent','partially_paid','paid','overdue','credited')
     or not exists(select 1 from public.invoice_lines l where l.tenant_id=t and l.invoice_id=i.id)
     or exists(select 1 from public.invoice_lines l left join public.work_orders w on w.tenant_id=l.tenant_id and w.id=l.work_order_id
      left join public.objects o on o.tenant_id=w.tenant_id and o.id=w.object_id
      where l.tenant_id=t and l.invoice_id=i.id and(w.id is null or w.customer_id<>p.customer_id or o.customer_id is distinct from p.customer_id
       or not exists(select 1 from public.object_customer_bindings b where b.tenant_id=t and b.object_id=w.object_id and b.user_id=actor and b.active)))));
 end if;
 return false;
end $$;

-- Revisions catch ON -> OFF -> ON before a deferred worker can create requests.
-- A relevant preference edit conservatively suppresses an older deferred notice
-- even if it also edits another channel; unrelated users/types do not affect it.
create function private.customer_notification_policy_revision(t uuid,code text,actor uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_object_agg(ch,encode(extensions.digest(jsonb_build_array(
  (select jsonb_agg(jsonb_build_array(p.id,p.revision,p.mode,p.settings) order by p.id) from private.notification_policies p
   where(p.tenant_id is null or p.tenant_id=t) and(p.context is null or p.context='customer') and(p.type_code is null or p.type_code=$2) and(p.channel is null or p.channel=ch)),
  (select jsonb_agg(jsonb_build_array(p.id,p.revision,p.in_app,p.email,p.quiet_start,p.quiet_end,p.timezone) order by p.id) from private.notification_preferences p
   where p.tenant_id=t and p.user_id=actor and p.context='customer' and(p.type_code is null or p.type_code=$2)),
  (select jsonb_build_array(c.status,c.channels,c.default_channels,c.module) from public.notification_catalog c where c.code=$2)
 )::text,'sha256'),'hex')) from unnest(array['in_app','email'])ch
$$;

create function private.customer_notification_transition() returns trigger language plpgsql security definer set search_path='' as $$
declare kind text;code text;recipients jsonb;event uuid;wo uuid;
begin
 if tg_table_name='work_order_report_versions' then
  if new.state<>'approved' or(tg_op='UPDATE' and old.state='approved') then return new;end if;
  kind:='customer_report';code:='customer.report_available';wo:=new.work_order_id;
 else
  if new.status<>'paid' or new.provider<>'mollie' or(tg_op='UPDATE' and old.status='paid') then return new;end if;
  kind:='customer_payment';code:='customer.payment_received';
 end if;
 select coalesce(jsonb_agg(jsonb_build_object('user_id',a.user_id,'account_id',a.id,'context','customer','policy_revision',private.customer_notification_policy_revision(new.tenant_id,code,a.user_id),'suppressed_routes',
  coalesce((select jsonb_agg('customer:'||ch) from unnest(array['in_app','email'])ch where not coalesce((private.notification_policy(new.tenant_id,code,'customer',ch,a.user_id)->>'allowed')::boolean,false)),'[]')) order by a.id),'[]') into recipients
 from public.customer_portal_accounts a where a.tenant_id=new.tenant_id and private.customer_notification_resource(new.tenant_id,a.id,kind,new.id,a.user_id);
 if jsonb_array_length(recipients)=0 then return new;end if;
 insert into private.notification_domain_events(tenant_id,type_code,entity_kind,entity_id,work_order_id,source_revision,dedupe_key,recipients)
 values(new.tenant_id,code,kind,new.id,wo,new.id::text,code||':'||new.id,recipients) on conflict do nothing returning id into event;
 if event is not null then perform private.enqueue_event(new.tenant_id,'customer.portal_notification','notification',event,'{}','customer-notification:'||event);end if;
 return new;
end $$;
create trigger customer_report_notification after insert or update of state on public.work_order_report_versions for each row execute function private.customer_notification_transition();
create trigger customer_payment_notification after insert or update of status on public.payment_attempts for each row execute function private.customer_notification_transition();

alter function private.notification_domain_source_allowed(uuid,text,uuid,text,uuid,text) rename to notification_domain_source_before_customer_delivery;
create function private.notification_domain_source_allowed(t uuid,code text,source uuid,revision text,recipient uuid,ctx text)
returns boolean language plpgsql stable security definer set search_path='' as $$
declare e private.notification_domain_events;
begin
 if code in('customer.report_available','customer.payment_received') then
  select * into e from private.notification_domain_events where tenant_id=t and id=source and type_code=code and source_revision=revision;
  return ctx='customer' and e.entity_kind=case code when 'customer.report_available' then 'customer_report' else 'customer_payment' end
   and e.source_revision=e.entity_id::text and exists(select 1 from jsonb_array_elements(e.recipients)r where r->>'context'='customer' and r->>'user_id'=recipient::text
    and private.customer_notification_resource(t,(r->>'account_id')::uuid,e.entity_kind,e.entity_id,recipient));
 end if;
 return private.notification_domain_source_before_customer_delivery(t,code,source,revision,recipient,ctx);
end $$;

alter function private.notification_capture_outbox(uuid,boolean) rename to notification_capture_outbox_before_customer_delivery;
create function private.notification_capture_outbox(target_event uuid,prepare boolean default false) returns integer
language plpgsql security definer set search_path='' as $$
declare o public.outbox_events;e private.notification_domain_events;r jsonb;req uuid;path text;n integer:=0;current_policy jsonb;suppressed jsonb;
begin
 select * into o from public.outbox_events where id=target_event;
 if o.event_type is distinct from 'customer.portal_notification' then return private.notification_capture_outbox_before_customer_delivery(target_event,prepare);end if;
 -- Same ordering as canonical enqueue; no source resource row locks are taken.
 perform pg_advisory_xact_lock(hashtextextended('fieldgrid-notification-policy',0));
 select * into o from public.outbox_events where id=target_event for update;
 select * into e from private.notification_domain_events where tenant_id=o.tenant_id and id=o.aggregate_id
  and type_code in('customer.report_available','customer.payment_received');
 if e.id is null then raise exception 'Klantnotificatiebron ontbreekt' using errcode='23514';end if;
 if not exists(select 1 from private.notification_captured_outbox where event_id=o.id) then
  for r in select value from jsonb_array_elements(e.recipients) loop
   if not private.customer_notification_resource(e.tenant_id,(r->>'account_id')::uuid,e.entity_kind,e.entity_id,(r->>'user_id')::uuid) then continue;end if;
   current_policy:=private.customer_notification_policy_revision(e.tenant_id,e.type_code,(r->>'user_id')::uuid);
   select coalesce(r->'suppressed_routes','[]')||coalesce(jsonb_agg('customer:'||ch),'[]') into suppressed
    from unnest(array['in_app','email'])ch where r->'policy_revision'->ch is distinct from current_policy->ch;
   path:='/klant?account='||(r->>'account_id')||case e.entity_kind when 'customer_report' then '&view=reports&report='||e.entity_id else '&view=invoices' end;
   perform private.notification_enqueue(e.tenant_id,e.type_code,'domain',e.id,e.source_revision,'customer-domain:'||e.id||':'||(r->>'user_id'),
    jsonb_build_object('recipient_user_id',r->>'user_id','context','customer','channels',array['in_app','email'],'path',path,'suppressed_routes',suppressed,
     'expires_at',e.created_at+make_interval(mins=>(select ttl_minutes from public.notification_catalog where notification_catalog.code=e.type_code))));
  end loop;
  insert into private.notification_captured_outbox(event_id,tenant_id)values(o.id,o.tenant_id)on conflict do nothing;
 end if;
 if prepare then
  for req in select id from private.notification_requests where tenant_id=e.tenant_id and source_kind='domain' and source_id=e.id loop
   n:=n+public.notification_delivery_prepare(req);
  end loop;
  update public.outbox_events set status='sent',processed_at=now(),locked_until=null,last_error=null where id=o.id;
 end if;
 return n;
end $$;

-- Preserve all current claim logic, adding the new event only to the set which
-- old workers (include_notifications=false) must leave to the central worker.
do $$declare definition text;begin
 definition:=pg_get_functiondef('public.claim_outbox(integer,integer,boolean,uuid,boolean)'::regprocedure);
 if position('''customer.portal_notification''' in definition)=0 then
  if position('''notification.requested'',''ticket.changed''' in definition)=0 then raise exception 'Outbox claim contract changed';end if;
  definition:=replace(definition,'''notification.requested'',''ticket.changed''','''customer.portal_notification'',''notification.requested'',''ticket.changed''');execute definition;
 end if;
end $$;

alter function private.customer_activity_path(uuid,uuid,uuid) rename to customer_activity_path_before_customer_delivery;
create function private.customer_activity_path(t uuid,a uuid,nid uuid) returns text language plpgsql stable security definer set search_path='' as $$
declare n public.notifications;e private.notification_domain_events;
begin
 select * into n from public.notifications where tenant_id=t and id=nid;
 if n.type_code in('customer.report_available','customer.payment_received') then
  if not private.customer_account_access(t,a) or n.user_id<>auth.uid() or n.context<>'customer' or n.channel<>'in_app'
   or n.archived_at is not null or n.withdrawn_at is not null or n.source_kind<>'domain'
   or not private.notification_source_allowed(t,n.type_code,n.source_kind,n.source_id,n.source_revision,auth.uid(),'customer') then return null;end if;
  select * into e from private.notification_domain_events where tenant_id=t and id=n.source_id;
  if not exists(select 1 from jsonb_array_elements(e.recipients)r where r->>'account_id'=a::text and r->>'user_id'=auth.uid()::text)
   or not private.customer_notification_resource(t,a,e.entity_kind,e.entity_id,auth.uid()) then return null;end if;
  return '/klant?account='||a||case e.entity_kind when 'customer_report' then '&view=reports&report='||e.entity_id else '&view=invoices' end;
 end if;
 return private.customer_activity_path_before_customer_delivery(t,a,nid);
end $$;
revoke all on function private.customer_notification_account(uuid,uuid,uuid),private.customer_notification_resource(uuid,uuid,text,uuid,uuid),
 private.customer_notification_transition(),private.customer_notification_policy_revision(uuid,text,uuid),private.notification_domain_source_allowed(uuid,text,uuid,text,uuid,text),
 private.notification_domain_source_before_customer_delivery(uuid,text,uuid,text,uuid,text),private.notification_capture_outbox(uuid,boolean),
 private.notification_capture_outbox_before_customer_delivery(uuid,boolean),private.customer_activity_path(uuid,uuid,uuid),
 private.customer_activity_path_before_customer_delivery(uuid,uuid,uuid) from public,anon,authenticated,service_role;
