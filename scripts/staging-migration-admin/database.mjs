import { buildScramVerifier } from "../fieldgrid-w00-runtime-principal.mjs";
import { databaseInventory } from "../disposable-staging/database.mjs";
import {
  BRIDGE_ADAPTERS,
  BRIDGE_FUNCTIONS,
  BRIDGE_SCHEMA,
  STORAGE_POLICIES,
  SUPERSEDED_STORAGE_POLICIES,
  verifyHostedMigrationBridgeFinalState,
} from "./bridge-contract.mjs";
import {
  APP_SCHEMAS,
  MANAGED_SCHEMAS,
  MIGRATION_ROLE,
  digest,
  requireThat,
} from "./contract.mjs";

const RUNTIME_ROLES = Object.freeze([
  "fieldgrid_runtime_app",
  "fieldgrid_runtime_data",
]);
const LEGACY_BOOTSTRAP_AUTH_COLUMNS = Object.freeze([
  "email",
  "id",
  "raw_app_meta_data",
]);
const HOSTED_STORAGE_POLICY_CAPABILITY_PROBE =
  "fieldgrid_bootstrap_policy_capability_probe";
export const HOSTED_MIGRATION_BRIDGE_SCHEMA = BRIDGE_SCHEMA;
export const HOSTED_MIGRATION_BRIDGE_FUNCTIONS = BRIDGE_FUNCTIONS;
const HOSTED_MIGRATION_PROVIDER_ADAPTERS = BRIDGE_ADAPTERS;
export const HOSTED_STORAGE_POLICY_NAMES = STORAGE_POLICIES;
export const HOSTED_STORAGE_SUPERSEDED_POLICY_NAMES =
  SUPERSEDED_STORAGE_POLICIES;

function identifier(value) {
  requireThat(
    typeof value === "string" && value.length > 0 && value.length <= 63,
    "CATALOG_IDENTIFIER_INVALID",
  );
  return `"${value.replaceAll('"', '""')}"`;
}

function qualified(schema, name) {
  return `${identifier(schema)}.${identifier(name)}`;
}

async function staged(stage, operation) {
  try {
    return await operation();
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      typeof error.bootstrapFailureStage !== "string"
    ) {
      error.bootstrapFailureStage = stage;
    }
    throw error;
  }
}

async function installHostedStorageReconciler(client) {
  await client.query(`
    CREATE OR REPLACE FUNCTION ${qualified(HOSTED_MIGRATION_BRIDGE_SCHEMA, "reconcile_storage")}()
    RETURNS void
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path TO pg_catalog, public, ${identifier(HOSTED_MIGRATION_BRIDGE_SCHEMA)}, pg_temp
    AS $fieldgrid_storage_reconcile$
    DECLARE
      policy_row record;
    BEGIN
      IF session_user <> '${MIGRATION_ROLE}' THEN
        RAISE EXCEPTION 'hosted_migration_bridge_principal_invalid';
      END IF;
      IF pg_catalog.to_regclass('storage.buckets') IS NULL
         OR pg_catalog.to_regclass('storage.objects') IS NULL THEN
        RAISE EXCEPTION 'hosted_migration_bridge_storage_catalog_missing';
      END IF;
      IF EXISTS (SELECT 1 FROM storage.objects LIMIT 1) THEN
        RAISE EXCEPTION 'hosted_migration_bridge_storage_not_empty';
      END IF;
      IF EXISTS (
        SELECT 1 FROM pg_catalog.pg_policies
        WHERE schemaname='storage' AND tablename='objects'
          AND policyname::text<>ALL(ARRAY[${[
            ...HOSTED_STORAGE_POLICY_NAMES,
            ...HOSTED_STORAGE_SUPERSEDED_POLICY_NAMES,
          ]
            .map((name) => `'${name}'`)
            .join(",")}]::text[])
      ) THEN
        RAISE EXCEPTION 'hosted_migration_bridge_unknown_storage_policy';
      END IF;

      INSERT INTO storage.buckets(
        id,name,owner,owner_id,public,file_size_limit,allowed_mime_types
      )
      VALUES
        ('assignment-photos','assignment-photos',NULL,NULL,false,26214400,
          ARRAY['image/jpeg','image/png','image/webp','video/mp4','video/webm','video/quicktime']::text[]),
        ('documents','documents',NULL,NULL,false,52428800,
          ARRAY['application/pdf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/vnd.ms-powerpoint','application/vnd.openxmlformats-officedocument.presentationml.presentation','image/jpeg','image/png','image/gif','image/webp']::text[]),
        ('knowledgebase-media','knowledgebase-media',NULL,NULL,false,52428800,
          ARRAY['image/jpeg','image/png','image/webp','image/gif','video/mp4','video/webm','application/pdf']::text[]),
        ('news-hero','news-hero',NULL,NULL,true,5242880,
          ARRAY['image/jpeg','image/png','image/webp','image/gif']::text[]),
        ('org-assets','org-assets',NULL,NULL,true,3145728,
          ARRAY['image/jpeg','image/png','image/webp','image/svg+xml']::text[]),
        ('personnel-avatars','personnel-avatars',NULL,NULL,true,3145728,
          ARRAY['image/jpeg','image/png','image/webp']::text[]),
        ('release-media','release-media',NULL,NULL,false,52428800,
          ARRAY['image/jpeg','image/png','image/webp','image/gif','video/mp4','video/webm','application/pdf']::text[])
      ON CONFLICT(id) DO UPDATE SET
        name=excluded.name,
        owner=NULL,
        owner_id=NULL,
        public=excluded.public,
        file_size_limit=excluded.file_size_limit,
        allowed_mime_types=excluded.allowed_mime_types;

      FOR policy_row IN
        SELECT policyname FROM pg_catalog.pg_policies
        WHERE schemaname='storage' AND tablename='objects'
          AND policyname::text=ANY(ARRAY[${[
            ...HOSTED_STORAGE_POLICY_NAMES,
            ...HOSTED_STORAGE_SUPERSEDED_POLICY_NAMES,
          ]
            .map((name) => `'${name}'`)
            .join(",")}]::text[])
        ORDER BY policyname
      LOOP
        EXECUTE pg_catalog.format(
          'DROP POLICY %I ON storage.objects',policy_row.policyname
        );
      END LOOP;

      EXECUTE $fieldgrid_policy$CREATE POLICY assignment_checklist_evidence_insert
        ON storage.objects FOR INSERT TO authenticated
        WITH CHECK (
          bucket_id='assignment-photos' AND name LIKE '%/checklists/%'
          AND EXISTS (
            SELECT 1 FROM public.assignment_checklists checklist
            WHERE pg_catalog.split_part(name,'/',1)='tenant'
              AND checklist.tenant_id::text=pg_catalog.split_part(name,'/',2)
              AND pg_catalog.split_part(name,'/',3)='assignments'
              AND checklist.assignment_id::text=pg_catalog.split_part(name,'/',4)
              AND pg_catalog.split_part(name,'/',5)='checklists'
              AND checklist.id::text=pg_catalog.split_part(name,'/',6)
              AND checklist.status='active'
              AND (
                public.is_management_for_$fieldgrid_policy$ || $fieldgrid_policy$tenant(checklist.tenant_id)
                OR public.personnel_assigned_to_assignment(checklist.assignment_id)
              )
          )
        )$fieldgrid_policy$;
      EXECUTE $fieldgrid_policy$CREATE POLICY assignment_checklist_evidence_read
        ON storage.objects FOR SELECT TO authenticated
        USING (
          bucket_id='assignment-photos' AND name LIKE '%/checklists/%'
          AND EXISTS (
            SELECT 1 FROM public.assignment_checklists checklist
            WHERE pg_catalog.split_part(name,'/',1)='tenant'
              AND checklist.tenant_id::text=pg_catalog.split_part(name,'/',2)
              AND pg_catalog.split_part(name,'/',3)='assignments'
              AND checklist.assignment_id::text=pg_catalog.split_part(name,'/',4)
              AND pg_catalog.split_part(name,'/',5)='checklists'
              AND checklist.id::text=pg_catalog.split_part(name,'/',6)
              AND (
                public.is_management_for_$fieldgrid_policy$ || $fieldgrid_policy$tenant(checklist.tenant_id)
                OR public.personnel_assigned_to_assignment(checklist.assignment_id)
              )
          )
        )$fieldgrid_policy$;
      CREATE POLICY assignment_photos_assigned_personnel
        ON storage.objects FOR SELECT TO authenticated
        USING (
          bucket_id='assignment-photos'
          AND public.personnel_can_access_assignment_storage(
            public.fieldgrid_storage_assignment_id_from_path(name),
            public.fieldgrid_storage_tenant_id_from_path(name)
          )
        );
      CREATE POLICY assignment_photos_assigned_personnel_delete
        ON storage.objects FOR DELETE TO authenticated
        USING (
          bucket_id='assignment-photos'
          AND owner=${qualified(HOSTED_MIGRATION_BRIDGE_SCHEMA, "uid")}()
          AND public.personnel_can_access_assignment_storage(
            public.fieldgrid_storage_assignment_id_from_path(name),
            public.fieldgrid_storage_tenant_id_from_path(name)
          )
        );
      CREATE POLICY assignment_photos_assigned_personnel_insert
        ON storage.objects FOR INSERT TO authenticated
        WITH CHECK (
          bucket_id='assignment-photos'
          AND owner=${qualified(HOSTED_MIGRATION_BRIDGE_SCHEMA, "uid")}()
          AND public.personnel_can_access_assignment_storage(
            public.fieldgrid_storage_assignment_id_from_path(name),
            public.fieldgrid_storage_tenant_id_from_path(name)
          )
        );
      CREATE POLICY assignment_photos_assigned_personnel_update
        ON storage.objects FOR UPDATE TO authenticated
        USING (
          bucket_id='assignment-photos'
          AND owner=${qualified(HOSTED_MIGRATION_BRIDGE_SCHEMA, "uid")}()
          AND public.personnel_can_access_assignment_storage(
            public.fieldgrid_storage_assignment_id_from_path(name),
            public.fieldgrid_storage_tenant_id_from_path(name)
          )
        )
        WITH CHECK (
          bucket_id='assignment-photos'
          AND owner=${qualified(HOSTED_MIGRATION_BRIDGE_SCHEMA, "uid")}()
          AND public.personnel_can_access_assignment_storage(
            public.fieldgrid_storage_assignment_id_from_path(name),
            public.fieldgrid_storage_tenant_id_from_path(name)
          )
        );
      EXECUTE $fieldgrid_policy$CREATE POLICY assignment_photos_management_all
        ON storage.objects TO authenticated
        USING (
          bucket_id='assignment-photos'
          AND public.is_management_for_$fieldgrid_policy$ || $fieldgrid_policy$tenant(
            public.fieldgrid_storage_tenant_id_from_path(name)
          )
        )
        WITH CHECK (
          bucket_id='assignment-photos'
          AND public.is_management_for_$fieldgrid_policy$ || $fieldgrid_policy$tenant(
            public.fieldgrid_storage_tenant_id_from_path(name)
          )
        )$fieldgrid_policy$;
      EXECUTE $fieldgrid_policy$CREATE POLICY documents_management_all
        ON storage.objects TO authenticated
        USING (
          bucket_id='documents'
          AND public.is_management_for_$fieldgrid_policy$ || $fieldgrid_policy$tenant(
            public.fieldgrid_storage_tenant_id_from_path(name)
          )
        )
        WITH CHECK (
          bucket_id='documents'
          AND public.is_management_for_$fieldgrid_policy$ || $fieldgrid_policy$tenant(
            public.fieldgrid_storage_tenant_id_from_path(name)
          )
        )$fieldgrid_policy$;
      CREATE POLICY knowledgebase_media_management_delete
        ON storage.objects FOR DELETE TO authenticated
        USING (
          bucket_id='knowledgebase-media'
          AND public.fieldgrid_has_platform_permission('global.content.manage')
        );
      CREATE POLICY knowledgebase_media_management_update
        ON storage.objects FOR UPDATE TO authenticated
        USING (
          bucket_id='knowledgebase-media'
          AND public.fieldgrid_has_platform_permission('global.content.manage')
        )
        WITH CHECK (
          bucket_id='knowledgebase-media'
          AND public.fieldgrid_has_platform_permission('global.content.manage')
        );
      CREATE POLICY knowledgebase_media_management_write
        ON storage.objects FOR INSERT TO authenticated
        WITH CHECK (
          bucket_id='knowledgebase-media'
          AND public.fieldgrid_has_platform_permission('global.content.manage')
        );
      CREATE POLICY news_hero_delete_management
        ON storage.objects FOR DELETE TO authenticated
        USING (
          bucket_id='news-hero'
          AND public.fieldgrid_has_platform_permission('global.content.manage')
        );
      CREATE POLICY news_hero_insert_management
        ON storage.objects FOR INSERT TO authenticated
        WITH CHECK (
          bucket_id='news-hero'
          AND public.fieldgrid_has_platform_permission('global.content.manage')
        );
      CREATE POLICY news_hero_public_read
        ON storage.objects FOR SELECT TO anon,authenticated
        USING (bucket_id='news-hero');
      CREATE POLICY news_hero_update_management
        ON storage.objects FOR UPDATE TO authenticated
        USING (
          bucket_id='news-hero'
          AND public.fieldgrid_has_platform_permission('global.content.manage')
        )
        WITH CHECK (
          bucket_id='news-hero'
          AND public.fieldgrid_has_platform_permission('global.content.manage')
        );
      CREATE POLICY org_assets_management_write
        ON storage.objects TO authenticated
        USING (
          bucket_id='org-assets'
          AND public.fieldgrid_has_platform_permission('global.content.manage')
        )
        WITH CHECK (
          bucket_id='org-assets'
          AND public.fieldgrid_has_platform_permission('global.content.manage')
        );
      CREATE POLICY org_assets_public_read
        ON storage.objects FOR SELECT TO anon,authenticated
        USING (bucket_id='org-assets');
      CREATE POLICY personnel_avatars_public_read
        ON storage.objects FOR SELECT TO anon,authenticated
        USING (bucket_id='personnel-avatars');
      CREATE POLICY release_media_management_delete
        ON storage.objects FOR DELETE TO authenticated
        USING (
          bucket_id='release-media'
          AND public.fieldgrid_has_platform_permission('global.content.manage')
        );
      CREATE POLICY release_media_management_update
        ON storage.objects FOR UPDATE TO authenticated
        USING (
          bucket_id='release-media'
          AND public.fieldgrid_has_platform_permission('global.content.manage')
        )
        WITH CHECK (
          bucket_id='release-media'
          AND public.fieldgrid_has_platform_permission('global.content.manage')
        );
      CREATE POLICY release_media_management_write
        ON storage.objects FOR INSERT TO authenticated
        WITH CHECK (
          bucket_id='release-media'
          AND public.fieldgrid_has_platform_permission('global.content.manage')
        );
    END;
    $fieldgrid_storage_reconcile$;

    CREATE OR REPLACE FUNCTION ${qualified(HOSTED_MIGRATION_BRIDGE_SCHEMA, "storage_state")}()
    RETURNS jsonb
    LANGUAGE plpgsql
    STABLE
    SECURITY DEFINER
    SET search_path TO pg_catalog, pg_temp
    AS $fieldgrid_storage_state$
    BEGIN
      IF session_user <> '${MIGRATION_ROLE}' THEN
        RAISE EXCEPTION 'hosted_migration_bridge_principal_invalid';
      END IF;
      RETURN (
        SELECT pg_catalog.jsonb_build_object(
          'buckets',COALESCE(
            pg_catalog.jsonb_agg(
              pg_catalog.jsonb_build_object(
                'id',bucket.id,
                'name',bucket.name,
                'owner',bucket.owner,
                'ownerId',bucket.owner_id,
                'public',bucket.public,
                'fileSizeLimit',bucket.file_size_limit::text,
                'allowedMimeTypes',bucket.allowed_mime_types
              ) ORDER BY bucket.id
            ),
            '[]'::jsonb
          ),
          'objectCount',(SELECT pg_catalog.count(*) FROM storage.objects)
        )
        FROM storage.buckets AS bucket
      );
    END;
    $fieldgrid_storage_state$;

    ALTER FUNCTION ${qualified(HOSTED_MIGRATION_BRIDGE_SCHEMA, "reconcile_storage")}() OWNER TO postgres;
    ALTER FUNCTION ${qualified(HOSTED_MIGRATION_BRIDGE_SCHEMA, "storage_state")}() OWNER TO postgres;
    REVOKE ALL ON FUNCTION
      ${qualified(HOSTED_MIGRATION_BRIDGE_SCHEMA, "reconcile_storage")}(),
      ${qualified(HOSTED_MIGRATION_BRIDGE_SCHEMA, "storage_state")}()
      FROM PUBLIC;
    GRANT EXECUTE ON FUNCTION ${qualified(HOSTED_MIGRATION_BRIDGE_SCHEMA, "reconcile_storage")}()
      TO postgres;
    GRANT EXECUTE ON FUNCTION ${qualified(HOSTED_MIGRATION_BRIDGE_SCHEMA, "storage_state")}()
      TO ${identifier(MIGRATION_ROLE)};
    REVOKE USAGE,CREATE ON SCHEMA ${identifier(HOSTED_MIGRATION_BRIDGE_SCHEMA)}
      FROM supabase_storage_admin;
  `);
}

