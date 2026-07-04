import { PlatformRouteState } from "@/components/platform/PlatformRouteState";

export const metadata = {
  title: "Platforminstellingen",
};

export default function PlatformSettingsPage() {
  return (
    <PlatformRouteState
      title="Instellingen"
      description="Platformhosts, support TTL, domeinregels, mailinstellingen en smoke targets worden in de instellingenfase gevuld."
      action={{ href: "/platform", label: "Terug naar dashboard" }}
    />
  );
}
