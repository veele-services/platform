-- Account-wide explanation receipts contain no tenant business data.
create table public.account_guide_dismissals (
 user_id uuid not null references auth.users(id) on delete cascade,
 guide_key text not null check (guide_key = any(array[
    'backoffice.overzicht',
    'backoffice.aanvragen',
    'backoffice.planning',
    'backoffice.werkbonnen',
    'backoffice.taken',
    'backoffice.klanten',
    'backoffice.objecten',
    'backoffice.personeel',
    'backoffice.controle',
    'backoffice.facturen',
    'backoffice.nieuws',
    'backoffice.opvolging',
    'backoffice.instellingen',
    'backoffice.meldingen',
    'backoffice.support',
    'backoffice.notificaties',
    'staff.planning',
    'staff.nieuws',
    'staff.uren',
    'staff.meer',
    'staff.verlof',
    'staff.beschikbaarheid',
    'staff.documenten',
    'staff.instellingen',
    'staff.profiel',
    'staff.tickets',
    'staff.notifications',
    'customer.dashboard',
    'customer.objects',
    'customer.appointments',
    'customer.reports',
    'customer.invoices',
    'customer.services',
    'customer.tickets',
    'customer.news',
    'customer.profile',
    'customer.notifications',
    'customer.more',
    'feature.tasks',
    'feature.checklists',
    'feature.people',
    'feature.travel',
    'feature.time',
    'feature.instructions',
    'feature.notes',
    'feature.files',
    'feature.history',
    'feature.materials',
    'feature.extra',
    'feature.related',
    'feature.costs',
    'feature.delivery',
    'feature.signature',
    'feature.review',
    'feature.customer-report',
    'feature.invoice',
    'feature.payment',
    'feature.contacts',
    'feature.templates',
    'feature.categories',
    'feature.branding',
    'feature.account-setup',
    'feature.customer-visit',
    'feature.customer-object',
    'feature.customer-request'
 ]::text[])),
 dismissed_at timestamptz not null default clock_timestamp(),
 primary key(user_id,guide_key)
);
alter table public.account_guide_dismissals enable row level security;
alter table public.account_guide_dismissals force row level security;
revoke all on public.account_guide_dismissals from public,anon,authenticated,service_role;
grant select on public.account_guide_dismissals to authenticated;
create policy account_guide_own_read on public.account_guide_dismissals for select to authenticated
using (user_id=auth.uid() and private.object_session_active());
create function public.account_guide_state() returns text[]
language plpgsql stable security definer set search_path='' as $function$
begin
 if not private.object_session_active() then raise exception 'Log opnieuw in' using errcode='42501';end if;
 return array(select g.guide_key from public.account_guide_dismissals g where g.user_id=auth.uid() order by g.guide_key);
end $function$;
create function public.dismiss_account_guide(guide_key text) returns void
language plpgsql security definer set search_path='' as $function$
begin
 if not private.object_session_active() then raise exception 'Log opnieuw in' using errcode='42501';end if;
 -- Fixed-key constraint and session-derived actor; no caller account parameter.
 insert into public.account_guide_dismissals(user_id,guide_key) values(auth.uid(),guide_key)
 on conflict on constraint account_guide_dismissals_pkey do nothing;
end $function$;
revoke all on function public.account_guide_state() from public,anon,service_role;
revoke all on function public.dismiss_account_guide(text) from public,anon,service_role;
grant execute on function public.account_guide_state(),public.dismiss_account_guide(text) to authenticated;
