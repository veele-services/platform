import Link from "next/link";
import { Check, ChevronRight } from "lucide-react";
import type { ExtraWorkItem } from "@/actions/extra-work";
import { InteractiveStatusProgress } from "./WorkOrderStatusProgress";
import {
  calculateExtraWorkLineTotal,
  calculateMaterialLineTotal,
  formatMoney,
  formatQuantity,
  getTaskCompletionCount,
  parseNumber,
  type AssignmentView,
  type MaterialUsageItem,
} from "./work-order-data";

export function StatusProgress({ assignment }: { assignment: AssignmentView }) {
  return <InteractiveStatusProgress assignment={assignment} />;
}

export function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[42%_1fr] gap-4">
      <dt className="text-[14px] font-semibold leading-tight" style={{ color: "var(--color-secondary)" }}>
        {label}
      </dt>
      <dd className="text-[14px] font-black leading-tight" style={{ color: "var(--color-primary)" }}>
        {value}
      </dd>
    </div>
  );
}

export function CustomerNotes({ description }: { description: string | null }) {
  const lines = description?.split("\n").filter(Boolean) ?? [];

  return (
    <section className="rounded-[18px] bg-white px-5 py-4 shadow-sm" style={{ boxShadow: "0 14px 30px rgba(8,29,58,0.06)" }}>
      <h2 className="text-[15px] font-black" style={{ color: "var(--color-primary)" }}>
        Klantopmerkingen
      </h2>
      <div className="mt-4 space-y-1">
        {lines.length > 0 ? (
          lines.map((line) => (
            <p key={line} className="text-[14px] font-semibold leading-6" style={{ color: "var(--color-primary)" }}>
              {line}
            </p>
          ))
        ) : (
          <p className="text-[14px] leading-6" style={{ color: "var(--color-secondary)" }}>
            Geen klantopmerkingen beschikbaar.
          </p>
        )}
      </div>
    </section>
  );
}

export function CustomerInfoCard({ assignment }: { assignment: AssignmentView }) {
  const companyName = assignment.objectName || assignment.customerName || assignment.title || "Niet bekend";
  const contactName = assignment.contactName || assignment.customerName || "Niet bekend";
  const postalCity = [assignment.objectPostalCode, assignment.objectCity].filter(Boolean).join(" ") || "Niet bekend";
  const phone = assignment.phone || "Niet bekend";
  const address = assignment.objectAddress || "Niet bekend";

  return (
    <section className="rounded-[18px] bg-white px-5 py-5 shadow-sm" style={{ boxShadow: "0 14px 30px rgba(8,29,58,0.06)" }}>
      <dl className="space-y-6">
        <InfoRow label="Bedrijfsnaam" value={companyName} />
        <InfoRow label="Contactpersoon" value={contactName} />
        <InfoRow label="Adres" value={address} />
        <InfoRow label="Postcode / Plaats" value={postalCity} />
        <InfoRow label="Telefoonnummer" value={phone} />
      </dl>
    </section>
  );
}

export function TaskChecklistCard({ assignment }: { assignment: AssignmentView }) {
  const tasks = [...assignment.tasks].sort((a, b) => a.sortOrder - b.sortOrder);
  const completedCount = getTaskCompletionCount(assignment);

  return (
    <section className="rounded-[18px] bg-white px-5 py-4 shadow-sm" style={{ boxShadow: "0 14px 30px rgba(8,29,58,0.06)" }}>
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[19px] font-black leading-tight" style={{ color: "var(--color-primary)" }}>
          Taken / Checklist
        </h2>
        <span className="text-[13px] font-bold" style={{ color: "var(--color-accent)" }}>
          {completedCount} van {tasks.length} afgerond
        </span>
      </div>

      <div className="mt-5 space-y-4">
        {tasks.length > 0 ? tasks.map((task, index) => {
          const isDone = index < completedCount;

          return (
            <div key={task.id} className="flex items-center gap-4">
              <span
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border"
                style={{
                  backgroundColor: isDone ? "var(--color-accent)" : "white",
                  borderColor:     isDone ? "var(--color-accent)" : "#E2E8F0",
                  color:           isDone ? "white" : "transparent",
                }}
              >
                {isDone ? <Check size={18} strokeWidth={2.8} /> : null}
              </span>
              <span className="text-[14px] font-semibold leading-tight" style={{ color: "var(--color-primary)" }}>
                {task.notes ?? "Taak"}
              </span>
            </div>
          );
        }) : (
          <p className="py-2 text-[14px]" style={{ color: "var(--color-secondary)" }}>
            Geen taken gekoppeld.
          </p>
        )}
      </div>
    </section>
  );
}

