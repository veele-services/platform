SET local check_function_bodies = off;

CREATE OR REPLACE FUNCTION private.management_seed (
  t uuid
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare r record;
begin
 insert into private.management_roles(tenant_id,code,name) values(t,'owner','Eigenaar'),(t,'management','Management'),(t,'planning','Planning'),(t,'administration','Administratie'),(t,'support','Support') on conflict(tenant_id,code) do nothing;
 for r in select * from private.management_roles where tenant_id=t loop
  if not exists(select 1 from private.management_role_permissions where role_id=r.id) then
   insert into private.management_role_permissions(tenant_id,role_id,capability)
   select t,r.id,c.key from public.permission_catalog c where c.domain='tenant' and (
    r.code='owner'
    or r.code='management' and c.key not like 'management.%' and c.key not in ('tickets.internal.hr','tickets.redact','tickets.permissions','notifications.permissions')
    or r.code='planning' and (c.key like 'backoffice.functions.%' and ((c.module in ('overview','planning','work_orders') and c.action in ('read','write')) or c.module in ('customers','objects','tasks','personnel','followup') and c.action='read') or c.key in ('backoffice.functions.cockpit_entity_query','backoffice.access','backoffice.overview.read','backoffice.planning.read','backoffice.planning.write','backoffice.work_orders.read','backoffice.work_orders.write','backoffice.customers.read','backoffice.objects.read','backoffice.tasks.read','backoffice.personnel.read','backoffice.followup.read') or c.key in ('tickets.internal.read','tickets.internal.reply','tickets.internal.note','tickets.support.read','tickets.support.create','tickets.support.reply','notifications.read_own','notifications.preferences'))
    or r.code='administration' and (c.key like 'backoffice.functions.%' and ((c.module in ('finance','customers') and c.action in ('read','write')) or c.module in ('overview','commercial','work_orders','reports','followup') and c.action='read') or c.key in ('backoffice.functions.cockpit_entity_query','backoffice.access','backoffice.overview.read','backoffice.finance.read','backoffice.finance.write','backoffice.customers.read','backoffice.customers.write','backoffice.commercial.read','backoffice.work_orders.read','backoffice.reports.read','backoffice.followup.read') or c.key in ('tickets.support.read','tickets.support.create','tickets.support.reply','notifications.read_own','notifications.preferences'))
    or r.code='support' and (c.key like 'backoffice.functions.%' and c.module in ('overview','followup') and c.action='read' or c.key in ('backoffice.access','backoffice.overview.read','backoffice.followup.read') or c.key in ('tickets.internal.read','tickets.internal.reply','tickets.internal.note','tickets.internal.manage','tickets.internal.assign','tickets.internal.close','tickets.support.read','tickets.support.create','tickets.support.reply','tickets.support.note','tickets.support.manage','tickets.support.assign','tickets.support.close','notifications.read_own','notifications.preferences'))
   ) on conflict do nothing;
  end if;
 end loop;
end$function$;