async function proveHostedStoragePolicyCapability(client) {
  await client.query(`
    DO $fieldgrid_policy_probe_preflight$
    BEGIN
      IF pg_catalog.to_regclass('storage.objects') IS NULL THEN
        RAISE EXCEPTION 'hosted_storage_policy_probe_table_missing';
      END IF;
      IF EXISTS (
        SELECT 1 FROM pg_catalog.pg_policies
        WHERE schemaname='storage' AND tablename='objects'
          AND policyname='${HOSTED_STORAGE_POLICY_CAPABILITY_PROBE}'
      ) THEN
        RAISE EXCEPTION 'hosted_storage_policy_probe_collision';
      END IF;
    END
    $fieldgrid_policy_probe_preflight$;

    CREATE POLICY ${identifier(HOSTED_STORAGE_POLICY_CAPABILITY_PROBE)}
      ON storage.objects FOR SELECT TO ${identifier(MIGRATION_ROLE)}
      USING (false);
    DROP POLICY ${identifier(HOSTED_STORAGE_POLICY_CAPABILITY_PROBE)}
      ON storage.objects;

    DO $fieldgrid_policy_probe_cleanup$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM pg_catalog.pg_policies
        WHERE schemaname='storage' AND tablename='objects'
          AND policyname='${HOSTED_STORAGE_POLICY_CAPABILITY_PROBE}'
      ) THEN
        RAISE EXCEPTION 'hosted_storage_policy_probe_cleanup_failed';
      END IF;
    END
    $fieldgrid_policy_probe_cleanup$;
  `);
}

export async function assertLegacyPrincipal(client) {
  const result = await client.query(`
    SELECT current_user::text AS current_user,session_user::text AS session_user,
      current_database() AS database_name,rolsuper,rolbypassrls,rolcreaterole,
      rolcreatedb,rolreplication,rolinherit,rolcanlogin
    FROM pg_roles WHERE rolname=current_user
  `);
  const row = result.rows[0];
  requireThat(
    result.rows.length === 1 &&
      row.current_user === "postgres" &&
      row.session_user === "postgres" &&
      row.database_name === "postgres" &&
      row.rolsuper === false &&
      row.rolbypassrls === true &&
      row.rolcreaterole === true &&
      row.rolcreatedb === true &&
      row.rolcanlogin === true,
    "LEGACY_PRINCIPAL_INVALID",
  );
  return {
    name: row.current_user,
    superuser: row.rolsuper,
    bypassRls: row.rolbypassrls,
    createRole: row.rolcreaterole,
    createDb: row.rolcreatedb,
    replication: row.rolreplication,
    inherit: row.rolinherit,
    login: row.rolcanlogin,
    database: row.database_name,
  };
}

