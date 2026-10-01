-- Postgres Changes cannot apply row authorization after DELETE. Even a primary
-- key is a private resource identifier. Never publish deletes or truncates from
-- this application publication; keep authorized INSERT/UPDATE delivery intact.
-- Staff views already refresh every 20 seconds/on focus and after mutations.
alter publication supabase_realtime set (publish = 'insert, update');
