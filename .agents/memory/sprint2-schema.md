---
name: Sprint 2 assignments schema
description: DB schema decisions for the Assignments module built in Sprint 2.
---

## Tables added
- `assignments` — central entity; FK to customers (cascade) and objects (set null); status/priority as varchar; scheduled_date as YYYY-MM-DD varchar (timezone-safe); scheduled_start/end as HH:MM varchar.
- `assignment_personnel` — junction; unique on (assignment_id, personnel_id).
- `assignment_tasks` — junction linking task codes to an assignment; integer sort_order.

## Schema location
- `lib/db/src/schema/assignments.ts` — exports tables, Zod schemas, ASSIGNMENT_STATUSES, ASSIGNMENT_PRIORITIES, ASSIGNMENT_STATUS_TRANSITIONS.
- `migrations/003_sprint2_assignments.sql` — run in Supabase SQL Editor.

## Status lifecycle
17 statuses: requested → review → quote_preparation → awaiting_approval → approved → plannable → scheduled → seen → in_progress → not_completed|completed → report_submitted → report_approved → invoice_ready → invoiced → paid → closed.

ASSIGNMENT_STATUS_TRANSITIONS is exported from the schema and used both server-side (to validate transitions in setAssignmentStatus) and client-side (to render allowed next-status options).

## Planning view
Week view uses YYYY-MM-DD of Monday as URL param `?week=`. Calculates Mon–Sun range, fetches assignments by scheduledDate range, groups by date client-side in PlanningView.tsx.

## Dashboard counts
getDashboardCounts() uses a single SQL FILTER aggregation query for 4 counts (requested, plannable, in_progress, completed today). Dashboard wraps it in try/catch to gracefully degrade before migration is run.
