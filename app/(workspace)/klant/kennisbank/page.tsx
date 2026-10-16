import { KnowledgePage } from "@/components/fieldgrid/knowledge/routes";
export const metadata = { title: "Kennisbank" };
export default async function Page({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}) { return <KnowledgePage workspace="customer" account={(await searchParams).account}/>; }
