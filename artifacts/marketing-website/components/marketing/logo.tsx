import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/utils";

type LogoProps = {
  className?: string;
  priority?: boolean;
  variant?: "inverse" | "primary";
};

export function Logo({ className, priority = false, variant = "inverse" }: LogoProps) {
  return (
    <Link
      href="/"
      aria-label="Veele Services — naar de homepage"
      className={cn("inline-flex min-h-11 items-center", className)}
    >
      <Image
        src={`/brand/veele-logo-${variant}.svg`}
        alt=""
        aria-hidden="true"
        width={300}
        height={70}
        priority={priority}
        className="h-auto w-[8.75rem] sm:w-[9.75rem]"
      />
    </Link>
  );
}
