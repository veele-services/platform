import { redirect } from "next/navigation";

type Props = {
  params: Promise<{ token: string }>;
};

export default async function InventoryShortQrAliasPage({ params }: Props) {
  const { token } = await params;
  redirect(`/scan/inventory/${encodeURIComponent(token)}`);
}
