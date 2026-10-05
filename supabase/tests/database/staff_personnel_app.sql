begin;

select plan(138);

insert into auth.users (id, email, email_confirmed_at) values
  ('aa100000-0000-4000-8000-000000000001', 'staff-personnel-test@fieldgrid.invalid', now()),
  ('aa100000-0000-4000-8000-000000000002', 'manager-personnel-test@fieldgrid.invalid', now()),
  ('aa100000-0000-4000-8000-000000000003', 'other-staff-personnel-test@fieldgrid.invalid', now());
insert into auth.sessions (id, user_id, created_at, updated_at) values
  ('aa100000-0000-4000-8000-000000000011', 'aa100000-0000-4000-8000-000000000001', now(), now()),
  ('aa100000-0000-4000-8000-000000000012', 'aa100000-0000-4000-8000-000000000002', now(), now()),
  ('aa100000-0000-4000-8000-000000000013', 'aa100000-0000-4000-8000-000000000003', now(), now());
insert into public.tenants (id, slug, name, timezone) values
  ('aa100000-0000-4000-8000-000000000021', 'staff-personnel-test', 'FICTITIOUS personnel test', 'Europe/Amsterdam'),
  ('aa100000-0000-4000-8000-000000000022', 'staff-personnel-other', 'FICTITIOUS other tenant', 'Europe/Amsterdam');
insert into public.tenant_settings (tenant_id, enabled_services) values
  ('aa100000-0000-4000-8000-000000000021', array['personeel','planning','rapportage']),
  ('aa100000-0000-4000-8000-000000000022', array['personeel','planning','rapportage']);
insert into public.staff_workspace_revisions (tenant_id) values
  ('aa100000-0000-4000-8000-000000000021'),
  ('aa100000-0000-4000-8000-000000000022')
on conflict (tenant_id) do nothing;
insert into public.tenant_memberships (tenant_id, user_id, roles, status, activated_at) values
  ('aa100000-0000-4000-8000-000000000021', 'aa100000-0000-4000-8000-000000000001', array['staff']::public.app_role[], 'active', now()),
  ('aa100000-0000-4000-8000-000000000021', 'aa100000-0000-4000-8000-000000000002', array['management']::public.app_role[], 'active', now()),
  ('aa100000-0000-4000-8000-000000000021', 'aa100000-0000-4000-8000-000000000003', array['staff']::public.app_role[], 'active', now());
insert into public.personnel (
  id, tenant_id, user_id, employee_number, full_name, status
) values (
  'aa100000-0000-4000-8000-000000000031',
  'aa100000-0000-4000-8000-000000000021',
  'aa100000-0000-4000-8000-000000000001',
  'FG-STAFF-TEST-001',
  'FICTITIOUS Staff Member',
  'active'
), (
  'aa100000-0000-4000-8000-000000000032',
  'aa100000-0000-4000-8000-000000000021',
  'aa100000-0000-4000-8000-000000000003',
  'FG-STAFF-TEST-002',
  'FICTITIOUS Other Staff Member',
  'active'
);

insert into public.personnel_contracts (
  tenant_id, personnel_id, starts_on, employment_type, hours_per_week, active
) values (
  'aa100000-0000-4000-8000-000000000021',
  'aa100000-0000-4000-8000-000000000031',
  '2030-01-01', 'permanent', 40, true
);

select ok(
  (select onboarding_step = 0 and onboarding_completed_at is null
   from public.personnel where id = 'aa100000-0000-4000-8000-000000000031'),
  'new personnel starts at onboarding step zero while existing linked rows are backfilled by migration'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"aa100000-0000-4000-8000-000000000001","session_id":"aa100000-0000-4000-8000-000000000011"}',
  true
);
select lives_ok(
  $$select public.staff_leave_command(
    'aa100000-0000-4000-8000-000000000021',
    'create',
    '{"leaveType":"vacation","startsOn":"2031-03-29","endsOn":"2031-03-31","note":"FICTITIOUS spring leave"}'::jsonb,
    'aa100000-0000-4000-8000-000000000041'
  )$$,
  'staff creates an idempotent leave request through the guarded RPC'
);
select is(
  (select count(*)::integer from public.staff_leave_requests
   where personnel_id = 'aa100000-0000-4000-8000-000000000031'
     and status = 'pending' and availability_id is null),
  1,
  'a new leave request is pending and does not block planning before approval'
);
select is(
  (select requested_minutes from public.staff_leave_requests
   where note = 'FICTITIOUS spring leave'),
  480,
  'leave creation snapshots one contract-derived business day in minutes'
);
select is(
  (select requested_minutes_by_year from public.staff_leave_requests
   where note = 'FICTITIOUS spring leave'),
  '{"2031":480}'::jsonb,
  'leave creation snapshots the contract-derived minutes by calendar year'
);
select is(
  (public.staff_leave_command(
    'aa100000-0000-4000-8000-000000000021',
    'create',
    '{"leaveType":"vacation","startsOn":"2031-03-29","endsOn":"2031-03-31","note":"FICTITIOUS spring leave"}'::jsonb,
    'aa100000-0000-4000-8000-000000000041'
  ) ->> 'id')::uuid,
  (select id from public.staff_leave_requests where note = 'FICTITIOUS spring leave'),
  'an exact retry returns the original leave request'
);
select throws_ok(
  $$insert into public.availability (
      tenant_id, personnel_id, starts_at, ends_at, kind
    ) values (
      'aa100000-0000-4000-8000-000000000021',
      'aa100000-0000-4000-8000-000000000031',
      '2031-05-01T08:00:00Z',
      '2031-05-01T09:00:00Z',
      'available'
    )$$,
  '42501',
  null,
  'staff cannot bypass managed availability through a direct table mutation'
);
select throws_ok(
  $$select public.review_staff_leave_request(
    'aa100000-0000-4000-8000-000000000021',
    (select id from public.staff_leave_requests where note = 'FICTITIOUS spring leave'),
    'approve',
    (select version from public.staff_leave_requests where note = 'FICTITIOUS spring leave'),
    null
  )$$,
  '42501',
  null,
  'staff cannot review its own leave request'
);
select ok(
  public.staff_workspace('aa100000-0000-4000-8000-000000000021')
    ?& array[
      'availability','staffLeaveRequests','staffDayReviews','staffStatusEvents',
      'staffLeaveEntitlements','staffMaterials','staffExpenses','staffContacts','staffDepots'
    ],
  'staff workspace exposes the bounded personnel-app root contract'
);
select throws_ok(
  $$select public.set_staff_leave_entitlement(
    'aa100000-0000-4000-8000-000000000021',
    'aa100000-0000-4000-8000-000000000031',
    2031, 9600, 480, 0
  )$$,
  '42501', null,
  'staff cannot manage its own annual leave entitlement'
);
select throws_ok(
  $$insert into public.staff_leave_entitlements (
      tenant_id, personnel_id, calendar_year, allowance_minutes,
      carryover_minutes, updated_by
    ) values (
      'aa100000-0000-4000-8000-000000000021',
      'aa100000-0000-4000-8000-000000000031',
      2031, 9600, 480, 'aa100000-0000-4000-8000-000000000001'
    )$$,
  '42501', null,
  'staff cannot bypass annual leave management through direct table writes'
);
reset role;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"aa100000-0000-4000-8000-000000000002","session_id":"aa100000-0000-4000-8000-000000000012"}',
  true
);
select lives_ok(
  $$select public.set_staff_leave_entitlement(
    'aa100000-0000-4000-8000-000000000021',
    'aa100000-0000-4000-8000-000000000031',
    2031, 9600, 480, 0
  )$$,
  'management creates a versioned annual leave entitlement'
);
select ok(
  (select allowance_minutes = 9600 and carryover_minutes = 480 and version = 1
   from public.staff_leave_entitlements
   where personnel_id = 'aa100000-0000-4000-8000-000000000031'
     and calendar_year = 2031),
  'annual leave entitlement stores allowance, carryover and initial version'
);
select throws_ok(
  $$select public.set_staff_leave_entitlement(
    'aa100000-0000-4000-8000-000000000021',
    'aa100000-0000-4000-8000-000000000031',
    2031, 10200, 480, 0
  )$$,
  '40001', null,
  'annual leave entitlement rejects a stale management version'
);
select lives_ok(
  $$select public.set_staff_leave_entitlement(
    'aa100000-0000-4000-8000-000000000021',
    'aa100000-0000-4000-8000-000000000031',
    2031, 10200, 480, 1
  )$$,
  'management updates the current annual leave entitlement version'
);
select ok(
  (select allowance_minutes = 10200 and carryover_minutes = 480 and version = 2
   from public.staff_leave_entitlements
   where personnel_id = 'aa100000-0000-4000-8000-000000000031'
     and calendar_year = 2031),
  'annual leave entitlement update advances the optimistic version exactly once'
);
select lives_ok(
  $$select public.review_staff_leave_request(
    'aa100000-0000-4000-8000-000000000021',
    (select id from public.staff_leave_requests where note = 'FICTITIOUS spring leave'),
    'approve',
    (select version from public.staff_leave_requests where note = 'FICTITIOUS spring leave'),
    null
  )$$,
  'management approves a version-matched pending request'
);
select is(
  (select approved_minutes from public.staff_leave_requests
   where note = 'FICTITIOUS spring leave'),
  480,
  'the compatibility review call persists the contract-derived approved minutes'
);
select is(
  (select approved_minutes_by_year from public.staff_leave_requests
   where note = 'FICTITIOUS spring leave'),
  '{"2031":480}'::jsonb,
  'leave approval persists the approved balance allocation by calendar year'
);
select ok(
  exists (
    select 1
    from public.staff_leave_requests request
    join public.availability slot on slot.id = request.availability_id
    where request.note = 'FICTITIOUS spring leave'
      and request.status = 'approved'
      and request.reviewed_by = 'aa100000-0000-4000-8000-000000000002'
      and slot.kind = 'leave'
      and slot.approved_at is not null
  ),
  'approval atomically links a leave availability block and reviewer metadata'
);
select is(
  (select slot.starts_at
   from public.staff_leave_requests request
   join public.availability slot on slot.id = request.availability_id
   where request.note = 'FICTITIOUS spring leave'),
  date '2031-03-29'::timestamp at time zone 'Europe/Amsterdam',
  'approved leave starts at tenant-local midnight'
);
select is(
  (select slot.ends_at
   from public.staff_leave_requests request
   join public.availability slot on slot.id = request.availability_id
   where request.note = 'FICTITIOUS spring leave'),
  date '2031-04-01'::timestamp at time zone 'Europe/Amsterdam',
  'approved leave uses an exclusive tenant-local midnight end across DST'
);
reset role;

