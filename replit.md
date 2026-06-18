# Veele Services Platform

An operational SaaS platform that replaces WhatsApp, Excel, manual planning, manual work orders, and fragmented administration for service businesses.

---

## Before Starting Any Task

Use this file as the current source of truth for product canon, architecture,
security rules, UI direction, and deployment expectations. Older local skill
files under `.local/skills/` are not part of the repository at the moment; if
they are restored later, they should extend this document rather than replace it.

---

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- **Framework**: Next.js App Router
- **Language**: TypeScript
- **Styling**: Tailwind CSS + shadcn/ui
- **Auth**: Supabase Auth
- **Database**: Supabase PostgreSQL + Drizzle ORM
- **Storage**: Supabase Storage
- **Security**: Supabase RLS
- **App type**: PWA
- **Payments**: Mollie
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)
- pnpm workspaces, Node.js 24, TypeScript 5.9

## Where things live

| Artifact | Path | Purpose |
|---|---|---|
| Backoffice | `artifacts/backoffice/` | Management UI — Next.js 15 App Router, port 22138, preview `/` |
| API Server | `artifacts/api-server/` | Express 5 REST API, port 8080, path `/api` |
| API Spec | `lib/api-spec/openapi.yaml` | OpenAPI source of truth — run codegen after changes |
| DB Schema | `lib/db/src/schema/` | Drizzle ORM schema files |
| API Zod | `lib/api-zod/src/generated/api.ts` | Generated Zod validation schemas (server-side) |
| API Client | `lib/api-client-react/src/generated/api.ts` | Generated React Query hooks (client-side) |
| Design tokens | `artifacts/backoffice/src/app/globals.css` | Tailwind v4 `@theme {}` block — all Veele CSS tokens |
| shadcn/ui components | `artifacts/backoffice/src/components/ui/` | Radix-based UI primitives |
| Custom layout | `artifacts/backoffice/src/components/layout/` | Sidebar with nav, header |

## Architecture decisions

- **Next.js instead of Vite/SPA** — App Router enables per-route `metadata`, RSC for data-heavy pages, and a clean server/client boundary. Matches the `replit.md` stack requirement.
- **Tailwind v4 CSS-first config** — All design tokens live in `@theme {}` in `globals.css` instead of `tailwind.config.ts`. This is the v4 canonical approach; no `tailwind.config.*` file exists.
- **Dev binds to `0.0.0.0`, production to `127.0.0.1`** — Replit's preview proxy needs `0.0.0.0` in dev; VPS NGINX reverse-proxy only needs loopback in production. Flags are in `package.json` scripts.
- **shadcn/ui components kept minimal** — Only components with all dependencies installed are included. Components requiring `recharts`, `embla-carousel-react`, etc. are added on demand per sprint, not pre-installed.
- **PORT from env only** — No fallback port in Next.js scripts. The workflow always sets `PORT=22138` via `artifact.toml [services.env]`. Local dev without the workflow should use the workflow path.

---

## Canon — Veele Services Platform

### Product Type

Operational SaaS Platform

### Primary Goal

Replace WhatsApp, Excel, manual planning, manual work orders and fragmented administration.

### Core Model

```
Customer
→ Sector
→ Object
→ Assignment
→ Tasks
→ Personnel
→ Reporting
→ Invoicing
```

**Assignments are the central entity.**

- Never design the system around shifts first.
- Assignments generate planning.
- Assignments generate reporting.
- Assignments generate invoicing.

---

### Application Structure

#### Management Backoffice (Desktop-first)

Modules: Dashboard, Customers, Objects, Assignments, Planning, Personnel, Reports, Invoices, Payments, Settings

#### Personnel PWA (Mobile-first)

Modules: Dashboard, My Assignments, Open Assignments, Availability, Leave, Hours, Reports, Documents, Payslips

#### Customer PWA (Mobile-first)

Modules: Dashboard, Objects, New Assignment, Assignments, Quotes, Reports, Invoices, Payments, Documents

---

### Roles (Dynamic RBAC)

Base roles: Management, Administration, Planning, Teamlead, Employee, Flex Employee, Customer, Support

Permissions must be configurable.

---

### Assignment Lifecycle

```
Requested → Review → Quote Preparation → Awaiting Approval → Approved
→ Plannable → Scheduled → Seen → In Progress
→ Not Completed | Completed → Report Submitted → Report Approved
→ Invoice Ready → Invoiced → Paid → Closed
```

---

### Planning Rules

Only show employees that:
- Are available
- Not on leave
- Not sick
- Have required role
- Have required certificates
- Have required knowledge
- Match region
- Have no conflicts

---

### Task Codes

Task codes are centrally managed. Fields: Code, Name, Sector, Description, Price, Duration, Required certificates, Required diploma, Required knowledge, Required role, Photo required, Report required, Invoiceable.

---

### Future Modules (Phase 3+ — NOT MVP)

AI, NFC, QR, GPS, WhatsApp Business API, Accounting Integrations, PDF Generation

---

## Product

Three-surface platform:
1. **Management Backoffice** — desktop-first admin for managing the full service operation
2. **Personnel PWA** — mobile-first app for field workers
3. **Customer PWA** — mobile-first portal for clients

---

## User preferences

- Production-ready code only — no placeholders, no mocks
- Minimal-diff changes — never redesign unrelated modules
- Dynamic configuration over hardcoded values
- RLS-first security — never bypass unless explicitly required
- All sensitive actions must be logged

## Development Rules

Development rules, security rules, UI direction, and sprint priorities are kept
in this document until optional local skill files are restored.

## Gotchas

- Assignments are the central entity — never model around shifts first
- Planning eligibility is complex (availability + leave + sick + role + certs + knowledge + region + conflicts)
- Dynamic RBAC — permissions are configurable, not hard-coded
- Personnel names and internal notes are hidden from customers (enforced via RLS)

## Pointers

- Canon is defined above — all product decisions must align with it
- Workspace structure, TypeScript setup, and package details are defined by
  `pnpm-workspace.yaml`, root `package.json`, and the package-level configs.
