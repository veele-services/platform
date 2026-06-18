"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, X } from "lucide-react";

export function PaidBanner() {
  const router = useRouter();
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    router.refresh();
  }, [router]);

  if (!visible) return null;

  return (
    <div
      className="flex items-start gap-3 rounded-2xl px-4 py-3 shadow-sm"
      style={{ backgroundColor: "#DCFCE7" }}
      role="status"
    >
      <CheckCircle2
        size={18}
        className="mt-0.5 shrink-0"
        style={{ color: "#16A34A" }}
      />
      <p className="flex-1 text-sm font-medium" style={{ color: "#166534" }}>
        Betaling ontvangen — uw factuuroverzicht wordt bijgewerkt
      </p>
      <button
        onClick={() => setVisible(false)}
        aria-label="Sluit melding"
        className="shrink-0 rounded p-0.5"
        style={{ color: "#166534" }}
      >
        <X size={16} />
      </button>
    </div>
  );
}
