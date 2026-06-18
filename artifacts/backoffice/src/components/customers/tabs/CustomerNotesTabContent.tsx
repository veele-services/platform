import { CustomerNotesPanel } from "@/components/customers/CustomerNotesPanel";
import type { CustomerNoteRow } from "@/app/actions/customers";

interface Props {
  customerId: string;
  notes:      CustomerNoteRow[];
  canWrite:   boolean;
}

export function CustomerNotesTabContent({ customerId, notes, canWrite }: Props) {
  if (!canWrite) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <p className="text-sm" style={{ color: "#94A3B8" }}>Je hebt geen toegang tot interne notities.</p>
      </div>
    );
  }

  return (
    <CustomerNotesPanel customerId={customerId} initialNotes={notes} />
  );
}
