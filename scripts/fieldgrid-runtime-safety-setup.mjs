#!/usr/bin/env node
import { spawn } from "node:child_process";
import { join } from "node:path";
import {
  assertDisposableDatabaseForReset,
  connect,
  databaseUrl,
  ensureArtifactDirs,
  repoRoot,
  writeJsonArtifact,
  writeTextArtifact,
} from "./fieldgrid-runtime-safety-lib.mjs";

function run(command, args, env) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: repoRoot,
      env,
      shell: process.platform === "win32",
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
      process.stdout.write(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
      process.stderr.write(chunk);
    });
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}

async function resetIfAllowed(client) {
  if (process.env.FIELDGRID_RUNTIME_SAFETY_ALLOW_RESET !== "1") return false;
  await assertDisposableDatabaseForReset(client);
  await client.query(`
    drop schema if exists public cascade;
    drop schema if exists drizzle cascade;
    drop schema if exists auth cascade;
    drop schema if exists storage cascade;
    create schema public;
    grant usage, create on schema public to public;
  `);
  return true;
}

async function installCompatibilityShims(client) {
  await client.query(`
    create extension if not exists pgcrypto;

    do $$
    begin
      if not exists (select 1 from pg_roles where rolname = 'anon') then
        create role anon nologin;
      end if;
      if not exists (select 1 from pg_roles where rolname = 'authenticated') then
        create role authenticated nologin;
      end if;
      if not exists (select 1 from pg_roles where rolname = 'service_role') then
        create role service_role nologin bypassrls;
      end if;
    end
    $$;

    create schema if not exists auth;
    create schema if not exists storage;

    create table if not exists auth.users (
      id uuid primary key,
      email text unique,
      encrypted_password text,
      email_confirmed_at timestamptz,
      raw_app_meta_data jsonb not null default '{}'::jsonb,
      raw_user_meta_data jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );

    create or replace function auth.uid()
    returns uuid
    language sql
    stable
    as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;

    create or replace function auth.jwt()
    returns jsonb
    language sql
    stable
    as $$
      select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb)
    $$;

    create or replace function storage.foldername(name text)
    returns text[]
    language sql
    immutable
    as $$
      select string_to_array(coalesce(name, ''), '/')
    $$;

    create table if not exists storage.buckets (
      id text primary key,
      name text not null,
      owner uuid,
      public boolean not null default false,
      file_size_limit bigint,
      allowed_mime_types text[],
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );

    create table if not exists storage.objects (
      id uuid primary key default gen_random_uuid(),
      bucket_id text not null references storage.buckets(id) on delete cascade,
      name text not null,
      owner uuid,
      metadata jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      last_accessed_at timestamptz,
      version text
    );

    alter table storage.objects enable row level security;
    grant usage on schema auth, storage to anon, authenticated, service_role;
    grant select, insert, update, delete on auth.users to service_role;
    grant select, insert, update, delete on storage.buckets, storage.objects to authenticated, service_role;
  `);
}

async function installPostMigrationCompatibilityGrants() {
  const client = await connect();
  try {
    await client.query(`
      grant select on table public.personnel to authenticated;
      grant select on table
        public.assignments,
        public.assignment_tasks,
        public.assignment_extra_work,
        public.assignment_photos,
        public.assignment_report_notes,
        public.assignment_report_note_attachments,
        public.assignment_material_usage,
        public.reports,
        public.objects,
        public.customers,
        public.customer_users
      to authenticated;
    `);
  } finally {
    await client.end();
  }
}

async function main() {
  await ensureArtifactDirs();
  const startedAt = new Date().toISOString();
  const client = await connect();
  let reset = false;

  try {
    reset = await resetIfAllowed(client);
    await installCompatibilityShims(client);
  } finally {
    await client.end();
  }

  const env = {
    ...process.env,
    DATABASE_URL: databaseUrl(),
    DB_SSL: "false",
    PGSSLMODE: "disable",
  };
  const migration = await run("pnpm", ["--filter", "@workspace/db", "run", "db:migrate"], env);
  if (migration.code === 0) await installPostMigrationCompatibilityGrants();

  await writeTextArtifact(
    join("logs", "migration.log"),
    [`exit=${migration.code}`, "--- stdout ---", migration.stdout, "--- stderr ---", migration.stderr].join("\n"),
  );
  await writeJsonArtifact(join("reports", "setup.json"), {
    name: "runtime-safety-setup",
    status: migration.code === 0 ? "passed" : "failed",
    startedAt,
    completedAt: new Date().toISOString(),
    databaseHost: new URL(databaseUrl()).hostname,
    reset,
    compatibility: {
      engine: "PostgreSQL 17 with local Supabase compatibility shims",
      limitations: [
        "auth.uid() and auth.jwt() are local GUC-backed shims, not Supabase GoTrue.",
        "storage.buckets and storage.objects are schema-compatible tables only; object storage and signed URL behavior are not exercised.",
        "RLS policies can be inspected and exercised through PostgreSQL roles, but this is not Supabase Storage runtime evidence.",
      ],
      postMigrationGrants: [
        "GRANT SELECT ON TABLE public.personnel TO authenticated; required for local auth.uid() personnel resolution in RLS tests.",
        "GRANT SELECT on non-assignment_personnel assignment/customer workflow tables to authenticated; local shim only so PostgreSQL can exercise RLS policies after Phase B.",
      ],
    },
    migrationExitCode: migration.code,
    logPath: "artifacts/runtime-safety-harness/logs/migration.log",
  });

  if (migration.code !== 0) process.exitCode = migration.code ?? 1;
}

main().catch(async (error) => {
  await writeTextArtifact(
    join("logs", "setup-error.log"),
    `${error instanceof Error ? error.stack ?? error.message : String(error)}\n`,
  );
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
