import { KnowledgePage } from "@/components/fieldgrid/knowledge/routes";
export const metadata = { title: "Kennisbankartikel" };
export default async function Page({ params }: { params: Promise<{slug:string}> }) { const {slug}=await params; return <KnowledgePage workspace="staff" slug={slug}/>; }
