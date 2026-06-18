import { ShieldX } from "lucide-react";
import Link from "next/link";

/**
 * Rendered by any Server Component page when the current user lacks the
 * required permission.  Never silently degrade — always show an explicit
 * access-denied response.
 */
export function ForbiddenPage({
  resource,
  action,
}: {
  resource: string;
  action: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-5 p-8">
      <div
        className="flex items-center justify-center rounded-full"
        style={{ width: "56px", height: "56px", backgroundColor: "#FEF2F2" }}
      >
        <ShieldX
          style={{ width: "24px", height: "24px", color: "#EF4444" }}
          strokeWidth={1.75}
        />
      </div>

      <div className="text-center">
        <h2
          className="font-heading text-xl font-semibold mb-2"
          style={{ color: "#081D3A" }}
        >
          Toegang geweigerd
        </h2>
        <p
          className="text-sm max-w-xs"
          style={{ color: "#64748B", lineHeight: "1.5" }}
        >
          U heeft geen toestemming om deze pagina te bekijken.{" "}
          <span style={{ color: "#94A3B8", fontSize: "12px" }}>
            ({resource}:{action})
          </span>
        </p>
      </div>

      <Link
        href="/"
        className="text-sm font-medium transition-colors"
        style={{ color: "#00B7B3" }}
      >
        ← Terug naar dashboard
      </Link>
    </div>
  );
}
