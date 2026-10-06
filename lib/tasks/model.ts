export type TaskCategory = { id: string; name: string; prefix: string; next_number: number; active: boolean; version: number };
export type CatalogueTask = { id: string; categoryId: string | null; code: string; name: string; description: string | null; discipline: string; active: boolean; version: number; revisionId: string; duration: number; priceCents?: number; vatBasisPoints?: number; extraWork: boolean; requiresPhoto: boolean; requiresSignature: boolean };
export type TaskCatalogueData = { finance: boolean; categories: TaskCategory[]; tasks: CatalogueTask[] };
