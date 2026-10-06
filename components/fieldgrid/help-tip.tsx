"use client";
import { useTenantTheme } from "./tenant-theme";
import { useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Info } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

/** Contextual help also works with touch and keyboard input. */
export function HelpTip({ children, label = "Extra informatie" }: { children: ReactNode; label?: string }) {
  const theme = useTenantTheme();
  const trigger = useRef<HTMLButtonElement>(null);
  const [container, setContainer] = useState<HTMLElement | null>(null);
  const [open,setOpen] = useState(false);
  const handleEscape = (event:KeyboardEvent<HTMLElement>) => {
    if (open && event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
    }
  };
  return <Popover open={open} onOpenChange={next => { if(next) setContainer(trigger.current?.closest("dialog") ?? null); setOpen(next); }}><PopoverTrigger asChild><button ref={trigger} type="button" className="help-tip-trigger" aria-label={label} onKeyDown={handleEscape}><Info size={15}/></button></PopoverTrigger><PopoverContent portalContainer={container} className="help-tip-content" style={theme} align="start" sideOffset={8} role="note" onKeyDown={handleEscape} onEscapeKeyDown={event => { event.preventDefault(); event.stopPropagation(); setOpen(false); }}>{children}</PopoverContent></Popover>;
}
