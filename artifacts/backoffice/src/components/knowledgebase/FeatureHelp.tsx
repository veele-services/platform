"use client";

import Link from "next/link";
import { BookOpen, HelpCircle } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

type FeatureHelpRelatedArticle = {
  title: string;
  href?: string;
};

type FeatureHelpProps = {
  title: string;
  description: string;
  articleHref?: string | null;
  articleLabel?: string;
  relatedArticles?: FeatureHelpRelatedArticle[];
  placement?: "top" | "right" | "bottom" | "left";
  className?: string;
  showRelatedArticles?: boolean;
};

export function FeatureHelp({
  title,
  description,
  articleHref,
  articleLabel = "Lees volledige uitleg",
  relatedArticles = [],
  placement = "top",
  className,
  showRelatedArticles = true,
}: FeatureHelpProps) {
  return (
    <TooltipProvider delayDuration={180}>
      <Popover>
        <Tooltip>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>
              <button
                type="button"
                aria-label={`Help: ${title}`}
                className={cn(
                  "inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 shadow-sm transition hover:border-cyan-200 hover:bg-cyan-50 hover:text-cyan-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 focus-visible:ring-offset-2",
                  className,
                )}
              >
                <HelpCircle className="h-4 w-4" />
              </button>
            </PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent side={placement} className="max-w-xs leading-5">
            {description}
          </TooltipContent>
        </Tooltip>
        <PopoverContent align="end" side="bottom" className="w-[min(360px,calc(100vw-2rem))] p-0">
          <div className="border-b border-slate-200 p-4">
            <p className="text-sm font-semibold text-slate-950">{title}</p>
            <p className="mt-2 text-sm leading-6 text-slate-600">{description}</p>
          </div>
          <div className="grid gap-3 p-4">
            {articleHref && (
              <Link
                href={articleHref}
                className="inline-flex items-center gap-2 rounded-md border border-slate-200 px-3 py-2 text-sm font-medium text-slate-800 transition hover:bg-slate-50"
              >
                <BookOpen className="h-4 w-4 text-cyan-700" />
                {articleLabel}
              </Link>
            )}
            {showRelatedArticles && relatedArticles.length > 0 && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">Gerelateerd</p>
                <div className="mt-2 grid gap-1">
                  {relatedArticles.map((article) =>
                    article.href ? (
                      <Link key={`${article.title}-${article.href}`} href={article.href} className="text-sm text-cyan-700 hover:underline">
                        {article.title}
                      </Link>
                    ) : (
                      <span key={article.title} className="text-sm text-slate-600">
                        {article.title}
                      </span>
                    ),
                  )}
                </div>
              </div>
            )}
          </div>
        </PopoverContent>
      </Popover>
    </TooltipProvider>
  );
}
