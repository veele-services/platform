begin;

select plan(26);

select has_table('public', 'tenant_admin_invitations', 'tenant administrator invitations exist');
select has_table('public', 'tenant_message_templates', 'tenant message templates exist');
select has_table('public', 'tenant_message_template_revisions', 'template history exists');

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000000', '90000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'platform@fieldgrid.test', crypt('Fieldgrid123', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '90000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'beheerder@fieldgrid.test', crypt('Fieldgrid123', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now());

-- Real sessions: authenticated RLS must reject stale or missing sessions.
insert into auth.sessions(id,user_id) select id,id from auth.users where id in ('90000000-0000-4000-8000-000000000001','90000000-0000-4000-8000-000000000002');

insert into public.platform_admins (user_id)
values ('90000000-0000-4000-8000-000000000001');

set local role service_role;
select set_config('request.jwt.claims', '{"sub":"90000000-0000-4000-8000-000000000001","session_id":"90000000-0000-4000-8000-000000000001","role":"service_role"}', true);

select lives_ok(
  $$select public.provision_platform_tenant(
    tenant_name => 'Testorganisatie',
    tenant_slug => 'testorganisatie',
    actor_user_id => '90000000-0000-4000-8000-000000000001',
    request_key => '90000000-0000-4000-8000-000000000010',
    primary_color => '#222C35',
    accent_color => '#41AC42',
    enabled_services => array['planning']::text[],
    admin_name => 'Eerste Beheerder',
    admin_email => 'beheerder@fieldgrid.test',
    tenant_domain => 'testorganisatie.staging.fieldgrid.nl',
    sender_email => 'noreply@fieldgrid.nl'
  )$$,
  'platform provisioning succeeds as service role for a verified platform administrator'
);

select is((select count(*)::integer from public.tenants where slug = 'testorganisatie'), 1, 'one tenant is provisioned');
select is((select enabled_services from public.tenant_settings s join public.tenants t on t.id = s.tenant_id where t.slug = 'testorganisatie'), array['planning']::text[], 'selected module entitlements are stored');
select is((select white_label_enabled from public.tenant_settings s join public.tenants t on t.id = s.tenant_id where t.slug = 'testorganisatie'), false, 'Fieldgrid attribution is enabled by default');
select is((select primary_color || '/' || accent_color from public.tenant_branding b join public.tenants t on t.id = b.tenant_id where t.slug = 'testorganisatie'), '#222C35/#41AC42', 'Fieldgrid default colors are stored');
select is((select count(*)::integer from public.tenant_message_templates mt join public.tenants t on t.id = mt.tenant_id where t.slug = 'testorganisatie'), 4, 'all four templates are initialized');
select is((select count(*)::integer from public.tenant_message_template_revisions mr join public.tenants t on t.id = mr.tenant_id where t.slug = 'testorganisatie'), 4, 'initial template versions are immutable history');
select is((select i.status from public.tenant_admin_invitations i join public.tenants t on t.id = i.tenant_id where t.slug = 'testorganisatie'), 'pending', 'first administrator invitation starts pending');
select is((select count(*)::integer from public.tenant_memberships m join public.tenants t on t.id = m.tenant_id where t.slug = 'testorganisatie'), 0, 'platform administrator is not silently made a tenant member');

update public.tenant_settings set white_label_enabled = true
where tenant_id = (select id from public.tenants where slug = 'testorganisatie');
select is((select white_label_enabled from public.tenant_settings s join public.tenants t on t.id = s.tenant_id where t.slug = 'testorganisatie'), true, 'service role can grant the whitelabel entitlement');

select public.provision_platform_tenant(
  tenant_name => 'Testorganisatie', tenant_slug => 'testorganisatie',
  actor_user_id => '90000000-0000-4000-8000-000000000001',
  request_key => '90000000-0000-4000-8000-000000000010',
  primary_color => '#222C35', accent_color => '#41AC42',
  enabled_services => array['planning']::text[], admin_name => 'Eerste Beheerder',
  admin_email => 'beheerder@fieldgrid.test', tenant_domain => 'testorganisatie.staging.fieldgrid.nl',
  sender_email => 'noreply@fieldgrid.nl'
);
select is((select count(*)::integer from public.tenants where slug = 'testorganisatie'), 1, 'provisioning request key is idempotent');

select lives_ok(
  $$select public.save_tenant_message_template(
    (select id from public.tenants where slug = 'testorganisatie'),
    'quote', 'Aangepaste prijsopgave', 'Beste {klantnaam}', false,
    '90000000-0000-4000-8000-000000000001'
  )$$,
  'platform can version a tenant template'
);
select is((select revision from public.tenant_message_templates mt join public.tenants t on t.id = mt.tenant_id where t.slug = 'testorganisatie' and template_key = 'quote'), 2, 'template revision increments');
select is((select count(*)::integer from public.tenant_message_template_revisions mr join public.tenants t on t.id = mr.tenant_id where t.slug = 'testorganisatie' and template_key = 'quote'), 2, 'template history retains both versions');

select public.save_tenant_message_template(
  (select id from public.tenants where slug = 'testorganisatie'),
  'quote', '', '', true, '90000000-0000-4000-8000-000000000001'
);
select is((select customized from public.tenant_message_templates mt join public.tenants t on t.id = mt.tenant_id where t.slug = 'testorganisatie' and template_key = 'quote'), false, 'reset restores the Fieldgrid default template');

insert into public.tenant_memberships (tenant_id, user_id, roles, status, activated_at)
select id, '90000000-0000-4000-8000-000000000002', array['tenant_admin','management']::public.app_role[], 'active', now()
from public.tenants where slug = 'testorganisatie';

insert into public.customers (tenant_id, customer_number, name)
select id, 'TEST-K001', 'Bestaande testklant' from public.tenants where slug = 'testorganisatie';

insert into public.objects (tenant_id, customer_id, object_number, name, address)
select t.id, c.id, 'TEST-O001', 'Testobject', '{"street":"Teststraat 1"}'::jsonb
from public.tenants t
join public.customers c on c.tenant_id = t.id and c.customer_number = 'TEST-K001'
where t.slug = 'testorganisatie';
insert into public.personnel (id, tenant_id, employee_number, full_name, status)
select '91000000-0000-4000-8000-000000000001', id, 'TEST-P001', 'Testmedewerker', 'active'
from public.tenants where slug = 'testorganisatie';
insert into public.work_orders (
  id, tenant_id, work_order_number, customer_id, object_id, discipline,
  planned_start_at, planned_end_at, projected_start_at, projected_end_at, created_by
)
select '92000000-0000-4000-8000-000000000001', t.id, 'TEST-W001', c.id, o.id, 'Onderhoud',
  '2026-10-15 09:00+02', '2026-10-15 10:00+02', '2026-10-15 09:00+02', '2026-10-15 10:00+02',
  '90000000-0000-4000-8000-000000000002'
from public.tenants t
join public.customers c on c.tenant_id = t.id and c.customer_number = 'TEST-K001'
join public.objects o on o.tenant_id = t.id and o.object_number = 'TEST-O001'
where t.slug = 'testorganisatie';
insert into public.work_order_assignments (
  tenant_id, work_order_id, personnel_id,
  planned_start_at, planned_end_at, projected_start_at, projected_end_at
)
select t.id, w.id, p.id,
  '2026-10-15 09:00+02', '2026-10-15 10:00+02', '2026-10-15 09:00+02', '2026-10-15 10:00+02'
from public.tenants t
join public.work_orders w on w.tenant_id = t.id and w.work_order_number = 'TEST-W001'
join public.personnel p on p.tenant_id = t.id and p.employee_number = 'TEST-P001'
where t.slug = 'testorganisatie';

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"90000000-0000-4000-8000-000000000002","session_id":"90000000-0000-4000-8000-000000000002","role":"authenticated"}', true);

