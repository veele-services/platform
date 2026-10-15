import { getPlatformTeam,getPlatformAccount } from "@/lib/platform/team";
import { SupportTeam } from "./support-team";
import { getAuthContext } from "@/lib/auth/context";
import { notFound } from "next/navigation";
export const metadata = { title: "Supportteam" };
export default async function Page() {
  if (!(await getAuthContext()).isPlatformAdmin) notFound();
  const[initial,account]=await Promise.all([getPlatformTeam(),getPlatformAccount()]);
  return <SupportTeam initial={initial} account={account}/>;
}
