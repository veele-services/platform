-- Apply each statement in its own transaction before notifications-core.sql.
alter type public.delivery_status add value if not exists 'suppressed';
alter type public.delivery_status add value if not exists 'uncertain';
alter type public.delivery_status add value if not exists 'unreachable';
alter type public.delivery_status add value if not exists 'cancelled';
