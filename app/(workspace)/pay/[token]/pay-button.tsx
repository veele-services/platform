"use client";

import { useState } from "react";
import { CreditCard } from "lucide-react";

export function PayButton({ token }: { token: string }) {
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);
  return <><button className="primary-button full" disabled={pending} onClick={async () => { setPending(true); setError(undefined); const response = await fetch("/api/payments/create", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }) }); const data = await response.json() as { checkoutUrl?: string; error?: string }; if (data.checkoutUrl) window.location.assign(data.checkoutUrl); else { setError(data.error ?? "Betaling kon niet worden gestart"); setPending(false); } }}><CreditCard size={18}/>{pending ? "Veilige betaling openen…" : "Betalen met Mollie"}</button>{error && <p className="auth-message error" role="alert">{error}</p>}</>;
}
