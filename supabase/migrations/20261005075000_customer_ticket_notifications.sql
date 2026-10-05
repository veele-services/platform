-- Own-reporter ticket events enter the existing central notification engine.
-- No message body, internal note, assignment or employee identity is copied.
update public.notification_catalog set status='active' where code='customer.ticket_changed';
insert into private.notification_templates(type_code,context,channel,draft)
select 'customer.ticket_changed','customer',ch,jsonb_build_object('title','Update over je klantticket','body','Er staat een reactie of statuswijziging klaar bij je eigen ticket.','cta_label','Ticket bekijken')
from unnest(array['in_app','email'])ch on conflict do nothing;
insert into private.notification_template_versions(template_id,revision,definition)
select id,revision,draft from private.notification_templates where type_code='customer.ticket_changed' and active_version_id is null on conflict do nothing;
update private.notification_templates t set active_version_id=v.id from private.notification_template_versions v
where v.template_id=t.id and v.revision=t.revision and t.type_code='customer.ticket_changed' and t.active_version_id is null;

alter function private.notification_operational_source_allowed(uuid,text,text,uuid,text,uuid,text) rename to notification_operational_source_allowed_before_customer_tickets;
create function private.notification_operational_source_allowed(t uuid,code text,kind text,source uuid,revision text,recipient uuid,ctx text)
returns boolean language plpgsql stable security definer set search_path='' as $$
begin
 if kind='customer_ticket' then
  return code='customer.ticket_changed' and ctx='customer' and revision=source::text and exists(
   select 1 from public.ticket_events e join public.tickets tk on tk.tenant_id=e.tenant_id and tk.id=e.ticket_id
   where e.tenant_id=t and e.id=source and e.audience='reporter' and tk.reporter_user_id=recipient
    and e.actor_user_id is distinct from recipient and private.customer_ticket_access(tk.id,recipient)
    and private.ticket_event_allowed(e.id,'customer',recipient));
 end if;
 return private.notification_operational_source_allowed_before_customer_tickets(t,code,kind,source,revision,recipient,ctx);
end $$;

create function private.customer_ticket_notification() returns trigger language plpgsql security definer set search_path='' as $$
declare tk public.tickets;a uuid;
begin
 if new.audience<>'reporter' then return new;end if;
 select t.* into tk from public.tickets t join private.customer_ticket_bindings b on b.tenant_id=t.tenant_id and b.ticket_id=t.id
 where t.tenant_id=new.tenant_id and t.id=new.ticket_id;
 if tk.id is null or tk.reporter_user_id is null or new.actor_user_id is not distinct from tk.reporter_user_id
  or not private.customer_ticket_access(tk.id,tk.reporter_user_id) then return new;end if;
 select account_id into a from private.customer_ticket_bindings where ticket_id=tk.id;
 perform private.notification_enqueue(new.tenant_id,'customer.ticket_changed','customer_ticket',new.id,new.id::text,
  'customer-ticket:'||new.id||':'||tk.reporter_user_id,
  jsonb_build_object('recipient_user_id',tk.reporter_user_id,'context','customer','channels',array['in_app','email'],
   'path','/klant?account='||a||'&view=tickets&ticket='||tk.id,'platform_brand',tk.route='platform_support'));
 return new;
end $$;
create trigger customer_ticket_notification after insert on public.ticket_events for each row execute function private.customer_ticket_notification();
revoke all on function private.notification_operational_source_allowed(uuid,text,text,uuid,text,uuid,text),
 private.notification_operational_source_allowed_before_customer_tickets(uuid,text,text,uuid,text,uuid,text),
 private.customer_ticket_notification() from public,anon,authenticated,service_role;
