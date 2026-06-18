export const dynamic = "force-dynamic";

import { MapPin } from "lucide-react";
import { getMyObjects } from "@/actions/objects";

export default async function ObjectenPage() {
  const objects = await getMyObjects();

  return (
    <div className="space-y-4 p-4 md:p-0">
      <h1 className="text-xl md:text-2xl font-bold" style={{ color: "var(--color-primary)" }}>
        Mijn objecten
      </h1>

      {objects.length === 0 ? (
        <div className="rounded-2xl bg-white p-8 text-center shadow-sm">
          <MapPin size={32} className="mx-auto mb-3" style={{ color: "var(--color-muted-fg)" }} />
          <p className="text-sm font-medium" style={{ color: "var(--color-primary)" }}>
            Geen objecten gevonden
          </p>
          <p className="mt-1 text-xs" style={{ color: "var(--color-secondary)" }}>
            Neem contact op met uw beheerder om objecten toe te voegen.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {objects.map((obj) => (
            <div key={obj.id} className="rounded-2xl bg-white p-4 shadow-sm">
              <div className="flex items-start gap-3">
                <div
                  className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
                  style={{ backgroundColor: "rgba(0,183,179,0.1)" }}
                >
                  <MapPin size={16} style={{ color: "var(--color-accent)" }} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold" style={{ color: "var(--color-primary)" }}>
                    {obj.name}
                  </p>
                  {(obj.address || obj.city) && (
                    <p className="mt-1 text-sm" style={{ color: "var(--color-secondary)" }}>
                      {[obj.address, obj.postalCode, obj.city].filter(Boolean).join(" ")}
                    </p>
                  )}
                  {obj.description && (
                    <p className="mt-2 text-xs" style={{ color: "var(--color-muted-fg)" }}>
                      {obj.description}
                    </p>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