create temporary table staff_test_approved_slot on commit drop as
select availability_id
from public.staff_leave_requests
where note = 'FICTITIOUS spring leave';

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"aa100000-0000-4000-8000-000000000001","session_id":"aa100000-0000-4000-8000-000000000011"}',
  true
);
select lives_ok(
  $$select public.staff_leave_command(
    'aa100000-0000-4000-8000-000000000021',
    'withdraw',
    jsonb_build_object(
      'leaveRequestId', request.id,
      'version', request.version,
      'reason', 'FICTITIOUS plans changed'
    ),
    'aa100000-0000-4000-8000-000000000042'
  )
  from public.staff_leave_requests request
  where request.note = 'FICTITIOUS spring leave'$$,
  'staff withdraws an approved future request with optimistic concurrency'
);
reset role;

select ok(
  (select status = 'withdrawn' and availability_id is null
   from public.staff_leave_requests where note = 'FICTITIOUS spring leave'),
  'withdrawal clears the leave link and records withdrawn state'
);
select is(
  (select count(*)::integer from public.availability
   where id = (select availability_id from staff_test_approved_slot)),
  0,
  'withdrawal deletes the linked planning block'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"aa100000-0000-4000-8000-000000000001","session_id":"aa100000-0000-4000-8000-000000000011"}',
  true
);
select lives_ok(
  $$select public.staff_leave_command(
    'aa100000-0000-4000-8000-000000000021',
    'create',
    '{"leaveType":"other","startsOn":"2031-06-01","endsOn":"2031-06-01","note":"FICTITIOUS rejected leave"}'::jsonb,
    'aa100000-0000-4000-8000-000000000043'
  )$$,
  'staff creates a second request for rejection coverage'
);
reset role;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"aa100000-0000-4000-8000-000000000002","session_id":"aa100000-0000-4000-8000-000000000012"}',
  true
);
select throws_ok(
  $$select public.review_staff_leave_request(
    'aa100000-0000-4000-8000-000000000021',
    (select id from public.staff_leave_requests where note = 'FICTITIOUS rejected leave'),
    'reject',
    (select version from public.staff_leave_requests where note = 'FICTITIOUS rejected leave'),
    '   '
  )$$,
  '23514',
  null,
  'rejection fails closed without a nonblank management reason'
);
select lives_ok(
  $$select public.review_staff_leave_request(
    'aa100000-0000-4000-8000-000000000021',
    (select id from public.staff_leave_requests where note = 'FICTITIOUS rejected leave'),
    'reject',
    (select version from public.staff_leave_requests where note = 'FICTITIOUS rejected leave'),
    'FICTITIOUS capacity conflict'
  )$$,
  'management rejects with an explicit reason'
);
reset role;

select ok(
  (select status = 'rejected'
      and availability_id is null
      and review_note = 'FICTITIOUS capacity conflict'
   from public.staff_leave_requests where note = 'FICTITIOUS rejected leave'),
  'rejection persists review metadata without creating availability'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"aa100000-0000-4000-8000-000000000001","session_id":"aa100000-0000-4000-8000-000000000011"}',
  true
);
select lives_ok(
  $$select public.staff_leave_command(
    'aa100000-0000-4000-8000-000000000021',
    'create',
    '{"leaveType":"vacation","startsOn":"2031-12-31","endsOn":"2032-01-02","note":"FICTITIOUS year boundary leave"}'::jsonb,
    'aa100000-0000-4000-8000-000000000044'
  )$$,
  'staff can request leave across a calendar-year boundary'
);
reset role;
select is(
  (select requested_minutes_by_year from public.staff_leave_requests
   where note = 'FICTITIOUS year boundary leave'),
  '{"2031":480,"2032":960}'::jsonb,
  'cross-year requested minutes retain their exact contract-derived year allocation'
);
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"aa100000-0000-4000-8000-000000000002","session_id":"aa100000-0000-4000-8000-000000000012"}',
  true
);
select lives_ok(
  $$select public.review_staff_leave_request(
    'aa100000-0000-4000-8000-000000000021',
    (select id from public.staff_leave_requests where note = 'FICTITIOUS year boundary leave'),
    'approve',
    (select version from public.staff_leave_requests where note = 'FICTITIOUS year boundary leave'),
    1200,
    'FICTITIOUS approved across years'
  )$$,
  'management can approve a different total across the year boundary'
);
reset role;
select is(
  (select approved_minutes_by_year from public.staff_leave_requests
   where note = 'FICTITIOUS year boundary leave'),
  '{"2031":400,"2032":800}'::jsonb,
  'approved cross-year minutes are allocated pro rata and sum to the exact approved total'
);

create temporary table staff_test_onboarding_payload(payload jsonb) on commit drop;
insert into staff_test_onboarding_payload values (
  '{
    "onboardingVersion": 1,
    "personnelVersion": 1,
    "step": 4,
    "draft": {
      "profile": {
        "fullName": "FICTITIOUS Staff Member",
        "preferredName": "FICTITIOUS Staff",
        "phone": "+31 70 1234567",
        "mobilePhone": "+31 6 12345678",
        "birthDate": "1990-01-02",
        "homeAddress": {"street":" Teststraat 10 ","postalCode":"1234ab","city":" Den Haag ","country":"Netherlands"},
        "emergencyContact": {"name":"FICTITIOUS Contact","phone":"+31 6 87654321","relation":"partner"}
      },
      "transport": {
        "vehicle":"electric_bicycle",
        "departureKind":"home",
        "departureDepotId":null,
        "alternateDepartureAddress":null,
        "returnToDeparture":true,
        "ownTransport":true,
        "drivingLicense":false,
        "drivingLicenseCategories":[],
        "carpoolAllowed":true,
        "limitations":"FICTITIOUS rustig reizen"
      },
      "notifications": {
        "version":0,
        "email":true,
        "push":true,
        "quietEnabled":false,
        "quietStart":"22:00",
        "quietEnd":"07:00",
        "timezone":"Europe/Amsterdam",
        "types":[]
      },
      "availability": {
        "week": {
          "monday":{"enabled":true,"start":"08:00","end":"17:00"},
          "tuesday":{"enabled":true,"start":"08:00","end":"17:00"},
          "wednesday":{"enabled":true,"start":"08:00","end":"17:00"},
          "thursday":{"enabled":true,"start":"08:00","end":"17:00"},
          "friday":{"enabled":true,"start":"08:00","end":"17:00"},
          "saturday":{"enabled":false,"start":"08:00","end":"17:00"},
          "sunday":{"enabled":false,"start":"08:00","end":"17:00"}
        },
        "shifts":["day"],"planningNote":"","weekends":false,"holidays":false
      },
      "confirmations":{"details":true,"availability":false,"notifications":true,"privacy":true,"terms":true}
    }
  }'::jsonb
);
grant select on staff_test_onboarding_payload to authenticated;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"aa100000-0000-4000-8000-000000000001","session_id":"aa100000-0000-4000-8000-000000000011"}',
  true
);
select throws_ok(
  $$select public.staff_save_onboarding(
    'aa100000-0000-4000-8000-000000000021',
    jsonb_set((select payload from staff_test_onboarding_payload), '{onboardingVersion}', '99'::jsonb),
    true
  )$$,
  '40001', null,
  'onboarding rejects a stale onboarding version'
);
select throws_ok(
  $$select public.staff_save_onboarding(
    'aa100000-0000-4000-8000-000000000021',
    jsonb_set((select payload from staff_test_onboarding_payload), '{personnelVersion}', '99'::jsonb),
    true
  )$$,
  '40001', null,
  'onboarding also rejects a stale canonical personnel version'
);
select throws_ok(
  $$select public.staff_save_onboarding(
    'aa100000-0000-4000-8000-000000000021',
    jsonb_set((select payload from staff_test_onboarding_payload), '{draft,notifications,version}', '99'::jsonb),
    true
  )$$,
  '40001', null,
  'stale central notification preferences abort onboarding completion'
);
reset role;

select ok(
  (select onboarding_completed_at is null from public.personnel where id = 'aa100000-0000-4000-8000-000000000031')
  and not exists (
    select 1 from private.notification_preferences
    where tenant_id = 'aa100000-0000-4000-8000-000000000021'
      and user_id = 'aa100000-0000-4000-8000-000000000001'
      and context = 'staff'
  ),
  'failed notification persistence rolls back onboarding and notification state together'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"aa100000-0000-4000-8000-000000000001","session_id":"aa100000-0000-4000-8000-000000000011"}',
  true
);
select lives_ok(
  $$select public.staff_save_onboarding(
    'aa100000-0000-4000-8000-000000000021',
    jsonb_set(
      jsonb_set(
        (select payload from staff_test_onboarding_payload),
        '{draft,profile,homeAddress}',
        '{"street":"","postalCode":"","city":"","country":"NL"}'::jsonb
      ),
      '{draft,profile,mobilePhone}',
      '""'::jsonb
    ) || jsonb_build_object('step', 0),
    false
  )$$,
  'an incomplete first onboarding step is saved as a resumable draft'
);
reset role;

select ok(
  (select onboarding_step = 1
      and onboarding_completed_at is null
      and onboarding_draft #>> '{profile,homeAddress,street}' = ''
      and home_address = '{}'::jsonb
   from public.personnel
   where id = 'aa100000-0000-4000-8000-000000000031'),
  'partial onboarding advances without promoting incomplete canonical profile data'
);

create temporary table staff_test_onboarding_versions on commit drop as
select onboarding_version, version as personnel_version
from public.personnel
where id = 'aa100000-0000-4000-8000-000000000031';
grant select on staff_test_onboarding_versions to authenticated;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"aa100000-0000-4000-8000-000000000003","session_id":"aa100000-0000-4000-8000-000000000013"}',
  true
);
select throws_ok(
  $$select public.staff_save_onboarding(
    'aa100000-0000-4000-8000-000000000021',
    (select payload #- '{draft,profile,mobilePhone}' from staff_test_onboarding_payload),
    true
  )$$,
  '23514', null,
  'onboarding completion requires a dedicated mobile number and never falls back to phone'
);
reset role;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"aa100000-0000-4000-8000-000000000001","session_id":"aa100000-0000-4000-8000-000000000011"}',
  true
);
select lives_ok(
  $$select public.staff_save_onboarding(
    'aa100000-0000-4000-8000-000000000021',
    jsonb_set(
      jsonb_set(
        (select payload from staff_test_onboarding_payload),
        '{onboardingVersion}',
        to_jsonb((select onboarding_version from staff_test_onboarding_versions))
      ),
      '{personnelVersion}',
      to_jsonb((select personnel_version from staff_test_onboarding_versions))
    ),
    true
  )$$,
  'complete onboarding atomically persists profile and notification preferences'
);
reset role;