export async function managedCatalogSnapshot(client) {
  const schemas = await client.query(
    `SELECT nspname,pg_get_userbyid(nspowner) AS owner
     FROM pg_namespace WHERE nspname=ANY($1::text[]) ORDER BY nspname`,
    [[...MANAGED_SCHEMAS]],
  );
  const relations = await client.query(
    `SELECT n.nspname,c.relname,c.relkind,pg_get_userbyid(c.relowner) AS owner,
       c.relrowsecurity,c.relforcerowsecurity
     FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
     WHERE n.nspname=ANY($1::text[])
     ORDER BY n.nspname,c.relname,c.relkind`,
    [[...MANAGED_SCHEMAS]],
  );
  const columns = await client.query(
    `SELECT n.nspname,c.relname,a.attname,a.atttypid::text,a.atttypmod,
       a.attnotnull,a.attidentity,a.attgenerated,coll.collname AS collation,
       pg_get_expr(d.adbin,d.adrelid) AS default_expression
     FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid
     JOIN pg_namespace n ON n.oid=c.relnamespace
     LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
     LEFT JOIN pg_collation coll ON coll.oid=a.attcollation
     WHERE n.nspname=ANY($1::text[]) AND a.attnum>0 AND NOT a.attisdropped
     ORDER BY n.nspname,c.relname,a.attnum`,
    [[...MANAGED_SCHEMAS]],
  );
  const routines = await client.query(
    `SELECT n.nspname,p.proname,p.prokind,
       pg_get_function_identity_arguments(p.oid) AS identity_arguments,
       pg_get_userbyid(p.proowner) AS owner,p.prosecdef,p.proconfig
     FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname=ANY($1::text[])
     ORDER BY n.nspname,p.proname,identity_arguments`,
    [[...MANAGED_SCHEMAS]],
  );
  const types = await client.query(
    `SELECT n.nspname,t.typname,t.typtype,pg_get_userbyid(t.typowner) AS owner
     FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace
     WHERE n.nspname=ANY($1::text[])
     ORDER BY n.nspname,t.typname`,
    [[...MANAGED_SCHEMAS]],
  );
  const policies = await client.query(
    `SELECT schemaname,tablename,policyname,permissive,roles,cmd,qual,with_check
     FROM pg_policies WHERE schemaname=ANY($1::text[])
     ORDER BY schemaname,tablename,policyname`,
    [[...MANAGED_SCHEMAS]],
  );
  const triggers = await client.query(
    `SELECT n.nspname,c.relname,t.tgname,t.tgenabled,pg_get_triggerdef(t.oid) AS definition
     FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
     JOIN pg_namespace n ON n.oid=c.relnamespace
     WHERE n.nspname=ANY($1::text[]) AND NOT t.tgisinternal
     ORDER BY n.nspname,c.relname,t.tgname`,
    [[...MANAGED_SCHEMAS]],
  );
  const extensions = await client.query(
    `SELECT e.extname,e.extversion,n.nspname AS schema_name
     FROM pg_extension e JOIN pg_namespace n ON n.oid=e.extnamespace
     ORDER BY e.extname`,
  );
  const accessControl = await client.query(
    `SELECT object_kind,schema_name,object_name,subobject_name,acl_entry
     FROM (
       SELECT 'schema'::text AS object_kind,n.nspname AS schema_name,
         NULL::name AS object_name,NULL::name AS subobject_name,
         pg_get_userbyid(n.nspowner) AS owner_name,acl::text AS acl_entry
       FROM pg_namespace n CROSS JOIN LATERAL unnest(COALESCE(n.nspacl,'{}'::aclitem[])) acl
       WHERE n.nspname=ANY($1::text[])
       UNION ALL
       SELECT 'relation',n.nspname,c.relname,NULL::name,
         pg_get_userbyid(c.relowner),acl::text
       FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
       CROSS JOIN LATERAL unnest(COALESCE(c.relacl,'{}'::aclitem[])) acl
       WHERE n.nspname=ANY($1::text[])
       UNION ALL
       SELECT 'column',n.nspname,c.relname,a.attname,
         pg_get_userbyid(c.relowner),acl::text
       FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid
       JOIN pg_namespace n ON n.oid=c.relnamespace
       CROSS JOIN LATERAL unnest(COALESCE(a.attacl,'{}'::aclitem[])) acl
       WHERE n.nspname=ANY($1::text[]) AND a.attnum>0 AND NOT a.attisdropped
       UNION ALL
       SELECT 'routine',n.nspname,p.proname,NULL::name,
         pg_get_userbyid(p.proowner),acl::text
       FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
       CROSS JOIN LATERAL unnest(COALESCE(p.proacl,'{}'::aclitem[])) acl
       WHERE n.nspname=ANY($1::text[])
       UNION ALL
       SELECT 'type',n.nspname,t.typname,NULL::name,
         pg_get_userbyid(t.typowner),acl::text
       FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace
       CROSS JOIN LATERAL unnest(COALESCE(t.typacl,'{}'::aclitem[])) acl
       WHERE n.nspname=ANY($1::text[])
     ) entries
     WHERE NOT (
       split_part(acl_entry,'=',1)=owner_name
       AND object_kind='schema'
       AND split_part(split_part(acl_entry,'=',2),'/',1)='UC'
     )
     ORDER BY object_kind,schema_name,object_name,subobject_name,
       acl_entry`,
    [[...MANAGED_SCHEMAS]],
  );
  const value = {
    schemas: schemas.rows,
    relations: relations.rows,
    columns: columns.rows,
    routines: routines.rows,
    types: types.rows,
    policies: policies.rows,
    triggers: triggers.rows,
    extensions: extensions.rows,
    accessControl: accessControl.rows,
  };
  const legacyBootstrapAuthAcl = accessControl.rows.filter((entry) => {
    const [grantee, grant] = entry.acl_entry.split("=", 2);
    const [privileges, grantor] = (grant ?? "").split("/", 2);
    return (
      grantee === MIGRATION_ROLE &&
      grantor === "postgres" &&
      entry.schema_name === "auth" &&
      ((entry.object_kind === "schema" && privileges === "U") ||
        (entry.object_kind === "column" &&
          entry.object_name === "users" &&
          LEGACY_BOOTSTRAP_AUTH_COLUMNS.includes(entry.subobject_name) &&
          privileges === "r"))
    );
  });
  const legacyValue = {
    ...value,
    accessControl: accessControl.rows.filter(
      (entry) => !legacyBootstrapAuthAcl.includes(entry),
    ),
  };
  const legacyAclKeys = legacyBootstrapAuthAcl.map(
    ({ object_kind: kind, subobject_name: column }) =>
      kind === "schema" ? "schema:auth" : `column:auth.users.${column}`,
  );
  const expectedColumnAclKeys = LEGACY_BOOTSTRAP_AUTH_COLUMNS.map(
    (column) => `column:auth.users.${column}`,
  );
  const allowedLegacyAclKeys = new Set([
    "schema:auth",
    ...expectedColumnAclKeys,
  ]);
  const uniqueLegacyAclKeys = new Set(legacyAclKeys);
  return {
    ...value,
    digest: digest(value),
    legacyBootstrapDigest: digest(legacyValue),
    legacyBootstrapAuthAclCompatible:
      uniqueLegacyAclKeys.size === legacyAclKeys.length &&
      (legacyAclKeys.length === 3 || legacyAclKeys.length === 4) &&
      legacyAclKeys.every((key) => allowedLegacyAclKeys.has(key)) &&
      expectedColumnAclKeys.every((key) => uniqueLegacyAclKeys.has(key)),
    legacyBootstrapAuthAclCount: legacyAclKeys.length,
  };
}

export async function applicationOwnershipInventory(client) {
  const schemas = await client.query(
    `SELECT nspname AS schema_name,pg_get_userbyid(nspowner) AS owner
     FROM pg_namespace WHERE nspname=ANY($1::text[]) ORDER BY nspname`,
    [[...APP_SCHEMAS]],
  );
  const relations = await client.query(
    `SELECT n.nspname AS schema_name,c.relkind,pg_get_userbyid(c.relowner) AS owner,
       count(*)::int AS count
     FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
     WHERE n.nspname=ANY($1::text[]) AND c.relkind IN ('r','p','S','v','m','f')
     GROUP BY n.nspname,c.relkind,c.relowner ORDER BY 1,2,3`,
    [[...APP_SCHEMAS]],
  );
  const routines = await client.query(
    `SELECT n.nspname AS schema_name,p.prokind,p.prosecdef,
       pg_get_userbyid(p.proowner) AS owner,count(*)::int AS count
     FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname=ANY($1::text[])
     GROUP BY n.nspname,p.prokind,p.prosecdef,p.proowner ORDER BY 1,2,3,4`,
    [[...APP_SCHEMAS]],
  );
  const target = await client.query(
    `SELECT rolname,rolsuper,rolbypassrls,rolcreaterole,rolcreatedb,
       rolreplication,rolinherit,rolcanlogin
     FROM pg_roles WHERE rolname=$1`,
    [MIGRATION_ROLE],
  );
  const runtime = await runtimeMembership(client);
  return {
    schemas: schemas.rows,
    relations: relations.rows,
    routines: routines.rows,
    targetRoleExists: target.rows.length === 1,
    targetRole: target.rows[0] ?? null,
    runtimeMembership: runtime,
  };
}

export async function bootstrapPlan(client) {
  const legacy = await assertLegacyPrincipal(client);
  await client.query("BEGIN READ ONLY");
  try {
    const ownership = await applicationOwnershipInventory(client);
    const managed = await managedCatalogSnapshot(client);
    const hostedProviderCompatibility =
      await hostedProviderCompatibilityInventory(client);
    await client.query("COMMIT");
    return {
      principal: legacy,
      applicationSchemas: ownership.schemas,
      applicationRelationOwners: ownership.relations,
      applicationRoutineOwners: ownership.routines,
      targetRoleExists: ownership.targetRoleExists,
      targetRole: ownership.targetRole,
      runtimeMembership: ownership.runtimeMembership,
      managedCatalogDigest: managed.digest,
      legacyBootstrapCatalogDigest: managed.legacyBootstrapDigest,
      legacyBootstrapAuthAclCompatible:
        managed.legacyBootstrapAuthAclCompatible,
      legacyBootstrapAuthAclCount: managed.legacyBootstrapAuthAclCount,
      hostedProviderCompatibility,
    };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  }
}

async function runtimeMembership(client) {
  const result = await client.query(
    `SELECT role.rolname AS role_name,member.rolname AS member_name,
       grantor.rolname AS grantor_name,m.admin_option,m.inherit_option,m.set_option
     FROM pg_auth_members m
     JOIN pg_roles role ON role.oid=m.roleid
     JOIN pg_roles member ON member.oid=m.member
     JOIN pg_roles grantor ON grantor.oid=m.grantor
     WHERE role.rolname=ANY($1::text[])
        OR member.rolname=ANY($1::text[])
        OR role.rolname=$2 OR member.rolname=$2
     ORDER BY role.rolname,member.rolname,grantor.rolname`,
    [[...RUNTIME_ROLES], MIGRATION_ROLE],
  );
  return result.rows;
}

