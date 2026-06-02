"use client";

import { useEffect, useRef } from "react";
import { setAssignmentStatus } from "@/actions/assignments";

type Props = {
  assignmentId: string;
  currentStatus: string;
};

export function SeenMarker({ assignmentId, currentStatus }: Props) {
  const called = useRef(false);

  useEffect(() => {
    if (called.current) return;
    if (currentStatus !== "scheduled") return;
    called.current = true;
    setAssignmentStatus(assignmentId, "seen").catch(() => {});
  }, [assignmentId, currentStatus]);

  return null;
}
