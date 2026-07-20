import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "group/button inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl border border-transparent text-sm font-bold transition-[color,background-color,border-color,box-shadow,transform] duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--aqua)] focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 motion-reduce:transform-none",
  {
    variants: {
      variant: {
        default: "bg-[var(--aqua)] text-brand-navy shadow-[0_14px_36px_rgba(41,211,194,.22)] hover:-translate-y-0.5 hover:bg-[var(--aqua-bright)] hover:shadow-[0_18px_42px_rgba(41,211,194,.3)]",
        secondary: "bg-white text-brand-navy shadow-[var(--shadow-sm)] hover:-translate-y-0.5 hover:bg-slate-50",
        outline: "border-white/30 bg-white/[.06] text-white backdrop-blur-md hover:border-white/50 hover:bg-white/[.12]",
        dark: "bg-[var(--navy-900)] text-white shadow-[0_12px_30px_rgba(3,20,38,.16)] hover:-translate-y-0.5 hover:bg-[var(--navy-800)]",
        ghost: "text-current hover:bg-black/[.055]"
      },
      size: { default: "h-12 px-5", sm: "h-10 px-4 text-[13px]", lg: "h-14 px-7 text-[15px]", icon: "size-11" }
    },
    defaultVariants: { variant: "default", size: "default" }
  }
);

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}
export function Button({ className, variant, size, asChild = false, ...props }: ButtonProps) {
  const Comp = asChild ? Slot : "button";
  return <Comp className={cn(buttonVariants({ variant, size, className }))} {...props} />;
}
export { buttonVariants };
