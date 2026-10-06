"use client";

import type { ComponentProps } from "react";
import { DialogContent } from "@/components/ui/dialog";
import { useStaffDialogFocus } from "@/lib/staff/use-dialog-focus";

export function StaffDialogContent(props: ComponentProps<typeof DialogContent>) {
  const focus = useStaffDialogFocus();
  return <DialogContent {...props} aria-modal="true" {...focus}/>;
}