select ok(
  (select onboarding_completed_at is not null
      and standard_vehicle = 'electric_bicycle'
      and own_transport
      and travel_limitations = 'FICTITIOUS rustig reizen'
      and mobile_phone = '+31 6 12345678'
      and home_address ->> 'postal_code' = '1234 AB'
      and home_address ->> 'country' = 'NL'
   from public.personnel where id = 'aa100000-0000-4000-8000-000000000031')
  and (select revision = 1 from private.notification_preferences
       where tenant_id = 'aa100000-0000-4000-8000-000000000021'
         and user_id = 'aa100000-0000-4000-8000-000000000001'
         and context = 'staff' and type_code is null),
  'completion stores normalized profile fields and increments central notification revision once'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"aa100000-0000-4000-8000-000000000001","session_id":"aa100000-0000-4000-8000-000000000011"}',
  true
);
select throws_ok(
  $$select public.staff_update_profile(
    'aa100000-0000-4000-8000-000000000021',
    jsonb_build_object(
      'version', (select version from public.personnel where id = 'aa100000-0000-4000-8000-000000000031'),
      'profile', jsonb_build_object(
        'homeAddress', jsonb_build_object('street','Teststraat 10','postalCode','INVALID','city','Den Haag','country','Netherlands')
      )
    )
  )$$,
  '23514', null,
  'English Netherlands input cannot bypass Dutch postcode validation'
);
select lives_ok(
  $sql$do $body$
  declare
    vehicle text;
    updated jsonb;
  begin
    foreach vehicle in array array[
      'car','van','motorcycle','scooter','electric_bicycle','bicycle',
      'public_transport','walking','other'
    ]
    loop
      updated := public.staff_update_profile(
        'aa100000-0000-4000-8000-000000000021',
        jsonb_build_object(
          'version', (select version from public.personnel where id = 'aa100000-0000-4000-8000-000000000031'),
          'transport', jsonb_build_object(
            'vehicle', vehicle,
            'ownTransport', true,
            'limitations', 'FICTITIOUS onderweg'
          )
        )
      );
      if updated ->> 'standard_vehicle' is distinct from vehicle then
        raise exception 'Vervoersoptie % is niet verliesloos opgeslagen', vehicle;
      end if;
    end loop;
  end
  $body$$sql$,
  'profile RPC accepts and losslessly persists all nine transport modes'
);
reset role;
select ok(
  (select standard_vehicle = 'other'
      and own_transport
      and travel_limitations = 'FICTITIOUS onderweg'
   from public.personnel where id = 'aa100000-0000-4000-8000-000000000031'),
  'own transport and travel limitations persist through the guarded profile RPC'
);

insert into public.time_entries (
  id, tenant_id, personnel_id, kind, starts_at, ends_at, status
) values (
  'aa100000-0000-4000-8000-000000000051',
  'aa100000-0000-4000-8000-000000000021',
  'aa100000-0000-4000-8000-000000000031',
  'work', date_trunc('day', clock_timestamp()) + interval '8 hours', null, 'draft'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"aa100000-0000-4000-8000-000000000001","session_id":"aa100000-0000-4000-8000-000000000011"}',
  true
);
select throws_ok(
  $$select public.staff_day_command(
    'aa100000-0000-4000-8000-000000000021','close',
    jsonb_build_object('workDay', current_date, 'note', 'FICTITIOUS open entry'),
    'aa100000-0000-4000-8000-000000000052'
  )$$,
  '23514', null,
  'day close rejects an open time entry'
);
select throws_ok(
  $$select public.staff_request_time_correction(
    'aa100000-0000-4000-8000-000000000021',
    'aa100000-0000-4000-8000-000000000051',
    (select version from public.time_entries where id = 'aa100000-0000-4000-8000-000000000051'),
    'duration', null, null, 450,
    'FICTITIOUS timer was stopped too late',
    'aa100000-0000-4000-8000-000000000056'
  )$$,
  '23514', null,
  'a correction request rejects an open time registration'
);
reset role;
update public.time_entries
set ends_at = starts_at + interval '8 hours'
where id = 'aa100000-0000-4000-8000-000000000051';

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"aa100000-0000-4000-8000-000000000001","session_id":"aa100000-0000-4000-8000-000000000011"}',
  true
);
select lives_ok(
  $$select public.staff_day_command(
    'aa100000-0000-4000-8000-000000000021','close',
    jsonb_build_object('workDay', current_date, 'note', 'FICTITIOUS closed day'),
    'aa100000-0000-4000-8000-000000000053'
  )$$,
  'day closes after every time entry has ended'
);
select is(
  (public.staff_day_command(
    'aa100000-0000-4000-8000-000000000021','close',
    jsonb_build_object('workDay', current_date, 'note', 'FICTITIOUS closed day'),
    'aa100000-0000-4000-8000-000000000053'
  ) ->> 'id')::uuid,
  (select id from public.staff_day_reviews
   where personnel_id = 'aa100000-0000-4000-8000-000000000031' and day = current_date),
  'exact day-command retry returns the original review result'
);
reset role;
select is(
  (select count(*)::integer
   from private.staff_app_command_receipts
   where tenant_id = 'aa100000-0000-4000-8000-000000000021'
     and id = 'aa100000-0000-4000-8000-000000000053'),
  1,
  'day-command success stores exactly one idempotency receipt'
);
update public.time_entries
set status = 'correction_requested', correction_reason = 'FICTITIOUS pending correction'
where id = 'aa100000-0000-4000-8000-000000000051';

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"aa100000-0000-4000-8000-000000000001","session_id":"aa100000-0000-4000-8000-000000000011"}',
  true
);
select throws_ok(
  $$select public.staff_day_command(
    'aa100000-0000-4000-8000-000000000021','confirm',
    jsonb_build_object(
      'dayReviewId', (select id from public.staff_day_reviews where personnel_id = 'aa100000-0000-4000-8000-000000000031' and day = current_date),
      'version', (select version from public.staff_day_reviews where personnel_id = 'aa100000-0000-4000-8000-000000000031' and day = current_date),
      'note', 'FICTITIOUS correction pending'
    ),
    'aa100000-0000-4000-8000-000000000054'
  )$$,
  '23514', null,
  'day confirmation rejects a correction-requested time entry'
);
reset role;
update public.time_entries
set status = 'draft', correction_reason = null
where id = 'aa100000-0000-4000-8000-000000000051';

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"aa100000-0000-4000-8000-000000000001","session_id":"aa100000-0000-4000-8000-000000000011"}',
  true
);
select lives_ok(
  $$select public.staff_day_command(
    'aa100000-0000-4000-8000-000000000021','confirm',
    jsonb_build_object(
      'dayReviewId', (select id from public.staff_day_reviews where personnel_id = 'aa100000-0000-4000-8000-000000000031' and day = current_date),
      'version', (select version from public.staff_day_reviews where personnel_id = 'aa100000-0000-4000-8000-000000000031' and day = current_date),
      'note', 'FICTITIOUS confirmed day'
    ),
    'aa100000-0000-4000-8000-000000000055'
  )$$,
  'day confirmation succeeds only after correction state is resolved'
);
reset role;
select throws_ok(
  $$update public.time_entries
    set ends_at = ends_at + interval '1 minute'
    where id = 'aa100000-0000-4000-8000-000000000051'$$,
  '23514', null,
  'confirmed-day trigger prevents later time-source drift'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"aa100000-0000-4000-8000-000000000001","session_id":"aa100000-0000-4000-8000-000000000011"}',
  true
);
select lives_ok(
  $$select public.staff_request_time_correction(
    'aa100000-0000-4000-8000-000000000021',
    'aa100000-0000-4000-8000-000000000051',
    (select version from public.time_entries where id = 'aa100000-0000-4000-8000-000000000051'),
    'duration', null, null, 450,
    'FICTITIOUS timer was stopped too late',
    'aa100000-0000-4000-8000-000000000056'
  )$$,
  'staff can submit a desired duration for an own closed, confirmed time registration'
);
select ok(
  exists (
    select 1
    from public.staff_time_correction_requests request
    join public.time_entries entry
      on entry.tenant_id = request.tenant_id and entry.id = request.time_entry_id
    where request.tenant_id = 'aa100000-0000-4000-8000-000000000021'
      and request.time_entry_id = 'aa100000-0000-4000-8000-000000000051'
      and request.personnel_id = 'aa100000-0000-4000-8000-000000000031'
      and request.correction_mode = 'duration'
      and request.requested_duration_minutes = 450
      and request.requested_starts_at = request.source_starts_at
      and request.requested_ends_at = request.source_starts_at + interval '450 minutes'
      and request.source_version = entry.version
      and request.source_day_state = 'confirmed'
      and request.status = 'pending'
  ),
  'the persistent request contains the immutable source and desired correction snapshots'
);
select ok(
  (select status = 'draft'
      and correction_reason is null
      and ends_at = starts_at + interval '8 hours'
   from public.time_entries where id = 'aa100000-0000-4000-8000-000000000051'),
  'requesting a correction does not rewrite or reclassify the source hours'
);
select is(
  (select state from public.staff_day_reviews
   where personnel_id = 'aa100000-0000-4000-8000-000000000031' and day = current_date),
  'confirmed',
  'requesting a correction keeps the confirmed day locked'
);
select is(
  (public.staff_request_time_correction(
    'aa100000-0000-4000-8000-000000000021',
    'aa100000-0000-4000-8000-000000000051',
    (select version from public.time_entries where id = 'aa100000-0000-4000-8000-000000000051'),
    'duration', null, null, 450,
    'FICTITIOUS timer was stopped too late',
    'aa100000-0000-4000-8000-000000000056'
  ) ->> 'id')::uuid,
  (select id from public.staff_time_correction_requests
   where time_entry_id = 'aa100000-0000-4000-8000-000000000051' and status = 'pending'),
  'an exact correction retry returns the original persistent request'
);
select lives_ok(
  $$select public.staff_day_command(
    'aa100000-0000-4000-8000-000000000021','reopen',
    jsonb_build_object(
      'dayReviewId', (select id from public.staff_day_reviews where personnel_id = 'aa100000-0000-4000-8000-000000000031' and day = current_date),
      'version', (select version from public.staff_day_reviews where personnel_id = 'aa100000-0000-4000-8000-000000000031' and day = current_date),
      'note', 'FICTITIOUS reopened while correction is pending'
    ),
    'aa100000-0000-4000-8000-000000000095'
  )$$,
  'a confirmed day can be reopened while its correction request is pending'
);
select lives_ok(
  $$select public.staff_day_command(
    'aa100000-0000-4000-8000-000000000021','close',
    jsonb_build_object('workDay', current_date, 'note', 'FICTITIOUS closed with pending correction'),
    'aa100000-0000-4000-8000-000000000096'
  )$$,
  'the day can close while management is still reviewing the correction'
);
select throws_ok(
  $$select public.staff_day_command(
    'aa100000-0000-4000-8000-000000000021','confirm',
    jsonb_build_object(
      'dayReviewId', (select id from public.staff_day_reviews where personnel_id = 'aa100000-0000-4000-8000-000000000031' and day = current_date),
      'version', (select version from public.staff_day_reviews where personnel_id = 'aa100000-0000-4000-8000-000000000031' and day = current_date),
      'note', 'FICTITIOUS must remain unconfirmed'
    ),
    'aa100000-0000-4000-8000-000000000097'
  )$$,
  '23514', null,
  'day confirmation rejects a persistent pending correction request'
);
select throws_ok(
  $$select public.staff_request_time_correction(
    'aa100000-0000-4000-8000-000000000021',
    'aa100000-0000-4000-8000-000000000051',
    (select version + 1 from public.time_entries where id = 'aa100000-0000-4000-8000-000000000051'),
    'duration', null, null, 420,
    'FICTITIOUS stale correction version',
    'aa100000-0000-4000-8000-000000000057'
  )$$,
  '40001', null,
  'a stale source version cannot create a correction request'
);
select throws_ok(
  $$select public.staff_request_time_correction(
    'aa100000-0000-4000-8000-000000000021',
    'aa100000-0000-4000-8000-000000000051',
    (select version from public.time_entries where id = 'aa100000-0000-4000-8000-000000000051'),
    'times',
    (select starts_at + interval '15 minutes' from public.time_entries where id = 'aa100000-0000-4000-8000-000000000051'),
    (select ends_at from public.time_entries where id = 'aa100000-0000-4000-8000-000000000051'),
    null,
    'FICTITIOUS second pending correction',
    'aa100000-0000-4000-8000-000000000058'
  )$$,
  '23514', null,
  'a time registration cannot accumulate multiple pending correction requests'
);
select ok(
  jsonb_array_length(public.staff_workspace('aa100000-0000-4000-8000-000000000021')->'staffTimeCorrectionRequests') = 1
  and not (public.staff_workspace('aa100000-0000-4000-8000-000000000021')->'staffTimeCorrectionRequests'->0 ? 'created_by')
  and not (public.staff_workspace('aa100000-0000-4000-8000-000000000021')->'staffTimeCorrectionRequests'->0 ? 'reviewed_by'),
  'staff workspace exposes only the own bounded correction request without actor identifiers'
);
reset role;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"aa100000-0000-4000-8000-000000000003","session_id":"aa100000-0000-4000-8000-000000000013"}',
  true
);
select throws_ok(
  $$select public.staff_request_time_correction(
    'aa100000-0000-4000-8000-000000000021',
    'aa100000-0000-4000-8000-000000000051', 4,
    'duration', null, null, 420,
    'FICTITIOUS request against another employee',
    'aa100000-0000-4000-8000-000000000059'
  )$$,
  '42501', null,
  'staff cannot request a correction for another employee time registration'
);
select is(
  (select count(*)::integer from public.staff_time_correction_requests),
  0,
  'staff RLS hides another employee correction requests'
);
reset role;

