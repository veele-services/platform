"use client";

import { useState } from "react";
import { acceptQuote } from "./actions";

export function QuoteForm({ token }: { token: string }) {
  const [result, setResult] = useState<{ ok: boolean; error?: string }>();
  if (result?.ok) return <p className="auth-message success">Bedankt. Het akkoord is veilig vastgelegd.</p>;
  return <form className="auth-form" action={async (form) => setResult(await acceptQuote(form))}><input type="hidden" name="token" value={token}/><label><span>Naam akkoordgever</span><span className="auth-input"><input name="name" required minLength={2}/></span></label><label className="check-line"><input type="checkbox" name="accepted" required/> Ik geef akkoord op deze offerte.</label>{result && !result.ok && <p className="auth-message error">{result.error}</p>}<button className="primary-button full">Akkoord bevestigen</button></form>;
}
