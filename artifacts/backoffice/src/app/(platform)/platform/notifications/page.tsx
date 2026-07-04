import { PlatformRouteState } from "@/components/platform/PlatformRouteState";

export const metadata = {
  title: "Meldingen",
};

export default function PlatformNotificationsPage() {
  return (
    <PlatformRouteState
      title="Meldingen"
      description="Platformmeldingen en tenantcommunicatie worden in de meldingenfase gevuld."
      action={{ href: "/platform", label: "Terug naar dashboard" }}
    />
  );
}
