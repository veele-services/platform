-- Forward-only hosted-provider compatibility. Supersedes only the hash-pinned
-- 20260919220633 policy repair after complete target verification. The migration
-- runner records that historical repair as compatibility-baselined, never applied.
-- Provider-owned auth helpers and effective auth privileges remain unchanged.
-- Reconstructed source definitions only; no live SQL, row repair or ACL grants.
-- Ordinary clean installs run this after the old pair. The bounded staging
-- runner executes it as an atomic prerequisite before that pair and records
-- every migration only after the complete canonical postcondition succeeds.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';
SET LOCAL search_path = pg_catalog;
DO $policy_repair_isolation$
BEGIN
  IF pg_catalog.current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION 'tenant_management_policy_repair_requires_read_committed';
  END IF;
END;
$policy_repair_isolation$;

LOCK TABLE public.platform_users, public.role_permissions, public.roles,
  public.tenant_role_permissions, public.tenant_roles, public.tenant_user_roles,
  public.tenant_users, public.tenants, public.user_roles IN SHARE MODE;
LOCK TABLE public.invoices IN SHARE MODE;
LOCK TABLE public.object_contacts, public.object_personnel IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE public.objects IN SHARE MODE;
LOCK TABLE public.payments IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE public.personnel IN SHARE MODE;

DO $repair_tenant_management_policy_consumers$
DECLARE
  repair_manifest CONSTANT jsonb := $policy_repair_manifest$[
  {
    "state": "clean",
    "profile": "localShim",
    "manifest": {
      "version": 1,
      "postgresMajor": 17,
      "sources": [
        {
          "path": "lib/db/migrations/002_sprint1_rls.sql",
          "sha256": "16a27aa61943516314b9800d7b37a08eeb9c64441a5994c7da3f9badf7265238"
        },
        {
          "path": "lib/db/migrations/025_platform_schema_extensions.sql",
          "sha256": "8a57d65ba11e3122f897498093d1351f0cf57a2f1940850e266bbfc54c0b3636"
        },
        {
          "path": "lib/db/migrations/037_tenant_customer_users_events_hardening.sql",
          "sha256": "03a1ad0cbf406140c64b53da422abb62a45a6e0e9fb68832a8328ca6685d0b0e"
        },
        {
          "path": "lib/db/migrations/051_final_security_boundaries.sql",
          "sha256": "64f12a61bbd19cfbf4ec854c31560717bef4219433b03c09055f3f6f070181ff"
        },
        {
          "path": "lib/db/migrations/062_finance_reports_tenant_scope.sql",
          "sha256": "0ff1e8fcc5e0a3c7674ed084e6058e1a538ca0fed13e02f469fb0d363e055fbe"
        },
        {
          "path": "lib/db/migrations/063_payments_batches_audit_tenant_scope.sql",
          "sha256": "171caa7e6a8d4a8f624e475dc234d21b6c81e1e38802ddad3db778047f2053d2"
        },
        {
          "path": "lib/db/migrations/20260710200000_invoice_canon_credit_collection_payments.sql",
          "sha256": "78fc35f49a80a69ad7a7fe0dfc23c264dff2aba0fbfc49f702b3a7a74d1bc23f"
        },
        {
          "path": "lib/db/migrations/20260714120000_assignment_personnel_phase_b_direct_access_close.sql",
          "sha256": "7be5f0c1999d6eaadb22735d2243322d8aada1e64e3c4c44c4a3bc11d8317574"
        },
        {
          "path": "lib/db/migrations/20260718190000_phase2_security_reconciliation.sql",
          "sha256": "6cf0da37eec7c1b5b57c8218593873fedf1fae2a832b27e138dfd2614b861964"
        },
        {
          "path": "lib/db/migrations/20260909120000_runtime_least_privilege_principals.sql",
          "sha256": "2eaf25923d7908c94d1fb96c7fbede14858330d86be21656f50d611fe37e0066"
        },
        {
          "path": "migrations/013_sprint5_payments.sql",
          "sha256": "ea6d0e71764e92d0a0f0ad2d09a6bdf6c864c2a64d1ef717743b567d15198102"
        },
        {
          "path": "migrations/023_objects_extended.sql",
          "sha256": "19e20f3463f220a123450cefec79dc7490d5074c72f1a3f726ddfd1a28dde6ae"
        },
        {
          "path": "scripts/fieldgrid-runtime-safety-setup.mjs",
          "sha256": "f43d159c3e047bd752642e8005793df40314873a772c16c95eca7195f5c34666"
        },
        {
          "path": "tests/fixtures/fieldgrid-supabase-auth-functions.sql",
          "sha256": "5b72022d73e64a8e474d2122ac42f299bb7ce4d59755cdcc78e72abfe5d47dc0"
        }
      ],
      "relations": [
        {
          "schema": "public",
          "table": "invoices",
          "kind": "r",
          "rowSecurity": true,
          "forceRowSecurity": false,
          "columns": [
            {
              "name": "created_by",
              "notNull": false,
              "typeName": "uuid",
              "typeModifier": -1
            },
            {
              "name": "id",
              "notNull": true,
              "typeName": "uuid",
              "typeModifier": -1
            },
            {
              "name": "tenant_id",
              "notNull": true,
              "typeName": "uuid",
              "typeModifier": -1
            }
          ]
        },
        {
          "schema": "public",
          "table": "object_contacts",
          "kind": "r",
          "rowSecurity": true,
          "forceRowSecurity": false,
          "columns": [
            {
              "name": "id",
              "notNull": true,
              "typeName": "uuid",
              "typeModifier": -1
            },
            {
              "name": "object_id",
              "notNull": true,
              "typeName": "uuid",
              "typeModifier": -1
            }
          ]
        },
        {
          "schema": "public",
          "table": "object_personnel",
          "kind": "r",
          "rowSecurity": true,
          "forceRowSecurity": false,
          "columns": [
            {
              "name": "object_id",
              "notNull": true,
              "typeName": "uuid",
              "typeModifier": -1
            },
            {
              "name": "personnel_id",
              "notNull": true,
              "typeName": "uuid",
              "typeModifier": -1
            }
          ]
        },
        {
          "schema": "public",
          "table": "objects",
          "kind": "r",
          "rowSecurity": true,
          "forceRowSecurity": false,
          "columns": [
            {
              "name": "id",
              "notNull": true,
              "typeName": "uuid",
              "typeModifier": -1
            },
            {
              "name": "tenant_id",
              "notNull": true,
              "typeName": "uuid",
              "typeModifier": -1
            }
          ]
        },
        {
          "schema": "public",
          "table": "payments",
          "kind": "r",
          "rowSecurity": true,
          "forceRowSecurity": false,
          "columns": [
            {
              "name": "id",
              "notNull": true,
              "typeName": "uuid",
              "typeModifier": -1
            },
            {
              "name": "invoice_id",
              "notNull": false,
              "typeName": "uuid",
              "typeModifier": -1
            },
            {
              "name": "tenant_id",
              "notNull": true,
              "typeName": "uuid",
              "typeModifier": -1
            }
          ]
        },
        {
          "schema": "public",
          "table": "personnel",
          "kind": "r",
          "rowSecurity": true,
          "forceRowSecurity": false,
          "columns": [
            {
              "name": "id",
              "notNull": true,
              "typeName": "uuid",
              "typeModifier": -1
            },
            {
              "name": "tenant_id",
              "notNull": true,
              "typeName": "uuid",
              "typeModifier": -1
            }
          ]
        }
      ],
      "policies": [
        {
          "schema": "public",
          "table": "invoices",
          "name": "fieldgrid_runtime_data_insert",
          "command": "a",
          "permissive": true,
          "roles": [
            "fieldgrid_runtime_data"
          ],
          "usingExpression": null,
          "checkExpression": "true"
        },
        {
          "schema": "public",
          "table": "invoices",
          "name": "fieldgrid_runtime_data_select",
          "command": "r",
          "permissive": true,
          "roles": [
            "fieldgrid_runtime_data"
          ],
          "usingExpression": "true",
          "checkExpression": null
        },
        {
          "schema": "public",
          "table": "invoices",
          "name": "fieldgrid_runtime_data_update",
          "command": "w",
          "permissive": true,
          "roles": [
            "fieldgrid_runtime_data"
          ],
          "usingExpression": "true",
          "checkExpression": "true"
        },
        {
          "schema": "public",
          "table": "invoices",
          "name": "invoices_customer_sent_select",
          "command": "r",
          "permissive": true,
          "roles": [
            "authenticated"
          ],
          "usingExpression": "(((status)::text = ANY ((ARRAY['sent'::character varying, 'paid'::character varying, 'cancelled'::character varying])::text[])) AND (EXISTS ( SELECT 1\n   FROM public.customers c\n  WHERE ((c.id = invoices.customer_id) AND public.customer_has_access(c.id, c.tenant_id)))))",
          "checkExpression": null
        },
        {
          "schema": "public",
          "table": "invoices",
          "name": "invoices_management_all",
          "command": "*",
          "permissive": true,
          "roles": [
            "authenticated"
          ],
          "usingExpression": "public.is_management_for_tenant(tenant_id)",
          "checkExpression": "public.is_management_for_tenant(tenant_id)"
        },
        {
          "schema": "public",
          "table": "object_contacts",
          "name": "fieldgrid_runtime_data_delete",
          "command": "d",
          "permissive": true,
          "roles": [
            "fieldgrid_runtime_data"
          ],
          "usingExpression": "true",
          "checkExpression": null
        },
        {
          "schema": "public",
          "table": "object_contacts",
          "name": "fieldgrid_runtime_data_insert",
          "command": "a",
          "permissive": true,
          "roles": [
            "fieldgrid_runtime_data"
          ],
          "usingExpression": null,
          "checkExpression": "true"
        },
        {
          "schema": "public",
          "table": "object_contacts",
          "name": "fieldgrid_runtime_data_select",
          "command": "r",
          "permissive": true,
          "roles": [
            "fieldgrid_runtime_data"
          ],
          "usingExpression": "true",
          "checkExpression": null
        },
        {
          "schema": "public",
          "table": "object_contacts",
          "name": "fieldgrid_runtime_data_update",
          "command": "w",
          "permissive": true,
          "roles": [
            "fieldgrid_runtime_data"
          ],
          "usingExpression": "true",
          "checkExpression": "true"
        },
        {
          "schema": "public",
          "table": "object_contacts",
          "name": "object_contacts_customer_users_delete",
          "command": "d",
          "permissive": true,
          "roles": [
            "authenticated"
          ],
          "usingExpression": "(EXISTS ( SELECT 1\n   FROM public.objects o\n  WHERE ((o.id = object_contacts.object_id) AND public.customer_has_access(o.customer_id, o.tenant_id))))",
          "checkExpression": null
        },
        {
          "schema": "public",
          "table": "object_contacts",
          "name": "object_contacts_customer_users_insert",
          "command": "a",
          "permissive": true,
          "roles": [
            "authenticated"
          ],
          "usingExpression": null,
          "checkExpression": "(EXISTS ( SELECT 1\n   FROM public.objects o\n  WHERE ((o.id = object_contacts.object_id) AND public.customer_has_access(o.customer_id, o.tenant_id))))"
        },
        {
          "schema": "public",
          "table": "object_contacts",
          "name": "object_contacts_customer_users_select",
          "command": "r",
          "permissive": true,
          "roles": [
            "authenticated"
          ],
          "usingExpression": "(EXISTS ( SELECT 1\n   FROM public.objects o\n  WHERE ((o.id = object_contacts.object_id) AND public.customer_has_access(o.customer_id, o.tenant_id))))",
          "checkExpression": null
        },
        {
          "schema": "public",
          "table": "object_contacts",
          "name": "object_contacts_customer_users_update",
          "command": "w",
          "permissive": true,
          "roles": [
            "authenticated"
          ],
          "usingExpression": "(EXISTS ( SELECT 1\n   FROM public.objects o\n  WHERE ((o.id = object_contacts.object_id) AND public.customer_has_access(o.customer_id, o.tenant_id))))",
          "checkExpression": "(EXISTS ( SELECT 1\n   FROM public.objects o\n  WHERE ((o.id = object_contacts.object_id) AND public.customer_has_access(o.customer_id, o.tenant_id))))"
        },
        {
          "schema": "public",
          "table": "object_contacts",
          "name": "object_contacts_management",
          "command": "*",
          "permissive": true,
          "roles": [
            "authenticated"
          ],
          "usingExpression": "(EXISTS ( SELECT 1\n   FROM public.objects o\n  WHERE ((o.id = object_contacts.object_id) AND public.is_management_for_tenant(o.tenant_id))))",
          "checkExpression": "(EXISTS ( SELECT 1\n   FROM public.objects o\n  WHERE ((o.id = object_contacts.object_id) AND public.is_management_for_tenant(o.tenant_id))))"
        },
        {
          "schema": "public",
          "table": "object_personnel",
          "name": "fieldgrid_runtime_data_delete",
          "command": "d",
          "permissive": true,
          "roles": [
            "fieldgrid_runtime_data"
          ],
          "usingExpression": "true",
          "checkExpression": null
        },
        {
          "schema": "public",
          "table": "object_personnel",
          "name": "fieldgrid_runtime_data_insert",
          "command": "a",
          "permissive": true,
          "roles": [
            "fieldgrid_runtime_data"
          ],
          "usingExpression": null,
          "checkExpression": "true"
        },
        {
          "schema": "public",
          "table": "object_personnel",
          "name": "fieldgrid_runtime_data_select",
          "command": "r",
          "permissive": true,
          "roles": [
            "fieldgrid_runtime_data"
          ],
          "usingExpression": "true",
          "checkExpression": null
        },
        {
          "schema": "public",
          "table": "object_personnel",
          "name": "object_personnel_management",
          "command": "*",
          "permissive": true,
          "roles": [
            "authenticated"
          ],
          "usingExpression": "(EXISTS ( SELECT 1\n   FROM public.objects o\n  WHERE ((o.id = object_personnel.object_id) AND public.is_management_for_tenant(o.tenant_id))))",
          "checkExpression": "(EXISTS ( SELECT 1\n   FROM public.objects o\n  WHERE ((o.id = object_personnel.object_id) AND public.is_management_for_tenant(o.tenant_id))))"
        },
        {
          "schema": "public",
          "table": "objects",
          "name": "fieldgrid_runtime_data_delete",
          "command": "d",
          "permissive": true,
          "roles": [
            "fieldgrid_runtime_data"
          ],
          "usingExpression": "true",
          "checkExpression": null
        },
        {
          "schema": "public",
          "table": "objects",
          "name": "fieldgrid_runtime_data_insert",
          "command": "a",
          "permissive": true,
          "roles": [
            "fieldgrid_runtime_data"
          ],
          "usingExpression": null,
          "checkExpression": "true"
        },
        {
          "schema": "public",
          "table": "objects",
          "name": "fieldgrid_runtime_data_select",
          "command": "r",
          "permissive": true,
          "roles": [
            "fieldgrid_runtime_data"
          ],
          "usingExpression": "true",
          "checkExpression": null
        },
        {
          "schema": "public",
          "table": "objects",
          "name": "fieldgrid_runtime_data_update",
          "command": "w",
          "permissive": true,
          "roles": [
            "fieldgrid_runtime_data"
          ],
          "usingExpression": "true",
          "checkExpression": "true"
        },
        {
          "schema": "public",
          "table": "objects",
          "name": "objects_customer_users_insert",
          "command": "a",
          "permissive": true,
          "roles": [
            "authenticated"
          ],
          "usingExpression": null,
          "checkExpression": "public.customer_has_access(customer_id, tenant_id)"
        },
        {
          "schema": "public",
          "table": "objects",
          "name": "objects_customer_users_select",
          "command": "r",
          "permissive": true,
          "roles": [
            "authenticated"
          ],
          "usingExpression": "public.customer_has_access(customer_id, tenant_id)",
          "checkExpression": null
        },
        {
          "schema": "public",
          "table": "objects",
          "name": "objects_customer_users_update",
          "command": "w",
          "permissive": true,
          "roles": [
            "authenticated"
          ],
          "usingExpression": "public.customer_has_access(customer_id, tenant_id)",
          "checkExpression": "public.customer_has_access(customer_id, tenant_id)"
        },
        {
          "schema": "public",
          "table": "objects",
          "name": "objects_management",
          "command": "*",
          "permissive": true,
          "roles": [
            "authenticated"
          ],
          "usingExpression": "public.is_management_for_tenant(tenant_id)",
          "checkExpression": "public.is_management_for_tenant(tenant_id)"
        },
        {
          "schema": "public",
          "table": "objects",
          "name": "personnel_select_assigned_objects",
          "command": "r",
          "permissive": true,
          "roles": [
            "authenticated"
          ],
          "usingExpression": "(EXISTS ( SELECT 1\n   FROM public.assignments a\n  WHERE ((a.object_id = objects.id) AND public.personnel_assigned_to_assignment(a.id))))",
          "checkExpression": null
        },
        {
          "schema": "public",
          "table": "payments",
          "name": "fieldgrid_runtime_data_insert",
          "command": "a",
          "permissive": true,
          "roles": [
            "fieldgrid_runtime_data"
          ],
          "usingExpression": null,
          "checkExpression": "true"
        },
        {
          "schema": "public",
          "table": "payments",
          "name": "fieldgrid_runtime_data_select",
          "command": "r",
          "permissive": true,
          "roles": [
            "fieldgrid_runtime_data"
          ],
          "usingExpression": "true",
          "checkExpression": null
        },
        {
          "schema": "public",
          "table": "payments",
          "name": "fieldgrid_runtime_data_update",
          "command": "w",
          "permissive": true,
          "roles": [
            "fieldgrid_runtime_data"
          ],
          "usingExpression": "true",
          "checkExpression": "true"
        },
        {
          "schema": "public",
          "table": "personnel",
          "name": "fieldgrid_runtime_data_delete",
          "command": "d",
          "permissive": true,
          "roles": [
            "fieldgrid_runtime_data"
          ],
          "usingExpression": "true",
          "checkExpression": null
        },
        {
          "schema": "public",
          "table": "personnel",
          "name": "fieldgrid_runtime_data_insert",
          "command": "a",
          "permissive": true,
          "roles": [
            "fieldgrid_runtime_data"
          ],
          "usingExpression": null,
          "checkExpression": "true"
        },
        {
          "schema": "public",
          "table": "personnel",
          "name": "fieldgrid_runtime_data_select",
          "command": "r",
          "permissive": true,
          "roles": [
            "fieldgrid_runtime_data"
          ],
          "usingExpression": "true",
          "checkExpression": null
        },
        {
          "schema": "public",
          "table": "personnel",
          "name": "fieldgrid_runtime_data_update",
          "command": "w",
          "permissive": true,
          "roles": [
            "fieldgrid_runtime_data"
          ],
          "usingExpression": "true",
          "checkExpression": "true"
        },
        {
          "schema": "public",
          "table": "personnel",
          "name": "personnel_management",
          "command": "*",
          "permissive": true,
          "roles": [
            "authenticated"
          ],
          "usingExpression": "public.is_management_for_tenant(tenant_id)",
          "checkExpression": "public.is_management_for_tenant(tenant_id)"
        },
        {
          "schema": "public",
          "table": "personnel",
          "name": "personnel_select_own",
          "command": "r",
          "permissive": true,
          "roles": [
            "authenticated"
          ],
          "usingExpression": "(user_id = auth.uid())",
          "checkExpression": null
        }
      ],
      "helpers": [
        {
          "schema": "public",
          "name": "customer_has_access",
          "argumentTypes": [
            "uuid",
            "uuid"
          ],
          "returnType": "bool",
          "body": "\n  SELECT EXISTS (\n    SELECT 1\n    FROM customer_users cu\n    WHERE cu.customer_id = p_customer_id\n      AND cu.tenant_id = p_tenant_id\n      AND cu.user_id = (SELECT auth.uid())\n      AND cu.status = 'active'\n  );\n",
          "language": "sql",
          "securityDefiner": false,
          "volatility": "s",
          "parallel": "u",
          "strict": false,
          "leakproof": false,
          "config": [
            "search_path=public, auth"
          ],
          "argNames": [
            "p_customer_id",
            "p_tenant_id"
          ],
          "defaultCount": 0,
          "ownerRelation": {
            "schema": "public",
            "table": "object_contacts"
          },
          "directAcl": [
            {
              "grantee": "$owner",
              "grantor": "$owner",
              "privilege": "EXECUTE",
              "grantable": false
            },
            {
              "grantee": "authenticated",
              "grantor": "$owner",
              "privilege": "EXECUTE",
              "grantable": false
            }
          ],
          "effectiveExecute": [
            {
              "role": "$owner",
              "allowed": true
            },
            {
              "role": "PUBLIC",
              "allowed": false
            },
            {
              "role": "anon",
              "allowed": false
            },
            {
              "role": "authenticated",
              "allowed": true
            },
            {
              "role": "service_role",
              "allowed": false
            },
            {
              "role": "fieldgrid_runtime_data",
              "allowed": false
            },
            {
              "role": "fieldgrid_runtime_app",
              "allowed": false
            }
          ]
        },
        {
          "schema": "public",
          "name": "personnel_assigned_to_assignment",
          "argumentTypes": [
            "uuid"
          ],
          "returnType": "bool",
          "body": "\n  SELECT\n    (SELECT auth.uid()) IS NOT NULL\n    AND EXISTS (\n      SELECT 1\n      FROM public.assignment_personnel ap\n      JOIN public.assignments a\n        ON a.id = ap.assignment_id\n      JOIN public.personnel p\n        ON p.id = ap.personnel_id\n      WHERE ap.assignment_id = p_assignment_id\n        AND ap.status = 'assigned'\n        AND p.user_id = (SELECT auth.uid())\n        AND p.is_active = true\n        AND p.tenant_id IS NOT NULL\n        AND a.tenant_id IS NOT NULL\n        AND p.tenant_id = a.tenant_id\n    );\n",
          "language": "sql",
          "securityDefiner": true,
          "volatility": "s",
          "parallel": "u",
          "strict": false,
          "leakproof": false,
          "config": [
            "search_path=pg_catalog, public, auth"
          ],
          "argNames": [
            "p_assignment_id"
          ],
          "defaultCount": 0,
          "ownerRelation": {
            "schema": "public",
            "table": "object_contacts"
          },
          "directAcl": [
            {
              "grantee": "$owner",
              "grantor": "$owner",
              "privilege": "EXECUTE",
              "grantable": false
            },
            {
              "grantee": "authenticated",
              "grantor": "$owner",
              "privilege": "EXECUTE",
              "grantable": false
            }
          ],
          "effectiveExecute": [
            {
              "role": "$owner",
              "allowed": true
            },
            {
              "role": "PUBLIC",
              "allowed": false
            },
            {
              "role": "anon",
              "allowed": false
            },
            {
              "role": "authenticated",
              "allowed": true
            },
            {
              "role": "service_role",
              "allowed": false
            },
            {
              "role": "fieldgrid_runtime_data",
              "allowed": false
            },
            {
              "role": "fieldgrid_runtime_app",
              "allowed": false
            }
          ]
        },
        {
          "schema": "public",
          "name": "fieldgrid_has_platform_permission",
          "argumentTypes": [
            "text"
          ],
          "returnType": "bool",
          "body": "\n  SELECT EXISTS (\n    SELECT 1 FROM public.platform_users pu\n    WHERE pu.user_id = auth.uid() AND pu.status = 'active'\n      AND (\n        pu.role = 'owner'\n        OR (pu.role = 'admin' AND p_permission = ANY (ARRAY[\n          'global.rbac.manage', 'global.reference.manage', 'global.content.manage',\n          'platform.tenants.read', 'platform.audit.read'\n        ]))\n      )\n  );\n",
          "language": "sql",
          "securityDefiner": true,
          "volatility": "s",
          "parallel": "u",
          "strict": false,
          "leakproof": false,
          "config": [
            "search_path=pg_catalog, public, pg_temp"
          ],
          "argNames": [
            "p_permission"
          ],
          "defaultCount": 0,
          "ownerRelation": {
            "schema": "public",
            "table": "object_contacts"
          },
          "directAcl": [
            {
              "grantee": "$owner",
              "grantor": "$owner",
              "privilege": "EXECUTE",
              "grantable": false
            },
            {
              "grantee": "authenticated",
              "grantor": "$owner",
              "privilege": "EXECUTE",
              "grantable": false
            }
          ],
          "effectiveExecute": [
            {
              "role": "$owner",
              "allowed": true
            },
            {
              "role": "PUBLIC",
              "allowed": false
            },
            {
              "role": "anon",
              "allowed": false
            },
            {
              "role": "authenticated",
              "allowed": true
            },
            {
              "role": "service_role",
              "allowed": false
            },
            {
              "role": "fieldgrid_runtime_data",
              "allowed": false
            },
            {
              "role": "fieldgrid_runtime_app",
              "allowed": false
            }
          ]
        },
        {
          "schema": "auth",
          "name": "uid",
          "argumentTypes": [],
          "returnType": "uuid",
          "body": "\n      select nullif(\n        coalesce(\n          nullif(current_setting('request.jwt.claim.sub', true), ''),\n          nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'\n        ),\n        ''\n      )::uuid\n    ",
          "language": "sql",
          "securityDefiner": false,
          "volatility": "s",
          "parallel": "u",
          "strict": false,
          "leakproof": false,
          "config": null,
          "argNames": null,
          "defaultCount": 0,
          "ownerRelation": {
            "schema": "auth",
            "table": "users"
          },
          "directAcl": [
            {
              "grantee": "$owner",
              "grantor": "$owner",
              "privilege": "EXECUTE",
              "grantable": false
            },
            {
              "grantee": "PUBLIC",
              "grantor": "$owner",
              "privilege": "EXECUTE",
              "grantable": false
            }
          ],
          "effectiveExecute": [
            {
              "role": "$owner",
              "allowed": true
            },
            {
              "role": "PUBLIC",
              "allowed": true
            },
            {
              "role": "anon",
              "allowed": true
            },
            {
              "role": "authenticated",
              "allowed": true
            },
            {
              "role": "service_role",
              "allowed": true
            },
            {
              "role": "fieldgrid_runtime_data",
              "allowed": true
            },
            {
              "role": "fieldgrid_runtime_app",
              "allowed": true
            }
          ]
        }
      ]
    }
  },
  {
    "state": "clean",
    "profile": "providerSource",
    "manifest": {
      "version": 1,
      "postgresMajor": 17,
      "sources": [
        {
          "path": "lib/db/migrations/002_sprint1_rls.sql",
          "sha256": "16a27aa61943516314b9800d7b37a08eeb9c64441a5994c7da3f9badf7265238"
        },
        {
          "path": "lib/db/migrations/025_platform_schema_extensions.sql",
          "sha256": "8a57d65ba11e3122f897498093d1351f0cf57a2f1940850e266bbfc54c0b3636"
        },
        {
          "path": "lib/db/migrations/037_tenant_customer_users_events_hardening.sql",
          "sha256": "03a1ad0cbf406140c64b53da422abb62a45a6e0e9fb68832a8328ca6685d0b0e"
        },
        {
          "path": "lib/db/migrations/051_final_security_boundaries.sql",
          "sha256": "64f12a61bbd19cfbf4ec854c31560717bef4219433b03c09055f3f6f070181ff"
        },
        {
          "path": "lib/db/migrations/062_finance_reports_tenant_scope.sql",
          "sha256": "0ff1e8fcc5e0a3c7674ed084e6058e1a538ca0fed13e02f469fb0d363e055fbe"
        },
        {
          "path": "lib/db/migrations/063_payments_batches_audit_tenant_scope.sql",
          "sha256": "171caa7e6a8d4a8f624e475dc234d21b6c81e1e38802ddad3db778047f2053d2"
        },
        {
          "path": "lib/db/migrations/20260710200000_invoice_canon_credit_collection_payments.sql",
          "sha256": "78fc35f49a80a69ad7a7fe0dfc23c264dff2aba0fbfc49f702b3a7a74d1bc23f"
        },
        {
          "path": "lib/db/migrations/20260714120000_assignment_personnel_phase_b_direct_access_close.sql",
          "sha256": "7be5f0c1999d6eaadb22735d2243322d8aada1e64e3c4c44c4a3bc11d8317574"
        },
        {
          "path": "lib/db/migrations/20260718190000_phase2_security_reconciliation.sql",
          "sha256": "6cf0da37eec7c1b5b57c8218593873fedf1fae2a832b27e138dfd2614b861964"
        },
        {
          "path": "lib/db/migrations/20260909120000_runtime_least_privilege_principals.sql",
          "sha256": "2eaf25923d7908c94d1fb96c7fbede14858330d86be21656f50d611fe37e0066"
        },
        {
          "path": "migrations/013_sprint5_payments.sql",
          "sha256": "ea6d0e71764e92d0a0f0ad2d09a6bdf6c864c2a64d1ef717743b567d15198102"
        },
        {
          "path": "migrations/023_objects_extended.sql",
          "sha256": "19e20f3463f220a123450cefec79dc7490d5074c72f1a3f726ddfd1a28dde6ae"
        },
        {
          "path": "scripts/fieldgrid-runtime-safety-setup.mjs",
          "sha256": "f43d159c3e047bd752642e8005793df40314873a772c16c95eca7195f5c34666"
        },
        {
          "path": "tests/fixtures/fieldgrid-supabase-auth-functions.sql",
          "sha256": "5b72022d73e64a8e474d2122ac42f299bb7ce4d59755cdcc78e72abfe5d47dc0"
        }
      ],
      "relations": [
        {
          "schema": "public",
          "table": "invoices",
          "kind": "r",
          "rowSecurity": true,
          "forceRowSecurity": false,
          "columns": [
            {
              "name": "created_by",
              "notNull": false,
              "typeName": "uuid",
              "typeModifier": -1
            },
            {
              "name": "id",
              "notNull": true,
              "typeName": "uuid",
              "typeModifier": -1
            },
            {
              "name": "tenant_id",
              "notNull": true,
              "typeName": "uuid",
              "typeModifier": -1
            }
          ]
        },
        {
          "schema": "public",
          "table": "object_contacts",
          "kind": "r",
          "rowSecurity": true,
          "forceRowSecurity": false,
          "columns": [
            {
              "name": "id",
              "notNull": true,
              "typeName": "uuid",
              "typeModifier": -1
            },
            {
              "name": "object_id",
              "notNull": true,
              "typeName": "uuid",
              "typeModifier": -1
            }
          ]
        },
        {
          "schema": "public",
          "table": "object_personnel",
          "kind": "r",
          "rowSecurity": true,
          "forceRowSecurity": false,
          "columns": [
            {
              "name": "object_id",
              "notNull": true,
              "typeName": "uuid",
              "typeModifier": -1
            },
            {
              "name": "personnel_id",
              "notNull": true,
              "typeName": "uuid",
              "typeModifier": -1
            }
          ]
        },
        {
          "schema": "public",
          "table": "objects",
          "kind": "r",
          "rowSecurity": true,
          "forceRowSecurity": false,
          "columns": [
            {
              "name": "id",
              "notNull": true,
              "typeName": "uuid",
              "typeModifier": -1
            },
            {
              "name": "tenant_id",
              "notNull": true,
              "typeName": "uuid",
              "typeModifier": -1
            }
          ]
        },
        {
          "schema": "public",
          "table": "payments",
          "kind": "r",
          "rowSecurity": true,
          "forceRowSecurity": false,
          "columns": [
            {
              "name": "id",
              "notNull": true,
              "typeName": "uuid",
              "typeModifier": -1
            },
            {
              "name": "invoice_id",
              "notNull": false,
              "typeName": "uuid",
              "typeModifier": -1
            },
            {
              "name": "tenant_id",
              "notNull": true,
              "typeName": "uuid",
              "typeModifier": -1
            }
          ]
        },
        {
          "schema": "public",
          "table": "personnel",
          "kind": "r",
          "rowSecurity": true,
          "forceRowSecurity": false,
          "columns": [
            {
              "name": "id",
              "notNull": true,
              "typeName": "uuid",
              "typeModifier": -1
            },
            {
              "name": "tenant_id",
              "notNull": true,
              "typeName": "uuid",
              "typeModifier": -1
            }
          ]
        }
      ],
      "policies": [
        {
          "schema": "public",
          "table": "invoices",
          "name": "fieldgrid_runtime_data_insert",
          "command": "a",
          "permissive": true,
          "roles": [
            "fieldgrid_runtime_data"
          ],
          "usingExpression": null,
          "checkExpression": "true"
        },
        {
          "schema": "public",
          "table": "invoices",
          "name": "fieldgrid_runtime_data_select",
          "command": "r",
          "permissive": true,
          "roles": [
            "fieldgrid_runtime_data"
          ],
          "usingExpression": "true",
          "checkExpression": null
        },
        {
          "schema": "public",
          "table": "invoices",
          "name": "fieldgrid_runtime_data_update",
          "command": "w",
          "permissive": true,
          "roles": [
            "fieldgrid_runtime_data"
          ],
          "usingExpression": "true",
          "checkExpression": "true"
        },
        {
          "schema": "public",
          "table": "invoices",
          "name": "invoices_customer_sent_select",
          "command": "r",
          "permissive": true,
          "roles": [
            "authenticated"
          ],
          "usingExpression": "(((status)::text = ANY ((ARRAY['sent'::character varying, 'paid'::character varying, 'cancelled'::character varying])::text[])) AND (EXISTS ( SELECT 1\n   FROM public.customers c\n  WHERE ((c.id = invoices.customer_id) AND public.customer_has_access(c.id, c.tenant_id)))))",
          "checkExpression": null
        },
        {
          "schema": "public",
          "table": "invoices",
          "name": "invoices_management_all",
          "command": "*",
          "permissive": true,
          "roles": [
            "authenticated"
          ],
          "usingExpression": "public.is_management_for_tenant(tenant_id)",
          "checkExpression": "public.is_management_for_tenant(tenant_id)"
        },
        {
          "schema": "public",
          "table": "object_contacts",
          "name": "fieldgrid_runtime_data_delete",
          "command": "d",
          "permissive": true,
          "roles": [
            "fieldgrid_runtime_data"
          ],
          "usingExpression": "true",
          "checkExpression": null
        },
        {
          "schema": "public",
          "table": "object_contacts",
          "name": "fieldgrid_runtime_data_insert",
          "command": "a",
          "permissive": true,
          "roles": [
            "fieldgrid_runtime_data"
          ],
          "usingExpression": null,
          "checkExpression": "true"
        },
        {
          "schema": "public",
          "table": "object_contacts",
          "name": "fieldgrid_runtime_data_select",
          "command": "r",
          "permissive": true,
          "roles": [
            "fieldgrid_runtime_data"
          ],
          "usingExpression": "true",
          "checkExpression": null
        },
        {
          "schema": "public",
          "table": "object_contacts",
          "name": "fieldgrid_runtime_data_update",
          "command": "w",
          "permissive": true,
          "roles": [
            "fieldgrid_runtime_data"
          ],
          "usingExpression": "true",
          "checkExpression": "true"
        },
        {
          "schema": "public",
          "table": "object_contacts",
          "name": "object_contacts_customer_users_delete",
          "command": "d",
          "permissive": true,
          "roles": [
            "authenticated"
          ],
          "usingExpression": "(EXISTS ( SELECT 1\n   FROM public.objects o\n  WHERE ((o.id = object_contacts.object_id) AND public.customer_has_access(o.customer_id, o.tenant_id))))",
          "checkExpression": null
        },
        {
          "schema": "public",
          "table": "object_contacts",
          "name": "object_contacts_customer_users_insert",
          "command": "a",
          "permissive": true,
          "roles": [
            "authenticated"
          ],
          "usingExpression": null,
          "checkExpression": "(EXISTS ( SELECT 1\n   FROM public.objects o\n  WHERE ((o.id = object_contacts.object_id) AND public.customer_has_access(o.customer_id, o.tenant_id))))"
        },
        {
          "schema": "public",
          "table": "object_contacts",
          "name": "object_contacts_customer_users_select",
          "command": "r",
          "permissive": true,
          "roles": [
            "authenticated"
          ],
          "usingExpression": "(EXISTS ( SELECT 1\n   FROM public.objects o\n  WHERE ((o.id = object_contacts.object_id) AND public.customer_has_access(o.customer_id, o.tenant_id))))",
          "checkExpression": null
        },
        {
          "schema": "public",
          "table": "object_contacts",
          "name": "object_contacts_customer_users_update",
          "command": "w",
          "permissive": true,
          "roles": [
            "authenticated"
          ],
          "usingExpression": "(EXISTS ( SELECT 1\n   FROM public.objects o\n  WHERE ((o.id = object_contacts.object_id) AND public.customer_has_access(o.customer_id, o.tenant_id))))",
          "checkExpression": "(EXISTS ( SELECT 1\n   FROM public.objects o\n  WHERE ((o.id = object_contacts.object_id) AND public.customer_has_access(o.customer_id, o.tenant_id))))"
        },
        {
          "schema": "public",
          "table": "object_contacts",
          "name": "object_contacts_management",
          "command": "*",
          "permissive": true,
          "roles": [
            "authenticated"
          ],
          "usingExpression": "(EXISTS ( SELECT 1\n   FROM public.objects o\n  WHERE ((o.id = object_contacts.object_id) AND public.is_management_for_tenant(o.tenant_id))))",
          "checkExpression": "(EXISTS ( SELECT 1\n   FROM public.objects o\n  WHERE ((o.id = object_contacts.object_id) AND public.is_management_for_tenant(o.tenant_id))))"
        },
        {
          "schema": "public",
          "table": "object_personnel",
          "name": "fieldgrid_runtime_data_delete",
          "command": "d",
          "permissive": true,
          "roles": [
            "fieldgrid_runtime_data"
          ],
          "usingExpression": "true",
          "checkExpression": null
        },
        {
          "schema": "public",
          "table": "object_personnel",
          "name": "fieldgrid_runtime_data_insert",
          "command": "a",
          "permissive": true,
          "roles": [
            "fieldgrid_runtime_data"
          ],
          "usingExpression": null,
          "checkExpression": "true"
        },
        {
          "schema": "public",
          "table": "object_personnel",
          "name": "fieldgrid_runtime_data_select",
          "command": "r",
          "permissive": true,
          "roles": [
            "fieldgrid_runtime_data"
          ],
          "usingExpression": "true",
          "checkExpression": null
        },
        {
          "schema": "public",
          "table": "object_personnel",
          "name": "object_personnel_management",
          "command": "*",
          "permissive": true,
          "roles": [
            "authenticated"
          ],
          "usingExpression": "(EXISTS ( SELECT 1\n   FROM public.objects o\n  WHERE ((o.id = object_personnel.object_id) AND public.is_management_for_tenant(o.tenant_id))))",
          "checkExpression": "(EXISTS ( SELECT 1\n   FROM public.objects o\n  WHERE ((o.id = object_personnel.object_id) AND public.is_management_for_tenant(o.tenant_id))))"
        },
        {
          "schema": "public",
          "table": "objects",
          "name": "fieldgrid_runtime_data_delete",
          "command": "d",
          "permissive": true,
          "roles": [
            "fieldgrid_runtime_data"
          ],
          "usingExpression": "true",
          "checkExpression": null
        },
        {
          "schema": "public",
          "table": "objects",
          "name": "fieldgrid_runtime_data_insert",
          "command": "a",
          "permissive": true,
          "roles": [
            "fieldgrid_runtime_data"
          ],
          "usingExpression": null,
          "checkExpression": "true"
        },
        {
          "schema": "public",
          "table": "objects",
          "name": "fieldgrid_runtime_data_select",
          "command": "r",
          "permissive": true,
          "roles": [
            "fieldgrid_runtime_data"
          ],
          "usingExpression": "true",
          "checkExpression": null
        },
        {
          "schema": "public",
          "table": "objects",
          "name": "fieldgrid_runtime_data_update",
          "command": "w",
          "permissive": true,
          "roles": [
            "fieldgrid_runtime_data"
          ],
          "usingExpression": "true",
          "checkExpression": "true"
        },
        {
          "schema": "public",
          "table": "objects",
          "name": "objects_customer_users_insert",
          "command": "a",
          "permissive": true,
          "roles": [
            "authenticated"
          ],
          "usingExpression": null,
          "checkExpression": "public.customer_has_access(customer_id, tenant_id)"
        },
        {
          "schema": "public",
          "table": "objects",
          "name": "objects_customer_users_select",
          "command": "r",
          "permissive": true,
          "roles": [
            "authenticated"
          ],
          "usingExpression": "public.customer_has_access(customer_id, tenant_id)",
          "checkExpression": null
        },
        {
          "schema": "public",
          "table": "objects",
          "name": "objects_customer_users_update",
          "command": "w",
          "permissive": true,
          "roles": [
            "authenticated"
          ],
          "usingExpression": "public.customer_has_access(customer_id, tenant_id)",
          "checkExpression": "public.customer_has_access(customer_id, tenant_id)"
        },
        {
          "schema": "public",
          "table": "objects",
          "name": "objects_management",
          "command": "*",
          "permissive": true,
          "roles": [
            "authenticated"
          ],
          "usingExpression": "public.is_management_for_tenant(tenant_id)",
          "checkExpression": "public.is_management_for_tenant(tenant_id)"
        },
        {
          "schema": "public",
          "table": "objects",
          "name": "personnel_select_assigned_objects",
          "command": "r",
          "permissive": true,
          "roles": [
            "authenticated"
          ],
          "usingExpression": "(EXISTS ( SELECT 1\n   FROM public.assignments a\n  WHERE ((a.object_id = objects.id) AND public.personnel_assigned_to_assignment(a.id))))",
          "checkExpression": null
        },
        {
          "schema": "public",
          "table": "payments",
          "name": "fieldgrid_runtime_data_insert",
          "command": "a",
          "permissive": true,
          "roles": [
            "fieldgrid_runtime_data"
          ],
          "usingExpression": null,
          "checkExpression": "true"
        },
        {
          "schema": "public",
          "table": "payments",
          "name": "fieldgrid_runtime_data_select",
          "command": "r",
          "permissive": true,
          "roles": [
            "fieldgrid_runtime_data"
          ],
          "usingExpression": "true",
          "checkExpression": null
        },
        {
          "schema": "public",
          "table": "payments",
          "name": "fieldgrid_runtime_data_update",
          "command": "w",
          "permissive": true,
          "roles": [
            "fieldgrid_runtime_data"
          ],
          "usingExpression": "true",
          "checkExpression": "true"
        },
        {
          "schema": "public",
          "table": "personnel",
          "name": "fieldgrid_runtime_data_delete",
          "command": "d",
          "permissive": true,
          "roles": [
            "fieldgrid_runtime_data"
          ],
          "usingExpression": "true",
          "checkExpression": null
        },
        {
          "schema": "public",
          "table": "personnel",
          "name": "fieldgrid_runtime_data_insert",
          "command": "a",
          "permissive": true,
          "roles": [
            "fieldgrid_runtime_data"
          ],
          "usingExpression": null,
          "checkExpression": "true"
        },
        {
          "schema": "public",
          "table": "personnel",
          "name": "fieldgrid_runtime_data_select",
          "command": "r",
          "permissive": true,
          "roles": [
            "fieldgrid_runtime_data"
          ],
          "usingExpression": "true",
          "checkExpression": null
        },
        {
          "schema": "public",
          "table": "personnel",
          "name": "fieldgrid_runtime_data_update",
          "command": "w",
          "permissive": true,
          "roles": [
            "fieldgrid_runtime_data"
          ],
          "usingExpression": "true",
          "checkExpression": "true"
        },
        {
          "schema": "public",
          "table": "personnel",
          "name": "personnel_management",
          "command": "*",
          "permissive": true,
          "roles": [
            "authenticated"
          ],
          "usingExpression": "public.is_management_for_tenant(tenant_id)",
          "checkExpression": "public.is_management_for_tenant(tenant_id)"
        },
        {
          "schema": "public",
          "table": "personnel",
          "name": "personnel_select_own",
          "command": "r",
          "permissive": true,
          "roles": [
            "authenticated"
          ],
          "usingExpression": "(user_id = auth.uid())",
          "checkExpression": null
        }
      ],
      "helpers": [
        {
          "schema": "public",
          "name": "customer_has_access",
          "argumentTypes": [
            "uuid",
            "uuid"
          ],
          "returnType": "bool",
          "body": "\n  SELECT EXISTS (\n    SELECT 1\n    FROM customer_users cu\n    WHERE cu.customer_id = p_customer_id\n      AND cu.tenant_id = p_tenant_id\n      AND cu.user_id = (SELECT auth.uid())\n      AND cu.status = 'active'\n  );\n",
          "language": "sql",
          "securityDefiner": false,
          "volatility": "s",
          "parallel": "u",
          "strict": false,
          "leakproof": false,
          "config": [
            "search_path=public, auth"
          ],
          "argNames": [
            "p_customer_id",
            "p_tenant_id"
          ],
          "defaultCount": 0,
          "ownerRelation": {
            "schema": "public",
            "table": "object_contacts"
          },
          "directAcl": [
            {
              "grantee": "$owner",
              "grantor": "$owner",
              "privilege": "EXECUTE",
              "grantable": false
            },
            {
              "grantee": "authenticated",
              "grantor": "$owner",
              "privilege": "EXECUTE",
              "grantable": false
            }
          ],
          "effectiveExecute": [
            {
              "role": "$owner",
              "allowed": true
            },
            {
              "role": "PUBLIC",
              "allowed": false
            },
            {
              "role": "anon",
              "allowed": false
            },
            {
              "role": "authenticated",
              "allowed": true
            },
            {
              "role": "service_role",
              "allowed": false
            },
            {
              "role": "fieldgrid_runtime_data",
              "allowed": false
            },
            {
              "role": "fieldgrid_runtime_app",
              "allowed": false
            }
          ]
        },
        {
          "schema": "public",
          "name": "personnel_assigned_to_assignment",
          "argumentTypes": [
            "uuid"
          ],
          "returnType": "bool",
          "body": "\n  SELECT\n    (SELECT auth.uid()) IS NOT NULL\n    AND EXISTS (\n      SELECT 1\n      FROM public.assignment_personnel ap\n      JOIN public.assignments a\n        ON a.id = ap.assignment_id\n      JOIN public.personnel p\n        ON p.id = ap.personnel_id\n      WHERE ap.assignment_id = p_assignment_id\n        AND ap.status = 'assigned'\n        AND p.user_id = (SELECT auth.uid())\n        AND p.is_active = true\n        AND p.tenant_id IS NOT NULL\n        AND a.tenant_id IS NOT NULL\n        AND p.tenant_id = a.tenant_id\n    );\n",
          "language": "sql",
          "securityDefiner": true,
          "volatility": "s",
          "parallel": "u",
          "strict": false,
          "leakproof": false,
          "config": [
            "search_path=pg_catalog, public, auth"
          ],
          "argNames": [
            "p_assignment_id"
          ],
          "defaultCount": 0,
          "ownerRelation": {
            "schema": "public",
            "table": "object_contacts"
          },
          "directAcl": [
            {
              "grantee": "$owner",
              "grantor": "$owner",
              "privilege": "EXECUTE",
              "grantable": false
            },
            {
              "grantee": "authenticated",
              "grantor": "$owner",
              "privilege": "EXECUTE",
              "grantable": false
            }
          ],
          "effectiveExecute": [
            {
              "role": "$owner",
              "allowed": true
            },
            {
              "role": "PUBLIC",
              "allowed": false
            },
            {
              "role": "anon",
              "allowed": false
            },
            {
              "role": "authenticated",
              "allowed": true
            },
            {
              "role": "service_role",
              "allowed": false
            },
            {
              "role": "fieldgrid_runtime_data",
              "allowed": false
            },
            {
              "role": "fieldgrid_runtime_app",
              "allowed": false
            }
          ]
        },
        {
          "schema": "public",
          "name": "fieldgrid_has_platform_permission",
          "argumentTypes": [
            "text"
          ],
          "returnType": "bool",
          "body": "\n  SELECT EXISTS (\n    SELECT 1 FROM public.platform_users pu\n    WHERE pu.user_id = auth.uid() AND pu.status = 'active'\n      AND (\n        pu.role = 'owner'\n        OR (pu.role = 'admin' AND p_permission = ANY (ARRAY[\n          'global.rbac.manage', 'global.reference.manage', 'global.content.manage',\n          'platform.tenants.read', 'platform.audit.read'\n        ]))\n      )\n  );\n",
          "language": "sql",
          "securityDefiner": true,
          "volatility": "s",
          "parallel": "u",
          "strict": false,
          "leakproof": false,
          "config": [
            "search_path=pg_catalog, public, pg_temp"
          ],
          "argNames": [
            "p_permission"
          ],
          "defaultCount": 0,
          "ownerRelation": {
            "schema": "public",
            "table": "object_contacts"
          },
          "directAcl": [
            {
              "grantee": "$owner",
              "grantor": "$owner",
              "privilege": "EXECUTE",
              "grantable": false
            },
            {
              "grantee": "authenticated",
              "grantor": "$owner",
              "privilege": "EXECUTE",
              "grantable": false
            }
          ],
          "effectiveExecute": [
            {
              "role": "$owner",
              "allowed": true
            },
            {
              "role": "PUBLIC",
              "allowed": false
            },
            {
              "role": "anon",
              "allowed": false
            },
            {
              "role": "authenticated",
              "allowed": true
            },
            {
              "role": "service_role",
              "allowed": false
            },
            {
              "role": "fieldgrid_runtime_data",
              "allowed": false
            },
            {
              "role": "fieldgrid_runtime_app",
              "allowed": false
            }
          ]
        },
        {
          "schema": "auth",
          "name": "uid",
          "argumentTypes": [],
          "returnType": "uuid",
          "body": "\n  select \n  coalesce(\n    nullif(current_setting('request.jwt.claim.sub', true), ''),\n    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')\n  )::uuid\n",
          "language": "sql",
          "securityDefiner": false,
          "volatility": "s",
          "parallel": "u",
          "strict": false,
          "leakproof": false,
          "config": null,
          "argNames": null,
          "defaultCount": 0,
          "ownerRelation": {
            "schema": "auth",
            "table": "users"
          },
          "directAcl": [
            {
              "grantee": "$owner",
              "grantor": "$owner",
              "privilege": "EXECUTE",
              "grantable": false
            },
            {
              "grantee": "PUBLIC",
              "grantor": "$owner",
              "privilege": "EXECUTE",
              "grantable": false
            },
            {
              "grantee": "postgres",
              "grantor": "$owner",
              "privilege": "EXECUTE",
              "grantable": false
            },
            {
              "grantee": "dashboard_user",
              "grantor": "$owner",
              "privilege": "EXECUTE",
              "grantable": false
            }
          ],
          "effectiveExecute": [
            {
              "role": "$owner",
              "allowed": true
            },
            {
              "role": "PUBLIC",
              "allowed": true
            },
            {
              "role": "anon",
              "allowed": true
            },
            {
              "role": "authenticated",
              "allowed": true
            },
            {
              "role": "service_role",
              "allowed": true
            },
            {
              "role": "fieldgrid_runtime_data",
              "allowed": true
            },
            {
              "role": "fieldgrid_runtime_app",
              "allowed": true
            }
          ]
        }
      ]
    }
  },
  {
    "state": "targetClean",
    "profile": "localShim",
    "manifest": {
      "version": 1,
      "postgresMajor": 17,
      "sources": [
        {
          "path": "lib/db/migrations/002_sprint1_rls.sql",
          "sha256": "16a27aa61943516314b9800d7b37a08eeb9c64441a5994c7da3f9badf7265238"
        },
        {
          "path": "lib/db/migrations/025_platform_schema_extensions.sql",
          "sha256": "8a57d65ba11e3122f897498093d1351f0cf57a2f1940850e266bbfc54c0b3636"
        },
        {
          "path": "lib/db/migrations/037_tenant_customer_users_events_hardening.sql",
          "sha256": "03a1ad0cbf406140c64b53da422abb62a45a6e0e9fb68832a8328ca6685d0b0e"
        },
        {
          "path": "lib/db/migrations/051_final_security_boundaries.sql",
          "sha256": "64f12a61bbd19cfbf4ec854c31560717bef4219433b03c09055f3f6f070181ff"
        },
        {
          "path": "lib/db/migrations/062_finance_reports_tenant_scope.sql",
          "sha256": "0ff1e8fcc5e0a3c7674ed084e6058e1a538ca0fed13e02f469fb0d363e055fbe"
        },
        {
          "path": "lib/db/migrations/063_payments_batches_audit_tenant_scope.sql",
          "sha256": "171caa7e6a8d4a8f624e475dc234d21b6c81e1e38802ddad3db778047f2053d2"
        },
        {
          "path": "lib/db/migrations/20260710200000_invoice_canon_credit_collection_payments.sql",
          "sha256": "78fc35f49a80a69ad7a7fe0dfc23c264dff2aba0fbfc49f702b3a7a74d1bc23f"
        },
        {
          "path": "lib/db/migrations/20260714120000_assignment_personnel_phase_b_direct_access_close.sql",
          "sha256": "7be5f0c1999d6eaadb22735d2243322d8aada1e64e3c4c44c4a3bc11d8317574"
        },
        {
          "path": "lib/db/migrations/20260718190000_phase2_security_reconciliation.sql",
          "sha256": "6cf0da37eec7c1b5b57c8218593873fedf1fae2a832b27e138dfd2614b861964"
        },
        {
          "path": "lib/db/migrations/20260909120000_runtime_least_privilege_principals.sql",
          "sha256": "2eaf25923d7908c94d1fb96c7fbede14858330d86be21656f50d611fe37e0066"
        },
        {
          "path": "migrations/013_sprint5_payments.sql",
          "sha256": "ea6d0e71764e92d0a0f0ad2d09a6bdf6c864c2a64d1ef717743b567d15198102"
        },
        {
          "path": "migrations/023_objects_extended.sql",
          "sha256": "19e20f3463f220a123450cefec79dc7490d5074c72f1a3f726ddfd1a28dde6ae"
        },
        {
          "path": "scripts/fieldgrid-runtime-safety-setup.mjs",
          "sha256": "f43d159c3e047bd752642e8005793df40314873a772c16c95eca7195f5c34666"
        },
        {
          "path": "tests/fixtures/fieldgrid-supabase-auth-functions.sql",
          "sha256": "5b72022d73e64a8e474d2122ac42f299bb7ce4d59755cdcc78e72abfe5d47dc0"
        }
      ],
      "relations": [
        {
          "schema": "public",
          "table": "invoices",
          "kind": "r",
          "rowSecurity": true,
          "forceRowSecurity": false,
          "columns": [
            {
              "name": "created_by",
              "notNull": false,
              "typeName": "uuid",
              "typeModifier": -1
            },
            {
              "name": "id",
              "notNull": true,
              "typeName": "uuid",
              "typeModifier": -1
            },
            {
              "name": "tenant_id",
              "notNull": true,
              "typeName": "uuid",
              "typeModifier": -1
            }
          ]
        },
        {
          "schema": "public",
          "table": "object_contacts",
          "kind": "r",
          "rowSecurity": true,
          "forceRowSecurity": false,
          "columns": [
            {
              "name": "id",
              "notNull": true,
              "typeName": "uuid",
              "typeModifier": -1
            },
            {
              "name": "object_id",
              "notNull": true,
              "typeName": "uuid",
              "typeModifier": -1
            }
          ]
        },
        {
          "schema": "public",
          "table": "object_personnel",
          "kind": "r",
          "rowSecurity": true,
          "forceRowSecurity": false,
          "columns": [
            {
              "name": "object_id",
              "notNull": true,
              "typeName": "uuid",
              "typeModifier": -1
            },
            {
              "name": "personnel_id",
              "notNull": true,
              "typeName": "uuid",
              "typeModifier": -1
            }
          ]
        },
        {
          "schema": "public",
          "table": "objects",
          "kind": "r",
          "rowSecurity": true,
          "forceRowSecurity": false,
          "columns": [
            {
              "name": "id",
              "notNull": true,
              "typeName": "uuid",
              "typeModifier": -1
            },
            {
              "name": "tenant_id",
              "notNull": true,
              "typeName": "uuid",
              "typeModifier": -1
            }
          ]
        },
        {
          "schema": "public",
          "table": "payments",
          "kind": "r",
          "rowSecurity": true,
          "forceRowSecurity": false,
          "columns": [
            {
              "name": "id",
              "notNull": true,
              "typeName": "uuid",
              "typeModifier": -1
            },
            {
              "name": "invoice_id",
              "notNull": false,
              "typeName": "uuid",
              "typeModifier": -1
            },
            {
              "name": "tenant_id",
              "notNull": true,
              "typeName": "uuid",
              "typeModifier": -1
            }
          ]
        },
        {
          "schema": "public",
          "table": "personnel",
          "kind": "r",
          "rowSecurity": true,
          "forceRowSecurity": false,
          "columns": [
            {
              "name": "id",
              "notNull": true,
              "typeName": "uuid",
              "typeModifier": -1
            },
            {
              "name": "tenant_id",
              "notNull": true,
              "typeName": "uuid",
              "typeModifier": -1
            }
          ]
        }
      ],
      "policies": [
        {
          "schema": "public",
          "table": "invoices",
          "name": "fieldgrid_runtime_data_insert",
          "command": "a",
          "permissive": true,
          "roles": [
            "fieldgrid_runtime_data"
          ],
          "usingExpression": null,
          "checkExpression": "true"
        },
        {
          "schema": "public",
          "table": "invoices",
          "name": "fieldgrid_runtime_data_select",
          "command": "r",
          "permissive": true,
          "roles": [
            "fieldgrid_runtime_data"
          ],
          "usingExpression": "true",
          "checkExpression": null
        },
        {
          "schema": "public",
          "table": "invoices",
          "name": "fieldgrid_runtime_data_update",
          "command": "w",
          "permissive": true,
          "roles": [
            "fieldgrid_runtime_data"
          ],
          "usingExpression": "true",
          "checkExpression": "true"
        },
        {
          "schema": "public",
          "table": "invoices",
          "name": "invoices_customer_sent_select",
          "command": "r",
          "permissive": true,
          "roles": [
            "authenticated"
          ],
          "usingExpression": "(((status)::text = ANY ((ARRAY['sent'::character varying, 'paid'::character varying, 'cancelled'::character varying])::text[])) AND (EXISTS ( SELECT 1\n   FROM public.customers c\n  WHERE ((c.id = invoices.customer_id) AND public.customer_has_access(c.id, c.tenant_id)))))",
          "checkExpression": null
        },
        {
          "schema": "public",
          "table": "invoices",
          "name": "invoices_management_all",
          "command": "*",
          "permissive": true,
          "roles": [
            "authenticated"
          ],
          "usingExpression": "public.is_management_for_tenant(tenant_id)",
          "checkExpression": "public.is_management_for_tenant(tenant_id)"
        },
        {
          "schema": "public",
          "table": "object_contacts",
          "name": "fieldgrid_runtime_data_delete",
          "command": "d",
          "permissive": true,
          "roles": [
            "fieldgrid_runtime_data"
          ],
          "usingExpression": "true",
          "checkExpression": null
        },
        {
          "schema": "public",
          "table": "object_contacts",
          "name": "fieldgrid_runtime_data_insert",
          "command": "a",
          "permissive": true,
          "roles": [
            "fieldgrid_runtime_data"
          ],
          "usingExpression": null,
          "checkExpression": "true"
        },
        {
          "schema": "public",
          "table": "object_contacts",
          "name": "fieldgrid_runtime_data_select",
          "command": "r",
          "permissive": true,
          "roles": [
            "fieldgrid_runtime_data"
          ],
          "usingExpression": "true",
          "checkExpression": null
        },
        {
          "schema": "public",
          "table": "object_contacts",
          "name": "fieldgrid_runtime_data_update",
          "command": "w",
          "permissive": true,
          "roles": [
            "fieldgrid_runtime_data"
          ],
          "usingExpression": "true",
          "checkExpression": "true"
        },
        {
          "schema": "public",
          "table": "object_contacts",
          "name": "object_contacts_customer_users_delete",
          "command": "d",
          "permissive": true,
          "roles": [
            "authenticated"
          ],
          "usingExpression": "(EXISTS ( SELECT 1\n   FROM public.objects o\n  WHERE ((o.id = object_contacts.object_id) AND public.customer_has_access(o.customer_id, o.tenant_id))))",
          "checkExpression": null
        },
        {
          "schema": "public",
          "table": "object_contacts",
          "name": "object_contacts_customer_users_insert",
          "command": "a",
          "permissive": true,
          "roles": [
            "authenticated"
          ],
          "usingExpression": null,
          "checkExpression": "(EXISTS ( SELECT 1\n   FROM public.objects o\n  WHERE ((o.id = object_contacts.object_id) AND public.customer_has_access(o.customer_id, o.tenant_id))))"
        },
        {
          "schema": "public",
          "table": "object_contacts",
          "name": "object_contacts_customer_users_select",
          "command": "r",
          "permissive": true,
          "roles": [
            "authenticated"
          ],
          "usingExpression": "(EXISTS ( SELECT 1\n   FROM public.objects o\n  WHERE ((o.id = object_contacts.object_id) AND public.customer_has_access(o.customer_id, o.tenant_id))))",
          "checkExpression": null
        },
        {
          "schema": "public",
          "table": "object_contacts",
          "name": "object_contacts_customer_users_update",
          "command": "w",
          "permissive": true,
          "roles": [
            "authenticated"
          ],
          "usingExpression": "(EXISTS ( SELECT 1\n   FROM public.objects o\n  WHERE ((o.id = object_contacts.object_id) AND public.customer_has_access(o.customer_id, o.tenant_id))))",
          "checkExpression": "(EXISTS ( SELECT 1\n   FROM public.objects o\n  WHERE ((o.id = object_contacts.object_id) AND public.customer_has_access(o.customer_id, o.tenant_id))))"
        },
        {
          "schema": "public",
          "table": "object_contacts",
          "name": "object_contacts_management",
          "command": "*",
          "permissive": true,
          "roles": [
            "authenticated"
          ],
          "usingExpression": "(EXISTS ( SELECT 1\n   FROM public.objects o\n  WHERE ((o.id = object_contacts.object_id) AND public.is_management_for_tenant(o.tenant_id))))",
          "checkExpression": "(EXISTS ( SELECT 1\n   FROM public.objects o\n  WHERE ((o.id = object_contacts.object_id) AND public.is_management_for_tenant(o.tenant_id))))"
        },
        {
          "schema": "public",
          "table": "object_personnel",
          "name": "fieldgrid_runtime_data_delete",
          "command": "d",
          "permissive": true,
          "roles": [
            "fieldgrid_runtime_data"
          ],
          "usingExpression": "true",
          "checkExpression": null
        },
        {
          "schema": "public",
          "table": "object_personnel",
          "name": "fieldgrid_runtime_data_insert",
          "command": "a",
          "permissive": true,
          "roles": [
            "fieldgrid_runtime_data"
          ],
          "usingExpression": null,
          "checkExpression": "true"
        },
        {
          "schema": "public",
          "table": "object_personnel",
          "name": "fieldgrid_runtime_data_select",
          "command": "r",
          "permissive": true,
          "roles": [
            "fieldgrid_runtime_data"
          ],
          "usingExpression": "true",
          "checkExpression": null
        },
        {
          "schema": "public",
          "table": "object_personnel",
          "name": "object_personnel_management",
          "command": "*",
          "permissive": true,
          "roles": [
            "authenticated"
          ],
          "usingExpression": "(EXISTS ( SELECT 1\n   FROM (public.objects o\n     JOIN public.personnel p ON (((p.id = object_personnel.personnel_id) AND (p.tenant_id = o.tenant_id))))\n  WHERE ((o.id = object_personnel.object_id) AND public.is_management_for_tenant(o.tenant_id))))",
          "checkExpression": "(EXISTS ( SELECT 1\n   FROM (public.objects o\n     JOIN public.personnel p ON (((p.id = object_personnel.personnel_id) AND (p.tenant_id = o.tenant_id))))\n  WHERE ((o.id = object_personnel.object_id) AND public.is_management_for_tenant(o.tenant_id))))"
        },
        {
          "schema": "public",
          "table": "objects",
          "name": "fieldgrid_runtime_data_delete",
          "command": "d",
          "permissive": true,
          "roles": [
            "fieldgrid_runtime_data"
          ],
          "usingExpression": "true",
          "checkExpression": null
        },
        {
          "schema": "public",
          "table": "objects",
          "name": "fieldgrid_runtime_data_insert",
          "command": "a",
          "permissive": true,
          "roles": [
            "fieldgrid_runtime_data"
          ],
          "usingExpression": null,
          "checkExpression": "true"
        },
        {
          "schema": "public",
          "table": "objects",
          "name": "fieldgrid_runtime_data_select",
          "command": "r",
          "permissive": true,
          "roles": [
            "fieldgrid_runtime_data"
          ],
          "usingExpression": "true",
          "checkExpression": null
        },
        {
          "schema": "public",
          "table": "objects",
          "name": "fieldgrid_runtime_data_update",
          "command": "w",
          "permissive": true,
          "roles": [
            "fieldgrid_runtime_data"
          ],
          "usingExpression": "true",
          "checkExpression": "true"
        },
        {
          "schema": "public",
          "table": "objects",
          "name": "objects_customer_users_insert",
          "command": "a",
          "permissive": true,
          "roles": [
            "authenticated"
          ],
          "usingExpression": null,
          "checkExpression": "public.customer_has_access(customer_id, tenant_id)"
        },
        {
          "schema": "public",
          "table": "objects",
          "name": "objects_customer_users_select",
          "command": "r",
          "permissive": true,
          "roles": [
            "authenticated"
          ],
          "usingExpression": "public.customer_has_access(customer_id, tenant_id)",
          "checkExpression": null
        },
        {
          "schema": "public",
          "table": "objects",
          "name": "objects_customer_users_update",
          "command": "w",
          "permissive": true,
          "roles": [
            "authenticated"
          ],
          "usingExpression": "public.customer_has_access(customer_id, tenant_id)",
          "checkExpression": "public.customer_has_access(customer_id, tenant_id)"
        },
        {
          "schema": "public",
          "table": "objects",
          "name": "objects_management",
          "command": "*",
          "permissive": true,
          "roles": [
            "authenticated"
          ],
          "usingExpression": "public.is_management_for_tenant(tenant_id)",
          "checkExpression": "public.is_management_for_tenant(tenant_id)"
        },
        {
          "schema": "public",
          "table": "objects",
          "name": "personnel_select_assigned_objects",
          "command": "r",
          "permissive": true,
          "roles": [
            "authenticated"
          ],
          "usingExpression": "(EXISTS ( SELECT 1\n   FROM public.assignments a\n  WHERE ((a.object_id = objects.id) AND public.personnel_assigned_to_assignment(a.id))))",
          "checkExpression": null
        },
        {
          "schema": "public",
          "table": "payments",
          "name": "fieldgrid_runtime_data_insert",
          "command": "a",
          "permissive": true,
          "roles": [
            "fieldgrid_runtime_data"
          ],
          "usingExpression": null,
          "checkExpression": "true"
        },
        {
          "schema": "public",
          "table": "payments",
          "name": "fieldgrid_runtime_data_select",
          "command": "r",
          "permissive": true,
          "roles": [
            "fieldgrid_runtime_data"
          ],
          "usingExpression": "true",
          "checkExpression": null
        },
        {
          "schema": "public",
          "table": "payments",
          "name": "fieldgrid_runtime_data_update",
          "command": "w",
          "permissive": true,
          "roles": [
            "fieldgrid_runtime_data"
          ],
          "usingExpression": "true",
          "checkExpression": "true"
        },
        {
          "schema": "public",
          "table": "payments",
          "name": "owner_or_staff_read_payments",
          "command": "r",
          "permissive": true,
          "roles": [
            "authenticated"
          ],
          "usingExpression": "(EXISTS ( SELECT 1\n   FROM public.invoices i\n  WHERE ((i.id = payments.invoice_id) AND (i.tenant_id = payments.tenant_id) AND ((i.created_by = auth.uid()) OR public.is_management_for_tenant(i.tenant_id)))))",
          "checkExpression": null
        },
        {
          "schema": "public",
          "table": "personnel",
          "name": "fieldgrid_runtime_data_delete",
          "command": "d",
          "permissive": true,
          "roles": [
            "fieldgrid_runtime_data"
          ],
          "usingExpression": "true",
          "checkExpression": null
        },
        {
          "schema": "public",
          "table": "personnel",
          "name": "fieldgrid_runtime_data_insert",
          "command": "a",
          "permissive": true,
          "roles": [
            "fieldgrid_runtime_data"
          ],
          "usingExpression": null,
          "checkExpression": "true"
        },
        {
          "schema": "public",
          "table": "personnel",
          "name": "fieldgrid_runtime_data_select",
          "command": "r",
          "permissive": true,
          "roles": [
            "fieldgrid_runtime_data"
          ],
          "usingExpression": "true",
          "checkExpression": null
        },
        {
          "schema": "public",
          "table": "personnel",
          "name": "fieldgrid_runtime_data_update",
          "command": "w",
          "permissive": true,
          "roles": [
            "fieldgrid_runtime_data"
          ],
          "usingExpression": "true",
          "checkExpression": "true"
        },
        {
          "schema": "public",
          "table": "personnel",
          "name": "personnel_management",
          "command": "*",
          "permissive": true,
          "roles": [
            "authenticated"
          ],
          "usingExpression": "public.is_management_for_tenant(tenant_id)",
          "checkExpression": "public.is_management_for_tenant(tenant_id)"
        },
        {
          "schema": "public",
          "table": "personnel",
          "name": "personnel_select_own",
          "command": "r",
          "permissive": true,
          "roles": [
            "authenticated"
          ],
          "usingExpression": "(user_id = auth.uid())",
          "checkExpression": null
        }
      ],
      "helpers": [
        {
          "schema": "public",
          "name": "customer_has_access",
          "argumentTypes": [
            "uuid",
            "uuid"
          ],
          "returnType": "bool",
          "body": "\n  SELECT EXISTS (\n    SELECT 1\n    FROM customer_users cu\n    WHERE cu.customer_id = p_customer_id\n      AND cu.tenant_id = p_tenant_id\n      AND cu.user_id = (SELECT auth.uid())\n      AND cu.status = 'active'\n  );\n",
          "language": "sql",
          "securityDefiner": false,
          "volatility": "s",
          "parallel": "u",
          "strict": false,
          "leakproof": false,
          "config": [
            "search_path=public, auth"
          ],
          "argNames": [
            "p_customer_id",
            "p_tenant_id"
          ],
          "defaultCount": 0,
          "ownerRelation": {
            "schema": "public",
            "table": "object_contacts"
          },
          "directAcl": [
            {
              "grantee": "$owner",
              "grantor": "$owner",
              "privilege": "EXECUTE",
              "grantable": false
            },
            {
              "grantee": "authenticated",
              "grantor": "$owner",
              "privilege": "EXECUTE",
              "grantable": false
            }
          ],
          "effectiveExecute": [
            {
              "role": "$owner",
              "allowed": true
            },
            {
              "role": "PUBLIC",
              "allowed": false
            },
            {
              "role": "anon",
              "allowed": false
            },
            {
              "role": "authenticated",
              "allowed": true
            },
            {
              "role": "service_role",
              "allowed": false
            },
            {
              "role": "fieldgrid_runtime_data",
              "allowed": false
            },
            {
              "role": "fieldgrid_runtime_app",
              "allowed": false
            }
          ]
        },
        {
          "schema": "public",
          "name": "personnel_assigned_to_assignment",
          "argumentTypes": [
            "uuid"
          ],
          "returnType": "bool",
          "body": "\n  SELECT\n    (SELECT auth.uid()) IS NOT NULL\n    AND EXISTS (\n      SELECT 1\n      FROM public.assignment_personnel ap\n      JOIN public.assignments a\n        ON a.id = ap.assignment_id\n      JOIN public.personnel p\n        ON p.id = ap.personnel_id\n      WHERE ap.assignment_id = p_assignment_id\n        AND ap.status = 'assigned'\n        AND p.user_id = (SELECT auth.uid())\n        AND p.is_active = true\n        AND p.tenant_id IS NOT NULL\n        AND a.tenant_id IS NOT NULL\n        AND p.tenant_id = a.tenant_id\n    );\n",
          "language": "sql",
          "securityDefiner": true,
          "volatility": "s",
          "parallel": "u",
          "strict": false,
          "leakproof": false,
          "config": [
            "search_path=pg_catalog, public, auth"
          ],
          "argNames": [
            "p_assignment_id"
          ],
          "defaultCount": 0,
          "ownerRelation": {
            "schema": "public",
            "table": "object_contacts"
          },
          "directAcl": [
            {
              "grantee": "$owner",
              "grantor": "$owner",
              "privilege": "EXECUTE",
              "grantable": false
            },
            {
              "grantee": "authenticated",
              "grantor": "$owner",
              "privilege": "EXECUTE",
              "grantable": false
            }
          ],
          "effectiveExecute": [
            {
              "role": "$owner",
              "allowed": true
            },
            {
              "role": "PUBLIC",
              "allowed": false
            },
            {
              "role": "anon",
              "allowed": false
            },
            {
              "role": "authenticated",
              "allowed": true
            },
            {
              "role": "service_role",
              "allowed": false
            },
            {
              "role": "fieldgrid_runtime_data",
              "allowed": false
            },
            {
              "role": "fieldgrid_runtime_app",
              "allowed": false
            }
          ]
        },
        {
          "schema": "public",
          "name": "fieldgrid_has_platform_permission",
          "argumentTypes": [
            "text"
          ],
          "returnType": "bool",
          "body": "\n  SELECT EXISTS (\n    SELECT 1 FROM public.platform_users pu\n    WHERE pu.user_id = auth.uid() AND pu.status = 'active'\n      AND (\n        pu.role = 'owner'\n        OR (pu.role = 'admin' AND p_permission = ANY (ARRAY[\n          'global.rbac.manage', 'global.reference.manage', 'global.content.manage',\n          'platform.tenants.read', 'platform.audit.read'\n        ]))\n      )\n  );\n",
          "language": "sql",
          "securityDefiner": true,
          "volatility": "s",
          "parallel": "u",
          "strict": false,
          "leakproof": false,
          "config": [
            "search_path=pg_catalog, public, pg_temp"
          ],
          "argNames": [
            "p_permission"
          ],
          "defaultCount": 0,
          "ownerRelation": {
            "schema": "public",
            "table": "object_contacts"
          },
          "directAcl": [
            {
              "grantee": "$owner",
              "grantor": "$owner",
              "privilege": "EXECUTE",
              "grantable": false
            },
            {
              "grantee": "authenticated",
              "grantor": "$owner",
              "privilege": "EXECUTE",
              "grantable": false
            }
          ],
          "effectiveExecute": [
            {
              "role": "$owner",
              "allowed": true
            },
            {
              "role": "PUBLIC",
              "allowed": false
            },
            {
              "role": "anon",
              "allowed": false
            },
            {
              "role": "authenticated",
              "allowed": true
            },
            {
              "role": "service_role",
              "allowed": false
            },
            {
              "role": "fieldgrid_runtime_data",
              "allowed": false
            },
            {
              "role": "fieldgrid_runtime_app",
              "allowed": false
            }
          ]
        },
        {
          "schema": "auth",
          "name": "uid",
          "argumentTypes": [],
          "returnType": "uuid",
          "body": "\n      select nullif(\n        coalesce(\n          nullif(current_setting('request.jwt.claim.sub', true), ''),\n          nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'\n        ),\n        ''\n      )::uuid\n    ",
          "language": "sql",
          "securityDefiner": false,
          "volatility": "s",
          "parallel": "u",
          "strict": false,
          "leakproof": false,
          "config": null,
          "argNames": null,
          "defaultCount": 0,
          "ownerRelation": {
            "schema": "auth",
            "table": "users"
          },
          "directAcl": [
            {
              "grantee": "$owner",
              "grantor": "$owner",
              "privilege": "EXECUTE",
              "grantable": false
            },
            {
              "grantee": "PUBLIC",
              "grantor": "$owner",
              "privilege": "EXECUTE",
              "grantable": false
            }
          ],
          "effectiveExecute": [
            {
              "role": "$owner",
              "allowed": true
            },
            {
              "role": "PUBLIC",
              "allowed": true
            },
            {
              "role": "anon",
              "allowed": true
            },
            {
              "role": "authenticated",
              "allowed": true
            },
            {
              "role": "service_role",
              "allowed": true
            },
            {
              "role": "fieldgrid_runtime_data",
              "allowed": true
            },
            {
              "role": "fieldgrid_runtime_app",
              "allowed": true
            }
          ]
        }
      ]
    }
  },
  {
    "state": "targetClean",
    "profile": "providerSource",
    "manifest": {
      "version": 1,
      "postgresMajor": 17,
      "sources": [
        {
          "path": "lib/db/migrations/002_sprint1_rls.sql",
          "sha256": "16a27aa61943516314b9800d7b37a08eeb9c64441a5994c7da3f9badf7265238"
        },
        {
          "path": "lib/db/migrations/025_platform_schema_extensions.sql",
          "sha256": "8a57d65ba11e3122f897498093d1351f0cf57a2f1940850e266bbfc54c0b3636"
        },
        {
          "path": "lib/db/migrations/037_tenant_customer_users_events_hardening.sql",
          "sha256": "03a1ad0cbf406140c64b53da422abb62a45a6e0e9fb68832a8328ca6685d0b0e"
        },
        {
          "path": "lib/db/migrations/051_final_security_boundaries.sql",
          "sha256": "64f12a61bbd19cfbf4ec854c31560717bef4219433b03c09055f3f6f070181ff"
        },
        {
          "path": "lib/db/migrations/062_finance_reports_tenant_scope.sql",
          "sha256": "0ff1e8fcc5e0a3c7674ed084e6058e1a538ca0fed13e02f469fb0d363e055fbe"
        },
        {
          "path": "lib/db/migrations/063_payments_batches_audit_tenant_scope.sql",
          "sha256": "171caa7e6a8d4a8f624e475dc234d21b6c81e1e38802ddad3db778047f2053d2"
        },
        {
          "path": "lib/db/migrations/20260710200000_invoice_canon_credit_collection_payments.sql",
          "sha256": "78fc35f49a80a69ad7a7fe0dfc23c264dff2aba0fbfc49f702b3a7a74d1bc23f"
        },
        {
          "path": "lib/db/migrations/20260714120000_assignment_personnel_phase_b_direct_access_close.sql",
          "sha256": "7be5f0c1999d6eaadb22735d2243322d8aada1e64e3c4c44c4a3bc11d8317574"
        },
        {
          "path": "lib/db/migrations/20260718190000_phase2_security_reconciliation.sql",
          "sha256": "6cf0da37eec7c1b5b57c8218593873fedf1fae2a832b27e138dfd2614b861964"
        },
        {
          "path": "lib/db/migrations/20260909120000_runtime_least_privilege_principals.sql",
          "sha256": "2eaf25923d7908c94d1fb96c7fbede14858330d86be21656f50d611fe37e0066"
        },
        {
          "path": "migrations/013_sprint5_payments.sql",
          "sha256": "ea6d0e71764e92d0a0f0ad2d09a6bdf6c864c2a64d1ef717743b567d15198102"
        },
        {
          "path": "migrations/023_objects_extended.sql",
          "sha256": "19e20f3463f220a123450cefec79dc7490d5074c72f1a3f726ddfd1a28dde6ae"
        },
        {
          "path": "scripts/fieldgrid-runtime-safety-setup.mjs",
          "sha256": "f43d159c3e047bd752642e8005793df40314873a772c16c95eca7195f5c34666"
        },
        {
          "path": "tests/fixtures/fieldgrid-supabase-auth-functions.sql",
          "sha256": "5b72022d73e64a8e474d2122ac42f299bb7ce4d59755cdcc78e72abfe5d47dc0"
        }
      ],
      "relations": [
        {
          "schema": "public",
          "table": "invoices",
          "kind": "r",
          "rowSecurity": true,
          "forceRowSecurity": false,
          "columns": [
            {
              "name": "created_by",
              "notNull": false,
              "typeName": "uuid",
              "typeModifier": -1
            },
            {
              "name": "id",
              "notNull": true,
              "typeName": "uuid",
              "typeModifier": -1
            },
            {
              "name": "tenant_id",
              "notNull": true,
              "typeName": "uuid",
              "typeModifier": -1
            }
          ]
        },
        {
          "schema": "public",
          "table": "object_contacts",
          "kind": "r",
          "rowSecurity": true,
          "forceRowSecurity": false,
          "columns": [
            {
              "name": "id",
              "notNull": true,
              "typeName": "uuid",
              "typeModifier": -1
            },
            {
              "name": "object_id",
              "notNull": true,
              "typeName": "uuid",
              "typeModifier": -1
            }
          ]
        },
        {
          "schema": "public",
          "table": "object_personnel",
          "kind": "r",
          "rowSecurity": true,
          "forceRowSecurity": false,
          "columns": [
            {
              "name": "object_id",
              "notNull": true,
              "typeName": "uuid",
              "typeModifier": -1
            },
            {
              "name": "personnel_id",
              "notNull": true,
              "typeName": "uuid",
              "typeModifier": -1
            }
          ]
        },
        {
          "schema": "public",
          "table": "objects",
          "kind": "r",
          "rowSecurity": true,
          "forceRowSecurity": false,
          "columns": [
            {
              "name": "id",
              "notNull": true,
              "typeName": "uuid",
              "typeModifier": -1
            },
            {
              "name": "tenant_id",
              "notNull": true,
              "typeName": "uuid",
              "typeModifier": -1
            }
          ]
        },
        {
          "schema": "public",
          "table": "payments",
          "kind": "r",
          "rowSecurity": true,
          "forceRowSecurity": false,
          "columns": [
            {
              "name": "id",
              "notNull": true,
              "typeName": "uuid",
              "typeModifier": -1
            },
            {
              "name": "invoice_id",
              "notNull": false,
              "typeName": "uuid",
              "typeModifier": -1
            },
            {
              "name": "tenant_id",
              "notNull": true,
              "typeName": "uuid",
              "typeModifier": -1
            }
          ]
        },
        {
          "schema": "public",
          "table": "personnel",
          "kind": "r",
          "rowSecurity": true,
          "forceRowSecurity": false,
          "columns": [
            {
              "name": "id",
              "notNull": true,
              "typeName": "uuid",
              "typeModifier": -1
            },
            {
              "name": "tenant_id",
              "notNull": true,
              "typeName": "uuid",
              "typeModifier": -1
            }
          ]
        }
      ],
      "policies": [
        {
          "schema": "public",
          "table": "invoices",
          "name": "fieldgrid_runtime_data_insert",
          "command": "a",
          "permissive": true,
          "roles": [
            "fieldgrid_runtime_data"
          ],
          "usingExpression": null,
          "checkExpression": "true"
        },
        {
          "schema": "public",
          "table": "invoices",
          "name": "fieldgrid_runtime_data_select",
          "command": "r",
          "permissive": true,
          "roles": [
            "fieldgrid_runtime_data"
          ],
          "usingExpression": "true",
          "checkExpression": null
        },
        {
          "schema": "public",
          "table": "invoices",
          "name": "fieldgrid_runtime_data_update",
          "command": "w",
          "permissive": true,
          "roles": [
            "fieldgrid_runtime_data"
          ],
          "usingExpression": "true",
          "checkExpression": "true"
        },
        {
          "schema": "public",
          "table": "invoices",
          "name": "invoices_customer_sent_select",
          "command": "r",
          "permissive": true,
          "roles": [
            "authenticated"
          ],
          "usingExpression": "(((status)::text = ANY ((ARRAY['sent'::character varying, 'paid'::character varying, 'cancelled'::character varying])::text[])) AND (EXISTS ( SELECT 1\n   FROM public.customers c\n  WHERE ((c.id = invoices.customer_id) AND public.customer_has_access(c.id, c.tenant_id)))))",
          "checkExpression": null
        },
        {
          "schema": "public",
          "table": "invoices",
          "name": "invoices_management_all",
          "command": "*",
          "permissive": true,
          "roles": [
            "authenticated"
          ],
          "usingExpression": "public.is_management_for_tenant(tenant_id)",
          "checkExpression": "public.is_management_for_tenant(tenant_id)"
        },
        {
          "schema": "public",
          "table": "object_contacts",
          "name": "fieldgrid_runtime_data_delete",
          "command": "d",
          "permissive": true,
          "roles": [
            "fieldgrid_runtime_data"
          ],
          "usingExpression": "true",
          "checkExpression": null
        },
        {
          "schema": "public",
          "table": "object_contacts",
          "name": "fieldgrid_runtime_data_insert",
          "command": "a",
          "permissive": true,
          "roles": [
            "fieldgrid_runtime_data"
          ],
          "usingExpression": null,
          "checkExpression": "true"
        },
        {
          "schema": "public",
          "table": "object_contacts",
          "name": "fieldgrid_runtime_data_select",
          "command": "r",
          "permissive": true,
          "roles": [
            "fieldgrid_runtime_data"
          ],
          "usingExpression": "true",
          "checkExpression": null
        },
        {
          "schema": "public",
          "table": "object_contacts",
          "name": "fieldgrid_runtime_data_update",
          "command": "w",
          "permissive": true,
          "roles": [
            "fieldgrid_runtime_data"
          ],
          "usingExpression": "true",
          "checkExpression": "true"
        },
        {
          "schema": "public",
          "table": "object_contacts",
          "name": "object_contacts_customer_users_delete",
          "command": "d",
          "permissive": true,
          "roles": [
            "authenticated"
          ],
          "usingExpression": "(EXISTS ( SELECT 1\n   FROM public.objects o\n  WHERE ((o.id = object_contacts.object_id) AND public.customer_has_access(o.customer_id, o.tenant_id))))",
          "checkExpression": null
        },
        {
          "schema": "public",
          "table": "object_contacts",
          "name": "object_contacts_customer_users_insert",
          "command": "a",
          "permissive": true,
          "roles": [
            "authenticated"
          ],
          "usingExpression": null,
          "checkExpression": "(EXISTS ( SELECT 1\n   FROM public.objects o\n  WHERE ((o.id = object_contacts.object_id) AND public.customer_has_access(o.customer_id, o.tenant_id))))"
        },
        {
          "schema": "public",
          "table": "object_contacts",
          "name": "object_contacts_customer_users_select",
          "command": "r",
          "permissive": true,
          "roles": [
            "authenticated"
          ],
          "usingExpression": "(EXISTS ( SELECT 1\n   FROM public.objects o\n  WHERE ((o.id = object_contacts.object_id) AND public.customer_has_access(o.customer_id, o.tenant_id))))",
          "checkExpression": null
        },
        {
          "schema": "public",
          "table": "object_contacts",
          "name": "object_contacts_customer_users_update",
          "command": "w",
          "permissive": true,
          "roles": [
            "authenticated"
          ],
          "usingExpression": "(EXISTS ( SELECT 1\n   FROM public.objects o\n  WHERE ((o.id = object_contacts.object_id) AND public.customer_has_access(o.customer_id, o.tenant_id))))",
          "checkExpression": "(EXISTS ( SELECT 1\n   FROM public.objects o\n  WHERE ((o.id = object_contacts.object_id) AND public.customer_has_access(o.customer_id, o.tenant_id))))"
        },
        {
          "schema": "public",
          "table": "object_contacts",
          "name": "object_contacts_management",
          "command": "*",
          "permissive": true,
          "roles": [
            "authenticated"
          ],
          "usingExpression": "(EXISTS ( SELECT 1\n   FROM public.objects o\n  WHERE ((o.id = object_contacts.object_id) AND public.is_management_for_tenant(o.tenant_id))))",
          "checkExpression": "(EXISTS ( SELECT 1\n   FROM public.objects o\n  WHERE ((o.id = object_contacts.object_id) AND public.is_management_for_tenant(o.tenant_id))))"
        },
        {
          "schema": "public",
          "table": "object_personnel",
          "name": "fieldgrid_runtime_data_delete",
          "command": "d",
          "permissive": true,
          "roles": [
            "fieldgrid_runtime_data"
          ],
          "usingExpression": "true",
          "checkExpression": null
        },
        {
          "schema": "public",
          "table": "object_personnel",
          "name": "fieldgrid_runtime_data_insert",
          "command": "a",
          "permissive": true,
          "roles": [
            "fieldgrid_runtime_data"
          ],
          "usingExpression": null,
          "checkExpression": "true"
        },
        {
          "schema": "public",
          "table": "object_personnel",
          "name": "fieldgrid_runtime_data_select",
          "command": "r",
          "permissive": true,
          "roles": [
            "fieldgrid_runtime_data"
          ],
          "usingExpression": "true",
          "checkExpression": null
        },
        {
          "schema": "public",
          "table": "object_personnel",
          "name": "object_personnel_management",
          "command": "*",
          "permissive": true,
          "roles": [
            "authenticated"
          ],
          "usingExpression": "(EXISTS ( SELECT 1\n   FROM (public.objects o\n     JOIN public.personnel p ON (((p.id = object_personnel.personnel_id) AND (p.tenant_id = o.tenant_id))))\n  WHERE ((o.id = object_personnel.object_id) AND public.is_management_for_tenant(o.tenant_id))))",
          "checkExpression": "(EXISTS ( SELECT 1\n   FROM (public.objects o\n     JOIN public.personnel p ON (((p.id = object_personnel.personnel_id) AND (p.tenant_id = o.tenant_id))))\n  WHERE ((o.id = object_personnel.object_id) AND public.is_management_for_tenant(o.tenant_id))))"
        },
        {
          "schema": "public",
          "table": "objects",
          "name": "fieldgrid_runtime_data_delete",
          "command": "d",
          "permissive": true,
          "roles": [
            "fieldgrid_runtime_data"
          ],
          "usingExpression": "true",
          "checkExpression": null
        },
        {
          "schema": "public",
          "table": "objects",
          "name": "fieldgrid_runtime_data_insert",
          "command": "a",
          "permissive": true,
          "roles": [
            "fieldgrid_runtime_data"
          ],
          "usingExpression": null,
          "checkExpression": "true"
        },
        {
          "schema": "public",
          "table": "objects",
          "name": "fieldgrid_runtime_data_select",
          "command": "r",
          "permissive": true,
          "roles": [
            "fieldgrid_runtime_data"
          ],
          "usingExpression": "true",
          "checkExpression": null
        },
        {
          "schema": "public",
          "table": "objects",
          "name": "fieldgrid_runtime_data_update",
          "command": "w",
          "permissive": true,
          "roles": [
            "fieldgrid_runtime_data"
          ],
          "usingExpression": "true",
          "checkExpression": "true"
        },
        {
          "schema": "public",
          "table": "objects",
          "name": "objects_customer_users_insert",
          "command": "a",
          "permissive": true,
          "roles": [
            "authenticated"
          ],
          "usingExpression": null,
          "checkExpression": "public.customer_has_access(customer_id, tenant_id)"
        },
        {
          "schema": "public",
          "table": "objects",
          "name": "objects_customer_users_select",
          "command": "r",
          "permissive": true,
          "roles": [
            "authenticated"
          ],
          "usingExpression": "public.customer_has_access(customer_id, tenant_id)",
          "checkExpression": null
        },
        {
          "schema": "public",
          "table": "objects",
          "name": "objects_customer_users_update",
          "command": "w",
          "permissive": true,
          "roles": [
            "authenticated"
          ],
          "usingExpression": "public.customer_has_access(customer_id, tenant_id)",
          "checkExpression": "public.customer_has_access(customer_id, tenant_id)"
        },
        {
          "schema": "public",
          "table": "objects",
          "name": "objects_management",
          "command": "*",
          "permissive": true,
          "roles": [
            "authenticated"
          ],
          "usingExpression": "public.is_management_for_tenant(tenant_id)",
          "checkExpression": "public.is_management_for_tenant(tenant_id)"
        },
        {
          "schema": "public",
          "table": "objects",
          "name": "personnel_select_assigned_objects",
          "command": "r",
          "permissive": true,
          "roles": [
            "authenticated"
          ],
          "usingExpression": "(EXISTS ( SELECT 1\n   FROM public.assignments a\n  WHERE ((a.object_id = objects.id) AND public.personnel_assigned_to_assignment(a.id))))",
          "checkExpression": null
        },
        {
          "schema": "public",
          "table": "payments",
          "name": "fieldgrid_runtime_data_insert",
          "command": "a",
          "permissive": true,
          "roles": [
            "fieldgrid_runtime_data"
          ],
          "usingExpression": null,
          "checkExpression": "true"
        },
        {
          "schema": "public",
          "table": "payments",
          "name": "fieldgrid_runtime_data_select",
          "command": "r",
          "permissive": true,
          "roles": [
            "fieldgrid_runtime_data"
          ],
          "usingExpression": "true",
          "checkExpression": null
        },
        {
          "schema": "public",
          "table": "payments",
          "name": "fieldgrid_runtime_data_update",
          "command": "w",
          "permissive": true,
          "roles": [
            "fieldgrid_runtime_data"
          ],
          "usingExpression": "true",
          "checkExpression": "true"
        },
        {
          "schema": "public",
          "table": "payments",
          "name": "owner_or_staff_read_payments",
          "command": "r",
          "permissive": true,
          "roles": [
            "authenticated"
          ],
          "usingExpression": "(EXISTS ( SELECT 1\n   FROM public.invoices i\n  WHERE ((i.id = payments.invoice_id) AND (i.tenant_id = payments.tenant_id) AND ((i.created_by = auth.uid()) OR public.is_management_for_tenant(i.tenant_id)))))",
          "checkExpression": null
        },
        {
          "schema": "public",
          "table": "personnel",
          "name": "fieldgrid_runtime_data_delete",
          "command": "d",
          "permissive": true,
          "roles": [
            "fieldgrid_runtime_data"
          ],
          "usingExpression": "true",
          "checkExpression": null
        },
        {
          "schema": "public",
          "table": "personnel",
          "name": "fieldgrid_runtime_data_insert",
          "command": "a",
          "permissive": true,
          "roles": [
            "fieldgrid_runtime_data"
          ],
          "usingExpression": null,
          "checkExpression": "true"
        },
        {
          "schema": "public",
          "table": "personnel",
          "name": "fieldgrid_runtime_data_select",
          "command": "r",
          "permissive": true,
          "roles": [
            "fieldgrid_runtime_data"
          ],
          "usingExpression": "true",
          "checkExpression": null
        },
        {
          "schema": "public",
          "table": "personnel",
          "name": "fieldgrid_runtime_data_update",
          "command": "w",
          "permissive": true,
          "roles": [
            "fieldgrid_runtime_data"
          ],
          "usingExpression": "true",
          "checkExpression": "true"
        },
        {
          "schema": "public",
          "table": "personnel",
          "name": "personnel_management",
          "command": "*",
          "permissive": true,
          "roles": [
            "authenticated"
          ],
          "usingExpression": "public.is_management_for_tenant(tenant_id)",
          "checkExpression": "public.is_management_for_tenant(tenant_id)"
        },
        {
          "schema": "public",
          "table": "personnel",
          "name": "personnel_select_own",
          "command": "r",
          "permissive": true,
          "roles": [
            "authenticated"
          ],
          "usingExpression": "(user_id = auth.uid())",
          "checkExpression": null
        }
      ],
      "helpers": [
        {
          "schema": "public",
          "name": "customer_has_access",
          "argumentTypes": [
            "uuid",
            "uuid"
          ],
          "returnType": "bool",
          "body": "\n  SELECT EXISTS (\n    SELECT 1\n    FROM customer_users cu\n    WHERE cu.customer_id = p_customer_id\n      AND cu.tenant_id = p_tenant_id\n      AND cu.user_id = (SELECT auth.uid())\n      AND cu.status = 'active'\n  );\n",
          "language": "sql",
          "securityDefiner": false,
          "volatility": "s",
          "parallel": "u",
          "strict": false,
          "leakproof": false,
          "config": [
            "search_path=public, auth"
          ],
          "argNames": [
            "p_customer_id",
            "p_tenant_id"
          ],
          "defaultCount": 0,
          "ownerRelation": {
            "schema": "public",
            "table": "object_contacts"
          },
          "directAcl": [
            {
              "grantee": "$owner",
              "grantor": "$owner",
              "privilege": "EXECUTE",
              "grantable": false
            },
            {
              "grantee": "authenticated",
              "grantor": "$owner",
              "privilege": "EXECUTE",
              "grantable": false
            }
          ],
          "effectiveExecute": [
            {
              "role": "$owner",
              "allowed": true
            },
            {
              "role": "PUBLIC",
              "allowed": false
            },
            {
              "role": "anon",
              "allowed": false
            },
            {
              "role": "authenticated",
              "allowed": true
            },
            {
              "role": "service_role",
              "allowed": false
            },
            {
              "role": "fieldgrid_runtime_data",
              "allowed": false
            },
            {
              "role": "fieldgrid_runtime_app",
              "allowed": false
            }
          ]
        },
        {
          "schema": "public",
          "name": "personnel_assigned_to_assignment",
          "argumentTypes": [
            "uuid"
          ],
          "returnType": "bool",
          "body": "\n  SELECT\n    (SELECT auth.uid()) IS NOT NULL\n    AND EXISTS (\n      SELECT 1\n      FROM public.assignment_personnel ap\n      JOIN public.assignments a\n        ON a.id = ap.assignment_id\n      JOIN public.personnel p\n        ON p.id = ap.personnel_id\n      WHERE ap.assignment_id = p_assignment_id\n        AND ap.status = 'assigned'\n        AND p.user_id = (SELECT auth.uid())\n        AND p.is_active = true\n        AND p.tenant_id IS NOT NULL\n        AND a.tenant_id IS NOT NULL\n        AND p.tenant_id = a.tenant_id\n    );\n",
          "language": "sql",
          "securityDefiner": true,
          "volatility": "s",
          "parallel": "u",
          "strict": false,
          "leakproof": false,
          "config": [
            "search_path=pg_catalog, public, auth"
          ],
          "argNames": [
            "p_assignment_id"
          ],
          "defaultCount": 0,
          "ownerRelation": {
            "schema": "public",
            "table": "object_contacts"
          },
          "directAcl": [
            {
              "grantee": "$owner",
              "grantor": "$owner",
              "privilege": "EXECUTE",
              "grantable": false
            },
            {
              "grantee": "authenticated",
              "grantor": "$owner",
              "privilege": "EXECUTE",
              "grantable": false
            }
          ],
          "effectiveExecute": [
            {
              "role": "$owner",
              "allowed": true
            },
            {
              "role": "PUBLIC",
              "allowed": false
            },
            {
              "role": "anon",
              "allowed": false
            },
            {
              "role": "authenticated",
              "allowed": true
            },
            {
              "role": "service_role",
              "allowed": false
            },
            {
              "role": "fieldgrid_runtime_data",
              "allowed": false
            },
            {
              "role": "fieldgrid_runtime_app",
              "allowed": false
            }
          ]
        },
        {
          "schema": "public",
          "name": "fieldgrid_has_platform_permission",
          "argumentTypes": [
            "text"
          ],
          "returnType": "bool",
          "body": "\n  SELECT EXISTS (\n    SELECT 1 FROM public.platform_users pu\n    WHERE pu.user_id = auth.uid() AND pu.status = 'active'\n      AND (\n        pu.role = 'owner'\n        OR (pu.role = 'admin' AND p_permission = ANY (ARRAY[\n          'global.rbac.manage', 'global.reference.manage', 'global.content.manage',\n          'platform.tenants.read', 'platform.audit.read'\n        ]))\n      )\n  );\n",
          "language": "sql",
          "securityDefiner": true,
          "volatility": "s",
          "parallel": "u",
          "strict": false,
          "leakproof": false,
          "config": [
            "search_path=pg_catalog, public, pg_temp"
          ],
          "argNames": [
            "p_permission"
          ],
          "defaultCount": 0,
          "ownerRelation": {
            "schema": "public",
            "table": "object_contacts"
          },
          "directAcl": [
            {
              "grantee": "$owner",
              "grantor": "$owner",
              "privilege": "EXECUTE",
              "grantable": false
            },
            {
              "grantee": "authenticated",
              "grantor": "$owner",
              "privilege": "EXECUTE",
              "grantable": false
            }
          ],
          "effectiveExecute": [
            {
              "role": "$owner",
              "allowed": true
            },
            {
              "role": "PUBLIC",
              "allowed": false
            },
            {
              "role": "anon",
              "allowed": false
            },
            {
              "role": "authenticated",
              "allowed": true
            },
            {
              "role": "service_role",
              "allowed": false
            },
            {
              "role": "fieldgrid_runtime_data",
              "allowed": false
            },
            {
              "role": "fieldgrid_runtime_app",
              "allowed": false
            }
          ]
        },
        {
          "schema": "auth",
          "name": "uid",
          "argumentTypes": [],
          "returnType": "uuid",
          "body": "\n  select \n  coalesce(\n    nullif(current_setting('request.jwt.claim.sub', true), ''),\n    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')\n  )::uuid\n",
          "language": "sql",
          "securityDefiner": false,
          "volatility": "s",
          "parallel": "u",
          "strict": false,
          "leakproof": false,
          "config": null,
          "argNames": null,
          "defaultCount": 0,
          "ownerRelation": {
            "schema": "auth",
            "table": "users"
          },
          "directAcl": [
            {
              "grantee": "$owner",
              "grantor": "$owner",
              "privilege": "EXECUTE",
              "grantable": false
            },
            {
              "grantee": "PUBLIC",
              "grantor": "$owner",
              "privilege": "EXECUTE",
              "grantable": false
            },
            {
              "grantee": "postgres",
              "grantor": "$owner",
              "privilege": "EXECUTE",
              "grantable": false
            },
            {
              "grantee": "dashboard_user",
              "grantor": "$owner",
              "privilege": "EXECUTE",
              "grantable": false
            }
          ],
          "effectiveExecute": [
            {
              "role": "$owner",
              "allowed": true
            },
            {
              "role": "PUBLIC",
              "allowed": true
            },
            {
              "role": "anon",
              "allowed": true
            },
            {
              "role": "authenticated",
              "allowed": true
            },
            {
              "role": "service_role",
              "allowed": true
            },
            {
              "role": "fieldgrid_runtime_data",
              "allowed": true
            },
            {
              "role": "fieldgrid_runtime_app",
              "allowed": true
            }
          ]
        }
      ]
    }
  },
  {
    "state": "legacy",
    "profile": "localShim",
    "manifest": {
      "version": 1,
      "postgresMajor": 17,
      "sources": [
        {
          "path": "lib/db/migrations/002_sprint1_rls.sql",
          "sha256": "16a27aa61943516314b9800d7b37a08eeb9c64441a5994c7da3f9badf7265238"
        },
        {
          "path": "lib/db/migrations/025_platform_schema_extensions.sql",
          "sha256": "8a57d65ba11e3122f897498093d1351f0cf57a2f1940850e266bbfc54c0b3636"
        },
        {
          "path": "lib/db/migrations/037_tenant_customer_users_events_hardening.sql",
          "sha256": "03a1ad0cbf406140c64b53da422abb62a45a6e0e9fb68832a8328ca6685d0b0e"
        },
        {
          "path": "lib/db/migrations/051_final_security_boundaries.sql",
          "sha256": "64f12a61bbd19cfbf4ec854c31560717bef4219433b03c09055f3f6f070181ff"
        },
        {
          "path": "lib/db/migrations/062_finance_reports_tenant_scope.sql",
          "sha256": "0ff1e8fcc5e0a3c7674ed084e6058e1a538ca0fed13e02f469fb0d363e055fbe"
        },
        {
          "path": "lib/db/migrations/063_payments_batches_audit_tenant_scope.sql",
          "sha256": "171caa7e6a8d4a8f624e475dc234d21b6c81e1e38802ddad3db778047f2053d2"
        },
        {
          "path": "lib/db/migrations/20260710200000_invoice_canon_credit_collection_payments.sql",
          "sha256": "78fc35f49a80a69ad7a7fe0dfc23c264dff2aba0fbfc49f702b3a7a74d1bc23f"
        },
        {
          "path": "lib/db/migrations/20260714120000_assignment_personnel_phase_b_direct_access_close.sql",
          "sha256": "7be5f0c1999d6eaadb22735d2243322d8aada1e64e3c4c44c4a3bc11d8317574"
        },
        {
          "path": "lib/db/migrations/20260718190000_phase2_security_reconciliation.sql",
          "sha256": "6cf0da37eec7c1b5b57c8218593873fedf1fae2a832b27e138dfd2614b861964"
        },
        {
          "path": "lib/db/migrations/20260909120000_runtime_least_privilege_principals.sql",
          "sha256": "2eaf25923d7908c94d1fb96c7fbede14858330d86be21656f50d611fe37e0066"
        },
        {
          "path": "migrations/013_sprint5_payments.sql",
          "sha256": "ea6d0e71764e92d0a0f0ad2d09a6bdf6c864c2a64d1ef717743b567d15198102"
        },
        {
          "path": "migrations/023_objects_extended.sql",
          "sha256": "19e20f3463f220a123450cefec79dc7490d5074c72f1a3f726ddfd1a28dde6ae"
        },
        {
          "path": "scripts/fieldgrid-runtime-safety-setup.mjs",
          "sha256": "f43d159c3e047bd752642e8005793df40314873a772c16c95eca7195f5c34666"
        },
        {
          "path": "tests/fixtures/fieldgrid-supabase-auth-functions.sql",
          "sha256": "5b72022d73e64a8e474d2122ac42f299bb7ce4d59755cdcc78e72abfe5d47dc0"
        }
      ],
      "relations": [
        {
          "schema": "public",
          "table": "invoices",
          "kind": "r",
          "rowSecurity": true,
          "forceRowSecurity": false,
          "columns": [
            {
              "name": "created_by",
              "notNull": false,
              "typeName": "uuid",
              "typeModifier": -1
            },
            {
              "name": "id",
              "notNull": true,
              "typeName": "uuid",
              "typeModifier": -1
            },
            {
              "name": "tenant_id",
              "notNull": true,
              "typeName": "uuid",
              "typeModifier": -1
            }
          ]
        },
        {
          "schema": "public",
          "table": "object_contacts",
          "kind": "r",
          "rowSecurity": true,
          "forceRowSecurity": false,
          "columns": [
            {
              "name": "id",
              "notNull": true,
              "typeName": "uuid",
              "typeModifier": -1
            },
            {
              "name": "object_id",
              "notNull": true,
              "typeName": "uuid",
              "typeModifier": -1
            }
          ]
        },
        {
          "schema": "public",
          "table": "object_personnel",
          "kind": "r",
          "rowSecurity": true,
          "forceRowSecurity": false,
          "columns": [
            {
              "name": "object_id",
              "notNull": true,
              "typeName": "uuid",
              "typeModifier": -1
            },
            {
              "name": "personnel_id",
              "notNull": true,
              "typeName": "uuid",
              "typeModifier": -1
            }
          ]
        },
        {
          "schema": "public",
          "table": "objects",
          "kind": "r",
          "rowSecurity": true,
          "forceRowSecurity": false,
          "columns": [
            {
              "name": "id",
              "notNull": true,
              "typeName": "uuid",
              "typeModifier": -1
            },
            {
              "name": "tenant_id",
              "notNull": true,
              "typeName": "uuid",
              "typeModifier": -1
            }
          ]
        },
        {
          "schema": "public",
          "table": "payments",
          "kind": "r",
          "rowSecurity": true,
          "forceRowSecurity": false,
          "columns": [
            {
              "name": "id",
              "notNull": true,
              "typeName": "uuid",
              "typeModifier": -1
            },
            {
              "name": "invoice_id",
              "notNull": false,
              "typeName": "uuid",
              "typeModifier": -1
            },
            {
              "name": "tenant_id",
              "notNull": true,
              "typeName": "uuid",
              "typeModifier": -1
            }
          ]
        },
        {
          "schema": "public",
          "table": "personnel",
          "kind": "r",
          "rowSecurity": true,
          "forceRowSecurity": false,
          "columns": [
            {
              "name": "id",
              "notNull": true,
              "typeName": "uuid",
              "typeModifier": -1
            },
            {
              "name": "tenant_id",
              "notNull": true,
              "typeName": "uuid",
              "typeModifier": -1
            }
          ]
        }
      ],
      "policies": [
        {
          "schema": "public",
          "table": "invoices",
          "name": "fieldgrid_runtime_data_insert",
          "command": "a",
          "permissive": true,
          "roles": [
            "fieldgrid_runtime_data"
          ],
          "usingExpression": null,
          "checkExpression": "true"
        },
        {
          "schema": "public",
          "table": "invoices",
          "name": "fieldgrid_runtime_data_select",
          "command": "r",
          "permissive": true,
          "roles": [
            "fieldgrid_runtime_data"
          ],
          "usingExpression": "true",
          "checkExpression": null
        },
        {
          "schema": "public",
          "table": "invoices",
          "name": "fieldgrid_runtime_data_update",
          "command": "w",
          "permissive": true,
          "roles": [
            "fieldgrid_runtime_data"
          ],
          "usingExpression": "true",
          "checkExpression": "true"
        },
        {
          "schema": "public",
          "table": "invoices",
          "name": "invoices_customer_sent_select",
          "command": "r",
          "permissive": true,
          "roles": [
            "authenticated"
          ],
          "usingExpression": "(((status)::text = ANY ((ARRAY['sent'::character varying, 'paid'::character varying, 'cancelled'::character varying])::text[])) AND (EXISTS ( SELECT 1\n   FROM public.customers c\n  WHERE ((c.id = invoices.customer_id) AND public.customer_has_access(c.id, c.tenant_id)))))",
          "checkExpression": null
        },
        {
          "schema": "public",
          "table": "invoices",
          "name": "invoices_management_all",
          "command": "*",
          "permissive": true,
          "roles": [
            "authenticated"
          ],
          "usingExpression": "public.is_management_for_tenant(tenant_id)",
          "checkExpression": "public.is_management_for_tenant(tenant_id)"
        },
        {
          "schema": "public",
          "table": "object_contacts",
          "name": "fieldgrid_runtime_data_delete",
          "command": "d",
          "permissive": true,
          "roles": [
            "fieldgrid_runtime_data"
          ],
          "usingExpression": "true",
          "checkExpression": null
        },
        {
          "schema": "public",
          "table": "object_contacts",
          "name": "fieldgrid_runtime_data_insert",
          "command": "a",
          "permissive": true,
          "roles": [
            "fieldgrid_runtime_data"
          ],
          "usingExpression": null,
          "checkExpression": "true"
        },
        {
          "schema": "public",
          "table": "object_contacts",
          "name": "fieldgrid_runtime_data_select",
          "command": "r",
          "permissive": true,
          "roles": [
            "fieldgrid_runtime_data"
          ],
          "usingExpression": "true",
          "checkExpression": null
        },
        {
          "schema": "public",
          "table": "object_contacts",
          "name": "fieldgrid_runtime_data_update",
          "command": "w",
          "permissive": true,
          "roles": [
            "fieldgrid_runtime_data"
          ],
          "usingExpression": "true",
          "checkExpression": "true"
        },
        {
          "schema": "public",
          "table": "object_contacts",
          "name": "object_contacts_customer_users_delete",
          "command": "d",
          "permissive": true,
          "roles": [
            "authenticated"
          ],
          "usingExpression": "(EXISTS ( SELECT 1\n   FROM public.objects o\n  WHERE ((o.id = object_contacts.object_id) AND public.customer_has_access(o.customer_id, o.tenant_id))))",
          "checkExpression": null
        },
        {
          "schema": "public",
          "table": "object_contacts",
          "name": "object_contacts_customer_users_insert",
          "command": "a",
          "permissive": true,
          "roles": [
            "authenticated"
          ],
          "usingExpression": null,
          "checkExpression": "(EXISTS ( SELECT 1\n   FROM public.objects o\n  WHERE ((o.id = object_contacts.object_id) AND public.customer_has_access(o.customer_id, o.tenant_id))))"
        },
        {
          "schema": "public",
          "table": "object_contacts",
          "name": "object_contacts_customer_users_select",
          "command": "r",
          "permissive": true,
          "roles": [
            "authenticated"
          ],
          "usingExpression": "(EXISTS ( SELECT 1\n   FROM public.objects o\n  WHERE ((o.id = object_contacts.object_id) AND public.customer_has_access(o.customer_id, o.tenant_id))))",
          "checkExpression": null
        },
        {
          "schema": "public",
          "table": "object_contacts",
          "name": "object_contacts_customer_users_update",
          "command": "w",
          "permissive": true,
          "roles": [
            "authenticated"
          ],
          "usingExpression": "(EXISTS ( SELECT 1\n   FROM public.objects o\n  WHERE ((o.id = object_contacts.object_id) AND public.customer_has_access(o.customer_id, o.tenant_id))))",
          "checkExpression": "(EXISTS ( SELECT 1\n   FROM public.objects o\n  WHERE ((o.id = object_contacts.object_id) AND public.customer_has_access(o.customer_id, o.tenant_id))))"
        },
        {
          "schema": "public",
          "table": "object_contacts",
          "name": "object_contacts_management",
          "command": "*",
          "permissive": true,
          "roles": [
            "authenticated"
          ],
          "usingExpression": "(EXISTS ( SELECT 1\n   FROM public.objects o\n  WHERE ((o.id = object_contacts.object_id) AND public.is_management_for_tenant(o.tenant_id))))",
          "checkExpression": "(EXISTS ( SELECT 1\n   FROM public.objects o\n  WHERE ((o.id = object_contacts.object_id) AND public.is_management_for_tenant(o.tenant_id))))"
        },
        {
          "schema": "public",
          "table": "object_contacts",
          "name": "object_contacts_management_all",
          "command": "*",
          "permissive": true,
          "roles": [
            "PUBLIC"
          ],
          "usingExpression": "(EXISTS ( SELECT 1\n   FROM (public.user_roles ur\n     JOIN public.roles r ON ((r.id = ur.role_id)))\n  WHERE ((ur.user_id = auth.uid()) AND ((r.name)::text = ANY ((ARRAY['Management'::character varying, 'Administration'::character varying, 'Planning'::character varying, 'Support'::character varying])::text[])))))",
          "checkExpression": null
        },
        {
          "schema": "public",
          "table": "object_personnel",
          "name": "fieldgrid_runtime_data_delete",
          "command": "d",
          "permissive": true,
          "roles": [
            "fieldgrid_runtime_data"
          ],
          "usingExpression": "true",
          "checkExpression": null
        },
        {
          "schema": "public",
          "table": "object_personnel",
          "name": "fieldgrid_runtime_data_insert",
          "command": "a",
          "permissive": true,
          "roles": [
            "fieldgrid_runtime_data"
          ],
          "usingExpression": null,
          "checkExpression": "true"
        },
        {
          "schema": "public",
          "table": "object_personnel",
          "name": "fieldgrid_runtime_data_select",
          "command": "r",
          "permissive": true,
          "roles": [
            "fieldgrid_runtime_data"
          ],
          "usingExpression": "true",
          "checkExpression": null
        },
        {
          "schema": "public",
          "table": "object_personnel",
          "name": "object_personnel_management",
          "command": "*",
          "permissive": true,
          "roles": [
            "authenticated"
          ],
          "usingExpression": "(EXISTS ( SELECT 1\n   FROM public.objects o\n  WHERE ((o.id = object_personnel.object_id) AND public.is_management_for_tenant(o.tenant_id))))",
          "checkExpression": "(EXISTS ( SELECT 1\n   FROM public.objects o\n  WHERE ((o.id = object_personnel.object_id) AND public.is_management_for_tenant(o.tenant_id))))"
        },
        {
          "schema": "public",
          "table": "object_personnel",
          "name": "object_personnel_management_all",
          "command": "*",
          "permissive": true,
          "roles": [
            "PUBLIC"
          ],
          "usingExpression": "(EXISTS ( SELECT 1\n   FROM (public.user_roles ur\n     JOIN public.roles r ON ((r.id = ur.role_id)))\n  WHERE ((ur.user_id = auth.uid()) AND ((r.name)::text = ANY ((ARRAY['Management'::character varying, 'Administration'::character varying, 'Planning'::character varying, 'Support'::character varying])::text[])))))",
          "checkExpression": null
        },
        {
          "schema": "public",
          "table": "objects",
          "name": "fieldgrid_runtime_data_delete",
          "command": "d",
          "permissive": true,
          "roles": [
            "fieldgrid_runtime_data"
          ],
          "usingExpression": "true",
          "checkExpression": null
        },
        {
          "schema": "public",
          "table": "objects",
          "name": "fieldgrid_runtime_data_insert",
          "command": "a",
          "permissive": true,
          "roles": [
            "fieldgrid_runtime_data"
          ],
          "usingExpression": null,
          "checkExpression": "true"
        },
        {
          "schema": "public",
          "table": "objects",
          "name": "fieldgrid_runtime_data_select",
          "command": "r",
          "permissive": true,
          "roles": [
            "fieldgrid_runtime_data"
          ],
          "usingExpression": "true",
          "checkExpression": null
        },
        {
          "schema": "public",
          "table": "objects",
          "name": "fieldgrid_runtime_data_update",
          "command": "w",
          "permissive": true,
          "roles": [
            "fieldgrid_runtime_data"
          ],
          "usingExpression": "true",
          "checkExpression": "true"
        },
        {
          "schema": "public",
          "table": "objects",
          "name": "objects_customer_users_insert",
          "command": "a",
          "permissive": true,
          "roles": [
            "authenticated"
          ],
          "usingExpression": null,
          "checkExpression": "public.customer_has_access(customer_id, tenant_id)"
        },
        {
          "schema": "public",
          "table": "objects",
          "name": "objects_customer_users_select",
          "command": "r",
          "permissive": true,
          "roles": [
            "authenticated"
          ],
          "usingExpression": "public.customer_has_access(customer_id, tenant_id)",
          "checkExpression": null
        },
        {
          "schema": "public",
          "table": "objects",
          "name": "objects_customer_users_update",
          "command": "w",
          "permissive": true,
          "roles": [
            "authenticated"
          ],
          "usingExpression": "public.customer_has_access(customer_id, tenant_id)",
          "checkExpression": "public.customer_has_access(customer_id, tenant_id)"
        },
        {
          "schema": "public",
          "table": "objects",
          "name": "objects_management",
          "command": "*",
          "permissive": true,
          "roles": [
            "authenticated"
          ],
          "usingExpression": "public.is_management_for_tenant(tenant_id)",
          "checkExpression": "public.is_management_for_tenant(tenant_id)"
        },
        {
          "schema": "public",
          "table": "objects",
          "name": "personnel_select_assigned_objects",
          "command": "r",
          "permissive": true,
          "roles": [
            "authenticated"
          ],
          "usingExpression": "(EXISTS ( SELECT 1\n   FROM public.assignments a\n  WHERE ((a.object_id = objects.id) AND public.personnel_assigned_to_assignment(a.id))))",
          "checkExpression": null
        },
        {
          "schema": "public",
          "table": "payments",
          "name": "fieldgrid_runtime_data_insert",
          "command": "a",
          "permissive": true,
          "roles": [
            "fieldgrid_runtime_data"
          ],
          "usingExpression": null,
          "checkExpression": "true"
        },
        {
          "schema": "public",
          "table": "payments",
          "name": "fieldgrid_runtime_data_select",
          "command": "r",
          "permissive": true,
          "roles": [
            "fieldgrid_runtime_data"
          ],
          "usingExpression": "true",
          "checkExpression": null
        },
        {
          "schema": "public",
          "table": "payments",
          "name": "fieldgrid_runtime_data_update",
          "command": "w",
          "permissive": true,
          "roles": [
            "fieldgrid_runtime_data"
          ],
          "usingExpression": "true",
          "checkExpression": "true"
        },
        {
          "schema": "public",
          "table": "payments",
          "name": "owner_or_staff_read_payments",
          "command": "r",
          "permissive": true,
          "roles": [
            "PUBLIC"
          ],
          "usingExpression": "(EXISTS ( SELECT 1\n   FROM public.invoices\n  WHERE ((invoices.id = payments.invoice_id) AND ((invoices.created_by = auth.uid()) OR (EXISTS ( SELECT 1\n           FROM (public.user_roles ur\n             JOIN public.roles r ON ((r.id = ur.role_id)))\n          WHERE ((ur.user_id = auth.uid()) AND ((r.name)::text = ANY ((ARRAY['management'::character varying, 'administration'::character varying, 'planning'::character varying, 'support'::character varying])::text[])))))))))",
          "checkExpression": null
        },
        {
          "schema": "public",
          "table": "payments",
          "name": "service_role_all_payments",
          "command": "*",
          "permissive": true,
          "roles": [
            "PUBLIC"
          ],
          "usingExpression": "(auth.role() = 'service_role'::text)",
          "checkExpression": "(auth.role() = 'service_role'::text)"
        },
        {
          "schema": "public",
          "table": "personnel",
          "name": "fieldgrid_runtime_data_delete",
          "command": "d",
          "permissive": true,
          "roles": [
            "fieldgrid_runtime_data"
          ],
          "usingExpression": "true",
          "checkExpression": null
        },
        {
          "schema": "public",
          "table": "personnel",
          "name": "fieldgrid_runtime_data_insert",
          "command": "a",
          "permissive": true,
          "roles": [
            "fieldgrid_runtime_data"
          ],
          "usingExpression": null,
          "checkExpression": "true"
        },
        {
          "schema": "public",
          "table": "personnel",
          "name": "fieldgrid_runtime_data_select",
          "command": "r",
          "permissive": true,
          "roles": [
            "fieldgrid_runtime_data"
          ],
          "usingExpression": "true",
          "checkExpression": null
        },
        {
          "schema": "public",
          "table": "personnel",
          "name": "fieldgrid_runtime_data_update",
          "command": "w",
          "permissive": true,
          "roles": [
            "fieldgrid_runtime_data"
          ],
          "usingExpression": "true",
          "checkExpression": "true"
        },
        {
          "schema": "public",
          "table": "personnel",
          "name": "personnel_management",
          "command": "*",
          "permissive": true,
          "roles": [
            "authenticated"
          ],
          "usingExpression": "public.is_management_for_tenant(tenant_id)",
          "checkExpression": "public.is_management_for_tenant(tenant_id)"
        },
        {
          "schema": "public",
          "table": "personnel",
          "name": "personnel_select_own",
          "command": "r",
          "permissive": true,
          "roles": [
            "authenticated"
          ],
          "usingExpression": "(user_id = auth.uid())",
          "checkExpression": null
        }
      ],
      "helpers": [
        {
          "schema": "public",
          "name": "customer_has_access",
          "argumentTypes": [
            "uuid",
            "uuid"
          ],
          "returnType": "bool",
          "body": "\n  SELECT EXISTS (\n    SELECT 1\n    FROM customer_users cu\n    WHERE cu.customer_id = p_customer_id\n      AND cu.tenant_id = p_tenant_id\n      AND cu.user_id = (SELECT auth.uid())\n      AND cu.status = 'active'\n  );\n",
          "language": "sql",
          "securityDefiner": false,
          "volatility": "s",
          "parallel": "u",
          "strict": false,
          "leakproof": false,
          "config": [
            "search_path=public, auth"
          ],
          "argNames": [
            "p_customer_id",
            "p_tenant_id"
          ],
          "defaultCount": 0,
          "ownerRelation": {
            "schema": "public",
            "table": "object_contacts"
          },
          "directAcl": [
            {
              "grantee": "$owner",
              "grantor": "$owner",
              "privilege": "EXECUTE",
              "grantable": false
            },
            {
              "grantee": "authenticated",
              "grantor": "$owner",
              "privilege": "EXECUTE",
              "grantable": false
            }
          ],
          "effectiveExecute": [
            {
              "role": "$owner",
              "allowed": true
            },
            {
              "role": "PUBLIC",
              "allowed": false
            },
            {
              "role": "anon",
              "allowed": false
            },
            {
              "role": "authenticated",
              "allowed": true
            },
            {
              "role": "service_role",
              "allowed": false
            },
            {
              "role": "fieldgrid_runtime_data",
              "allowed": false
            },
            {
              "role": "fieldgrid_runtime_app",
              "allowed": false
            }
          ]
        },
        {
          "schema": "public",
          "name": "personnel_assigned_to_assignment",
          "argumentTypes": [
            "uuid"
          ],
          "returnType": "bool",
          "body": "\n  SELECT\n    (SELECT auth.uid()) IS NOT NULL\n    AND EXISTS (\n      SELECT 1\n      FROM public.assignment_personnel ap\n      JOIN public.assignments a\n        ON a.id = ap.assignment_id\n      JOIN public.personnel p\n        ON p.id = ap.personnel_id\n      WHERE ap.assignment_id = p_assignment_id\n        AND ap.status = 'assigned'\n        AND p.user_id = (SELECT auth.uid())\n        AND p.is_active = true\n        AND p.tenant_id IS NOT NULL\n        AND a.tenant_id IS NOT NULL\n        AND p.tenant_id = a.tenant_id\n    );\n",
          "language": "sql",
          "securityDefiner": true,
          "volatility": "s",
          "parallel": "u",
          "strict": false,
          "leakproof": false,
          "config": [
            "search_path=pg_catalog, public, auth"
          ],
          "argNames": [
            "p_assignment_id"
          ],
          "defaultCount": 0,
          "ownerRelation": {
            "schema": "public",
            "table": "object_contacts"
          },
          "directAcl": [
            {
              "grantee": "$owner",
              "grantor": "$owner",
              "privilege": "EXECUTE",
              "grantable": false
            },
            {
              "grantee": "authenticated",
              "grantor": "$owner",
              "privilege": "EXECUTE",
              "grantable": false
            }
          ],
          "effectiveExecute": [
            {
              "role": "$owner",
              "allowed": true
            },
            {
              "role": "PUBLIC",
              "allowed": false
            },
            {
              "role": "anon",
              "allowed": false
            },
            {
              "role": "authenticated",
              "allowed": true
            },
            {
              "role": "service_role",
              "allowed": false
            },
            {
              "role": "fieldgrid_runtime_data",
              "allowed": false
            },
            {
              "role": "fieldgrid_runtime_app",
              "allowed": false
            }
          ]
        },
        {
          "schema": "public",
          "name": "fieldgrid_has_platform_permission",
          "argumentTypes": [
            "text"
          ],
          "returnType": "bool",
          "body": "\n  SELECT EXISTS (\n    SELECT 1 FROM public.platform_users pu\n    WHERE pu.user_id = auth.uid() AND pu.status = 'active'\n      AND (\n        pu.role = 'owner'\n        OR (pu.role = 'admin' AND p_permission = ANY (ARRAY[\n          'global.rbac.manage', 'global.reference.manage', 'global.content.manage',\n          'platform.tenants.read', 'platform.audit.read'\n        ]))\n      )\n  );\n",
          "language": "sql",
          "securityDefiner": true,
          "volatility": "s",
          "parallel": "u",
          "strict": false,
          "leakproof": false,
          "config": [
            "search_path=pg_catalog, public, pg_temp"
          ],
          "argNames": [
            "p_permission"
          ],
          "defaultCount": 0,
          "ownerRelation": {
            "schema": "public",
            "table": "object_contacts"
          },
          "directAcl": [
            {
              "grantee": "$owner",
              "grantor": "$owner",
              "privilege": "EXECUTE",
              "grantable": false
            },
            {
              "grantee": "authenticated",
              "grantor": "$owner",
              "privilege": "EXECUTE",
              "grantable": false
            }
          ],
          "effectiveExecute": [
            {
              "role": "$owner",
              "allowed": true
            },
            {
              "role": "PUBLIC",
              "allowed": false
            },
            {
              "role": "anon",
              "allowed": false
            },
            {
              "role": "authenticated",
              "allowed": true
            },
            {
              "role": "service_role",
              "allowed": false
            },
            {
              "role": "fieldgrid_runtime_data",
              "allowed": false
            },
            {
              "role": "fieldgrid_runtime_app",
              "allowed": false
            }
          ]
        },
        {
          "schema": "auth",
          "name": "uid",
          "argumentTypes": [],
          "returnType": "uuid",
          "body": "\n      select nullif(\n        coalesce(\n          nullif(current_setting('request.jwt.claim.sub', true), ''),\n          nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'\n        ),\n        ''\n      )::uuid\n    ",
          "language": "sql",
          "securityDefiner": false,
          "volatility": "s",
          "parallel": "u",
          "strict": false,
          "leakproof": false,
          "config": null,
          "argNames": null,
          "defaultCount": 0,
          "ownerRelation": {
            "schema": "auth",
            "table": "users"
          },
          "directAcl": [
            {
              "grantee": "$owner",
              "grantor": "$owner",
              "privilege": "EXECUTE",
              "grantable": false
            },
            {
              "grantee": "PUBLIC",
              "grantor": "$owner",
              "privilege": "EXECUTE",
              "grantable": false
            }
          ],
          "effectiveExecute": [
            {
              "role": "$owner",
              "allowed": true
            },
            {
              "role": "PUBLIC",
              "allowed": true
            },
            {
              "role": "anon",
              "allowed": true
            },
            {
              "role": "authenticated",
              "allowed": true
            },
            {
              "role": "service_role",
              "allowed": true
            },
            {
              "role": "fieldgrid_runtime_data",
              "allowed": true
            },
            {
              "role": "fieldgrid_runtime_app",
              "allowed": true
            }
          ]
        },
        {
          "schema": "auth",
          "name": "role",
          "argumentTypes": [],
          "returnType": "text",
          "body": "\n  select \n  coalesce(\n    nullif(current_setting('request.jwt.claim.role', true), ''),\n    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')\n  )::text\n",
          "language": "sql",
          "securityDefiner": false,
          "volatility": "s",
          "parallel": "u",
          "strict": false,
          "leakproof": false,
          "config": null,
          "argNames": null,
          "defaultCount": 0,
          "ownerRelation": {
            "schema": "auth",
            "table": "users"
          },
          "directAcl": [
            {
              "grantee": "$owner",
              "grantor": "$owner",
              "privilege": "EXECUTE",
              "grantable": false
            },
            {
              "grantee": "PUBLIC",
              "grantor": "$owner",
              "privilege": "EXECUTE",
              "grantable": false
            }
          ],
          "effectiveExecute": [
            {
              "role": "$owner",
              "allowed": true
            },
            {
              "role": "PUBLIC",
              "allowed": true
            },
            {
              "role": "anon",
              "allowed": true
            },
            {
              "role": "authenticated",
              "allowed": true
            },
            {
              "role": "service_role",
              "allowed": true
            },
            {
              "role": "fieldgrid_runtime_data",
              "allowed": true
            },
            {
              "role": "fieldgrid_runtime_app",
              "allowed": true
            }
          ]
        }
      ]
    }
  },
  {
    "state": "legacy",
    "profile": "providerSource",
    "manifest": {
      "version": 1,
      "postgresMajor": 17,
      "sources": [
        {
          "path": "lib/db/migrations/002_sprint1_rls.sql",
          "sha256": "16a27aa61943516314b9800d7b37a08eeb9c64441a5994c7da3f9badf7265238"
        },
        {
          "path": "lib/db/migrations/025_platform_schema_extensions.sql",
          "sha256": "8a57d65ba11e3122f897498093d1351f0cf57a2f1940850e266bbfc54c0b3636"
        },
        {
          "path": "lib/db/migrations/037_tenant_customer_users_events_hardening.sql",
          "sha256": "03a1ad0cbf406140c64b53da422abb62a45a6e0e9fb68832a8328ca6685d0b0e"
        },
        {
          "path": "lib/db/migrations/051_final_security_boundaries.sql",
          "sha256": "64f12a61bbd19cfbf4ec854c31560717bef4219433b03c09055f3f6f070181ff"
        },
        {
          "path": "lib/db/migrations/062_finance_reports_tenant_scope.sql",
          "sha256": "0ff1e8fcc5e0a3c7674ed084e6058e1a538ca0fed13e02f469fb0d363e055fbe"
        },
        {
          "path": "lib/db/migrations/063_payments_batches_audit_tenant_scope.sql",
          "sha256": "171caa7e6a8d4a8f624e475dc234d21b6c81e1e38802ddad3db778047f2053d2"
        },
        {
          "path": "lib/db/migrations/20260710200000_invoice_canon_credit_collection_payments.sql",
          "sha256": "78fc35f49a80a69ad7a7fe0dfc23c264dff2aba0fbfc49f702b3a7a74d1bc23f"
        },
        {
          "path": "lib/db/migrations/20260714120000_assignment_personnel_phase_b_direct_access_close.sql",
          "sha256": "7be5f0c1999d6eaadb22735d2243322d8aada1e64e3c4c44c4a3bc11d8317574"
        },
        {
          "path": "lib/db/migrations/20260718190000_phase2_security_reconciliation.sql",
          "sha256": "6cf0da37eec7c1b5b57c8218593873fedf1fae2a832b27e138dfd2614b861964"
        },
        {
          "path": "lib/db/migrations/20260909120000_runtime_least_privilege_principals.sql",
          "sha256": "2eaf25923d7908c94d1fb96c7fbede14858330d86be21656f50d611fe37e0066"
        },
        {
          "path": "migrations/013_sprint5_payments.sql",
          "sha256": "ea6d0e71764e92d0a0f0ad2d09a6bdf6c864c2a64d1ef717743b567d15198102"
        },
        {
          "path": "migrations/023_objects_extended.sql",
          "sha256": "19e20f3463f220a123450cefec79dc7490d5074c72f1a3f726ddfd1a28dde6ae"
        },
        {
          "path": "scripts/fieldgrid-runtime-safety-setup.mjs",
          "sha256": "f43d159c3e047bd752642e8005793df40314873a772c16c95eca7195f5c34666"
        },
        {
          "path": "tests/fixtures/fieldgrid-supabase-auth-functions.sql",
          "sha256": "5b72022d73e64a8e474d2122ac42f299bb7ce4d59755cdcc78e72abfe5d47dc0"
        }
      ],
      "relations": [
        {
          "schema": "public",
          "table": "invoices",
          "kind": "r",
          "rowSecurity": true,
          "forceRowSecurity": false,
          "columns": [
            {
              "name": "created_by",
              "notNull": false,
              "typeName": "uuid",
              "typeModifier": -1
            },
            {
              "name": "id",
              "notNull": true,
              "typeName": "uuid",
              "typeModifier": -1
            },
            {
              "name": "tenant_id",
              "notNull": true,
              "typeName": "uuid",
              "typeModifier": -1
            }
          ]
        },
        {
          "schema": "public",
          "table": "object_contacts",
          "kind": "r",
          "rowSecurity": true,
          "forceRowSecurity": false,
          "columns": [
            {
              "name": "id",
              "notNull": true,
              "typeName": "uuid",
              "typeModifier": -1
            },
            {
              "name": "object_id",
              "notNull": true,
              "typeName": "uuid",
              "typeModifier": -1
            }
          ]
        },
        {
          "schema": "public",
          "table": "object_personnel",
          "kind": "r",
          "rowSecurity": true,
          "forceRowSecurity": false,
          "columns": [
            {
              "name": "object_id",
              "notNull": true,
              "typeName": "uuid",
              "typeModifier": -1
            },
            {
              "name": "personnel_id",
              "notNull": true,
              "typeName": "uuid",
              "typeModifier": -1
            }
          ]
        },
        {
          "schema": "public",
          "table": "objects",
          "kind": "r",
          "rowSecurity": true,
          "forceRowSecurity": false,
          "columns": [
            {
              "name": "id",
              "notNull": true,
              "typeName": "uuid",
              "typeModifier": -1
            },
            {
              "name": "tenant_id",
              "notNull": true,
              "typeName": "uuid",
              "typeModifier": -1
            }
          ]
        },
        {
          "schema": "public",
          "table": "payments",
          "kind": "r",
          "rowSecurity": true,
          "forceRowSecurity": false,
          "columns": [
            {
              "name": "id",
              "notNull": true,
              "typeName": "uuid",
              "typeModifier": -1
            },
            {
              "name": "invoice_id",
              "notNull": false,
              "typeName": "uuid",
              "typeModifier": -1
            },
            {
              "name": "tenant_id",
              "notNull": true,
              "typeName": "uuid",
              "typeModifier": -1
            }
          ]
        },
        {
          "schema": "public",
          "table": "personnel",
          "kind": "r",
          "rowSecurity": true,
          "forceRowSecurity": false,
          "columns": [
            {
              "name": "id",
              "notNull": true,
              "typeName": "uuid",
              "typeModifier": -1
            },
            {
              "name": "tenant_id",
              "notNull": true,
              "typeName": "uuid",
              "typeModifier": -1
            }
          ]
        }
      ],
      "policies": [
        {
          "schema": "public",
          "table": "invoices",
          "name": "fieldgrid_runtime_data_insert",
          "command": "a",
          "permissive": true,
          "roles": [
            "fieldgrid_runtime_data"
          ],
          "usingExpression": null,
          "checkExpression": "true"
        },
        {
          "schema": "public",
          "table": "invoices",
          "name": "fieldgrid_runtime_data_select",
          "command": "r",
          "permissive": true,
          "roles": [
            "fieldgrid_runtime_data"
          ],
          "usingExpression": "true",
          "checkExpression": null
        },
        {
          "schema": "public",
          "table": "invoices",
          "name": "fieldgrid_runtime_data_update",
          "command": "w",
          "permissive": true,
          "roles": [
            "fieldgrid_runtime_data"
          ],
          "usingExpression": "true",
          "checkExpression": "true"
        },
        {
          "schema": "public",
          "table": "invoices",
          "name": "invoices_customer_sent_select",
          "command": "r",
          "permissive": true,
          "roles": [
            "authenticated"
          ],
          "usingExpression": "(((status)::text = ANY ((ARRAY['sent'::character varying, 'paid'::character varying, 'cancelled'::character varying])::text[])) AND (EXISTS ( SELECT 1\n   FROM public.customers c\n  WHERE ((c.id = invoices.customer_id) AND public.customer_has_access(c.id, c.tenant_id)))))",
          "checkExpression": null
        },
        {
          "schema": "public",
          "table": "invoices",
          "name": "invoices_management_all",
          "command": "*",
          "permissive": true,
          "roles": [
            "authenticated"
          ],
          "usingExpression": "public.is_management_for_tenant(tenant_id)",
          "checkExpression": "public.is_management_for_tenant(tenant_id)"
        },
        {
          "schema": "public",
          "table": "object_contacts",
          "name": "fieldgrid_runtime_data_delete",
          "command": "d",
          "permissive": true,
          "roles": [
            "fieldgrid_runtime_data"
          ],
          "usingExpression": "true",
          "checkExpression": null
        },
        {
          "schema": "public",
          "table": "object_contacts",
          "name": "fieldgrid_runtime_data_insert",
          "command": "a",
          "permissive": true,
          "roles": [
            "fieldgrid_runtime_data"
          ],
          "usingExpression": null,
          "checkExpression": "true"
        },
        {
          "schema": "public",
          "table": "object_contacts",
          "name": "fieldgrid_runtime_data_select",
          "command": "r",
          "permissive": true,
          "roles": [
            "fieldgrid_runtime_data"
          ],
          "usingExpression": "true",
          "checkExpression": null
        },
        {
          "schema": "public",
          "table": "object_contacts",
          "name": "fieldgrid_runtime_data_update",
          "command": "w",
          "permissive": true,
          "roles": [
            "fieldgrid_runtime_data"
          ],
          "usingExpression": "true",
          "checkExpression": "true"
        },
        {
          "schema": "public",
          "table": "object_contacts",
          "name": "object_contacts_customer_users_delete",
          "command": "d",
          "permissive": true,
          "roles": [
            "authenticated"
          ],
          "usingExpression": "(EXISTS ( SELECT 1\n   FROM public.objects o\n  WHERE ((o.id = object_contacts.object_id) AND public.customer_has_access(o.customer_id, o.tenant_id))))",
          "checkExpression": null
        },
        {
          "schema": "public",
          "table": "object_contacts",
          "name": "object_contacts_customer_users_insert",
          "command": "a",
          "permissive": true,
          "roles": [
            "authenticated"
          ],
          "usingExpression": null,
          "checkExpression": "(EXISTS ( SELECT 1\n   FROM public.objects o\n  WHERE ((o.id = object_contacts.object_id) AND public.customer_has_access(o.customer_id, o.tenant_id))))"
        },
        {
          "schema": "public",
          "table": "object_contacts",
          "name": "object_contacts_customer_users_select",
          "command": "r",
          "permissive": true,
          "roles": [
            "authenticated"
          ],
          "usingExpression": "(EXISTS ( SELECT 1\n   FROM public.objects o\n  WHERE ((o.id = object_contacts.object_id) AND public.customer_has_access(o.customer_id, o.tenant_id))))",
          "checkExpression": null
        },
        {
          "schema": "public",
          "table": "object_contacts",
          "name": "object_contacts_customer_users_update",
          "command": "w",
          "permissive": true,
          "roles": [
            "authenticated"
          ],
          "usingExpression": "(EXISTS ( SELECT 1\n   FROM public.objects o\n  WHERE ((o.id = object_contacts.object_id) AND public.customer_has_access(o.customer_id, o.tenant_id))))",
          "checkExpression": "(EXISTS ( SELECT 1\n   FROM public.objects o\n  WHERE ((o.id = object_contacts.object_id) AND public.customer_has_access(o.customer_id, o.tenant_id))))"
        },
        {
          "schema": "public",
          "table": "object_contacts",
          "name": "object_contacts_management",
          "command": "*",
          "permissive": true,
          "roles": [
            "authenticated"
          ],
          "usingExpression": "(EXISTS ( SELECT 1\n   FROM public.objects o\n  WHERE ((o.id = object_contacts.object_id) AND public.is_management_for_tenant(o.tenant_id))))",
          "checkExpression": "(EXISTS ( SELECT 1\n   FROM public.objects o\n  WHERE ((o.id = object_contacts.object_id) AND public.is_management_for_tenant(o.tenant_id))))"
        },
        {
          "schema": "public",
          "table": "object_contacts",
          "name": "object_contacts_management_all",
          "command": "*",
          "permissive": true,
          "roles": [
            "PUBLIC"
          ],
          "usingExpression": "(EXISTS ( SELECT 1\n   FROM (public.user_roles ur\n     JOIN public.roles r ON ((r.id = ur.role_id)))\n  WHERE ((ur.user_id = auth.uid()) AND ((r.name)::text = ANY ((ARRAY['Management'::character varying, 'Administration'::character varying, 'Planning'::character varying, 'Support'::character varying])::text[])))))",
          "checkExpression": null
        },
        {
          "schema": "public",
          "table": "object_personnel",
          "name": "fieldgrid_runtime_data_delete",
          "command": "d",
          "permissive": true,
          "roles": [
            "fieldgrid_runtime_data"
          ],
          "usingExpression": "true",
          "checkExpression": null
        },
        {
          "schema": "public",
          "table": "object_personnel",
          "name": "fieldgrid_runtime_data_insert",
          "command": "a",
          "permissive": true,
          "roles": [
            "fieldgrid_runtime_data"
          ],
          "usingExpression": null,
          "checkExpression": "true"
        },
        {
          "schema": "public",
          "table": "object_personnel",
          "name": "fieldgrid_runtime_data_select",
          "command": "r",
          "permissive": true,
          "roles": [
            "fieldgrid_runtime_data"
          ],
          "usingExpression": "true",
          "checkExpression": null
        },
        {
          "schema": "public",
          "table": "object_personnel",
          "name": "object_personnel_management",
          "command": "*",
          "permissive": true,
          "roles": [
            "authenticated"
          ],
          "usingExpression": "(EXISTS ( SELECT 1\n   FROM public.objects o\n  WHERE ((o.id = object_personnel.object_id) AND public.is_management_for_tenant(o.tenant_id))))",
          "checkExpression": "(EXISTS ( SELECT 1\n   FROM public.objects o\n  WHERE ((o.id = object_personnel.object_id) AND public.is_management_for_tenant(o.tenant_id))))"
        },
        {
          "schema": "public",
          "table": "object_personnel",
          "name": "object_personnel_management_all",
          "command": "*",
          "permissive": true,
          "roles": [
            "PUBLIC"
          ],
          "usingExpression": "(EXISTS ( SELECT 1\n   FROM (public.user_roles ur\n     JOIN public.roles r ON ((r.id = ur.role_id)))\n  WHERE ((ur.user_id = auth.uid()) AND ((r.name)::text = ANY ((ARRAY['Management'::character varying, 'Administration'::character varying, 'Planning'::character varying, 'Support'::character varying])::text[])))))",
          "checkExpression": null
        },
        {
          "schema": "public",
          "table": "objects",
          "name": "fieldgrid_runtime_data_delete",
          "command": "d",
          "permissive": true,
          "roles": [
            "fieldgrid_runtime_data"
          ],
          "usingExpression": "true",
          "checkExpression": null
        },
        {
          "schema": "public",
          "table": "objects",
          "name": "fieldgrid_runtime_data_insert",
          "command": "a",
          "permissive": true,
          "roles": [
            "fieldgrid_runtime_data"
          ],
          "usingExpression": null,
          "checkExpression": "true"
        },
        {
          "schema": "public",
          "table": "objects",
          "name": "fieldgrid_runtime_data_select",
          "command": "r",
          "permissive": true,
          "roles": [
            "fieldgrid_runtime_data"
          ],
          "usingExpression": "true",
          "checkExpression": null
        },
        {
          "schema": "public",
          "table": "objects",
          "name": "fieldgrid_runtime_data_update",
          "command": "w",
          "permissive": true,
          "roles": [
            "fieldgrid_runtime_data"
          ],
          "usingExpression": "true",
          "checkExpression": "true"
        },
        {
          "schema": "public",
          "table": "objects",
          "name": "objects_customer_users_insert",
          "command": "a",
          "permissive": true,
          "roles": [
            "authenticated"
          ],
          "usingExpression": null,
          "checkExpression": "public.customer_has_access(customer_id, tenant_id)"
        },
        {
          "schema": "public",
          "table": "objects",
          "name": "objects_customer_users_select",
          "command": "r",
          "permissive": true,
          "roles": [
            "authenticated"
          ],
          "usingExpression": "public.customer_has_access(customer_id, tenant_id)",
          "checkExpression": null
        },
        {
          "schema": "public",
          "table": "objects",
          "name": "objects_customer_users_update",
          "command": "w",
          "permissive": true,
          "roles": [
            "authenticated"
          ],
          "usingExpression": "public.customer_has_access(customer_id, tenant_id)",
          "checkExpression": "public.customer_has_access(customer_id, tenant_id)"
        },
        {
          "schema": "public",
          "table": "objects",
          "name": "objects_management",
          "command": "*",
          "permissive": true,
          "roles": [
            "authenticated"
          ],
          "usingExpression": "public.is_management_for_tenant(tenant_id)",
          "checkExpression": "public.is_management_for_tenant(tenant_id)"
        },
        {
          "schema": "public",
          "table": "objects",
          "name": "personnel_select_assigned_objects",
          "command": "r",
          "permissive": true,
          "roles": [
            "authenticated"
          ],
          "usingExpression": "(EXISTS ( SELECT 1\n   FROM public.assignments a\n  WHERE ((a.object_id = objects.id) AND public.personnel_assigned_to_assignment(a.id))))",
          "checkExpression": null
        },
        {
          "schema": "public",
          "table": "payments",
          "name": "fieldgrid_runtime_data_insert",
          "command": "a",
          "permissive": true,
          "roles": [
            "fieldgrid_runtime_data"
          ],
          "usingExpression": null,
          "checkExpression": "true"
        },
        {
          "schema": "public",
          "table": "payments",
          "name": "fieldgrid_runtime_data_select",
          "command": "r",
          "permissive": true,
          "roles": [
            "fieldgrid_runtime_data"
          ],
          "usingExpression": "true",
          "checkExpression": null
        },
        {
          "schema": "public",
          "table": "payments",
          "name": "fieldgrid_runtime_data_update",
          "command": "w",
          "permissive": true,
          "roles": [
            "fieldgrid_runtime_data"
          ],
          "usingExpression": "true",
          "checkExpression": "true"
        },
        {
          "schema": "public",
          "table": "payments",
          "name": "owner_or_staff_read_payments",
          "command": "r",
          "permissive": true,
          "roles": [
            "PUBLIC"
          ],
          "usingExpression": "(EXISTS ( SELECT 1\n   FROM public.invoices\n  WHERE ((invoices.id = payments.invoice_id) AND ((invoices.created_by = auth.uid()) OR (EXISTS ( SELECT 1\n           FROM (public.user_roles ur\n             JOIN public.roles r ON ((r.id = ur.role_id)))\n          WHERE ((ur.user_id = auth.uid()) AND ((r.name)::text = ANY ((ARRAY['management'::character varying, 'administration'::character varying, 'planning'::character varying, 'support'::character varying])::text[])))))))))",
          "checkExpression": null
        },
        {
          "schema": "public",
          "table": "payments",
          "name": "service_role_all_payments",
          "command": "*",
          "permissive": true,
          "roles": [
            "PUBLIC"
          ],
          "usingExpression": "(auth.role() = 'service_role'::text)",
          "checkExpression": "(auth.role() = 'service_role'::text)"
        },
        {
          "schema": "public",
          "table": "personnel",
          "name": "fieldgrid_runtime_data_delete",
          "command": "d",
          "permissive": true,
          "roles": [
            "fieldgrid_runtime_data"
          ],
          "usingExpression": "true",
          "checkExpression": null
        },
        {
          "schema": "public",
          "table": "personnel",
          "name": "fieldgrid_runtime_data_insert",
          "command": "a",
          "permissive": true,
          "roles": [
            "fieldgrid_runtime_data"
          ],
          "usingExpression": null,
          "checkExpression": "true"
        },
        {
          "schema": "public",
          "table": "personnel",
          "name": "fieldgrid_runtime_data_select",
          "command": "r",
          "permissive": true,
          "roles": [
            "fieldgrid_runtime_data"
          ],
          "usingExpression": "true",
          "checkExpression": null
        },
        {
          "schema": "public",
          "table": "personnel",
          "name": "fieldgrid_runtime_data_update",
          "command": "w",
          "permissive": true,
          "roles": [
            "fieldgrid_runtime_data"
          ],
          "usingExpression": "true",
          "checkExpression": "true"
        },
        {
          "schema": "public",
          "table": "personnel",
          "name": "personnel_management",
          "command": "*",
          "permissive": true,
          "roles": [
            "authenticated"
          ],
          "usingExpression": "public.is_management_for_tenant(tenant_id)",
          "checkExpression": "public.is_management_for_tenant(tenant_id)"
        },
        {
          "schema": "public",
          "table": "personnel",
          "name": "personnel_select_own",
          "command": "r",
          "permissive": true,
          "roles": [
            "authenticated"
          ],
          "usingExpression": "(user_id = auth.uid())",
          "checkExpression": null
        }
      ],
      "helpers": [
        {
          "schema": "public",
          "name": "customer_has_access",
          "argumentTypes": [
            "uuid",
            "uuid"
          ],
          "returnType": "bool",
          "body": "\n  SELECT EXISTS (\n    SELECT 1\n    FROM customer_users cu\n    WHERE cu.customer_id = p_customer_id\n      AND cu.tenant_id = p_tenant_id\n      AND cu.user_id = (SELECT auth.uid())\n      AND cu.status = 'active'\n  );\n",
          "language": "sql",
          "securityDefiner": false,
          "volatility": "s",
          "parallel": "u",
          "strict": false,
          "leakproof": false,
          "config": [
            "search_path=public, auth"
          ],
          "argNames": [
            "p_customer_id",
            "p_tenant_id"
          ],
          "defaultCount": 0,
          "ownerRelation": {
            "schema": "public",
            "table": "object_contacts"
          },
          "directAcl": [
            {
              "grantee": "$owner",
              "grantor": "$owner",
              "privilege": "EXECUTE",
              "grantable": false
            },
            {
              "grantee": "authenticated",
              "grantor": "$owner",
              "privilege": "EXECUTE",
              "grantable": false
            }
          ],
          "effectiveExecute": [
            {
              "role": "$owner",
              "allowed": true
            },
            {
              "role": "PUBLIC",
              "allowed": false
            },
            {
              "role": "anon",
              "allowed": false
            },
            {
              "role": "authenticated",
              "allowed": true
            },
            {
              "role": "service_role",
              "allowed": false
            },
            {
              "role": "fieldgrid_runtime_data",
              "allowed": false
            },
            {
              "role": "fieldgrid_runtime_app",
              "allowed": false
            }
          ]
        },
        {
          "schema": "public",
          "name": "personnel_assigned_to_assignment",
          "argumentTypes": [
            "uuid"
          ],
          "returnType": "bool",
          "body": "\n  SELECT\n    (SELECT auth.uid()) IS NOT NULL\n    AND EXISTS (\n      SELECT 1\n      FROM public.assignment_personnel ap\n      JOIN public.assignments a\n        ON a.id = ap.assignment_id\n      JOIN public.personnel p\n        ON p.id = ap.personnel_id\n      WHERE ap.assignment_id = p_assignment_id\n        AND ap.status = 'assigned'\n        AND p.user_id = (SELECT auth.uid())\n        AND p.is_active = true\n        AND p.tenant_id IS NOT NULL\n        AND a.tenant_id IS NOT NULL\n        AND p.tenant_id = a.tenant_id\n    );\n",
          "language": "sql",
          "securityDefiner": true,
          "volatility": "s",
          "parallel": "u",
          "strict": false,
          "leakproof": false,
          "config": [
            "search_path=pg_catalog, public, auth"
          ],
          "argNames": [
            "p_assignment_id"
          ],
          "defaultCount": 0,
          "ownerRelation": {
            "schema": "public",
            "table": "object_contacts"
          },
          "directAcl": [
            {
              "grantee": "$owner",
              "grantor": "$owner",
              "privilege": "EXECUTE",
              "grantable": false
            },
            {
              "grantee": "authenticated",
              "grantor": "$owner",
              "privilege": "EXECUTE",
              "grantable": false
            }
          ],
          "effectiveExecute": [
            {
              "role": "$owner",
              "allowed": true
            },
            {
              "role": "PUBLIC",
              "allowed": false
            },
            {
              "role": "anon",
              "allowed": false
            },
            {
              "role": "authenticated",
              "allowed": true
            },
            {
              "role": "service_role",
              "allowed": false
            },
            {
              "role": "fieldgrid_runtime_data",
              "allowed": false
            },
            {
              "role": "fieldgrid_runtime_app",
              "allowed": false
            }
          ]
        },
        {
          "schema": "public",
          "name": "fieldgrid_has_platform_permission",
          "argumentTypes": [
            "text"
          ],
          "returnType": "bool",
          "body": "\n  SELECT EXISTS (\n    SELECT 1 FROM public.platform_users pu\n    WHERE pu.user_id = auth.uid() AND pu.status = 'active'\n      AND (\n        pu.role = 'owner'\n        OR (pu.role = 'admin' AND p_permission = ANY (ARRAY[\n          'global.rbac.manage', 'global.reference.manage', 'global.content.manage',\n          'platform.tenants.read', 'platform.audit.read'\n        ]))\n      )\n  );\n",
          "language": "sql",
          "securityDefiner": true,
          "volatility": "s",
          "parallel": "u",
          "strict": false,
          "leakproof": false,
          "config": [
            "search_path=pg_catalog, public, pg_temp"
          ],
          "argNames": [
            "p_permission"
          ],
          "defaultCount": 0,
          "ownerRelation": {
            "schema": "public",
            "table": "object_contacts"
          },
          "directAcl": [
            {
              "grantee": "$owner",
              "grantor": "$owner",
              "privilege": "EXECUTE",
              "grantable": false
            },
            {
              "grantee": "authenticated",
              "grantor": "$owner",
              "privilege": "EXECUTE",
              "grantable": false
            }
          ],
          "effectiveExecute": [
            {
              "role": "$owner",
              "allowed": true
            },
            {
              "role": "PUBLIC",
              "allowed": false
            },
            {
              "role": "anon",
              "allowed": false
            },
            {
              "role": "authenticated",
              "allowed": true
            },
            {
              "role": "service_role",
              "allowed": false
            },
            {
              "role": "fieldgrid_runtime_data",
              "allowed": false
            },
            {
              "role": "fieldgrid_runtime_app",
              "allowed": false
            }
          ]
        },
        {
          "schema": "auth",
          "name": "uid",
          "argumentTypes": [],
          "returnType": "uuid",
          "body": "\n  select \n  coalesce(\n    nullif(current_setting('request.jwt.claim.sub', true), ''),\n    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')\n  )::uuid\n",
          "language": "sql",
          "securityDefiner": false,
          "volatility": "s",
          "parallel": "u",
          "strict": false,
          "leakproof": false,
          "config": null,
          "argNames": null,
          "defaultCount": 0,
          "ownerRelation": {
            "schema": "auth",
            "table": "users"
          },
          "directAcl": [
            {
              "grantee": "$owner",
              "grantor": "$owner",
              "privilege": "EXECUTE",
              "grantable": false
            },
            {
              "grantee": "PUBLIC",
              "grantor": "$owner",
              "privilege": "EXECUTE",
              "grantable": false
            },
            {
              "grantee": "postgres",
              "grantor": "$owner",
              "privilege": "EXECUTE",
              "grantable": false
            },
            {
              "grantee": "dashboard_user",
              "grantor": "$owner",
              "privilege": "EXECUTE",
              "grantable": false
            }
          ],
          "effectiveExecute": [
            {
              "role": "$owner",
              "allowed": true
            },
            {
              "role": "PUBLIC",
              "allowed": true
            },
            {
              "role": "anon",
              "allowed": true
            },
            {
              "role": "authenticated",
              "allowed": true
            },
            {
              "role": "service_role",
              "allowed": true
            },
            {
              "role": "fieldgrid_runtime_data",
              "allowed": true
            },
            {
              "role": "fieldgrid_runtime_app",
              "allowed": true
            }
          ]
        },
        {
          "schema": "auth",
          "name": "role",
          "argumentTypes": [],
          "returnType": "text",
          "body": "\n  select \n  coalesce(\n    nullif(current_setting('request.jwt.claim.role', true), ''),\n    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')\n  )::text\n",
          "language": "sql",
          "securityDefiner": false,
          "volatility": "s",
          "parallel": "u",
          "strict": false,
          "leakproof": false,
          "config": null,
          "argNames": null,
          "defaultCount": 0,
          "ownerRelation": {
            "schema": "auth",
            "table": "users"
          },
          "directAcl": [
            {
              "grantee": "$owner",
              "grantor": "$owner",
              "privilege": "EXECUTE",
              "grantable": false
            },
            {
              "grantee": "PUBLIC",
              "grantor": "$owner",
              "privilege": "EXECUTE",
              "grantable": false
            },
            {
              "grantee": "postgres",
              "grantor": "$owner",
              "privilege": "EXECUTE",
              "grantable": false
            },
            {
              "grantee": "dashboard_user",
              "grantor": "$owner",
              "privilege": "EXECUTE",
              "grantable": false
            }
          ],
          "effectiveExecute": [
            {
              "role": "$owner",
              "allowed": true
            },
            {
              "role": "PUBLIC",
              "allowed": true
            },
            {
              "role": "anon",
              "allowed": true
            },
            {
              "role": "authenticated",
              "allowed": true
            },
            {
              "role": "service_role",
              "allowed": true
            },
            {
              "role": "fieldgrid_runtime_data",
              "allowed": true
            },
            {
              "role": "fieldgrid_runtime_app",
              "allowed": true
            }
          ]
        }
      ]
    }
  },
  {
    "state": "targetUpgrade",
    "profile": "localShim",
    "manifest": {
      "version": 1,
      "postgresMajor": 17,
      "sources": [
        {
          "path": "lib/db/migrations/002_sprint1_rls.sql",
          "sha256": "16a27aa61943516314b9800d7b37a08eeb9c64441a5994c7da3f9badf7265238"
        },
        {
          "path": "lib/db/migrations/025_platform_schema_extensions.sql",
          "sha256": "8a57d65ba11e3122f897498093d1351f0cf57a2f1940850e266bbfc54c0b3636"
        },
        {
          "path": "lib/db/migrations/037_tenant_customer_users_events_hardening.sql",
          "sha256": "03a1ad0cbf406140c64b53da422abb62a45a6e0e9fb68832a8328ca6685d0b0e"
        },
        {
          "path": "lib/db/migrations/051_final_security_boundaries.sql",
          "sha256": "64f12a61bbd19cfbf4ec854c31560717bef4219433b03c09055f3f6f070181ff"
        },
        {
          "path": "lib/db/migrations/062_finance_reports_tenant_scope.sql",
          "sha256": "0ff1e8fcc5e0a3c7674ed084e6058e1a538ca0fed13e02f469fb0d363e055fbe"
        },
        {
          "path": "lib/db/migrations/063_payments_batches_audit_tenant_scope.sql",
          "sha256": "171caa7e6a8d4a8f624e475dc234d21b6c81e1e38802ddad3db778047f2053d2"
        },
        {
          "path": "lib/db/migrations/20260710200000_invoice_canon_credit_collection_payments.sql",
          "sha256": "78fc35f49a80a69ad7a7fe0dfc23c264dff2aba0fbfc49f702b3a7a74d1bc23f"
        },
        {
          "path": "lib/db/migrations/20260714120000_assignment_personnel_phase_b_direct_access_close.sql",
          "sha256": "7be5f0c1999d6eaadb22735d2243322d8aada1e64e3c4c44c4a3bc11d8317574"
        },
        {
          "path": "lib/db/migrations/20260718190000_phase2_security_reconciliation.sql",
          "sha256": "6cf0da37eec7c1b5b57c8218593873fedf1fae2a832b27e138dfd2614b861964"
        },
        {
          "path": "lib/db/migrations/20260909120000_runtime_least_privilege_principals.sql",
          "sha256": "2eaf25923d7908c94d1fb96c7fbede14858330d86be21656f50d611fe37e0066"
        },
        {
          "path": "migrations/013_sprint5_payments.sql",
          "sha256": "ea6d0e71764e92d0a0f0ad2d09a6bdf6c864c2a64d1ef717743b567d15198102"
        },
        {
          "path": "migrations/023_objects_extended.sql",
          "sha256": "19e20f3463f220a123450cefec79dc7490d5074c72f1a3f726ddfd1a28dde6ae"
        },
        {
          "path": "scripts/fieldgrid-runtime-safety-setup.mjs",
          "sha256": "f43d159c3e047bd752642e8005793df40314873a772c16c95eca7195f5c34666"
        },
        {
          "path": "tests/fixtures/fieldgrid-supabase-auth-functions.sql",
          "sha256": "5b72022d73e64a8e474d2122ac42f299bb7ce4d59755cdcc78e72abfe5d47dc0"
        }
      ],
      "relations": [
        {
          "schema": "public",
          "table": "invoices",
          "kind": "r",
          "rowSecurity": true,
          "forceRowSecurity": false,
          "columns": [
            {
              "name": "created_by",
              "notNull": false,
              "typeName": "uuid",
              "typeModifier": -1
            },
            {
              "name": "id",
              "notNull": true,
              "typeName": "uuid",
              "typeModifier": -1
            },
            {
              "name": "tenant_id",
              "notNull": true,
              "typeName": "uuid",
              "typeModifier": -1
            }
          ]
        },
        {
          "schema": "public",
          "table": "object_contacts",
          "kind": "r",
          "rowSecurity": true,
          "forceRowSecurity": false,
          "columns": [
            {
              "name": "id",
              "notNull": true,
              "typeName": "uuid",
              "typeModifier": -1
            },
            {
              "name": "object_id",
              "notNull": true,
              "typeName": "uuid",
              "typeModifier": -1
            }
          ]
        },
        {
          "schema": "public",
          "table": "object_personnel",
          "kind": "r",
          "rowSecurity": true,
          "forceRowSecurity": false,
          "columns": [
            {
              "name": "object_id",
              "notNull": true,
              "typeName": "uuid",
              "typeModifier": -1
            },
            {
              "name": "personnel_id",
              "notNull": true,
              "typeName": "uuid",
              "typeModifier": -1
            }
          ]
        },
        {
          "schema": "public",
          "table": "objects",
          "kind": "r",
          "rowSecurity": true,
          "forceRowSecurity": false,
          "columns": [
            {
              "name": "id",
              "notNull": true,
              "typeName": "uuid",
              "typeModifier": -1
            },
            {
              "name": "tenant_id",
              "notNull": true,
              "typeName": "uuid",
              "typeModifier": -1
            }
          ]
        },
        {
          "schema": "public",
          "table": "payments",
          "kind": "r",
          "rowSecurity": true,
          "forceRowSecurity": false,
          "columns": [
            {
              "name": "id",
              "notNull": true,
              "typeName": "uuid",
              "typeModifier": -1
            },
            {
              "name": "invoice_id",
              "notNull": false,
              "typeName": "uuid",
              "typeModifier": -1
            },
            {
              "name": "tenant_id",
              "notNull": true,
              "typeName": "uuid",
              "typeModifier": -1
            }
          ]
        },
        {
          "schema": "public",
          "table": "personnel",
          "kind": "r",
          "rowSecurity": true,
          "forceRowSecurity": false,
          "columns": [
            {
              "name": "id",
              "notNull": true,
              "typeName": "uuid",
              "typeModifier": -1
            },
            {
              "name": "tenant_id",
              "notNull": true,
              "typeName": "uuid",
              "typeModifier": -1
            }
          ]
        }
      ],
      "policies": [
        {
          "schema": "public",
          "table": "invoices",
          "name": "fieldgrid_runtime_data_insert",
          "command": "a",
          "permissive": true,
          "roles": [
            "fieldgrid_runtime_data"
          ],
          "usingExpression": null,
          "checkExpression": "true"
        },
        {
          "schema": "public",
          "table": "invoices",
          "name": "fieldgrid_runtime_data_select",
          "command": "r",
          "permissive": true,
          "roles": [
            "fieldgrid_runtime_data"
          ],
          "usingExpression": "true",
          "checkExpression": null
        },
        {
          "schema": "public",
          "table": "invoices",
          "name": "fieldgrid_runtime_data_update",
          "command": "w",
          "permissive": true,
          "roles": [
            "fieldgrid_runtime_data"
          ],
          "usingExpression": "true",
          "checkExpression": "true"
        },
        {
          "schema": "public",
          "table": "invoices",
          "name": "invoices_customer_sent_select",
          "command": "r",
          "permissive": true,
          "roles": [
            "authenticated"
          ],
          "usingExpression": "(((status)::text = ANY ((ARRAY['sent'::character varying, 'paid'::character varying, 'cancelled'::character varying])::text[])) AND (EXISTS ( SELECT 1\n   FROM public.customers c\n  WHERE ((c.id = invoices.customer_id) AND public.customer_has_access(c.id, c.tenant_id)))))",
          "checkExpression": null
        },
        {
          "schema": "public",
          "table": "invoices",
          "name": "invoices_management_all",
          "command": "*",
          "permissive": true,
          "roles": [
            "authenticated"
          ],
          "usingExpression": "public.is_management_for_tenant(tenant_id)",
          "checkExpression": "public.is_management_for_tenant(tenant_id)"
        },
        {
          "schema": "public",
          "table": "object_contacts",
          "name": "fieldgrid_runtime_data_delete",
          "command": "d",
          "permissive": true,
          "roles": [
            "fieldgrid_runtime_data"
          ],
          "usingExpression": "true",
          "checkExpression": null
        },
        {
          "schema": "public",
          "table": "object_contacts",
          "name": "fieldgrid_runtime_data_insert",
          "command": "a",
          "permissive": true,
          "roles": [
            "fieldgrid_runtime_data"
          ],
          "usingExpression": null,
          "checkExpression": "true"
        },
        {
          "schema": "public",
          "table": "object_contacts",
          "name": "fieldgrid_runtime_data_select",
          "command": "r",
          "permissive": true,
          "roles": [
            "fieldgrid_runtime_data"
          ],
          "usingExpression": "true",
          "checkExpression": null
        },
        {
          "schema": "public",
          "table": "object_contacts",
          "name": "fieldgrid_runtime_data_update",
          "command": "w",
          "permissive": true,
          "roles": [
            "fieldgrid_runtime_data"
          ],
          "usingExpression": "true",
          "checkExpression": "true"
        },
        {
          "schema": "public",
          "table": "object_contacts",
          "name": "object_contacts_customer_users_delete",
          "command": "d",
          "permissive": true,
          "roles": [
            "authenticated"
          ],
          "usingExpression": "(EXISTS ( SELECT 1\n   FROM public.objects o\n  WHERE ((o.id = object_contacts.object_id) AND public.customer_has_access(o.customer_id, o.tenant_id))))",
          "checkExpression": null
        },
        {
          "schema": "public",
          "table": "object_contacts",
          "name": "object_contacts_customer_users_insert",
          "command": "a",
          "permissive": true,
          "roles": [
            "authenticated"
          ],
          "usingExpression": null,
          "checkExpression": "(EXISTS ( SELECT 1\n   FROM public.objects o\n  WHERE ((o.id = object_contacts.object_id) AND public.customer_has_access(o.customer_id, o.tenant_id))))"
        },
        {
          "schema": "public",
          "table": "object_contacts",
          "name": "object_contacts_customer_users_select",
          "command": "r",
          "permissive": true,
          "roles": [
            "authenticated"
          ],
          "usingExpression": "(EXISTS ( SELECT 1\n   FROM public.objects o\n  WHERE ((o.id = object_contacts.object_id) AND public.customer_has_access(o.customer_id, o.tenant_id))))",
          "checkExpression": null
        },
        {
          "schema": "public",
          "table": "object_contacts",
          "name": "object_contacts_customer_users_update",
          "command": "w",
          "permissive": true,
          "roles": [
            "authenticated"
          ],
          "usingExpression": "(EXISTS ( SELECT 1\n   FROM public.objects o\n  WHERE ((o.id = object_contacts.object_id) AND public.customer_has_access(o.customer_id, o.tenant_id))))",
          "checkExpression": "(EXISTS ( SELECT 1\n   FROM public.objects o\n  WHERE ((o.id = object_contacts.object_id) AND public.customer_has_access(o.customer_id, o.tenant_id))))"
        },
        {
          "schema": "public",
          "table": "object_contacts",
          "name": "object_contacts_management",
          "command": "*",
          "permissive": true,
          "roles": [
            "authenticated"
          ],
          "usingExpression": "(EXISTS ( SELECT 1\n   FROM public.objects o\n  WHERE ((o.id = object_contacts.object_id) AND public.is_management_for_tenant(o.tenant_id))))",
          "checkExpression": "(EXISTS ( SELECT 1\n   FROM public.objects o\n  WHERE ((o.id = object_contacts.object_id) AND public.is_management_for_tenant(o.tenant_id))))"
        },
        {
          "schema": "public",
          "table": "object_personnel",
          "name": "fieldgrid_runtime_data_delete",
          "command": "d",
          "permissive": true,
          "roles": [
            "fieldgrid_runtime_data"
          ],
          "usingExpression": "true",
          "checkExpression": null
        },
        {
          "schema": "public",
          "table": "object_personnel",
          "name": "fieldgrid_runtime_data_insert",
          "command": "a",
          "permissive": true,
          "roles": [
            "fieldgrid_runtime_data"
          ],
          "usingExpression": null,
          "checkExpression": "true"
        },
        {
          "schema": "public",
          "table": "object_personnel",
          "name": "fieldgrid_runtime_data_select",
          "command": "r",
          "permissive": true,
          "roles": [
            "fieldgrid_runtime_data"
          ],
          "usingExpression": "true",
          "checkExpression": null
        },
        {
          "schema": "public",
          "table": "object_personnel",
          "name": "object_personnel_management",
          "command": "*",
          "permissive": true,
          "roles": [
            "authenticated"
          ],
          "usingExpression": "(EXISTS ( SELECT 1\n   FROM (public.objects o\n     JOIN public.personnel p ON (((p.id = object_personnel.personnel_id) AND (p.tenant_id = o.tenant_id))))\n  WHERE ((o.id = object_personnel.object_id) AND public.is_management_for_tenant(o.tenant_id))))",
          "checkExpression": "(EXISTS ( SELECT 1\n   FROM (public.objects o\n     JOIN public.personnel p ON (((p.id = object_personnel.personnel_id) AND (p.tenant_id = o.tenant_id))))\n  WHERE ((o.id = object_personnel.object_id) AND public.is_management_for_tenant(o.tenant_id))))"
        },
        {
          "schema": "public",
          "table": "objects",
          "name": "fieldgrid_runtime_data_delete",
          "command": "d",
          "permissive": true,
          "roles": [
            "fieldgrid_runtime_data"
          ],
          "usingExpression": "true",
          "checkExpression": null
        },
        {
          "schema": "public",
          "table": "objects",
          "name": "fieldgrid_runtime_data_insert",
          "command": "a",
          "permissive": true,
          "roles": [
            "fieldgrid_runtime_data"
          ],
          "usingExpression": null,
          "checkExpression": "true"
        },
        {
          "schema": "public",
          "table": "objects",
          "name": "fieldgrid_runtime_data_select",
          "command": "r",
          "permissive": true,
          "roles": [
            "fieldgrid_runtime_data"
          ],
          "usingExpression": "true",
          "checkExpression": null
        },
        {
          "schema": "public",
          "table": "objects",
          "name": "fieldgrid_runtime_data_update",
          "command": "w",
          "permissive": true,
          "roles": [
            "fieldgrid_runtime_data"
          ],
          "usingExpression": "true",
          "checkExpression": "true"
        },
        {
          "schema": "public",
          "table": "objects",
          "name": "objects_customer_users_insert",
          "command": "a",
          "permissive": true,
          "roles": [
            "authenticated"
          ],
          "usingExpression": null,
          "checkExpression": "public.customer_has_access(customer_id, tenant_id)"
        },
        {
          "schema": "public",
          "table": "objects",
          "name": "objects_customer_users_select",
          "command": "r",
          "permissive": true,
          "roles": [
            "authenticated"
          ],
          "usingExpression": "public.customer_has_access(customer_id, tenant_id)",
          "checkExpression": null
        },
        {
          "schema": "public",
          "table": "objects",
          "name": "objects_customer_users_update",
          "command": "w",
          "permissive": true,
          "roles": [
            "authenticated"
          ],
          "usingExpression": "public.customer_has_access(customer_id, tenant_id)",
          "checkExpression": "public.customer_has_access(customer_id, tenant_id)"
        },
        {
          "schema": "public",
          "table": "objects",
          "name": "objects_management",
          "command": "*",
          "permissive": true,
          "roles": [
            "authenticated"
          ],
          "usingExpression": "public.is_management_for_tenant(tenant_id)",
          "checkExpression": "public.is_management_for_tenant(tenant_id)"
        },
        {
          "schema": "public",
          "table": "objects",
          "name": "personnel_select_assigned_objects",
          "command": "r",
          "permissive": true,
          "roles": [
            "authenticated"
          ],
          "usingExpression": "(EXISTS ( SELECT 1\n   FROM public.assignments a\n  WHERE ((a.object_id = objects.id) AND public.personnel_assigned_to_assignment(a.id))))",
          "checkExpression": null
        },
        {
          "schema": "public",
          "table": "payments",
          "name": "fieldgrid_runtime_data_insert",
          "command": "a",
          "permissive": true,
          "roles": [
            "fieldgrid_runtime_data"
          ],
          "usingExpression": null,
          "checkExpression": "true"
        },
        {
          "schema": "public",
          "table": "payments",
          "name": "fieldgrid_runtime_data_select",
          "command": "r",
          "permissive": true,
          "roles": [
            "fieldgrid_runtime_data"
          ],
          "usingExpression": "true",
          "checkExpression": null
        },
        {
          "schema": "public",
          "table": "payments",
          "name": "fieldgrid_runtime_data_update",
          "command": "w",
          "permissive": true,
          "roles": [
            "fieldgrid_runtime_data"
          ],
          "usingExpression": "true",
          "checkExpression": "true"
        },
        {
          "schema": "public",
          "table": "payments",
          "name": "owner_or_staff_read_payments",
          "command": "r",
          "permissive": true,
          "roles": [
            "authenticated"
          ],
          "usingExpression": "(EXISTS ( SELECT 1\n   FROM public.invoices i\n  WHERE ((i.id = payments.invoice_id) AND (i.tenant_id = payments.tenant_id) AND ((i.created_by = auth.uid()) OR public.is_management_for_tenant(i.tenant_id)))))",
          "checkExpression": null
        },
        {
          "schema": "public",
          "table": "payments",
          "name": "service_role_all_payments",
          "command": "*",
          "permissive": true,
          "roles": [
            "PUBLIC"
          ],
          "usingExpression": "(auth.role() = 'service_role'::text)",
          "checkExpression": "(auth.role() = 'service_role'::text)"
        },
        {
          "schema": "public",
          "table": "personnel",
          "name": "fieldgrid_runtime_data_delete",
          "command": "d",
          "permissive": true,
          "roles": [
            "fieldgrid_runtime_data"
          ],
          "usingExpression": "true",
          "checkExpression": null
        },
        {
          "schema": "public",
          "table": "personnel",
          "name": "fieldgrid_runtime_data_insert",
          "command": "a",
          "permissive": true,
          "roles": [
            "fieldgrid_runtime_data"
          ],
          "usingExpression": null,
          "checkExpression": "true"
        },
        {
          "schema": "public",
          "table": "personnel",
          "name": "fieldgrid_runtime_data_select",
          "command": "r",
          "permissive": true,
          "roles": [
            "fieldgrid_runtime_data"
          ],
          "usingExpression": "true",
          "checkExpression": null
        },
        {
          "schema": "public",
          "table": "personnel",
          "name": "fieldgrid_runtime_data_update",
          "command": "w",
          "permissive": true,
          "roles": [
            "fieldgrid_runtime_data"
          ],
          "usingExpression": "true",
          "checkExpression": "true"
        },
        {
          "schema": "public",
          "table": "personnel",
          "name": "personnel_management",
          "command": "*",
          "permissive": true,
          "roles": [
            "authenticated"
          ],
          "usingExpression": "public.is_management_for_tenant(tenant_id)",
          "checkExpression": "public.is_management_for_tenant(tenant_id)"
        },
        {
          "schema": "public",
          "table": "personnel",
          "name": "personnel_select_own",
          "command": "r",
          "permissive": true,
          "roles": [
            "authenticated"
          ],
          "usingExpression": "(user_id = auth.uid())",
          "checkExpression": null
        }
      ],
      "helpers": [
        {
          "schema": "public",
          "name": "customer_has_access",
          "argumentTypes": [
            "uuid",
            "uuid"
          ],
          "returnType": "bool",
          "body": "\n  SELECT EXISTS (\n    SELECT 1\n    FROM customer_users cu\n    WHERE cu.customer_id = p_customer_id\n      AND cu.tenant_id = p_tenant_id\n      AND cu.user_id = (SELECT auth.uid())\n      AND cu.status = 'active'\n  );\n",
          "language": "sql",
          "securityDefiner": false,
          "volatility": "s",
          "parallel": "u",
          "strict": false,
          "leakproof": false,
          "config": [
            "search_path=public, auth"
          ],
          "argNames": [
            "p_customer_id",
            "p_tenant_id"
          ],
          "defaultCount": 0,
          "ownerRelation": {
            "schema": "public",
            "table": "object_contacts"
          },
          "directAcl": [
            {
              "grantee": "$owner",
              "grantor": "$owner",
              "privilege": "EXECUTE",
              "grantable": false
            },
            {
              "grantee": "authenticated",
              "grantor": "$owner",
              "privilege": "EXECUTE",
              "grantable": false
            }
          ],
          "effectiveExecute": [
            {
              "role": "$owner",
              "allowed": true
            },
            {
              "role": "PUBLIC",
              "allowed": false
            },
            {
              "role": "anon",
              "allowed": false
            },
            {
              "role": "authenticated",
              "allowed": true
            },
            {
              "role": "service_role",
              "allowed": false
            },
            {
              "role": "fieldgrid_runtime_data",
              "allowed": false
            },
            {
              "role": "fieldgrid_runtime_app",
              "allowed": false
            }
          ]
        },
        {
          "schema": "public",
          "name": "personnel_assigned_to_assignment",
          "argumentTypes": [
            "uuid"
          ],
          "returnType": "bool",
          "body": "\n  SELECT\n    (SELECT auth.uid()) IS NOT NULL\n    AND EXISTS (\n      SELECT 1\n      FROM public.assignment_personnel ap\n      JOIN public.assignments a\n        ON a.id = ap.assignment_id\n      JOIN public.personnel p\n        ON p.id = ap.personnel_id\n      WHERE ap.assignment_id = p_assignment_id\n        AND ap.status = 'assigned'\n        AND p.user_id = (SELECT auth.uid())\n        AND p.is_active = true\n        AND p.tenant_id IS NOT NULL\n        AND a.tenant_id IS NOT NULL\n        AND p.tenant_id = a.tenant_id\n    );\n",
          "language": "sql",
          "securityDefiner": true,
          "volatility": "s",
          "parallel": "u",
          "strict": false,
          "leakproof": false,
          "config": [
            "search_path=pg_catalog, public, auth"
          ],
          "argNames": [
            "p_assignment_id"
          ],
          "defaultCount": 0,
          "ownerRelation": {
            "schema": "public",
            "table": "object_contacts"
          },
          "directAcl": [
            {
              "grantee": "$owner",
              "grantor": "$owner",
              "privilege": "EXECUTE",
              "grantable": false
            },
            {
              "grantee": "authenticated",
              "grantor": "$owner",
              "privilege": "EXECUTE",
              "grantable": false
            }
          ],
          "effectiveExecute": [
            {
              "role": "$owner",
              "allowed": true
            },
            {
              "role": "PUBLIC",
              "allowed": false
            },
            {
              "role": "anon",
              "allowed": false
            },
            {
              "role": "authenticated",
              "allowed": true
            },
            {
              "role": "service_role",
              "allowed": false
            },
            {
              "role": "fieldgrid_runtime_data",
              "allowed": false
            },
            {
              "role": "fieldgrid_runtime_app",
              "allowed": false
            }
          ]
        },
        {
          "schema": "public",
          "name": "fieldgrid_has_platform_permission",
          "argumentTypes": [
            "text"
          ],
          "returnType": "bool",
          "body": "\n  SELECT EXISTS (\n    SELECT 1 FROM public.platform_users pu\n    WHERE pu.user_id = auth.uid() AND pu.status = 'active'\n      AND (\n        pu.role = 'owner'\n        OR (pu.role = 'admin' AND p_permission = ANY (ARRAY[\n          'global.rbac.manage', 'global.reference.manage', 'global.content.manage',\n          'platform.tenants.read', 'platform.audit.read'\n        ]))\n      )\n  );\n",
          "language": "sql",
          "securityDefiner": true,
          "volatility": "s",
          "parallel": "u",
          "strict": false,
          "leakproof": false,
          "config": [
            "search_path=pg_catalog, public, pg_temp"
          ],
          "argNames": [
            "p_permission"
          ],
          "defaultCount": 0,
          "ownerRelation": {
            "schema": "public",
            "table": "object_contacts"
          },
          "directAcl": [
            {
              "grantee": "$owner",
              "grantor": "$owner",
              "privilege": "EXECUTE",
              "grantable": false
            },
            {
              "grantee": "authenticated",
              "grantor": "$owner",
              "privilege": "EXECUTE",
              "grantable": false
            }
          ],
          "effectiveExecute": [
            {
              "role": "$owner",
              "allowed": true
            },
            {
              "role": "PUBLIC",
              "allowed": false
            },
            {
              "role": "anon",
              "allowed": false
            },
            {
              "role": "authenticated",
              "allowed": true
            },
            {
              "role": "service_role",
              "allowed": false
            },
            {
              "role": "fieldgrid_runtime_data",
              "allowed": false
            },
            {
              "role": "fieldgrid_runtime_app",
              "allowed": false
            }
          ]
        },
        {
          "schema": "auth",
          "name": "uid",
          "argumentTypes": [],
          "returnType": "uuid",
          "body": "\n      select nullif(\n        coalesce(\n          nullif(current_setting('request.jwt.claim.sub', true), ''),\n          nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'\n        ),\n        ''\n      )::uuid\n    ",
          "language": "sql",
          "securityDefiner": false,
          "volatility": "s",
          "parallel": "u",
          "strict": false,
          "leakproof": false,
          "config": null,
          "argNames": null,
          "defaultCount": 0,
          "ownerRelation": {
            "schema": "auth",
            "table": "users"
          },
          "directAcl": [
            {
              "grantee": "$owner",
              "grantor": "$owner",
              "privilege": "EXECUTE",
              "grantable": false
            },
            {
              "grantee": "PUBLIC",
              "grantor": "$owner",
              "privilege": "EXECUTE",
              "grantable": false
            }
          ],
          "effectiveExecute": [
            {
              "role": "$owner",
              "allowed": true
            },
            {
              "role": "PUBLIC",
              "allowed": true
            },
            {
              "role": "anon",
              "allowed": true
            },
            {
              "role": "authenticated",
              "allowed": true
            },
            {
              "role": "service_role",
              "allowed": true
            },
            {
              "role": "fieldgrid_runtime_data",
              "allowed": true
            },
            {
              "role": "fieldgrid_runtime_app",
              "allowed": true
            }
          ]
        },
        {
          "schema": "auth",
          "name": "role",
          "argumentTypes": [],
          "returnType": "text",
          "body": "\n  select \n  coalesce(\n    nullif(current_setting('request.jwt.claim.role', true), ''),\n    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')\n  )::text\n",
          "language": "sql",
          "securityDefiner": false,
          "volatility": "s",
          "parallel": "u",
          "strict": false,
          "leakproof": false,
          "config": null,
          "argNames": null,
          "defaultCount": 0,
          "ownerRelation": {
            "schema": "auth",
            "table": "users"
          },
          "directAcl": [
            {
              "grantee": "$owner",
              "grantor": "$owner",
              "privilege": "EXECUTE",
              "grantable": false
            },
            {
              "grantee": "PUBLIC",
              "grantor": "$owner",
              "privilege": "EXECUTE",
              "grantable": false
            }
          ],
          "effectiveExecute": [
            {
              "role": "$owner",
              "allowed": true
            },
            {
              "role": "PUBLIC",
              "allowed": true
            },
            {
              "role": "anon",
              "allowed": true
            },
            {
              "role": "authenticated",
              "allowed": true
            },
            {
              "role": "service_role",
              "allowed": true
            },
            {
              "role": "fieldgrid_runtime_data",
              "allowed": true
            },
            {
              "role": "fieldgrid_runtime_app",
              "allowed": true
            }
          ]
        }
      ]
    }
  },
  {
    "state": "targetUpgrade",
    "profile": "providerSource",
    "manifest": {
      "version": 1,
      "postgresMajor": 17,
      "sources": [
        {
          "path": "lib/db/migrations/002_sprint1_rls.sql",
          "sha256": "16a27aa61943516314b9800d7b37a08eeb9c64441a5994c7da3f9badf7265238"
        },
        {
          "path": "lib/db/migrations/025_platform_schema_extensions.sql",
          "sha256": "8a57d65ba11e3122f897498093d1351f0cf57a2f1940850e266bbfc54c0b3636"
        },
        {
          "path": "lib/db/migrations/037_tenant_customer_users_events_hardening.sql",
          "sha256": "03a1ad0cbf406140c64b53da422abb62a45a6e0e9fb68832a8328ca6685d0b0e"
        },
        {
          "path": "lib/db/migrations/051_final_security_boundaries.sql",
          "sha256": "64f12a61bbd19cfbf4ec854c31560717bef4219433b03c09055f3f6f070181ff"
        },
        {
          "path": "lib/db/migrations/062_finance_reports_tenant_scope.sql",
          "sha256": "0ff1e8fcc5e0a3c7674ed084e6058e1a538ca0fed13e02f469fb0d363e055fbe"
        },
        {
          "path": "lib/db/migrations/063_payments_batches_audit_tenant_scope.sql",
          "sha256": "171caa7e6a8d4a8f624e475dc234d21b6c81e1e38802ddad3db778047f2053d2"
        },
        {
          "path": "lib/db/migrations/20260710200000_invoice_canon_credit_collection_payments.sql",
          "sha256": "78fc35f49a80a69ad7a7fe0dfc23c264dff2aba0fbfc49f702b3a7a74d1bc23f"
        },
        {
          "path": "lib/db/migrations/20260714120000_assignment_personnel_phase_b_direct_access_close.sql",
          "sha256": "7be5f0c1999d6eaadb22735d2243322d8aada1e64e3c4c44c4a3bc11d8317574"
        },
        {
          "path": "lib/db/migrations/20260718190000_phase2_security_reconciliation.sql",
          "sha256": "6cf0da37eec7c1b5b57c8218593873fedf1fae2a832b27e138dfd2614b861964"
        },
        {
          "path": "lib/db/migrations/20260909120000_runtime_least_privilege_principals.sql",
          "sha256": "2eaf25923d7908c94d1fb96c7fbede14858330d86be21656f50d611fe37e0066"
        },
        {
          "path": "migrations/013_sprint5_payments.sql",
          "sha256": "ea6d0e71764e92d0a0f0ad2d09a6bdf6c864c2a64d1ef717743b567d15198102"
        },
        {
          "path": "migrations/023_objects_extended.sql",
          "sha256": "19e20f3463f220a123450cefec79dc7490d5074c72f1a3f726ddfd1a28dde6ae"
        },
        {
          "path": "scripts/fieldgrid-runtime-safety-setup.mjs",
          "sha256": "f43d159c3e047bd752642e8005793df40314873a772c16c95eca7195f5c34666"
        },
        {
          "path": "tests/fixtures/fieldgrid-supabase-auth-functions.sql",
          "sha256": "5b72022d73e64a8e474d2122ac42f299bb7ce4d59755cdcc78e72abfe5d47dc0"
        }
      ],
      "relations": [
        {
          "schema": "public",
          "table": "invoices",
          "kind": "r",
          "rowSecurity": true,
          "forceRowSecurity": false,
          "columns": [
            {
              "name": "created_by",
              "notNull": false,
              "typeName": "uuid",
              "typeModifier": -1
            },
            {
              "name": "id",
              "notNull": true,
              "typeName": "uuid",
              "typeModifier": -1
            },
            {
              "name": "tenant_id",
              "notNull": true,
              "typeName": "uuid",
              "typeModifier": -1
            }
          ]
        },
        {
          "schema": "public",
          "table": "object_contacts",
          "kind": "r",
          "rowSecurity": true,
          "forceRowSecurity": false,
          "columns": [
            {
              "name": "id",
              "notNull": true,
              "typeName": "uuid",
              "typeModifier": -1
            },
            {
              "name": "object_id",
              "notNull": true,
              "typeName": "uuid",
              "typeModifier": -1
            }
          ]
        },
        {
          "schema": "public",
          "table": "object_personnel",
          "kind": "r",
          "rowSecurity": true,
          "forceRowSecurity": false,
          "columns": [
            {
              "name": "object_id",
              "notNull": true,
              "typeName": "uuid",
              "typeModifier": -1
            },
            {
              "name": "personnel_id",
              "notNull": true,
              "typeName": "uuid",
              "typeModifier": -1
            }
          ]
        },
        {
          "schema": "public",
          "table": "objects",
          "kind": "r",
          "rowSecurity": true,
          "forceRowSecurity": false,
          "columns": [
            {
              "name": "id",
              "notNull": true,
              "typeName": "uuid",
              "typeModifier": -1
            },
            {
              "name": "tenant_id",
              "notNull": true,
              "typeName": "uuid",
              "typeModifier": -1
            }
          ]
        },
        {
          "schema": "public",
          "table": "payments",
          "kind": "r",
          "rowSecurity": true,
          "forceRowSecurity": false,
          "columns": [
            {
              "name": "id",
              "notNull": true,
              "typeName": "uuid",
              "typeModifier": -1
            },
            {
              "name": "invoice_id",
              "notNull": false,
              "typeName": "uuid",
              "typeModifier": -1
            },
            {
              "name": "tenant_id",
              "notNull": true,
              "typeName": "uuid",
              "typeModifier": -1
            }
          ]
        },
        {
          "schema": "public",
          "table": "personnel",
          "kind": "r",
          "rowSecurity": true,
          "forceRowSecurity": false,
          "columns": [
            {
              "name": "id",
              "notNull": true,
              "typeName": "uuid",
              "typeModifier": -1
            },
            {
              "name": "tenant_id",
              "notNull": true,
              "typeName": "uuid",
              "typeModifier": -1
            }
          ]
        }
      ],
      "policies": [
        {
          "schema": "public",
          "table": "invoices",
          "name": "fieldgrid_runtime_data_insert",
          "command": "a",
          "permissive": true,
          "roles": [
            "fieldgrid_runtime_data"
          ],
          "usingExpression": null,
          "checkExpression": "true"
        },
        {
          "schema": "public",
          "table": "invoices",
          "name": "fieldgrid_runtime_data_select",
          "command": "r",
          "permissive": true,
          "roles": [
            "fieldgrid_runtime_data"
          ],
          "usingExpression": "true",
          "checkExpression": null
        },
        {
          "schema": "public",
          "table": "invoices",
          "name": "fieldgrid_runtime_data_update",
          "command": "w",
          "permissive": true,
          "roles": [
            "fieldgrid_runtime_data"
          ],
          "usingExpression": "true",
          "checkExpression": "true"
        },
        {
          "schema": "public",
          "table": "invoices",
          "name": "invoices_customer_sent_select",
          "command": "r",
          "permissive": true,
          "roles": [
            "authenticated"
          ],
          "usingExpression": "(((status)::text = ANY ((ARRAY['sent'::character varying, 'paid'::character varying, 'cancelled'::character varying])::text[])) AND (EXISTS ( SELECT 1\n   FROM public.customers c\n  WHERE ((c.id = invoices.customer_id) AND public.customer_has_access(c.id, c.tenant_id)))))",
          "checkExpression": null
        },
        {
          "schema": "public",
          "table": "invoices",
          "name": "invoices_management_all",
          "command": "*",
          "permissive": true,
          "roles": [
            "authenticated"
          ],
          "usingExpression": "public.is_management_for_tenant(tenant_id)",
          "checkExpression": "public.is_management_for_tenant(tenant_id)"
        },
        {
          "schema": "public",
          "table": "object_contacts",
          "name": "fieldgrid_runtime_data_delete",
          "command": "d",
          "permissive": true,
          "roles": [
            "fieldgrid_runtime_data"
          ],
          "usingExpression": "true",
          "checkExpression": null
        },
        {
          "schema": "public",
          "table": "object_contacts",
          "name": "fieldgrid_runtime_data_insert",
          "command": "a",
          "permissive": true,
          "roles": [
            "fieldgrid_runtime_data"
          ],
          "usingExpression": null,
          "checkExpression": "true"
        },
        {
          "schema": "public",
          "table": "object_contacts",
          "name": "fieldgrid_runtime_data_select",
          "command": "r",
          "permissive": true,
          "roles": [
            "fieldgrid_runtime_data"
          ],
          "usingExpression": "true",
          "checkExpression": null
        },
        {
          "schema": "public",
          "table": "object_contacts",
          "name": "fieldgrid_runtime_data_update",
          "command": "w",
          "permissive": true,
          "roles": [
            "fieldgrid_runtime_data"
          ],
          "usingExpression": "true",
          "checkExpression": "true"
        },
        {
          "schema": "public",
          "table": "object_contacts",
          "name": "object_contacts_customer_users_delete",
          "command": "d",
          "permissive": true,
          "roles": [
            "authenticated"
          ],
          "usingExpression": "(EXISTS ( SELECT 1\n   FROM public.objects o\n  WHERE ((o.id = object_contacts.object_id) AND public.customer_has_access(o.customer_id, o.tenant_id))))",
          "checkExpression": null
        },
        {
          "schema": "public",
          "table": "object_contacts",
          "name": "object_contacts_customer_users_insert",
          "command": "a",
          "permissive": true,
          "roles": [
            "authenticated"
          ],
          "usingExpression": null,
          "checkExpression": "(EXISTS ( SELECT 1\n   FROM public.objects o\n  WHERE ((o.id = object_contacts.object_id) AND public.customer_has_access(o.customer_id, o.tenant_id))))"
        },
        {
          "schema": "public",
          "table": "object_contacts",
          "name": "object_contacts_customer_users_select",
          "command": "r",
          "permissive": true,
          "roles": [
            "authenticated"
          ],
          "usingExpression": "(EXISTS ( SELECT 1\n   FROM public.objects o\n  WHERE ((o.id = object_contacts.object_id) AND public.customer_has_access(o.customer_id, o.tenant_id))))",
          "checkExpression": null
        },
        {
          "schema": "public",
          "table": "object_contacts",
          "name": "object_contacts_customer_users_update",
          "command": "w",
          "permissive": true,
          "roles": [
            "authenticated"
          ],
          "usingExpression": "(EXISTS ( SELECT 1\n   FROM public.objects o\n  WHERE ((o.id = object_contacts.object_id) AND public.customer_has_access(o.customer_id, o.tenant_id))))",
          "checkExpression": "(EXISTS ( SELECT 1\n   FROM public.objects o\n  WHERE ((o.id = object_contacts.object_id) AND public.customer_has_access(o.customer_id, o.tenant_id))))"
        },
        {
          "schema": "public",
          "table": "object_contacts",
          "name": "object_contacts_management",
          "command": "*",
          "permissive": true,
          "roles": [
            "authenticated"
          ],
          "usingExpression": "(EXISTS ( SELECT 1\n   FROM public.objects o\n  WHERE ((o.id = object_contacts.object_id) AND public.is_management_for_tenant(o.tenant_id))))",
          "checkExpression": "(EXISTS ( SELECT 1\n   FROM public.objects o\n  WHERE ((o.id = object_contacts.object_id) AND public.is_management_for_tenant(o.tenant_id))))"
        },
        {
          "schema": "public",
          "table": "object_personnel",
          "name": "fieldgrid_runtime_data_delete",
          "command": "d",
          "permissive": true,
          "roles": [
            "fieldgrid_runtime_data"
          ],
          "usingExpression": "true",
          "checkExpression": null
        },
        {
          "schema": "public",
          "table": "object_personnel",
          "name": "fieldgrid_runtime_data_insert",
          "command": "a",
          "permissive": true,
          "roles": [
            "fieldgrid_runtime_data"
          ],
          "usingExpression": null,
          "checkExpression": "true"
        },
        {
          "schema": "public",
          "table": "object_personnel",
          "name": "fieldgrid_runtime_data_select",
          "command": "r",
          "permissive": true,
          "roles": [
            "fieldgrid_runtime_data"
          ],
          "usingExpression": "true",
          "checkExpression": null
        },
        {
          "schema": "public",
          "table": "object_personnel",
          "name": "object_personnel_management",
          "command": "*",
          "permissive": true,
          "roles": [
            "authenticated"
          ],
          "usingExpression": "(EXISTS ( SELECT 1\n   FROM (public.objects o\n     JOIN public.personnel p ON (((p.id = object_personnel.personnel_id) AND (p.tenant_id = o.tenant_id))))\n  WHERE ((o.id = object_personnel.object_id) AND public.is_management_for_tenant(o.tenant_id))))",
          "checkExpression": "(EXISTS ( SELECT 1\n   FROM (public.objects o\n     JOIN public.personnel p ON (((p.id = object_personnel.personnel_id) AND (p.tenant_id = o.tenant_id))))\n  WHERE ((o.id = object_personnel.object_id) AND public.is_management_for_tenant(o.tenant_id))))"
        },
        {
          "schema": "public",
          "table": "objects",
          "name": "fieldgrid_runtime_data_delete",
          "command": "d",
          "permissive": true,
          "roles": [
            "fieldgrid_runtime_data"
          ],
          "usingExpression": "true",
          "checkExpression": null
        },
        {
          "schema": "public",
          "table": "objects",
          "name": "fieldgrid_runtime_data_insert",
          "command": "a",
          "permissive": true,
          "roles": [
            "fieldgrid_runtime_data"
          ],
          "usingExpression": null,
          "checkExpression": "true"
        },
        {
          "schema": "public",
          "table": "objects",
          "name": "fieldgrid_runtime_data_select",
          "command": "r",
          "permissive": true,
          "roles": [
            "fieldgrid_runtime_data"
          ],
          "usingExpression": "true",
          "checkExpression": null
        },
        {
          "schema": "public",
          "table": "objects",
          "name": "fieldgrid_runtime_data_update",
          "command": "w",
          "permissive": true,
          "roles": [
            "fieldgrid_runtime_data"
          ],
          "usingExpression": "true",
          "checkExpression": "true"
        },
        {
          "schema": "public",
          "table": "objects",
          "name": "objects_customer_users_insert",
          "command": "a",
          "permissive": true,
          "roles": [
            "authenticated"
          ],
          "usingExpression": null,
          "checkExpression": "public.customer_has_access(customer_id, tenant_id)"
        },
        {
          "schema": "public",
          "table": "objects",
          "name": "objects_customer_users_select",
          "command": "r",
          "permissive": true,
          "roles": [
            "authenticated"
          ],
          "usingExpression": "public.customer_has_access(customer_id, tenant_id)",
          "checkExpression": null
        },
        {
          "schema": "public",
          "table": "objects",
          "name": "objects_customer_users_update",
          "command": "w",
          "permissive": true,
          "roles": [
            "authenticated"
          ],
          "usingExpression": "public.customer_has_access(customer_id, tenant_id)",
          "checkExpression": "public.customer_has_access(customer_id, tenant_id)"
        },
        {
          "schema": "public",
          "table": "objects",
          "name": "objects_management",
          "command": "*",
          "permissive": true,
          "roles": [
            "authenticated"
          ],
          "usingExpression": "public.is_management_for_tenant(tenant_id)",
          "checkExpression": "public.is_management_for_tenant(tenant_id)"
        },
        {
          "schema": "public",
          "table": "objects",
          "name": "personnel_select_assigned_objects",
          "command": "r",
          "permissive": true,
          "roles": [
            "authenticated"
          ],
          "usingExpression": "(EXISTS ( SELECT 1\n   FROM public.assignments a\n  WHERE ((a.object_id = objects.id) AND public.personnel_assigned_to_assignment(a.id))))",
          "checkExpression": null
        },
        {
          "schema": "public",
          "table": "payments",
          "name": "fieldgrid_runtime_data_insert",
          "command": "a",
          "permissive": true,
          "roles": [
            "fieldgrid_runtime_data"
          ],
          "usingExpression": null,
          "checkExpression": "true"
        },
        {
          "schema": "public",
          "table": "payments",
          "name": "fieldgrid_runtime_data_select",
          "command": "r",
          "permissive": true,
          "roles": [
            "fieldgrid_runtime_data"
          ],
          "usingExpression": "true",
          "checkExpression": null
        },
        {
          "schema": "public",
          "table": "payments",
          "name": "fieldgrid_runtime_data_update",
          "command": "w",
          "permissive": true,
          "roles": [
            "fieldgrid_runtime_data"
          ],
          "usingExpression": "true",
          "checkExpression": "true"
        },
        {
          "schema": "public",
          "table": "payments",
          "name": "owner_or_staff_read_payments",
          "command": "r",
          "permissive": true,
          "roles": [
            "authenticated"
          ],
          "usingExpression": "(EXISTS ( SELECT 1\n   FROM public.invoices i\n  WHERE ((i.id = payments.invoice_id) AND (i.tenant_id = payments.tenant_id) AND ((i.created_by = auth.uid()) OR public.is_management_for_tenant(i.tenant_id)))))",
          "checkExpression": null
        },
        {
          "schema": "public",
          "table": "payments",
          "name": "service_role_all_payments",
          "command": "*",
          "permissive": true,
          "roles": [
            "PUBLIC"
          ],
          "usingExpression": "(auth.role() = 'service_role'::text)",
          "checkExpression": "(auth.role() = 'service_role'::text)"
        },
        {
          "schema": "public",
          "table": "personnel",
          "name": "fieldgrid_runtime_data_delete",
          "command": "d",
          "permissive": true,
          "roles": [
            "fieldgrid_runtime_data"
          ],
          "usingExpression": "true",
          "checkExpression": null
        },
        {
          "schema": "public",
          "table": "personnel",
          "name": "fieldgrid_runtime_data_insert",
          "command": "a",
          "permissive": true,
          "roles": [
            "fieldgrid_runtime_data"
          ],
          "usingExpression": null,
          "checkExpression": "true"
        },
        {
          "schema": "public",
          "table": "personnel",
          "name": "fieldgrid_runtime_data_select",
          "command": "r",
          "permissive": true,
          "roles": [
            "fieldgrid_runtime_data"
          ],
          "usingExpression": "true",
          "checkExpression": null
        },
        {
          "schema": "public",
          "table": "personnel",
          "name": "fieldgrid_runtime_data_update",
          "command": "w",
          "permissive": true,
          "roles": [
            "fieldgrid_runtime_data"
          ],
          "usingExpression": "true",
          "checkExpression": "true"
        },
        {
          "schema": "public",
          "table": "personnel",
          "name": "personnel_management",
          "command": "*",
          "permissive": true,
          "roles": [
            "authenticated"
          ],
          "usingExpression": "public.is_management_for_tenant(tenant_id)",
          "checkExpression": "public.is_management_for_tenant(tenant_id)"
        },
        {
          "schema": "public",
          "table": "personnel",
          "name": "personnel_select_own",
          "command": "r",
          "permissive": true,
          "roles": [
            "authenticated"
          ],
          "usingExpression": "(user_id = auth.uid())",
          "checkExpression": null
        }
      ],
      "helpers": [
        {
          "schema": "public",
          "name": "customer_has_access",
          "argumentTypes": [
            "uuid",
            "uuid"
          ],
          "returnType": "bool",
          "body": "\n  SELECT EXISTS (\n    SELECT 1\n    FROM customer_users cu\n    WHERE cu.customer_id = p_customer_id\n      AND cu.tenant_id = p_tenant_id\n      AND cu.user_id = (SELECT auth.uid())\n      AND cu.status = 'active'\n  );\n",
          "language": "sql",
          "securityDefiner": false,
          "volatility": "s",
          "parallel": "u",
          "strict": false,
          "leakproof": false,
          "config": [
            "search_path=public, auth"
          ],
          "argNames": [
            "p_customer_id",
            "p_tenant_id"
          ],
          "defaultCount": 0,
          "ownerRelation": {
            "schema": "public",
            "table": "object_contacts"
          },
          "directAcl": [
            {
              "grantee": "$owner",
              "grantor": "$owner",
              "privilege": "EXECUTE",
              "grantable": false
            },
            {
              "grantee": "authenticated",
              "grantor": "$owner",
              "privilege": "EXECUTE",
              "grantable": false
            }
          ],
          "effectiveExecute": [
            {
              "role": "$owner",
              "allowed": true
            },
            {
              "role": "PUBLIC",
              "allowed": false
            },
            {
              "role": "anon",
              "allowed": false
            },
            {
              "role": "authenticated",
              "allowed": true
            },
            {
              "role": "service_role",
              "allowed": false
            },
            {
              "role": "fieldgrid_runtime_data",
              "allowed": false
            },
            {
              "role": "fieldgrid_runtime_app",
              "allowed": false
            }
          ]
        },
        {
          "schema": "public",
          "name": "personnel_assigned_to_assignment",
          "argumentTypes": [
            "uuid"
          ],
          "returnType": "bool",
          "body": "\n  SELECT\n    (SELECT auth.uid()) IS NOT NULL\n    AND EXISTS (\n      SELECT 1\n      FROM public.assignment_personnel ap\n      JOIN public.assignments a\n        ON a.id = ap.assignment_id\n      JOIN public.personnel p\n        ON p.id = ap.personnel_id\n      WHERE ap.assignment_id = p_assignment_id\n        AND ap.status = 'assigned'\n        AND p.user_id = (SELECT auth.uid())\n        AND p.is_active = true\n        AND p.tenant_id IS NOT NULL\n        AND a.tenant_id IS NOT NULL\n        AND p.tenant_id = a.tenant_id\n    );\n",
          "language": "sql",
          "securityDefiner": true,
          "volatility": "s",
          "parallel": "u",
          "strict": false,
          "leakproof": false,
          "config": [
            "search_path=pg_catalog, public, auth"
          ],
          "argNames": [
            "p_assignment_id"
          ],
          "defaultCount": 0,
          "ownerRelation": {
            "schema": "public",
            "table": "object_contacts"
          },
          "directAcl": [
            {
              "grantee": "$owner",
              "grantor": "$owner",
              "privilege": "EXECUTE",
              "grantable": false
            },
            {
              "grantee": "authenticated",
              "grantor": "$owner",
              "privilege": "EXECUTE",
              "grantable": false
            }
          ],
          "effectiveExecute": [
            {
              "role": "$owner",
              "allowed": true
            },
            {
              "role": "PUBLIC",
              "allowed": false
            },
            {
              "role": "anon",
              "allowed": false
            },
            {
              "role": "authenticated",
              "allowed": true
            },
            {
              "role": "service_role",
              "allowed": false
            },
            {
              "role": "fieldgrid_runtime_data",
              "allowed": false
            },
            {
              "role": "fieldgrid_runtime_app",
              "allowed": false
            }
          ]
        },
        {
          "schema": "public",
          "name": "fieldgrid_has_platform_permission",
          "argumentTypes": [
            "text"
          ],
          "returnType": "bool",
          "body": "\n  SELECT EXISTS (\n    SELECT 1 FROM public.platform_users pu\n    WHERE pu.user_id = auth.uid() AND pu.status = 'active'\n      AND (\n        pu.role = 'owner'\n        OR (pu.role = 'admin' AND p_permission = ANY (ARRAY[\n          'global.rbac.manage', 'global.reference.manage', 'global.content.manage',\n          'platform.tenants.read', 'platform.audit.read'\n        ]))\n      )\n  );\n",
          "language": "sql",
          "securityDefiner": true,
          "volatility": "s",
          "parallel": "u",
          "strict": false,
          "leakproof": false,
          "config": [
            "search_path=pg_catalog, public, pg_temp"
          ],
          "argNames": [
            "p_permission"
          ],
          "defaultCount": 0,
          "ownerRelation": {
            "schema": "public",
            "table": "object_contacts"
          },
          "directAcl": [
            {
              "grantee": "$owner",
              "grantor": "$owner",
              "privilege": "EXECUTE",
              "grantable": false
            },
            {
              "grantee": "authenticated",
              "grantor": "$owner",
              "privilege": "EXECUTE",
              "grantable": false
            }
          ],
          "effectiveExecute": [
            {
              "role": "$owner",
              "allowed": true
            },
            {
              "role": "PUBLIC",
              "allowed": false
            },
            {
              "role": "anon",
              "allowed": false
            },
            {
              "role": "authenticated",
              "allowed": true
            },
            {
              "role": "service_role",
              "allowed": false
            },
            {
              "role": "fieldgrid_runtime_data",
              "allowed": false
            },
            {
              "role": "fieldgrid_runtime_app",
              "allowed": false
            }
          ]
        },
        {
          "schema": "auth",
          "name": "uid",
          "argumentTypes": [],
          "returnType": "uuid",
          "body": "\n  select \n  coalesce(\n    nullif(current_setting('request.jwt.claim.sub', true), ''),\n    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')\n  )::uuid\n",
          "language": "sql",
          "securityDefiner": false,
          "volatility": "s",
          "parallel": "u",
          "strict": false,
          "leakproof": false,
          "config": null,
          "argNames": null,
          "defaultCount": 0,
          "ownerRelation": {
            "schema": "auth",
            "table": "users"
          },
          "directAcl": [
            {
              "grantee": "$owner",
              "grantor": "$owner",
              "privilege": "EXECUTE",
              "grantable": false
            },
            {
              "grantee": "PUBLIC",
              "grantor": "$owner",
              "privilege": "EXECUTE",
              "grantable": false
            },
            {
              "grantee": "postgres",
              "grantor": "$owner",
              "privilege": "EXECUTE",
              "grantable": false
            },
            {
              "grantee": "dashboard_user",
              "grantor": "$owner",
              "privilege": "EXECUTE",
              "grantable": false
            }
          ],
          "effectiveExecute": [
            {
              "role": "$owner",
              "allowed": true
            },
            {
              "role": "PUBLIC",
              "allowed": true
            },
            {
              "role": "anon",
              "allowed": true
            },
            {
              "role": "authenticated",
              "allowed": true
            },
            {
              "role": "service_role",
              "allowed": true
            },
            {
              "role": "fieldgrid_runtime_data",
              "allowed": true
            },
            {
              "role": "fieldgrid_runtime_app",
              "allowed": true
            }
          ]
        },
        {
          "schema": "auth",
          "name": "role",
          "argumentTypes": [],
          "returnType": "text",
          "body": "\n  select \n  coalesce(\n    nullif(current_setting('request.jwt.claim.role', true), ''),\n    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')\n  )::text\n",
          "language": "sql",
          "securityDefiner": false,
          "volatility": "s",
          "parallel": "u",
          "strict": false,
          "leakproof": false,
          "config": null,
          "argNames": null,
          "defaultCount": 0,
          "ownerRelation": {
            "schema": "auth",
            "table": "users"
          },
          "directAcl": [
            {
              "grantee": "$owner",
              "grantor": "$owner",
              "privilege": "EXECUTE",
              "grantable": false
            },
            {
              "grantee": "PUBLIC",
              "grantor": "$owner",
              "privilege": "EXECUTE",
              "grantable": false
            },
            {
              "grantee": "postgres",
              "grantor": "$owner",
              "privilege": "EXECUTE",
              "grantable": false
            },
            {
              "grantee": "dashboard_user",
              "grantor": "$owner",
              "privilege": "EXECUTE",
              "grantable": false
            }
          ],
          "effectiveExecute": [
            {
              "role": "$owner",
              "allowed": true
            },
            {
              "role": "PUBLIC",
              "allowed": true
            },
            {
              "role": "anon",
              "allowed": true
            },
            {
              "role": "authenticated",
              "allowed": true
            },
            {
              "role": "service_role",
              "allowed": true
            },
            {
              "role": "fieldgrid_runtime_data",
              "allowed": true
            },
            {
              "role": "fieldgrid_runtime_app",
              "allowed": true
            }
          ]
        }
      ]
    }
  },
  {
    "state": "clean",
    "profile": "hostedProvider",
    "manifest": {
      "version": 1,
      "postgresMajor": 17,
      "sources": [
        {
          "path": "lib/db/migrations/002_sprint1_rls.sql",
          "sha256": "16a27aa61943516314b9800d7b37a08eeb9c64441a5994c7da3f9badf7265238"
        },
        {
          "path": "lib/db/migrations/025_platform_schema_extensions.sql",
          "sha256": "8a57d65ba11e3122f897498093d1351f0cf57a2f1940850e266bbfc54c0b3636"
        },
        {
          "path": "lib/db/migrations/037_tenant_customer_users_events_hardening.sql",
          "sha256": "03a1ad0cbf406140c64b53da422abb62a45a6e0e9fb68832a8328ca6685d0b0e"
        },
        {
          "path": "lib/db/migrations/051_final_security_boundaries.sql",
          "sha256": "64f12a61bbd19cfbf4ec854c31560717bef4219433b03c09055f3f6f070181ff"
        },
        {
          "path": "lib/db/migrations/062_finance_reports_tenant_scope.sql",
          "sha256": "0ff1e8fcc5e0a3c7674ed084e6058e1a538ca0fed13e02f469fb0d363e055fbe"
        },
        {
          "path": "lib/db/migrations/063_payments_batches_audit_tenant_scope.sql",
          "sha256": "171caa7e6a8d4a8f624e475dc234d21b6c81e1e38802ddad3db778047f2053d2"
        },
        {
          "path": "lib/db/migrations/20260710200000_invoice_canon_credit_collection_payments.sql",
          "sha256": "78fc35f49a80a69ad7a7fe0dfc23c264dff2aba0fbfc49f702b3a7a74d1bc23f"
        },
        {
          "path": "lib/db/migrations/20260714120000_assignment_personnel_phase_b_direct_access_close.sql",
          "sha256": "7be5f0c1999d6eaadb22735d2243322d8aada1e64e3c4c44c4a3bc11d8317574"
        },
        {
          "path": "lib/db/migrations/20260718190000_phase2_security_reconciliation.sql",
          "sha256": "6cf0da37eec7c1b5b57c8218593873fedf1fae2a832b27e138dfd2614b861964"
        },
        {
          "path": "lib/db/migrations/20260909120000_runtime_least_privilege_principals.sql",
          "sha256": "2eaf25923d7908c94d1fb96c7fbede14858330d86be21656f50d611fe37e0066"
        },
        {
          "path": "migrations/013_sprint5_payments.sql",
          "sha256": "ea6d0e71764e92d0a0f0ad2d09a6bdf6c864c2a64d1ef717743b567d15198102"
        },
        {
          "path": "migrations/023_objects_extended.sql",
          "sha256": "19e20f3463f220a123450cefec79dc7490d5074c72f1a3f726ddfd1a28dde6ae"
        },
        {
          "path": "scripts/fieldgrid-runtime-safety-setup.mjs",
          "sha256": "f43d159c3e047bd752642e8005793df40314873a772c16c95eca7195f5c34666"
        },
        {
          "path": "tests/fixtures/fieldgrid-supabase-auth-functions.sql",
          "sha256": "5b72022d73e64a8e474d2122ac42f299bb7ce4d59755cdcc78e72abfe5d47dc0"
        }
      ],
      "relations": [
        {
          "schema": "public",
          "table": "invoices",
          "kind": "r",
          "rowSecurity": true,
          "forceRowSecurity": false,
          "columns": [
            {
              "name": "created_by",
              "notNull": false,
              "typeName": "uuid",
              "typeModifier": -1
            },
            {
              "name": "id",
              "notNull": true,
              "typeName": "uuid",
              "typeModifier": -1
            },
            {
              "name": "tenant_id",
              "notNull": true,
              "typeName": "uuid",
              "typeModifier": -1
            }
          ]
        },
        {
          "schema": "public",
          "table": "object_contacts",
          "kind": "r",
          "rowSecurity": true,
          "forceRowSecurity": false,
          "columns": [
            {
              "name": "id",
              "notNull": true,
              "typeName": "uuid",
              "typeModifier": -1
            },
            {
              "name": "object_id",
              "notNull": true,
              "typeName": "uuid",
              "typeModifier": -1
            }
          ]
        },
        {
          "schema": "public",
          "table": "object_personnel",
          "kind": "r",
          "rowSecurity": true,
          "forceRowSecurity": false,
          "columns": [
            {
              "name": "object_id",
              "notNull": true,
              "typeName": "uuid",
              "typeModifier": -1
            },
            {
              "name": "personnel_id",
              "notNull": true,
              "typeName": "uuid",
              "typeModifier": -1
            }
          ]
        },
        {
          "schema": "public",
          "table": "objects",
          "kind": "r",
          "rowSecurity": true,
          "forceRowSecurity": false,
          "columns": [
            {
              "name": "id",
              "notNull": true,
              "typeName": "uuid",
              "typeModifier": -1
            },
            {
              "name": "tenant_id",
              "notNull": true,
              "typeName": "uuid",
              "typeModifier": -1
            }
          ]
        },
        {
          "schema": "public",
          "table": "payments",
          "kind": "r",
          "rowSecurity": true,
          "forceRowSecurity": false,
          "columns": [
            {
              "name": "id",
              "notNull": true,
              "typeName": "uuid",
              "typeModifier": -1
            },
            {
              "name": "invoice_id",
              "notNull": false,
              "typeName": "uuid",
              "typeModifier": -1
            },
            {
              "name": "tenant_id",
              "notNull": true,
              "typeName": "uuid",
              "typeModifier": -1
            }
          ]
        },
        {
          "schema": "public",
          "table": "personnel",
          "kind": "r",
          "rowSecurity": true,
          "forceRowSecurity": false,
          "columns": [
            {
              "name": "id",
              "notNull": true,
              "typeName": "uuid",
              "typeModifier": -1
            },
            {
              "name": "tenant_id",
              "notNull": true,
              "typeName": "uuid",
              "typeModifier": -1
            }
          ]
        }
      ],
      "policies": [
        {
          "schema": "public",
          "table": "invoices",
          "name": "fieldgrid_runtime_data_insert",
          "command": "a",
          "permissive": true,
          "roles": [
            "fieldgrid_runtime_data"
          ],
          "usingExpression": null,
          "checkExpression": "true"
        },
        {
          "schema": "public",
          "table": "invoices",
          "name": "fieldgrid_runtime_data_select",
          "command": "r",
          "permissive": true,
          "roles": [
            "fieldgrid_runtime_data"
          ],
          "usingExpression": "true",
          "checkExpression": null
        },
        {
          "schema": "public",
          "table": "invoices",
          "name": "fieldgrid_runtime_data_update",
          "command": "w",
          "permissive": true,
          "roles": [
            "fieldgrid_runtime_data"
          ],
          "usingExpression": "true",
          "checkExpression": "true"
        },
        {
          "schema": "public",
          "table": "invoices",
          "name": "invoices_customer_sent_select",
          "command": "r",
          "permissive": true,
          "roles": [
            "authenticated"
          ],
          "usingExpression": "(((status)::text = ANY ((ARRAY['sent'::character varying, 'paid'::character varying, 'cancelled'::character varying])::text[])) AND (EXISTS ( SELECT 1\n   FROM public.customers c\n  WHERE ((c.id = invoices.customer_id) AND public.customer_has_access(c.id, c.tenant_id)))))",
          "checkExpression": null
        },
        {
          "schema": "public",
          "table": "invoices",
          "name": "invoices_management_all",
          "command": "*",
          "permissive": true,
          "roles": [
            "authenticated"
          ],
          "usingExpression": "public.is_management_for_tenant(tenant_id)",
          "checkExpression": "public.is_management_for_tenant(tenant_id)"
        },
        {
          "schema": "public",
          "table": "object_contacts",
          "name": "fieldgrid_runtime_data_delete",
          "command": "d",
          "permissive": true,
          "roles": [
            "fieldgrid_runtime_data"
          ],
          "usingExpression": "true",
          "checkExpression": null
        },
        {
          "schema": "public",
          "table": "object_contacts",
          "name": "fieldgrid_runtime_data_insert",
          "command": "a",
          "permissive": true,
          "roles": [
            "fieldgrid_runtime_data"
          ],
          "usingExpression": null,
          "checkExpression": "true"
        },
        {
          "schema": "public",
          "table": "object_contacts",
          "name": "fieldgrid_runtime_data_select",
          "command": "r",
          "permissive": true,
          "roles": [
            "fieldgrid_runtime_data"
          ],
          "usingExpression": "true",
          "checkExpression": null
        },
        {
          "schema": "public",
          "table": "object_contacts",
          "name": "fieldgrid_runtime_data_update",
          "command": "w",
          "permissive": true,
          "roles": [
            "fieldgrid_runtime_data"
          ],
          "usingExpression": "true",
          "checkExpression": "true"
        },
        {
          "schema": "public",
          "table": "object_contacts",
          "name": "object_contacts_customer_users_delete",
          "command": "d",
          "permissive": true,
          "roles": [
            "authenticated"
          ],
          "usingExpression": "(EXISTS ( SELECT 1\n   FROM public.objects o\n  WHERE ((o.id = object_contacts.object_id) AND public.customer_has_access(o.customer_id, o.tenant_id))))",
          "checkExpression": null
        },
        {
          "schema": "public",
          "table": "object_contacts",
          "name": "object_contacts_customer_users_insert",
          "command": "a",
          "permissive": true,
          "roles": [
            "authenticated"
          ],
          "usingExpression": null,
          "checkExpression": "(EXISTS ( SELECT 1\n   FROM public.objects o\n  WHERE ((o.id = object_contacts.object_id) AND public.customer_has_access(o.customer_id, o.tenant_id))))"
        },
        {
          "schema": "public",
          "table": "object_contacts",
          "name": "object_contacts_customer_users_select",
          "command": "r",
          "permissive": true,
          "roles": [
            "authenticated"
          ],
          "usingExpression": "(EXISTS ( SELECT 1\n   FROM public.objects o\n  WHERE ((o.id = object_contacts.object_id) AND public.customer_has_access(o.customer_id, o.tenant_id))))",
          "checkExpression": null
        },
        {
          "schema": "public",
          "table": "object_contacts",
          "name": "object_contacts_customer_users_update",
          "command": "w",
          "permissive": true,
          "roles": [
            "authenticated"
          ],
          "usingExpression": "(EXISTS ( SELECT 1\n   FROM public.objects o\n  WHERE ((o.id = object_contacts.object_id) AND public.customer_has_access(o.customer_id, o.tenant_id))))",
          "checkExpression": "(EXISTS ( SELECT 1\n   FROM public.objects o\n  WHERE ((o.id = object_contacts.object_id) AND public.customer_has_access(o.customer_id, o.tenant_id))))"
        },
        {
          "schema": "public",
          "table": "object_contacts",
          "name": "object_contacts_management",
          "command": "*",
          "permissive": true,
          "roles": [
            "authenticated"
          ],
          "usingExpression": "(EXISTS ( SELECT 1\n   FROM public.objects o\n  WHERE ((o.id = object_contacts.object_id) AND public.is_management_for_tenant(o.tenant_id))))",
          "checkExpression": "(EXISTS ( SELECT 1\n   FROM public.objects o\n  WHERE ((o.id = object_contacts.object_id) AND public.is_management_for_tenant(o.tenant_id))))"
        },
        {
          "schema": "public",
          "table": "object_personnel",
          "name": "fieldgrid_runtime_data_delete",
          "command": "d",
          "permissive": true,
          "roles": [
            "fieldgrid_runtime_data"
          ],
          "usingExpression": "true",
          "checkExpression": null
        },
        {
          "schema": "public",
          "table": "object_personnel",
          "name": "fieldgrid_runtime_data_insert",
          "command": "a",
          "permissive": true,
          "roles": [
            "fieldgrid_runtime_data"
          ],
          "usingExpression": null,
          "checkExpression": "true"
        },
        {
          "schema": "public",
          "table": "object_personnel",
          "name": "fieldgrid_runtime_data_select",
          "command": "r",
          "permissive": true,
          "roles": [
            "fieldgrid_runtime_data"
          ],
          "usingExpression": "true",
          "checkExpression": null
        },
        {
          "schema": "public",
          "table": "object_personnel",
          "name": "object_personnel_management",
          "command": "*",
          "permissive": true,
          "roles": [
            "authenticated"
          ],
          "usingExpression": "(EXISTS ( SELECT 1\n   FROM public.objects o\n  WHERE ((o.id = object_personnel.object_id) AND public.is_management_for_tenant(o.tenant_id))))",
          "checkExpression": "(EXISTS ( SELECT 1\n   FROM public.objects o\n  WHERE ((o.id = object_personnel.object_id) AND public.is_management_for_tenant(o.tenant_id))))"
        },
        {
          "schema": "public",
          "table": "objects",
          "name": "fieldgrid_runtime_data_delete",
          "command": "d",
          "permissive": true,
          "roles": [
            "fieldgrid_runtime_data"
          ],
          "usingExpression": "true",
          "checkExpression": null
        },
        {
          "schema": "public",
          "table": "objects",
          "name": "fieldgrid_runtime_data_insert",
          "command": "a",
          "permissive": true,
          "roles": [
            "fieldgrid_runtime_data"
          ],
          "usingExpression": null,
          "checkExpression": "true"
        },
        {
          "schema": "public",
          "table": "objects",
          "name": "fieldgrid_runtime_data_select",
          "command": "r",
          "permissive": true,
          "roles": [
            "fieldgrid_runtime_data"
          ],
          "usingExpression": "true",
          "checkExpression": null
        },
        {
          "schema": "public",
          "table": "objects",
          "name": "fieldgrid_runtime_data_update",
          "command": "w",
          "permissive": true,
          "roles": [
            "fieldgrid_runtime_data"
          ],
          "usingExpression": "true",
          "checkExpression": "true"
        },
        {
          "schema": "public",
          "table": "objects",
          "name": "objects_customer_users_insert",
          "command": "a",
          "permissive": true,
          "roles": [
            "authenticated"
          ],
          "usingExpression": null,
          "checkExpression": "public.customer_has_access(customer_id, tenant_id)"
        },
        {
          "schema": "public",
          "table": "objects",
          "name": "objects_customer_users_select",
          "command": "r",
          "permissive": true,
          "roles": [
            "authenticated"
          ],
          "usingExpression": "public.customer_has_access(customer_id, tenant_id)",
          "checkExpression": null
        },
        {
          "schema": "public",
          "table": "objects",
          "name": "objects_customer_users_update",
          "command": "w",
          "permissive": true,
          "roles": [
            "authenticated"
          ],
          "usingExpression": "public.customer_has_access(customer_id, tenant_id)",
          "checkExpression": "public.customer_has_access(customer_id, tenant_id)"
        },
        {
          "schema": "public",
          "table": "objects",
          "name": "objects_management",
          "command": "*",
          "permissive": true,
          "roles": [
            "authenticated"
          ],
          "usingExpression": "public.is_management_for_tenant(tenant_id)",
          "checkExpression": "public.is_management_for_tenant(tenant_id)"
        },
        {
          "schema": "public",
          "table": "objects",
          "name": "personnel_select_assigned_objects",
          "command": "r",
          "permissive": true,
          "roles": [
            "authenticated"
          ],
          "usingExpression": "(EXISTS ( SELECT 1\n   FROM public.assignments a\n  WHERE ((a.object_id = objects.id) AND public.personnel_assigned_to_assignment(a.id))))",
          "checkExpression": null
        },
        {
          "schema": "public",
          "table": "payments",
          "name": "fieldgrid_runtime_data_insert",
          "command": "a",
          "permissive": true,
          "roles": [
            "fieldgrid_runtime_data"
          ],
          "usingExpression": null,
          "checkExpression": "true"
        },
        {
          "schema": "public",
          "table": "payments",
          "name": "fieldgrid_runtime_data_select",
          "command": "r",
          "permissive": true,
          "roles": [
            "fieldgrid_runtime_data"
          ],
          "usingExpression": "true",
          "checkExpression": null
        },
        {
          "schema": "public",
          "table": "payments",
          "name": "fieldgrid_runtime_data_update",
          "command": "w",
          "permissive": true,
          "roles": [
            "fieldgrid_runtime_data"
          ],
          "usingExpression": "true",
          "checkExpression": "true"
        },
        {
          "schema": "public",
          "table": "personnel",
          "name": "fieldgrid_runtime_data_delete",
          "command": "d",
          "permissive": true,
          "roles": [
            "fieldgrid_runtime_data"
          ],
          "usingExpression": "true",
          "checkExpression": null
        },
        {
          "schema": "public",
          "table": "personnel",
          "name": "fieldgrid_runtime_data_insert",
          "command": "a",
          "permissive": true,
          "roles": [
            "fieldgrid_runtime_data"
          ],
          "usingExpression": null,
          "checkExpression": "true"
        },
        {
          "schema": "public",
          "table": "personnel",
          "name": "fieldgrid_runtime_data_select",
          "command": "r",
          "permissive": true,
          "roles": [
            "fieldgrid_runtime_data"
          ],
          "usingExpression": "true",
          "checkExpression": null
        },
        {
          "schema": "public",
          "table": "personnel",
          "name": "fieldgrid_runtime_data_update",
          "command": "w",
          "permissive": true,
          "roles": [
            "fieldgrid_runtime_data"
          ],
          "usingExpression": "true",
          "checkExpression": "true"
        },
        {
          "schema": "public",
          "table": "personnel",
          "name": "personnel_management",
          "command": "*",
          "permissive": true,
          "roles": [
            "authenticated"
          ],
          "usingExpression": "public.is_management_for_tenant(tenant_id)",
          "checkExpression": "public.is_management_for_tenant(tenant_id)"
        },
        {
          "schema": "public",
          "table": "personnel",
          "name": "personnel_select_own",
          "command": "r",
          "permissive": true,
          "roles": [
            "authenticated"
          ],
          "usingExpression": "(user_id = auth.uid())",
          "checkExpression": null
        }
      ],
      "helpers": [
        {
          "schema": "public",
          "name": "customer_has_access",
          "argumentTypes": [
            "uuid",
            "uuid"
          ],
          "returnType": "bool",
          "body": "\n  SELECT EXISTS (\n    SELECT 1\n    FROM customer_users cu\n    WHERE cu.customer_id = p_customer_id\n      AND cu.tenant_id = p_tenant_id\n      AND cu.user_id = (SELECT auth.uid())\n      AND cu.status = 'active'\n  );\n",
          "language": "sql",
          "securityDefiner": false,
          "volatility": "s",
          "parallel": "u",
          "strict": false,
          "leakproof": false,
          "config": [
            "search_path=public, auth"
          ],
          "argNames": [
            "p_customer_id",
            "p_tenant_id"
          ],
          "defaultCount": 0,
          "ownerRelation": {
            "schema": "public",
            "table": "object_contacts"
          },
          "directAcl": [
            {
              "grantee": "$owner",
              "grantor": "$owner",
              "privilege": "EXECUTE",
              "grantable": false
            },
            {
              "grantee": "authenticated",
              "grantor": "$owner",
              "privilege": "EXECUTE",
              "grantable": false
            }
          ],
          "effectiveExecute": [
            {
              "role": "$owner",
              "allowed": true
            },
            {
              "role": "PUBLIC",
              "allowed": false
            },
            {
              "role": "anon",
              "allowed": false
            },
            {
              "role": "authenticated",
              "allowed": true
            },
            {
              "role": "service_role",
              "allowed": false
            },
            {
              "role": "fieldgrid_runtime_data",
              "allowed": false
            },
            {
              "role": "fieldgrid_runtime_app",
              "allowed": false
            }
          ]
        },
        {
          "schema": "public",
          "name": "personnel_assigned_to_assignment",
          "argumentTypes": [
            "uuid"
          ],
          "returnType": "bool",
          "body": "\n  SELECT\n    (SELECT auth.uid()) IS NOT NULL\n    AND EXISTS (\n      SELECT 1\n      FROM public.assignment_personnel ap\n      JOIN public.assignments a\n        ON a.id = ap.assignment_id\n      JOIN public.personnel p\n        ON p.id = ap.personnel_id\n      WHERE ap.assignment_id = p_assignment_id\n        AND ap.status = 'assigned'\n        AND p.user_id = (SELECT auth.uid())\n        AND p.is_active = true\n        AND p.tenant_id IS NOT NULL\n        AND a.tenant_id IS NOT NULL\n        AND p.tenant_id = a.tenant_id\n    );\n",
          "language": "sql",
          "securityDefiner": true,
          "volatility": "s",
          "parallel": "u",
          "strict": false,
          "leakproof": false,
          "config": [
            "search_path=pg_catalog, public, auth"
          ],
          "argNames": [
            "p_assignment_id"
          ],
          "defaultCount": 0,
          "ownerRelation": {
            "schema": "public",
            "table": "object_contacts"
          },
          "directAcl": [
            {
              "grantee": "$owner",
              "grantor": "$owner",
              "privilege": "EXECUTE",
              "grantable": false
            },
            {
              "grantee": "authenticated",
              "grantor": "$owner",
              "privilege": "EXECUTE",
              "grantable": false
            }
          ],
          "effectiveExecute": [
            {
              "role": "$owner",
              "allowed": true
            },
            {
              "role": "PUBLIC",
              "allowed": false
            },
            {
              "role": "anon",
              "allowed": false
            },
            {
              "role": "authenticated",
              "allowed": true
            },
            {
              "role": "service_role",
              "allowed": false
            },
            {
              "role": "fieldgrid_runtime_data",
              "allowed": false
            },
            {
              "role": "fieldgrid_runtime_app",
              "allowed": false
            }
          ]
        },
        {
          "schema": "public",
          "name": "fieldgrid_has_platform_permission",
          "argumentTypes": [
            "text"
          ],
          "returnType": "bool",
          "body": "\n  SELECT EXISTS (\n    SELECT 1 FROM public.platform_users pu\n    WHERE pu.user_id = auth.uid() AND pu.status = 'active'\n      AND (\n        pu.role = 'owner'\n        OR (pu.role = 'admin' AND p_permission = ANY (ARRAY[\n          'global.rbac.manage', 'global.reference.manage', 'global.content.manage',\n          'platform.tenants.read', 'platform.audit.read'\n        ]))\n      )\n  );\n",
          "language": "sql",
          "securityDefiner": true,
          "volatility": "s",
          "parallel": "u",
          "strict": false,
          "leakproof": false,
          "config": [
            "search_path=pg_catalog, public, pg_temp"
          ],
          "argNames": [
            "p_permission"
          ],
          "defaultCount": 0,
          "ownerRelation": {
            "schema": "public",
            "table": "object_contacts"
          },
          "directAcl": [
            {
              "grantee": "$owner",
              "grantor": "$owner",
              "privilege": "EXECUTE",
              "grantable": false
            },
            {
              "grantee": "authenticated",
              "grantor": "$owner",
              "privilege": "EXECUTE",
              "grantable": false
            }
          ],
          "effectiveExecute": [
            {
              "role": "$owner",
              "allowed": true
            },
            {
              "role": "PUBLIC",
              "allowed": false
            },
            {
              "role": "anon",
              "allowed": false
            },
            {
              "role": "authenticated",
              "allowed": true
            },
            {
              "role": "service_role",
              "allowed": false
            },
            {
              "role": "fieldgrid_runtime_data",
              "allowed": false
            },
            {
              "role": "fieldgrid_runtime_app",
              "allowed": false
            }
          ]
        },
        {
          "schema": "auth",
          "name": "uid",
          "argumentTypes": [],
          "returnType": "uuid",
          "body": "\n  select \n  coalesce(\n    nullif(current_setting('request.jwt.claim.sub', true), ''),\n    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')\n  )::uuid\n",
          "language": "sql",
          "securityDefiner": false,
          "volatility": "s",
          "parallel": "u",
          "strict": false,
          "leakproof": false,
          "config": null,
          "argNames": null,
          "defaultCount": 0,
          "ownerRelation": {
            "schema": "auth",
            "table": "users"
          },
          "directAcl": [
            {
              "grantee": "$owner",
              "grantor": "$owner",
              "privilege": "EXECUTE",
              "grantable": false
            },
            {
              "grantee": "PUBLIC",
              "grantor": "$owner",
              "privilege": "EXECUTE",
              "grantable": false
            },
            {
              "grantee": "dashboard_user",
              "grantor": "$owner",
              "privilege": "EXECUTE",
              "grantable": false
            }
          ],
          "effectiveExecute": [
            {
              "role": "$owner",
              "allowed": true
            },
            {
              "role": "PUBLIC",
              "allowed": true
            },
            {
              "role": "anon",
              "allowed": true
            },
            {
              "role": "authenticated",
              "allowed": true
            },
            {
              "role": "service_role",
              "allowed": true
            },
            {
              "role": "fieldgrid_runtime_data",
              "allowed": true
            },
            {
              "role": "fieldgrid_runtime_app",
              "allowed": true
            }
          ]
        }
      ]
    }
  },
  {
    "state": "targetClean",
    "profile": "hostedProvider",
    "manifest": {
      "version": 1,
      "postgresMajor": 17,
      "sources": [
        {
          "path": "lib/db/migrations/002_sprint1_rls.sql",
          "sha256": "16a27aa61943516314b9800d7b37a08eeb9c64441a5994c7da3f9badf7265238"
        },
        {
          "path": "lib/db/migrations/025_platform_schema_extensions.sql",
          "sha256": "8a57d65ba11e3122f897498093d1351f0cf57a2f1940850e266bbfc54c0b3636"
        },
        {
          "path": "lib/db/migrations/037_tenant_customer_users_events_hardening.sql",
          "sha256": "03a1ad0cbf406140c64b53da422abb62a45a6e0e9fb68832a8328ca6685d0b0e"
        },
        {
          "path": "lib/db/migrations/051_final_security_boundaries.sql",
          "sha256": "64f12a61bbd19cfbf4ec854c31560717bef4219433b03c09055f3f6f070181ff"
        },
        {
          "path": "lib/db/migrations/062_finance_reports_tenant_scope.sql",
          "sha256": "0ff1e8fcc5e0a3c7674ed084e6058e1a538ca0fed13e02f469fb0d363e055fbe"
        },
        {
          "path": "lib/db/migrations/063_payments_batches_audit_tenant_scope.sql",
          "sha256": "171caa7e6a8d4a8f624e475dc234d21b6c81e1e38802ddad3db778047f2053d2"
        },
        {
          "path": "lib/db/migrations/20260710200000_invoice_canon_credit_collection_payments.sql",
          "sha256": "78fc35f49a80a69ad7a7fe0dfc23c264dff2aba0fbfc49f702b3a7a74d1bc23f"
        },
        {
          "path": "lib/db/migrations/20260714120000_assignment_personnel_phase_b_direct_access_close.sql",
          "sha256": "7be5f0c1999d6eaadb22735d2243322d8aada1e64e3c4c44c4a3bc11d8317574"
        },
        {
          "path": "lib/db/migrations/20260718190000_phase2_security_reconciliation.sql",
          "sha256": "6cf0da37eec7c1b5b57c8218593873fedf1fae2a832b27e138dfd2614b861964"
        },
        {
          "path": "lib/db/migrations/20260909120000_runtime_least_privilege_principals.sql",
          "sha256": "2eaf25923d7908c94d1fb96c7fbede14858330d86be21656f50d611fe37e0066"
        },
        {
          "path": "migrations/013_sprint5_payments.sql",
          "sha256": "ea6d0e71764e92d0a0f0ad2d09a6bdf6c864c2a64d1ef717743b567d15198102"
        },
        {
          "path": "migrations/023_objects_extended.sql",
          "sha256": "19e20f3463f220a123450cefec79dc7490d5074c72f1a3f726ddfd1a28dde6ae"
        },
        {
          "path": "scripts/fieldgrid-runtime-safety-setup.mjs",
          "sha256": "f43d159c3e047bd752642e8005793df40314873a772c16c95eca7195f5c34666"
        },
        {
          "path": "tests/fixtures/fieldgrid-supabase-auth-functions.sql",
          "sha256": "5b72022d73e64a8e474d2122ac42f299bb7ce4d59755cdcc78e72abfe5d47dc0"
        }
      ],
      "relations": [
        {
          "schema": "public",
          "table": "invoices",
          "kind": "r",
          "rowSecurity": true,
          "forceRowSecurity": false,
          "columns": [
            {
              "name": "created_by",
              "notNull": false,
              "typeName": "uuid",
              "typeModifier": -1
            },
            {
              "name": "id",
              "notNull": true,
              "typeName": "uuid",
              "typeModifier": -1
            },
            {
              "name": "tenant_id",
              "notNull": true,
              "typeName": "uuid",
              "typeModifier": -1
            }
          ]
        },
        {
          "schema": "public",
          "table": "object_contacts",
          "kind": "r",
          "rowSecurity": true,
          "forceRowSecurity": false,
          "columns": [
            {
              "name": "id",
              "notNull": true,
              "typeName": "uuid",
              "typeModifier": -1
            },
            {
              "name": "object_id",
              "notNull": true,
              "typeName": "uuid",
              "typeModifier": -1
            }
          ]
        },
        {
          "schema": "public",
          "table": "object_personnel",
          "kind": "r",
          "rowSecurity": true,
          "forceRowSecurity": false,
          "columns": [
            {
              "name": "object_id",
              "notNull": true,
              "typeName": "uuid",
              "typeModifier": -1
            },
            {
              "name": "personnel_id",
              "notNull": true,
              "typeName": "uuid",
              "typeModifier": -1
            }
          ]
        },
        {
          "schema": "public",
          "table": "objects",
          "kind": "r",
          "rowSecurity": true,
          "forceRowSecurity": false,
          "columns": [
            {
              "name": "id",
              "notNull": true,
              "typeName": "uuid",
              "typeModifier": -1
            },
            {
              "name": "tenant_id",
              "notNull": true,
              "typeName": "uuid",
              "typeModifier": -1
            }
          ]
        },
        {
          "schema": "public",
          "table": "payments",
          "kind": "r",
          "rowSecurity": true,
          "forceRowSecurity": false,
          "columns": [
            {
              "name": "id",
              "notNull": true,
              "typeName": "uuid",
              "typeModifier": -1
            },
            {
              "name": "invoice_id",
              "notNull": false,
              "typeName": "uuid",
              "typeModifier": -1
            },
            {
              "name": "tenant_id",
              "notNull": true,
              "typeName": "uuid",
              "typeModifier": -1
            }
          ]
        },
        {
          "schema": "public",
          "table": "personnel",
          "kind": "r",
          "rowSecurity": true,
          "forceRowSecurity": false,
          "columns": [
            {
              "name": "id",
              "notNull": true,
              "typeName": "uuid",
              "typeModifier": -1
            },
            {
              "name": "tenant_id",
              "notNull": true,
              "typeName": "uuid",
              "typeModifier": -1
            }
          ]
        }
      ],
      "policies": [
        {
          "schema": "public",
          "table": "invoices",
          "name": "fieldgrid_runtime_data_insert",
          "command": "a",
          "permissive": true,
          "roles": [
            "fieldgrid_runtime_data"
          ],
          "usingExpression": null,
          "checkExpression": "true"
        },
        {
          "schema": "public",
          "table": "invoices",
          "name": "fieldgrid_runtime_data_select",
          "command": "r",
          "permissive": true,
          "roles": [
            "fieldgrid_runtime_data"
          ],
          "usingExpression": "true",
          "checkExpression": null
        },
        {
          "schema": "public",
          "table": "invoices",
          "name": "fieldgrid_runtime_data_update",
          "command": "w",
          "permissive": true,
          "roles": [
            "fieldgrid_runtime_data"
          ],
          "usingExpression": "true",
          "checkExpression": "true"
        },
        {
          "schema": "public",
          "table": "invoices",
          "name": "invoices_customer_sent_select",
          "command": "r",
          "permissive": true,
          "roles": [
            "authenticated"
          ],
          "usingExpression": "(((status)::text = ANY ((ARRAY['sent'::character varying, 'paid'::character varying, 'cancelled'::character varying])::text[])) AND (EXISTS ( SELECT 1\n   FROM public.customers c\n  WHERE ((c.id = invoices.customer_id) AND public.customer_has_access(c.id, c.tenant_id)))))",
          "checkExpression": null
        },
        {
          "schema": "public",
          "table": "invoices",
          "name": "invoices_management_all",
          "command": "*",
          "permissive": true,
          "roles": [
            "authenticated"
          ],
          "usingExpression": "public.is_management_for_tenant(tenant_id)",
          "checkExpression": "public.is_management_for_tenant(tenant_id)"
        },
        {
          "schema": "public",
          "table": "object_contacts",
          "name": "fieldgrid_runtime_data_delete",
          "command": "d",
          "permissive": true,
          "roles": [
            "fieldgrid_runtime_data"
          ],
          "usingExpression": "true",
          "checkExpression": null
        },
        {
          "schema": "public",
          "table": "object_contacts",
          "name": "fieldgrid_runtime_data_insert",
          "command": "a",
          "permissive": true,
          "roles": [
            "fieldgrid_runtime_data"
          ],
          "usingExpression": null,
          "checkExpression": "true"
        },
        {
          "schema": "public",
          "table": "object_contacts",
          "name": "fieldgrid_runtime_data_select",
          "command": "r",
          "permissive": true,
          "roles": [
            "fieldgrid_runtime_data"
          ],
          "usingExpression": "true",
          "checkExpression": null
        },
        {
          "schema": "public",
          "table": "object_contacts",
          "name": "fieldgrid_runtime_data_update",
          "command": "w",
          "permissive": true,
          "roles": [
            "fieldgrid_runtime_data"
          ],
          "usingExpression": "true",
          "checkExpression": "true"
        },
        {
          "schema": "public",
          "table": "object_contacts",
          "name": "object_contacts_customer_users_delete",
          "command": "d",
          "permissive": true,
          "roles": [
            "authenticated"
          ],
          "usingExpression": "(EXISTS ( SELECT 1\n   FROM public.objects o\n  WHERE ((o.id = object_contacts.object_id) AND public.customer_has_access(o.customer_id, o.tenant_id))))",
          "checkExpression": null
        },
        {
          "schema": "public",
          "table": "object_contacts",
          "name": "object_contacts_customer_users_insert",
          "command": "a",
          "permissive": true,
          "roles": [
            "authenticated"
          ],
          "usingExpression": null,
          "checkExpression": "(EXISTS ( SELECT 1\n   FROM public.objects o\n  WHERE ((o.id = object_contacts.object_id) AND public.customer_has_access(o.customer_id, o.tenant_id))))"
        },
        {
          "schema": "public",
          "table": "object_contacts",
          "name": "object_contacts_customer_users_select",
          "command": "r",
          "permissive": true,
          "roles": [
            "authenticated"
          ],
          "usingExpression": "(EXISTS ( SELECT 1\n   FROM public.objects o\n  WHERE ((o.id = object_contacts.object_id) AND public.customer_has_access(o.customer_id, o.tenant_id))))",
          "checkExpression": null
        },
        {
          "schema": "public",
          "table": "object_contacts",
          "name": "object_contacts_customer_users_update",
          "command": "w",
          "permissive": true,
          "roles": [
            "authenticated"
          ],
          "usingExpression": "(EXISTS ( SELECT 1\n   FROM public.objects o\n  WHERE ((o.id = object_contacts.object_id) AND public.customer_has_access(o.customer_id, o.tenant_id))))",
          "checkExpression": "(EXISTS ( SELECT 1\n   FROM public.objects o\n  WHERE ((o.id = object_contacts.object_id) AND public.customer_has_access(o.customer_id, o.tenant_id))))"
        },
        {
          "schema": "public",
          "table": "object_contacts",
          "name": "object_contacts_management",
          "command": "*",
          "permissive": true,
          "roles": [
            "authenticated"
          ],
          "usingExpression": "(EXISTS ( SELECT 1\n   FROM public.objects o\n  WHERE ((o.id = object_contacts.object_id) AND public.is_management_for_tenant(o.tenant_id))))",
          "checkExpression": "(EXISTS ( SELECT 1\n   FROM public.objects o\n  WHERE ((o.id = object_contacts.object_id) AND public.is_management_for_tenant(o.tenant_id))))"
        },
        {
          "schema": "public",
          "table": "object_personnel",
          "name": "fieldgrid_runtime_data_delete",
          "command": "d",
          "permissive": true,
          "roles": [
            "fieldgrid_runtime_data"
          ],
          "usingExpression": "true",
          "checkExpression": null
        },
        {
          "schema": "public",
          "table": "object_personnel",
          "name": "fieldgrid_runtime_data_insert",
          "command": "a",
          "permissive": true,
          "roles": [
            "fieldgrid_runtime_data"
          ],
          "usingExpression": null,
          "checkExpression": "true"
        },
        {
          "schema": "public",
          "table": "object_personnel",
          "name": "fieldgrid_runtime_data_select",
          "command": "r",
          "permissive": true,
          "roles": [
            "fieldgrid_runtime_data"
          ],
          "usingExpression": "true",
          "checkExpression": null
        },
        {
          "schema": "public",
          "table": "object_personnel",
          "name": "object_personnel_management",
          "command": "*",
          "permissive": true,
          "roles": [
            "authenticated"
          ],
          "usingExpression": "(EXISTS ( SELECT 1\n   FROM (public.objects o\n     JOIN public.personnel p ON (((p.id = object_personnel.personnel_id) AND (p.tenant_id = o.tenant_id))))\n  WHERE ((o.id = object_personnel.object_id) AND public.is_management_for_tenant(o.tenant_id))))",
          "checkExpression": "(EXISTS ( SELECT 1\n   FROM (public.objects o\n     JOIN public.personnel p ON (((p.id = object_personnel.personnel_id) AND (p.tenant_id = o.tenant_id))))\n  WHERE ((o.id = object_personnel.object_id) AND public.is_management_for_tenant(o.tenant_id))))"
        },
        {
          "schema": "public",
          "table": "objects",
          "name": "fieldgrid_runtime_data_delete",
          "command": "d",
          "permissive": true,
          "roles": [
            "fieldgrid_runtime_data"
          ],
          "usingExpression": "true",
          "checkExpression": null
        },
        {
          "schema": "public",
          "table": "objects",
          "name": "fieldgrid_runtime_data_insert",
          "command": "a",
          "permissive": true,
          "roles": [
            "fieldgrid_runtime_data"
          ],
          "usingExpression": null,
          "checkExpression": "true"
        },
        {
          "schema": "public",
          "table": "objects",
          "name": "fieldgrid_runtime_data_select",
          "command": "r",
          "permissive": true,
          "roles": [
            "fieldgrid_runtime_data"
          ],
          "usingExpression": "true",
          "checkExpression": null
        },
        {
          "schema": "public",
          "table": "objects",
          "name": "fieldgrid_runtime_data_update",
          "command": "w",
          "permissive": true,
          "roles": [
            "fieldgrid_runtime_data"
          ],
          "usingExpression": "true",
          "checkExpression": "true"
        },
        {
          "schema": "public",
          "table": "objects",
          "name": "objects_customer_users_insert",
          "command": "a",
          "permissive": true,
          "roles": [
            "authenticated"
          ],
          "usingExpression": null,
          "checkExpression": "public.customer_has_access(customer_id, tenant_id)"
        },
        {
          "schema": "public",
          "table": "objects",
          "name": "objects_customer_users_select",
          "command": "r",
          "permissive": true,
          "roles": [
            "authenticated"
          ],
          "usingExpression": "public.customer_has_access(customer_id, tenant_id)",
          "checkExpression": null
        },
        {
          "schema": "public",
          "table": "objects",
          "name": "objects_customer_users_update",
          "command": "w",
          "permissive": true,
          "roles": [
            "authenticated"
          ],
          "usingExpression": "public.customer_has_access(customer_id, tenant_id)",
          "checkExpression": "public.customer_has_access(customer_id, tenant_id)"
        },
        {
          "schema": "public",
          "table": "objects",
          "name": "objects_management",
          "command": "*",
          "permissive": true,
          "roles": [
            "authenticated"
          ],
          "usingExpression": "public.is_management_for_tenant(tenant_id)",
          "checkExpression": "public.is_management_for_tenant(tenant_id)"
        },
        {
          "schema": "public",
          "table": "objects",
          "name": "personnel_select_assigned_objects",
          "command": "r",
          "permissive": true,
          "roles": [
            "authenticated"
          ],
          "usingExpression": "(EXISTS ( SELECT 1\n   FROM public.assignments a\n  WHERE ((a.object_id = objects.id) AND public.personnel_assigned_to_assignment(a.id))))",
          "checkExpression": null
        },
        {
          "schema": "public",
          "table": "payments",
          "name": "fieldgrid_runtime_data_insert",
          "command": "a",
          "permissive": true,
          "roles": [
            "fieldgrid_runtime_data"
          ],
          "usingExpression": null,
          "checkExpression": "true"
        },
        {
          "schema": "public",
          "table": "payments",
          "name": "fieldgrid_runtime_data_select",
          "command": "r",
          "permissive": true,
          "roles": [
            "fieldgrid_runtime_data"
          ],
          "usingExpression": "true",
          "checkExpression": null
        },
        {
          "schema": "public",
          "table": "payments",
          "name": "fieldgrid_runtime_data_update",
          "command": "w",
          "permissive": true,
          "roles": [
            "fieldgrid_runtime_data"
          ],
          "usingExpression": "true",
          "checkExpression": "true"
        },
        {
          "schema": "public",
          "table": "payments",
          "name": "owner_or_staff_read_payments",
          "command": "r",
          "permissive": true,
          "roles": [
            "authenticated"
          ],
          "usingExpression": "(EXISTS ( SELECT 1\n   FROM public.invoices i\n  WHERE ((i.id = payments.invoice_id) AND (i.tenant_id = payments.tenant_id) AND ((i.created_by = auth.uid()) OR public.is_management_for_tenant(i.tenant_id)))))",
          "checkExpression": null
        },
        {
          "schema": "public",
          "table": "personnel",
          "name": "fieldgrid_runtime_data_delete",
          "command": "d",
          "permissive": true,
          "roles": [
            "fieldgrid_runtime_data"
          ],
          "usingExpression": "true",
          "checkExpression": null
        },
        {
          "schema": "public",
          "table": "personnel",
          "name": "fieldgrid_runtime_data_insert",
          "command": "a",
          "permissive": true,
          "roles": [
            "fieldgrid_runtime_data"
          ],
          "usingExpression": null,
          "checkExpression": "true"
        },
        {
          "schema": "public",
          "table": "personnel",
          "name": "fieldgrid_runtime_data_select",
          "command": "r",
          "permissive": true,
          "roles": [
            "fieldgrid_runtime_data"
          ],
          "usingExpression": "true",
          "checkExpression": null
        },
        {
          "schema": "public",
          "table": "personnel",
          "name": "fieldgrid_runtime_data_update",
          "command": "w",
          "permissive": true,
          "roles": [
            "fieldgrid_runtime_data"
          ],
          "usingExpression": "true",
          "checkExpression": "true"
        },
        {
          "schema": "public",
          "table": "personnel",
          "name": "personnel_management",
          "command": "*",
          "permissive": true,
          "roles": [
            "authenticated"
          ],
          "usingExpression": "public.is_management_for_tenant(tenant_id)",
          "checkExpression": "public.is_management_for_tenant(tenant_id)"
        },
        {
          "schema": "public",
          "table": "personnel",
          "name": "personnel_select_own",
          "command": "r",
          "permissive": true,
          "roles": [
            "authenticated"
          ],
          "usingExpression": "(user_id = auth.uid())",
          "checkExpression": null
        }
      ],
      "helpers": [
        {
          "schema": "public",
          "name": "customer_has_access",
          "argumentTypes": [
            "uuid",
            "uuid"
          ],
          "returnType": "bool",
          "body": "\n  SELECT EXISTS (\n    SELECT 1\n    FROM customer_users cu\n    WHERE cu.customer_id = p_customer_id\n      AND cu.tenant_id = p_tenant_id\n      AND cu.user_id = (SELECT auth.uid())\n      AND cu.status = 'active'\n  );\n",
          "language": "sql",
          "securityDefiner": false,
          "volatility": "s",
          "parallel": "u",
          "strict": false,
          "leakproof": false,
          "config": [
            "search_path=public, auth"
          ],
          "argNames": [
            "p_customer_id",
            "p_tenant_id"
          ],
          "defaultCount": 0,
          "ownerRelation": {
            "schema": "public",
            "table": "object_contacts"
          },
          "directAcl": [
            {
              "grantee": "$owner",
              "grantor": "$owner",
              "privilege": "EXECUTE",
              "grantable": false
            },
            {
              "grantee": "authenticated",
              "grantor": "$owner",
              "privilege": "EXECUTE",
              "grantable": false
            }
          ],
          "effectiveExecute": [
            {
              "role": "$owner",
              "allowed": true
            },
            {
              "role": "PUBLIC",
              "allowed": false
            },
            {
              "role": "anon",
              "allowed": false
            },
            {
              "role": "authenticated",
              "allowed": true
            },
            {
              "role": "service_role",
              "allowed": false
            },
            {
              "role": "fieldgrid_runtime_data",
              "allowed": false
            },
            {
              "role": "fieldgrid_runtime_app",
              "allowed": false
            }
          ]
        },
        {
          "schema": "public",
          "name": "personnel_assigned_to_assignment",
          "argumentTypes": [
            "uuid"
          ],
          "returnType": "bool",
          "body": "\n  SELECT\n    (SELECT auth.uid()) IS NOT NULL\n    AND EXISTS (\n      SELECT 1\n      FROM public.assignment_personnel ap\n      JOIN public.assignments a\n        ON a.id = ap.assignment_id\n      JOIN public.personnel p\n        ON p.id = ap.personnel_id\n      WHERE ap.assignment_id = p_assignment_id\n        AND ap.status = 'assigned'\n        AND p.user_id = (SELECT auth.uid())\n        AND p.is_active = true\n        AND p.tenant_id IS NOT NULL\n        AND a.tenant_id IS NOT NULL\n        AND p.tenant_id = a.tenant_id\n    );\n",
          "language": "sql",
          "securityDefiner": true,
          "volatility": "s",
          "parallel": "u",
          "strict": false,
          "leakproof": false,
          "config": [
            "search_path=pg_catalog, public, auth"
          ],
          "argNames": [
            "p_assignment_id"
          ],
          "defaultCount": 0,
          "ownerRelation": {
            "schema": "public",
            "table": "object_contacts"
          },
          "directAcl": [
            {
              "grantee": "$owner",
              "grantor": "$owner",
              "privilege": "EXECUTE",
              "grantable": false
            },
            {
              "grantee": "authenticated",
              "grantor": "$owner",
              "privilege": "EXECUTE",
              "grantable": false
            }
          ],
          "effectiveExecute": [
            {
              "role": "$owner",
              "allowed": true
            },
            {
              "role": "PUBLIC",
              "allowed": false
            },
            {
              "role": "anon",
              "allowed": false
            },
            {
              "role": "authenticated",
              "allowed": true
            },
            {
              "role": "service_role",
              "allowed": false
            },
            {
              "role": "fieldgrid_runtime_data",
              "allowed": false
            },
            {
              "role": "fieldgrid_runtime_app",
              "allowed": false
            }
          ]
        },
        {
          "schema": "public",
          "name": "fieldgrid_has_platform_permission",
          "argumentTypes": [
            "text"
          ],
          "returnType": "bool",
          "body": "\n  SELECT EXISTS (\n    SELECT 1 FROM public.platform_users pu\n    WHERE pu.user_id = auth.uid() AND pu.status = 'active'\n      AND (\n        pu.role = 'owner'\n        OR (pu.role = 'admin' AND p_permission = ANY (ARRAY[\n          'global.rbac.manage', 'global.reference.manage', 'global.content.manage',\n          'platform.tenants.read', 'platform.audit.read'\n        ]))\n      )\n  );\n",
          "language": "sql",
          "securityDefiner": true,
          "volatility": "s",
          "parallel": "u",
          "strict": false,
          "leakproof": false,
          "config": [
            "search_path=pg_catalog, public, pg_temp"
          ],
          "argNames": [
            "p_permission"
          ],
          "defaultCount": 0,
          "ownerRelation": {
            "schema": "public",
            "table": "object_contacts"
          },
          "directAcl": [
            {
              "grantee": "$owner",
              "grantor": "$owner",
              "privilege": "EXECUTE",
              "grantable": false
            },
            {
              "grantee": "authenticated",
              "grantor": "$owner",
              "privilege": "EXECUTE",
              "grantable": false
            }
          ],
          "effectiveExecute": [
            {
              "role": "$owner",
              "allowed": true
            },
            {
              "role": "PUBLIC",
              "allowed": false
            },
            {
              "role": "anon",
              "allowed": false
            },
            {
              "role": "authenticated",
              "allowed": true
            },
            {
              "role": "service_role",
              "allowed": false
            },
            {
              "role": "fieldgrid_runtime_data",
              "allowed": false
            },
            {
              "role": "fieldgrid_runtime_app",
              "allowed": false
            }
          ]
        },
        {
          "schema": "auth",
          "name": "uid",
          "argumentTypes": [],
          "returnType": "uuid",
          "body": "\n  select \n  coalesce(\n    nullif(current_setting('request.jwt.claim.sub', true), ''),\n    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')\n  )::uuid\n",
          "language": "sql",
          "securityDefiner": false,
          "volatility": "s",
          "parallel": "u",
          "strict": false,
          "leakproof": false,
          "config": null,
          "argNames": null,
          "defaultCount": 0,
          "ownerRelation": {
            "schema": "auth",
            "table": "users"
          },
          "directAcl": [
            {
              "grantee": "$owner",
              "grantor": "$owner",
              "privilege": "EXECUTE",
              "grantable": false
            },
            {
              "grantee": "PUBLIC",
              "grantor": "$owner",
              "privilege": "EXECUTE",
              "grantable": false
            },
            {
              "grantee": "dashboard_user",
              "grantor": "$owner",
              "privilege": "EXECUTE",
              "grantable": false
            }
          ],
          "effectiveExecute": [
            {
              "role": "$owner",
              "allowed": true
            },
            {
              "role": "PUBLIC",
              "allowed": true
            },
            {
              "role": "anon",
              "allowed": true
            },
            {
              "role": "authenticated",
              "allowed": true
            },
            {
              "role": "service_role",
              "allowed": true
            },
            {
              "role": "fieldgrid_runtime_data",
              "allowed": true
            },
            {
              "role": "fieldgrid_runtime_app",
              "allowed": true
            }
          ]
        }
      ]
    }
  },
  {
    "state": "legacy",
    "profile": "hostedProvider",
    "manifest": {
      "version": 1,
      "postgresMajor": 17,
      "sources": [
        {
          "path": "lib/db/migrations/002_sprint1_rls.sql",
          "sha256": "16a27aa61943516314b9800d7b37a08eeb9c64441a5994c7da3f9badf7265238"
        },
        {
          "path": "lib/db/migrations/025_platform_schema_extensions.sql",
          "sha256": "8a57d65ba11e3122f897498093d1351f0cf57a2f1940850e266bbfc54c0b3636"
        },
        {
          "path": "lib/db/migrations/037_tenant_customer_users_events_hardening.sql",
          "sha256": "03a1ad0cbf406140c64b53da422abb62a45a6e0e9fb68832a8328ca6685d0b0e"
        },
        {
          "path": "lib/db/migrations/051_final_security_boundaries.sql",
          "sha256": "64f12a61bbd19cfbf4ec854c31560717bef4219433b03c09055f3f6f070181ff"
        },
        {
          "path": "lib/db/migrations/062_finance_reports_tenant_scope.sql",
          "sha256": "0ff1e8fcc5e0a3c7674ed084e6058e1a538ca0fed13e02f469fb0d363e055fbe"
        },
        {
          "path": "lib/db/migrations/063_payments_batches_audit_tenant_scope.sql",
          "sha256": "171caa7e6a8d4a8f624e475dc234d21b6c81e1e38802ddad3db778047f2053d2"
        },
        {
          "path": "lib/db/migrations/20260710200000_invoice_canon_credit_collection_payments.sql",
          "sha256": "78fc35f49a80a69ad7a7fe0dfc23c264dff2aba0fbfc49f702b3a7a74d1bc23f"
        },
        {
          "path": "lib/db/migrations/20260714120000_assignment_personnel_phase_b_direct_access_close.sql",
          "sha256": "7be5f0c1999d6eaadb22735d2243322d8aada1e64e3c4c44c4a3bc11d8317574"
        },
        {
          "path": "lib/db/migrations/20260718190000_phase2_security_reconciliation.sql",
          "sha256": "6cf0da37eec7c1b5b57c8218593873fedf1fae2a832b27e138dfd2614b861964"
        },
        {
          "path": "lib/db/migrations/20260909120000_runtime_least_privilege_principals.sql",
          "sha256": "2eaf25923d7908c94d1fb96c7fbede14858330d86be21656f50d611fe37e0066"
        },
        {
          "path": "migrations/013_sprint5_payments.sql",
          "sha256": "ea6d0e71764e92d0a0f0ad2d09a6bdf6c864c2a64d1ef717743b567d15198102"
        },
        {
          "path": "migrations/023_objects_extended.sql",
          "sha256": "19e20f3463f220a123450cefec79dc7490d5074c72f1a3f726ddfd1a28dde6ae"
        },
        {
          "path": "scripts/fieldgrid-runtime-safety-setup.mjs",
          "sha256": "f43d159c3e047bd752642e8005793df40314873a772c16c95eca7195f5c34666"
        },
        {
          "path": "tests/fixtures/fieldgrid-supabase-auth-functions.sql",
          "sha256": "5b72022d73e64a8e474d2122ac42f299bb7ce4d59755cdcc78e72abfe5d47dc0"
        }
      ],
      "relations": [
        {
          "schema": "public",
          "table": "invoices",
          "kind": "r",
          "rowSecurity": true,
          "forceRowSecurity": false,
          "columns": [
            {
              "name": "created_by",
              "notNull": false,
              "typeName": "uuid",
              "typeModifier": -1
            },
            {
              "name": "id",
              "notNull": true,
              "typeName": "uuid",
              "typeModifier": -1
            },
            {
              "name": "tenant_id",
              "notNull": true,
              "typeName": "uuid",
              "typeModifier": -1
            }
          ]
        },
        {
          "schema": "public",
          "table": "object_contacts",
          "kind": "r",
          "rowSecurity": true,
          "forceRowSecurity": false,
          "columns": [
            {
              "name": "id",
              "notNull": true,
              "typeName": "uuid",
              "typeModifier": -1
            },
            {
              "name": "object_id",
              "notNull": true,
              "typeName": "uuid",
              "typeModifier": -1
            }
          ]
        },
        {
          "schema": "public",
          "table": "object_personnel",
          "kind": "r",
          "rowSecurity": true,
          "forceRowSecurity": false,
          "columns": [
            {
              "name": "object_id",
              "notNull": true,
              "typeName": "uuid",
              "typeModifier": -1
            },
            {
              "name": "personnel_id",
              "notNull": true,
              "typeName": "uuid",
              "typeModifier": -1
            }
          ]
        },
        {
          "schema": "public",
          "table": "objects",
          "kind": "r",
          "rowSecurity": true,
          "forceRowSecurity": false,
          "columns": [
            {
              "name": "id",
              "notNull": true,
              "typeName": "uuid",
              "typeModifier": -1
            },
            {
              "name": "tenant_id",
              "notNull": true,
              "typeName": "uuid",
              "typeModifier": -1
            }
          ]
        },
        {
          "schema": "public",
          "table": "payments",
          "kind": "r",
          "rowSecurity": true,
          "forceRowSecurity": false,
          "columns": [
            {
              "name": "id",
              "notNull": true,
              "typeName": "uuid",
              "typeModifier": -1
            },
            {
              "name": "invoice_id",
              "notNull": false,
              "typeName": "uuid",
              "typeModifier": -1
            },
            {
              "name": "tenant_id",
              "notNull": true,
              "typeName": "uuid",
              "typeModifier": -1
            }
          ]
        },
        {
          "schema": "public",
          "table": "personnel",
          "kind": "r",
          "rowSecurity": true,
          "forceRowSecurity": false,
          "columns": [
            {
              "name": "id",
              "notNull": true,
              "typeName": "uuid",
              "typeModifier": -1
            },
            {
              "name": "tenant_id",
              "notNull": true,
              "typeName": "uuid",
              "typeModifier": -1
            }
          ]
        }
      ],
      "policies": [
        {
          "schema": "public",
          "table": "invoices",
          "name": "fieldgrid_runtime_data_insert",
          "command": "a",
          "permissive": true,
          "roles": [
            "fieldgrid_runtime_data"
          ],
          "usingExpression": null,
          "checkExpression": "true"
        },
        {
          "schema": "public",
          "table": "invoices",
          "name": "fieldgrid_runtime_data_select",
          "command": "r",
          "permissive": true,
          "roles": [
            "fieldgrid_runtime_data"
          ],
          "usingExpression": "true",
          "checkExpression": null
        },
        {
          "schema": "public",
          "table": "invoices",
          "name": "fieldgrid_runtime_data_update",
          "command": "w",
          "permissive": true,
          "roles": [
            "fieldgrid_runtime_data"
          ],
          "usingExpression": "true",
          "checkExpression": "true"
        },
        {
          "schema": "public",
          "table": "invoices",
          "name": "invoices_customer_sent_select",
          "command": "r",
          "permissive": true,
          "roles": [
            "authenticated"
          ],
          "usingExpression": "(((status)::text = ANY ((ARRAY['sent'::character varying, 'paid'::character varying, 'cancelled'::character varying])::text[])) AND (EXISTS ( SELECT 1\n   FROM public.customers c\n  WHERE ((c.id = invoices.customer_id) AND public.customer_has_access(c.id, c.tenant_id)))))",
          "checkExpression": null
        },
        {
          "schema": "public",
          "table": "invoices",
          "name": "invoices_management_all",
          "command": "*",
          "permissive": true,
          "roles": [
            "authenticated"
          ],
          "usingExpression": "public.is_management_for_tenant(tenant_id)",
          "checkExpression": "public.is_management_for_tenant(tenant_id)"
        },
        {
          "schema": "public",
          "table": "object_contacts",
          "name": "fieldgrid_runtime_data_delete",
          "command": "d",
          "permissive": true,
          "roles": [
            "fieldgrid_runtime_data"
          ],
          "usingExpression": "true",
          "checkExpression": null
        },
        {
          "schema": "public",
          "table": "object_contacts",
          "name": "fieldgrid_runtime_data_insert",
          "command": "a",
          "permissive": true,
          "roles": [
            "fieldgrid_runtime_data"
          ],
          "usingExpression": null,
          "checkExpression": "true"
        },
        {
          "schema": "public",
          "table": "object_contacts",
          "name": "fieldgrid_runtime_data_select",
          "command": "r",
          "permissive": true,
          "roles": [
            "fieldgrid_runtime_data"
          ],
          "usingExpression": "true",
          "checkExpression": null
        },
        {
          "schema": "public",
          "table": "object_contacts",
          "name": "fieldgrid_runtime_data_update",
          "command": "w",
          "permissive": true,
          "roles": [
            "fieldgrid_runtime_data"
          ],
          "usingExpression": "true",
          "checkExpression": "true"
        },
        {
          "schema": "public",
          "table": "object_contacts",
          "name": "object_contacts_customer_users_delete",
          "command": "d",
          "permissive": true,
          "roles": [
            "authenticated"
          ],
          "usingExpression": "(EXISTS ( SELECT 1\n   FROM public.objects o\n  WHERE ((o.id = object_contacts.object_id) AND public.customer_has_access(o.customer_id, o.tenant_id))))",
          "checkExpression": null
        },
        {
          "schema": "public",
          "table": "object_contacts",
          "name": "object_contacts_customer_users_insert",
          "command": "a",
          "permissive": true,
          "roles": [
            "authenticated"
          ],
          "usingExpression": null,
          "checkExpression": "(EXISTS ( SELECT 1\n   FROM public.objects o\n  WHERE ((o.id = object_contacts.object_id) AND public.customer_has_access(o.customer_id, o.tenant_id))))"
        },
        {
          "schema": "public",
          "table": "object_contacts",
          "name": "object_contacts_customer_users_select",
          "command": "r",
          "permissive": true,
          "roles": [
            "authenticated"
          ],
          "usingExpression": "(EXISTS ( SELECT 1\n   FROM public.objects o\n  WHERE ((o.id = object_contacts.object_id) AND public.customer_has_access(o.customer_id, o.tenant_id))))",
          "checkExpression": null
        },
        {
          "schema": "public",
          "table": "object_contacts",
          "name": "object_contacts_customer_users_update",
          "command": "w",
          "permissive": true,
          "roles": [
            "authenticated"
          ],
          "usingExpression": "(EXISTS ( SELECT 1\n   FROM public.objects o\n  WHERE ((o.id = object_contacts.object_id) AND public.customer_has_access(o.customer_id, o.tenant_id))))",
          "checkExpression": "(EXISTS ( SELECT 1\n   FROM public.objects o\n  WHERE ((o.id = object_contacts.object_id) AND public.customer_has_access(o.customer_id, o.tenant_id))))"
        },
        {
          "schema": "public",
          "table": "object_contacts",
          "name": "object_contacts_management",
          "command": "*",
          "permissive": true,
          "roles": [
            "authenticated"
          ],
          "usingExpression": "(EXISTS ( SELECT 1\n   FROM public.objects o\n  WHERE ((o.id = object_contacts.object_id) AND public.is_management_for_tenant(o.tenant_id))))",
          "checkExpression": "(EXISTS ( SELECT 1\n   FROM public.objects o\n  WHERE ((o.id = object_contacts.object_id) AND public.is_management_for_tenant(o.tenant_id))))"
        },
        {
          "schema": "public",
          "table": "object_contacts",
          "name": "object_contacts_management_all",
          "command": "*",
          "permissive": true,
          "roles": [
            "PUBLIC"
          ],
          "usingExpression": "(EXISTS ( SELECT 1\n   FROM (public.user_roles ur\n     JOIN public.roles r ON ((r.id = ur.role_id)))\n  WHERE ((ur.user_id = auth.uid()) AND ((r.name)::text = ANY ((ARRAY['Management'::character varying, 'Administration'::character varying, 'Planning'::character varying, 'Support'::character varying])::text[])))))",
          "checkExpression": null
        },
        {
          "schema": "public",
          "table": "object_personnel",
          "name": "fieldgrid_runtime_data_delete",
          "command": "d",
          "permissive": true,
          "roles": [
            "fieldgrid_runtime_data"
          ],
          "usingExpression": "true",
          "checkExpression": null
        },
        {
          "schema": "public",
          "table": "object_personnel",
          "name": "fieldgrid_runtime_data_insert",
          "command": "a",
          "permissive": true,
          "roles": [
            "fieldgrid_runtime_data"
          ],
          "usingExpression": null,
          "checkExpression": "true"
        },
        {
          "schema": "public",
          "table": "object_personnel",
          "name": "fieldgrid_runtime_data_select",
          "command": "r",
          "permissive": true,
          "roles": [
            "fieldgrid_runtime_data"
          ],
          "usingExpression": "true",
          "checkExpression": null
        },
        {
          "schema": "public",
          "table": "object_personnel",
          "name": "object_personnel_management",
          "command": "*",
          "permissive": true,
          "roles": [
            "authenticated"
          ],
          "usingExpression": "(EXISTS ( SELECT 1\n   FROM public.objects o\n  WHERE ((o.id = object_personnel.object_id) AND public.is_management_for_tenant(o.tenant_id))))",
          "checkExpression": "(EXISTS ( SELECT 1\n   FROM public.objects o\n  WHERE ((o.id = object_personnel.object_id) AND public.is_management_for_tenant(o.tenant_id))))"
        },
        {
          "schema": "public",
          "table": "object_personnel",
          "name": "object_personnel_management_all",
          "command": "*",
          "permissive": true,
          "roles": [
            "PUBLIC"
          ],
          "usingExpression": "(EXISTS ( SELECT 1\n   FROM (public.user_roles ur\n     JOIN public.roles r ON ((r.id = ur.role_id)))\n  WHERE ((ur.user_id = auth.uid()) AND ((r.name)::text = ANY ((ARRAY['Management'::character varying, 'Administration'::character varying, 'Planning'::character varying, 'Support'::character varying])::text[])))))",
          "checkExpression": null
        },
        {
          "schema": "public",
          "table": "objects",
          "name": "fieldgrid_runtime_data_delete",
          "command": "d",
          "permissive": true,
          "roles": [
            "fieldgrid_runtime_data"
          ],
          "usingExpression": "true",
          "checkExpression": null
        },
        {
          "schema": "public",
          "table": "objects",
          "name": "fieldgrid_runtime_data_insert",
          "command": "a",
          "permissive": true,
          "roles": [
            "fieldgrid_runtime_data"
          ],
          "usingExpression": null,
          "checkExpression": "true"
        },
        {
          "schema": "public",
          "table": "objects",
          "name": "fieldgrid_runtime_data_select",
          "command": "r",
          "permissive": true,
          "roles": [
            "fieldgrid_runtime_data"
          ],
          "usingExpression": "true",
          "checkExpression": null
        },
        {
          "schema": "public",
          "table": "objects",
          "name": "fieldgrid_runtime_data_update",
          "command": "w",
          "permissive": true,
          "roles": [
            "fieldgrid_runtime_data"
          ],
          "usingExpression": "true",
          "checkExpression": "true"
        },
        {
          "schema": "public",
          "table": "objects",
          "name": "objects_customer_users_insert",
          "command": "a",
          "permissive": true,
          "roles": [
            "authenticated"
          ],
          "usingExpression": null,
          "checkExpression": "public.customer_has_access(customer_id, tenant_id)"
        },
        {
          "schema": "public",
          "table": "objects",
          "name": "objects_customer_users_select",
          "command": "r",
          "permissive": true,
          "roles": [
            "authenticated"
          ],
          "usingExpression": "public.customer_has_access(customer_id, tenant_id)",
          "checkExpression": null
        },
        {
          "schema": "public",
          "table": "objects",
          "name": "objects_customer_users_update",
          "command": "w",
          "permissive": true,
          "roles": [
            "authenticated"
          ],
          "usingExpression": "public.customer_has_access(customer_id, tenant_id)",
          "checkExpression": "public.customer_has_access(customer_id, tenant_id)"
        },
        {
          "schema": "public",
          "table": "objects",
          "name": "objects_management",
          "command": "*",
          "permissive": true,
          "roles": [
            "authenticated"
          ],
          "usingExpression": "public.is_management_for_tenant(tenant_id)",
          "checkExpression": "public.is_management_for_tenant(tenant_id)"
        },
        {
          "schema": "public",
          "table": "objects",
          "name": "personnel_select_assigned_objects",
          "command": "r",
          "permissive": true,
          "roles": [
            "authenticated"
          ],
          "usingExpression": "(EXISTS ( SELECT 1\n   FROM public.assignments a\n  WHERE ((a.object_id = objects.id) AND public.personnel_assigned_to_assignment(a.id))))",
          "checkExpression": null
        },
        {
          "schema": "public",
          "table": "payments",
          "name": "fieldgrid_runtime_data_insert",
          "command": "a",
          "permissive": true,
          "roles": [
            "fieldgrid_runtime_data"
          ],
          "usingExpression": null,
          "checkExpression": "true"
        },
        {
          "schema": "public",
          "table": "payments",
          "name": "fieldgrid_runtime_data_select",
          "command": "r",
          "permissive": true,
          "roles": [
            "fieldgrid_runtime_data"
          ],
          "usingExpression": "true",
          "checkExpression": null
        },
        {
          "schema": "public",
          "table": "payments",
          "name": "fieldgrid_runtime_data_update",
          "command": "w",
          "permissive": true,
          "roles": [
            "fieldgrid_runtime_data"
          ],
          "usingExpression": "true",
          "checkExpression": "true"
        },
        {
          "schema": "public",
          "table": "payments",
          "name": "owner_or_staff_read_payments",
          "command": "r",
          "permissive": true,
          "roles": [
            "PUBLIC"
          ],
          "usingExpression": "(EXISTS ( SELECT 1\n   FROM public.invoices\n  WHERE ((invoices.id = payments.invoice_id) AND ((invoices.created_by = auth.uid()) OR (EXISTS ( SELECT 1\n           FROM (public.user_roles ur\n             JOIN public.roles r ON ((r.id = ur.role_id)))\n          WHERE ((ur.user_id = auth.uid()) AND ((r.name)::text = ANY ((ARRAY['management'::character varying, 'administration'::character varying, 'planning'::character varying, 'support'::character varying])::text[])))))))))",
          "checkExpression": null
        },
        {
          "schema": "public",
          "table": "payments",
          "name": "service_role_all_payments",
          "command": "*",
          "permissive": true,
          "roles": [
            "PUBLIC"
          ],
          "usingExpression": "(auth.role() = 'service_role'::text)",
          "checkExpression": "(auth.role() = 'service_role'::text)"
        },
        {
          "schema": "public",
          "table": "personnel",
          "name": "fieldgrid_runtime_data_delete",
          "command": "d",
          "permissive": true,
          "roles": [
            "fieldgrid_runtime_data"
          ],
          "usingExpression": "true",
          "checkExpression": null
        },
        {
          "schema": "public",
          "table": "personnel",
          "name": "fieldgrid_runtime_data_insert",
          "command": "a",
          "permissive": true,
          "roles": [
            "fieldgrid_runtime_data"
          ],
          "usingExpression": null,
          "checkExpression": "true"
        },
        {
          "schema": "public",
          "table": "personnel",
          "name": "fieldgrid_runtime_data_select",
          "command": "r",
          "permissive": true,
          "roles": [
            "fieldgrid_runtime_data"
          ],
          "usingExpression": "true",
          "checkExpression": null
        },
        {
          "schema": "public",
          "table": "personnel",
          "name": "fieldgrid_runtime_data_update",
          "command": "w",
          "permissive": true,
          "roles": [
            "fieldgrid_runtime_data"
          ],
          "usingExpression": "true",
          "checkExpression": "true"
        },
        {
          "schema": "public",
          "table": "personnel",
          "name": "personnel_management",
          "command": "*",
          "permissive": true,
          "roles": [
            "authenticated"
          ],
          "usingExpression": "public.is_management_for_tenant(tenant_id)",
          "checkExpression": "public.is_management_for_tenant(tenant_id)"
        },
        {
          "schema": "public",
          "table": "personnel",
          "name": "personnel_select_own",
          "command": "r",
          "permissive": true,
          "roles": [
            "authenticated"
          ],
          "usingExpression": "(user_id = auth.uid())",
          "checkExpression": null
        }
      ],
      "helpers": [
        {
          "schema": "public",
          "name": "customer_has_access",
          "argumentTypes": [
            "uuid",
            "uuid"
          ],
          "returnType": "bool",
          "body": "\n  SELECT EXISTS (\n    SELECT 1\n    FROM customer_users cu\n    WHERE cu.customer_id = p_customer_id\n      AND cu.tenant_id = p_tenant_id\n      AND cu.user_id = (SELECT auth.uid())\n      AND cu.status = 'active'\n  );\n",
          "language": "sql",
          "securityDefiner": false,
          "volatility": "s",
          "parallel": "u",
          "strict": false,
          "leakproof": false,
          "config": [
            "search_path=public, auth"
          ],
          "argNames": [
            "p_customer_id",
            "p_tenant_id"
          ],
          "defaultCount": 0,
          "ownerRelation": {
            "schema": "public",
            "table": "object_contacts"
          },
          "directAcl": [
            {
              "grantee": "$owner",
              "grantor": "$owner",
              "privilege": "EXECUTE",
              "grantable": false
            },
            {
              "grantee": "authenticated",
              "grantor": "$owner",
              "privilege": "EXECUTE",
              "grantable": false
            }
          ],
          "effectiveExecute": [
            {
              "role": "$owner",
              "allowed": true
            },
            {
              "role": "PUBLIC",
              "allowed": false
            },
            {
              "role": "anon",
              "allowed": false
            },
            {
              "role": "authenticated",
              "allowed": true
            },
            {
              "role": "service_role",
              "allowed": false
            },
            {
              "role": "fieldgrid_runtime_data",
              "allowed": false
            },
            {
              "role": "fieldgrid_runtime_app",
              "allowed": false
            }
          ]
        },
        {
          "schema": "public",
          "name": "personnel_assigned_to_assignment",
          "argumentTypes": [
            "uuid"
          ],
          "returnType": "bool",
          "body": "\n  SELECT\n    (SELECT auth.uid()) IS NOT NULL\n    AND EXISTS (\n      SELECT 1\n      FROM public.assignment_personnel ap\n      JOIN public.assignments a\n        ON a.id = ap.assignment_id\n      JOIN public.personnel p\n        ON p.id = ap.personnel_id\n      WHERE ap.assignment_id = p_assignment_id\n        AND ap.status = 'assigned'\n        AND p.user_id = (SELECT auth.uid())\n        AND p.is_active = true\n        AND p.tenant_id IS NOT NULL\n        AND a.tenant_id IS NOT NULL\n        AND p.tenant_id = a.tenant_id\n    );\n",
          "language": "sql",
          "securityDefiner": true,
          "volatility": "s",
          "parallel": "u",
          "strict": false,
          "leakproof": false,
          "config": [
            "search_path=pg_catalog, public, auth"
          ],
          "argNames": [
            "p_assignment_id"
          ],
          "defaultCount": 0,
          "ownerRelation": {
            "schema": "public",
            "table": "object_contacts"
          },
          "directAcl": [
            {
              "grantee": "$owner",
              "grantor": "$owner",
              "privilege": "EXECUTE",
              "grantable": false
            },
            {
              "grantee": "authenticated",
              "grantor": "$owner",
              "privilege": "EXECUTE",
              "grantable": false
            }
          ],
          "effectiveExecute": [
            {
              "role": "$owner",
              "allowed": true
            },
            {
              "role": "PUBLIC",
              "allowed": false
            },
            {
              "role": "anon",
              "allowed": false
            },
            {
              "role": "authenticated",
              "allowed": true
            },
            {
              "role": "service_role",
              "allowed": false
            },
            {
              "role": "fieldgrid_runtime_data",
              "allowed": false
            },
            {
              "role": "fieldgrid_runtime_app",
              "allowed": false
            }
          ]
        },
        {
          "schema": "public",
          "name": "fieldgrid_has_platform_permission",
          "argumentTypes": [
            "text"
          ],
          "returnType": "bool",
          "body": "\n  SELECT EXISTS (\n    SELECT 1 FROM public.platform_users pu\n    WHERE pu.user_id = auth.uid() AND pu.status = 'active'\n      AND (\n        pu.role = 'owner'\n        OR (pu.role = 'admin' AND p_permission = ANY (ARRAY[\n          'global.rbac.manage', 'global.reference.manage', 'global.content.manage',\n          'platform.tenants.read', 'platform.audit.read'\n        ]))\n      )\n  );\n",
          "language": "sql",
          "securityDefiner": true,
          "volatility": "s",
          "parallel": "u",
          "strict": false,
          "leakproof": false,
          "config": [
            "search_path=pg_catalog, public, pg_temp"
          ],
          "argNames": [
            "p_permission"
          ],
          "defaultCount": 0,
          "ownerRelation": {
            "schema": "public",
            "table": "object_contacts"
          },
          "directAcl": [
            {
              "grantee": "$owner",
              "grantor": "$owner",
              "privilege": "EXECUTE",
              "grantable": false
            },
            {
              "grantee": "authenticated",
              "grantor": "$owner",
              "privilege": "EXECUTE",
              "grantable": false
            }
          ],
          "effectiveExecute": [
            {
              "role": "$owner",
              "allowed": true
            },
            {
              "role": "PUBLIC",
              "allowed": false
            },
            {
              "role": "anon",
              "allowed": false
            },
            {
              "role": "authenticated",
              "allowed": true
            },
            {
              "role": "service_role",
              "allowed": false
            },
            {
              "role": "fieldgrid_runtime_data",
              "allowed": false
            },
            {
              "role": "fieldgrid_runtime_app",
              "allowed": false
            }
          ]
        },
        {
          "schema": "auth",
          "name": "uid",
          "argumentTypes": [],
          "returnType": "uuid",
          "body": "\n  select \n  coalesce(\n    nullif(current_setting('request.jwt.claim.sub', true), ''),\n    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')\n  )::uuid\n",
          "language": "sql",
          "securityDefiner": false,
          "volatility": "s",
          "parallel": "u",
          "strict": false,
          "leakproof": false,
          "config": null,
          "argNames": null,
          "defaultCount": 0,
          "ownerRelation": {
            "schema": "auth",
            "table": "users"
          },
          "directAcl": [
            {
              "grantee": "$owner",
              "grantor": "$owner",
              "privilege": "EXECUTE",
              "grantable": false
            },
            {
              "grantee": "PUBLIC",
              "grantor": "$owner",
              "privilege": "EXECUTE",
              "grantable": false
            },
            {
              "grantee": "dashboard_user",
              "grantor": "$owner",
              "privilege": "EXECUTE",
              "grantable": false
            }
          ],
          "effectiveExecute": [
            {
              "role": "$owner",
              "allowed": true
            },
            {
              "role": "PUBLIC",
              "allowed": true
            },
            {
              "role": "anon",
              "allowed": true
            },
            {
              "role": "authenticated",
              "allowed": true
            },
            {
              "role": "service_role",
              "allowed": true
            },
            {
              "role": "fieldgrid_runtime_data",
              "allowed": true
            },
            {
              "role": "fieldgrid_runtime_app",
              "allowed": true
            }
          ]
        },
        {
          "schema": "auth",
          "name": "role",
          "argumentTypes": [],
          "returnType": "text",
          "body": "\n  select \n  coalesce(\n    nullif(current_setting('request.jwt.claim.role', true), ''),\n    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')\n  )::text\n",
          "language": "sql",
          "securityDefiner": false,
          "volatility": "s",
          "parallel": "u",
          "strict": false,
          "leakproof": false,
          "config": null,
          "argNames": null,
          "defaultCount": 0,
          "ownerRelation": {
            "schema": "auth",
            "table": "users"
          },
          "directAcl": [
            {
              "grantee": "$owner",
              "grantor": "$owner",
              "privilege": "EXECUTE",
              "grantable": false
            },
            {
              "grantee": "PUBLIC",
              "grantor": "$owner",
              "privilege": "EXECUTE",
              "grantable": false
            },
            {
              "grantee": "dashboard_user",
              "grantor": "$owner",
              "privilege": "EXECUTE",
              "grantable": false
            }
          ],
          "effectiveExecute": [
            {
              "role": "$owner",
              "allowed": true
            },
            {
              "role": "PUBLIC",
              "allowed": true
            },
            {
              "role": "anon",
              "allowed": true
            },
            {
              "role": "authenticated",
              "allowed": true
            },
            {
              "role": "service_role",
              "allowed": true
            },
            {
              "role": "fieldgrid_runtime_data",
              "allowed": true
            },
            {
              "role": "fieldgrid_runtime_app",
              "allowed": true
            }
          ]
        }
      ]
    }
  },
  {
    "state": "targetUpgrade",
    "profile": "hostedProvider",
    "manifest": {
      "version": 1,
      "postgresMajor": 17,
      "sources": [
        {
          "path": "lib/db/migrations/002_sprint1_rls.sql",
          "sha256": "16a27aa61943516314b9800d7b37a08eeb9c64441a5994c7da3f9badf7265238"
        },
        {
          "path": "lib/db/migrations/025_platform_schema_extensions.sql",
          "sha256": "8a57d65ba11e3122f897498093d1351f0cf57a2f1940850e266bbfc54c0b3636"
        },
        {
          "path": "lib/db/migrations/037_tenant_customer_users_events_hardening.sql",
          "sha256": "03a1ad0cbf406140c64b53da422abb62a45a6e0e9fb68832a8328ca6685d0b0e"
        },
        {
          "path": "lib/db/migrations/051_final_security_boundaries.sql",
          "sha256": "64f12a61bbd19cfbf4ec854c31560717bef4219433b03c09055f3f6f070181ff"
        },
        {
          "path": "lib/db/migrations/062_finance_reports_tenant_scope.sql",
          "sha256": "0ff1e8fcc5e0a3c7674ed084e6058e1a538ca0fed13e02f469fb0d363e055fbe"
        },
        {
          "path": "lib/db/migrations/063_payments_batches_audit_tenant_scope.sql",
          "sha256": "171caa7e6a8d4a8f624e475dc234d21b6c81e1e38802ddad3db778047f2053d2"
        },
        {
          "path": "lib/db/migrations/20260710200000_invoice_canon_credit_collection_payments.sql",
          "sha256": "78fc35f49a80a69ad7a7fe0dfc23c264dff2aba0fbfc49f702b3a7a74d1bc23f"
        },
        {
          "path": "lib/db/migrations/20260714120000_assignment_personnel_phase_b_direct_access_close.sql",
          "sha256": "7be5f0c1999d6eaadb22735d2243322d8aada1e64e3c4c44c4a3bc11d8317574"
        },
        {
          "path": "lib/db/migrations/20260718190000_phase2_security_reconciliation.sql",
          "sha256": "6cf0da37eec7c1b5b57c8218593873fedf1fae2a832b27e138dfd2614b861964"
        },
        {
          "path": "lib/db/migrations/20260909120000_runtime_least_privilege_principals.sql",
          "sha256": "2eaf25923d7908c94d1fb96c7fbede14858330d86be21656f50d611fe37e0066"
        },
        {
          "path": "migrations/013_sprint5_payments.sql",
          "sha256": "ea6d0e71764e92d0a0f0ad2d09a6bdf6c864c2a64d1ef717743b567d15198102"
        },
        {
          "path": "migrations/023_objects_extended.sql",
          "sha256": "19e20f3463f220a123450cefec79dc7490d5074c72f1a3f726ddfd1a28dde6ae"
        },
        {
          "path": "scripts/fieldgrid-runtime-safety-setup.mjs",
          "sha256": "f43d159c3e047bd752642e8005793df40314873a772c16c95eca7195f5c34666"
        },
        {
          "path": "tests/fixtures/fieldgrid-supabase-auth-functions.sql",
          "sha256": "5b72022d73e64a8e474d2122ac42f299bb7ce4d59755cdcc78e72abfe5d47dc0"
        }
      ],
      "relations": [
        {
          "schema": "public",
          "table": "invoices",
          "kind": "r",
          "rowSecurity": true,
          "forceRowSecurity": false,
          "columns": [
            {
              "name": "created_by",
              "notNull": false,
              "typeName": "uuid",
              "typeModifier": -1
            },
            {
              "name": "id",
              "notNull": true,
              "typeName": "uuid",
              "typeModifier": -1
            },
            {
              "name": "tenant_id",
              "notNull": true,
              "typeName": "uuid",
              "typeModifier": -1
            }
          ]
        },
        {
          "schema": "public",
          "table": "object_contacts",
          "kind": "r",
          "rowSecurity": true,
          "forceRowSecurity": false,
          "columns": [
            {
              "name": "id",
              "notNull": true,
              "typeName": "uuid",
              "typeModifier": -1
            },
            {
              "name": "object_id",
              "notNull": true,
              "typeName": "uuid",
              "typeModifier": -1
            }
          ]
        },
        {
          "schema": "public",
          "table": "object_personnel",
          "kind": "r",
          "rowSecurity": true,
          "forceRowSecurity": false,
          "columns": [
            {
              "name": "object_id",
              "notNull": true,
              "typeName": "uuid",
              "typeModifier": -1
            },
            {
              "name": "personnel_id",
              "notNull": true,
              "typeName": "uuid",
              "typeModifier": -1
            }
          ]
        },
        {
          "schema": "public",
          "table": "objects",
          "kind": "r",
          "rowSecurity": true,
          "forceRowSecurity": false,
          "columns": [
            {
              "name": "id",
              "notNull": true,
              "typeName": "uuid",
              "typeModifier": -1
            },
            {
              "name": "tenant_id",
              "notNull": true,
              "typeName": "uuid",
              "typeModifier": -1
            }
          ]
        },
        {
          "schema": "public",
          "table": "payments",
          "kind": "r",
          "rowSecurity": true,
          "forceRowSecurity": false,
          "columns": [
            {
              "name": "id",
              "notNull": true,
              "typeName": "uuid",
              "typeModifier": -1
            },
            {
              "name": "invoice_id",
              "notNull": false,
              "typeName": "uuid",
              "typeModifier": -1
            },
            {
              "name": "tenant_id",
              "notNull": true,
              "typeName": "uuid",
              "typeModifier": -1
            }
          ]
        },
        {
          "schema": "public",
          "table": "personnel",
          "kind": "r",
          "rowSecurity": true,
          "forceRowSecurity": false,
          "columns": [
            {
              "name": "id",
              "notNull": true,
              "typeName": "uuid",
              "typeModifier": -1
            },
            {
              "name": "tenant_id",
              "notNull": true,
              "typeName": "uuid",
              "typeModifier": -1
            }
          ]
        }
      ],
      "policies": [
        {
          "schema": "public",
          "table": "invoices",
          "name": "fieldgrid_runtime_data_insert",
          "command": "a",
          "permissive": true,
          "roles": [
            "fieldgrid_runtime_data"
          ],
          "usingExpression": null,
          "checkExpression": "true"
        },
        {
          "schema": "public",
          "table": "invoices",
          "name": "fieldgrid_runtime_data_select",
          "command": "r",
          "permissive": true,
          "roles": [
            "fieldgrid_runtime_data"
          ],
          "usingExpression": "true",
          "checkExpression": null
        },
        {
          "schema": "public",
          "table": "invoices",
          "name": "fieldgrid_runtime_data_update",
          "command": "w",
          "permissive": true,
          "roles": [
            "fieldgrid_runtime_data"
          ],
          "usingExpression": "true",
          "checkExpression": "true"
        },
        {
          "schema": "public",
          "table": "invoices",
          "name": "invoices_customer_sent_select",
          "command": "r",
          "permissive": true,
          "roles": [
            "authenticated"
          ],
          "usingExpression": "(((status)::text = ANY ((ARRAY['sent'::character varying, 'paid'::character varying, 'cancelled'::character varying])::text[])) AND (EXISTS ( SELECT 1\n   FROM public.customers c\n  WHERE ((c.id = invoices.customer_id) AND public.customer_has_access(c.id, c.tenant_id)))))",
          "checkExpression": null
        },
        {
          "schema": "public",
          "table": "invoices",
          "name": "invoices_management_all",
          "command": "*",
          "permissive": true,
          "roles": [
            "authenticated"
          ],
          "usingExpression": "public.is_management_for_tenant(tenant_id)",
          "checkExpression": "public.is_management_for_tenant(tenant_id)"
        },
        {
          "schema": "public",
          "table": "object_contacts",
          "name": "fieldgrid_runtime_data_delete",
          "command": "d",
          "permissive": true,
          "roles": [
            "fieldgrid_runtime_data"
          ],
          "usingExpression": "true",
          "checkExpression": null
        },
        {
          "schema": "public",
          "table": "object_contacts",
          "name": "fieldgrid_runtime_data_insert",
          "command": "a",
          "permissive": true,
          "roles": [
            "fieldgrid_runtime_data"
          ],
          "usingExpression": null,
          "checkExpression": "true"
        },
        {
          "schema": "public",
          "table": "object_contacts",
          "name": "fieldgrid_runtime_data_select",
          "command": "r",
          "permissive": true,
          "roles": [
            "fieldgrid_runtime_data"
          ],
          "usingExpression": "true",
          "checkExpression": null
        },
        {
          "schema": "public",
          "table": "object_contacts",
          "name": "fieldgrid_runtime_data_update",
          "command": "w",
          "permissive": true,
          "roles": [
            "fieldgrid_runtime_data"
          ],
          "usingExpression": "true",
          "checkExpression": "true"
        },
        {
          "schema": "public",
          "table": "object_contacts",
          "name": "object_contacts_customer_users_delete",
          "command": "d",
          "permissive": true,
          "roles": [
            "authenticated"
          ],
          "usingExpression": "(EXISTS ( SELECT 1\n   FROM public.objects o\n  WHERE ((o.id = object_contacts.object_id) AND public.customer_has_access(o.customer_id, o.tenant_id))))",
          "checkExpression": null
        },
        {
          "schema": "public",
          "table": "object_contacts",
          "name": "object_contacts_customer_users_insert",
          "command": "a",
          "permissive": true,
          "roles": [
            "authenticated"
          ],
          "usingExpression": null,
          "checkExpression": "(EXISTS ( SELECT 1\n   FROM public.objects o\n  WHERE ((o.id = object_contacts.object_id) AND public.customer_has_access(o.customer_id, o.tenant_id))))"
        },
        {
          "schema": "public",
          "table": "object_contacts",
          "name": "object_contacts_customer_users_select",
          "command": "r",
          "permissive": true,
          "roles": [
            "authenticated"
          ],
          "usingExpression": "(EXISTS ( SELECT 1\n   FROM public.objects o\n  WHERE ((o.id = object_contacts.object_id) AND public.customer_has_access(o.customer_id, o.tenant_id))))",
          "checkExpression": null
        },
        {
          "schema": "public",
          "table": "object_contacts",
          "name": "object_contacts_customer_users_update",
          "command": "w",
          "permissive": true,
          "roles": [
            "authenticated"
          ],
          "usingExpression": "(EXISTS ( SELECT 1\n   FROM public.objects o\n  WHERE ((o.id = object_contacts.object_id) AND public.customer_has_access(o.customer_id, o.tenant_id))))",
          "checkExpression": "(EXISTS ( SELECT 1\n   FROM public.objects o\n  WHERE ((o.id = object_contacts.object_id) AND public.customer_has_access(o.customer_id, o.tenant_id))))"
        },
        {
          "schema": "public",
          "table": "object_contacts",
          "name": "object_contacts_management",
          "command": "*",
          "permissive": true,
          "roles": [
            "authenticated"
          ],
          "usingExpression": "(EXISTS ( SELECT 1\n   FROM public.objects o\n  WHERE ((o.id = object_contacts.object_id) AND public.is_management_for_tenant(o.tenant_id))))",
          "checkExpression": "(EXISTS ( SELECT 1\n   FROM public.objects o\n  WHERE ((o.id = object_contacts.object_id) AND public.is_management_for_tenant(o.tenant_id))))"
        },
        {
          "schema": "public",
          "table": "object_personnel",
          "name": "fieldgrid_runtime_data_delete",
          "command": "d",
          "permissive": true,
          "roles": [
            "fieldgrid_runtime_data"
          ],
          "usingExpression": "true",
          "checkExpression": null
        },
        {
          "schema": "public",
          "table": "object_personnel",
          "name": "fieldgrid_runtime_data_insert",
          "command": "a",
          "permissive": true,
          "roles": [
            "fieldgrid_runtime_data"
          ],
          "usingExpression": null,
          "checkExpression": "true"
        },
        {
          "schema": "public",
          "table": "object_personnel",
          "name": "fieldgrid_runtime_data_select",
          "command": "r",
          "permissive": true,
          "roles": [
            "fieldgrid_runtime_data"
          ],
          "usingExpression": "true",
          "checkExpression": null
        },
        {
          "schema": "public",
          "table": "object_personnel",
          "name": "object_personnel_management",
          "command": "*",
          "permissive": true,
          "roles": [
            "authenticated"
          ],
          "usingExpression": "(EXISTS ( SELECT 1\n   FROM (public.objects o\n     JOIN public.personnel p ON (((p.id = object_personnel.personnel_id) AND (p.tenant_id = o.tenant_id))))\n  WHERE ((o.id = object_personnel.object_id) AND public.is_management_for_tenant(o.tenant_id))))",
          "checkExpression": "(EXISTS ( SELECT 1\n   FROM (public.objects o\n     JOIN public.personnel p ON (((p.id = object_personnel.personnel_id) AND (p.tenant_id = o.tenant_id))))\n  WHERE ((o.id = object_personnel.object_id) AND public.is_management_for_tenant(o.tenant_id))))"
        },
        {
          "schema": "public",
          "table": "objects",
          "name": "fieldgrid_runtime_data_delete",
          "command": "d",
          "permissive": true,
          "roles": [
            "fieldgrid_runtime_data"
          ],
          "usingExpression": "true",
          "checkExpression": null
        },
        {
          "schema": "public",
          "table": "objects",
          "name": "fieldgrid_runtime_data_insert",
          "command": "a",
          "permissive": true,
          "roles": [
            "fieldgrid_runtime_data"
          ],
          "usingExpression": null,
          "checkExpression": "true"
        },
        {
          "schema": "public",
          "table": "objects",
          "name": "fieldgrid_runtime_data_select",
          "command": "r",
          "permissive": true,
          "roles": [
            "fieldgrid_runtime_data"
          ],
          "usingExpression": "true",
          "checkExpression": null
        },
        {
          "schema": "public",
          "table": "objects",
          "name": "fieldgrid_runtime_data_update",
          "command": "w",
          "permissive": true,
          "roles": [
            "fieldgrid_runtime_data"
          ],
          "usingExpression": "true",
          "checkExpression": "true"
        },
        {
          "schema": "public",
          "table": "objects",
          "name": "objects_customer_users_insert",
          "command": "a",
          "permissive": true,
          "roles": [
            "authenticated"
          ],
          "usingExpression": null,
          "checkExpression": "public.customer_has_access(customer_id, tenant_id)"
        },
        {
          "schema": "public",
          "table": "objects",
          "name": "objects_customer_users_select",
          "command": "r",
          "permissive": true,
          "roles": [
            "authenticated"
          ],
          "usingExpression": "public.customer_has_access(customer_id, tenant_id)",
          "checkExpression": null
        },
        {
          "schema": "public",
          "table": "objects",
          "name": "objects_customer_users_update",
          "command": "w",
          "permissive": true,
          "roles": [
            "authenticated"
          ],
          "usingExpression": "public.customer_has_access(customer_id, tenant_id)",
          "checkExpression": "public.customer_has_access(customer_id, tenant_id)"
        },
        {
          "schema": "public",
          "table": "objects",
          "name": "objects_management",
          "command": "*",
          "permissive": true,
          "roles": [
            "authenticated"
          ],
          "usingExpression": "public.is_management_for_tenant(tenant_id)",
          "checkExpression": "public.is_management_for_tenant(tenant_id)"
        },
        {
          "schema": "public",
          "table": "objects",
          "name": "personnel_select_assigned_objects",
          "command": "r",
          "permissive": true,
          "roles": [
            "authenticated"
          ],
          "usingExpression": "(EXISTS ( SELECT 1\n   FROM public.assignments a\n  WHERE ((a.object_id = objects.id) AND public.personnel_assigned_to_assignment(a.id))))",
          "checkExpression": null
        },
        {
          "schema": "public",
          "table": "payments",
          "name": "fieldgrid_runtime_data_insert",
          "command": "a",
          "permissive": true,
          "roles": [
            "fieldgrid_runtime_data"
          ],
          "usingExpression": null,
          "checkExpression": "true"
        },
        {
          "schema": "public",
          "table": "payments",
          "name": "fieldgrid_runtime_data_select",
          "command": "r",
          "permissive": true,
          "roles": [
            "fieldgrid_runtime_data"
          ],
          "usingExpression": "true",
          "checkExpression": null
        },
        {
          "schema": "public",
          "table": "payments",
          "name": "fieldgrid_runtime_data_update",
          "command": "w",
          "permissive": true,
          "roles": [
            "fieldgrid_runtime_data"
          ],
          "usingExpression": "true",
          "checkExpression": "true"
        },
        {
          "schema": "public",
          "table": "payments",
          "name": "owner_or_staff_read_payments",
          "command": "r",
          "permissive": true,
          "roles": [
            "authenticated"
          ],
          "usingExpression": "(EXISTS ( SELECT 1\n   FROM public.invoices i\n  WHERE ((i.id = payments.invoice_id) AND (i.tenant_id = payments.tenant_id) AND ((i.created_by = auth.uid()) OR public.is_management_for_tenant(i.tenant_id)))))",
          "checkExpression": null
        },
        {
          "schema": "public",
          "table": "payments",
          "name": "service_role_all_payments",
          "command": "*",
          "permissive": true,
          "roles": [
            "PUBLIC"
          ],
          "usingExpression": "(auth.role() = 'service_role'::text)",
          "checkExpression": "(auth.role() = 'service_role'::text)"
        },
        {
          "schema": "public",
          "table": "personnel",
          "name": "fieldgrid_runtime_data_delete",
          "command": "d",
          "permissive": true,
          "roles": [
            "fieldgrid_runtime_data"
          ],
          "usingExpression": "true",
          "checkExpression": null
        },
        {
          "schema": "public",
          "table": "personnel",
          "name": "fieldgrid_runtime_data_insert",
          "command": "a",
          "permissive": true,
          "roles": [
            "fieldgrid_runtime_data"
          ],
          "usingExpression": null,
          "checkExpression": "true"
        },
        {
          "schema": "public",
          "table": "personnel",
          "name": "fieldgrid_runtime_data_select",
          "command": "r",
          "permissive": true,
          "roles": [
            "fieldgrid_runtime_data"
          ],
          "usingExpression": "true",
          "checkExpression": null
        },
        {
          "schema": "public",
          "table": "personnel",
          "name": "fieldgrid_runtime_data_update",
          "command": "w",
          "permissive": true,
          "roles": [
            "fieldgrid_runtime_data"
          ],
          "usingExpression": "true",
          "checkExpression": "true"
        },
        {
          "schema": "public",
          "table": "personnel",
          "name": "personnel_management",
          "command": "*",
          "permissive": true,
          "roles": [
            "authenticated"
          ],
          "usingExpression": "public.is_management_for_tenant(tenant_id)",
          "checkExpression": "public.is_management_for_tenant(tenant_id)"
        },
        {
          "schema": "public",
          "table": "personnel",
          "name": "personnel_select_own",
          "command": "r",
          "permissive": true,
          "roles": [
            "authenticated"
          ],
          "usingExpression": "(user_id = auth.uid())",
          "checkExpression": null
        }
      ],
      "helpers": [
        {
          "schema": "public",
          "name": "customer_has_access",
          "argumentTypes": [
            "uuid",
            "uuid"
          ],
          "returnType": "bool",
          "body": "\n  SELECT EXISTS (\n    SELECT 1\n    FROM customer_users cu\n    WHERE cu.customer_id = p_customer_id\n      AND cu.tenant_id = p_tenant_id\n      AND cu.user_id = (SELECT auth.uid())\n      AND cu.status = 'active'\n  );\n",
          "language": "sql",
          "securityDefiner": false,
          "volatility": "s",
          "parallel": "u",
          "strict": false,
          "leakproof": false,
          "config": [
            "search_path=public, auth"
          ],
          "argNames": [
            "p_customer_id",
            "p_tenant_id"
          ],
          "defaultCount": 0,
          "ownerRelation": {
            "schema": "public",
            "table": "object_contacts"
          },
          "directAcl": [
            {
              "grantee": "$owner",
              "grantor": "$owner",
              "privilege": "EXECUTE",
              "grantable": false
            },
            {
              "grantee": "authenticated",
              "grantor": "$owner",
              "privilege": "EXECUTE",
              "grantable": false
            }
          ],
          "effectiveExecute": [
            {
              "role": "$owner",
              "allowed": true
            },
            {
              "role": "PUBLIC",
              "allowed": false
            },
            {
              "role": "anon",
              "allowed": false
            },
            {
              "role": "authenticated",
              "allowed": true
            },
            {
              "role": "service_role",
              "allowed": false
            },
            {
              "role": "fieldgrid_runtime_data",
              "allowed": false
            },
            {
              "role": "fieldgrid_runtime_app",
              "allowed": false
            }
          ]
        },
        {
          "schema": "public",
          "name": "personnel_assigned_to_assignment",
          "argumentTypes": [
            "uuid"
          ],
          "returnType": "bool",
          "body": "\n  SELECT\n    (SELECT auth.uid()) IS NOT NULL\n    AND EXISTS (\n      SELECT 1\n      FROM public.assignment_personnel ap\n      JOIN public.assignments a\n        ON a.id = ap.assignment_id\n      JOIN public.personnel p\n        ON p.id = ap.personnel_id\n      WHERE ap.assignment_id = p_assignment_id\n        AND ap.status = 'assigned'\n        AND p.user_id = (SELECT auth.uid())\n        AND p.is_active = true\n        AND p.tenant_id IS NOT NULL\n        AND a.tenant_id IS NOT NULL\n        AND p.tenant_id = a.tenant_id\n    );\n",
          "language": "sql",
          "securityDefiner": true,
          "volatility": "s",
          "parallel": "u",
          "strict": false,
          "leakproof": false,
          "config": [
            "search_path=pg_catalog, public, auth"
          ],
          "argNames": [
            "p_assignment_id"
          ],
          "defaultCount": 0,
          "ownerRelation": {
            "schema": "public",
            "table": "object_contacts"
          },
          "directAcl": [
            {
              "grantee": "$owner",
              "grantor": "$owner",
              "privilege": "EXECUTE",
              "grantable": false
            },
            {
              "grantee": "authenticated",
              "grantor": "$owner",
              "privilege": "EXECUTE",
              "grantable": false
            }
          ],
          "effectiveExecute": [
            {
              "role": "$owner",
              "allowed": true
            },
            {
              "role": "PUBLIC",
              "allowed": false
            },
            {
              "role": "anon",
              "allowed": false
            },
            {
              "role": "authenticated",
              "allowed": true
            },
            {
              "role": "service_role",
              "allowed": false
            },
            {
              "role": "fieldgrid_runtime_data",
              "allowed": false
            },
            {
              "role": "fieldgrid_runtime_app",
              "allowed": false
            }
          ]
        },
        {
          "schema": "public",
          "name": "fieldgrid_has_platform_permission",
          "argumentTypes": [
            "text"
          ],
          "returnType": "bool",
          "body": "\n  SELECT EXISTS (\n    SELECT 1 FROM public.platform_users pu\n    WHERE pu.user_id = auth.uid() AND pu.status = 'active'\n      AND (\n        pu.role = 'owner'\n        OR (pu.role = 'admin' AND p_permission = ANY (ARRAY[\n          'global.rbac.manage', 'global.reference.manage', 'global.content.manage',\n          'platform.tenants.read', 'platform.audit.read'\n        ]))\n      )\n  );\n",
          "language": "sql",
          "securityDefiner": true,
          "volatility": "s",
          "parallel": "u",
          "strict": false,
          "leakproof": false,
          "config": [
            "search_path=pg_catalog, public, pg_temp"
          ],
          "argNames": [
            "p_permission"
          ],
          "defaultCount": 0,
          "ownerRelation": {
            "schema": "public",
            "table": "object_contacts"
          },
          "directAcl": [
            {
              "grantee": "$owner",
              "grantor": "$owner",
              "privilege": "EXECUTE",
              "grantable": false
            },
            {
              "grantee": "authenticated",
              "grantor": "$owner",
              "privilege": "EXECUTE",
              "grantable": false
            }
          ],
          "effectiveExecute": [
            {
              "role": "$owner",
              "allowed": true
            },
            {
              "role": "PUBLIC",
              "allowed": false
            },
            {
              "role": "anon",
              "allowed": false
            },
            {
              "role": "authenticated",
              "allowed": true
            },
            {
              "role": "service_role",
              "allowed": false
            },
            {
              "role": "fieldgrid_runtime_data",
              "allowed": false
            },
            {
              "role": "fieldgrid_runtime_app",
              "allowed": false
            }
          ]
        },
        {
          "schema": "auth",
          "name": "uid",
          "argumentTypes": [],
          "returnType": "uuid",
          "body": "\n  select \n  coalesce(\n    nullif(current_setting('request.jwt.claim.sub', true), ''),\n    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')\n  )::uuid\n",
          "language": "sql",
          "securityDefiner": false,
          "volatility": "s",
          "parallel": "u",
          "strict": false,
          "leakproof": false,
          "config": null,
          "argNames": null,
          "defaultCount": 0,
          "ownerRelation": {
            "schema": "auth",
            "table": "users"
          },
          "directAcl": [
            {
              "grantee": "$owner",
              "grantor": "$owner",
              "privilege": "EXECUTE",
              "grantable": false
            },
            {
              "grantee": "PUBLIC",
              "grantor": "$owner",
              "privilege": "EXECUTE",
              "grantable": false
            },
            {
              "grantee": "dashboard_user",
              "grantor": "$owner",
              "privilege": "EXECUTE",
              "grantable": false
            }
          ],
          "effectiveExecute": [
            {
              "role": "$owner",
              "allowed": true
            },
            {
              "role": "PUBLIC",
              "allowed": true
            },
            {
              "role": "anon",
              "allowed": true
            },
            {
              "role": "authenticated",
              "allowed": true
            },
            {
              "role": "service_role",
              "allowed": true
            },
            {
              "role": "fieldgrid_runtime_data",
              "allowed": true
            },
            {
              "role": "fieldgrid_runtime_app",
              "allowed": true
            }
          ]
        },
        {
          "schema": "auth",
          "name": "role",
          "argumentTypes": [],
          "returnType": "text",
          "body": "\n  select \n  coalesce(\n    nullif(current_setting('request.jwt.claim.role', true), ''),\n    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')\n  )::text\n",
          "language": "sql",
          "securityDefiner": false,
          "volatility": "s",
          "parallel": "u",
          "strict": false,
          "leakproof": false,
          "config": null,
          "argNames": null,
          "defaultCount": 0,
          "ownerRelation": {
            "schema": "auth",
            "table": "users"
          },
          "directAcl": [
            {
              "grantee": "$owner",
              "grantor": "$owner",
              "privilege": "EXECUTE",
              "grantable": false
            },
            {
              "grantee": "PUBLIC",
              "grantor": "$owner",
              "privilege": "EXECUTE",
              "grantable": false
            },
            {
              "grantee": "dashboard_user",
              "grantor": "$owner",
              "privilege": "EXECUTE",
              "grantable": false
            }
          ],
          "effectiveExecute": [
            {
              "role": "$owner",
              "allowed": true
            },
            {
              "role": "PUBLIC",
              "allowed": true
            },
            {
              "role": "anon",
              "allowed": true
            },
            {
              "role": "authenticated",
              "allowed": true
            },
            {
              "role": "service_role",
              "allowed": true
            },
            {
              "role": "fieldgrid_runtime_data",
              "allowed": true
            },
            {
              "role": "fieldgrid_runtime_app",
              "allowed": true
            }
          ]
        }
      ]
    }
  },
  {
    "state": "legacy",
    "profile": "hostedObservedLegacy",
    "manifest": {
      "version": 1,
      "postgresMajor": 17,
      "sources": [
        {
          "path": "lib/db/migrations/002_sprint1_rls.sql",
          "sha256": "16a27aa61943516314b9800d7b37a08eeb9c64441a5994c7da3f9badf7265238"
        },
        {
          "path": "lib/db/migrations/025_platform_schema_extensions.sql",
          "sha256": "8a57d65ba11e3122f897498093d1351f0cf57a2f1940850e266bbfc54c0b3636"
        },
        {
          "path": "lib/db/migrations/037_tenant_customer_users_events_hardening.sql",
          "sha256": "03a1ad0cbf406140c64b53da422abb62a45a6e0e9fb68832a8328ca6685d0b0e"
        },
        {
          "path": "lib/db/migrations/051_final_security_boundaries.sql",
          "sha256": "64f12a61bbd19cfbf4ec854c31560717bef4219433b03c09055f3f6f070181ff"
        },
        {
          "path": "lib/db/migrations/062_finance_reports_tenant_scope.sql",
          "sha256": "0ff1e8fcc5e0a3c7674ed084e6058e1a538ca0fed13e02f469fb0d363e055fbe"
        },
        {
          "path": "lib/db/migrations/063_payments_batches_audit_tenant_scope.sql",
          "sha256": "171caa7e6a8d4a8f624e475dc234d21b6c81e1e38802ddad3db778047f2053d2"
        },
        {
          "path": "lib/db/migrations/20260710200000_invoice_canon_credit_collection_payments.sql",
          "sha256": "78fc35f49a80a69ad7a7fe0dfc23c264dff2aba0fbfc49f702b3a7a74d1bc23f"
        },
        {
          "path": "lib/db/migrations/20260714120000_assignment_personnel_phase_b_direct_access_close.sql",
          "sha256": "7be5f0c1999d6eaadb22735d2243322d8aada1e64e3c4c44c4a3bc11d8317574"
        },
        {
          "path": "lib/db/migrations/20260718190000_phase2_security_reconciliation.sql",
          "sha256": "6cf0da37eec7c1b5b57c8218593873fedf1fae2a832b27e138dfd2614b861964"
        },
        {
          "path": "lib/db/migrations/20260909120000_runtime_least_privilege_principals.sql",
          "sha256": "2eaf25923d7908c94d1fb96c7fbede14858330d86be21656f50d611fe37e0066"
        },
        {
          "path": "migrations/013_sprint5_payments.sql",
          "sha256": "ea6d0e71764e92d0a0f0ad2d09a6bdf6c864c2a64d1ef717743b567d15198102"
        },
        {
          "path": "migrations/023_objects_extended.sql",
          "sha256": "19e20f3463f220a123450cefec79dc7490d5074c72f1a3f726ddfd1a28dde6ae"
        },
        {
          "path": "scripts/fieldgrid-runtime-safety-setup.mjs",
          "sha256": "f43d159c3e047bd752642e8005793df40314873a772c16c95eca7195f5c34666"
        },
        {
          "path": "tests/fixtures/fieldgrid-supabase-auth-functions.sql",
          "sha256": "5b72022d73e64a8e474d2122ac42f299bb7ce4d59755cdcc78e72abfe5d47dc0"
        }
      ],
      "relations": [
        {
          "schema": "public",
          "table": "invoices",
          "kind": "r",
          "rowSecurity": true,
          "forceRowSecurity": false,
          "columns": [
            {
              "name": "created_by",
              "notNull": false,
              "typeName": "uuid",
              "typeModifier": -1
            },
            {
              "name": "id",
              "notNull": true,
              "typeName": "uuid",
              "typeModifier": -1
            },
            {
              "name": "tenant_id",
              "notNull": true,
              "typeName": "uuid",
              "typeModifier": -1
            }
          ]
        },
        {
          "schema": "public",
          "table": "object_contacts",
          "kind": "r",
          "rowSecurity": true,
          "forceRowSecurity": false,
          "columns": [
            {
              "name": "id",
              "notNull": true,
              "typeName": "uuid",
              "typeModifier": -1
            },
            {
              "name": "object_id",
              "notNull": true,
              "typeName": "uuid",
              "typeModifier": -1
            }
          ]
        },
        {
          "schema": "public",
          "table": "object_personnel",
          "kind": "r",
          "rowSecurity": true,
          "forceRowSecurity": false,
          "columns": [
            {
              "name": "object_id",
              "notNull": true,
              "typeName": "uuid",
              "typeModifier": -1
            },
            {
              "name": "personnel_id",
              "notNull": true,
              "typeName": "uuid",
              "typeModifier": -1
            }
          ]
        },
        {
          "schema": "public",
          "table": "objects",
          "kind": "r",
          "rowSecurity": true,
          "forceRowSecurity": false,
          "columns": [
            {
              "name": "id",
              "notNull": true,
              "typeName": "uuid",
              "typeModifier": -1
            },
            {
              "name": "tenant_id",
              "notNull": true,
              "typeName": "uuid",
              "typeModifier": -1
            }
          ]
        },
        {
          "schema": "public",
          "table": "payments",
          "kind": "r",
          "rowSecurity": true,
          "forceRowSecurity": false,
          "columns": [
            {
              "name": "id",
              "notNull": true,
              "typeName": "uuid",
              "typeModifier": -1
            },
            {
              "name": "invoice_id",
              "notNull": false,
              "typeName": "uuid",
              "typeModifier": -1
            },
            {
              "name": "tenant_id",
              "notNull": true,
              "typeName": "uuid",
              "typeModifier": -1
            }
          ]
        },
        {
          "schema": "public",
          "table": "personnel",
          "kind": "r",
          "rowSecurity": true,
          "forceRowSecurity": false,
          "columns": [
            {
              "name": "id",
              "notNull": true,
              "typeName": "uuid",
              "typeModifier": -1
            },
            {
              "name": "tenant_id",
              "notNull": true,
              "typeName": "uuid",
              "typeModifier": -1
            }
          ]
        }
      ],
      "policies": [
        {
          "schema": "public",
          "table": "invoices",
          "name": "fieldgrid_runtime_data_insert",
          "command": "a",
          "permissive": true,
          "roles": [
            "fieldgrid_runtime_data"
          ],
          "usingExpression": null,
          "checkExpression": "true"
        },
        {
          "schema": "public",
          "table": "invoices",
          "name": "fieldgrid_runtime_data_select",
          "command": "r",
          "permissive": true,
          "roles": [
            "fieldgrid_runtime_data"
          ],
          "usingExpression": "true",
          "checkExpression": null
        },
        {
          "schema": "public",
          "table": "invoices",
          "name": "fieldgrid_runtime_data_update",
          "command": "w",
          "permissive": true,
          "roles": [
            "fieldgrid_runtime_data"
          ],
          "usingExpression": "true",
          "checkExpression": "true"
        },
        {
          "schema": "public",
          "table": "invoices",
          "name": "invoices_customer_sent_select",
          "command": "r",
          "permissive": true,
          "roles": [
            "authenticated"
          ],
          "usingExpression": "(((status)::text = ANY ((ARRAY['sent'::character varying, 'paid'::character varying, 'cancelled'::character varying])::text[])) AND (EXISTS ( SELECT 1\n   FROM public.customers c\n  WHERE ((c.id = invoices.customer_id) AND public.customer_has_access(c.id, c.tenant_id)))))",
          "checkExpression": null
        },
        {
          "schema": "public",
          "table": "invoices",
          "name": "invoices_management_all",
          "command": "*",
          "permissive": true,
          "roles": [
            "authenticated"
          ],
          "usingExpression": "public.is_management_for_tenant(tenant_id)",
          "checkExpression": "public.is_management_for_tenant(tenant_id)"
        },
        {
          "schema": "public",
          "table": "object_contacts",
          "name": "fieldgrid_runtime_data_delete",
          "command": "d",
          "permissive": true,
          "roles": [
            "fieldgrid_runtime_data"
          ],
          "usingExpression": "true",
          "checkExpression": null
        },
        {
          "schema": "public",
          "table": "object_contacts",
          "name": "fieldgrid_runtime_data_insert",
          "command": "a",
          "permissive": true,
          "roles": [
            "fieldgrid_runtime_data"
          ],
          "usingExpression": null,
          "checkExpression": "true"
        },
        {
          "schema": "public",
          "table": "object_contacts",
          "name": "fieldgrid_runtime_data_select",
          "command": "r",
          "permissive": true,
          "roles": [
            "fieldgrid_runtime_data"
          ],
          "usingExpression": "true",
          "checkExpression": null
        },
        {
          "schema": "public",
          "table": "object_contacts",
          "name": "fieldgrid_runtime_data_update",
          "command": "w",
          "permissive": true,
          "roles": [
            "fieldgrid_runtime_data"
          ],
          "usingExpression": "true",
          "checkExpression": "true"
        },
        {
          "schema": "public",
          "table": "object_contacts",
          "name": "object_contacts_customer_users_delete",
          "command": "d",
          "permissive": true,
          "roles": [
            "authenticated"
          ],
          "usingExpression": "(EXISTS ( SELECT 1\n   FROM public.objects o\n  WHERE ((o.id = object_contacts.object_id) AND public.customer_has_access(o.customer_id, o.tenant_id))))",
          "checkExpression": null
        },
        {
          "schema": "public",
          "table": "object_contacts",
          "name": "object_contacts_customer_users_insert",
          "command": "a",
          "permissive": true,
          "roles": [
            "authenticated"
          ],
          "usingExpression": null,
          "checkExpression": "(EXISTS ( SELECT 1\n   FROM public.objects o\n  WHERE ((o.id = object_contacts.object_id) AND public.customer_has_access(o.customer_id, o.tenant_id))))"
        },
        {
          "schema": "public",
          "table": "object_contacts",
          "name": "object_contacts_customer_users_select",
          "command": "r",
          "permissive": true,
          "roles": [
            "authenticated"
          ],
          "usingExpression": "(EXISTS ( SELECT 1\n   FROM public.objects o\n  WHERE ((o.id = object_contacts.object_id) AND public.customer_has_access(o.customer_id, o.tenant_id))))",
          "checkExpression": null
        },
        {
          "schema": "public",
          "table": "object_contacts",
          "name": "object_contacts_customer_users_update",
          "command": "w",
          "permissive": true,
          "roles": [
            "authenticated"
          ],
          "usingExpression": "(EXISTS ( SELECT 1\n   FROM public.objects o\n  WHERE ((o.id = object_contacts.object_id) AND public.customer_has_access(o.customer_id, o.tenant_id))))",
          "checkExpression": "(EXISTS ( SELECT 1\n   FROM public.objects o\n  WHERE ((o.id = object_contacts.object_id) AND public.customer_has_access(o.customer_id, o.tenant_id))))"
        },
        {
          "schema": "public",
          "table": "object_contacts",
          "name": "object_contacts_management",
          "command": "*",
          "permissive": true,
          "roles": [
            "authenticated"
          ],
          "usingExpression": "(EXISTS ( SELECT 1\n   FROM public.objects o\n  WHERE ((o.id = object_contacts.object_id) AND public.is_management_for_tenant(o.tenant_id))))",
          "checkExpression": "(EXISTS ( SELECT 1\n   FROM public.objects o\n  WHERE ((o.id = object_contacts.object_id) AND public.is_management_for_tenant(o.tenant_id))))"
        },
        {
          "schema": "public",
          "table": "object_contacts",
          "name": "object_contacts_management_all",
          "command": "*",
          "permissive": true,
          "roles": [
            "PUBLIC"
          ],
          "usingExpression": "(EXISTS ( SELECT 1\n   FROM (public.user_roles ur\n     JOIN public.roles r ON ((r.id = ur.role_id)))\n  WHERE ((ur.user_id = auth.uid()) AND ((r.name)::text = ANY ((ARRAY['Management'::character varying, 'Administration'::character varying, 'Planning'::character varying, 'Support'::character varying])::text[])))))",
          "checkExpression": null
        },
        {
          "schema": "public",
          "table": "object_personnel",
          "name": "fieldgrid_runtime_data_delete",
          "command": "d",
          "permissive": true,
          "roles": [
            "fieldgrid_runtime_data"
          ],
          "usingExpression": "true",
          "checkExpression": null
        },
        {
          "schema": "public",
          "table": "object_personnel",
          "name": "fieldgrid_runtime_data_insert",
          "command": "a",
          "permissive": true,
          "roles": [
            "fieldgrid_runtime_data"
          ],
          "usingExpression": null,
          "checkExpression": "true"
        },
        {
          "schema": "public",
          "table": "object_personnel",
          "name": "fieldgrid_runtime_data_select",
          "command": "r",
          "permissive": true,
          "roles": [
            "fieldgrid_runtime_data"
          ],
          "usingExpression": "true",
          "checkExpression": null
        },
        {
          "schema": "public",
          "table": "object_personnel",
          "name": "object_personnel_management",
          "command": "*",
          "permissive": true,
          "roles": [
            "authenticated"
          ],
          "usingExpression": "(EXISTS ( SELECT 1\n   FROM public.objects o\n  WHERE ((o.id = object_personnel.object_id) AND public.is_management_for_tenant(o.tenant_id))))",
          "checkExpression": "(EXISTS ( SELECT 1\n   FROM public.objects o\n  WHERE ((o.id = object_personnel.object_id) AND public.is_management_for_tenant(o.tenant_id))))"
        },
        {
          "schema": "public",
          "table": "object_personnel",
          "name": "object_personnel_management_all",
          "command": "*",
          "permissive": true,
          "roles": [
            "PUBLIC"
          ],
          "usingExpression": "(EXISTS ( SELECT 1\n   FROM (public.user_roles ur\n     JOIN public.roles r ON ((r.id = ur.role_id)))\n  WHERE ((ur.user_id = auth.uid()) AND ((r.name)::text = ANY ((ARRAY['Management'::character varying, 'Administration'::character varying, 'Planning'::character varying, 'Support'::character varying])::text[])))))",
          "checkExpression": null
        },
        {
          "schema": "public",
          "table": "objects",
          "name": "fieldgrid_runtime_data_delete",
          "command": "d",
          "permissive": true,
          "roles": [
            "fieldgrid_runtime_data"
          ],
          "usingExpression": "true",
          "checkExpression": null
        },
        {
          "schema": "public",
          "table": "objects",
          "name": "fieldgrid_runtime_data_insert",
          "command": "a",
          "permissive": true,
          "roles": [
            "fieldgrid_runtime_data"
          ],
          "usingExpression": null,
          "checkExpression": "true"
        },
        {
          "schema": "public",
          "table": "objects",
          "name": "fieldgrid_runtime_data_select",
          "command": "r",
          "permissive": true,
          "roles": [
            "fieldgrid_runtime_data"
          ],
          "usingExpression": "true",
          "checkExpression": null
        },
        {
          "schema": "public",
          "table": "objects",
          "name": "fieldgrid_runtime_data_update",
          "command": "w",
          "permissive": true,
          "roles": [
            "fieldgrid_runtime_data"
          ],
          "usingExpression": "true",
          "checkExpression": "true"
        },
        {
          "schema": "public",
          "table": "objects",
          "name": "objects_customer_users_insert",
          "command": "a",
          "permissive": true,
          "roles": [
            "authenticated"
          ],
          "usingExpression": null,
          "checkExpression": "public.customer_has_access(customer_id, tenant_id)"
        },
        {
          "schema": "public",
          "table": "objects",
          "name": "objects_customer_users_select",
          "command": "r",
          "permissive": true,
          "roles": [
            "authenticated"
          ],
          "usingExpression": "public.customer_has_access(customer_id, tenant_id)",
          "checkExpression": null
        },
        {
          "schema": "public",
          "table": "objects",
          "name": "objects_customer_users_update",
          "command": "w",
          "permissive": true,
          "roles": [
            "authenticated"
          ],
          "usingExpression": "public.customer_has_access(customer_id, tenant_id)",
          "checkExpression": "public.customer_has_access(customer_id, tenant_id)"
        },
        {
          "schema": "public",
          "table": "objects",
          "name": "objects_management",
          "command": "*",
          "permissive": true,
          "roles": [
            "authenticated"
          ],
          "usingExpression": "public.is_management_for_tenant(tenant_id)",
          "checkExpression": "public.is_management_for_tenant(tenant_id)"
        },
        {
          "schema": "public",
          "table": "objects",
          "name": "personnel_select_assigned_objects",
          "command": "r",
          "permissive": true,
          "roles": [
            "authenticated"
          ],
          "usingExpression": "(EXISTS ( SELECT 1\n   FROM public.assignments a\n  WHERE ((a.object_id = objects.id) AND public.personnel_assigned_to_assignment(a.id))))",
          "checkExpression": null
        },
        {
          "schema": "public",
          "table": "payments",
          "name": "fieldgrid_runtime_data_insert",
          "command": "a",
          "permissive": true,
          "roles": [
            "fieldgrid_runtime_data"
          ],
          "usingExpression": null,
          "checkExpression": "true"
        },
        {
          "schema": "public",
          "table": "payments",
          "name": "fieldgrid_runtime_data_select",
          "command": "r",
          "permissive": true,
          "roles": [
            "fieldgrid_runtime_data"
          ],
          "usingExpression": "true",
          "checkExpression": null
        },
        {
          "schema": "public",
          "table": "payments",
          "name": "fieldgrid_runtime_data_update",
          "command": "w",
          "permissive": true,
          "roles": [
            "fieldgrid_runtime_data"
          ],
          "usingExpression": "true",
          "checkExpression": "true"
        },
        {
          "schema": "public",
          "table": "payments",
          "name": "owner_or_staff_read_payments",
          "command": "r",
          "permissive": true,
          "roles": [
            "PUBLIC"
          ],
          "usingExpression": "(EXISTS ( SELECT 1\n   FROM public.invoices\n  WHERE ((invoices.id = payments.invoice_id) AND ((invoices.created_by = auth.uid()) OR (EXISTS ( SELECT 1\n           FROM (public.user_roles ur\n             JOIN public.roles r ON ((r.id = ur.role_id)))\n          WHERE ((ur.user_id = auth.uid()) AND ((r.name)::text = ANY ((ARRAY['management'::character varying, 'administration'::character varying, 'planning'::character varying, 'support'::character varying])::text[])))))))))",
          "checkExpression": null
        },
        {
          "schema": "public",
          "table": "payments",
          "name": "service_role_all_payments",
          "command": "*",
          "permissive": true,
          "roles": [
            "PUBLIC"
          ],
          "usingExpression": "(auth.role() = 'service_role'::text)",
          "checkExpression": "(auth.role() = 'service_role'::text)"
        },
        {
          "schema": "public",
          "table": "personnel",
          "name": "fieldgrid_runtime_data_delete",
          "command": "d",
          "permissive": true,
          "roles": [
            "fieldgrid_runtime_data"
          ],
          "usingExpression": "true",
          "checkExpression": null
        },
        {
          "schema": "public",
          "table": "personnel",
          "name": "fieldgrid_runtime_data_insert",
          "command": "a",
          "permissive": true,
          "roles": [
            "fieldgrid_runtime_data"
          ],
          "usingExpression": null,
          "checkExpression": "true"
        },
        {
          "schema": "public",
          "table": "personnel",
          "name": "fieldgrid_runtime_data_select",
          "command": "r",
          "permissive": true,
          "roles": [
            "fieldgrid_runtime_data"
          ],
          "usingExpression": "true",
          "checkExpression": null
        },
        {
          "schema": "public",
          "table": "personnel",
          "name": "fieldgrid_runtime_data_update",
          "command": "w",
          "permissive": true,
          "roles": [
            "fieldgrid_runtime_data"
          ],
          "usingExpression": "true",
          "checkExpression": "true"
        },
        {
          "schema": "public",
          "table": "personnel",
          "name": "personnel_management",
          "command": "*",
          "permissive": true,
          "roles": [
            "authenticated"
          ],
          "usingExpression": "public.is_management_for_tenant(tenant_id)",
          "checkExpression": "public.is_management_for_tenant(tenant_id)"
        },
        {
          "schema": "public",
          "table": "personnel",
          "name": "personnel_select_own",
          "command": "r",
          "permissive": true,
          "roles": [
            "authenticated"
          ],
          "usingExpression": "(user_id = auth.uid())",
          "checkExpression": null
        },
        {
          "schema": "public",
          "table": "personnel",
          "name": "personnel_update_own_phone",
          "command": "w",
          "permissive": true,
          "roles": [
            "authenticated"
          ],
          "usingExpression": "(user_id = auth.uid())",
          "checkExpression": "(user_id = auth.uid())"
        }
      ],
      "helpers": [
        {
          "schema": "public",
          "name": "customer_has_access",
          "argumentTypes": [
            "uuid",
            "uuid"
          ],
          "returnType": "bool",
          "body": "\n  SELECT EXISTS (\n    SELECT 1\n    FROM customer_users cu\n    WHERE cu.customer_id = p_customer_id\n      AND cu.tenant_id = p_tenant_id\n      AND cu.user_id = (SELECT auth.uid())\n      AND cu.status = 'active'\n  );\n",
          "language": "sql",
          "securityDefiner": false,
          "volatility": "s",
          "parallel": "u",
          "strict": false,
          "leakproof": false,
          "config": [
            "search_path=public, auth"
          ],
          "argNames": [
            "p_customer_id",
            "p_tenant_id"
          ],
          "defaultCount": 0,
          "ownerRelation": {
            "schema": "public",
            "table": "object_contacts"
          },
          "directAcl": [
            {
              "grantee": "$owner",
              "grantor": "$owner",
              "privilege": "EXECUTE",
              "grantable": false
            },
            {
              "grantee": "authenticated",
              "grantor": "$owner",
              "privilege": "EXECUTE",
              "grantable": false
            },
            {
              "grantee": "anon",
              "grantor": "$owner",
              "privilege": "EXECUTE",
              "grantable": false
            },
            {
              "grantee": "service_role",
              "grantor": "$owner",
              "privilege": "EXECUTE",
              "grantable": false
            }
          ],
          "effectiveExecute": [
            {
              "role": "$owner",
              "allowed": true
            },
            {
              "role": "PUBLIC",
              "allowed": false
            },
            {
              "role": "anon",
              "allowed": true
            },
            {
              "role": "authenticated",
              "allowed": true
            },
            {
              "role": "service_role",
              "allowed": true
            },
            {
              "role": "fieldgrid_runtime_data",
              "allowed": false
            },
            {
              "role": "fieldgrid_runtime_app",
              "allowed": false
            }
          ]
        },
        {
          "schema": "public",
          "name": "personnel_assigned_to_assignment",
          "argumentTypes": [
            "uuid"
          ],
          "returnType": "bool",
          "body": "\n  SELECT\n    (SELECT auth.uid()) IS NOT NULL\n    AND EXISTS (\n      SELECT 1\n      FROM public.assignment_personnel ap\n      JOIN public.assignments a\n        ON a.id = ap.assignment_id\n      JOIN public.personnel p\n        ON p.id = ap.personnel_id\n      WHERE ap.assignment_id = p_assignment_id\n        AND ap.status = 'assigned'\n        AND p.user_id = (SELECT auth.uid())\n        AND p.is_active = true\n        AND p.tenant_id IS NOT NULL\n        AND a.tenant_id IS NOT NULL\n        AND p.tenant_id = a.tenant_id\n    );\n",
          "language": "sql",
          "securityDefiner": true,
          "volatility": "s",
          "parallel": "u",
          "strict": false,
          "leakproof": false,
          "config": [
            "search_path=pg_catalog, public, auth"
          ],
          "argNames": [
            "p_assignment_id"
          ],
          "defaultCount": 0,
          "ownerRelation": {
            "schema": "public",
            "table": "object_contacts"
          },
          "directAcl": [
            {
              "grantee": "$owner",
              "grantor": "$owner",
              "privilege": "EXECUTE",
              "grantable": false
            },
            {
              "grantee": "authenticated",
              "grantor": "$owner",
              "privilege": "EXECUTE",
              "grantable": false
            }
          ],
          "effectiveExecute": [
            {
              "role": "$owner",
              "allowed": true
            },
            {
              "role": "PUBLIC",
              "allowed": false
            },
            {
              "role": "anon",
              "allowed": false
            },
            {
              "role": "authenticated",
              "allowed": true
            },
            {
              "role": "service_role",
              "allowed": false
            },
            {
              "role": "fieldgrid_runtime_data",
              "allowed": false
            },
            {
              "role": "fieldgrid_runtime_app",
              "allowed": false
            }
          ]
        },
        {
          "schema": "public",
          "name": "fieldgrid_has_platform_permission",
          "argumentTypes": [
            "text"
          ],
          "returnType": "bool",
          "body": "\n  SELECT EXISTS (\n    SELECT 1 FROM public.platform_users pu\n    WHERE pu.user_id = auth.uid() AND pu.status = 'active'\n      AND (\n        pu.role = 'owner'\n        OR (pu.role = 'admin' AND p_permission = ANY (ARRAY[\n          'global.rbac.manage', 'global.reference.manage', 'global.content.manage',\n          'platform.tenants.read', 'platform.audit.read'\n        ]))\n      )\n  );\n",
          "language": "sql",
          "securityDefiner": true,
          "volatility": "s",
          "parallel": "u",
          "strict": false,
          "leakproof": false,
          "config": [
            "search_path=pg_catalog, public, pg_temp"
          ],
          "argNames": [
            "p_permission"
          ],
          "defaultCount": 0,
          "ownerRelation": {
            "schema": "public",
            "table": "object_contacts"
          },
          "directAcl": [
            {
              "grantee": "$owner",
              "grantor": "$owner",
              "privilege": "EXECUTE",
              "grantable": false
            },
            {
              "grantee": "authenticated",
              "grantor": "$owner",
              "privilege": "EXECUTE",
              "grantable": false
            }
          ],
          "effectiveExecute": [
            {
              "role": "$owner",
              "allowed": true
            },
            {
              "role": "PUBLIC",
              "allowed": false
            },
            {
              "role": "anon",
              "allowed": false
            },
            {
              "role": "authenticated",
              "allowed": true
            },
            {
              "role": "service_role",
              "allowed": false
            },
            {
              "role": "fieldgrid_runtime_data",
              "allowed": false
            },
            {
              "role": "fieldgrid_runtime_app",
              "allowed": false
            }
          ]
        },
        {
          "schema": "auth",
          "name": "uid",
          "argumentTypes": [],
          "returnType": "uuid",
          "body": "\n  select \n  coalesce(\n    nullif(current_setting('request.jwt.claim.sub', true), ''),\n    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')\n  )::uuid\n",
          "language": "sql",
          "securityDefiner": false,
          "volatility": "s",
          "parallel": "u",
          "strict": false,
          "leakproof": false,
          "config": null,
          "argNames": null,
          "defaultCount": 0,
          "ownerRelation": {
            "schema": "auth",
            "table": "users"
          },
          "directAcl": [
            {
              "grantee": "$owner",
              "grantor": "$owner",
              "privilege": "EXECUTE",
              "grantable": false
            },
            {
              "grantee": "PUBLIC",
              "grantor": "$owner",
              "privilege": "EXECUTE",
              "grantable": false
            },
            {
              "grantee": "dashboard_user",
              "grantor": "$owner",
              "privilege": "EXECUTE",
              "grantable": false
            }
          ],
          "effectiveExecute": [
            {
              "role": "$owner",
              "allowed": true
            },
            {
              "role": "PUBLIC",
              "allowed": true
            },
            {
              "role": "anon",
              "allowed": true
            },
            {
              "role": "authenticated",
              "allowed": true
            },
            {
              "role": "service_role",
              "allowed": true
            },
            {
              "role": "fieldgrid_runtime_data",
              "allowed": true
            },
            {
              "role": "fieldgrid_runtime_app",
              "allowed": true
            }
          ]
        },
        {
          "schema": "auth",
          "name": "role",
          "argumentTypes": [],
          "returnType": "text",
          "body": "\n  select \n  coalesce(\n    nullif(current_setting('request.jwt.claim.role', true), ''),\n    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')\n  )::text\n",
          "language": "sql",
          "securityDefiner": false,
          "volatility": "s",
          "parallel": "u",
          "strict": false,
          "leakproof": false,
          "config": null,
          "argNames": null,
          "defaultCount": 0,
          "ownerRelation": {
            "schema": "auth",
            "table": "users"
          },
          "directAcl": [
            {
              "grantee": "$owner",
              "grantor": "$owner",
              "privilege": "EXECUTE",
              "grantable": false
            },
            {
              "grantee": "PUBLIC",
              "grantor": "$owner",
              "privilege": "EXECUTE",
              "grantable": false
            },
            {
              "grantee": "dashboard_user",
              "grantor": "$owner",
              "privilege": "EXECUTE",
              "grantable": false
            }
          ],
          "effectiveExecute": [
            {
              "role": "$owner",
              "allowed": true
            },
            {
              "role": "PUBLIC",
              "allowed": true
            },
            {
              "role": "anon",
              "allowed": true
            },
            {
              "role": "authenticated",
              "allowed": true
            },
            {
              "role": "service_role",
              "allowed": true
            },
            {
              "role": "fieldgrid_runtime_data",
              "allowed": true
            },
            {
              "role": "fieldgrid_runtime_app",
              "allowed": true
            }
          ]
        }
      ]
    }
  }
]$policy_repair_manifest$::jsonb;
  readiness record;
  phase integer;
BEGIN
  FOR phase IN 0..1 LOOP
    SELECT * INTO STRICT readiness FROM (
WITH matches AS (
    SELECT candidate.value->>'state' AS state,
      definition."policySetMatches" AS policy_matches,
      (definition."policySetMatches" AND definition."relationsMatch"
       AND definition."helperContractsMatch" AND definition."postgresMajorMatches"
       AND CASE candidate.value->>'state'
         WHEN 'legacy' THEN (pg_catalog.to_regprocedure('app_private.fieldgrid_has_canonical_tenant_management(uuid,uuid)') IS NULL
    AND EXISTS (SELECT 1 FROM pg_proc p JOIN pg_language l ON l.oid = p.prolang
    WHERE p.oid = to_regprocedure('public.is_management_for_tenant(uuid)')
      AND p.prosrc = $legacy_body$
  SELECT p_tenant_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.user_roles ur
      JOIN public.roles r ON r.id = ur.role_id
      JOIN public.tenant_users tu
        ON tu.user_id = ur.user_id
       AND tu.tenant_id = p_tenant_id
       AND tu.status = 'active'
      JOIN public.tenants t
        ON t.id = tu.tenant_id
       AND t.is_active IS TRUE
       AND t.status IN ('provisioning', 'trial', 'active')
      WHERE ur.user_id = auth.uid()
        AND r.name = 'Management'
    );
$legacy_body$
      AND p.prosecdef AND p.provolatile = 's' AND l.lanname = 'sql'
      AND p.proconfig = ARRAY['search_path=pg_catalog, public, pg_temp']
      AND p.prorettype = 'boolean'::regtype AND NOT p.proretset
      AND p.proargnames = ARRAY['p_tenant_id'] AND p.pronargdefaults = 0
      AND p.prokind = 'f' AND p.proparallel = 'u'
      AND NOT p.proisstrict AND NOT p.proleakproof
      AND p.proowner = (SELECT relowner FROM pg_class WHERE oid = 'public.tenant_users'::regclass)
      AND pg_has_role(current_user, p.proowner, 'MEMBER')
      AND has_function_privilege('authenticated', p.oid, 'EXECUTE')
      AND NOT has_function_privilege('anon', p.oid, 'EXECUTE')
      AND NOT has_function_privilege('service_role', p.oid, 'EXECUTE')
      AND NOT EXISTS (
        SELECT 1 FROM aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
        WHERE a.grantee NOT IN (p.proowner, 'authenticated'::regrole)
      )
  ))
         WHEN 'clean' THEN (EXISTS (
    SELECT 1 FROM pg_proc wrapper
    JOIN pg_proc predicate ON predicate.oid =
      to_regprocedure('app_private.fieldgrid_has_canonical_tenant_management(uuid,uuid)')
    JOIN pg_language wrapper_language ON wrapper_language.oid = wrapper.prolang
    JOIN pg_language predicate_language ON predicate_language.oid = predicate.prolang
    JOIN pg_class membership_table ON membership_table.oid = 'public.tenant_users'::regclass
    WHERE wrapper.oid = to_regprocedure('public.is_management_for_tenant(uuid)')
      AND wrapper.prosrc = '
  SELECT app_private.fieldgrid_has_canonical_tenant_management(auth.uid(), p_tenant_id);
'
      AND predicate.prosrc = '
  SELECT p_user_id IS NOT NULL AND p_tenant_id IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.tenant_users membership
    JOIN public.tenants tenant ON tenant.id = membership.tenant_id
    JOIN public.tenant_user_roles grant_link
      ON grant_link.user_id = membership.user_id
     AND grant_link.tenant_id = membership.tenant_id
    JOIN public.tenant_roles scoped_role
      ON scoped_role.id = grant_link.tenant_role_id
     AND scoped_role.tenant_id = grant_link.tenant_id
    JOIN public.roles template ON template.id = scoped_role.template_role_id
    WHERE membership.user_id = p_user_id AND membership.tenant_id = p_tenant_id
      AND membership.status = ''active''
      AND tenant.is_active IS TRUE
      AND tenant.status IN (''provisioning'', ''trial'', ''active'')
      AND scoped_role.name = ''Management'' AND scoped_role.is_system IS TRUE
      AND scoped_role.is_custom IS FALSE
      AND template.name = ''Management'' AND template.is_system IS TRUE
      AND NOT EXISTS (
        SELECT 1 FROM public.platform_users platform_user
        WHERE platform_user.user_id = membership.user_id
      )
      AND EXISTS (
        SELECT 1 FROM public.role_permissions expected
        WHERE expected.role_id = template.id
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.role_permissions expected
        WHERE expected.role_id = template.id AND NOT EXISTS (
          SELECT 1 FROM public.tenant_role_permissions actual
          WHERE actual.tenant_role_id = scoped_role.id
            AND actual.permission_id = expected.permission_id
        )
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.tenant_role_permissions actual
        WHERE actual.tenant_role_id = scoped_role.id AND NOT EXISTS (
          SELECT 1 FROM public.role_permissions expected
          WHERE expected.role_id = template.id
            AND expected.permission_id = actual.permission_id
        )
      )
  );
'
      AND wrapper.prosecdef AND NOT predicate.prosecdef
      AND wrapper.provolatile = 's' AND predicate.provolatile = 's'
      AND wrapper_language.lanname = 'sql' AND predicate_language.lanname = 'sql'
      AND wrapper.proconfig = ARRAY['search_path=pg_catalog, public, pg_temp']
      AND predicate.proconfig = ARRAY['search_path=pg_catalog, public, pg_temp']
      AND wrapper.prorettype = 'boolean'::regtype AND NOT wrapper.proretset
      AND predicate.prorettype = 'boolean'::regtype AND NOT predicate.proretset
      AND wrapper.proargnames = ARRAY['p_tenant_id']
      AND predicate.proargnames = ARRAY['p_user_id', 'p_tenant_id']
      AND wrapper.pronargdefaults = 0 AND predicate.pronargdefaults = 0
      AND wrapper.prokind = 'f' AND predicate.prokind = 'f'
      AND wrapper.proparallel = 'u' AND predicate.proparallel = 'u'
      AND NOT wrapper.proisstrict AND NOT predicate.proisstrict
      AND NOT wrapper.proleakproof AND NOT predicate.proleakproof
      AND wrapper.proowner = membership_table.relowner
      AND predicate.proowner = wrapper.proowner
      AND has_function_privilege('authenticated', wrapper.oid, 'EXECUTE')
      AND NOT has_function_privilege('anon', wrapper.oid, 'EXECUTE')
      AND NOT has_function_privilege('service_role', wrapper.oid, 'EXECUTE')
      AND NOT has_function_privilege('authenticated', predicate.oid, 'EXECUTE')
      AND NOT has_function_privilege('anon', predicate.oid, 'EXECUTE')
      AND NOT has_function_privilege('service_role', predicate.oid, 'EXECUTE')
      AND NOT EXISTS (
        SELECT 1 FROM aclexplode(coalesce(wrapper.proacl, acldefault('f', wrapper.proowner))) acl
        WHERE acl.grantee NOT IN (wrapper.proowner, 'authenticated'::regrole)
           OR (acl.grantee <> wrapper.proowner AND acl.is_grantable)
      )
      AND NOT EXISTS (
        SELECT 1 FROM aclexplode(coalesce(predicate.proacl, acldefault('f', predicate.proowner))) acl
        WHERE acl.grantee <> predicate.proowner
      )
  )
    AND NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE coalesce(qual, '') ~ '\mis_management[[:space:]]*\('
         OR coalesce(with_check, '') ~ '\mis_management[[:space:]]*\('
         OR coalesce(qual, '') ~ '\muser_roles\M'
         OR coalesce(with_check, '') ~ '\muser_roles\M'
         OR policyname = 'assignment_material_usage_backoffice_all'
    ) AND NOT EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname NOT IN ('pg_catalog', 'information_schema')
        AND p.prosrc ~ '\mis_management[[:space:]]*\('
    ) AND NOT EXISTS (
      SELECT 1 FROM pg_rewrite r JOIN pg_class c ON c.oid = r.ev_class
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname NOT IN ('pg_catalog', 'information_schema')
        AND pg_get_ruledef(r.oid) ~ '\mis_management[[:space:]]*\('
    ))
         ELSE ((pg_catalog.to_regprocedure('app_private.fieldgrid_has_canonical_tenant_management(uuid,uuid)') IS NULL
    AND EXISTS (SELECT 1 FROM pg_proc p JOIN pg_language l ON l.oid = p.prolang
    WHERE p.oid = to_regprocedure('public.is_management_for_tenant(uuid)')
      AND p.prosrc = $legacy_body$
  SELECT p_tenant_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.user_roles ur
      JOIN public.roles r ON r.id = ur.role_id
      JOIN public.tenant_users tu
        ON tu.user_id = ur.user_id
       AND tu.tenant_id = p_tenant_id
       AND tu.status = 'active'
      JOIN public.tenants t
        ON t.id = tu.tenant_id
       AND t.is_active IS TRUE
       AND t.status IN ('provisioning', 'trial', 'active')
      WHERE ur.user_id = auth.uid()
        AND r.name = 'Management'
    );
$legacy_body$
      AND p.prosecdef AND p.provolatile = 's' AND l.lanname = 'sql'
      AND p.proconfig = ARRAY['search_path=pg_catalog, public, pg_temp']
      AND p.prorettype = 'boolean'::regtype AND NOT p.proretset
      AND p.proargnames = ARRAY['p_tenant_id'] AND p.pronargdefaults = 0
      AND p.prokind = 'f' AND p.proparallel = 'u'
      AND NOT p.proisstrict AND NOT p.proleakproof
      AND p.proowner = (SELECT relowner FROM pg_class WHERE oid = 'public.tenant_users'::regclass)
      AND pg_has_role(current_user, p.proowner, 'MEMBER')
      AND has_function_privilege('authenticated', p.oid, 'EXECUTE')
      AND NOT has_function_privilege('anon', p.oid, 'EXECUTE')
      AND NOT has_function_privilege('service_role', p.oid, 'EXECUTE')
      AND NOT EXISTS (
        SELECT 1 FROM aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
        WHERE a.grantee NOT IN (p.proowner, 'authenticated'::regrole)
      )
  )) OR (EXISTS (
    SELECT 1 FROM pg_proc wrapper
    JOIN pg_proc predicate ON predicate.oid =
      to_regprocedure('app_private.fieldgrid_has_canonical_tenant_management(uuid,uuid)')
    JOIN pg_language wrapper_language ON wrapper_language.oid = wrapper.prolang
    JOIN pg_language predicate_language ON predicate_language.oid = predicate.prolang
    JOIN pg_class membership_table ON membership_table.oid = 'public.tenant_users'::regclass
    WHERE wrapper.oid = to_regprocedure('public.is_management_for_tenant(uuid)')
      AND wrapper.prosrc = '
  SELECT app_private.fieldgrid_has_canonical_tenant_management(auth.uid(), p_tenant_id);
'
      AND predicate.prosrc = '
  SELECT p_user_id IS NOT NULL AND p_tenant_id IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.tenant_users membership
    JOIN public.tenants tenant ON tenant.id = membership.tenant_id
    JOIN public.tenant_user_roles grant_link
      ON grant_link.user_id = membership.user_id
     AND grant_link.tenant_id = membership.tenant_id
    JOIN public.tenant_roles scoped_role
      ON scoped_role.id = grant_link.tenant_role_id
     AND scoped_role.tenant_id = grant_link.tenant_id
    JOIN public.roles template ON template.id = scoped_role.template_role_id
    WHERE membership.user_id = p_user_id AND membership.tenant_id = p_tenant_id
      AND membership.status = ''active''
      AND tenant.is_active IS TRUE
      AND tenant.status IN (''provisioning'', ''trial'', ''active'')
      AND scoped_role.name = ''Management'' AND scoped_role.is_system IS TRUE
      AND scoped_role.is_custom IS FALSE
      AND template.name = ''Management'' AND template.is_system IS TRUE
      AND NOT EXISTS (
        SELECT 1 FROM public.platform_users platform_user
        WHERE platform_user.user_id = membership.user_id
      )
      AND EXISTS (
        SELECT 1 FROM public.role_permissions expected
        WHERE expected.role_id = template.id
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.role_permissions expected
        WHERE expected.role_id = template.id AND NOT EXISTS (
          SELECT 1 FROM public.tenant_role_permissions actual
          WHERE actual.tenant_role_id = scoped_role.id
            AND actual.permission_id = expected.permission_id
        )
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.tenant_role_permissions actual
        WHERE actual.tenant_role_id = scoped_role.id AND NOT EXISTS (
          SELECT 1 FROM public.role_permissions expected
          WHERE expected.role_id = template.id
            AND expected.permission_id = actual.permission_id
        )
      )
  );
'
      AND wrapper.prosecdef AND NOT predicate.prosecdef
      AND wrapper.provolatile = 's' AND predicate.provolatile = 's'
      AND wrapper_language.lanname = 'sql' AND predicate_language.lanname = 'sql'
      AND wrapper.proconfig = ARRAY['search_path=pg_catalog, public, pg_temp']
      AND predicate.proconfig = ARRAY['search_path=pg_catalog, public, pg_temp']
      AND wrapper.prorettype = 'boolean'::regtype AND NOT wrapper.proretset
      AND predicate.prorettype = 'boolean'::regtype AND NOT predicate.proretset
      AND wrapper.proargnames = ARRAY['p_tenant_id']
      AND predicate.proargnames = ARRAY['p_user_id', 'p_tenant_id']
      AND wrapper.pronargdefaults = 0 AND predicate.pronargdefaults = 0
      AND wrapper.prokind = 'f' AND predicate.prokind = 'f'
      AND wrapper.proparallel = 'u' AND predicate.proparallel = 'u'
      AND NOT wrapper.proisstrict AND NOT predicate.proisstrict
      AND NOT wrapper.proleakproof AND NOT predicate.proleakproof
      AND wrapper.proowner = membership_table.relowner
      AND predicate.proowner = wrapper.proowner
      AND has_function_privilege('authenticated', wrapper.oid, 'EXECUTE')
      AND NOT has_function_privilege('anon', wrapper.oid, 'EXECUTE')
      AND NOT has_function_privilege('service_role', wrapper.oid, 'EXECUTE')
      AND NOT has_function_privilege('authenticated', predicate.oid, 'EXECUTE')
      AND NOT has_function_privilege('anon', predicate.oid, 'EXECUTE')
      AND NOT has_function_privilege('service_role', predicate.oid, 'EXECUTE')
      AND NOT EXISTS (
        SELECT 1 FROM aclexplode(coalesce(wrapper.proacl, acldefault('f', wrapper.proowner))) acl
        WHERE acl.grantee NOT IN (wrapper.proowner, 'authenticated'::regrole)
           OR (acl.grantee <> wrapper.proowner AND acl.is_grantable)
      )
      AND NOT EXISTS (
        SELECT 1 FROM aclexplode(coalesce(predicate.proacl, acldefault('f', predicate.proowner))) acl
        WHERE acl.grantee <> predicate.proowner
      )
  )
    AND NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE coalesce(qual, '') ~ '\mis_management[[:space:]]*\('
         OR coalesce(with_check, '') ~ '\mis_management[[:space:]]*\('
         OR coalesce(qual, '') ~ '\muser_roles\M'
         OR coalesce(with_check, '') ~ '\muser_roles\M'
         OR policyname = 'assignment_material_usage_backoffice_all'
    ) AND NOT EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname NOT IN ('pg_catalog', 'information_schema')
        AND p.prosrc ~ '\mis_management[[:space:]]*\('
    ) AND NOT EXISTS (
      SELECT 1 FROM pg_rewrite r JOIN pg_class c ON c.oid = r.ev_class
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname NOT IN ('pg_catalog', 'information_schema')
        AND pg_get_ruledef(r.oid) ~ '\mis_management[[:space:]]*\('
    ))) END) AS valid
    FROM pg_catalog.jsonb_array_elements(repair_manifest) candidate(value)
    CROSS JOIN LATERAL (WITH manifest AS (SELECT (candidate.value->'manifest')::pg_catalog.jsonb AS value),
context AS (
  SELECT pg_catalog.set_config('search_path', 'pg_catalog', true) OPERATOR(pg_catalog.=) 'pg_catalog' AS path_matches,
    pg_catalog.current_setting('server_version_num')::pg_catalog.int4 / 10000 = 17 AS major_matches
), expected_relations AS (
  SELECT relation AS value FROM manifest,
    pg_catalog.jsonb_array_elements(manifest.value->'relations') relation
), expected_policies AS (
  SELECT policy AS value FROM manifest,
    pg_catalog.jsonb_array_elements(manifest.value->'policies') policy
), actual_policies AS (
  SELECT pg_catalog.jsonb_build_object(
    'schema', namespace.nspname, 'table', relation.relname, 'name', policy.polname,
    'command', policy.polcmd::pg_catalog.text, 'permissive', policy.polpermissive,
    'roles', (SELECT pg_catalog.jsonb_agg(role_name ORDER BY role_name COLLATE pg_catalog."C") FROM (
      SELECT CASE WHEN role_oid = 0 THEN 'PUBLIC' ELSE pg_catalog.pg_get_userbyid(role_oid)::pg_catalog.text END AS role_name
      FROM pg_catalog.unnest(policy.polroles) role_oid) names),
    'usingExpression', pg_catalog.pg_get_expr(policy.polqual, (CASE WHEN pg_catalog.set_config('search_path', 'pg_catalog', true) OPERATOR(pg_catalog.=) 'pg_catalog' THEN policy.polrelid END), false),
    'checkExpression', pg_catalog.pg_get_expr(policy.polwithcheck, (CASE WHEN pg_catalog.set_config('search_path', 'pg_catalog', true) OPERATOR(pg_catalog.=) 'pg_catalog' THEN policy.polrelid END), false)
  ) AS value
  FROM pg_catalog.pg_policy policy
  JOIN pg_catalog.pg_class relation ON relation.oid = policy.polrelid
  JOIN pg_catalog.pg_namespace namespace ON namespace.oid = relation.relnamespace
  WHERE EXISTS (SELECT 1 FROM expected_relations expected
    WHERE expected.value->>'schema' = namespace.nspname AND expected.value->>'table' = relation.relname)
), expected_helpers AS (
  SELECT helper AS value FROM manifest,
    pg_catalog.jsonb_array_elements(manifest.value->'helpers') helper
)
SELECT context.major_matches AS "postgresMajorMatches",
  (context.path_matches AND context.major_matches AND NOT EXISTS (
    (SELECT value FROM actual_policies EXCEPT SELECT value FROM expected_policies)
    UNION ALL (SELECT value FROM expected_policies EXCEPT SELECT value FROM actual_policies)
  )) AS "policySetMatches",
  (context.path_matches AND context.major_matches AND NOT EXISTS (
    SELECT 1 FROM expected_relations expected WHERE NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_class relation
      JOIN pg_catalog.pg_namespace namespace ON namespace.oid = relation.relnamespace
      WHERE namespace.nspname = expected.value->>'schema' AND relation.relname = expected.value->>'table'
        AND relation.relkind::pg_catalog.text = expected.value->>'kind'
        AND relation.relrowsecurity = (expected.value->>'rowSecurity')::pg_catalog.bool
        AND relation.relforcerowsecurity = (expected.value->>'forceRowSecurity')::pg_catalog.bool
        AND NOT EXISTS (SELECT 1 FROM pg_catalog.jsonb_array_elements(expected.value->'columns') dependency
          WHERE NOT EXISTS (SELECT 1 FROM pg_catalog.pg_attribute attribute
            JOIN pg_catalog.pg_type column_type ON column_type.oid = attribute.atttypid
            JOIN pg_catalog.pg_namespace type_schema ON type_schema.oid = column_type.typnamespace
            WHERE attribute.attrelid = relation.oid AND attribute.attnum > 0 AND NOT attribute.attisdropped
              AND attribute.attname = dependency->>'name' AND type_schema.nspname = 'pg_catalog'
              AND column_type.typname = dependency->>'typeName'
              AND attribute.atttypmod = (dependency->>'typeModifier')::pg_catalog.int4
              AND attribute.attnotnull = (dependency->>'notNull')::pg_catalog.bool))
    )
  )) AS "relationsMatch",
  (context.path_matches AND context.major_matches AND NOT EXISTS (
    SELECT 1 FROM expected_helpers expected WHERE NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_proc helper
      JOIN pg_catalog.pg_namespace namespace ON namespace.oid = helper.pronamespace
      JOIN pg_catalog.pg_language language ON language.oid = helper.prolang
      JOIN pg_catalog.pg_class owner_relation ON owner_relation.relname = expected.value->'ownerRelation'->>'table'
      JOIN pg_catalog.pg_namespace owner_schema ON owner_schema.oid = owner_relation.relnamespace
        AND owner_schema.nspname = expected.value->'ownerRelation'->>'schema'
      WHERE namespace.nspname = expected.value->>'schema' AND helper.proname = expected.value->>'name'
        AND helper.proargtypes::pg_catalog.text = coalesce((SELECT pg_catalog.string_agg(
          pg_catalog.to_regtype('pg_catalog.' || argument)::pg_catalog.oid::pg_catalog.text, ' ' ORDER BY position)
          FROM pg_catalog.jsonb_array_elements_text(expected.value->'argumentTypes') WITH ORDINALITY arguments(argument, position)), '')
        AND helper.pronargs = pg_catalog.jsonb_array_length(expected.value->'argumentTypes')
        AND helper.prorettype = pg_catalog.to_regtype('pg_catalog.' || (expected.value->>'returnType'))
        AND helper.prosrc = expected.value->>'body' AND helper.prosqlbody IS NULL
        AND language.lanname = expected.value->>'language' AND helper.prokind = 'f'
        AND helper.prosecdef = (expected.value->>'securityDefiner')::pg_catalog.bool
        AND helper.provolatile::pg_catalog.text = expected.value->>'volatility'
        AND helper.proparallel::pg_catalog.text = expected.value->>'parallel'
        AND helper.proisstrict = (expected.value->>'strict')::pg_catalog.bool
        AND helper.proleakproof = (expected.value->>'leakproof')::pg_catalog.bool
        AND NOT helper.proretset AND helper.proargmodes IS NULL AND helper.proallargtypes IS NULL
        AND helper.prosupport = 0
        AND helper.pronargdefaults = 0 AND helper.proargdefaults IS NULL
        AND coalesce(pg_catalog.to_jsonb(helper.proconfig), 'null'::pg_catalog.jsonb) = expected.value->'config'
        AND coalesce(pg_catalog.to_jsonb(helper.proargnames), 'null'::pg_catalog.jsonb) = expected.value->'argNames'
        AND helper.proowner = owner_relation.relowner
        AND (SELECT pg_catalog.count(*) FROM pg_catalog.aclexplode(coalesce(helper.proacl, pg_catalog.acldefault('f', helper.proowner))))
          = pg_catalog.jsonb_array_length(expected.value->'directAcl')
        AND NOT EXISTS (
          SELECT 1 FROM pg_catalog.aclexplode(coalesce(helper.proacl, pg_catalog.acldefault('f', helper.proowner))) acl
          WHERE NOT EXISTS (SELECT 1 FROM pg_catalog.jsonb_array_elements(expected.value->'directAcl') required
            WHERE acl.privilege_type = required->>'privilege' AND acl.is_grantable = (required->>'grantable')::pg_catalog.bool
              AND acl.grantee = CASE required->>'grantee' WHEN '$owner' THEN helper.proowner WHEN 'PUBLIC' THEN 0::pg_catalog.oid
                ELSE pg_catalog.to_regrole(required->>'grantee')::pg_catalog.oid END
              AND acl.grantor = CASE required->>'grantor' WHEN '$owner' THEN helper.proowner
                ELSE pg_catalog.to_regrole(required->>'grantor')::pg_catalog.oid END))
        AND NOT EXISTS (
          SELECT 1 FROM pg_catalog.jsonb_array_elements(expected.value->'effectiveExecute') permission
          WHERE CASE permission->>'role'
            WHEN 'PUBLIC' THEN EXISTS (SELECT 1 FROM pg_catalog.aclexplode(coalesce(helper.proacl, pg_catalog.acldefault('f', helper.proowner))) acl
              WHERE acl.grantee = 0 AND acl.privilege_type = 'EXECUTE') IS DISTINCT FROM (permission->>'allowed')::pg_catalog.bool
            WHEN '$owner' THEN pg_catalog.has_function_privilege(helper.proowner, helper.oid, 'EXECUTE') IS DISTINCT FROM (permission->>'allowed')::pg_catalog.bool
            ELSE CASE WHEN pg_catalog.to_regrole(permission->>'role') IS NULL THEN true
              ELSE pg_catalog.has_function_privilege(pg_catalog.to_regrole(permission->>'role')::pg_catalog.oid, helper.oid, 'EXECUTE')
                IS DISTINCT FROM (permission->>'allowed')::pg_catalog.bool END
          END)
    )
  )) AS "helperContractsMatch"
FROM context) definition
  ) SELECT
    coalesce(pg_catalog.bool_or(policy_matches AND state = 'legacy'), false) AS "legacyDefinitionMatches",
    coalesce(pg_catalog.bool_or(policy_matches AND state = 'clean'), false) AS "cleanDefinitionMatches",
    coalesce(pg_catalog.bool_or(policy_matches AND state IN ('targetClean', 'targetUpgrade')), false) AS "targetDefinitionMatches",
    coalesce(pg_catalog.bool_or(valid), false) AS "dependenciesValid"
  FROM matches
    ) checked_definition;
    IF NOT readiness."dependenciesValid" OR
       (readiness."legacyDefinitionMatches"::integer + readiness."cleanDefinitionMatches"::integer
        + readiness."targetDefinitionMatches"::integer) <> 1 THEN
      RAISE EXCEPTION 'tenant_management_policy_repair_definition_drift';
    END IF;
    IF phase = 0 THEN
      IF readiness."legacyDefinitionMatches" OR readiness."cleanDefinitionMatches" THEN
        IF EXISTS (SELECT 1 FROM pg_catalog.pg_policy WHERE polrelid='public.personnel'::regclass
          AND polname='personnel_update_own_phone') AND (
          pg_catalog.has_table_privilege('anon','public.personnel','UPDATE')
          OR pg_catalog.has_any_column_privilege('anon','public.personnel','UPDATE')
          OR pg_catalog.has_table_privilege('authenticated','public.personnel','UPDATE')
          OR pg_catalog.has_any_column_privilege('authenticated','public.personnel','UPDATE')
          OR NOT pg_catalog.has_table_privilege('fieldgrid_runtime_app','public.personnel','SELECT')
          OR NOT pg_catalog.has_table_privilege('fieldgrid_runtime_app','public.personnel','UPDATE')
          OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='fieldgrid_runtime_app'
            AND NOT rolsuper AND NOT rolbypassrls)
        ) THEN RAISE EXCEPTION 'hosted_policy_personnel_path_not_closed'; END IF;
        REVOKE EXECUTE ON FUNCTION public.customer_has_access(uuid,uuid) FROM anon, service_role;
        DROP POLICY IF EXISTS personnel_update_own_phone ON public.personnel;
DROP POLICY IF EXISTS object_contacts_management_all ON public.object_contacts;
DROP POLICY IF EXISTS object_personnel_management_all ON public.object_personnel;
DROP POLICY IF EXISTS object_personnel_management ON public.object_personnel;
CREATE POLICY object_personnel_management ON public.object_personnel
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.objects o JOIN public.personnel p ON p.id = object_personnel.personnel_id AND p.tenant_id = o.tenant_id WHERE o.id = object_personnel.object_id AND public.is_management_for_tenant(o.tenant_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.objects o JOIN public.personnel p ON p.id = object_personnel.personnel_id AND p.tenant_id = o.tenant_id WHERE o.id = object_personnel.object_id AND public.is_management_for_tenant(o.tenant_id)));
DROP POLICY IF EXISTS owner_or_staff_read_payments ON public.payments;
CREATE POLICY owner_or_staff_read_payments ON public.payments
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.invoices i WHERE i.id = payments.invoice_id AND i.tenant_id = payments.tenant_id AND (i.created_by = auth.uid() OR public.is_management_for_tenant(i.tenant_id))));

      END IF;
    ELSIF NOT readiness."targetDefinitionMatches" THEN
      RAISE EXCEPTION 'tenant_management_policy_repair_postcondition_failed';
    END IF;
  END LOOP;
END;
$repair_tenant_management_policy_consumers$;
COMMIT;