-- Isolate management review from the current-day lifecycle scenario above.
-- Approval starts from a confirmed day and must force explicit reconfirmation;
-- rejection gets its own confirmed day so it can prove a true no-op on hours.
insert into public.time_entries (
  id, tenant_id, personnel_id, kind, starts_at, ends_at, status, approved_by, approved_at
) values (
  'aa100000-0000-4000-8000-000000000098',
  'aa100000-0000-4000-8000-000000000021',
  'aa100000-0000-4000-8000-000000000031',
  'work',
  ((current_date - 2) + time '08:00') at time zone 'Europe/Amsterdam',
  ((current_date - 2) + time '16:00') at time zone 'Europe/Amsterdam',
  'approved', 'aa100000-0000-4000-8000-000000000002', clock_timestamp()
), (
  'aa100000-0000-4000-8000-000000000102',
  'aa100000-0000-4000-8000-000000000021',
  'aa100000-0000-4000-8000-000000000031',
  'work',
  ((current_date - 3) + time '08:00') at time zone 'Europe/Amsterdam',
  ((current_date - 3) + time '16:00') at time zone 'Europe/Amsterdam',
  'draft', null, null
), (
  'aa100000-0000-4000-8000-000000000106',
  'aa100000-0000-4000-8000-000000000021',
  'aa100000-0000-4000-8000-000000000031',
  'work',
  ((current_date - 4) + time '14:30') at time zone 'Europe/Amsterdam',
  null,
  'draft', null, null
);
insert into public.staff_day_reviews (
  id, tenant_id, personnel_id, day, state, note,
  closed_at, confirmed_at, created_by
) values (
  'aa100000-0000-4000-8000-000000000099',
  'aa100000-0000-4000-8000-000000000021',
  'aa100000-0000-4000-8000-000000000031',
  current_date - 2, 'confirmed', 'FICTITIOUS approve review day',
  clock_timestamp(), clock_timestamp(),
  'aa100000-0000-4000-8000-000000000001'
), (
  'aa100000-0000-4000-8000-000000000103',
  'aa100000-0000-4000-8000-000000000021',
  'aa100000-0000-4000-8000-000000000031',
  current_date - 3, 'confirmed', 'FICTITIOUS reject review day',
  clock_timestamp(), clock_timestamp(),
  'aa100000-0000-4000-8000-000000000001'
);
insert into public.staff_time_correction_requests (
  id, tenant_id, personnel_id, time_entry_id, correction_mode,
  source_version, source_kind, source_status, source_starts_at, source_ends_at,
  source_day_state, requested_starts_at, requested_ends_at,
  requested_duration_minutes, reason, created_by
) values (
  'aa100000-0000-4000-8000-000000000100',
  'aa100000-0000-4000-8000-000000000021',
  'aa100000-0000-4000-8000-000000000031',
  'aa100000-0000-4000-8000-000000000098',
  'duration', 1, 'work', 'approved',
  ((current_date - 2) + time '08:00') at time zone 'Europe/Amsterdam',
  ((current_date - 2) + time '16:00') at time zone 'Europe/Amsterdam',
  'confirmed',
  ((current_date - 2) + time '08:00') at time zone 'Europe/Amsterdam',
  ((current_date - 2) + time '15:00') at time zone 'Europe/Amsterdam',
  420, 'FICTITIOUS approved duration correction',
  'aa100000-0000-4000-8000-000000000001'
), (
  'aa100000-0000-4000-8000-000000000104',
  'aa100000-0000-4000-8000-000000000021',
  'aa100000-0000-4000-8000-000000000031',
  'aa100000-0000-4000-8000-000000000102',
  'duration', 1, 'work', 'draft',
  ((current_date - 3) + time '08:00') at time zone 'Europe/Amsterdam',
  ((current_date - 3) + time '16:00') at time zone 'Europe/Amsterdam',
  'confirmed',
  ((current_date - 3) + time '08:00') at time zone 'Europe/Amsterdam',
  ((current_date - 3) + time '15:30') at time zone 'Europe/Amsterdam',
  450, 'FICTITIOUS rejected duration correction',
  'aa100000-0000-4000-8000-000000000001'
);

select ok(
  exists (
    select 1
    from private.notification_domain_events event
    join private.notification_requests request
      on request.source_kind = 'domain'
     and request.source_id = event.id
    where event.tenant_id = 'aa100000-0000-4000-8000-000000000021'
      and event.type_code = 'time.correction'
      and event.details->>'correction_id' = 'aa100000-0000-4000-8000-000000000100'
      and event.details->>'request_state' = 'pending'
      and request.payload->>'context' = 'backoffice'
      and request.payload->>'path' = '/app/personeel/aa100000-0000-4000-8000-000000000031?tab=uren&period=' || to_char(current_date - 2, 'YYYY-MM') || '#time-correction-aa100000-0000-4000-8000-000000000100'
      and request.payload->'channels' = '["in_app"]'::jsonb
  ),
  'a pending correction emits one guarded backoffice notification-domain deep link'
);

update public.tenant_memberships
set roles = array['staff','management']::public.app_role[]
where tenant_id = 'aa100000-0000-4000-8000-000000000021'
  and user_id = 'aa100000-0000-4000-8000-000000000001';

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"aa100000-0000-4000-8000-000000000001","session_id":"aa100000-0000-4000-8000-000000000011"}',
  true
);
select throws_ok(
  $$select public.review_staff_time_correction(
    'aa100000-0000-4000-8000-000000000021',
    'aa100000-0000-4000-8000-000000000100',
    'approve', 1, 'FICTITIOUS unauthorized self review'
  )$$,
  '42501', null,
  'a dual-role staff manager cannot review their own time correction request'
);
select throws_ok(
  $$update public.staff_time_correction_requests
    set review_note = 'FICTITIOUS direct review bypass'
    where id = 'aa100000-0000-4000-8000-000000000100'$$,
  '42501', null,
  'staff cannot bypass correction review through a direct table mutation'
);
reset role;

update public.tenant_memberships
set roles = array['staff']::public.app_role[]
where tenant_id = 'aa100000-0000-4000-8000-000000000021'
  and user_id = 'aa100000-0000-4000-8000-000000000001';

