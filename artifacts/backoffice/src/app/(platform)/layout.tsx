import { requireAnyPlatformRole } from "@/lib/auth/platform";

export const dynamic = "force-dynamic";

const PLATFORM_ADMIN_ROLES = ["super_admin", "support", "billing_admin"] as const;

export default async function PlatformLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireAnyPlatformRole(PLATFORM_ADMIN_ROLES);

  return children;
}
