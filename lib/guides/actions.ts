"use server";

import { createClient } from "@/lib/supabase/server";
import { isGuideKey, type GuideKey } from "./catalogue";

/** Preference belongs to auth.uid(), never to a client-supplied account id. */
export async function loadAccountGuides(): Promise<GuideKey[] | null> {
  try {
    const db = await createClient();
    const { data, error } = await db.rpc("account_guide_state");
    if (error || !Array.isArray(data) || data.some(key => typeof key !== "string" || !isGuideKey(key))) return null;
    return data as GuideKey[];
  } catch { return null; }
}

export async function dismissAccountGuide(key: string) {
  if (!isGuideKey(key)) return { ok: false as const, error: "Deze uitleg is niet beschikbaar." };
  try {
    const db = await createClient();
    const { error } = await db.rpc("dismiss_account_guide", { guide_key: key });
    if (!error) return { ok: true as const };
  } catch { /* Keep the explanation visible until the account receipt exists. */ }
  return { ok: false as const, error: "De leesbevestiging is niet opgeslagen. Probeer het kruisje opnieuw." };
}
