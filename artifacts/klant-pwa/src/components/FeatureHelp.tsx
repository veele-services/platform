"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { BookOpen, HelpCircle, X } from "lucide-react";
import type { KnowledgebaseFeatureHelp } from "@workspace/db";

type FeatureHelpProps = {
  help: KnowledgebaseFeatureHelp;
  className?: string;
};

export function FeatureHelp({ help, className = "" }: FeatureHelpProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }

    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  return (
    <span ref={containerRef} className={`group relative inline-flex ${className}`}>
      <button
        type="button"
        aria-label={`Help: ${help.title}`}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 shadow-sm transition hover:border-cyan-200 hover:bg-cyan-50 hover:text-cyan-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500"
      >
        <HelpCircle className="h-4 w-4" />
      </button>
      <span className="pointer-events-none absolute right-0 top-10 z-30 hidden w-64 rounded-lg bg-slate-950 px-3 py-2 text-xs leading-5 text-white shadow-lg md:group-hover:block">
        {help.description}
      </span>
      {open && (
        <div className="absolute right-0 top-10 z-40 w-[min(340px,calc(100vw-2rem))] rounded-xl border border-slate-200 bg-white text-left shadow-2xl">
          <div className="flex items-start justify-between gap-3 border-b border-slate-100 p-4">
            <div>
              <p className="text-sm font-semibold text-slate-950">{help.title}</p>
              <p className="mt-2 text-sm leading-6 text-slate-600">{help.description}</p>
            </div>
            <button
              type="button"
              aria-label="Help sluiten"
              onClick={() => setOpen(false)}
              className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="grid gap-3 p-4">
            {help.articleHref && (
              <Link
                href={help.articleHref}
                onClick={() => setOpen(false)}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-800"
              >
                <BookOpen className="h-4 w-4 text-cyan-700" />
                {help.articleLabel}
              </Link>
            )}
            {help.showRelatedArticles && help.relatedArticles.length > 0 && (
              <div className="grid gap-1">
                <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">Gerelateerd</p>
                {help.relatedArticles.map((article) =>
                  article.href ? (
                    <Link
                      key={`${article.title}-${article.href}`}
                      href={article.href}
                      onClick={() => setOpen(false)}
                      className="text-sm text-cyan-700"
                    >
                      {article.title}
                    </Link>
                  ) : (
                    <span key={article.title} className="text-sm text-slate-600">{article.title}</span>
                  ),
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </span>
  );
}
