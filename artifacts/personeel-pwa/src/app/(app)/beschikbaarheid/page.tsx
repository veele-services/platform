import {
  getMyAvailabilityWindows,
} from "@/actions/availability";
import { BeschikbaarheidForm } from "./BeschikbaarheidForm";

export default async function BeschikbaarheidPage() {
  const windows = await getMyAvailabilityWindows();

  return (
    <div className="space-y-4 p-4">
      <h1 className="text-xl font-bold" style={{ color: "var(--color-primary)" }}>
        Mijn beschikbaarheid
      </h1>
      <p className="text-sm" style={{ color: "var(--color-secondary)" }}>
        Stel per dag in wanneer je beschikbaar bent. Gebruik dit voor de komende week.
      </p>
      <BeschikbaarheidForm initialWindows={windows} />
    </div>
  );
}
