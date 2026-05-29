# Veele Services Platform

An operational SaaS platform that replaces WhatsApp, Excel, manual planning, manual work orders, and fragmented administration for service businesses.

---

## BEFORE STARTING ANY TASK — READ THE SKILLSET FIRST

Before implementing anything, always read and apply the following skills in order:

1. `.local/skills/veele-dev/SKILL.md` — coding principles, stack, sprint plan, security rules
2. `.local/skills/veele-design/SKILL.md` — color system, typography, layout, component rules
3. `.local/skills/veele-deployment/SKILL.md` — deployment model, branch rules, definition of done

Every task must comply with all three skills. No exceptions.

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

_Populate as you build — short repo map plus pointers to the source-of-truth file for DB schema, API contracts, theme files, etc._

## Architecture decisions

_Populate as you build — non-obvious choices a reader couldn't infer from the code (3-5 bullets)._

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

## Development Skill

See `.local/skills/veele-dev/SKILL.md` for full coding rules, security rules, UI style, and sprint plan.

## Design Skill

See `.local/skills/veele-design/SKILL.md` for the full design system (colors, typography, layout, components, PWA rules).

## Gotchas

- Assignments are the central entity — never model around shifts first
- Planning eligibility is complex (availability + leave + sick + role + certs + knowledge + region + conflicts)
- Dynamic RBAC — permissions are configurable, not hard-coded
- Personnel names and internal notes are hidden from customers (enforced via RLS)

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
- Canon is defined above — all product decisions must align with it
- Development rules in `.local/skills/veele-dev/SKILL.md`
