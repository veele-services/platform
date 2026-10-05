-- The finance module alone never means that this tenant has a payment
-- recipient. Expose only readiness, not the private profile or key reference.
do $$
declare definition text; marker text;
begin
 select pg_get_functiondef('public.customer_portal_workspace(uuid,uuid)'::regprocedure) into definition;
 marker := '''finance'',private.service_enabled(target_tenant,''finance''),';
 if strpos(definition, marker)=0 then raise exception 'Customer workspace payment marker missing';end if;
 definition := replace(definition, marker, marker || $body$
   'paymentConfigured',exists(select 1 from public.tenant_provider_connections pc
    where pc.tenant_id=target_tenant and pc.provider='mollie' and pc.active
     and pc.verified_at is not null and pc.mode in('test','live')
     and pc.secret_reference='MOLLIE_API_KEY'
     and pc.public_config->>'profile_id' ~ '^pfl_[A-Za-z0-9]+$'),$body$);
 execute definition;
end $$;