async function verifyRuntimeRolesSafe(client) {
  const result = await client.query(
    `SELECT rolname,rolsuper,rolbypassrls,rolcreaterole,rolcreatedb,
       rolreplication,rolcanlogin
     FROM pg_roles WHERE rolname=ANY($1::text[]) ORDER BY rolname`,
    [[...RUNTIME_ROLES]],
  );
  requireThat(
    result.rows.length === 2 &&
      result.rows.every(
        (row) =>
          row.rolsuper === false &&
          row.rolbypassrls === false &&
          row.rolcreaterole === false &&
          row.rolcreatedb === false &&
          row.rolreplication === false &&
          row.rolcanlogin === false,
      ),
    "RUNTIME_ROLE_ATTRIBUTES_INVALID",
  );
}

async function transferRelations(client) {
  const result = await client.query(
    `SELECT n.nspname AS schema_name,c.relname,c.relkind,
       pg_get_userbyid(c.relowner) AS owner
     FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
     WHERE n.nspname=ANY($1::text[]) AND c.relkind IN ('r','p','S','v','m','f')
     ORDER BY n.nspname,c.relname`,
    [[...APP_SCHEMAS]],
  );
  const kind = {
    r: "TABLE",
    p: "TABLE",
    S: "SEQUENCE",
    v: "VIEW",
    m: "MATERIALIZED VIEW",
    f: "FOREIGN TABLE",
  };
  for (const row of result.rows) {
    requireThat(
      row.owner === "postgres" || row.owner === MIGRATION_ROLE,
      "APPLICATION_OBJECT_OWNER_INVALID",
    );
    if (row.owner !== MIGRATION_ROLE) {
      await client.query(
        `ALTER ${kind[row.relkind]} ${qualified(row.schema_name, row.relname)} OWNER TO ${identifier(MIGRATION_ROLE)}`,
      );
    }
  }
}

async function transferRoutines(client) {
  const result = await client.query(
    `SELECT n.nspname AS schema_name,p.proname,p.prokind,p.prosecdef,
       pg_get_userbyid(p.proowner) AS owner,
       pg_get_function_identity_arguments(p.oid) AS identity_arguments
     FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname=ANY($1::text[])
     ORDER BY n.nspname,p.proname,identity_arguments`,
    [[...APP_SCHEMAS]],
  );
  for (const row of result.rows) {
    requireThat(
      row.owner === "postgres" || row.owner === MIGRATION_ROLE,
      "APPLICATION_OBJECT_OWNER_INVALID",
    );
    if (row.owner === MIGRATION_ROLE || row.prosecdef) continue;
    const type =
      row.prokind === "p"
        ? "PROCEDURE"
        : row.prokind === "a"
          ? "AGGREGATE"
          : "FUNCTION";
    await client.query(
      `ALTER ${type} ${qualified(row.schema_name, row.proname)}(${row.identity_arguments}) OWNER TO ${identifier(MIGRATION_ROLE)}`,
    );
  }
}

async function transferStandaloneTypes(client) {
  const result = await client.query(
    `SELECT n.nspname AS schema_name,t.typname,pg_get_userbyid(t.typowner) AS owner
     FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace
     LEFT JOIN pg_class c ON c.oid=t.typrelid
     WHERE n.nspname=ANY($1::text[]) AND t.typelem=0
       AND (t.typrelid=0 OR c.relkind='c')
     ORDER BY n.nspname,t.typname`,
    [[...APP_SCHEMAS]],
  );
  for (const row of result.rows) {
    requireThat(
      row.owner === "postgres" || row.owner === MIGRATION_ROLE,
      "APPLICATION_OBJECT_OWNER_INVALID",
    );
    if (row.owner !== MIGRATION_ROLE) {
      await client.query(
        `ALTER TYPE ${qualified(row.schema_name, row.typname)} OWNER TO ${identifier(MIGRATION_ROLE)}`,
      );
    }
  }
}

async function assertNoUnsupportedOwnedObjects(client) {
  const result = await client.query(
    `SELECT object_kind,count(*)::int AS count FROM (
       SELECT 'collation' AS object_kind FROM pg_collation x JOIN pg_namespace n ON n.oid=x.collnamespace WHERE n.nspname=ANY($1::text[])
       UNION ALL SELECT 'conversion' FROM pg_conversion x JOIN pg_namespace n ON n.oid=x.connamespace WHERE n.nspname=ANY($1::text[])
       UNION ALL SELECT 'operator' FROM pg_operator x JOIN pg_namespace n ON n.oid=x.oprnamespace WHERE n.nspname=ANY($1::text[])
       UNION ALL SELECT 'operator_class' FROM pg_opclass x JOIN pg_namespace n ON n.oid=x.opcnamespace WHERE n.nspname=ANY($1::text[])
       UNION ALL SELECT 'operator_family' FROM pg_opfamily x JOIN pg_namespace n ON n.oid=x.opfnamespace WHERE n.nspname=ANY($1::text[])
       UNION ALL SELECT 'text_search_dictionary' FROM pg_ts_dict x JOIN pg_namespace n ON n.oid=x.dictnamespace WHERE n.nspname=ANY($1::text[])
       UNION ALL SELECT 'text_search_configuration' FROM pg_ts_config x JOIN pg_namespace n ON n.oid=x.cfgnamespace WHERE n.nspname=ANY($1::text[])
       UNION ALL SELECT 'statistics' FROM pg_statistic_ext x JOIN pg_namespace n ON n.oid=x.stxnamespace WHERE n.nspname=ANY($1::text[])
     ) unsupported GROUP BY object_kind ORDER BY object_kind`,
    [[...APP_SCHEMAS]],
  );
  requireThat(result.rows.length === 0, "UNSUPPORTED_APPLICATION_OBJECT");
}

async function ensureRole(client, verifier) {
  const existing = await client.query(
    `SELECT rolsuper,rolbypassrls,rolcreatedb,rolreplication
     FROM pg_roles WHERE rolname=$1`,
    [MIGRATION_ROLE],
  );
  requireThat(
    existing.rows.length === 0 ||
      (existing.rows[0].rolsuper === false &&
        existing.rows[0].rolbypassrls === false &&
        existing.rows[0].rolcreatedb === false &&
        existing.rows[0].rolreplication === false),
    "EXISTING_TARGET_ROLE_PRIVILEGED",
  );
  if (existing.rows.length === 0) {
    await client.query(
      `CREATE ROLE ${identifier(MIGRATION_ROLE)} LOGIN CREATEROLE NOCREATEDB NOSUPERUSER NOBYPASSRLS NOREPLICATION NOINHERIT`,
    );
  }
  await client.query(
    "SELECT set_config('fieldgrid.bootstrap.verifier',$1,true)",
    [verifier],
  );
  await client.query(`
    DO $bootstrap$
    BEGIN
      EXECUTE format(
        'ALTER ROLE %I LOGIN CREATEROLE NOCREATEDB NOINHERIT PASSWORD %L',
        '${MIGRATION_ROLE}',current_setting('fieldgrid.bootstrap.verifier')
      );
    END
    $bootstrap$
  `);
}

export async function hostedProviderCompatibilityInventory(client) {
  const providerStorage = await client.query(`
    SELECT
      (SELECT pg_get_userbyid(namespace_row.nspowner)
         FROM pg_namespace namespace_row
        WHERE namespace_row.nspname='storage') AS schema_owner,
      (SELECT pg_get_userbyid(relation.relowner)
         FROM pg_class relation
         JOIN pg_namespace namespace_row ON namespace_row.oid=relation.relnamespace
        WHERE namespace_row.nspname='storage' AND relation.relname='buckets'
          AND relation.relkind IN ('r','p')) AS buckets_owner,
      (SELECT pg_get_userbyid(relation.relowner)
         FROM pg_class relation
         JOIN pg_namespace namespace_row ON namespace_row.oid=relation.relnamespace
        WHERE namespace_row.nspname='storage' AND relation.relname='objects'
          AND relation.relkind IN ('r','p')) AS objects_owner,
      (SELECT pg_get_userbyid(routine.proowner)
         FROM pg_proc routine
        WHERE routine.oid=pg_catalog.to_regprocedure('storage.foldername(text)')) AS foldername_owner,
      COALESCE(pg_catalog.has_schema_privilege(
        (SELECT role_row.oid FROM pg_roles role_row
          WHERE role_row.rolname='supabase_storage_admin'),
        (SELECT namespace_row.oid FROM pg_namespace namespace_row
          WHERE namespace_row.nspname='storage'),
        'USAGE'
      ),false) AS storage_admin_usage,
      COALESCE(pg_has_role(
        (SELECT role_row.oid FROM pg_roles role_row
          WHERE role_row.rolname=current_user),
        (SELECT role_row.oid FROM pg_roles role_row
          WHERE role_row.rolname='supabase_storage_admin'),
        'MEMBER'
      ),false) AS postgres_is_storage_role_member,
      COALESCE(pg_has_role(
        (SELECT role_row.oid FROM pg_roles role_row
          WHERE role_row.rolname=current_user),
        (SELECT role_row.oid FROM pg_roles role_row
          WHERE role_row.rolname='supabase_storage_admin'),
        'USAGE'
      ),false) AS postgres_inherits_storage_role,
      COALESCE(pg_has_role(
        (SELECT role_row.oid FROM pg_roles role_row
          WHERE role_row.rolname=current_user),
        (SELECT role_row.oid FROM pg_roles role_row
          WHERE role_row.rolname='supabase_storage_admin'),
        'SET'
      ),false) AS postgres_can_set_storage_role,
      COALESCE(pg_has_role(
        (SELECT role_row.oid FROM pg_roles role_row
          WHERE role_row.rolname=current_user),
        (SELECT role_row.oid FROM pg_roles role_row
          WHERE role_row.rolname='supabase_admin'),
        'SET'
      ),false) AS postgres_can_set_supabase_admin,
      EXISTS (
        SELECT 1
        FROM pg_auth_members membership
        JOIN pg_roles granted_role ON granted_role.oid=membership.roleid
        JOIN pg_roles member_role ON member_role.oid=membership.member
        WHERE granted_role.rolname='supabase_storage_admin'
          AND member_role.rolname='supabase_admin'
          AND membership.admin_option
      ) AS supabase_admin_storage_admin_option,
      COALESCE(
        (
          NULLIF(
            pg_catalog.current_setting('supautils.policy_grants',true),''
          )::jsonb -> current_user
        ) ? 'storage.objects',
        false
      ) AS postgres_can_manage_storage_policies,
      COALESCE(pg_catalog.has_table_privilege(
        current_user,pg_catalog.to_regclass('storage.buckets'),'SELECT'
      ),false) AS postgres_can_select_storage_buckets,
      COALESCE(pg_catalog.has_table_privilege(
        current_user,pg_catalog.to_regclass('storage.buckets'),'INSERT'
      ),false) AS postgres_can_insert_storage_buckets,
      COALESCE(pg_catalog.has_table_privilege(
        current_user,pg_catalog.to_regclass('storage.buckets'),'UPDATE'
      ),false) AS postgres_can_update_storage_buckets,
      COALESCE(pg_catalog.has_table_privilege(
        current_user,pg_catalog.to_regclass('storage.objects'),'SELECT'
      ),false) AS postgres_can_select_storage_objects,
      COALESCE(pg_catalog.has_function_privilege(
        current_user,
        pg_catalog.to_regprocedure('storage.foldername(text)'),
        'EXECUTE'
      ),false) AS postgres_can_execute_storage_foldername,
      (SELECT pg_get_userbyid(namespace_row.nspowner)
         FROM pg_namespace namespace_row
        WHERE namespace_row.nspname='${HOSTED_MIGRATION_BRIDGE_SCHEMA}')
        AS existing_bridge_schema_owner,
      (SELECT pg_get_userbyid(routine.proowner)
         FROM pg_proc routine
        WHERE routine.oid=pg_catalog.to_regprocedure(
          '${HOSTED_MIGRATION_BRIDGE_SCHEMA}.reconcile_storage()'
        )) AS existing_reconcile_storage_owner,
      (SELECT pg_get_userbyid(routine.proowner)
         FROM pg_proc routine
        WHERE routine.oid=pg_catalog.to_regprocedure(
          '${HOSTED_MIGRATION_BRIDGE_SCHEMA}.storage_state()'
        )) AS existing_storage_state_owner
  `);
  requireThat(
    providerStorage.rows.length === 1,
    "HOSTED_PROVIDER_STORAGE_INVENTORY_INVALID",
  );
  return providerStorage.rows[0];
}

