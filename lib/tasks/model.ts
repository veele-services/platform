export type TaskCategory = { id: string; name: string; prefix: string; next_number: number; active: boolean; version: number };
export type CatalogueTask = { id: string; categoryId: string | null; code: string; name: string; description: string | null; discipline: string; active: boolean; version: number; revisionId: string | null; duration: number | null; priceCents?: number | null; vatBasisPoints?: number | null; extraWork: boolean; requiresPhoto: boolean | null; requiresSignature: boolean | null };
export type TaskCatalogueData = { finance: boolean; categories: TaskCategory[]; tasks: CatalogueTask[] };
export type TaskCatalogueWorkspace={
 workOrders:Array<{id:string;status:string;work_order_number:string}>;
 tasks:Array<{id:string;code:string;name:string}>;
 taskRevisions:Array<{id:string;task_id:string;valid_until:string|null}>;
 extraWorkRules:Array<{id:string;task_revision_id:string}>;
};
