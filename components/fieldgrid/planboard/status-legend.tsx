"use client";

import { useEffect, useRef, useState } from "react";
import { Info } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { assignmentStatuses, assignmentStatusStyle } from "@/lib/planning/assignment-status";

export function StatusLegend() {
  const [open, setOpen] = useState(false);
  const closing = useRef<ReturnType<typeof setTimeout> | null>(null);
  const keepOpen = () => { if (closing.current) clearTimeout(closing.current); };
  const closeLater = () => { keepOpen(); closing.current = setTimeout(() => setOpen(false), 160); };
  useEffect(() => () => { if (closing.current) clearTimeout(closing.current); }, []);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" className="pb-legend-trigger" aria-label="Legenda statuskleuren" onPointerEnter={event => { if (event.pointerType === "mouse") { keepOpen(); setOpen(true); } }} onPointerLeave={event => { if (event.pointerType === "mouse") closeLater(); }}>
          <Info size={16} aria-hidden="true" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="pb-status-legend" align="start" sideOffset={8} collisionPadding={16} aria-label="Legenda statuskleuren" onPointerEnter={keepOpen} onPointerLeave={closeLater} onOpenAutoFocus={event => event.preventDefault()}>
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
