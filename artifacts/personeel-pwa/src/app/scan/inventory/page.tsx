export const dynamic = "force-dynamic";

import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, Keyboard, QrCode } from "lucide-react";
import { resolveInventoryScanCode } from "@/actions/inventory-scan";

type Props = {
  searchParams: Promise<{ code?: string; error?: string }>;
};

function loginRedirect(path: string): never {
  redirect(`/login?next=${encodeURIComponent(path)}`);
}

export default async function InventoryManualScanPage({ searchParams }: Props) {
  const query = await searchParams;
  const code = typeof query.code === "string" ? query.code.trim() : "";
  let message: string | null = query.error ? decodeURIComponent(query.error) : null;

  if (code) {
    const result = await resolveInventoryScanCode(code);
    if (result.status === "login_required") loginRedirect(`/scan/inventory?code=${encodeURIComponent(code)}`);
    if (result.status === "allowed") redirect(`/scan/inventory/${encodeURIComponent(result.qrToken)}`);
    message = result.message;
  }

  return (
    <main className="min-h-screen bg-[#F4F6FA] px-4 py-8">
      <div className="mx-auto max-w-md space-y-4">
        <Link href="/" className="inline-flex items-center gap-2 text-sm font-black" style={{ color: "var(--color-primary)" }}>
          <ArrowLeft size={18} />
          Terug
        </Link>

        <section className="rounded-[24px] bg-white p-6 shadow-sm" style={{ boxShadow: "0 18px 40px rgba(8,29,58,0.08)" }}>
          <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-[#E8F2FF] text-[#2563A9]">
            <QrCode size={26} />
          </div>
          <h1 className="text-2xl font-black leading-tight" style={{ color: "var(--color-primary)" }}>
            Inventaris scannen
          </h1>
          <p className="mt-2 text-sm leading-6" style={{ color: "var(--color-secondary)" }}>
            Scan het QR-label met de camera of vul de inventariscode handmatig in. Details worden pas getoond na login en autorisatie.
          </p>

          <form method="get" className="mt-6 space-y-3">
            <label className="block text-sm font-black" style={{ color: "var(--color-primary)" }}>
              Inventariscode
              <div className="relative mt-2">
                <input
                  name="code"
                  defaultValue={code}
                  placeholder="I000001"
                  autoCapitalize="characters"
                  autoComplete="off"
                  className="h-12 w-full rounded-xl border px-4 pr-12 text-base font-black uppercase outline-none"
                  style={{ borderColor: "var(--color-border)", color: "var(--color-primary)" }}
                />
                <Keyboard className="absolute right-4 top-1/2 h-5 w-5 -translate-y-1/2" style={{ color: "var(--color-muted-fg)" }} />
              </div>
            </label>
            {message ? (
              <p className="rounded-xl bg-[#FEF2F2] px-4 py-3 text-sm font-semibold text-[#B91C1C]">
                {message}
              </p>
            ) : null}
            <button type="submit" className="h-12 w-full rounded-xl px-4 text-base font-black text-white" style={{ backgroundColor: "var(--color-accent)" }}>
              Code zoeken
            </button>
          </form>
        </section>
      </div>
    </main>
  );
}
