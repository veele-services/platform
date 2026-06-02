---
name: drizzle-zod jsonb typed cast
description: drizzle-zod generates Json union type for jsonb columns, causing TS errors when inserting typed objects
---

## Rule
When a Drizzle schema defines a `jsonb` column with a specific TypeScript type (e.g. `contractInfo: jsonb('contract_info').$type<ContractInfo>()`), `createInsertSchema` / `createUpdateSchema` from `drizzle-zod` will infer the column as `Json | undefined` (the broad union `string | number | boolean | { [key: string]: Json } | Json[]`), not as the narrower `ContractInfo` type.

Passing the raw Zod-parsed data directly to `db.insert().values()` or `db.update().set()` then fails with **TS2345/TS2769** because `string` (a member of `Json`) is not assignable to the narrow typed shape.

## How to apply
After Zod parsing, build a separate insert/update object and explicitly cast the typed jsonb field:

```typescript
const insertData = {
  ...parsed.data,
  contractInfo: (parsed.data.contractInfo ?? null) as ContractInfo | null,
};
await db.insert(personnelTable).values(insertData);
```

```typescript
const updateData = {
  ...parsed.data,
  contractInfo: (parsed.data.contractInfo ?? null) as ContractInfo | null,
  updatedAt: new Date(),
};
await db.update(personnelTable).set(updateData).where(...);
```

**Why:** drizzle-zod's schema generator cannot preserve the `.$type<T>()` narrowing in generated Zod schemas — it falls back to the broad `Json` type. The cast is always safe here because the Zod schema already validates the shape before the cast runs.

Apply this pattern to every `.$type<T>()` jsonb column used in inserts or updates.