async function installHostedMigrationBridge(client) {
  const existing = await client.query(
    `SELECT pg_get_userbyid(nspowner) AS owner
     FROM pg_namespace WHERE nspname=$1`,
    [HOSTED_MIGRATION_BRIDGE_SCHEMA],
  );
  requireThat(
    existing.rows.length === 0 || existing.rows[0]?.owner === "postgres",
    "HOSTED_MIGRATION_BRIDGE_OWNER_INVALID",
  );
  const existingStorageFunctions = await client.query(
    `SELECT routine.proname,pg_get_userbyid(routine.proowner) AS owner
     FROM pg_proc routine
     JOIN pg_namespace namespace_row ON namespace_row.oid=routine.pronamespace
     WHERE namespace_row.nspname=$1
       AND routine.proname=ANY($2::text[])
     ORDER BY routine.proname`,
    [HOSTED_MIGRATION_BRIDGE_SCHEMA, ["reconcile_storage", "storage_state"]],
  );
  requireThat(
    existingStorageFunctions.rows.every(({ owner }) => owner === "postgres"),
    "HOSTED_MIGRATION_BRIDGE_STORAGE_FUNCTION_OWNER_INVALID",
  );
  const providerAuth = await client.query(`
    SELECT
      pg_catalog.to_regprocedure('auth.uid()') IS NOT NULL AS uid,
      pg_catalog.to_regprocedure('auth.jwt()') IS NOT NULL AS jwt,
      pg_catalog.to_regprocedure('auth.role()') IS NOT NULL AS role
  `);
  requireThat(
    providerAuth.rows.length === 1 &&
      Object.values(providerAuth.rows[0] ?? {}).every(
        (value) => value === true,
      ),
    "HOSTED_PROVIDER_AUTH_HELPERS_MISSING",
  );
  const providerStorage = await hostedProviderCompatibilityInventory(client);
  requireThat(
    ["supabase_admin", "supabase_storage_admin"].includes(
      providerStorage.schema_owner,
    ),
    "HOSTED_PROVIDER_STORAGE_SCHEMA_OWNER_INVALID",
  );
  requireThat(
    providerStorage.buckets_owner === "supabase_storage_admin" &&
      providerStorage.objects_owner === "supabase_storage_admin",
    "HOSTED_PROVIDER_STORAGE_RELATION_OWNER_INVALID",
  );
  requireThat(
    providerStorage.foldername_owner === "supabase_storage_admin",
    "HOSTED_PROVIDER_STORAGE_HELPER_OWNER_INVALID",
  );
  requireThat(
    providerStorage.storage_admin_usage === true,
    "HOSTED_PROVIDER_STORAGE_USAGE_INVALID",
  );
  requireThat(
    providerStorage.postgres_can_manage_storage_policies === true,
    "HOSTED_PROVIDER_STORAGE_POLICY_MANAGEMENT_INVALID",
  );
  requireThat(
    providerStorage.postgres_can_select_storage_buckets === true,
    "HOSTED_PROVIDER_STORAGE_BUCKET_SELECT_INVALID",
  );
  requireThat(
    providerStorage.postgres_can_insert_storage_buckets === true,
    "HOSTED_PROVIDER_STORAGE_BUCKET_INSERT_INVALID",
  );
  requireThat(
    providerStorage.postgres_can_update_storage_buckets === true,
    "HOSTED_PROVIDER_STORAGE_BUCKET_UPDATE_INVALID",
  );
  requireThat(
    providerStorage.postgres_can_select_storage_objects === true,
    "HOSTED_PROVIDER_STORAGE_OBJECT_SELECT_INVALID",
  );
  requireThat(
    providerStorage.postgres_can_execute_storage_foldername === true,
    "HOSTED_PROVIDER_STORAGE_FOLDERNAME_EXECUTE_INVALID",
  );
  await proveHostedStoragePolicyCapability(client);
  await client.query(`
    CREATE SCHEMA IF NOT EXISTS ${identifier(HOSTED_MIGRATION_BRIDGE_SCHEMA)} AUTHORIZATION postgres;
    REVOKE ALL ON SCHEMA ${identifier(HOSTED_MIGRATION_BRIDGE_SCHEMA)} FROM PUBLIC;

    CREATE OR REPLACE FUNCTION ${qualified(HOSTED_MIGRATION_BRIDGE_SCHEMA, "uid")}()
    RETURNS uuid
    LANGUAGE sql
    STABLE
    SECURITY DEFINER
    SET search_path TO pg_catalog, pg_temp
    AS 'SELECT auth.uid()';

    CREATE OR REPLACE FUNCTION ${qualified(HOSTED_MIGRATION_BRIDGE_SCHEMA, "jwt")}()
    RETURNS jsonb
    LANGUAGE sql
    STABLE
    SECURITY DEFINER
    SET search_path TO pg_catalog, pg_temp
    AS 'SELECT auth.jwt()';

    CREATE OR REPLACE FUNCTION ${qualified(HOSTED_MIGRATION_BRIDGE_SCHEMA, "role")}()
    RETURNS text
    LANGUAGE sql
    STABLE
    SECURITY DEFINER
    SET search_path TO pg_catalog, pg_temp
    AS 'SELECT auth.role()';

    CREATE OR REPLACE FUNCTION ${qualified(HOSTED_MIGRATION_BRIDGE_SCHEMA, "foldername")}(p_name text)
    RETURNS text[]
    LANGUAGE sql
    IMMUTABLE
    SECURITY DEFINER
    SET search_path TO pg_catalog, pg_temp
    AS 'SELECT storage.foldername(p_name)';

    CREATE OR REPLACE FUNCTION ${qualified(HOSTED_MIGRATION_BRIDGE_SCHEMA, "prepare_disposable_rebuild")}()
    RETURNS void
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path TO pg_catalog, pg_temp
    AS $fieldgrid_bridge_prepare$
    DECLARE
      runtime_role name;
    BEGIN
      IF session_user <> '${MIGRATION_ROLE}' THEN
        RAISE EXCEPTION 'hosted_migration_bridge_principal_invalid';
      END IF;
      IF EXISTS (
        SELECT 1
        FROM pg_catalog.pg_class relation
        JOIN pg_catalog.pg_namespace namespace_row
          ON namespace_row.oid=relation.relnamespace
        WHERE namespace_row.nspname IN ('public','app_private','drizzle')
          AND relation.relkind IN ('r','p','S','v','m','f')
      ) THEN
        RAISE EXCEPTION 'hosted_migration_bridge_requires_empty_application_schemas';
      END IF;
      FOR runtime_role IN
        SELECT role_row.rolname
        FROM pg_catalog.pg_roles role_row
        WHERE role_row.rolname IN (
          'fieldgrid_runtime_app','fieldgrid_runtime_data'
        )
        ORDER BY role_row.rolname
      LOOP
        EXECUTE pg_catalog.format(
          'REVOKE USAGE ON SCHEMA ${identifier(HOSTED_MIGRATION_BRIDGE_SCHEMA)} FROM %I',
          runtime_role
        );
        EXECUTE pg_catalog.format(
          'REVOKE EXECUTE ON FUNCTION ${qualified(HOSTED_MIGRATION_BRIDGE_SCHEMA, "uid")}(), ${qualified(HOSTED_MIGRATION_BRIDGE_SCHEMA, "jwt")}(), ${qualified(HOSTED_MIGRATION_BRIDGE_SCHEMA, "role")}(), ${qualified(HOSTED_MIGRATION_BRIDGE_SCHEMA, "foldername")}(text) FROM %I',
          runtime_role
        );
      END LOOP;
    END;
    $fieldgrid_bridge_prepare$;

    CREATE OR REPLACE FUNCTION ${qualified(HOSTED_MIGRATION_BRIDGE_SCHEMA, "abort_disposable_rebuild")}()
    RETURNS void
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path TO pg_catalog, pg_temp
    AS $fieldgrid_bridge_abort$
    BEGIN
      IF session_user <> '${MIGRATION_ROLE}' THEN
        RAISE EXCEPTION 'hosted_migration_bridge_principal_invalid';
      END IF;
      REVOKE ${identifier(MIGRATION_ROLE)} FROM postgres GRANTED BY postgres;
    END;
    $fieldgrid_bridge_abort$;

    CREATE OR REPLACE FUNCTION ${qualified(HOSTED_MIGRATION_BRIDGE_SCHEMA, "finalize_disposable_rebuild")}()
    RETURNS void
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path TO pg_catalog, pg_temp
    AS $fieldgrid_bridge_finalize$
    DECLARE
      constraint_row record;
      existing_definition text;
    BEGIN
      IF session_user <> '${MIGRATION_ROLE}' THEN
        RAISE EXCEPTION 'hosted_migration_bridge_principal_invalid';
      END IF;
      GRANT ${identifier(MIGRATION_ROLE)} TO postgres
        WITH INHERIT TRUE, SET TRUE, ADMIN FALSE;
      IF pg_catalog.to_regclass('drizzle.veele_sql_migrations') IS NULL
         OR NOT EXISTS (SELECT 1 FROM drizzle.veele_sql_migrations) THEN
        RAISE EXCEPTION 'hosted_migration_bridge_history_missing';
      END IF;
      IF pg_catalog.to_regprocedure('app_private.fieldgrid_auth_user_snapshot(uuid)') IS NULL THEN
        RAISE EXCEPTION 'hosted_migration_bridge_auth_snapshot_missing';
      END IF;
      IF EXISTS (
        SELECT 1 FROM pg_catalog.pg_trigger trigger_row
        WHERE trigger_row.tgrelid='auth.users'::pg_catalog.regclass
          AND trigger_row.tgname='on_auth_user_created'
          AND NOT trigger_row.tgisinternal
      ) THEN
        RAISE EXCEPTION 'hosted_migration_bridge_obsolete_auth_trigger_present';
      END IF;

      GRANT USAGE ON SCHEMA ${identifier(HOSTED_MIGRATION_BRIDGE_SCHEMA)}
        TO anon, authenticated, service_role,
           fieldgrid_runtime_app, fieldgrid_runtime_data;
      GRANT EXECUTE ON FUNCTION
        ${qualified(HOSTED_MIGRATION_BRIDGE_SCHEMA, "uid")}(),
        ${qualified(HOSTED_MIGRATION_BRIDGE_SCHEMA, "jwt")}(),
        ${qualified(HOSTED_MIGRATION_BRIDGE_SCHEMA, "role")}(),
        ${qualified(HOSTED_MIGRATION_BRIDGE_SCHEMA, "foldername")}(text)
        TO anon, authenticated, service_role,
           fieldgrid_runtime_app, fieldgrid_runtime_data;
      PERFORM ${qualified(HOSTED_MIGRATION_BRIDGE_SCHEMA, "reconcile_storage")}();

      FOR constraint_row IN
        SELECT * FROM (VALUES
          ('public','personnel','personnel_user_id_fkey','user_id','SET NULL'),
          ('public','customers','customers_created_by_fkey','created_by','SET NULL'),
          ('public','objects','objects_created_by_fkey','created_by','SET NULL'),
          ('public','customer_notes','customer_notes_updated_by_fkey','updated_by','SET NULL'),
          ('public','credential_recovery_challenges','credential_recovery_challenges_subject_fk','subject_user_id','CASCADE')
        ) AS required(schema_name,table_name,constraint_name,column_name,delete_action)
      LOOP
        IF pg_catalog.to_regclass(
          pg_catalog.format('%I.%I',constraint_row.schema_name,constraint_row.table_name)
        ) IS NULL THEN
          RAISE EXCEPTION 'hosted_migration_bridge_required_table_missing';
        END IF;
        SELECT pg_catalog.pg_get_constraintdef(constraint_oid.oid,true)
          INTO existing_definition
        FROM pg_catalog.pg_constraint constraint_oid
        WHERE constraint_oid.conrelid=pg_catalog.to_regclass(
                pg_catalog.format('%I.%I',constraint_row.schema_name,constraint_row.table_name)
              )
          AND constraint_oid.conname=constraint_row.constraint_name;
        IF existing_definition IS NULL THEN
          EXECUTE pg_catalog.format(
            'ALTER TABLE %I.%I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES auth.users(id) ON DELETE %s',
            constraint_row.schema_name,
            constraint_row.table_name,
            constraint_row.constraint_name,
            constraint_row.column_name,
            constraint_row.delete_action
          );
        ELSIF existing_definition <> pg_catalog.format(
          'FOREIGN KEY (%s) REFERENCES auth.users(id) ON DELETE %s',
          constraint_row.column_name,
          constraint_row.delete_action
        ) THEN
          RAISE EXCEPTION 'hosted_migration_bridge_constraint_drift';
        END IF;
      END LOOP;
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
      ALTER FUNCTION app_private.fieldgrid_auth_user_snapshot(uuid) OWNER TO postgres;
      REVOKE ALL ON FUNCTION app_private.fieldgrid_auth_user_snapshot(uuid) FROM PUBLIC;
      GRANT EXECUTE ON FUNCTION app_private.fieldgrid_auth_user_snapshot(uuid)
        TO fieldgrid_runtime_data;
      REVOKE ${identifier(MIGRATION_ROLE)} FROM postgres GRANTED BY postgres;
    EXCEPTION WHEN OTHERS THEN
      REVOKE ${identifier(MIGRATION_ROLE)} FROM postgres GRANTED BY postgres;
      RAISE;
    END;
    $fieldgrid_bridge_finalize$;

    ALTER FUNCTION ${qualified(HOSTED_MIGRATION_BRIDGE_SCHEMA, "prepare_disposable_rebuild")}() OWNER TO postgres;
    ALTER FUNCTION ${qualified(HOSTED_MIGRATION_BRIDGE_SCHEMA, "abort_disposable_rebuild")}() OWNER TO postgres;
    ALTER FUNCTION ${qualified(HOSTED_MIGRATION_BRIDGE_SCHEMA, "finalize_disposable_rebuild")}() OWNER TO postgres;
    ALTER FUNCTION ${qualified(HOSTED_MIGRATION_BRIDGE_SCHEMA, "uid")}() OWNER TO postgres;
    ALTER FUNCTION ${qualified(HOSTED_MIGRATION_BRIDGE_SCHEMA, "jwt")}() OWNER TO postgres;
    ALTER FUNCTION ${qualified(HOSTED_MIGRATION_BRIDGE_SCHEMA, "role")}() OWNER TO postgres;
    ALTER FUNCTION ${qualified(HOSTED_MIGRATION_BRIDGE_SCHEMA, "foldername")}(text) OWNER TO postgres;
    REVOKE ALL ON FUNCTION
      ${qualified(HOSTED_MIGRATION_BRIDGE_SCHEMA, "prepare_disposable_rebuild")}(),
      ${qualified(HOSTED_MIGRATION_BRIDGE_SCHEMA, "abort_disposable_rebuild")}(),
      ${qualified(HOSTED_MIGRATION_BRIDGE_SCHEMA, "finalize_disposable_rebuild")}(),
      ${qualified(HOSTED_MIGRATION_BRIDGE_SCHEMA, "uid")}(),
      ${qualified(HOSTED_MIGRATION_BRIDGE_SCHEMA, "jwt")}(),
      ${qualified(HOSTED_MIGRATION_BRIDGE_SCHEMA, "role")}(),
      ${qualified(HOSTED_MIGRATION_BRIDGE_SCHEMA, "foldername")}(text)
      FROM PUBLIC;
    GRANT USAGE ON SCHEMA ${identifier(HOSTED_MIGRATION_BRIDGE_SCHEMA)} TO ${identifier(MIGRATION_ROLE)};
    GRANT EXECUTE ON FUNCTION
      ${qualified(HOSTED_MIGRATION_BRIDGE_SCHEMA, "prepare_disposable_rebuild")}(),
      ${qualified(HOSTED_MIGRATION_BRIDGE_SCHEMA, "abort_disposable_rebuild")}(),
      ${qualified(HOSTED_MIGRATION_BRIDGE_SCHEMA, "finalize_disposable_rebuild")}(),
      ${qualified(HOSTED_MIGRATION_BRIDGE_SCHEMA, "uid")}(),
      ${qualified(HOSTED_MIGRATION_BRIDGE_SCHEMA, "jwt")}(),
      ${qualified(HOSTED_MIGRATION_BRIDGE_SCHEMA, "role")}(),
      ${qualified(HOSTED_MIGRATION_BRIDGE_SCHEMA, "foldername")}(text)
      TO ${identifier(MIGRATION_ROLE)};
  `);
  await installHostedStorageReconciler(client);
  const proof = await client.query(
    `SELECT p.proname,pg_get_userbyid(p.proowner) AS owner,p.prosecdef,
       has_function_privilege($1,p.oid,'EXECUTE') AS target_execute,
       has_function_privilege('public',p.oid,'EXECUTE') AS public_execute
     FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname=$2 ORDER BY p.proname`,
    [MIGRATION_ROLE, HOSTED_MIGRATION_BRIDGE_SCHEMA],
  );
  requireThat(
    proof.rows.length === HOSTED_MIGRATION_BRIDGE_FUNCTIONS.length &&
      HOSTED_MIGRATION_BRIDGE_FUNCTIONS.every((name) =>
        proof.rows.some(
          (row) =>
            row.proname === name &&
            row.owner === "postgres" &&
            row.prosecdef === true &&
            row.target_execute === (name !== "reconcile_storage") &&
            row.public_execute === false,
        ),
      ),
    "HOSTED_MIGRATION_BRIDGE_INVALID",
  );
  return {
    schema: HOSTED_MIGRATION_BRIDGE_SCHEMA,
    functionCount: proof.rows.length,
    authAdapterCount: HOSTED_MIGRATION_PROVIDER_ADAPTERS.length,
  };
}

