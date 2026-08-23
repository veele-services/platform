import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Home } from "lucide-react";
import { Button } from "@/components/ui/button";
import { siteContent } from "@/lib/site";

export const metadata: Metadata = {
  title: "Pagina niet gevonden | Veele Services",
  description: "De opgevraagde pagina bestaat niet of is verplaatst.",
  robots: { index: false, follow: false },
};

export default function NotFound() {
  const notFoundContent = siteContent.sitewide["404"];

  return (
    <section className="flex min-h-[80vh] items-center bg-[var(--navy-950)] pt-20 text-white">
      <div className="container-shell py-24">
        <p className="eyebrow text-brand-aqua">Fout 404</p>
        <h1 className="mt-4 max-w-3xl text-5xl font-semibold leading-[1.08] tracking-[-.035em] sm:text-6xl">
          {notFoundContent.h1}
        </h1>
        <p className="mt-5 max-w-xl text-lg leading-8 text-white/65">{notFoundContent.body}</p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Button asChild size="lg">
            <Link href="/">
              <Home className="size-4" aria-hidden="true" />
              {notFoundContent.buttons[0]}
            </Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link href="/diensten">
              {notFoundContent.buttons[1]}
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          </Button>
        </div>
      </div>
    </section>
  );
}
