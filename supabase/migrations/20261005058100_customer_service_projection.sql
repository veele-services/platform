-- The existing active catalog is authoritative; expose only public discipline
-- names, never task descriptions, revisions, prices or internal planning data.
create function public.customer_portal_services(target_tenant uuid,target_account uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not private.customer_account_access(target_tenant,target_account) then raise exception 'Geen toegang tot diensten' using errcode='42501';end if;
 if not private.service_enabled(target_tenant,'planning') then return '[]';end if;
 return coalesce((select jsonb_agg(jsonb_build_object('name',discipline,'description',case lower(discipline)
   when 'glasbewassing' then 'Schone ramen, binnen en buiten. Vraag een passend voorstel aan.'
   when 'schoonmaak' then 'Een verzorgde werk- of leefomgeving, afgestemd op jouw locatie.'
   when 'vloeronderhoud' then 'Periodiek onderhoud voor een nette en duurzame vloer.'
   when 'gevelreiniging' then 'Aandacht voor de uitstraling en het onderhoud van je gebouw.'
   else 'Bespreek je wensen voor deze dienst met je accountmanager.' end) order by discipline)
  from(select distinct btrim(discipline)discipline from public.task_catalog where tenant_id=target_tenant and active and length(btrim(discipline)) between 2 and 100)catalog),'[]');
end $$;
revoke all on function public.customer_portal_services(uuid,uuid) from public,anon,service_role;
grant execute on function public.customer_portal_services(uuid,uuid) to authenticated;