select is((select count(*)::integer from public.tenant_message_templates), 4, 'tenant administrator can read own templates');
select is((select white_label_enabled from public.resolve_tenant_context((select id from public.tenants where slug = 'testorganisatie'), null)), true, 'resolved tenant context contains the whitelabel entitlement');
select lives_ok(
  $$insert into public.customers (tenant_id, customer_number, name)
    select id, 'TEST-K002', 'Nieuwe testklant' from public.tenants where slug = 'testorganisatie'$$,
  'enabled planning module remains usable'
);
select throws_ok(
  $$update public.tenant_settings set enabled_services = array['planning','personeel']::text[]
    where tenant_id = (select id from public.tenants where slug = 'testorganisatie')$$,
  '42501',
  'Tenantkoppeling, modules en whitelabel worden door het platform beheerd',
  'tenant administrator cannot enable a paid module through the Data API'
);
select throws_ok(
  $$update public.tenant_settings set white_label_enabled = false
    where tenant_id = (select id from public.tenants where slug = 'testorganisatie')$$,
  '42501',
  'Tenantkoppeling, modules en whitelabel worden door het platform beheerd',
  'tenant administrator cannot grant or revoke whitelabel through the Data API'
);
select throws_ok(
  $$insert into public.personnel (tenant_id, employee_number, full_name)
    select id, 'TEST-P002', 'Niet toegestaan' from public.tenants where slug = 'testorganisatie'$$,
  '42501',
  null,
  'disabled personnel module is enforced by RLS'
);

select lives_ok(
  $$select public.reschedule_work_order(
    '92000000-0000-4000-8000-000000000001',
    '91000000-0000-4000-8000-000000000001',
    '2026-10-15 09:17+02',
    (select version from public.work_orders where id='92000000-0000-4000-8000-000000000001')
  )$$,
  'security-definer planning RPC works while the module is enabled'
);

set local role service_role;
select set_config('request.jwt.claims', '{"sub":"90000000-0000-4000-8000-000000000001","session_id":"90000000-0000-4000-8000-000000000001","role":"service_role"}', true);
update public.tenant_settings set enabled_services = '{}'::text[]
where tenant_id = (select id from public.tenants where slug = 'testorganisatie');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"90000000-0000-4000-8000-000000000002","session_id":"90000000-0000-4000-8000-000000000002","role":"authenticated"}', true);

select throws_ok(
  $$select public.reschedule_work_order(
    '92000000-0000-4000-8000-000000000001',
    '91000000-0000-4000-8000-000000000001',
    '2026-10-15 09:29+02',
    2
  )$$,
  '42501',
  'Geen toegang tot planning',
  'security-definer RPC cannot bypass a disabled module entitlement'
);

select * from finish();
rollback;
