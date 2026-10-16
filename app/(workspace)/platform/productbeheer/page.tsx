import { ProductPage } from "@/components/fieldgrid/product/routes";
export const metadata = { title: "Productbeheer" };
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return <ProductPage workspace="platform" searchParams={searchParams} />;
}
