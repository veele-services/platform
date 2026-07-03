#!/usr/bin/env node

import process from "node:process";
import pg from "pg";

const { Client } = pg;

const args = new Set(process.argv.slice(2));
const asJson = args.has("--json");
const failOnLegacy = args.has("--fail-on-legacy");

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL is required.");
  process.exit(1);
}

const productionLike = /prod|production|platform\.fieldgrid\.nl/i.test(databaseUrl) || /prod|production/i.test(process.env.APP_ENV ?? "");
if (productionLike && process.env.PHASE3_STORAGE_REPORT_ALLOW_PRODUCTION !== "true") {
  console.error("Refusing production-like phase 3 storage report without PHASE3_STORAGE_REPORT_ALLOW_PRODUCTION=true.");
  process.exit(1);
}

async function tableExists(client, tableName) {
  const result = await client.query(
    `select to_regclass($1) is not null as exists`,
    [`public.${tableName}`],
  );
  return Boolean(result.rows[0]?.exists);
}

async function columnExists(client, tableName, columnName) {
  const result = await client.query(
    `select exists (
       select 1
       from information_schema.columns
       where table_schema = 'public'
         and table_name = $1
         and column_name = $2
     ) as exists`,
    [tableName, columnName],
  );
  return Boolean(result.rows[0]?.exists);
}

async function mediaSurface(client, tableName) {
  if (!(await tableExists(client, tableName))) {
    return { table: tableName, exists: false };
  }

  const hasTenantId = await columnExists(client, tableName, "tenant_id");
  const result = await client.query(`
    select
      count(*)::int as total_rows,
      count(*) filter (where ${hasTenantId ? "tenant_id is null" : "true"})::int as unresolved_tenant_id,
      count(*) filter (
        where ${hasTenantId ? "tenant_id is not null and storage_path like 'tenant/' || tenant_id::text || '/assignments/' || assignment_id::text || '/%'" : "false"}
      )::int as canonical_tenant_paths,
      count(*) filter (
        where ${hasTenantId ? "tenant_id is not null and storage_path not like 'tenant/' || tenant_id::text || '/assignments/' || assignment_id::text || '/%'" : "true"}
      )::int as legacy_storage_paths
    from ${tableName}
  `);

  return {
    table: tableName,
    exists: true,
    has_tenant_id: hasTenantId,
    ...result.rows[0],
  };
}

async function documentSurface(client) {
  if (!(await tableExists(client, "documents"))) {
    return { table: "documents", exists: false };
  }

  const result = await client.query(`
    select
      count(*)::int as total_rows,
      count(*) filter (where tenant_id is null)::int as unresolved_tenant_id,
      count(*) filter (where tenant_id is not null and storage_path like 'tenant/' || tenant_id::text || '/%')::int as canonical_tenant_paths,
      count(*) filter (where tenant_id is not null and storage_path not like 'tenant/' || tenant_id::text || '/%')::int as legacy_storage_paths
    from documents
  `);

  return {
    table: "documents",
    exists: true,
    has_tenant_id: true,
    ...result.rows[0],
  };
}

async function newsSurface(client) {
  if (!(await tableExists(client, "news_posts"))) {
    return { table: "news_posts", exists: false };
  }

  const hasScope = await columnExists(client, "news_posts", "scope");
  const hasTenantId = await columnExists(client, "news_posts", "tenant_id");

  const posts = await client.query(`
    select
      count(*)::int as total_rows,
      count(*) filter (where ${hasScope ? "scope <> 'platform'" : "true"})::int as non_platform_scope,
      count(*) filter (where ${hasTenantId ? "tenant_id is not null" : "false"})::int as tenant_scoped_rows,
      count(*) filter (where hero_image_path is not null and hero_image_path like 'platform/news-hero/%')::int as canonical_hero_paths,
      count(*) filter (where hero_image_path is not null and hero_image_path not like 'platform/news-hero/%')::int as legacy_hero_paths
    from news_posts
  `);

  let targets = { invalid_platform_targets: null };
  if (await tableExists(client, "news_post_targets")) {
    const targetResult = await client.query(`
      select count(*)::int as invalid_platform_targets
      from news_post_targets
      where target_type not in ('all_personnel', 'all_customers')
         or target_id is not null
    `);
    targets = targetResult.rows[0];
  }

  return {
    table: "news_posts",
    exists: true,
    has_scope: hasScope,
    has_tenant_id: hasTenantId,
    ...posts.rows[0],
    ...targets,
  };
}

async function storagePolicies(client) {
  const result = await client.query(`
    select policyname
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname in (
        'documents_management_all',
        'assignment_photos_management_all',
        'assignment_photos_assigned_personnel',
        'assignment_photos_assigned_personnel_insert',
        'assignment_photos_assigned_personnel_update',
        'assignment_photos_assigned_personnel_delete',
        'news_hero_public_read',
        'news_hero_insert_management',
        'news_hero_update_management',
        'news_hero_delete_management'
      )
    order by policyname
  `);

  const found = result.rows.map((row) => row.policyname);
  const expected = [
    "documents_management_all",
    "assignment_photos_management_all",
    "assignment_photos_assigned_personnel",
    "assignment_photos_assigned_personnel_insert",
    "assignment_photos_assigned_personnel_update",
    "assignment_photos_assigned_personnel_delete",
    "news_hero_public_read",
    "news_hero_insert_management",
    "news_hero_update_management",
    "news_hero_delete_management",
  ];

  return {
    expected,
    found,
    missing: expected.filter((policy) => !found.includes(policy)),
  };
}

async function main() {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  try {
    const [documents, assignmentPhotos, reportAttachments, news, policies] = await Promise.all([
      documentSurface(client),
      mediaSurface(client, "assignment_photos"),
      mediaSurface(client, "assignment_report_note_attachments"),
      newsSurface(client),
      storagePolicies(client),
    ]);

    const summary = {
      generated_at: new Date().toISOString(),
      surfaces: [documents, assignmentPhotos, reportAttachments, news],
      storage_policies: policies,
      canonical_path_contracts: {
        documents: "tenant/{tenant_id}/...",
        assignment_media: "tenant/{tenant_id}/assignments/{assignment_id}/...",
        news_hero: "platform/news-hero/...",
      },
    };

    const legacyCount = summary.surfaces.reduce((total, surface) => {
      return total + Number(surface.legacy_storage_paths ?? surface.legacy_hero_paths ?? 0) + Number(surface.unresolved_tenant_id ?? 0) + Number(surface.invalid_platform_targets ?? 0);
    }, 0) + policies.missing.length;

    if (asJson) {
      console.log(JSON.stringify(summary, null, 2));
    } else {
      console.log("Fieldgrid phase 3 storage tenancy report");
      for (const surface of summary.surfaces) {
        console.log(`- ${surface.table}: ${JSON.stringify(surface)}`);
      }
      console.log(`- storage policies: ${policies.found.length}/${policies.expected.length} present`);
      if (policies.missing.length) console.log(`- missing policies: ${policies.missing.join(", ")}`);
    }

    if (failOnLegacy && legacyCount > 0) {
      console.error(`Phase 3 report found ${legacyCount} unresolved legacy/storage/news items.`);
      process.exitCode = 1;
    }
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