-- Simulate a concurrent source revision without changing its business fields.
-- Approval must compare the complete captured source snapshot, while rejection
-- may still resolve the request without changing that source or its day state.
update public.time_entries
set updated_at = updated_at
where id = 'aa100000-0000-4000-8000-000000000102';

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"aa100000-0000-4000-8000-000000000002","session_id":"aa100000-0000-4000-8000-000000000012"}',
  true
);
select is(
  (select count(*)::integer from public.staff_time_correction_requests
   where tenant_id = 'aa100000-0000-4000-8000-000000000021' and status = 'pending'),
  3,
  'management can read the tenant correction queue'
);
select ok(
  (public.personnel_dossier_staff_projection(
    'aa100000-0000-4000-8000-000000000021',
    'aa100000-0000-4000-8000-000000000031'
  ) ->> 'version')::bigint > 0
  and public.personnel_dossier_staff_projection(
    'aa100000-0000-4000-8000-000000000021',
    'aa100000-0000-4000-8000-000000000031'
  ) ?& array['account_status','availability_self_service_enabled','version']
  and not public.personnel_dossier_staff_projection(
    'aa100000-0000-4000-8000-000000000021',
    'aa100000-0000-4000-8000-000000000031'
  ) ? 'user_id',
  'the dossier reads only its least-privilege staff-account projection'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.staff_request_time_correction(uuid,uuid,bigint,text,timestamptz,timestamptz,integer,text,uuid)',
    'execute'
  )
  and not has_function_privilege(
    'anon',
    'public.staff_request_time_correction(uuid,uuid,bigint,text,timestamptz,timestamptz,integer,text,uuid)',
    'execute'
  )
  and has_function_privilege(
    'authenticated',
    'public.review_staff_time_correction(uuid,uuid,text,bigint,text)',
    'execute'
  )
  and not has_function_privilege(
    'anon',
    'public.review_staff_time_correction(uuid,uuid,text,bigint,text)',
    'execute'
  )
  and not has_function_privilege(
    'service_role',
    'public.review_staff_time_correction(uuid,uuid,text,bigint,text)',
    'execute'
  )
  and has_function_privilege(
    'authenticated',
    'public.personnel_dossier_staff_projection(uuid,uuid)',
    'execute'
  )
  and not has_function_privilege(
    'anon',
    'public.personnel_dossier_staff_projection(uuid,uuid)',
    'execute'
  )
  and not has_function_privilege(
    'service_role',
    'public.personnel_dossier_staff_projection(uuid,uuid)',
    'execute'
  ),
  'correction and dossier-projection RPCs are exposed only through authenticated server guards'
);
select throws_ok(
  $$select public.review_staff_time_correction(
    'aa100000-0000-4000-8000-000000000022',
    'aa100000-0000-4000-8000-000000000100',
    'approve', 1, 'FICTITIOUS wrong tenant review'
  )$$,
  '42501', null,
  'management cannot review a correction through another tenant context'
);
select throws_ok(
  $$select public.review_staff_time_correction(
    'aa100000-0000-4000-8000-000000000021',
    'aa100000-0000-4000-8000-000000000100',
    'approve', 2, 'FICTITIOUS stale request review'
  )$$,
  '40001', null,
  'management review rejects a stale correction-request version'
);
select ok(
  (select status = 'pending' and version = 1 and reviewed_by is null and reviewed_at is null
   from public.staff_time_correction_requests
   where id = 'aa100000-0000-4000-8000-000000000100')
  and (select version = 1
          and starts_at = ((current_date - 2) + time '08:00') at time zone 'Europe/Amsterdam'
          and ends_at = ((current_date - 2) + time '16:00') at time zone 'Europe/Amsterdam'
       from public.time_entries
       where id = 'aa100000-0000-4000-8000-000000000098')
  and (select state = 'confirmed' and version = 1 and confirmed_at is not null
       from public.staff_day_reviews
       where id = 'aa100000-0000-4000-8000-000000000099'),
  'a stale request review leaves request, source hours and confirmed day atomically unchanged'
);
select throws_ok(
  $$select public.review_staff_time_correction(
    'aa100000-0000-4000-8000-000000000021',
    'aa100000-0000-4000-8000-000000000104',
    'approve', 1, 'FICTITIOUS stale source review'
  )$$,
  '40001', null,
  'approval rejects a time source that changed after the immutable request snapshot'
);
select ok(
  (select status = 'pending' and version = 1 and reviewed_by is null and reviewed_at is null
   from public.staff_time_correction_requests
   where id = 'aa100000-0000-4000-8000-000000000104')
  and (select version = 2
          and starts_at = ((current_date - 3) + time '08:00') at time zone 'Europe/Amsterdam'
          and ends_at = ((current_date - 3) + time '16:00') at time zone 'Europe/Amsterdam'
       from public.time_entries
       where id = 'aa100000-0000-4000-8000-000000000102')
  and (select state = 'confirmed' and version = 1 and confirmed_at is not null
       from public.staff_day_reviews
       where id = 'aa100000-0000-4000-8000-000000000103'),
  'a stale source approval leaves the pending request, source hours and confirmed day intact'
);
select throws_ok(
  $$select public.review_staff_time_correction(
    'aa100000-0000-4000-8000-000000000021',
    'aa100000-0000-4000-8000-000000000104',
    'reject', 1, null
  )$$,
  '23514', null,
  'rejecting a correction requires a concrete management note'
);
select lives_ok(
  $$select public.review_staff_time_correction(
    'aa100000-0000-4000-8000-000000000021',
    'aa100000-0000-4000-8000-000000000104',
    'reject', 1, 'FICTITIOUS rejected after source drift'
  )$$,
  'management can reject a version-matched pending correction after source drift'
);
select ok(
  (select status = 'rejected'
          and version = 2
          and reviewed_by = 'aa100000-0000-4000-8000-000000000002'
          and reviewed_at is not null
          and review_note = 'FICTITIOUS rejected after source drift'
   from public.staff_time_correction_requests
   where id = 'aa100000-0000-4000-8000-000000000104')
  and (select version = 2 and status = 'draft'
          and starts_at = ((current_date - 3) + time '08:00') at time zone 'Europe/Amsterdam'
          and ends_at = ((current_date - 3) + time '16:00') at time zone 'Europe/Amsterdam'
       from public.time_entries
       where id = 'aa100000-0000-4000-8000-000000000102')
  and (select state = 'confirmed' and version = 1 and confirmed_at is not null
       from public.staff_day_reviews
       where id = 'aa100000-0000-4000-8000-000000000103'),
  'rejection records its decision without changing the source hours or confirmed day'
);
select throws_ok(
  $$select public.review_staff_time_correction(
    'aa100000-0000-4000-8000-000000000021',
    'aa100000-0000-4000-8000-000000000100',
    'approve', 1, 'FICTITIOUS blocked by an open overlapping entry'
  )$$,
  '23514', null,
  'approval rejects overlap with an open-ended time registration'
);
select ok(
  (select status = 'pending' and version = 1
   from public.staff_time_correction_requests
   where id = 'aa100000-0000-4000-8000-000000000100')
  and (select status = 'approved'
          and approved_by = 'aa100000-0000-4000-8000-000000000002'
          and approved_at is not null
       from public.time_entries
       where id = 'aa100000-0000-4000-8000-000000000098'),
  'an open-overlap rejection leaves request and approved source metadata unchanged'
);
reset role;
delete from public.time_entries
where id = 'aa100000-0000-4000-8000-000000000106';
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"aa100000-0000-4000-8000-000000000002","session_id":"aa100000-0000-4000-8000-000000000012"}',
  true
);
select lives_ok(
  $$select public.review_staff_time_correction(
    'aa100000-0000-4000-8000-000000000021',
    'aa100000-0000-4000-8000-000000000100',
    'approve', 1, 'FICTITIOUS approved exact correction'
  )$$,
  'management atomically approves an exact-version correction snapshot'
);
select ok(
  (select status = 'approved'
          and version = 2
          and reviewed_by = 'aa100000-0000-4000-8000-000000000002'
          and reviewed_at is not null
          and review_note = 'FICTITIOUS approved exact correction'
   from public.staff_time_correction_requests
   where id = 'aa100000-0000-4000-8000-000000000100'),
  'approval records immutable management review metadata and advances its version once'
);
select ok(
  (select version = 2 and status = 'draft'
          and approved_by is null
          and approved_at is null
          and starts_at = ((current_date - 2) + time '08:00') at time zone 'Europe/Amsterdam'
          and ends_at = ((current_date - 2) + time '15:00') at time zone 'Europe/Amsterdam'
       from public.time_entries
       where id = 'aa100000-0000-4000-8000-000000000098'),
  'approval applies the exact interval, clears stale approval metadata and returns the row to draft'
);
select ok(
  (select state = 'closed'
          and version = 2
          and closed_at is not null
          and confirmed_at is null
          and correction_requested_at is null
   from public.staff_day_reviews
   where id = 'aa100000-0000-4000-8000-000000000099'),
  'approval reopens the confirmation boundary by moving a confirmed day back to closed'
);
select ok(
  (select count(*) = 2
          and bool_and(actor_user_id = 'aa100000-0000-4000-8000-000000000002')
          and bool_and(before_data ?& array['request','time_entry','day_review'])
          and bool_and(after_data ?& array['request','time_entry','day_review'])
   from public.audit_events
   where tenant_id = 'aa100000-0000-4000-8000-000000000021'
     and entity_type = 'staff_time_correction_request'
     and entity_id in (
       'aa100000-0000-4000-8000-000000000100',
       'aa100000-0000-4000-8000-000000000104'
     )
     and action in ('staff.time.correction_approved','staff.time.correction_rejected')),
  'approve and reject each append one actor-bound before/after audit event'
);
reset role;

select ok(
  exists (
    select 1
    from private.notification_domain_events event
    join private.notification_requests request
      on request.source_kind = 'domain' and request.source_id = event.id
    where event.details->>'correction_id' = 'aa100000-0000-4000-8000-000000000100'
      and event.details->>'request_state' = 'approved'
      and request.payload->>'context' = 'staff'
      and request.payload->>'path' = '/staff?tab=uren#time-correction-aa100000-0000-4000-8000-000000000100'
  )
  and exists (
    select 1
    from private.notification_domain_events event
    join private.notification_requests request
      on request.source_kind = 'domain' and request.source_id = event.id
    where event.details->>'correction_id' = 'aa100000-0000-4000-8000-000000000104'
      and event.details->>'request_state' = 'rejected'
      and request.payload->>'context' = 'staff'
      and request.payload->>'path' = '/staff?tab=uren#time-correction-aa100000-0000-4000-8000-000000000104'
  ),
  'terminal correction decisions emit guarded staff notification deep links'
);
select throws_ok(
  $$delete from public.time_entries
    where id = 'aa100000-0000-4000-8000-000000000098'$$,
  '23503', null,
  'terminal correction history prevents deletion of its source time registration'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"aa100000-0000-4000-8000-000000000001","session_id":"aa100000-0000-4000-8000-000000000011"}',
  true
);
select lives_ok(
  $$select public.staff_day_command(
    'aa100000-0000-4000-8000-000000000021', 'confirm',
    jsonb_build_object(
      'dayReviewId', 'aa100000-0000-4000-8000-000000000099',
      'version', (select version from public.staff_day_reviews
                  where id = 'aa100000-0000-4000-8000-000000000099'),
      'note', 'FICTITIOUS reconfirmed after approved correction'
    ),
    'aa100000-0000-4000-8000-000000000105'
  )$$,
  'staff can explicitly reconfirm the day after management applies the correction'
);
select ok(
  (select state = 'confirmed'
          and version = 3
          and confirmed_at is not null
          and note = 'FICTITIOUS reconfirmed after approved correction'
   from public.staff_day_reviews
   where id = 'aa100000-0000-4000-8000-000000000099'),
  'reconfirmation seals the corrected day with a new optimistic version'
);
select lives_ok(
  $$select public.staff_request_time_correction(
    'aa100000-0000-4000-8000-000000000021',
    'aa100000-0000-4000-8000-000000000102',
    (select version from public.time_entries where id = 'aa100000-0000-4000-8000-000000000102'),
    'duration', null, null, 450,
    'FICTITIOUS rejected duration correction',
    'aa100000-0000-4000-8000-000000000107'
  )$$,
  'a fresh intent key can resubmit the same business correction after rejection'
);
select ok(
  exists (
    select 1
    from public.staff_time_correction_requests request
    where request.time_entry_id = 'aa100000-0000-4000-8000-000000000102'
      and request.id <> 'aa100000-0000-4000-8000-000000000104'
      and request.status = 'pending'
      and request.requested_duration_minutes = 450
      and request.reason = 'FICTITIOUS rejected duration correction'
  ),
  'the resubmission creates a distinct pending correction rather than replaying the rejected receipt'
);
reset role;

