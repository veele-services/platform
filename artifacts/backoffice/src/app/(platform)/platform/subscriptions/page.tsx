import { PlatformRouteState } from "@/components/platform/PlatformRouteState";

export const metadata = {
  title: "Subscriptions",
};

export default function PlatformSubscriptionsPage() {
  return (
    <PlatformRouteState
      title="Subscriptions"
      description="Planbeheer en subscription-overzicht worden in de subscriptions-fase gevuld."
      action={{ href: "/platform", label: "Terug naar dashboard" }}
    />
  );
}
