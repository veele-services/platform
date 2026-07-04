import { PlatformRouteState } from "@/components/platform/PlatformRouteState";

export const metadata = {
  title: "Tickets",
};

export default function PlatformTicketsPage() {
  return (
    <PlatformRouteState
      title="Tickets"
      description="Platformtickets voor support, incidenten, onboarding, billing en domeinen worden in de ticketfase gevuld."
      action={{ href: "/platform", label: "Terug naar dashboard" }}
    />
  );
}
