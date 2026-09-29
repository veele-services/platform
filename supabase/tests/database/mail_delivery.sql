begin;

select plan(4);
insert into public.tenants (id, slug, name) values ('f0000000-0000-4000-8000-000000000001', 'mail-test', 'Mail Test');

set local role authenticated;
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"00000000-0000-4000-8000-000000000099"}', true);
select throws_ok(
  $$select public.claim_mail_delivery('f0000000-0000-4000-8000-000000000001','customer@example.test','invoice','invoice-1')$$,
  '42501', null, 'browser roles cannot claim provider mail'
);

set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select ok((select should_send from public.claim_mail_delivery('f0000000-0000-4000-8000-000000000001','customer@example.test','invoice','invoice-1')), 'first worker atomically claims the mail');
select is((select should_send from public.claim_mail_delivery('f0000000-0000-4000-8000-000000000001','customer@example.test','invoice','invoice-1')), false, 'concurrent retry cannot send a duplicate');
update public.mail_deliveries set status = 'sent', sent_at = clock_timestamp(), locked_until = null where idempotency_key = 'invoice-1';
select is((select current_status::text from public.claim_mail_delivery('f0000000-0000-4000-8000-000000000001','customer@example.test','invoice','invoice-1')), 'sent', 'completed delivery remains idempotent');

select * from finish();
rollback;
