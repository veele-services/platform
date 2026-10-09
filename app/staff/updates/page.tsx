import { ProductPage } from "@/components/fieldgrid/product/routes";
export const metadata = { title: "Wat is er nieuw?" };
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return <ProductPage workspace="staff" searchParams={searchParams} />;
}
