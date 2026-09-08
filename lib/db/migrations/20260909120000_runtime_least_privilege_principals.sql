-- ============================================================================
-- Fieldflow Calm W00: dedicated least-privilege runtime principals.
--
-- The application login owns no database objects and cannot bypass RLS. Its
-- only inherited role is the NOLOGIN capability role whose exact relation,
-- sequence and function surface is recorded below. Runtime-only RLS policies
-- are deliberately permissive inside that capability boundary because the
-- existing server call sites bind and authorize tenant identifiers; the role
-- is never exposed to a browser or user-controlled PostgreSQL session.
--
-- Forward-only rollback reasoning: disable LOGIN on fieldgrid_runtime_app to
-- stop new runtime sessions, restore the previous server connection secret,
-- and add a later migration for any ACL correction. Do not drop these roles,
-- edit this migration, weaken FORCE RLS, or restore ambient PUBLIC EXECUTE.
-- ============================================================================

DO $fieldgrid_runtime_roles$
DECLARE
  parent_role record;
  member_role record;
BEGIN
  IF current_user IN ('fieldgrid_runtime_app', 'fieldgrid_runtime_data') THEN
    RAISE EXCEPTION 'Runtime principals may not execute database migrations';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'fieldgrid_runtime_data'
  ) THEN
    CREATE ROLE fieldgrid_runtime_data
      NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE
      NOINHERIT NOREPLICATION NOBYPASSRLS PASSWORD NULL;
  ELSE
    IF EXISTS (
      SELECT 1
      FROM pg_catalog.pg_roles
      WHERE rolname = 'fieldgrid_runtime_data'
        AND (rolsuper OR rolreplication OR rolbypassrls)
    ) THEN
      RAISE EXCEPTION
        'Existing runtime data role has privileged attributes that a non-superuser migration admin cannot safely repair';
    END IF;
    ALTER ROLE fieldgrid_runtime_data
      NOLOGIN NOCREATEDB NOCREATEROLE NOINHERIT PASSWORD NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'fieldgrid_runtime_app'
  ) THEN
    CREATE ROLE fieldgrid_runtime_app
      NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE
      INHERIT NOREPLICATION NOBYPASSRLS PASSWORD NULL;
  ELSE
    IF EXISTS (
      SELECT 1
      FROM pg_catalog.pg_roles
      WHERE rolname = 'fieldgrid_runtime_app'
        AND (rolsuper OR rolreplication OR rolbypassrls)
    ) THEN
      RAISE EXCEPTION
        'Existing runtime app role has privileged attributes that a non-superuser migration admin cannot safely repair';
    END IF;
    -- Preserve LOGIN/password when an already-provisioned environment replays
    -- this idempotent migration; provisioning is a separate exact-SHA action.
    ALTER ROLE fieldgrid_runtime_app
      NOCREATEDB NOCREATEROLE INHERIT;
  END IF;

  FOR parent_role IN
    SELECT parent.rolname
    FROM pg_catalog.pg_auth_members membership
    JOIN pg_catalog.pg_roles member
      ON member.oid = membership.member
    JOIN pg_catalog.pg_roles parent
      ON parent.oid = membership.roleid
    WHERE member.rolname = 'fieldgrid_runtime_data'
  LOOP
    EXECUTE pg_catalog.format(
      'REVOKE %I FROM fieldgrid_runtime_data',
      parent_role.rolname
    );
  END LOOP;

  FOR parent_role IN
    SELECT parent.rolname
    FROM pg_catalog.pg_auth_members membership
    JOIN pg_catalog.pg_roles member
      ON member.oid = membership.member
    JOIN pg_catalog.pg_roles parent
      ON parent.oid = membership.roleid
    WHERE member.rolname = 'fieldgrid_runtime_app'
      AND parent.rolname <> 'fieldgrid_runtime_data'
  LOOP
    EXECUTE pg_catalog.format(
      'REVOKE %I FROM fieldgrid_runtime_app',
      parent_role.rolname
    );
  END LOOP;

  -- PostgreSQL 16+ automatically grants a non-superuser CREATEROLE creator
  -- ADMIN membership in each role it creates. That bootstrap grant is issued
  -- by the bootstrap superuser and cannot be rewritten by the creator. Keep
  -- exactly that non-inheriting/non-SET admin edge plus the app capability
  -- edge; remove every other data-role member.
  FOR member_role IN
    SELECT member.rolname
    FROM pg_catalog.pg_auth_members membership
    JOIN pg_catalog.pg_roles member ON member.oid = membership.member
    JOIN pg_catalog.pg_roles parent ON parent.oid = membership.roleid
    WHERE parent.rolname = 'fieldgrid_runtime_data'
      AND member.rolname NOT IN ('fieldgrid_runtime_app', current_user)
  LOOP
    EXECUTE pg_catalog.format(
      'REVOKE fieldgrid_runtime_data FROM %I',
      member_role.rolname
    );
  END LOOP;

  -- The trusted migration principal is the sole administrator/member of the
  -- LOGIN role. Membership direction never gives runtime the admin's powers.
  FOR member_role IN
    SELECT member.rolname
    FROM pg_catalog.pg_auth_members membership
    JOIN pg_catalog.pg_roles member ON member.oid = membership.member
    JOIN pg_catalog.pg_roles parent ON parent.oid = membership.roleid
    WHERE parent.rolname = 'fieldgrid_runtime_app'
      AND member.rolname <> current_user
  LOOP
    EXECUTE pg_catalog.format(
      'REVOKE fieldgrid_runtime_app FROM %I',
      member_role.rolname
    );
  END LOOP;

  IF current_setting('server_version_num')::integer >= 160000 THEN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_catalog.pg_auth_members membership
      JOIN pg_catalog.pg_roles parent ON parent.oid = membership.roleid
      JOIN pg_catalog.pg_roles member ON member.oid = membership.member
      WHERE parent.rolname = 'fieldgrid_runtime_app'
        AND member.rolname = current_user
        AND membership.admin_option
    ) THEN
      IF (SELECT rolsuper FROM pg_catalog.pg_roles WHERE rolname = current_user) THEN
        EXECUTE pg_catalog.format(
          'GRANT fieldgrid_runtime_app TO %I '
          'WITH INHERIT FALSE, SET FALSE, ADMIN TRUE',
          current_user
        );
      ELSE
        RAISE EXCEPTION
          'Migration admin lacks its PostgreSQL bootstrap ADMIN grant on runtime app';
      END IF;
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_catalog.pg_auth_members membership
      JOIN pg_catalog.pg_roles parent ON parent.oid = membership.roleid
      JOIN pg_catalog.pg_roles member ON member.oid = membership.member
      WHERE parent.rolname = 'fieldgrid_runtime_data'
        AND member.rolname = current_user
        AND membership.admin_option
    ) THEN
      IF (SELECT rolsuper FROM pg_catalog.pg_roles WHERE rolname = current_user) THEN
        EXECUTE pg_catalog.format(
          'GRANT fieldgrid_runtime_data TO %I '
          'WITH INHERIT FALSE, SET FALSE, ADMIN TRUE',
          current_user
        );
      ELSE
        RAISE EXCEPTION
          'Migration admin lacks its PostgreSQL bootstrap ADMIN grant on runtime data';
      END IF;
    END IF;

    EXECUTE
      'GRANT fieldgrid_runtime_data TO fieldgrid_runtime_app '
      'WITH INHERIT TRUE, SET FALSE, ADMIN FALSE';
  ELSE
    GRANT fieldgrid_runtime_data TO fieldgrid_runtime_app;
    EXECUTE pg_catalog.format(
      'GRANT fieldgrid_runtime_app TO %I WITH ADMIN OPTION',
      current_user
    );
    EXECUTE pg_catalog.format(
      'GRANT fieldgrid_runtime_data TO %I WITH ADMIN OPTION',
      current_user
    );
  END IF;
END;
$fieldgrid_runtime_roles$;

ALTER ROLE fieldgrid_runtime_app SET row_security = on;
ALTER ROLE fieldgrid_runtime_app SET search_path = pg_catalog, public;

CREATE SCHEMA IF NOT EXISTS app_private;
-- Function PUBLIC EXECUTE is a global PostgreSQL default; a schema-scoped
-- REVOKE cannot override it. Revoke it globally for the migration owner, then
-- grant every browser/service/runtime function explicitly below.
ALTER DEFAULT PRIVILEGES FOR ROLE current_user
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
REVOKE CREATE ON SCHEMA public FROM fieldgrid_runtime_data, fieldgrid_runtime_app;
REVOKE ALL PRIVILEGES ON SCHEMA app_private
  FROM fieldgrid_runtime_data, fieldgrid_runtime_app;
GRANT USAGE ON SCHEMA public TO fieldgrid_runtime_data;
GRANT USAGE ON SCHEMA app_private TO fieldgrid_runtime_data;
REVOKE USAGE ON SCHEMA auth FROM fieldgrid_runtime_data, fieldgrid_runtime_app;

CREATE TABLE IF NOT EXISTS app_private.fieldgrid_runtime_principal_configuration (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  migration_admin name NOT NULL,
  app_admin_grantor name NOT NULL,
  data_admin_grantor name NOT NULL
);
ALTER TABLE app_private.fieldgrid_runtime_principal_configuration
  ADD COLUMN IF NOT EXISTS app_admin_grantor name;
ALTER TABLE app_private.fieldgrid_runtime_principal_configuration
  ADD COLUMN IF NOT EXISTS data_admin_grantor name;

