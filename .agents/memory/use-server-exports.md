---
name: use-server runtime export rule
description: Next.js "use server" files cannot export runtime values (arrays, objects, constants) — only async functions and type aliases.
---

## Rule

A `"use server"` file may only export:
- `async function` declarations
- `export type { ... }` (erased at compile time, always safe)

Exporting a runtime value (array, object, plain const) causes:
> A "use server" file can only export async functions, found object.

This breaks `next build` even though `tsc --noEmit` passes cleanly — TypeScript does not enforce this constraint, Next.js does at bundle time.

**Why:** The error surfaces during page data collection (SSR), not compilation. TypeScript strips type annotations but doesn't know about Next.js's server-action contract.

## Pattern — client-safe types directory

Place all constants and types that client components need in `src/types/<domain>.ts`. These files must have **no imports from `@workspace/db`** or any Node.js-native package (pg, fs, net, dns, tls), or webpack will pull those into the client bundle with a different set of errors.

```
src/types/assignments.ts    — ASSIGNMENT_STATUSES, ASSIGNMENT_PRIORITIES,
                              ASSIGNMENT_STATUS_TRANSITIONS, AssignmentStatus,
                              AssignmentPriority  (self-contained, no imports)
src/types/availability.ts   — LEAVE_TYPES, LeaveType  (self-contained)
src/types/documents.ts      — DOCUMENT_ENTITY_TYPES, DocumentEntityType (self-contained)
```

## How to apply

When adding a new constant to a `"use server"` action file that a client component needs:
1. Define it in `src/types/<domain>.ts` (copy the definition, no imports from db/pg).
2. In the action file, import it from `@workspace/db` for server use — do NOT re-export it.
3. Client components import constants from `@/types/<domain>`, async actions from `@/app/actions/<domain>`.

Server-only action files (`reports.ts`, `invoices.ts`, `quotes.ts`) may import freely from `@workspace/db` — they are never in a client import chain.
