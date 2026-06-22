"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Loader2, RefreshCw, Send, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  recalculateAssignmentCapacity,
  sendAssignmentInterestPoll,
} from "@/app/actions/assignments";

interface InterestPollButtonProps {
  assignmentId: string;
  disabled?: boolean;
}

export function InterestPollButton({ assignmentId, disabled }: InterestPollButtonProps) {
  const [pending, startTransition] = useTransition();
  const [action, setAction] = useState<"recalculate" | "top" | "next" | "spoed" | null>(null);

  function handleRecalculate() {
    setAction("recalculate");
    startTransition(async () => {
      const result = await recalculateAssignmentCapacity(assignmentId);
      if (result.success) {
        toast.success(
          `Capaciteit herberekend: ${result.data?.available ?? 0} beschikbaar (${result.data?.status}).`,
        );
      } else {
        toast.error(result.message);
      }
      setAction(null);
    });
  }

  function handlePoll(audienceType: "top_matches" | "next_matches" | "spoedpool") {
    setAction(audienceType === "top_matches" ? "top" : audienceType === "next_matches" ? "next" : "spoed");
    startTransition(async () => {
      const result = await sendAssignmentInterestPoll(assignmentId, { audienceType });
      if (result.success) {
        toast.success(
          `Ronde ${result.data?.roundNumber ?? "-"} verstuurd naar ${result.data?.notified ?? 0} medewerker(s).`,
        );
      } else {
        toast.error(result.message);
      }
      setAction(null);
    });
  }

  return (
    <div className="grid gap-2">
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={handleRecalculate}
        disabled={pending}
        className="w-full"
      >
        {action === "recalculate" ? (
          <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
        ) : (
          <RefreshCw className="mr-2 h-3.5 w-3.5" />
        )}
        Capaciteit herberekenen
      </Button>

      <div className="grid grid-cols-2 gap-2">
        <Button
          type="button"
          size="sm"
          onClick={() => handlePoll("top_matches")}
          disabled={disabled || pending}
        >
          {action === "top" ? (
            <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
          ) : (
            <Send className="mr-2 h-3.5 w-3.5" />
          )}
          Top
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => handlePoll("next_matches")}
          disabled={disabled || pending}
        >
          {action === "next" ? (
            <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
          ) : (
            <Send className="mr-2 h-3.5 w-3.5" />
          )}
          Volgende
        </Button>
      </div>

      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={() => handlePoll("spoedpool")}
        disabled={disabled || pending}
        className="w-full"
      >
        {action === "spoed" ? (
          <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
        ) : (
          <Zap className="mr-2 h-3.5 w-3.5" />
        )}
        Spoedpool uitnodigen
      </Button>
    </div>
  );
}
