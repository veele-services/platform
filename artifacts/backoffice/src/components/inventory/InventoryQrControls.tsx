"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { RefreshCw } from "lucide-react";
import { rotateInventoryQrToken } from "@/app/actions/inventory-qr";

export function InventoryQrControls({ itemId }: { itemId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  function rotate() {
    setMessage(null);
    startTransition(async () => {
      const result = await rotateInventoryQrToken(itemId);
      setMessage(result.success ? "QR-token vernieuwd. Print het nieuwe label." : result.message);
      if (result.success) router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-2 print:hidden">
      <button
        type="button"
        onClick={() => window.print()}
        className="inline-flex h-10 items-center justify-center rounded-md px-3 text-sm font-medium text-white"
        style={{ backgroundColor: "#0F766E" }}
      >
        Print label
      </button>
      <button
        type="button"
        onClick={rotate}
        disabled={pending}
        className="inline-flex h-10 items-center justify-center gap-2 rounded-md border px-3 text-sm font-medium disabled:opacity-60"
        style={{ borderColor: "#CBD5E1", color: "#334155" }}
      >
        <RefreshCw className="h-4 w-4" />
        Roteer token
      </button>
      {message ? <p className="text-xs" style={{ color: "#64748B" }}>{message}</p> : null}
    </div>
  );
}
