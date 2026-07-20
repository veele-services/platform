"use client";
import * as React from "react";
import * as AccordionPrimitive from "@radix-ui/react-accordion";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
export const Accordion = AccordionPrimitive.Root;
export function AccordionItem({ className, ...props }: React.ComponentProps<typeof AccordionPrimitive.Item>) { return <AccordionPrimitive.Item className={cn("border-b border-[var(--line)] first:border-t", className)} {...props} />; }
export function AccordionTrigger({ className, children, ...props }: React.ComponentProps<typeof AccordionPrimitive.Trigger>) { return <AccordionPrimitive.Header><AccordionPrimitive.Trigger className={cn("group flex w-full items-center justify-between gap-5 py-5 text-left text-base font-bold text-brand-navy transition-colors hover:text-brand-aqua-deep focus-visible:rounded-md sm:py-6", className)} {...props}>{children}<span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[var(--aqua-soft)] text-brand-aqua-deep"><ChevronDown aria-hidden="true" className="size-4 transition-transform duration-200 group-data-[state=open]:rotate-180" /></span></AccordionPrimitive.Trigger></AccordionPrimitive.Header>; }
export function AccordionContent({ className, children, ...props }: React.ComponentProps<typeof AccordionPrimitive.Content>) { return <AccordionPrimitive.Content className="overflow-hidden text-sm text-brand-slate data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down" {...props}><div className={cn("max-w-2xl pb-6 pr-10 leading-7", className)}>{children}</div></AccordionPrimitive.Content>; }
