"use client";

import { useEffect, useRef } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { trackUxAnalytics } from "@/lib/ux-analytics";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const errorRef = useRef<HTMLElement>(null);

  useEffect(() => {
    errorRef.current?.focus();
    console.error("[backoffice] Pagina kon niet laden.", error);
    trackUxAnalytics({
      name: "mutation_error",
      surface: "navigation",
      category: "server",
    });
  }, [error]);

  return (
    <main
      ref={errorRef}
      role="alert"
      aria-live="assertive"
      tabIndex={-1}
      className="flex min-h-[60dvh] items-center justify-center bg-background px-4 py-10 outline-none"
    >
      <Empty className="w-full max-w-lg border border-dashed border-border bg-card">
        <EmptyHeader>
          <EmptyMedia variant="icon" className="text-amber-700">
            <AlertTriangle aria-hidden="true" />
          </EmptyMedia>
          <EmptyTitle>Deze pagina kon niet laden</EmptyTitle>
          <EmptyDescription>
            Uw gegevens zijn niet aangepast. Probeer de pagina opnieuw te laden
            of ga terug naar het dashboard.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button type="button" onClick={reset}>
            Opnieuw proberen
          </Button>
        </EmptyContent>
      </Empty>
    </main>
  );
}
