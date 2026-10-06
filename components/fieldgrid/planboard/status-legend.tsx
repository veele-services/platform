import { ChevronDown, Info } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { assignmentStatuses, assignmentStatusStyle } from "@/lib/planning/assignment-status";

export function StatusLegend() {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" className="pb-legend-trigger" aria-label="Legenda statuskleuren">
          <Info size={16} aria-hidden="true" />
          <span>Legenda</span>
          <ChevronDown size={14} aria-hidden="true" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="pb-status-legend" align="start" sideOffset={8} collisionPadding={16} aria-label="Legenda statuskleuren">
        <h2>Status per medewerker</h2>
        <p>Iedere medewerker heeft een eigen voortgang op dezelfde werkbon.</p>
        <ul>
          {assignmentStatuses.map((status) => (
            <li key={status.status}>
              <span className="pb-legend-swatch" style={assignmentStatusStyle(status)} data-status={status.status} aria-hidden="true" />
              <div><strong>{status.label}</strong><p>{status.description}</p></div>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