INSERT INTO app_private.fieldgrid_runtime_principal_configuration (
  singleton, migration_admin, app_admin_grantor, data_admin_grantor
) VALUES (
  true,
  current_user,
  (
    SELECT grantor.rolname
    FROM pg_catalog.pg_auth_members membership
    JOIN pg_catalog.pg_roles parent ON parent.oid = membership.roleid
    JOIN pg_catalog.pg_roles member ON member.oid = membership.member
    JOIN pg_catalog.pg_roles grantor ON grantor.oid = membership.grantor
    WHERE parent.rolname = 'fieldgrid_runtime_app'
      AND member.rolname = current_user
      AND membership.admin_option
  ),
  (
    SELECT grantor.rolname
    FROM pg_catalog.pg_auth_members membership
    JOIN pg_catalog.pg_roles parent ON parent.oid = membership.roleid
    JOIN pg_catalog.pg_roles member ON member.oid = membership.member
    JOIN pg_catalog.pg_roles grantor ON grantor.oid = membership.grantor
    WHERE parent.rolname = 'fieldgrid_runtime_data'
      AND member.rolname = current_user
      AND membership.admin_option
  )
)
ON CONFLICT (singleton) DO UPDATE
SET migration_admin = excluded.migration_admin,
    app_admin_grantor = excluded.app_admin_grantor,
    data_admin_grantor = excluded.data_admin_grantor;
ALTER TABLE app_private.fieldgrid_runtime_principal_configuration
  ALTER COLUMN app_admin_grantor SET NOT NULL,
  ALTER COLUMN data_admin_grantor SET NOT NULL;

