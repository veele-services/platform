"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { sendAssignmentInterestPoll } from "@/app/actions/assignments";

interface InterestPollButtonProps {
  assignmentId: string;
  disabled?: boolean;
}

export function InterestPollButton({ assignmentId, disabled }: InterestPollButtonProps) {
  const [pending, startTransition] = useTransition();

  function handleClick() {
    startTransition(async () => {
      const result = await sendAssignmentInterestPoll(assignmentId);
      if (result.success) {
        toast.success(
          `${result.data?.notified ?? 0} medewerker(s) genotificeerd voor interessepeiling.`,
        );
      } else {
        toast.error(result.message);
      }
    });
  }

  return (
    <Button
      type="button"
      size="sm"
      onClick={handleClick}
      disabled={disabled || pending}
      className="w-full"
    >
      {pending ? (
        <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
      ) : (
        <Send className="mr-2 h-3.5 w-3.5" />
      )}
      Interessepeiling sturen
    </Button>
  );
}
