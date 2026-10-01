begin;

select plan(10);

insert into public.tenants (id, slug, name) values ('d0000000-0000-4000-8000-000000000001', 'booking-test', 'Booking Test');
insert into public.tenant_settings (tenant_id, enabled_services) values ('d0000000-0000-4000-8000-000000000001', array['planning']::text[]);
insert into public.customers (id, tenant_id, customer_number, name) values ('d1000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001', 'KL-B01', 'Boekingsklant');
insert into public.objects (id, tenant_id, customer_id, object_number, name, address) values ('d2000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000001', 'OB-B01', 'Boekingsobject', '{}');
insert into public.requests (id, tenant_id, request_number, customer_id, object_id, discipline, description) values ('d3000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001', 'AAN-B01', 'd1000000-0000-4000-8000-000000000001', 'd2000000-0000-4000-8000-000000000001', 'Service', 'Veilige boeking');
insert into public.appointment_slots (id, tenant_id, starts_at, ends_at) values
  ('d4000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001', now() + interval '1 day', now() + interval '1 day 2 hours'),
  ('d4000000-0000-4000-8000-000000000002', 'd0000000-0000-4000-8000-000000000001', now() + interval '2 days', now() + interval '2 days 2 hours');
insert into public.external_action_tokens (id, tenant_id, purpose, subject_id, token_hash, expires_at) values ('d5000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001', 'booking', 'd3000000-0000-4000-8000-000000000001', repeat('a', 64), now() + interval '1 day');
insert into public.booking_options (tenant_id, token_id, slot_id) values ('d0000000-0000-4000-8000-000000000001', 'd5000000-0000-4000-8000-000000000001', 'd4000000-0000-4000-8000-000000000001');

set local role authenticated;
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"00000000-0000-4000-8000-000000000099"}', true);
select throws_ok(
  $$select public.book_appointment_slot('d0000000-0000-4000-8000-000000000001','d3000000-0000-4000-8000-000000000001','d4000000-0000-4000-8000-000000000001','d5000000-0000-4000-8000-000000000001')$$,
  '42501', null, 'browser roles cannot invoke the service booking command'
);

set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select throws_ok(
  $$select public.book_appointment_slot('d0000000-0000-4000-8000-000000000001','d3000000-0000-4000-8000-000000000001','d4000000-0000-4000-8000-000000000002','d5000000-0000-4000-8000-000000000001')$$,
  '42501', null, 'a slot outside the offered link cannot be booked'
);
select lives_ok(
  $$select public.book_appointment_slot('d0000000-0000-4000-8000-000000000001','d3000000-0000-4000-8000-000000000001','d4000000-0000-4000-8000-000000000001','d5000000-0000-4000-8000-000000000001')$$,
  'an offered slot is booked atomically'
);
select is((select booked_count from public.appointment_slots where id = 'd4000000-0000-4000-8000-000000000001'), 1, 'capacity is consumed once');
select is((select status from public.appointment_slots where id = 'd4000000-0000-4000-8000-000000000001'), 'full', 'full capacity closes the slot');
select is((select preferred_slot_id from public.requests where id = 'd3000000-0000-4000-8000-000000000001'), 'd4000000-0000-4000-8000-000000000001'::uuid, 'request points to the immutable appointment block');
select ok((select consumed_at is not null from public.external_action_tokens where id = 'd5000000-0000-4000-8000-000000000001'), 'one-time token is consumed');
select lives_ok(
  $$select public.book_appointment_slot('d0000000-0000-4000-8000-000000000001','d3000000-0000-4000-8000-000000000001','d4000000-0000-4000-8000-000000000001','d5000000-0000-4000-8000-000000000001')$$,
  'same booking replay returns the existing reservation'
);
select is((select booked_count from public.appointment_slots where id='d4000000-0000-4000-8000-000000000001'),1,'replay never consumes a second place');
select is((select status from public.requests where id='d3000000-0000-4000-8000-000000000001'),'new','booking is not commercial acceptance');

select * from finish();
rollback;