insert into public.customers (
  id, tenant_id, customer_number, name, billing_address
) values (
  'aa100000-0000-4000-8000-000000000061',
  'aa100000-0000-4000-8000-000000000021',
  'FICT-CUSTOMER-001', 'FICTITIOUS customer',
  '{"street":"Teststraat 1","postal_code":"1234 AB","city":"Den Haag","country":"NL"}'::jsonb
);
insert into public.objects (
  id, tenant_id, customer_id, object_number, name, address
) values (
  'aa100000-0000-4000-8000-000000000062',
  'aa100000-0000-4000-8000-000000000021',
  'aa100000-0000-4000-8000-000000000061',
  'FICT-OBJECT-001', 'FICTITIOUS object',
  '{"street":"Teststraat 1","postal_code":"1234 AB","city":"Den Haag","country":"NL"}'::jsonb
);
insert into public.work_orders (
  id, tenant_id, work_order_number, customer_id, object_id, discipline,
  planned_start_at, planned_end_at, projected_start_at, projected_end_at,
  created_by
) values (
  'aa100000-0000-4000-8000-000000000063',
  'aa100000-0000-4000-8000-000000000021',
  'FICT-WO-001',
  'aa100000-0000-4000-8000-000000000061',
  'aa100000-0000-4000-8000-000000000062',
  'Service', clock_timestamp(), clock_timestamp() + interval '2 hours',
  clock_timestamp(), clock_timestamp() + interval '2 hours',
  'aa100000-0000-4000-8000-000000000002'
);
update public.work_orders
set status = 'seen', report_state = 'draft', published_at = clock_timestamp()
where id = 'aa100000-0000-4000-8000-000000000063';
insert into public.work_order_assignments (
  id, tenant_id, work_order_id, personnel_id, status,
  planned_start_at, planned_end_at, projected_start_at, projected_end_at
) values (
  'aa100000-0000-4000-8000-000000000064',
  'aa100000-0000-4000-8000-000000000021',
  'aa100000-0000-4000-8000-000000000063',
  'aa100000-0000-4000-8000-000000000031',
  'seen', clock_timestamp(), clock_timestamp() + interval '2 hours',
  clock_timestamp(), clock_timestamp() + interval '2 hours'
);
insert into public.dispatches (
  id, tenant_id, work_order_id, assignment_id, dispatched_by, idempotency_key
) values (
  'aa100000-0000-4000-8000-000000000065',
  'aa100000-0000-4000-8000-000000000021',
  'aa100000-0000-4000-8000-000000000063',
  'aa100000-0000-4000-8000-000000000064',
  'aa100000-0000-4000-8000-000000000002',
  'FICTITIOUS-staff-personnel-dispatch'
);
insert into public.report_entries (
  id, tenant_id, work_order_id, author_user_id, body, customer_visible
) values (
  'aa100000-0000-4000-8000-000000000066',
  'aa100000-0000-4000-8000-000000000021',
  'aa100000-0000-4000-8000-000000000063',
  'aa100000-0000-4000-8000-000000000001',
  'FICTITIOUS original report note', true
);
insert into public.attachments (
  id, tenant_id, work_order_id, report_entry_id, uploaded_by,
  storage_bucket, storage_path, file_name, mime_type, size_bytes, sha256,
  customer_visible
) values (
  'aa100000-0000-4000-8000-000000000067',
  'aa100000-0000-4000-8000-000000000021',
  'aa100000-0000-4000-8000-000000000063',
  'aa100000-0000-4000-8000-000000000066',
  'aa100000-0000-4000-8000-000000000001',
  'reports',
  'aa100000-0000-4000-8000-000000000021/aa100000-0000-4000-8000-000000000063/aa100000-0000-4000-8000-000000000066/fictitious.pdf',
  'fictitious.pdf', 'application/pdf', 128, repeat('a', 64), true
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"aa100000-0000-4000-8000-000000000001","session_id":"aa100000-0000-4000-8000-000000000011"}',
  true
);
select lives_ok(
  $$select public.staff_work_order_cost_command(
    'aa100000-0000-4000-8000-000000000021','add_expense',
    jsonb_build_object(
      'orderId','aa100000-0000-4000-8000-000000000063',
      'description','FICTITIOUS parking',
      'amountCents',1250,
      'customerVisible',true
    ),
    'aa100000-0000-4000-8000-000000000068'
  )$$,
  'assigned staff records an expense while the report is editable'
);
select throws_ok(
  $$select public.staff_work_order_cost_command(
    'aa100000-0000-4000-8000-000000000021','remove_expense',
    jsonb_build_object(
      'id',(select id from public.work_order_expenses where description = 'FICTITIOUS parking'),
      'version',99
    ),
    'aa100000-0000-4000-8000-000000000069'
  )$$,
  '40001', null,
  'expense delete enforces optimistic version matching'
);
select ok(
  jsonb_array_length(public.staff_workspace('aa100000-0000-4000-8000-000000000021')->'personnel') = 1
  and public.staff_workspace('aa100000-0000-4000-8000-000000000021')->'personnel'->0 ?& array['own_transport','travel_limitations']
  and not (public.staff_workspace('aa100000-0000-4000-8000-000000000021')->'personnel'->0 ? 'user_id')
  and (public.staff_workspace('aa100000-0000-4000-8000-000000000021')->'reports'->0->>'owned_by_current_user')::boolean
  and not (public.staff_workspace('aa100000-0000-4000-8000-000000000021')->'reports'->0 ? 'author_user_id'),
  'staff workspace exposes only own bounded personnel/report DTOs without actor identifiers'
);
reset role;

update public.work_orders
set report_state = 'review'
where id = 'aa100000-0000-4000-8000-000000000063';
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"aa100000-0000-4000-8000-000000000001","session_id":"aa100000-0000-4000-8000-000000000011"}',
  true
);
select throws_ok(
  $$select public.staff_work_order_cost_command(
    'aa100000-0000-4000-8000-000000000021','add_expense',
    '{"orderId":"aa100000-0000-4000-8000-000000000063","description":"FICTITIOUS locked","amountCents":500,"customerVisible":false}'::jsonb,
    'aa100000-0000-4000-8000-000000000070'
  )$$,
  '23514', null,
  'cost command uses the canonical report-editable lifecycle guard'
);
select throws_ok(
  $$select public.staff_report_entry_command(
    'aa100000-0000-4000-8000-000000000021','update',
    '{"reportEntryId":"aa100000-0000-4000-8000-000000000066","version":1,"body":"FICTITIOUS locked edit"}'::jsonb,
    'aa100000-0000-4000-8000-000000000071'
  )$$,
  '23514', null,
  'report-entry update also uses the canonical report-editable lifecycle guard'
);
reset role;
update public.work_orders
set report_state = 'draft'
where id = 'aa100000-0000-4000-8000-000000000063';

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"aa100000-0000-4000-8000-000000000003","session_id":"aa100000-0000-4000-8000-000000000013"}',
  true
);
select throws_ok(
  $$select public.staff_work_order_cost_command(
    'aa100000-0000-4000-8000-000000000021','add_expense',
    '{"orderId":"aa100000-0000-4000-8000-000000000063","description":"FICTITIOUS cross user","amountCents":500,"customerVisible":false}'::jsonb,
    'aa100000-0000-4000-8000-000000000072'
  )$$,
  '42501', null,
  'unassigned staff cannot add costs to another employee work order'
);
select throws_ok(
  $$select public.staff_report_entry_command(
    'aa100000-0000-4000-8000-000000000021','update',
    '{"reportEntryId":"aa100000-0000-4000-8000-000000000066","version":1,"body":"FICTITIOUS cross user edit"}'::jsonb,
    'aa100000-0000-4000-8000-000000000073'
  )$$,
  '42501', null,
  'staff cannot mutate another author report entry'
);
reset role;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"aa100000-0000-4000-8000-000000000001","session_id":"aa100000-0000-4000-8000-000000000011"}',
  true
);
select throws_ok(
  $$select public.staff_report_entry_command(
    'aa100000-0000-4000-8000-000000000021','update',
    '{"reportEntryId":"aa100000-0000-4000-8000-000000000066","version":99,"body":"FICTITIOUS stale edit"}'::jsonb,
    'aa100000-0000-4000-8000-000000000074'
  )$$,
  '40001', null,
  'report-entry update enforces optimistic version matching'
);
select lives_ok(
  $$select public.staff_report_entry_command(
    'aa100000-0000-4000-8000-000000000021','update',
    '{"reportEntryId":"aa100000-0000-4000-8000-000000000066","version":1,"body":"FICTITIOUS updated report note","customerVisible":false}'::jsonb,
    'aa100000-0000-4000-8000-000000000075'
  )$$,
  'report-entry update atomically changes parent and child visibility'
);
select lives_ok(
  $$select public.staff_report_entry_command(
    'aa100000-0000-4000-8000-000000000021','delete',
    jsonb_build_object(
      'reportEntryId','aa100000-0000-4000-8000-000000000066',
      'version',(select version from public.report_entries where id = 'aa100000-0000-4000-8000-000000000066')
    ),
    'aa100000-0000-4000-8000-000000000076'
  )$$,
  'report-entry delete soft-deletes child and parent in one transaction'
);
select is(
  jsonb_array_length(
    public.staff_workspace('aa100000-0000-4000-8000-000000000021')->'attachments'
  ),
  0,
  'staff workspace excludes attachments whose report-entry parent is soft-deleted'
);
reset role;

select ok(
  (select deleted_at is not null from public.report_entries where id = 'aa100000-0000-4000-8000-000000000066')
  and (select deleted_at is not null and not customer_visible from public.attachments where id = 'aa100000-0000-4000-8000-000000000067'),
  'report child visibility and soft-delete follow the versioned parent command'
);

select set_config('request.jwt.claims', '{}', true);

