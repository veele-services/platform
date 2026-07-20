import Link from "next/link";
import { cn } from "@/lib/utils";

export function Logo({ className }: { className?: string }) {
  return (
    <Link
      href="/"
      aria-label="Veele Services — naar de homepage"
      className={cn("group inline-flex min-h-11 items-center text-white", className)}
    >
      <span className="relative flex size-10 items-center justify-center overflow-hidden rounded-xl border border-white/15 bg-white/[.07] shadow-[inset_0_1px_0_rgba(255,255,255,.12)]">
        <span className="absolute -bottom-5 -right-4 size-10 rotate-45 bg-[var(--aqua)]/20" />
        <span className="relative text-[27px] font-black leading-none tracking-[-.12em] text-brand-aqua">v</span>
      </span>
      <span className="ml-2.5 flex flex-col leading-none">
        <span className="text-[25px] font-extrabold tracking-[-.07em]">eele</span>
        <span className="ml-0.5 mt-1 text-[7px] font-bold uppercase tracking-[.42em] text-white/60">services</span>
      </span>
    </Link>
  );
}
