type KnowledgebaseContentRendererProps = {
  html?: string | null;
  mediaBasePath?: string;
  className?: string;
};

const DEFAULT_EMPTY_HTML = "<p>Geen inhoud beschikbaar.</p>";

function normalizeMediaBasePath(mediaBasePath?: string): string | null {
  if (!mediaBasePath) return null;
  return mediaBasePath.replace(/\/+$/, "");
}

function rewriteKnowledgebaseMediaUrls(html: string, mediaBasePath?: string): string {
  const basePath = normalizeMediaBasePath(mediaBasePath);
  if (!basePath) return html;

  return html.replace(
    /\b(src|href)=["']\/(?:platform\/knowledgebase|platform\/releases|help|releases)\/media\/([a-f0-9-]+)["']/gi,
    (_match, attribute: string, mediaId: string) => `${attribute}="${basePath}/${mediaId}"`,
  );
}

export function KnowledgebaseContentRenderer({
  html,
  mediaBasePath,
  className = "",
}: KnowledgebaseContentRendererProps) {
  const safeHtml = rewriteKnowledgebaseMediaUrls(html?.trim() || DEFAULT_EMPTY_HTML, mediaBasePath);
  const classes = [
    "max-w-none text-sm leading-7 text-slate-700",
    "[&_a]:font-semibold [&_a]:text-cyan-700 [&_a]:underline",
    "[&_h2]:mb-2 [&_h2]:mt-6 [&_h2]:text-xl [&_h2]:font-black [&_h2]:text-slate-950",
    "[&_h3]:mb-2 [&_h3]:mt-5 [&_h3]:font-black [&_h3]:text-slate-950",
    "[&_li]:my-1 [&_ol]:ml-5 [&_ol]:list-decimal [&_p]:my-3 [&_ul]:ml-5 [&_ul]:list-disc",
    "[&_table]:my-5 [&_table]:w-full [&_table]:border-collapse [&_table]:text-left",
    "[&_td]:border [&_td]:border-slate-200 [&_td]:p-3 [&_td]:align-top",
    "[&_th]:border [&_th]:border-slate-200 [&_th]:bg-slate-50 [&_th]:p-3 [&_th]:align-top [&_th]:font-black [&_th]:text-slate-950",
    "[&_figure]:my-5 [&_figcaption]:mt-2 [&_figcaption]:text-xs [&_figcaption]:text-slate-500",
    "[&_img]:max-h-[520px] [&_img]:w-auto [&_img]:max-w-full [&_img]:rounded-xl [&_img]:border [&_img]:border-slate-200",
    "[&_video]:max-h-[520px] [&_video]:w-full [&_video]:rounded-xl [&_video]:border [&_video]:border-slate-200",
    "[&_iframe]:aspect-video [&_iframe]:w-full [&_iframe]:rounded-xl [&_iframe]:border [&_iframe]:border-slate-200",
    "[&_[data-type='callout']]:my-4 [&_[data-type='callout']]:rounded-xl [&_[data-type='callout']]:border [&_[data-type='callout']]:p-4",
    "[&_[data-type='callout'][data-tone='tip']]:border-emerald-200 [&_[data-type='callout'][data-tone='tip']]:bg-emerald-50",
    "[&_[data-type='callout'][data-tone='warning']]:border-amber-200 [&_[data-type='callout'][data-tone='warning']]:bg-amber-50",
    "[&_[data-type='callout'][data-tone='example']]:border-cyan-200 [&_[data-type='callout'][data-tone='example']]:bg-cyan-50",
    className,
  ].join(" ");

  return <div className={classes} dangerouslySetInnerHTML={{ __html: safeHtml }} />;
}
