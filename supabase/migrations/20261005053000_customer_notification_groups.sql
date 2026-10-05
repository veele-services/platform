-- Central catalog entries reserve the three missing customer subjects. They
-- are explicitly AVAILABLE, not active delivery claims, until their source
-- adapters and templates are implemented and verified in this portal release.
insert into public.notification_catalog(code,name,description,category,module,status,contexts,channels,default_channels,recipient_description)
values
 ('customer.report_available','Klantrapport vrijgegeven','Een goedgekeurde klantkopie is beschikbaar.','Rapporten','rapportage','available',array['customer'],array['in_app','email'],array['in_app','email'],'Expliciet gekoppelde klanten van het object'),
 ('customer.payment_received','Klantbetaling bevestigd','De betaalprovider heeft een betaling geverifieerd.','Finance','finance','available',array['customer'],array['in_app','email'],array['in_app','email'],'De bevoegde klant van de betreffende facturen'),
 ('customer.ticket_changed','Reactie op klantticket','Een openbaar antwoord of toegestane statuswijziging op het eigen ticket.','Tickets','tickets','available',array['customer'],array['in_app','email'],array['in_app','email'],'Uitsluitend de eigen klantmelder');

create function private.customer_notification_group(code text)
returns text language sql immutable set search_path='' as $$
 select case
 when code in('booking.confirmed','work_order.rescheduled','work_order.cancelled','work_order.travelling','work_order.started') then 'appointments'
 when code='customer.report_available' then 'reports'
 when code in('invoice.available','invoice.reminder','customer.payment_received') then 'invoices'
 when code in('customer.ticket_changed','object.request_decided','request.received','request.information_requested','request.rejected',
  'quote.available','quote.reminder','quote.accepted','quote.rejected','quote.change_requested') then 'tickets'
 when code='manual.tenant' then 'news' end;
$$;
revoke all on function private.customer_notification_group(text) from public,anon,authenticated,service_role;

create function public.customer_portal_preferences(target_tenant uuid,target_account uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare source jsonb;groups jsonb;
begin
 if not private.customer_account_access(target_tenant,target_account) then raise exception 'Geen toegang' using errcode='42501';end if;
 source:=public.notification_query(target_tenant,'customer','preferences','{}');
 select jsonb_object_agg(g,coalesce((source->>'email')::boolean,true) and coalesce((select bool_and((entry->>'email')::boolean)
  from jsonb_array_elements(source->'types')entry where private.customer_notification_group(entry->>'code')=g),true))
 into groups from unnest(array['appointments','reports','invoices','tickets','news'])g;
 return jsonb_build_object('version',(source->>'revision')::bigint,'groups',groups);
end $$;
revoke all on function public.customer_portal_preferences(uuid,uuid) from public,anon,service_role;
grant execute on function public.customer_portal_preferences(uuid,uuid) to authenticated;
