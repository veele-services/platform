import { markCurrentPlatformUserSeen } from "@/app/actions/platform";
import { requirePlatformSupportUser } from "@/lib/auth/platform";

export default async function PlatformLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  await requirePlatformSupportUser();
  await markCurrentPlatformUserSeen();

  return children;
}
