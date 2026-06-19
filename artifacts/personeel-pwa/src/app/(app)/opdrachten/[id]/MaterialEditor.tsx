"use client";

import { Boxes, Lock } from "lucide-react";
import {
  calculateMaterialLineTotal,
  formatMoney,
  formatQuantity,
  type MaterialUsageItem,
} from "./work-order-data";

type Props = {
  initialItems: MaterialUsageItem[];
};

export function MaterialEditor({ initialItems }: Props) {
  const total = initialItems.reduce((sum, item) => sum + calculateMaterialLineTotal(item), 0);

  return (
    <section className="space-y-4 px-4 pb-28 pt-5">
      <div className="rounded-[18px] bg-white px-5 py-4 shadow-sm" style={{ boxShadow: "0 14px 30px rgba(8,29,58,0.06)" }}>
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-[19px] font-black leading-tight" style={{ color: "var(--color-primary)" }}>
            Materiaal / Verbruik
          </h2>
          <span className="text-[17px] font-black" style={{ color: "var(--color-primary)" }}>
            {formatMoney(total)}
          </span>
        </div>

        <div className="mt-4 space-y-3">
          {initialItems.length > 0 ? initialItems.map((item) => (
            <div key={item.id} className="grid grid-cols-[1fr_auto] items-center gap-3">
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
            <div className="rounded-[18px] border border-dashed px-4 py-5 text-center" style={{ borderColor: "var(--color-border)" }}>
              <Boxes size={28} className="mx-auto mb-2" style={{ color: "var(--color-muted-fg)" }} />
              <p className="text-[14px] font-black" style={{ color: "var(--color-primary)" }}>
                Geen materiaal geregistreerd
              </p>
              <p className="mx-auto mt-1 max-w-[280px] text-[13px] leading-5" style={{ color: "var(--color-secondary)" }}>
                Materiaalregistratie wordt getoond zodra er een echte tenant-catalogus en opslag voor materialen is gekoppeld.
              </p>
            </div>
          )}
        </div>
      </div>

      <div className="rounded-[18px] border bg-white px-5 py-4 shadow-sm" style={{ borderColor: "var(--color-border)" }}>
        <div className="flex items-start gap-3">
          <span
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl"
            style={{ backgroundColor: "rgba(8,29,58,0.06)", color: "var(--color-primary)" }}
          >
            <Lock size={18} strokeWidth={2.4} />
          </span>
          <div>
            <h3 className="text-[15px] font-black" style={{ color: "var(--color-primary)" }}>
              Materiaal toevoegen nog niet actief
            </h3>
            <p className="mt-1 text-[13px] leading-5" style={{ color: "var(--color-secondary)" }}>
              Deze pagina toont geen lokale voorbeelditems meer. Zodra materialen als echte workflowdata beschikbaar zijn, kan dit formulier daarop worden aangesloten.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