async function verifyCatalogState(client, managedExpectation) {
  const managedDigest =
    typeof managedExpectation === "string"
      ? managedExpectation
      : managedExpectation.digest;
  const role = await client.query(
    `SELECT rolname,rolsuper,rolbypassrls,rolcreaterole,rolcreatedb,
       rolreplication,rolinherit,rolcanlogin
     FROM pg_roles WHERE rolname=$1`,
    [MIGRATION_ROLE],
  );
  const row = role.rows[0];
  requireThat(
    role.rows.length === 1 &&
      row.rolsuper === false &&
      row.rolbypassrls === false &&
      row.rolcreaterole === true &&
      row.rolcreatedb === false &&
      row.rolreplication === false &&
      row.rolinherit === false &&
      row.rolcanlogin === true,
    "TARGET_ROLE_ATTRIBUTES_INVALID",
  );
  const owners = await client.query(
    `SELECT 'schema' AS kind,n.nspname AS schema_name,NULL::name AS object_name,
       pg_get_userbyid(n.nspowner) AS owner,false AS security_definer
     FROM pg_namespace n WHERE n.nspname=ANY($1::text[])
     UNION ALL
     SELECT 'relation',n.nspname,c.relname,pg_get_userbyid(c.relowner),false
     FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
     WHERE n.nspname=ANY($1::text[]) AND c.relkind IN ('r','p','S','v','m','f')
     UNION ALL
     SELECT 'routine',n.nspname,p.proname,pg_get_userbyid(p.proowner),p.prosecdef
     FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname=ANY($1::text[])
     ORDER BY 1,2,3`,
    [[...APP_SCHEMAS]],
  );
  const schemaOwners = owners.rows.filter(({ kind }) => kind === "schema");
  requireThat(
    schemaOwners.length === APP_SCHEMAS.length &&
      APP_SCHEMAS.every((schema) =>
        schemaOwners.some(
          ({ schema_name: schemaName, owner }) =>
            schemaName === schema && owner === MIGRATION_ROLE,
        ),
      ) &&
      owners.rows.every(
        (item) =>
          item.owner === MIGRATION_ROLE ||
          (item.kind === "routine" &&
            item.security_definer === true &&
            item.owner === "postgres"),
      ),
    "APPLICATION_OWNERSHIP_INVALID",
  );
  const typeOwners = await client.query(
    `SELECT n.nspname,t.typname,pg_get_userbyid(t.typowner) AS owner
     FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace
     LEFT JOIN pg_class c ON c.oid=t.typrelid
     WHERE n.nspname=ANY($1::text[]) AND t.typelem=0
       AND (t.typrelid=0 OR c.relkind='c')
     ORDER BY n.nspname,t.typname`,
    [[...APP_SCHEMAS]],
  );
  requireThat(
    typeOwners.rows.every(({ owner }) => owner === MIGRATION_ROLE),
    "APPLICATION_TYPE_OWNERSHIP_INVALID",
  );
  const membership = await runtimeMembership(client);
  const expectedMembership = [
    [MIGRATION_ROLE, "postgres", "supabase_admin", true, false, false],
    ["fieldgrid_runtime_app", MIGRATION_ROLE, "postgres", true, false, false],
    ["fieldgrid_runtime_app", "postgres", "supabase_admin", true, false, false],
    ["fieldgrid_runtime_data", MIGRATION_ROLE, "postgres", true, false, false],
    [
      "fieldgrid_runtime_data",
      "fieldgrid_runtime_app",
      "postgres",
      false,
      true,
      false,
    ],
    [
      "fieldgrid_runtime_data",
      "postgres",
      "supabase_admin",
      true,
      false,
      false,
    ],
  ];
  requireThat(
    membership.length === expectedMembership.length &&
      expectedMembership.every(([role, member, grantor, admin, inherit, set]) =>
        membership.some(
          (edge) =>
            edge.role_name === role &&
            edge.member_name === member &&
            edge.grantor_name === grantor &&
            edge.admin_option === admin &&
            edge.inherit_option === inherit &&
            edge.set_option === set,
        ),
      ),
    "RUNTIME_MEMBERSHIP_TOPOLOGY_INVALID",
  );
  const publication = await client.query(
    `SELECT pg_get_userbyid(pubowner) AS owner FROM pg_publication
     WHERE pubname='supabase_realtime'`,
  );
  requireThat(
    publication.rows.length === 1 &&
      publication.rows[0].owner === MIGRATION_ROLE,
    "REALTIME_PUBLICATION_OWNER_INVALID",
  );
  const managed = await managedCatalogSnapshot(client);
  if (managed.digest !== managedDigest) {
    const error = new Error("MANAGED_CATALOG_CHANGED");
    error.code = "MANAGED_CATALOG_CHANGED";
    if (typeof managedExpectation !== "string") {
      error.changedCatalogSections = Object.keys(managedExpectation).filter(
        (key) =>
          key !== "digest" &&
          digest(managedExpectation[key]) !== digest(managed[key]),
      );
    }
    throw error;
  }
  return { ownership: owners.rows, runtimeMembership: membership };
}