insert into public.work_order_tasks (
  id, tenant_id, work_order_id, task_code, task_name, duration_minutes,
  quantity, unit, unit_price_cents, vat_basis_points, completed_at,
  executed_quantity, execution_state, added_by
) values (
  'aa100000-0000-4000-8000-000000000081',
  'aa100000-0000-4000-8000-000000000021',
  'aa100000-0000-4000-8000-000000000063',
  'FICT-TASK', 'FICTITIOUS completed task', 30,
  1, 'opdracht', 0, 0, clock_timestamp(),
  1, 'completed', 'aa100000-0000-4000-8000-000000000001'
);
insert into public.attachments (
  id, tenant_id, work_order_id, uploaded_by, storage_bucket, storage_path,
  file_name, mime_type, size_bytes, sha256, customer_visible
) values (
  'aa100000-0000-4000-8000-000000000082',
  'aa100000-0000-4000-8000-000000000021',
  'aa100000-0000-4000-8000-000000000063',
  'aa100000-0000-4000-8000-000000000001',
  'reports',
  'aa100000-0000-4000-8000-000000000021/aa100000-0000-4000-8000-000000000063/fictitious-customer-proof.pdf',
  'fictitious-customer-proof.pdf', 'application/pdf', 256, repeat('b', 64), true
), (
  'aa100000-0000-4000-8000-000000000083',
  'aa100000-0000-4000-8000-000000000021',
  'aa100000-0000-4000-8000-000000000063',
  'aa100000-0000-4000-8000-000000000001',
  'reports',
  'aa100000-0000-4000-8000-000000000021/aa100000-0000-4000-8000-000000000063/fictitious-internal-proof.pdf',
  'fictitious-internal-proof.pdf', 'application/pdf', 256, repeat('c', 64), false
);
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"aa100000-0000-4000-8000-000000000002","session_id":"aa100000-0000-4000-8000-000000000012"}',
  true
);
select public.change_work_order_signature_policy(
  'aa100000-0000-4000-8000-000000000063',
  (select version from public.work_orders where id = 'aa100000-0000-4000-8000-000000000063'),
  'required', false, 'FICTITIOUS on-site customer signing test',
  'aa100000-0000-4000-8000-000000000080'
);
reset role;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"aa100000-0000-4000-8000-000000000001","session_id":"aa100000-0000-4000-8000-000000000011"}',
  true
);
select public.staff_day_command(
  'aa100000-0000-4000-8000-000000000021', 'reopen',
  jsonb_build_object(
    'dayReviewId', (select id from public.staff_day_reviews where personnel_id = 'aa100000-0000-4000-8000-000000000031' and day = current_date),
    'version', (select version from public.staff_day_reviews where personnel_id = 'aa100000-0000-4000-8000-000000000031' and day = current_date),
    'note', 'FICTITIOUS reopened for work-order transition coverage'
  ),
  'aa100000-0000-4000-8000-000000000094'
);
select lives_ok(
  $$select public.transition_work_order(
    'aa100000-0000-4000-8000-000000000063', 'travel',
    (select (item ->> 'version')::bigint from jsonb_array_elements(public.staff_workspace('aa100000-0000-4000-8000-000000000021')->'workOrders') item where item ->> 'id' = 'aa100000-0000-4000-8000-000000000063'),
    'aa100000-0000-4000-8000-000000000084'
  )$$,
  'travel transition succeeds for the current dispatched assignment'
);
select ok(
  exists (
    select 1 from public.time_entries
    where assignment_id = 'aa100000-0000-4000-8000-000000000064'
      and kind = 'travel' and ends_at is null
  ),
  'travel transition opens one authoritative travel segment'
);
select lives_ok(
  $$select public.transition_work_order(
    'aa100000-0000-4000-8000-000000000063', 'start',
    (select (item ->> 'version')::bigint from jsonb_array_elements(public.staff_workspace('aa100000-0000-4000-8000-000000000021')->'workOrders') item where item ->> 'id' = 'aa100000-0000-4000-8000-000000000063'),
    'aa100000-0000-4000-8000-000000000085'
  )$$,
  'start transition succeeds after travel'
);
select ok(
  exists (
    select 1 from public.time_entries
    where assignment_id = 'aa100000-0000-4000-8000-000000000064'
      and kind = 'travel' and ends_at is not null
  )
  and exists (
    select 1 from public.time_entries
    where assignment_id = 'aa100000-0000-4000-8000-000000000064'
      and kind = 'work' and ends_at is null
  ),
  'starting work closes travel and opens a work segment without overlap'
);
select throws_ok(
  $$select public.transition_work_order(
    'aa100000-0000-4000-8000-000000000063', 'return',
    (select (item ->> 'version')::bigint from jsonb_array_elements(public.staff_workspace('aa100000-0000-4000-8000-000000000021')->'workOrders') item where item ->> 'id' = 'aa100000-0000-4000-8000-000000000063'),
    'aa100000-0000-4000-8000-000000000086', 'unknown_reason', 'FICTITIOUS reason'
  )$$,
  '23514', null,
  'return transition rejects an unknown reason code server-side'
);
select throws_ok(
  $$select public.transition_work_order(
    'aa100000-0000-4000-8000-000000000063', 'return',
    (select (item ->> 'version')::bigint from jsonb_array_elements(public.staff_workspace('aa100000-0000-4000-8000-000000000021')->'workOrders') item where item ->> 'id' = 'aa100000-0000-4000-8000-000000000063'),
    'aa100000-0000-4000-8000-000000000087', 'planning_issue', '  '
  )$$,
  '23514', null,
  'return transition rejects a blank explanation server-side'
);
select throws_ok(
  $$select public.transition_work_order(
    'aa100000-0000-4000-8000-000000000063', 'return',
    (select (item ->> 'version')::bigint from jsonb_array_elements(public.staff_workspace('aa100000-0000-4000-8000-000000000021')->'workOrders') item where item ->> 'id' = 'aa100000-0000-4000-8000-000000000063'),
    'aa100000-0000-4000-8000-000000000088', 'planning_issue', repeat('x', 1001)
  )$$,
  '23514', null,
  'return transition rejects an oversized explanation server-side'
);
select lives_ok(
  $$select public.staff_request_extra_work(
    'aa100000-0000-4000-8000-000000000021',
    '{"workOrderId":"aa100000-0000-4000-8000-000000000063","title":"FICTITIOUS extra window","reason":"FICTITIOUS unexpected extra scope","minutes":35,"amountCents":2500}'::jsonb,
    'aa100000-0000-4000-8000-000000000089'
  )$$,
  'staff can submit bounded free-form extra work for review'
);
select is(
  (public.staff_request_extra_work(
    'aa100000-0000-4000-8000-000000000021',
    '{"workOrderId":"aa100000-0000-4000-8000-000000000063","title":"FICTITIOUS extra window","reason":"FICTITIOUS unexpected extra scope","minutes":35,"amountCents":2500}'::jsonb,
    'aa100000-0000-4000-8000-000000000089'
  ) ->> 'id')::uuid,
  (select (task ->> 'id')::uuid from jsonb_array_elements(public.staff_workspace('aa100000-0000-4000-8000-000000000021')->'workOrderTasks') task where task ->> 'task_name' = 'FICTITIOUS extra window'),
  'an exact extra-work retry returns the original proposal'
);
select ok(
  exists (
    select 1
    from jsonb_array_elements(public.staff_workspace('aa100000-0000-4000-8000-000000000021')->'workOrderTasks') task
    where task ->> 'task_name' = 'FICTITIOUS extra window'
      and task ->> 'extra_work_status' = 'awaiting_review'
      and task ->> 'staff_request_reason' = 'FICTITIOUS unexpected extra scope'
      and (task ->> 'staff_requested_amount_cents')::bigint = 2500
      and not (task ? 'unit_price_cents')
  ),
  'staff DTO shows own proposal evidence without exposing an actual commercial price'
);
select lives_ok(
  $$select public.transition_work_order(
    'aa100000-0000-4000-8000-000000000063', 'stop',
    (select (item ->> 'version')::bigint from jsonb_array_elements(public.staff_workspace('aa100000-0000-4000-8000-000000000021')->'workOrders') item where item ->> 'id' = 'aa100000-0000-4000-8000-000000000063'),
    'aa100000-0000-4000-8000-000000000090'
  )$$,
  'staff stops only its own active assignment before report submission'
);
select lives_ok(
  $$select public.submit_work_order_report(
    'aa100000-0000-4000-8000-000000000063',
    (select (item ->> 'version')::bigint from jsonb_array_elements(public.staff_workspace('aa100000-0000-4000-8000-000000000021')->'workOrders') item where item ->> 'id' = 'aa100000-0000-4000-8000-000000000063'),
    'FICTITIOUS exact customer report',
    'aa100000-0000-4000-8000-000000000091'
  )$$,
  'staff submits an immutable report version after every own segment is closed'
);
reset role;
create temporary table staff_test_current_report on commit drop as
select id, content_hash, snapshot, state
from public.work_order_report_versions
where work_order_id = 'aa100000-0000-4000-8000-000000000063'
order by version desc
limit 1;
grant select on staff_test_current_report to authenticated;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"aa100000-0000-4000-8000-000000000001","session_id":"aa100000-0000-4000-8000-000000000011"}',
  true
);
select ok(
  (
    public.staff_report_signature_preview(
      'aa100000-0000-4000-8000-000000000021',
      (select id from staff_test_current_report),
      (select content_hash from staff_test_current_report)
    ) -> 'snapshot'
  ) = (
    select snapshot from staff_test_current_report
  )
  and (
    public.staff_report_signature_preview(
      'aa100000-0000-4000-8000-000000000021',
      (select id from staff_test_current_report),
      (select content_hash from staff_test_current_report)
    ) ->> 'projection'
  ) = 'customer_copy'
  and jsonb_array_length(
    public.staff_report_signature_preview(
      'aa100000-0000-4000-8000-000000000021',
      (select id from staff_test_current_report),
      (select content_hash from staff_test_current_report)
    ) #> '{snapshot,expenses}'
  ) = 1,
  'signature preview returns the exact hashed customer snapshot including expenses'
);
select throws_ok(
  $$select public.staff_report_signature_preview(
    'aa100000-0000-4000-8000-000000000021',
    (select id from staff_test_current_report),
    repeat('0', 64)
  )$$,
  '42501', null,
  'signature preview fails closed for the wrong content hash'
);
reset role;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"aa100000-0000-4000-8000-000000000003","session_id":"aa100000-0000-4000-8000-000000000013"}',
  true
);
select throws_ok(
  $$select public.staff_report_signature_preview(
    'aa100000-0000-4000-8000-000000000021',
    (select id from staff_test_current_report),
    (select content_hash from staff_test_current_report)
  )$$,
  '42501', null,
  'unassigned staff cannot load another employee customer signature preview'
);
reset role;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"aa100000-0000-4000-8000-000000000001","session_id":"aa100000-0000-4000-8000-000000000011"}',
  true
);
select is(
  public.staff_report_signature_preview_file(
    (select id from staff_test_current_report),
    'aa100000-0000-4000-8000-000000000082',
    (select content_hash from staff_test_current_report)
  ) ->> 'sha256',
  repeat('b', 64),
  'exact signature preview can open an included customer attachment'
);
select throws_ok(
  $$select public.staff_report_signature_preview_file(
    (select id from staff_test_current_report),
    'aa100000-0000-4000-8000-000000000083',
    (select content_hash from staff_test_current_report)
  )$$,
  '42501', null,
  'exact signature preview refuses an internal attachment outside the snapshot'
);
select lives_ok(
  $$select public.staff_report_customer_absent(
    'aa100000-0000-4000-8000-000000000021',
    (select id from staff_test_current_report),
    (select content_hash from staff_test_current_report),
    'FICTITIOUS contact person was absent',
    'aa100000-0000-4000-8000-000000000092'
  )$$,
  'staff records customer absence against the exact waiting report version'
);
reset role;
create temporary table staff_test_customer_absence on commit drop as
select exception_row.id, exception_row.kind, exception_row.description,
       report.state as report_state, work_order.attention_reason
