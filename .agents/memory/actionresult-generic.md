---
name: ActionResult generic pattern
description: How to use the ActionResult<T> type for server actions that return data vs those that don't.
---

## Rule
`ActionResult<T = undefined>` is defined in `artifacts/backoffice/src/app/actions/customers.ts`.

- Actions that return an id → `Promise<ActionResult<{ id: string }>>`
- Actions that return nothing → `Promise<ActionResult>` (T defaults to undefined)

## Access pattern in client components
After `if (!result.success) return`, to access `.data.id`:
```typescript
const id = mode === "create"
  ? ((result as { success: true; data?: { id: string } }).data?.id ?? "")
  : (existingId ?? "");
```

**Why:** TypeScript cannot narrow `result.data` through union of `ActionResult<{id:string}>` and `ActionResult` because it intersects the `data` fields and produces `never` in the truthy branch. The explicit cast to the success variant resolves this.

**How to apply:** Whenever a client component calls either a returning or non-returning action in the same expression (e.g., mode toggle), cast the result to the success branch to access `.data`.
