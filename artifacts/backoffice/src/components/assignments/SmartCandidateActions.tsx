"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { CalendarPlus, Loader2, Star, UserCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  assignPersonnel,
  markInterestCandidate,
} from "@/app/actions/assignments";

type Props = {
  assignmentId: string;
  personnelId: string;
  disabled?: boolean;
};

export function SmartCandidateActions({
  assignmentId,
  personnelId,
  disabled,
}: Props) {
  const [pending, startTransition] = useTransition();

  function run(action: "selected" | "reserve" | "assign") {
    startTransition(async () => {
      const result =
        action === "assign"
          ? await assignPersonnel(assignmentId, personnelId)
          : await markInterestCandidate(assignmentId, personnelId, action);

      if (!result.success) {
        toast.error(String(result.message ?? "Actie mislukt."));
        return;
      }

      if (action === "assign" && "warning" in result && result.warning) {
        toast.warning(String(result.warning));
      } else {
        toast.success(
          action === "reserve"
            ? "Medewerker als reserve gemarkeerd."
            : action === "selected"
              ? "Medewerker geselecteerd."
              : "Medewerker definitief ingepland.",
        );
      }
    });
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={() => run("selected")}
        disabled={disabled || pending}
        className="h-7 px-2 text-[11px]"
      >
        {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : <UserCheck className="h-3 w-3" />}
        Selecteer
      </Button>
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={() => run("reserve")}
        disabled={disabled || pending}
        className="h-7 px-2 text-[11px]"
      >
        <Star className="h-3 w-3" />
        Reserve
      </Button>
      <Button
        type="button"
        size="sm"
        onClick={() => run("assign")}
        disabled={disabled || pending}
        className="h-7 px-2 text-[11px]"
      >
        <CalendarPlus className="h-3 w-3" />
        Plan
      </Button>
    </div>
  );
}
