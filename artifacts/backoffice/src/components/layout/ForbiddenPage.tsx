import Link from "next/link";
import { ShieldX } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";

/**
 * Rendered when the authenticated user lacks the required permission.
 * Resource and action remain function inputs for fail-closed call-site clarity,
 * but implementation identifiers are intentionally not exposed in the UI.
 */
export function ForbiddenPage({
  resource: _resource,
  action: _action,
}: {
  resource: string;
  action: string;
}) {
  return (
    <Empty className="min-h-[60dvh] border-0">
      <EmptyHeader>
        <EmptyMedia variant="icon" className="text-red-700">
          <ShieldX aria-hidden="true" />
        </EmptyMedia>
        <EmptyTitle>Geen toegang tot deze pagina</EmptyTitle>
        <EmptyDescription>
          Uw rol heeft geen toestemming voor dit onderdeel. Vraag een beheerder
          om uw rol te controleren als u hier wel moet kunnen werken.
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button asChild variant="outline">
          <Link href="/">Terug naar het dashboard</Link>
        </Button>
      </EmptyContent>
    </Empty>
  );
}
