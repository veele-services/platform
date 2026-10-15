import { KnowledgePage } from "@/components/fieldgrid/knowledge/routes";
export const metadata = { title: "Kennisbankartikel" };
export default async function Page({params,searchParams}:{params:Promise<{slug:string}>;searchParams:Promise<Record<string,string|string[]|undefined>>}) { const [{slug},query]=await Promise.all([params,searchParams]); return <KnowledgePage workspace="customer" slug={slug} account={query.account}/>; }
