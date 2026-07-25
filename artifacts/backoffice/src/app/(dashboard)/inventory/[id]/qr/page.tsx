import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { ArrowLeft, QrCode } from "lucide-react";
import { ForbiddenPage } from "@/components/layout/ForbiddenPage";
import { InventoryQrControls } from "@/components/inventory/InventoryQrControls";
import { hasPermission } from "@/lib/auth/permissions";
import { getInventoryQrLabel } from "@/app/actions/inventory-qr";
import {
  buildInventoryScanUrl,
  renderInventoryQrSvg,
} from "@/lib/inventory-qr";

interface Props {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  try {
    const canRead = await hasPermission("inventory", "view");
    if (!canRead) return { title: "Toegang geweigerd" };
    const { id } = await params;
    const item = await getInventoryQrLabel(id);
    return { title: item ? `QR-label ${item.code}` : "Inventaris QR-label" };
  } catch {
    return { title: "Inventaris QR-label" };
  }
}

async function requestOrigin(): Promise<string | null> {
  const headerList = await headers();
  const host = headerList.get("x-forwarded-host") ?? headerList.get("host");
  if (!host) return null;
  const proto = headerList.get("x-forwarded-proto") ?? "https";
  return `${proto}://${host}`;
}

export default async function InventoryQrLabelPage({ params }: Props) {
  const [canRead, canRotate] = await Promise.all([
    hasPermission("inventory", "view"),
    hasPermission("inventory", "generate_qr").then(
      async (allowed) =>
        allowed ||
        (await hasPermission("inventory", "update")) ||
        (await hasPermission("inventory", "manage")),
    ),
  ]);

  if (!canRead) return <ForbiddenPage resource="inventory" action="view" />;

  const { id } = await params;
  const item = await getInventoryQrLabel(id);
  if (!item) notFound();

  const scanUrl = buildInventoryScanUrl(item.qrToken, await requestOrigin());
  const qrSvg = renderInventoryQrSvg(scanUrl, `Inventaris ${item.code}`);

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-[1100px] min-w-0 flex-col gap-6 bg-white p-4 sm:p-8 print:max-w-none print:p-0">
      <div className="flex flex-wrap items-center justify-between gap-4 print:hidden">
        <Link
          href={`/inventory/${item.id}`}
          className="inline-flex items-center gap-1 text-sm hover:underline"
          style={{ color: "#64748B" }}
        >
          <ArrowLeft className="h-4 w-4" />
          Terug naar inventarisitem
        </Link>
        {canRotate ? <InventoryQrControls itemId={item.id} /> : null}
      </div>

      <section
        className="grid min-w-0 gap-8 rounded-lg border p-4 sm:p-8 print:border-0 print:p-0 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]"
        style={{ borderColor: "#CBD5E1" }}
      >
        <div className="flex min-w-0 flex-col items-center gap-5">
          <div
            className="flex aspect-square h-auto w-full max-w-[360px] items-center justify-center rounded-md border bg-white p-4 [&_svg]:h-full [&_svg]:w-full"
            style={{ borderColor: "#CBD5E1" }}
            dangerouslySetInnerHTML={{ __html: qrSvg }}
          />
          <div
            className="flex items-center gap-2 rounded bg-slate-100 px-3 py-2 font-mono text-sm"
            style={{ color: "#334155" }}
          >
            <QrCode className="h-4 w-4" />
            {item.code}
          </div>
        </div>

        <div className="flex min-w-0 flex-col justify-center gap-5">
          <div>
            <p
              className="text-xs font-semibold uppercase tracking-wider"
              style={{ color: "#64748B" }}
            >
              Inventarislabel
            </p>
            <h1
              className="mt-2 font-heading text-3xl font-bold"
              style={{ color: "#081D3A" }}
            >
              {item.name}
            </h1>
            <p className="mt-1 text-sm" style={{ color: "#64748B" }}>
              Scan opent veilig de personeels-PWA. Zonder login of rechten
              worden geen itemdetails getoond.
            </p>
          </div>

          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div className="rounded-md bg-slate-50 p-3">
              <dt
                className="text-xs font-semibold uppercase"
                style={{ color: "#64748B" }}
              >
                Code
              </dt>
              <dd
                className="mt-1 font-mono font-semibold"
                style={{ color: "#081D3A" }}
              >
                {item.code}
              </dd>
            </div>
            <div className="rounded-md bg-slate-50 p-3">
              <dt
                className="text-xs font-semibold uppercase"
                style={{ color: "#64748B" }}
              >
                Status
              </dt>
              <dd className="mt-1 font-semibold" style={{ color: "#081D3A" }}>
                {item.status}
              </dd>
            </div>
            <div className="rounded-md bg-slate-50 p-3 sm:col-span-2">
              <dt
                className="text-xs font-semibold uppercase"
                style={{ color: "#64748B" }}
              >
                Scanroute
              </dt>
              <dd
                className="mt-1 break-all font-mono text-xs"
                style={{ color: "#334155" }}
              >
                {scanUrl}
              </dd>
            </div>
            <div className="rounded-md bg-slate-50 p-3 sm:col-span-2">
              <dt
                className="text-xs font-semibold uppercase"
                style={{ color: "#64748B" }}
              >
                Token
              </dt>
              <dd className="mt-1 text-sm" style={{ color: "#334155" }}>
                Opaque QR-token, niet gelijk aan database-id. Laatste generatie:{" "}
                {item.qrGeneratedAt
                  ? new Date(item.qrGeneratedAt).toLocaleString("nl-NL")
                  : "onbekend"}
                .
              </dd>
            </div>
          </dl>
        </div>
      </section>
    </div>
  );
}