function ExtraWorkSubline({ item }: { item: ExtraWorkItem }) {
  const hours = parseNumber(item.hours);
  const price = parseNumber(item.price);

  if (hours > 0 && price > 0) {
    return <>{formatQuantity(hours)} uur x {formatMoney(price)}</>;
  }
  if (price > 0) {
    return <>1 x {formatMoney(price)}</>;
  }
  return <>Nog geen kosten</>;
}

export function ExtraWorkSummaryCard({
  assignmentId,
  items,
}: {
  assignmentId: string;
  items:        ExtraWorkItem[];
}) {
  const total = items.reduce((sum, item) => sum + calculateExtraWorkLineTotal(item), 0);

  return (
    <section className="rounded-[18px] bg-white px-5 py-4 shadow-sm" style={{ boxShadow: "0 14px 30px rgba(8,29,58,0.06)" }}>
      <Link href={`/opdrachten/${assignmentId}/meerwerk`} className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-[19px] font-black leading-tight" style={{ color: "var(--color-primary)" }}>
          Meerwerk
        </h2>
        <ChevronRight size={24} strokeWidth={2.35} style={{ color: "var(--color-primary)" }} />
      </Link>

      <div className="space-y-3">
        {items.length > 0 ? items.map((item) => (
          <div key={item.id} className="grid grid-cols-[1fr_auto] gap-3">
            <div className="min-w-0">
              <p className="truncate text-[14px] font-semibold leading-tight" style={{ color: "var(--color-primary)" }}>
                {item.description}
              </p>
              <p className="mt-0.5 text-[13px] font-medium leading-tight" style={{ color: "var(--color-secondary)" }}>
                <ExtraWorkSubline item={item} />
              </p>
            </div>
            <span className="text-[14px] font-black" style={{ color: "var(--color-primary)" }}>
              {formatMoney(calculateExtraWorkLineTotal(item))}
            </span>
          </div>
        )) : (
          <p className="py-1 text-[14px]" style={{ color: "var(--color-secondary)" }}>
            Geen meerwerk geregistreerd.
          </p>
        )}
      </div>

      <div className="mt-4 flex items-center justify-between border-t pt-3" style={{ borderColor: "var(--color-border)" }}>
        <span className="text-[17px] font-black" style={{ color: "var(--color-primary)" }}>
          Totaal meerwerk
        </span>
        <span className="text-[17px] font-black" style={{ color: "var(--color-primary)" }}>
          {formatMoney(total)}
        </span>
      </div>
    </section>
  );
}

export function MaterialSummaryCard({
  assignmentId,
  items,
}: {
  assignmentId: string;
  items:        MaterialUsageItem[];
}) {
  const total = items.reduce((sum, item) => sum + calculateMaterialLineTotal(item), 0);

  return (
    <section className="rounded-[18px] bg-white px-5 py-4 shadow-sm" style={{ boxShadow: "0 14px 30px rgba(8,29,58,0.06)" }}>
      <Link href={`/opdrachten/${assignmentId}/materiaal`} className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-[19px] font-black leading-tight" style={{ color: "var(--color-primary)" }}>
          Materiaal / Verbruik
        </h2>
        <ChevronRight size={24} strokeWidth={2.35} style={{ color: "var(--color-primary)" }} />
      </Link>

      <div className="space-y-3">
        {items.length > 0 ? items.map((item) => (
          <div key={item.id} className="grid grid-cols-[1fr_auto] gap-3">
            <div className="min-w-0">
              <p className="truncate text-[14px] font-semibold leading-tight" style={{ color: "var(--color-primary)" }}>
                {item.name}
              </p>
              <p className="mt-0.5 text-[13px] font-medium leading-tight" style={{ color: "var(--color-secondary)" }}>
                {formatQuantity(item.quantity)} x {formatMoney(item.unitPrice)}
              </p>
            </div>
            <span className="text-[14px] font-black" style={{ color: "var(--color-primary)" }}>
              {formatMoney(calculateMaterialLineTotal(item))}
            </span>
          </div>
        )) : (
          <p className="py-1 text-[14px]" style={{ color: "var(--color-secondary)" }}>
            Geen materiaal geregistreerd.
          </p>
        )}
      </div>

      <div className="mt-4 flex items-center justify-between border-t pt-3" style={{ borderColor: "var(--color-border)" }}>
        <span className="text-[17px] font-black" style={{ color: "var(--color-primary)" }}>
          Totaal materiaal
        </span>
        <span className="text-[17px] font-black" style={{ color: "var(--color-primary)" }}>
          {formatMoney(total)}
        </span>
      </div>
    </section>
  );
}