CREATE TABLE IF NOT EXISTS app_private.fieldgrid_runtime_relation_capabilities (
  schema_name name NOT NULL,
  relation_name name NOT NULL,
  access_mode text NOT NULL CHECK (
    access_mode IN ('direct', 'indirect', 'function_only', 'unused')
  ),
  privileges text[] NOT NULL,
  source_migration text NOT NULL DEFAULT
    '20260909120000_runtime_least_privilege_principals.sql',
  PRIMARY KEY (schema_name, relation_name),
  CHECK (privileges <@ ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE']::text[]),
  CHECK (
    (access_mode IN ('direct', 'indirect') AND cardinality(privileges) > 0)
    OR (access_mode IN ('function_only', 'unused') AND cardinality(privileges) = 0)
  )
);

CREATE TABLE IF NOT EXISTS app_private.fieldgrid_runtime_function_capabilities (
  schema_name name NOT NULL,
  function_name name NOT NULL,
  argument_types text NOT NULL,
  access_mode text NOT NULL CHECK (
    access_mode IN ('direct', 'default_expression', 'trigger_dependency')
  ),
  source_migration text NOT NULL DEFAULT
    '20260909120000_runtime_least_privilege_principals.sql',
  PRIMARY KEY (schema_name, function_name, argument_types)
);

CREATE TABLE IF NOT EXISTS app_private.fieldgrid_runtime_sequence_capabilities (
  schema_name name NOT NULL,
  sequence_name name NOT NULL,
  access_mode text NOT NULL CHECK (
    access_mode IN ('trigger_dependency', 'function_only')
  ),
  privileges text[] NOT NULL,
  source_migration text NOT NULL DEFAULT
    '20260909120000_runtime_least_privilege_principals.sql',
  PRIMARY KEY (schema_name, sequence_name),
  CHECK (privileges <@ ARRAY['SELECT', 'UPDATE', 'USAGE']::text[]),
  CHECK (
    (access_mode = 'trigger_dependency' AND cardinality(privileges) > 0)
    OR (access_mode = 'function_only' AND cardinality(privileges) = 0)
  )
);

REVOKE ALL PRIVILEGES
ON TABLE
  app_private.fieldgrid_runtime_relation_capabilities,
  app_private.fieldgrid_runtime_function_capabilities,
  app_private.fieldgrid_runtime_sequence_capabilities,
  app_private.fieldgrid_runtime_principal_configuration
FROM PUBLIC, anon, authenticated, service_role,
  fieldgrid_runtime_data, fieldgrid_runtime_app;

-- Delete only this migration's declarations. Later forward migrations extend
-- the same registry and must survive a deliberate idempotency replay.
DELETE FROM app_private.fieldgrid_runtime_relation_capabilities
WHERE source_migration =
  '20260909120000_runtime_least_privilege_principals.sql';
INSERT INTO app_private.fieldgrid_runtime_relation_capabilities (
  schema_name, relation_name, access_mode, privileges
) VALUES
  ('public', 'assignment_candidates', 'direct', ARRAY['SELECT', 'INSERT', 'UPDATE']::text[]),
  ('public', 'assignment_capacity_checks', 'direct', ARRAY['SELECT', 'INSERT', 'UPDATE']::text[]),
  ('public', 'assignment_checklist_answers', 'direct', ARRAY['SELECT', 'INSERT', 'UPDATE']::text[]),
  ('public', 'assignment_checklist_evidence', 'direct', ARRAY['SELECT', 'INSERT']::text[]),
  ('public', 'assignment_checklist_sources', 'direct', ARRAY['SELECT', 'INSERT', 'UPDATE']::text[]),
  ('public', 'assignment_checklists', 'direct', ARRAY['SELECT', 'INSERT', 'UPDATE']::text[]),
  ('public', 'assignment_code_sequences', 'indirect', ARRAY['SELECT', 'INSERT', 'UPDATE']::text[]),
  ('public', 'assignment_extra_work', 'direct', ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE']::text[]),
  ('public', 'assignment_interest_responses', 'direct', ARRAY['SELECT', 'INSERT', 'UPDATE']::text[]),
  ('public', 'assignment_interest_rounds', 'direct', ARRAY['SELECT', 'INSERT', 'UPDATE']::text[]),
  ('public', 'assignment_inventory_items', 'direct', ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE']::text[]),
  ('public', 'assignment_material_usage', 'direct', ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE']::text[]),
  ('public', 'assignment_participant_executions', 'direct', ARRAY['SELECT']::text[]),
  ('public', 'assignment_personnel', 'direct', ARRAY['SELECT', 'INSERT', 'UPDATE']::text[]),
  ('public', 'assignment_personnel_lifecycle_history', 'function_only', ARRAY[]::text[]),
  ('public', 'assignment_photos', 'direct', ARRAY['SELECT', 'INSERT', 'DELETE']::text[]),
  ('public', 'assignment_report_note_attachments', 'direct', ARRAY['SELECT', 'INSERT']::text[]),
  ('public', 'assignment_report_notes', 'direct', ARRAY['SELECT', 'INSERT']::text[]),
  ('public', 'assignment_required_regions', 'direct', ARRAY['SELECT', 'INSERT', 'DELETE']::text[]),
  ('public', 'assignment_route_cache', 'direct', ARRAY['SELECT', 'INSERT', 'UPDATE']::text[]),
  ('public', 'assignment_route_contexts', 'direct', ARRAY['SELECT', 'INSERT', 'DELETE']::text[]),
  ('public', 'assignment_tasks', 'direct', ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE']::text[]),
  ('public', 'assignments', 'direct', ARRAY['SELECT', 'INSERT', 'UPDATE']::text[]),
  ('public', 'audit_log', 'direct', ARRAY['SELECT', 'INSERT']::text[]),
  ('public', 'availability_day_entries', 'direct', ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE']::text[]),
  ('public', 'availability_windows', 'direct', ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE']::text[]),
  ('public', 'checklist_bindings', 'direct', ARRAY['SELECT', 'INSERT', 'UPDATE']::text[]),
  ('public', 'checklist_configuration_warnings', 'direct', ARRAY['SELECT', 'INSERT', 'UPDATE']::text[]),
  ('public', 'checklist_reconciliation_events', 'direct', ARRAY['SELECT', 'INSERT', 'UPDATE']::text[]),
  ('public', 'checklist_template_versions', 'direct', ARRAY['SELECT', 'INSERT', 'UPDATE']::text[]),
  ('public', 'checklist_templates', 'direct', ARRAY['SELECT', 'INSERT', 'UPDATE']::text[]),
  ('public', 'checklist_waivers', 'direct', ARRAY['INSERT']::text[]),
  ('public', 'code_sequences', 'indirect', ARRAY['SELECT', 'UPDATE']::text[]),
  ('public', 'credential_recovery_challenges', 'direct', ARRAY['SELECT', 'INSERT', 'UPDATE']::text[]),
  ('public', 'credential_recovery_events', 'direct', ARRAY['SELECT', 'INSERT']::text[]),
  ('public', 'customer_contacts', 'direct', ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE']::text[]),
  ('public', 'customer_message_entries', 'direct', ARRAY['SELECT', 'INSERT', 'UPDATE']::text[]),
  ('public', 'customer_message_threads', 'direct', ARRAY['SELECT', 'INSERT', 'UPDATE']::text[]),
  ('public', 'customer_notes', 'direct', ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE']::text[]),
  ('public', 'customer_notifications', 'direct', ARRAY['SELECT', 'INSERT', 'UPDATE']::text[]),
  ('public', 'customer_payment_batch_items', 'direct', ARRAY['SELECT', 'INSERT']::text[]),
  ('public', 'customer_payment_batches', 'direct', ARRAY['SELECT', 'INSERT', 'UPDATE']::text[]),
  ('public', 'customer_portal_preferences', 'direct', ARRAY['SELECT', 'INSERT', 'UPDATE']::text[]),
  ('public', 'customer_regions', 'unused', ARRAY[]::text[]),
  ('public', 'customer_types', 'direct', ARRAY['SELECT', 'INSERT', 'UPDATE']::text[]),
  ('public', 'customer_users', 'direct', ARRAY['SELECT', 'INSERT', 'UPDATE']::text[]),
  ('public', 'customers', 'direct', ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE']::text[]),
  ('public', 'documents', 'direct', ARRAY['SELECT', 'INSERT', 'DELETE']::text[]),
  ('public', 'domain_events', 'direct', ARRAY['SELECT', 'INSERT', 'UPDATE']::text[]),
  ('public', 'dossier_events', 'direct', ARRAY['SELECT', 'INSERT']::text[]),
  ('public', 'dossier_notes', 'direct', ARRAY['SELECT', 'INSERT']::text[]),
  ('public', 'dossier_profiles', 'direct', ARRAY['SELECT', 'UPDATE']::text[]),
  ('public', 'dossier_tasks', 'direct', ARRAY['SELECT', 'INSERT', 'UPDATE']::text[]),
  ('public', 'email_delivery_log', 'direct', ARRAY['SELECT', 'INSERT']::text[]),
  ('public', 'google_maps_autocomplete_sessions', 'direct', ARRAY['SELECT', 'INSERT', 'DELETE']::text[]),
  ('public', 'google_maps_rate_limit_buckets', 'direct', ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE']::text[]),
  ('public', 'google_maps_usage_events', 'direct', ARRAY['SELECT', 'INSERT']::text[]),
  ('public', 'inventory_categories', 'direct', ARRAY['SELECT', 'INSERT', 'UPDATE']::text[]),
  ('public', 'inventory_issues', 'direct', ARRAY['SELECT', 'INSERT', 'UPDATE']::text[]),
  ('public', 'inventory_items', 'direct', ARRAY['SELECT', 'INSERT', 'UPDATE']::text[]),
  ('public', 'inventory_maintenance_events', 'direct', ARRAY['SELECT', 'INSERT']::text[]),
  ('public', 'inventory_movements', 'direct', ARRAY['SELECT', 'INSERT']::text[]),
  ('public', 'invoice_line_item_snapshots', 'direct', ARRAY['SELECT', 'INSERT']::text[]),
  ('public', 'invoice_number_sequences', 'direct', ARRAY['SELECT', 'INSERT', 'UPDATE']::text[]),
  ('public', 'invoice_numbering_settings', 'direct', ARRAY['SELECT', 'INSERT', 'UPDATE']::text[]),
  ('public', 'invoice_payment_settings', 'direct', ARRAY['SELECT', 'INSERT', 'UPDATE']::text[]),
  ('public', 'invoice_template_settings', 'direct', ARRAY['SELECT', 'INSERT', 'UPDATE']::text[]),
  ('public', 'invoices', 'direct', ARRAY['SELECT', 'INSERT', 'UPDATE']::text[]),
  ('public', 'kb_article_audiences', 'direct', ARRAY['SELECT', 'INSERT', 'DELETE']::text[]),
  ('public', 'kb_article_feedback', 'direct', ARRAY['SELECT', 'INSERT']::text[]),
  ('public', 'kb_article_media', 'direct', ARRAY['SELECT', 'INSERT']::text[]),
  ('public', 'kb_article_modules', 'direct', ARRAY['SELECT', 'INSERT', 'DELETE']::text[]),
  ('public', 'kb_article_permissions', 'direct', ARRAY['SELECT', 'INSERT', 'DELETE']::text[]),
  ('public', 'kb_article_related', 'direct', ARRAY['SELECT', 'INSERT', 'DELETE']::text[]),
  ('public', 'kb_article_versions', 'direct', ARRAY['SELECT', 'INSERT']::text[]),
  ('public', 'kb_articles', 'direct', ARRAY['SELECT', 'INSERT', 'UPDATE']::text[]),
  ('public', 'kb_categories', 'direct', ARRAY['SELECT', 'INSERT', 'UPDATE']::text[]),
  ('public', 'kb_search_events', 'direct', ARRAY['SELECT', 'INSERT']::text[]),
  ('public', 'kb_search_terms', 'direct', ARRAY['SELECT', 'INSERT', 'DELETE']::text[]),
  ('public', 'kb_tooltip_audiences', 'direct', ARRAY['SELECT', 'INSERT', 'DELETE']::text[]),
  ('public', 'kb_tooltip_related_articles', 'direct', ARRAY['SELECT', 'INSERT', 'DELETE']::text[]),
  ('public', 'kb_tooltips', 'direct', ARRAY['SELECT', 'INSERT', 'UPDATE']::text[]),
  ('public', 'leave_periods', 'direct', ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE']::text[]),
  ('public', 'material_categories', 'direct', ARRAY['SELECT', 'INSERT', 'UPDATE']::text[]),
  ('public', 'material_stock_balances', 'direct', ARRAY['SELECT', 'INSERT', 'UPDATE']::text[]),
  ('public', 'material_stock_movements', 'direct', ARRAY['SELECT', 'INSERT']::text[]),
  ('public', 'materials', 'direct', ARRAY['SELECT', 'INSERT', 'UPDATE']::text[]),
  ('public', 'module_dependencies', 'direct', ARRAY['SELECT']::text[]),
  ('public', 'modules', 'direct', ARRAY['SELECT']::text[]),
  ('public', 'native_push_device_tokens', 'direct', ARRAY['SELECT', 'INSERT', 'UPDATE']::text[]),
  ('public', 'news_post_targets', 'direct', ARRAY['SELECT', 'INSERT', 'DELETE']::text[]),
  ('public', 'news_posts', 'direct', ARRAY['SELECT', 'INSERT', 'UPDATE']::text[]),
  ('public', 'notification_delivery_attempts', 'direct', ARRAY['SELECT', 'INSERT', 'UPDATE']::text[]),
  ('public', 'notification_delivery_queue', 'direct', ARRAY['SELECT', 'INSERT', 'UPDATE']::text[]),
  ('public', 'notification_dispatches', 'direct', ARRAY['SELECT', 'INSERT', 'UPDATE']::text[]),
  ('public', 'notification_event_settings', 'direct', ARRAY['SELECT', 'UPDATE']::text[]),
  ('public', 'object_contacts', 'direct', ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE']::text[]),
  ('public', 'object_personnel', 'direct', ARRAY['SELECT', 'INSERT', 'DELETE']::text[]),
  ('public', 'object_regions', 'direct', ARRAY['SELECT', 'INSERT', 'DELETE']::text[]),
  ('public', 'object_security_access_audit', 'direct', ARRAY['INSERT']::text[]),
  ('public', 'object_security_challenges', 'direct', ARRAY['SELECT', 'INSERT', 'UPDATE']::text[]),
  ('public', 'object_security_object_revisions', 'direct', ARRAY['SELECT']::text[]),
  ('public', 'object_security_records', 'direct', ARRAY['SELECT', 'INSERT', 'UPDATE']::text[]),
  ('public', 'object_security_unlock_sessions', 'direct', ARRAY['SELECT', 'INSERT', 'UPDATE']::text[]),
  ('public', 'objects', 'direct', ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE']::text[]),
  ('public', 'offline_operation_receipts', 'function_only', ARRAY[]::text[]),
  ('public', 'organization_settings', 'direct', ARRAY['SELECT', 'INSERT', 'UPDATE']::text[]),
  ('public', 'payment_allocations', 'direct', ARRAY['SELECT', 'INSERT']::text[]),
  ('public', 'payments', 'direct', ARRAY['SELECT', 'INSERT', 'UPDATE']::text[]),
  ('public', 'permissions', 'direct', ARRAY['SELECT']::text[]),
  ('public', 'personnel', 'direct', ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE']::text[]),
  ('public', 'personnel_message_entries', 'direct', ARRAY['SELECT', 'INSERT', 'UPDATE']::text[]),
  ('public', 'personnel_message_threads', 'direct', ARRAY['SELECT', 'INSERT', 'UPDATE']::text[]),
  ('public', 'personnel_notifications', 'direct', ARRAY['SELECT', 'INSERT', 'UPDATE']::text[]),
  ('public', 'personnel_qualifications', 'direct', ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE']::text[]),
  ('public', 'personnel_regions', 'direct', ARRAY['SELECT', 'INSERT', 'DELETE']::text[]),
  ('public', 'plan_limits', 'direct', ARRAY['SELECT']::text[]),
  ('public', 'plan_modules', 'direct', ARRAY['SELECT']::text[]),
  ('public', 'planning_sector_rules', 'direct', ARRAY['SELECT', 'INSERT', 'UPDATE']::text[]),
  ('public', 'plans', 'direct', ARRAY['SELECT']::text[]),
  ('public', 'platform_email_providers', 'direct', ARRAY['SELECT', 'INSERT', 'UPDATE']::text[]),
  ('public', 'platform_notification_dispatches', 'direct', ARRAY['SELECT', 'INSERT']::text[]),
  ('public', 'platform_notification_recipients', 'direct', ARRAY['INSERT']::text[]),
  ('public', 'platform_theme_settings', 'direct', ARRAY['SELECT', 'INSERT', 'UPDATE']::text[]),
  ('public', 'platform_ticket_notes', 'direct', ARRAY['SELECT', 'INSERT']::text[]),
  ('public', 'platform_tickets', 'direct', ARRAY['SELECT', 'INSERT', 'UPDATE']::text[]),
  ('public', 'platform_users', 'direct', ARRAY['SELECT', 'INSERT', 'UPDATE']::text[]),
  ('public', 'portal_notification_preferences', 'direct', ARRAY['SELECT', 'INSERT', 'UPDATE']::text[]),
  ('public', 'portal_onboarding_sessions', 'direct', ARRAY['SELECT', 'INSERT', 'UPDATE']::text[]),
  ('public', 'portal_onboarding_step_completions', 'direct', ARRAY['SELECT', 'INSERT', 'UPDATE']::text[]),
  ('public', 'portal_realtime_events', 'function_only', ARRAY[]::text[]),
  ('public', 'push_subscriptions', 'direct', ARRAY['SELECT', 'INSERT', 'UPDATE']::text[]),
  ('public', 'qualification_items', 'direct', ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE']::text[]),
  ('public', 'quotes', 'direct', ARRAY['SELECT', 'INSERT', 'UPDATE']::text[]),
  ('public', 'release_audiences', 'direct', ARRAY['SELECT', 'INSERT', 'DELETE']::text[]),
  ('public', 'release_categories', 'direct', ARRAY['SELECT', 'INSERT', 'UPDATE']::text[]),
  ('public', 'release_dismissals', 'direct', ARRAY['SELECT', 'INSERT']::text[]),
  ('public', 'release_highlights', 'direct', ARRAY['SELECT', 'INSERT']::text[]),
  ('public', 'release_items', 'direct', ARRAY['SELECT', 'INSERT', 'DELETE']::text[]),
  ('public', 'release_media', 'direct', ARRAY['SELECT', 'INSERT']::text[]),
  ('public', 'release_modules', 'direct', ARRAY['SELECT', 'INSERT', 'DELETE']::text[]),
  ('public', 'release_read_receipts', 'direct', ARRAY['SELECT', 'INSERT']::text[]),
  ('public', 'release_roadmap_links', 'direct', ARRAY['SELECT', 'INSERT', 'DELETE']::text[]),
  ('public', 'release_ticket_links', 'unused', ARRAY[]::text[]),
  ('public', 'releases', 'direct', ARRAY['SELECT', 'INSERT', 'UPDATE']::text[]),
  ('public', 'reports', 'direct', ARRAY['SELECT', 'INSERT', 'UPDATE']::text[]),
  ('public', 'roadmap_item_audiences', 'direct', ARRAY['SELECT', 'INSERT', 'DELETE']::text[]),
  ('public', 'roadmap_item_comments', 'direct', ARRAY['SELECT', 'INSERT']::text[]),
  ('public', 'roadmap_item_modules', 'direct', ARRAY['SELECT', 'INSERT', 'DELETE']::text[]),
  ('public', 'roadmap_item_status_history', 'direct', ARRAY['SELECT', 'INSERT']::text[]),
  ('public', 'roadmap_item_tenant_links', 'direct', ARRAY['SELECT', 'INSERT']::text[]),
  ('public', 'roadmap_item_ticket_links', 'unused', ARRAY[]::text[]),
  ('public', 'roadmap_item_votes', 'direct', ARRAY['SELECT', 'INSERT', 'DELETE']::text[]),
  ('public', 'roadmap_items', 'direct', ARRAY['SELECT', 'INSERT', 'UPDATE']::text[]),
  ('public', 'role_permissions', 'direct', ARRAY['SELECT', 'INSERT', 'DELETE']::text[]),
  ('public', 'role_qualifications', 'direct', ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE']::text[]),
  ('public', 'roles', 'direct', ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE']::text[]),
  ('public', 'sectors', 'direct', ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE']::text[]),
  ('public', 'sensitive_access_grants', 'direct', ARRAY['SELECT', 'INSERT', 'UPDATE']::text[]),
  ('public', 'sensitive_access_requests', 'direct', ARRAY['SELECT', 'INSERT', 'UPDATE']::text[]),
  ('public', 'stock_locations', 'direct', ARRAY['SELECT', 'INSERT']::text[]),
  ('public', 'support_access_audit_log', 'direct', ARRAY['SELECT', 'INSERT']::text[]),
  ('public', 'support_access_grants', 'direct', ARRAY['SELECT', 'INSERT', 'UPDATE']::text[]),
  ('public', 'task_code_qualifications', 'direct', ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE']::text[]),
  ('public', 'task_codes', 'direct', ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE']::text[]),
  ('public', 'tenant_company_settings', 'direct', ARRAY['SELECT', 'INSERT', 'UPDATE']::text[]),
  ('public', 'tenant_domain_checks', 'direct', ARRAY['SELECT', 'INSERT']::text[]),
  ('public', 'tenant_domains', 'direct', ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE']::text[]),
  ('public', 'tenant_email_template_overrides', 'direct', ARRAY['SELECT']::text[]),
  ('public', 'tenant_first_run_state', 'direct', ARRAY['SELECT', 'INSERT', 'UPDATE']::text[]),
  ('public', 'tenant_modules', 'direct', ARRAY['SELECT', 'INSERT', 'UPDATE']::text[]),
  ('public', 'tenant_owner_invites', 'direct', ARRAY['SELECT', 'INSERT', 'UPDATE']::text[]),
  ('public', 'tenant_provisioning_runs', 'direct', ARRAY['SELECT', 'INSERT', 'UPDATE']::text[]),
  ('public', 'tenant_regions', 'direct', ARRAY['SELECT', 'INSERT']::text[]),
  ('public', 'tenant_role_permissions', 'direct', ARRAY['SELECT', 'INSERT', 'DELETE']::text[]),
  ('public', 'tenant_roles', 'direct', ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE']::text[]),
  ('public', 'tenant_sector_settings', 'direct', ARRAY['SELECT', 'INSERT', 'UPDATE']::text[]),
  ('public', 'tenant_sectors', 'direct', ARRAY['SELECT', 'INSERT', 'UPDATE']::text[]),
  ('public', 'tenant_sequences', 'direct', ARRAY['SELECT', 'INSERT', 'UPDATE']::text[]),
  ('public', 'tenant_subscriptions', 'direct', ARRAY['SELECT', 'INSERT', 'UPDATE']::text[]),
  ('public', 'tenant_task_code_prices', 'direct', ARRAY['SELECT']::text[]),
  ('public', 'tenant_task_codes', 'direct', ARRAY['SELECT']::text[]),
  ('public', 'tenant_theme_settings', 'direct', ARRAY['SELECT', 'INSERT', 'UPDATE']::text[]),
  ('public', 'tenant_user_roles', 'direct', ARRAY['SELECT', 'INSERT', 'DELETE']::text[]),
  ('public', 'tenant_users', 'direct', ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE']::text[]),
  ('public', 'tenants', 'direct', ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE']::text[]),
  ('public', 'user_roles', 'direct', ARRAY['SELECT', 'INSERT', 'DELETE']::text[]),
  ('public', 'website_blog_categories', 'direct', ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE']::text[]),
  ('public', 'website_blog_post_tags', 'direct', ARRAY['SELECT', 'INSERT', 'DELETE']::text[]),
  ('public', 'website_blog_posts', 'direct', ARRAY['SELECT', 'INSERT', 'UPDATE']::text[]),
  ('public', 'website_blog_tags', 'direct', ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE']::text[]),
  ('public', 'website_custom_deployments', 'direct', ARRAY['SELECT', 'INSERT', 'UPDATE']::text[]),
  ('public', 'website_delivery_activations', 'direct', ARRAY['SELECT']::text[]),
  ('public', 'website_delivery_operations', 'direct', ARRAY['SELECT', 'INSERT']::text[]),
  ('public', 'website_domain_bindings', 'direct', ARRAY['SELECT']::text[]),
  ('public', 'website_form_rate_limits', 'direct', ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE']::text[]),
  ('public', 'website_form_submission_events', 'direct', ARRAY['SELECT', 'INSERT']::text[]),
  ('public', 'website_form_submissions', 'direct', ARRAY['SELECT', 'INSERT', 'UPDATE']::text[]),
  ('public', 'website_forms', 'direct', ARRAY['SELECT', 'INSERT', 'UPDATE']::text[]),
  ('public', 'website_navigation_items', 'direct', ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE']::text[]),
  ('public', 'website_page_sections', 'direct', ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE']::text[]),
  ('public', 'website_pages', 'direct', ARRAY['SELECT', 'INSERT', 'UPDATE']::text[]),
  ('public', 'website_preview_sessions', 'direct', ARRAY['SELECT', 'INSERT', 'UPDATE']::text[]),
  ('public', 'website_publications', 'direct', ARRAY['SELECT', 'INSERT', 'UPDATE']::text[]),
  ('public', 'website_redirects', 'direct', ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE']::text[]),
  ('public', 'website_sites', 'direct', ARRAY['SELECT', 'INSERT', 'UPDATE']::text[]);

DELETE FROM app_private.fieldgrid_runtime_function_capabilities
WHERE source_migration =
  '20260909120000_runtime_least_privilege_principals.sql';
INSERT INTO app_private.fieldgrid_runtime_function_capabilities (
  schema_name, function_name, argument_types, access_mode
) VALUES
  ('app_private', 'fieldgrid_auth_user_snapshot', 'uuid', 'direct'),
  ('public', 'accept_customer_quote', 'uuid, uuid', 'direct'),
  ('public', 'activate_managed_website_publication', 'uuid, uuid, uuid, integer, integer, uuid, text', 'direct'),
  ('public', 'activate_website_delivery', 'uuid, uuid, integer, character varying, uuid, uuid, text', 'direct'),
  ('public', 'assignment_sector_prefix', 'text', 'trigger_dependency'),
  ('public', 'begin_offline_operation', 'uuid, uuid, uuid, uuid, text, text, text, bigint', 'direct'),
  ('public', 'bind_primary_tenant_domain_to_website', 'uuid, uuid, integer, uuid, text', 'direct'),
  ('public', 'cancel_assignment_staffing', 'uuid, uuid, uuid, text', 'direct'),
  ('public', 'cancel_invoice_and_reopen_assignment', 'uuid, uuid, uuid, text', 'direct'),
  ('public', 'complete_offline_operation', 'uuid, uuid, text, jsonb', 'direct'),
  ('public', 'execute_assignment_participant_action_v2', 'uuid, uuid, uuid, text, text, bigint, text, text, jsonb', 'direct'),
  ('public', 'fieldgrid_assert_staffing_eligibility', 'uuid, uuid', 'trigger_dependency'),
  ('public', 'fieldgrid_generate_personnel_login_code', '', 'default_expression'),
  ('public', 'next_assignment_code', 'timestamp with time zone, uuid, uuid', 'trigger_dependency'),
  ('public', 'next_entity_code', 'text', 'trigger_dependency'),
  ('public', 'portal_realtime_emit_management', 'uuid, text, text, text, text, jsonb', 'direct'),
  ('public', 'resolve_assignment_sector_prefix', 'uuid, uuid', 'trigger_dependency'),
  ('public', 'set_primary_website_domain', 'uuid, uuid, uuid, integer, uuid, text', 'direct'),
  ('public', 'transition_assignment_staffing', 'uuid, uuid, uuid, uuid, text, text, bigint', 'direct'),
  ('public', 'transition_assignment_status', 'uuid, uuid, uuid, text, bigint', 'direct'),
  ('public', 'website_assert_route_integrity', 'uuid, uuid, character varying, character varying', 'trigger_dependency');

DELETE FROM app_private.fieldgrid_runtime_sequence_capabilities
WHERE source_migration =
  '20260909120000_runtime_least_privilege_principals.sql';
INSERT INTO app_private.fieldgrid_runtime_sequence_capabilities (
  schema_name, sequence_name, access_mode, privileges
) VALUES
  ('public', 'objects_code_seq', 'trigger_dependency', ARRAY['USAGE']::text[]),
  ('public', 'portal_realtime_projection_version_seq', 'function_only', ARRAY[]::text[]);

DO $fieldgrid_runtime_manifest_preflight$
DECLARE
  mismatch text[];
  function_row record;
BEGIN
  SELECT array_agg(item ORDER BY item)
  INTO mismatch
  FROM (
    (
      SELECT namespace_row.nspname || '.' || relation.relname AS item
      FROM pg_catalog.pg_class relation
      JOIN pg_catalog.pg_namespace namespace_row
        ON namespace_row.oid = relation.relnamespace
      WHERE namespace_row.nspname = 'public'
        AND relation.relkind IN ('r', 'p')
      EXCEPT
      SELECT schema_name::text || '.' || relation_name::text
      FROM app_private.fieldgrid_runtime_relation_capabilities
    )
    UNION ALL
    (
      SELECT schema_name::text || '.' || relation_name::text
      FROM app_private.fieldgrid_runtime_relation_capabilities
      EXCEPT
      SELECT namespace_row.nspname || '.' || relation.relname
      FROM pg_catalog.pg_class relation
      JOIN pg_catalog.pg_namespace namespace_row
        ON namespace_row.oid = relation.relnamespace
      WHERE namespace_row.nspname = 'public'
        AND relation.relkind IN ('r', 'p')
    )
  ) differences;

  IF mismatch IS NOT NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '42P01',
      MESSAGE = pg_catalog.format(
        'Runtime relation manifest/catalog mismatch: %s',
        array_to_string(mismatch, ', ')
      );
  END IF;

  FOR function_row IN
    SELECT *
    FROM app_private.fieldgrid_runtime_function_capabilities
  LOOP
    IF NOT (
        function_row.schema_name = 'app_private'
        AND function_row.function_name = 'fieldgrid_auth_user_snapshot'
      )
      AND pg_catalog.to_regprocedure(
      pg_catalog.format(
        '%I.%I(%s)',
        function_row.schema_name,
        function_row.function_name,
        function_row.argument_types
      )
    ) IS NULL THEN
      RAISE EXCEPTION 'Runtime function is missing: %.%(%)',
        function_row.schema_name,
        function_row.function_name,
        function_row.argument_types;
    END IF;
  END LOOP;

  SELECT array_agg(
    schema_name::text || '.' || sequence_name::text
    ORDER BY schema_name, sequence_name
  )
  INTO mismatch
  FROM app_private.fieldgrid_runtime_sequence_capabilities capability
  WHERE NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_class sequence_row
    JOIN pg_catalog.pg_namespace namespace_row
      ON namespace_row.oid = sequence_row.relnamespace
    WHERE namespace_row.nspname = capability.schema_name
      AND sequence_row.relname = capability.sequence_name
      AND sequence_row.relkind = 'S'
  );

  IF mismatch IS NOT NULL THEN
    RAISE EXCEPTION 'Runtime sequence manifest entries are missing: %',
      array_to_string(mismatch, ', ');
  END IF;
END;
$fieldgrid_runtime_manifest_preflight$;

-- Snapshot the browser/service effective application-function surface before
-- removing ambient PUBLIC EXECUTE. The direct grants restored below preserve
-- those principals' behavior without exposing unlisted functions to runtime.
DROP TABLE IF EXISTS pg_temp.fieldgrid_runtime_prior_function_access;
CREATE TEMP TABLE fieldgrid_runtime_prior_function_access AS
SELECT
  function_row.oid AS function_oid,
  principal.role_name
FROM pg_catalog.pg_proc function_row
JOIN pg_catalog.pg_namespace namespace_row
  ON namespace_row.oid = function_row.pronamespace
CROSS JOIN (
  VALUES ('anon'::name), ('authenticated'::name), ('service_role'::name)
) principal(role_name)
WHERE namespace_row.nspname IN ('public', 'app_private')
  AND function_row.prokind = 'f'
  AND NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_depend dependency
    WHERE dependency.classid = 'pg_catalog.pg_proc'::pg_catalog.regclass
      AND dependency.objid = function_row.oid
      AND dependency.refclassid = 'pg_catalog.pg_extension'::pg_catalog.regclass
      AND dependency.deptype = 'e'
  )
  AND pg_catalog.has_function_privilege(
    principal.role_name,
    function_row.oid,
    'EXECUTE'
  );

CREATE OR REPLACE FUNCTION app_private.fieldgrid_auth_user_snapshot(
  p_user_id uuid
)
RETURNS TABLE (
  id uuid,
  email text,
  raw_app_meta_data jsonb
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO pg_catalog
AS $fieldgrid_auth_user_snapshot$
  SELECT
    auth_user.id,
    auth_user.email::text,
    auth_user.raw_app_meta_data
  FROM auth.users AS auth_user
  WHERE auth_user.id = p_user_id
  LIMIT 1
$fieldgrid_auth_user_snapshot$;

-- Remove historical/browser policies only on the W00 server-only boundary.
DO $fieldgrid_runtime_server_only$
DECLARE
  table_row record;
  policy_row record;
BEGIN
  FOR table_row IN
    SELECT unnest(ARRAY[
      'credential_recovery_challenges',
      'credential_recovery_events',
      'platform_users',
      'support_access_grants',
      'support_access_audit_log',
      'portal_onboarding_sessions',
      'portal_onboarding_step_completions',
      'portal_notification_preferences',
      'offline_operation_receipts',
      'organization_settings',
      'tenant_domains'
    ]::text[]) AS table_name
  LOOP
    FOR policy_row IN
      SELECT policy.polname
      FROM pg_catalog.pg_policy policy
      WHERE policy.polrelid = pg_catalog.to_regclass(
        pg_catalog.format('public.%I', table_row.table_name)
      )
    LOOP
      EXECUTE pg_catalog.format(
        'DROP POLICY %I ON public.%I',
        policy_row.polname,
        table_row.table_name
      );
    END LOOP;

    EXECUTE pg_catalog.format(
      'REVOKE ALL PRIVILEGES ON TABLE public.%I '
      'FROM PUBLIC, anon, authenticated, service_role CASCADE',
      table_row.table_name
    );
  END LOOP;

  ALTER TABLE public.organization_settings ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.organization_settings NO FORCE ROW LEVEL SECURITY;
  ALTER TABLE public.tenant_domains ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.tenant_domains NO FORCE ROW LEVEL SECURITY;

  ALTER TABLE public.credential_recovery_challenges FORCE ROW LEVEL SECURITY;
  ALTER TABLE public.credential_recovery_events FORCE ROW LEVEL SECURITY;
  ALTER TABLE public.platform_users FORCE ROW LEVEL SECURITY;
  ALTER TABLE public.support_access_grants FORCE ROW LEVEL SECURITY;
  ALTER TABLE public.support_access_audit_log FORCE ROW LEVEL SECURITY;
  ALTER TABLE public.portal_onboarding_sessions FORCE ROW LEVEL SECURITY;
  ALTER TABLE public.portal_onboarding_step_completions FORCE ROW LEVEL SECURITY;
  ALTER TABLE public.portal_notification_preferences FORCE ROW LEVEL SECURITY;
  ALTER TABLE public.offline_operation_receipts FORCE ROW LEVEL SECURITY;
END;
$fieldgrid_runtime_server_only$;

DO $fieldgrid_runtime_relation_acl$
DECLARE
  capability record;
  operation text;
BEGIN
  FOR capability IN
    SELECT *
    FROM app_private.fieldgrid_runtime_relation_capabilities
    ORDER BY schema_name, relation_name
  LOOP
    EXECUTE pg_catalog.format(
      'REVOKE ALL PRIVILEGES ON TABLE %I.%I '
      'FROM fieldgrid_runtime_data, fieldgrid_runtime_app',
      capability.schema_name,
      capability.relation_name
    );

    FOREACH operation IN ARRAY ARRAY[
      'select', 'insert', 'update', 'delete'
    ]::text[]
    LOOP
      EXECUTE pg_catalog.format(
        'DROP POLICY IF EXISTS %I ON %I.%I',
        'fieldgrid_runtime_data_' || operation,
        capability.schema_name,
        capability.relation_name
      );
    END LOOP;

    IF capability.access_mode IN ('direct', 'indirect') THEN
      EXECUTE pg_catalog.format(
        'ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY',
        capability.schema_name,
        capability.relation_name
      );
      EXECUTE pg_catalog.format(
        'GRANT %s ON TABLE %I.%I TO fieldgrid_runtime_data',
        array_to_string(capability.privileges, ', '),
        capability.schema_name,
        capability.relation_name
      );

      IF 'SELECT' = ANY(capability.privileges) THEN
        EXECUTE pg_catalog.format(
          'CREATE POLICY fieldgrid_runtime_data_select ON %I.%I '
          'FOR SELECT TO fieldgrid_runtime_data USING (true)',
          capability.schema_name,
          capability.relation_name
        );
      END IF;
      IF 'INSERT' = ANY(capability.privileges) THEN
        EXECUTE pg_catalog.format(
          'CREATE POLICY fieldgrid_runtime_data_insert ON %I.%I '
          'FOR INSERT TO fieldgrid_runtime_data WITH CHECK (true)',
          capability.schema_name,
          capability.relation_name
        );
      END IF;
      IF 'UPDATE' = ANY(capability.privileges) THEN
        EXECUTE pg_catalog.format(
          'CREATE POLICY fieldgrid_runtime_data_update ON %I.%I '
          'FOR UPDATE TO fieldgrid_runtime_data USING (true) WITH CHECK (true)',
          capability.schema_name,
          capability.relation_name
        );
      END IF;
      IF 'DELETE' = ANY(capability.privileges) THEN
        EXECUTE pg_catalog.format(
          'CREATE POLICY fieldgrid_runtime_data_delete ON %I.%I '
          'FOR DELETE TO fieldgrid_runtime_data USING (true)',
          capability.schema_name,
          capability.relation_name
        );
      END IF;
    END IF;
  END LOOP;
END;
$fieldgrid_runtime_relation_acl$;

-- The previous release continues to use the trusted migration-owner login
-- between migration and atomic activation, and again during rollback. FORCE
-- RLS therefore needs an explicit, operation-minimal owner compatibility
-- policy. Membership direction does not expose this owner policy to runtime.
DO $fieldgrid_migration_admin_force_rls_compatibility$
DECLARE
  capability record;
  operation text;
  command text;
BEGIN
  FOR capability IN
    SELECT
      relation_name::text,
      privileges
    FROM app_private.fieldgrid_runtime_relation_capabilities
    WHERE schema_name = 'public'
      AND relation_name IN (
        'credential_recovery_challenges',
        'credential_recovery_events',
        'platform_users',
        'support_access_grants',
        'support_access_audit_log',
        'portal_onboarding_sessions',
        'portal_onboarding_step_completions',
        'portal_notification_preferences'
      )

    UNION ALL

    SELECT
      'offline_operation_receipts'::text,
      ARRAY['SELECT', 'INSERT', 'UPDATE']::text[]
  LOOP
    FOREACH operation IN ARRAY ARRAY[
      'SELECT', 'INSERT', 'UPDATE', 'DELETE'
    ]::text[]
    LOOP
      EXECUTE pg_catalog.format(
        'DROP POLICY IF EXISTS %I ON public.%I',
        'fieldgrid_migration_admin_compat_' || lower(operation),
        capability.relation_name
      );
    END LOOP;

    FOREACH operation IN ARRAY capability.privileges
    LOOP
      command := CASE operation
        WHEN 'SELECT' THEN 'USING (true)'
        WHEN 'INSERT' THEN 'WITH CHECK (true)'
        WHEN 'UPDATE' THEN 'USING (true) WITH CHECK (true)'
        WHEN 'DELETE' THEN 'USING (true)'
      END;
      EXECUTE pg_catalog.format(
        'CREATE POLICY %I ON public.%I FOR %s TO %I %s',
        'fieldgrid_migration_admin_compat_' || lower(operation),
        capability.relation_name,
        operation,
        current_user,
        command
      );
    END LOOP;
  END LOOP;
END;
$fieldgrid_migration_admin_force_rls_compatibility$;

DO $fieldgrid_runtime_sequence_acl$
DECLARE
  capability record;
BEGIN
  FOR capability IN
    SELECT *
    FROM app_private.fieldgrid_runtime_sequence_capabilities
    ORDER BY schema_name, sequence_name
  LOOP
    EXECUTE pg_catalog.format(
      'REVOKE ALL PRIVILEGES ON SEQUENCE %I.%I '
      'FROM fieldgrid_runtime_data, fieldgrid_runtime_app',
      capability.schema_name,
      capability.sequence_name
    );
    IF cardinality(capability.privileges) > 0 THEN
      EXECUTE pg_catalog.format(
        'GRANT %s ON SEQUENCE %I.%I TO fieldgrid_runtime_data',
        array_to_string(capability.privileges, ', '),
        capability.schema_name,
        capability.sequence_name
      );
    END IF;
  END LOOP;
END;
$fieldgrid_runtime_sequence_acl$;

DO $fieldgrid_runtime_function_acl$
DECLARE
  function_row record;
  prior_access record;
  capability record;
  function_identity text;
BEGIN
  FOR function_row IN
    SELECT
      function_catalog.oid,
      namespace_row.nspname AS schema_name,
      function_catalog.proname AS function_name,
      pg_catalog.oidvectortypes(function_catalog.proargtypes) AS argument_types
    FROM pg_catalog.pg_proc function_catalog
    JOIN pg_catalog.pg_namespace namespace_row
      ON namespace_row.oid = function_catalog.pronamespace
    WHERE namespace_row.nspname IN ('public', 'app_private')
      AND function_catalog.prokind = 'f'
      AND NOT EXISTS (
        SELECT 1
        FROM pg_catalog.pg_depend dependency
        WHERE dependency.classid = 'pg_catalog.pg_proc'::pg_catalog.regclass
          AND dependency.objid = function_catalog.oid
          AND dependency.refclassid = 'pg_catalog.pg_extension'::pg_catalog.regclass
          AND dependency.deptype = 'e'
      )
  LOOP
    function_identity := pg_catalog.format(
      '%I.%I(%s)',
      function_row.schema_name,
      function_row.function_name,
      function_row.argument_types
    );
    EXECUTE pg_catalog.format(
      'REVOKE EXECUTE ON FUNCTION %s '
      'FROM PUBLIC, fieldgrid_runtime_data, fieldgrid_runtime_app',
      function_identity
    );
  END LOOP;

  FOR prior_access IN
    SELECT
      namespace_row.nspname AS schema_name,
      prior_function.proname AS function_name,
      pg_catalog.oidvectortypes(prior_function.proargtypes) AS argument_types,
      snapshot.role_name
    FROM fieldgrid_runtime_prior_function_access snapshot
    JOIN pg_catalog.pg_proc prior_function
      ON prior_function.oid = snapshot.function_oid
    JOIN pg_catalog.pg_namespace namespace_row
      ON namespace_row.oid = prior_function.pronamespace
    ORDER BY namespace_row.nspname, prior_function.proname,
      argument_types, snapshot.role_name
  LOOP
    EXECUTE pg_catalog.format(
      'GRANT EXECUTE ON FUNCTION %I.%I(%s) TO %I',
      prior_access.schema_name,
      prior_access.function_name,
      prior_access.argument_types,
      prior_access.role_name
    );
  END LOOP;

  FOR capability IN
    SELECT *
    FROM app_private.fieldgrid_runtime_function_capabilities
    ORDER BY schema_name, function_name, argument_types
  LOOP
    EXECUTE pg_catalog.format(
      'GRANT EXECUTE ON FUNCTION %I.%I(%s) TO fieldgrid_runtime_data',
      capability.schema_name,
      capability.function_name,
      capability.argument_types
    );
  END LOOP;
END;
$fieldgrid_runtime_function_acl$;

DO $fieldgrid_runtime_closure$
DECLARE
  role_row record;
  relation_row record;
  sequence_row record;
  function_row record;
  operation text;
  expected boolean;
  violation text;
  expected_admin name;
  expected_app_admin_grantor name;
  expected_data_admin_grantor name;
  membership_count integer;
  membership_options_valid boolean;
BEGIN
  SELECT *
  INTO role_row
  FROM pg_catalog.pg_roles
  WHERE rolname = 'fieldgrid_runtime_data';

  IF role_row.rolcanlogin OR role_row.rolsuper OR role_row.rolcreatedb
    OR role_row.rolcreaterole OR role_row.rolreplication
    OR role_row.rolbypassrls OR role_row.rolinherit
  THEN
    RAISE EXCEPTION 'fieldgrid_runtime_data has unsafe role attributes';
  END IF;

  SELECT *
  INTO role_row
  FROM pg_catalog.pg_roles
  WHERE rolname = 'fieldgrid_runtime_app';

  IF role_row.rolsuper OR role_row.rolcreatedb OR role_row.rolcreaterole
    OR role_row.rolreplication OR role_row.rolbypassrls
    OR NOT role_row.rolinherit
  THEN
    RAISE EXCEPTION 'fieldgrid_runtime_app has unsafe role attributes';
  END IF;

  SELECT parent.rolname
  INTO violation
  FROM pg_catalog.pg_auth_members membership
  JOIN pg_catalog.pg_roles member ON member.oid = membership.member
  JOIN pg_catalog.pg_roles parent ON parent.oid = membership.roleid
  WHERE member.rolname = 'fieldgrid_runtime_app'
    AND parent.rolname <> 'fieldgrid_runtime_data'
  ORDER BY parent.rolname
  LIMIT 1;

  IF violation IS NOT NULL THEN
    RAISE EXCEPTION 'Runtime app has unexpected parent role: %', violation;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_auth_members membership
    JOIN pg_catalog.pg_roles member ON member.oid = membership.member
    WHERE member.rolname = 'fieldgrid_runtime_data'
  ) THEN
    RAISE EXCEPTION 'Runtime data capability role has a parent role';
  END IF;

  SELECT migration_admin, app_admin_grantor, data_admin_grantor
  INTO expected_admin, expected_app_admin_grantor,
    expected_data_admin_grantor
  FROM app_private.fieldgrid_runtime_principal_configuration
  WHERE singleton;

  SELECT count(*)::integer
  INTO membership_count
  FROM pg_catalog.pg_auth_members membership
  JOIN pg_catalog.pg_roles parent ON parent.oid = membership.roleid
  JOIN pg_catalog.pg_roles member ON member.oid = membership.member
  WHERE parent.rolname = 'fieldgrid_runtime_app'
    AND member.rolname = expected_admin
    AND membership.admin_option;

  IF membership_count <> 1 OR (
    SELECT count(*)
    FROM pg_catalog.pg_auth_members membership
    JOIN pg_catalog.pg_roles parent ON parent.oid = membership.roleid
    WHERE parent.rolname = 'fieldgrid_runtime_app'
  ) <> 1 THEN
    RAISE EXCEPTION
      'Runtime app must have exactly one ADMIN member: %', expected_admin;
  END IF;

  SELECT count(*)::integer
  INTO membership_count
  FROM pg_catalog.pg_auth_members membership
  JOIN pg_catalog.pg_roles parent ON parent.oid = membership.roleid
  JOIN pg_catalog.pg_roles member ON member.oid = membership.member
  WHERE parent.rolname = 'fieldgrid_runtime_data'
    AND member.rolname = 'fieldgrid_runtime_app'
    AND NOT membership.admin_option;

  IF membership_count <> 1 OR (
    SELECT count(*)
    FROM pg_catalog.pg_auth_members membership
    JOIN pg_catalog.pg_roles parent ON parent.oid = membership.roleid
    WHERE parent.rolname = 'fieldgrid_runtime_data'
  ) <> 2 OR (
    SELECT count(*)
    FROM pg_catalog.pg_auth_members membership
    JOIN pg_catalog.pg_roles parent ON parent.oid = membership.roleid
    JOIN pg_catalog.pg_roles member ON member.oid = membership.member
    WHERE parent.rolname = 'fieldgrid_runtime_data'
      AND member.rolname = expected_admin
      AND membership.admin_option
  ) <> 1 THEN
    RAISE EXCEPTION
      'Runtime data must have one app capability edge and one admin edge';
  END IF;

  IF current_setting('server_version_num')::integer >= 160000 THEN
    EXECUTE $membership_options$
      SELECT count(*) = 3 AND bool_and(
        CASE
          WHEN parent.rolname = 'fieldgrid_runtime_app'
            AND member.rolname = $1 THEN
            membership.admin_option
            AND NOT membership.inherit_option
            AND NOT membership.set_option
            AND grantor.rolname = $2
          WHEN parent.rolname = 'fieldgrid_runtime_data'
            AND member.rolname = $1 THEN
            membership.admin_option
            AND NOT membership.inherit_option
            AND NOT membership.set_option
            AND grantor.rolname = $3
          WHEN parent.rolname = 'fieldgrid_runtime_data'
            AND member.rolname = 'fieldgrid_runtime_app' THEN
            NOT membership.admin_option
            AND membership.inherit_option
            AND NOT membership.set_option
          ELSE false
        END
      )
      FROM pg_catalog.pg_auth_members membership
      JOIN pg_catalog.pg_roles parent ON parent.oid = membership.roleid
      JOIN pg_catalog.pg_roles member ON member.oid = membership.member
      JOIN pg_catalog.pg_roles grantor ON grantor.oid = membership.grantor
      WHERE (parent.rolname = 'fieldgrid_runtime_app'
          AND member.rolname = $1)
        OR (parent.rolname = 'fieldgrid_runtime_data'
          AND member.rolname IN ('fieldgrid_runtime_app', $1))
    $membership_options$
    INTO membership_options_valid
    USING expected_admin, expected_app_admin_grantor,
      expected_data_admin_grantor;

    IF membership_options_valid IS DISTINCT FROM true THEN
      RAISE EXCEPTION 'Runtime membership options are not exact';
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_roles owner_role
    WHERE owner_role.rolname IN (
      'fieldgrid_runtime_app', 'fieldgrid_runtime_data'
    )
      AND (
        EXISTS (
          SELECT 1 FROM pg_catalog.pg_class object_row
          WHERE object_row.relowner = owner_role.oid
        )
        OR EXISTS (
          SELECT 1 FROM pg_catalog.pg_namespace schema_row
          WHERE schema_row.nspowner = owner_role.oid
        )
        OR EXISTS (
          SELECT 1 FROM pg_catalog.pg_proc owned_function
          WHERE owned_function.proowner = owner_role.oid
        )
      )
  ) THEN
    RAISE EXCEPTION 'A runtime role owns database objects';
  END IF;

  IF pg_catalog.has_schema_privilege(
      'fieldgrid_runtime_app', 'public', 'CREATE'
    )
    OR pg_catalog.has_schema_privilege(
      'fieldgrid_runtime_app', 'app_private', 'CREATE'
    )
    OR pg_catalog.has_schema_privilege(
      'fieldgrid_runtime_app', 'auth', 'USAGE'
    )
  THEN
    RAISE EXCEPTION 'Runtime app has unsafe schema privileges';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_default_acl default_acl
    CROSS JOIN LATERAL pg_catalog.aclexplode(
      coalesce(
        default_acl.defaclacl,
        pg_catalog.acldefault('f', default_acl.defaclrole)
      )
    ) privilege
    WHERE default_acl.defaclrole = current_user::pg_catalog.regrole::oid
      AND default_acl.defaclobjtype = 'f'
      AND default_acl.defaclnamespace = 0
      AND privilege.grantee = 0
      AND privilege.privilege_type = 'EXECUTE'
  ) OR (
    SELECT count(*)
    FROM pg_catalog.pg_default_acl default_acl
    WHERE default_acl.defaclrole = current_user::pg_catalog.regrole::oid
      AND default_acl.defaclobjtype = 'f'
      AND default_acl.defaclnamespace = 0
  ) <> 1 THEN
    RAISE EXCEPTION
      'Migration-admin function defaults are not fail-closed';
  END IF;

  SELECT reachable.rolname
  INTO violation
  FROM pg_catalog.pg_roles reachable
  WHERE reachable.rolname NOT IN (
      'fieldgrid_runtime_app', 'fieldgrid_runtime_data'
    )
    AND pg_catalog.pg_has_role(
      'fieldgrid_runtime_app',
      reachable.oid,
      'SET'
    )
    AND (
      reachable.rolsuper
      OR reachable.rolbypassrls
      OR EXISTS (
        SELECT 1 FROM pg_catalog.pg_class object_row
        WHERE object_row.relowner = reachable.oid
      )
      OR EXISTS (
        SELECT 1 FROM pg_catalog.pg_namespace schema_row
        WHERE schema_row.nspowner = reachable.oid
      )
      OR EXISTS (
        SELECT 1 FROM pg_catalog.pg_proc owned_function
        WHERE owned_function.proowner = reachable.oid
      )
    )
  ORDER BY reachable.rolname
  LIMIT 1;

  IF violation IS NOT NULL THEN
    RAISE EXCEPTION 'Runtime app can SET ROLE to privileged/owning role: %',
      violation;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM (
      VALUES ('anon'::name), ('authenticated'::name), ('service_role'::name)
    ) principal(role_name)
    CROSS JOIN (
      VALUES ('fieldgrid_runtime_app'::name),
             ('fieldgrid_runtime_data'::name)
    ) runtime_role(role_name)
    WHERE pg_catalog.pg_has_role(
      principal.role_name,
      runtime_role.role_name,
      'SET'
    )
  ) THEN
    RAISE EXCEPTION 'Browser/service role can SET a runtime role';
  END IF;

  WITH RECURSIVE
    principals AS (
      SELECT role_oid.oid, role_oid.rolname::text AS role_name
      FROM pg_catalog.pg_roles role_oid
      WHERE role_oid.rolname IN (
        'anon', 'authenticated', 'service_role',
        'fieldgrid_runtime_data', 'fieldgrid_runtime_app'
      )
    ),
    controllable(source_oid, source_role, reachable_oid) AS (
      SELECT principal.oid, principal.role_name, principal.oid
      FROM principals principal

      UNION

      SELECT controlled.source_oid, controlled.source_role, next_role.oid
      FROM controllable controlled
      CROSS JOIN LATERAL (
        SELECT reachable_role.oid
        FROM pg_catalog.pg_roles reachable_role
        WHERE reachable_role.oid <> controlled.reachable_oid
          AND (
            pg_catalog.pg_has_role(
              controlled.reachable_oid,
              reachable_role.oid,
              'SET'
            )
            OR pg_catalog.pg_has_role(
              controlled.reachable_oid,
              reachable_role.oid,
              'USAGE'
            )
          )

        UNION

        SELECT membership.roleid
        FROM pg_catalog.pg_auth_members membership
        JOIN pg_catalog.pg_roles administered_role
          ON administered_role.oid = membership.roleid
         AND NOT administered_role.rolsuper
        WHERE membership.admin_option
          AND pg_catalog.pg_has_role(
            controlled.reachable_oid,
            membership.member,
            'USAGE'
          )
      ) next_role
    ),
    violations AS (
      SELECT
        controlled.source_role,
        reachable.rolname::text AS reachable_role,
        CASE
          WHEN reachable.rolsuper THEN 'SUPERUSER'
          WHEN reachable.rolbypassrls THEN 'BYPASSRLS'
          WHEN EXISTS (
            SELECT 1 FROM pg_catalog.pg_class owned_relation
            WHERE owned_relation.relowner = reachable.oid
          ) THEN 'relation owner'
          WHEN EXISTS (
            SELECT 1 FROM pg_catalog.pg_namespace owned_schema
            WHERE owned_schema.nspowner = reachable.oid
          ) THEN 'schema owner'
          ELSE 'function owner'
        END AS capability
      FROM controllable controlled
      JOIN pg_catalog.pg_roles reachable
        ON reachable.oid = controlled.reachable_oid
      WHERE controlled.reachable_oid <> controlled.source_oid
        AND (
          reachable.rolsuper
          OR reachable.rolbypassrls
          OR EXISTS (
            SELECT 1 FROM pg_catalog.pg_class owned_relation
            WHERE owned_relation.relowner = reachable.oid
          )
          OR EXISTS (
            SELECT 1 FROM pg_catalog.pg_namespace owned_schema
            WHERE owned_schema.nspowner = reachable.oid
          )
          OR EXISTS (
            SELECT 1 FROM pg_catalog.pg_proc owned_function
            WHERE owned_function.proowner = reachable.oid
          )
        )
    )
  SELECT pg_catalog.format(
    '%I -> %I (%s)', source_role, reachable_role, capability
  )
  INTO violation
  FROM violations
  ORDER BY source_role, reachable_role, capability
  LIMIT 1;

  IF violation IS NOT NULL THEN
    RAISE EXCEPTION
      'Untrusted principal has SET/USAGE/ADMIN path to privileged role: %',
      violation;
  END IF;

  FOR relation_row IN
    SELECT
      capability.*,
      relation.oid AS relation_oid,
      relation.relrowsecurity
    FROM app_private.fieldgrid_runtime_relation_capabilities capability
    JOIN pg_catalog.pg_namespace namespace_row
      ON namespace_row.nspname = capability.schema_name
    JOIN pg_catalog.pg_class relation
      ON relation.relnamespace = namespace_row.oid
     AND relation.relname = capability.relation_name
     AND relation.relkind IN ('r', 'p')
  LOOP
    IF relation_row.access_mode IN ('direct', 'indirect')
      AND NOT relation_row.relrowsecurity
    THEN
      RAISE EXCEPTION 'Runtime relation lacks RLS: %.%',
        relation_row.schema_name, relation_row.relation_name;
    END IF;

    FOREACH operation IN ARRAY ARRAY[
      'SELECT', 'INSERT', 'UPDATE', 'DELETE',
      'TRUNCATE', 'REFERENCES', 'TRIGGER'
    ]::text[]
    LOOP
      expected := operation = ANY(relation_row.privileges);
      IF pg_catalog.has_table_privilege(
        'fieldgrid_runtime_app',
        relation_row.relation_oid,
        operation
      ) IS DISTINCT FROM expected THEN
        RAISE EXCEPTION 'Unexpected runtime % privilege on %.% (expected %)',
          operation,
          relation_row.schema_name,
          relation_row.relation_name,
          expected;
      END IF;
    END LOOP;

    IF current_setting('server_version_num')::integer >= 170000
      AND pg_catalog.has_table_privilege(
        'fieldgrid_runtime_app',
        relation_row.relation_oid,
        'MAINTAIN'
      )
    THEN
      RAISE EXCEPTION 'Unexpected runtime MAINTAIN privilege on %.%',
        relation_row.schema_name, relation_row.relation_name;
    END IF;
  END LOOP;

  FOR sequence_row IN
    SELECT capability.*, sequence_catalog.oid AS sequence_oid
    FROM app_private.fieldgrid_runtime_sequence_capabilities capability
    JOIN pg_catalog.pg_namespace namespace_row
      ON namespace_row.nspname = capability.schema_name
    JOIN pg_catalog.pg_class sequence_catalog
      ON sequence_catalog.relnamespace = namespace_row.oid
     AND sequence_catalog.relname = capability.sequence_name
     AND sequence_catalog.relkind = 'S'
  LOOP
    FOREACH operation IN ARRAY ARRAY[
      'SELECT', 'UPDATE', 'USAGE'
    ]::text[]
    LOOP
      expected := operation = ANY(sequence_row.privileges);
      IF pg_catalog.has_sequence_privilege(
        'fieldgrid_runtime_app',
        sequence_row.sequence_oid,
        operation
      ) IS DISTINCT FROM expected THEN
        RAISE EXCEPTION 'Unexpected runtime % privilege on sequence %.%',
          operation, sequence_row.schema_name, sequence_row.sequence_name;
      END IF;
    END LOOP;
  END LOOP;

  FOR function_row IN
    SELECT
      function_catalog.oid AS function_oid,
      namespace_row.nspname AS schema_name,
      function_catalog.proname AS function_name,
      pg_catalog.oidvectortypes(function_catalog.proargtypes) AS argument_types,
      EXISTS (
        SELECT 1
        FROM app_private.fieldgrid_runtime_function_capabilities capability
        WHERE capability.schema_name = namespace_row.nspname
          AND capability.function_name = function_catalog.proname
          AND capability.argument_types =
            pg_catalog.oidvectortypes(function_catalog.proargtypes)
      ) AS is_manifested
    FROM pg_catalog.pg_proc function_catalog
    JOIN pg_catalog.pg_namespace namespace_row
      ON namespace_row.oid = function_catalog.pronamespace
    WHERE namespace_row.nspname IN ('public', 'app_private')
      AND function_catalog.prokind = 'f'
      AND NOT EXISTS (
        SELECT 1
        FROM pg_catalog.pg_depend dependency
        WHERE dependency.classid = 'pg_catalog.pg_proc'::pg_catalog.regclass
          AND dependency.objid = function_catalog.oid
          AND dependency.refclassid = 'pg_catalog.pg_extension'::pg_catalog.regclass
          AND dependency.deptype = 'e'
      )
  LOOP
    IF pg_catalog.has_function_privilege(
      'fieldgrid_runtime_app',
      function_row.function_oid,
      'EXECUTE'
    ) IS DISTINCT FROM function_row.is_manifested THEN
      RAISE EXCEPTION
        'Unexpected runtime EXECUTE on %.%(%) (expected %)',
        function_row.schema_name,
        function_row.function_name,
        function_row.argument_types,
        function_row.is_manifested;
    END IF;
  END LOOP;

  IF EXISTS (
    SELECT 1
    FROM (
      VALUES ('anon'::name), ('authenticated'::name), ('service_role'::name)
    ) principal(role_name)
    CROSS JOIN (
      VALUES
        ('credential_recovery_challenges'::name),
        ('credential_recovery_events'::name),
        ('platform_users'::name),
        ('support_access_grants'::name),
        ('support_access_audit_log'::name),
        ('portal_onboarding_sessions'::name),
        ('portal_onboarding_step_completions'::name),
        ('portal_notification_preferences'::name),
        ('offline_operation_receipts'::name),
        ('organization_settings'::name),
        ('tenant_domains'::name)
    ) target(relation_name)
    CROSS JOIN unnest(ARRAY[
      'SELECT', 'INSERT', 'UPDATE', 'DELETE',
      'TRUNCATE', 'REFERENCES', 'TRIGGER'
    ]::text[]) privilege(operation)
    WHERE pg_catalog.has_table_privilege(
      principal.role_name,
      pg_catalog.to_regclass(
        pg_catalog.format('public.%I', target.relation_name)
      ),
      privilege.operation
    )
  ) THEN
    RAISE EXCEPTION 'Browser/service access remains on a server-only table';
  END IF;

  WITH expected AS (
    SELECT
      capability.relation_name::text,
      operation_row.operation_name::text
    FROM app_private.fieldgrid_runtime_relation_capabilities capability
    CROSS JOIN LATERAL unnest(capability.privileges)
      operation_row(operation_name)
    WHERE capability.schema_name = 'public'
      AND capability.relation_name IN (
        'credential_recovery_challenges',
        'credential_recovery_events',
        'platform_users',
        'support_access_grants',
        'support_access_audit_log',
        'portal_onboarding_sessions',
        'portal_onboarding_step_completions',
        'portal_notification_preferences'
      )

    UNION ALL

    SELECT 'offline_operation_receipts', operation_row.operation_name
    FROM unnest(ARRAY['SELECT', 'INSERT', 'UPDATE']::text[])
      operation_row(operation_name)
  ),
  actual AS (
    SELECT
      relation.relname::text AS relation_name,
      CASE policy.polcmd
        WHEN 'r' THEN 'SELECT'
        WHEN 'a' THEN 'INSERT'
        WHEN 'w' THEN 'UPDATE'
        WHEN 'd' THEN 'DELETE'
      END AS operation
    FROM pg_catalog.pg_policy policy
    JOIN pg_catalog.pg_class relation ON relation.oid = policy.polrelid
    JOIN pg_catalog.pg_namespace namespace_row
      ON namespace_row.oid = relation.relnamespace
    WHERE namespace_row.nspname = 'public'
      AND policy.polname =
        'fieldgrid_migration_admin_compat_' || CASE policy.polcmd
          WHEN 'r' THEN 'select'
          WHEN 'a' THEN 'insert'
          WHEN 'w' THEN 'update'
          WHEN 'd' THEN 'delete'
        END
      AND policy.polpermissive
      AND policy.polroles = ARRAY[
        expected_admin::text::pg_catalog.regrole::oid
      ]::oid[]
      AND (
        (policy.polcmd = 'a'
          AND policy.polqual IS NULL
          AND pg_catalog.pg_get_expr(policy.polwithcheck, policy.polrelid) = 'true')
        OR (policy.polcmd IN ('r', 'd')
          AND pg_catalog.pg_get_expr(policy.polqual, policy.polrelid) = 'true'
          AND policy.polwithcheck IS NULL)
        OR (policy.polcmd = 'w'
          AND pg_catalog.pg_get_expr(policy.polqual, policy.polrelid) = 'true'
          AND pg_catalog.pg_get_expr(policy.polwithcheck, policy.polrelid) = 'true')
      )
  ),
  differences AS (
    (SELECT * FROM expected EXCEPT SELECT * FROM actual)
    UNION ALL
    (SELECT * FROM actual EXCEPT SELECT * FROM expected)
  )
  SELECT count(*)::integer INTO membership_count FROM differences;

  IF membership_count <> 0 THEN
    RAISE EXCEPTION
      'Migration-admin FORCE RLS compatibility policies are not exact';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_policy policy
    JOIN pg_catalog.pg_class relation ON relation.oid = policy.polrelid
    JOIN pg_catalog.pg_namespace namespace_row
      ON namespace_row.oid = relation.relnamespace
    WHERE namespace_row.nspname = 'public'
      AND relation.relname IN (
        'credential_recovery_challenges',
        'credential_recovery_events',
        'platform_users',
        'support_access_grants',
        'support_access_audit_log',
        'portal_onboarding_sessions',
        'portal_onboarding_step_completions',
        'portal_notification_preferences',
        'offline_operation_receipts'
      )
      AND policy.polroles <> ARRAY[
        'fieldgrid_runtime_data'::pg_catalog.regrole::oid
      ]::oid[]
      AND policy.polroles <> ARRAY[
        expected_admin::text::pg_catalog.regrole::oid
      ]::oid[]
  ) THEN
    RAISE EXCEPTION
      'Unexpected principal has a server-only FORCE RLS policy';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM (
      VALUES ('anon'::name), ('authenticated'::name), ('service_role'::name)
    ) principal(role_name)
    WHERE pg_catalog.has_function_privilege(
      principal.role_name,
      'app_private.fieldgrid_auth_user_snapshot(uuid)',
      'EXECUTE'
    )
  ) THEN
    RAISE EXCEPTION 'Browser/service role can execute auth snapshot helper';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM unnest(ARRAY[
      'SELECT', 'INSERT', 'UPDATE', 'DELETE',
      'TRUNCATE', 'REFERENCES', 'TRIGGER'
    ]::text[]) privilege(operation)
    WHERE pg_catalog.has_table_privilege(
      'fieldgrid_runtime_app',
      'auth.users',
      privilege.operation
    )
  ) THEN
    RAISE EXCEPTION 'Runtime app has direct auth.users access';
  END IF;
END;
$fieldgrid_runtime_closure$;