export async function applyBootstrap(client, password, { injectFailure } = {}) {
  const legacy = await assertLegacyPrincipal(client);
  const before = await managedCatalogSnapshot(client);
  const schemas = await client.query(
    "SELECT nspname FROM pg_namespace WHERE nspname=ANY($1::text[])",
    [[...APP_SCHEMAS]],
  );
  requireThat(
    schemas.rows.length === APP_SCHEMAS.length,
    "APPLICATION_SCHEMA_MISSING",
  );
  const verifier = buildScramVerifier(password);
  let commitAttempted = false;
  await client.query("BEGIN");
  try {
    await client.query("SET LOCAL lock_timeout='10s'");
    await client.query("SET LOCAL statement_timeout='120s'");
    const lock = await client.query(
      "SELECT pg_try_advisory_xact_lock(hashtextextended($1,0)) AS acquired",
      ["fieldgrid:staging-migration-admin-bootstrap:v1"],
    );
    requireThat(lock.rows[0]?.acquired === true, "BOOTSTRAP_LOCK_UNAVAILABLE");
    await verifyRuntimeRolesSafe(client);
    await assertNoUnsupportedOwnedObjects(client);
    await ensureRole(client, verifier);
    const hostedMigrationBridge = await installHostedMigrationBridge(client);
    await client.query(
      `GRANT ${identifier(MIGRATION_ROLE)} TO postgres WITH INHERIT TRUE, SET TRUE`,
    );
    await client.query(
      `GRANT CONNECT,CREATE,TEMPORARY ON DATABASE postgres TO ${identifier(MIGRATION_ROLE)}`,
    );
    for (const schema of APP_SCHEMAS) {
      await client.query(
        `GRANT USAGE,CREATE ON SCHEMA ${identifier(schema)} TO ${identifier(MIGRATION_ROLE)}`,
      );
    }
    await transferRelations(client);
    await transferRoutines(client);
    await transferStandaloneTypes(client);
    if (injectFailure === "after-objects") throw new Error("INJECTED_FAILURE");
    for (const schema of APP_SCHEMAS) {
      const present = await client.query(
        "SELECT pg_get_userbyid(nspowner) AS owner FROM pg_namespace WHERE nspname=$1",
        [schema],
      );
      if (present.rows.length === 0) continue;
      requireThat(
        present.rows[0].owner === "postgres" ||
          present.rows[0].owner === "pg_database_owner" ||
          present.rows[0].owner === MIGRATION_ROLE,
        "APPLICATION_SCHEMA_OWNER_INVALID",
      );
      if (present.rows[0].owner !== MIGRATION_ROLE) {
        await client.query(
          `ALTER SCHEMA ${identifier(schema)} OWNER TO ${identifier(MIGRATION_ROLE)}`,
        );
      }
      await client.query(
        `GRANT USAGE,CREATE ON SCHEMA ${identifier(schema)} TO ${identifier(MIGRATION_ROLE)}`,
      );
    }
    const publication = await client.query(
      `SELECT pg_get_userbyid(pubowner) AS owner FROM pg_publication
       WHERE pubname='supabase_realtime'`,
    );
    requireThat(
      publication.rows.length === 1 &&
        ["postgres", MIGRATION_ROLE].includes(publication.rows[0].owner),
      "REALTIME_PUBLICATION_OWNER_INVALID",
    );
    if (publication.rows[0].owner !== MIGRATION_ROLE) {
      await client.query(
        `ALTER PUBLICATION supabase_realtime OWNER TO ${identifier(MIGRATION_ROLE)}`,
      );
    }
    await client.query(
      `GRANT fieldgrid_runtime_app TO ${identifier(MIGRATION_ROLE)} WITH INHERIT FALSE, SET FALSE, ADMIN TRUE`,
    );
    await client.query(
      `GRANT fieldgrid_runtime_data TO ${identifier(MIGRATION_ROLE)} WITH INHERIT FALSE, SET FALSE, ADMIN TRUE`,
    );
    await client.query(
      "GRANT fieldgrid_runtime_data TO fieldgrid_runtime_app WITH INHERIT TRUE, SET FALSE, ADMIN FALSE",
    );
    await client.query(
      `REVOKE ${identifier(MIGRATION_ROLE)} FROM postgres GRANTED BY postgres`,
    );
    const proof = await verifyCatalogState(client, before);
    if (injectFailure === "before-commit") throw new Error("INJECTED_FAILURE");
    commitAttempted = true;
    await client.query("COMMIT");
    return {
      legacyPrincipal: legacy.name,
      managedCatalogDigest: before.digest,
      securityDefinerCompatibilityOwner: "postgres",
      applicationObjectCount: proof.ownership.length,
      runtimeMembershipDigest: digest(proof.runtimeMembership),
      hostedMigrationBridge,
    };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    if (commitAttempted && error && typeof error === "object") {
      error.bootstrapCommitAttempted = true;
    }
    throw error;
  }
}

