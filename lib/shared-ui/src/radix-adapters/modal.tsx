"use client";

import * as AlertDialogPrimitive from "@radix-ui/react-alert-dialog";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import * as React from "react";

import { cn } from "../utils";

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;
export const DialogTitle = DialogPrimitive.Title;
export const DialogDescription = DialogPrimitive.Description;

export const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Portal>
    <DialogPrimitive.Overlay className="fixed inset-0 z-[var(--z-overlay)] bg-slate-950/40 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 motion-reduce:animate-none" />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        "fixed bottom-0 left-1/2 z-[var(--z-modal)] max-h-[90dvh] w-full max-w-lg -translate-x-1/2 overflow-y-auto rounded-t-3xl border border-border bg-background p-5 text-foreground shadow-2xl outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom motion-reduce:animate-none sm:bottom-auto sm:top-1/2 sm:-translate-y-1/2 sm:rounded-2xl sm:data-[state=closed]:zoom-out-95 sm:data-[state=open]:zoom-in-95",
        className,
      )}
      {...props}
    />
  </DialogPrimitive.Portal>
));
DialogContent.displayName = DialogPrimitive.Content.displayName;

export const AlertDialog = AlertDialogPrimitive.Root;
export const AlertDialogTrigger = AlertDialogPrimitive.Trigger;
export const AlertDialogCancel = AlertDialogPrimitive.Cancel;
export const AlertDialogAction = AlertDialogPrimitive.Action;
export const AlertDialogTitle = AlertDialogPrimitive.Title;
export const AlertDialogDescription = AlertDialogPrimitive.Description;

export const AlertDialogContent = React.forwardRef<
  React.ElementRef<typeof AlertDialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Content>
>(({ className, ...props }, ref) => (
  <AlertDialogPrimitive.Portal>
    <AlertDialogPrimitive.Overlay className="fixed inset-0 z-[var(--z-overlay)] bg-slate-950/40 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 motion-reduce:animate-none" />
    <AlertDialogPrimitive.Content
      ref={ref}
      className={cn(
        "fixed bottom-0 left-1/2 z-[var(--z-modal)] w-full max-w-md -translate-x-1/2 rounded-t-3xl border border-border bg-background p-5 text-foreground shadow-2xl outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom motion-reduce:animate-none sm:bottom-auto sm:top-1/2 sm:-translate-y-1/2 sm:rounded-2xl sm:data-[state=closed]:zoom-out-95 sm:data-[state=open]:zoom-in-95",
        className,
      )}
      {...props}
    />
  </AlertDialogPrimitive.Portal>
));
AlertDialogContent.displayName = AlertDialogPrimitive.Content.displayName;