from public.work_order_exceptions exception_row
join public.work_orders work_order
  on work_order.tenant_id = exception_row.tenant_id
 and work_order.id = exception_row.work_order_id
join public.work_order_report_versions report
  on report.tenant_id = work_order.tenant_id
 and report.id = (select id from staff_test_current_report)
where exception_row.work_order_id = 'aa100000-0000-4000-8000-000000000063'
  and exception_row.kind = 'customer_absent';
grant select on staff_test_customer_absence to authenticated;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"aa100000-0000-4000-8000-000000000001","session_id":"aa100000-0000-4000-8000-000000000011"}',
  true
);
select ok(
  (select description = 'FICTITIOUS contact person was absent'
      and report_state = 'waiting_signature'
      and attention_reason = 'customer_absent_signature_followup'
   from staff_test_customer_absence),
  'customer absence keeps the report waiting and creates one planner follow-up'
);
select is(
  (public.staff_report_customer_absent(
    'aa100000-0000-4000-8000-000000000021',
    (select id from staff_test_current_report),
    (select content_hash from staff_test_current_report),
    'FICTITIOUS contact person was absent',
    'aa100000-0000-4000-8000-000000000092'
  ) ->> 'id')::uuid,
  (select id from staff_test_customer_absence),
  'an exact customer-absence retry returns the original follow-up'
);
select throws_ok(
  $$select public.staff_report_customer_absent(
    'aa100000-0000-4000-8000-000000000021',
    (select id from staff_test_current_report),
    repeat('0', 64), 'FICTITIOUS wrong hash',
    'aa100000-0000-4000-8000-000000000093'
  )$$,
  '40001', null,
  'customer absence refuses a stale or mismatched report hash'
);
select ok(
  has_function_privilege('authenticated', 'public.staff_report_signature_preview(uuid,uuid,text)', 'execute')
  and has_function_privilege('authenticated', 'public.staff_report_signature_preview_file(uuid,uuid,text)', 'execute')
  and not has_function_privilege('anon', 'public.staff_report_signature_preview(uuid,uuid,text)', 'execute')
  and not has_function_privilege('anon', 'public.staff_report_signature_preview_file(uuid,uuid,text)', 'execute'),
  'signature preview and its asset boundary are authenticated-only RPCs'
);
reset role;

select set_config('request.jwt.claim.role', 'service_role', true);
update public.tenant_settings
set enabled_services = array['personeel','planning']
where tenant_id = 'aa100000-0000-4000-8000-000000000021';
select set_config('request.jwt.claim.role', '', true);
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"aa100000-0000-4000-8000-000000000001","session_id":"aa100000-0000-4000-8000-000000000011"}',
  true
);
select ok(
  jsonb_array_length(public.staff_workspace('aa100000-0000-4000-8000-000000000021')->'staffMaterials') = 0
  and jsonb_array_length(public.staff_workspace('aa100000-0000-4000-8000-000000000021')->'staffExpenses') = 0,
  'staff workspace withholds material prices and expenses when rapportage is disabled'
);
reset role;
select set_config('request.jwt.claim.role', 'service_role', true);
update public.tenant_settings
set enabled_services = array['personeel','planning','rapportage']
where tenant_id = 'aa100000-0000-4000-8000-000000000021';
select set_config('request.jwt.claim.role', '', true);

update public.work_orders
set status = 'returned', actual_end_at = clock_timestamp()
where id = 'aa100000-0000-4000-8000-000000000063';
update public.work_order_assignments
set status = 'returned', actual_start_at = clock_timestamp() - interval '20 minutes',
    actual_end_at = clock_timestamp(), return_reason_code = 'planning_issue',
    return_note = 'FICTITIOUS returned history'
where id = 'aa100000-0000-4000-8000-000000000064';
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"aa100000-0000-4000-8000-000000000001","session_id":"aa100000-0000-4000-8000-000000000011"}',
  true
);
select ok(
  exists (
    select 1
    from jsonb_array_elements(public.staff_workspace('aa100000-0000-4000-8000-000000000021')->'assignments') assignment
    where assignment->>'id' = 'aa100000-0000-4000-8000-000000000064'
      and assignment->>'status' = 'returned'
      and assignment->>'return_reason_code' = 'planning_issue'
      and assignment->>'actual_start_at' is not null
      and assignment->>'actual_end_at' is not null
  ),
  'returned own assignment remains visible as read-only planning history'
);
reset role;

create temporary table staff_revision_before on commit drop as
select revision
from public.staff_workspace_revisions
where tenant_id = 'aa100000-0000-4000-8000-000000000021';
update public.work_orders
set title = 'FICTITIOUS revision invalidation'
where id = 'aa100000-0000-4000-8000-000000000063';
select ok(
  (select revision from public.staff_workspace_revisions
   where tenant_id = 'aa100000-0000-4000-8000-000000000021')
  > (select revision from staff_revision_before),
  'a relevant source-row change increments the coarse staff workspace revision'
);
select is(
  (
    select count(*)::integer
    from (values
      ('public','tenants'),
      ('public','tenant_settings'),
      ('public','tenant_memberships'),
      ('public','customers'),
      ('public','objects'),
      ('public','work_order_contacts'),
      ('public','personnel'),
      ('public','personnel_functions'),
      ('public','qualifications'),
      ('public','travel_depots'),
      ('public','work_orders'),
      ('public','work_order_assignments'),
      ('public','dispatches'),
      ('public','time_entries'),
      ('public','work_order_tasks'),
      ('public','work_order_task_contributions'),
      ('public','task_catalog'),
      ('public','task_revisions'),
      ('public','report_entries'),
      ('public','attachments'),
      ('public','signatures'),
      ('public','status_events'),
      ('public','availability'),
      ('public','staff_leave_requests'),
      ('public','staff_leave_entitlements'),
      ('public','staff_day_reviews'),
      ('public','staff_time_correction_requests'),
      ('public','work_order_material_usage'),
      ('private','work_order_material_finance'),
      ('public','work_order_expenses'),
      ('public','announcements'),
      ('public','announcement_reads'),
      ('public','open_shifts'),
      ('public','shift_interests'),
      ('public','personnel_documents'),
      ('public','extra_work_rules'),
      ('public','work_order_allowed_extra_work'),
      ('public','travel_legs')
    ) expected(schema_name, table_name)
    where not exists (
      select 1
      from pg_trigger trigger_row
      join pg_class relation on relation.oid = trigger_row.tgrelid
      join pg_namespace namespace on namespace.oid = relation.relnamespace
      join pg_proc procedure on procedure.oid = trigger_row.tgfoid
      join pg_namespace procedure_namespace on procedure_namespace.oid = procedure.pronamespace
      where not trigger_row.tgisinternal
        and namespace.nspname = expected.schema_name
        and relation.relname = expected.table_name
        and procedure_namespace.nspname = 'private'
        and procedure.proname = 'bump_staff_workspace_revision'
    )
  ),
  0,
  'every direct and helper-dependent staff workspace source has a revision trigger'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"aa100000-0000-4000-8000-000000000001","session_id":"aa100000-0000-4000-8000-000000000011"}',
  true
);
select ok(
  (select count(*) = 1
     and bool_and(tenant_id = 'aa100000-0000-4000-8000-000000000021'::uuid)
   from public.staff_workspace_revisions),
  'staff can read only its own tenant coarse revision row'
);
select throws_ok(
  $$update public.staff_workspace_revisions
    set revision = revision + 1
    where tenant_id = 'aa100000-0000-4000-8000-000000000021'$$,
  '42501', null,
  'staff cannot mutate the coarse realtime revision row'
);
reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"aa100000-0000-4000-8000-000000000002","session_id":"aa100000-0000-4000-8000-000000000012"}',
  true
);
select ok(
  (select count(*) = 1
     and bool_and(tenant_id = 'aa100000-0000-4000-8000-000000000021'::uuid)
   from public.staff_workspace_revisions),
  'authorized planning management can read its tenant coarse revision row only'
);
reset role;
select ok(
  has_table_privilege('authenticated', 'public.staff_workspace_revisions', 'select')
  and not has_table_privilege('authenticated', 'public.staff_workspace_revisions', 'insert')
  and not has_table_privilege('authenticated', 'public.staff_workspace_revisions', 'update')
  and not has_table_privilege('anon', 'public.staff_workspace_revisions', 'select'),
  'coarse revision grants are read-only for authenticated staff and closed to anon'
);
select ok(
  exists (
    select 1
    from pg_publication_tables published
    where published.pubname = 'supabase_realtime'
      and published.schemaname = 'public'
      and published.tablename = 'staff_workspace_revisions'
  )
  and not exists (
    select 1
    from pg_publication_tables published
    where published.pubname = 'supabase_realtime'
      and published.schemaname = 'public'
      and published.tablename = any(array[
        'work_orders','work_order_assignments','time_entries','work_order_tasks','report_entries',
        'status_events','availability','staff_leave_requests','staff_leave_entitlements',
        'staff_day_reviews','staff_time_correction_requests','work_order_material_usage',
        'work_order_expenses','announcements','announcement_reads','dispatches','travel_legs'
      ])
  ),
  'only the coarse staff revision signal is published from personnel-app sources'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.review_staff_leave_request(uuid,uuid,text,bigint,text)',
    'execute'
  )
  and not has_function_privilege(
    'anon',
    'public.review_staff_leave_request(uuid,uuid,text,bigint,text)',
    'execute'
  ),
  'leave review RPC is exposed only through authenticated server guards'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.staff_report_entry_command(uuid,text,jsonb,uuid)',
    'execute'
  )
  and not has_function_privilege(
    'anon',
    'public.staff_report_entry_command(uuid,text,jsonb,uuid)',
    'execute'
  ),
  'versioned staff report-entry RPC is exposed only to authenticated callers'
);

select * from finish();
rollback;