export async function repairCommittedTargetSchemaPrivileges(client) {
  const identity = await staged("target-repair-identity", () =>
    client.query(
      `SELECT current_user::text AS current_user,session_user::text AS session_user
       FROM pg_roles WHERE rolname=current_user`,
    ),
  );
  requireThat(
    identity.rows.length === 1 &&
      identity.rows[0].current_user === MIGRATION_ROLE &&
      identity.rows[0].session_user === MIGRATION_ROLE,
    "TARGET_LOGIN_INVALID",
  );
  const schemas = await staged("target-repair-schema-inventory", () =>
    client.query(
      `SELECT n.nspname,pg_get_userbyid(n.nspowner) AS owner
       FROM pg_namespace n WHERE n.nspname=ANY($1::text[]) ORDER BY n.nspname`,
      [[...APP_SCHEMAS]],
    ),
  );
  requireThat(
    schemas.rows.length === APP_SCHEMAS.length &&
      schemas.rows.every(({ owner }) => owner === MIGRATION_ROLE),
    "APPLICATION_OWNERSHIP_INVALID",
  );
  await client.query("BEGIN");
  try {
    await client.query("SET LOCAL lock_timeout='10s'");
    for (const schema of APP_SCHEMAS) {
      await staged(`target-repair-schema-grant-${schema}`, () =>
        client.query(
          `GRANT USAGE,CREATE ON SCHEMA ${identifier(schema)} TO ${identifier(MIGRATION_ROLE)}`,
        ),
      );
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  }
  const proof = await staged("target-repair-schema-proof", () =>
    client.query(
      `SELECT n.nspname,
         has_schema_privilege(current_user,n.oid,'USAGE') AS usage,
         has_schema_privilege(current_user,n.oid,'CREATE') AS create_privilege
       FROM pg_namespace n WHERE n.nspname=ANY($1::text[]) ORDER BY n.nspname`,
      [[...APP_SCHEMAS]],
    ),
  );
  requireThat(
    proof.rows.length === APP_SCHEMAS.length &&
      proof.rows.every(
        ({ usage, create_privilege: createPrivilege }) =>
          usage === true && createPrivilege === true,
      ),
    "TARGET_SCHEMA_CAPABILITY_INVALID",
  );
  return { repairedSchemas: proof.rows.map(({ nspname }) => nspname) };
}

export async function repairCommittedLegacyPrivileges(
  client,
  { revokeLegacyBootstrapAuthAcl = false } = {},
) {
  await staged("legacy-repair-identity", () => assertLegacyPrincipal(client));
  const inventory = await staged("legacy-repair-target-inventory", () =>
    client.query("SELECT oid FROM pg_roles WHERE rolname=$1", [MIGRATION_ROLE]),
  );
  requireThat(
    inventory.rows.length === 1 && inventory.rows[0]?.oid != null,
    "TARGET_ROLE_MISSING",
  );
  let hostedMigrationBridge;
  await client.query("BEGIN");
  try {
    await client.query("SET LOCAL lock_timeout='10s'");
    await staged("legacy-repair-database-grant", () =>
      client.query(
        `GRANT CONNECT,CREATE,TEMPORARY ON DATABASE postgres TO ${identifier(MIGRATION_ROLE)}`,
      ),
    );
    if (revokeLegacyBootstrapAuthAcl) {
      await staged("legacy-repair-auth-schema-revoke", () =>
        client.query(
          `REVOKE USAGE ON SCHEMA auth FROM ${identifier(MIGRATION_ROLE)} GRANTED BY postgres`,
        ),
      );
      await staged("legacy-repair-auth-columns-revoke", () =>
        client.query(
          `REVOKE SELECT (${LEGACY_BOOTSTRAP_AUTH_COLUMNS.map(identifier).join(",")}) ON TABLE auth.users FROM ${identifier(MIGRATION_ROLE)} GRANTED BY postgres`,
        ),
      );
    }
    hostedMigrationBridge = await staged(
      "legacy-repair-hosted-migration-bridge",
      () => installHostedMigrationBridge(client),
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  }
  const proof = await staged("legacy-repair-database-proof", () =>
    client.query(
      `SELECT
         has_database_privilege($1,current_database(),'CONNECT') AS connect,
         has_database_privilege($1,current_database(),'CREATE') AS create,
         has_database_privilege($1,current_database(),'TEMPORARY') AS temporary`,
      [MIGRATION_ROLE],
    ),
  );
  requireThat(
    Object.values(proof.rows[0] ?? {}).every((value) => value === true),
    "TARGET_DATABASE_CAPABILITY_INVALID",
  );
  if (revokeLegacyBootstrapAuthAcl) {
    const authProof = await staged("legacy-repair-auth-proof", () =>
      client.query(
        `SELECT
           has_schema_privilege($1,'auth','USAGE') AS schema_usage,
           has_column_privilege($1,'auth.users','id','SELECT') AS id_select,
           has_column_privilege($1,'auth.users','email','SELECT') AS email_select,
           has_column_privilege($1,'auth.users','raw_app_meta_data','SELECT') AS metadata_select`,
        [MIGRATION_ROLE],
      ),
    );
    requireThat(
      Object.values(authProof.rows[0] ?? {}).every((value) => value === false),
      "LEGACY_BOOTSTRAP_AUTH_ACL_REVOKE_INVALID",
    );
  }
  return {
    databasePrivileges: ["CONNECT", "CREATE", "TEMPORARY"],
    legacyBootstrapAuthAclRevoked: revokeLegacyBootstrapAuthAcl,
    hostedMigrationBridge,
  };
}

export async function drainApplicationWriters(client) {
  const unknown = await client.query(
    `SELECT role.rolname
     FROM pg_roles role
     WHERE role.rolcanlogin AND role.rolname<>ALL($2::text[])
       AND (
         EXISTS (
           SELECT 1 FROM pg_class relation
           JOIN pg_namespace namespace ON namespace.oid=relation.relnamespace
           WHERE namespace.nspname=ANY($1::text[])
             AND relation.relkind IN ('r','p')
             AND (
               has_table_privilege(role.rolname,relation.oid,'INSERT')
               OR has_table_privilege(role.rolname,relation.oid,'UPDATE')
               OR has_table_privilege(role.rolname,relation.oid,'DELETE')
               OR has_table_privilege(role.rolname,relation.oid,'TRUNCATE')
             )
         )
         OR EXISTS (
           SELECT 1 FROM pg_proc routine
           JOIN pg_namespace namespace ON namespace.oid=routine.pronamespace
           WHERE namespace.nspname=ANY($1::text[])
             AND has_function_privilege(role.rolname,routine.oid,'EXECUTE')
         )
       )
     ORDER BY role.rolname`,
    [
      [...APP_SCHEMAS],
      [
        "anon",
        "authenticated",
        "authenticator",
        "dashboard_user",
        "fieldgrid_migration_admin",
        "fieldgrid_runtime_app",
        "postgres",
        "pgbouncer",
        "service_role",
        "supabase_admin",
        "supabase_auth_admin",
        "supabase_etl_admin",
        "supabase_functions_admin",
        "supabase_read_only_user",
        "supabase_replication_admin",
        "supabase_storage_admin",
      ],
    ],
  );
  requireThat(unknown.rows.length === 0, "UNKNOWN_DATABASE_WRITER");
  const result = await client.query(`
    SELECT pid,pg_terminate_backend(pid) AS stopped
    FROM pg_stat_activity
    WHERE datname=current_database() AND pid<>pg_backend_pid()
      AND backend_type='client backend'
      AND usename=ANY(ARRAY[
        'postgres','fieldgrid_migration_admin','fieldgrid_runtime_app',
        'authenticator','anon','authenticated','service_role'
      ]::text[])
    ORDER BY pid
  `);
  requireThat(
    result.rows.every(({ stopped }) => stopped === true),
    "DATABASE_WRITER_TERMINATION_FAILED",
  );
  return { terminatedSessionCount: result.rows.length };
}

export async function verifyTargetLogin(client, managedDigest) {
  const identity = await staged("target-proof-identity", () =>
    client.query(`
      SELECT current_user::text AS current_user,session_user::text AS session_user,
        current_database() AS database_name,rolsuper,rolbypassrls,rolcreaterole,
        rolcreatedb,rolreplication,rolinherit,rolcanlogin
      FROM pg_roles WHERE rolname=current_user
    `),
  );
  const row = identity.rows[0];
  requireThat(
    identity.rows.length === 1 &&
      row.current_user === MIGRATION_ROLE &&
      row.session_user === MIGRATION_ROLE &&
      row.database_name === "postgres" &&
      row.rolsuper === false &&
      row.rolbypassrls === false &&
      row.rolcreaterole === true &&
      row.rolcreatedb === false &&
      row.rolreplication === false &&
      row.rolinherit === false &&
      row.rolcanlogin === true,
    "TARGET_LOGIN_INVALID",
  );
  await staged("target-proof-catalog", () =>
    verifyCatalogState(client, managedDigest),
  );
  const capabilities = await staged("target-proof-capability-inventory", () =>
    client.query(`
      SELECT has_database_privilege(current_user,current_database(),'CONNECT') AS connect,
        has_database_privilege(current_user,current_database(),'CREATE') AS create,
        has_database_privilege(current_user,current_database(),'TEMPORARY') AS temporary
    `),
  );
  requireThat(
    Object.values(capabilities.rows[0] ?? {}).every((value) => value === true),
    "TARGET_CAPABILITY_INVALID",
  );
  const bridge = await staged("target-proof-hosted-migration-bridge", () =>
    verifyHostedMigrationBridgeFinalState(client, {
      includeStorage: false,
      allowRuntimeAdaptersAbsent: true,
    }),
  );
  const inventory = await staged("target-proof-database-inventory", () =>
    databaseInventory(client, {
      expectedDatabaseName: "postgres",
      expectedPrincipalName: MIGRATION_ROLE,
    }),
  );
  await client.query("BEGIN");
  try {
    await client.query("SET LOCAL lock_timeout='10s'");
    await client.query("SET LOCAL statement_timeout='120s'");
    for (const schema of APP_SCHEMAS) {
      await staged(`target-proof-drop-schema-${schema}`, () =>
        client.query(`DROP SCHEMA IF EXISTS ${identifier(schema)} CASCADE`),
      );
    }
    await staged("target-proof-create-public", () =>
      client.query(
        `CREATE SCHEMA public AUTHORIZATION ${identifier(MIGRATION_ROLE)}`,
      ),
    );
    await staged("target-proof-create-temp-table", () =>
      client.query(
        "CREATE TEMP TABLE fieldgrid_bootstrap_capability_proof(id int)",
      ),
    );
    await client.query("ROLLBACK");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  }
  return {
    principal: inventory.principal,
    applicationSchemas: inventory.applicationSchemas,
    applicationTables: inventory.applicationTables,
    managedCatalogDigest: inventory.managedCatalogDigest,
    dryRebuildCapability: true,
    authorizedProviderCompatibility: {
      realtimePublicationOwner: MIGRATION_ROLE,
      authDirectAccess: false,
    },
    hostedMigrationBridge: {
      schema: HOSTED_MIGRATION_BRIDGE_SCHEMA,
      functionCount: bridge.functionCount,
      authAdapterCount: HOSTED_MIGRATION_PROVIDER_ADAPTERS.length,
      temporaryPrivilegesRevoked: true,
    },
  };
}
