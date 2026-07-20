"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { setAssignmentStatus } from "@/actions/assignments";

type Props = {
  assignmentId: string;
  currentStatus: string;
  expectedParticipantVersion: number | null;
};

export function SeenMarker({ assignmentId, currentStatus, expectedParticipantVersion }: Props) {
  const router = useRouter();
  const called = useRef(false);

  useEffect(() => {
    if (called.current) return;
    if (currentStatus !== "scheduled") return;
    called.current = true;
    void setAssignmentStatus(assignmentId, "seen", { expectedParticipantVersion })
      .finally(() => router.refresh());
  }, [assignmentId, currentStatus, expectedParticipantVersion, router]);

  return null;
}
