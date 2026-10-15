import { ProductPage } from "@/components/fieldgrid/product/routes";
export const metadata = { title: "Roadmap & updates" };
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return <ProductPage workspace="backoffice" searchParams={searchParams} />;
}
